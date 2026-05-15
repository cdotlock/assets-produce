import { randomUUID } from "crypto"
import * as fs from "fs"
import * as path from "path"
import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import * as OSS from "../../oss/oss"
import { formatToolError } from "./fc-client"
import DESCRIPTION from "./oss-put.txt"

const TOOL_ID = "oss-put"
const DEFAULT_PREFIX = "assets"
// Upper bound on the local file we will read into memory before uploading.
// 512 MiB comfortably covers image / short-video / audio assets while turning a
// runaway path (e.g. /dev/zero) into a clean folded error instead of an OOM.
// Idiom-consistent with generate-sfx-elevenlabs.ts's MIN_AUDIO_BYTES floor.
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

// content_type → key extension. ali-oss infers the HTTP content-type from the
// object key's file extension; when the local file has no extension we use
// this map so OSS still serves a correct content-type.
const CONTENT_TYPE_EXT: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "application/json": ".json",
}

export const Parameters = Schema.Struct({
  local_path: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local filesystem path to the file to upload.",
  }),
  oss_prefix: Schema.optional(Schema.String).annotate({
    description:
      'Optional key prefix/folder under the bucket (e.g. "assets/cg"). Default "assets". Leading/trailing slashes are trimmed.',
  }),
  content_type: Schema.optional(Schema.String).annotate({
    description:
      "Optional MIME type hint. Advisory: OSS infers content-type from the object key's file extension; when given, it selects the key extension if the local file has none.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Return the resolved upload plan without calling OSS. Testing only — never set in production.",
  }),
})

// OSS uploader. Injectable so tests don't touch ali-oss. The default runs the
// Phase 2 OSS Effect service as a self-contained promise (same pattern as
// cli/cmd/oss.ts `runWithOSS` and generate-sfx-elevenlabs `defaultUploader`)
// — keeps this tool's Effect requirement channel `never` (no OSS.Service in
// its requirement set).
export type OssPutUploader = (key: string, body: Buffer) => Promise<string>

export interface MakeOssPutToolOpts {
  uploader?: OssPutUploader
  // Override the upload size cap (bytes). Lets tests exercise the limit
  // without materializing a multi-hundred-MiB temp file.
  maxUploadBytes?: number
}

const defaultUploader: OssPutUploader = (key, body) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const oss = yield* OSS.Service
      const { url } = yield* oss.put(key, body)
      return url
    }).pipe(Effect.provide(OSS.defaultLayer)) as Effect.Effect<string, unknown, never>,
  )

interface ChosenExtension {
  ext: string
  // True only when the `content_type` hint actually determined the key
  // extension (local file had none AND the hint mapped to a known ext). When
  // false, OSS infers content-type purely from the file's own extension, so
  // echoing the caller's `content_type` would over-promise — see metadata gate.
  fromContentType: boolean
}

function chooseExtension(resolved: string, contentType: string | undefined): ChosenExtension {
  // Prefer the local file's own extension; fall back to a content_type hint.
  const ext = path.extname(resolved)
  if (ext) return { ext, fromContentType: false }
  if (contentType) {
    const mapped = CONTENT_TYPE_EXT[contentType.toLowerCase()]
    if (mapped) return { ext: mapped, fromContentType: true }
  }
  return { ext: "", fromContentType: false }
}

export function makeOssPutTool(opts: MakeOssPutToolOpts = {}) {
  const uploader = opts.uploader ?? defaultUploader
  const maxUploadBytes = opts.maxUploadBytes ?? MAX_UPLOAD_BYTES

  return Tool.define<typeof Parameters, Record<string, unknown>, never>(
    TOOL_ID,
    Effect.gen(function* () {
      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
          // The whole pipeline below may fail (path rejection OR OSSError);
          // the `Effect.catch` at the bottom folds that into a uniform
          // `metadata.error: true` result so the channel matches Tool.define's
          // `never` (tool.ts does Effect.orDie at the wrap boundary).
          Effect.gen(function* () {
            const prefix = (params.oss_prefix?.replace(/^\/+|\/+$/g, "") || DEFAULT_PREFIX)

            // Security-sensitive file-read boundary. There is no configured
            // asset-root in this codebase, and sibling tools
            // (cg-render / upscale-image) accept absolute local paths produced
            // by prior tools in the SAME run — so a fixed directory allowlist
            // would break the intended cg-render → oss-put chaining. Instead
            // we constrain to: absolute path, exists, regular file, non-empty.
            // All rejections are folded into the result (never thrown).
            if (!path.isAbsolute(params.local_path)) {
              return yield* Effect.fail(
                new Error(`${TOOL_ID}: local_path must be an absolute path, got "${params.local_path}"`),
              )
            }
            const resolved = path.resolve(params.local_path)

            const stat = yield* Effect.tryPromise({
              try: () => fs.promises.stat(resolved),
              catch: () => new Error(`${TOOL_ID}: local_path does not exist: ${resolved}`),
            })
            if (!stat.isFile()) {
              return yield* Effect.fail(new Error(`${TOOL_ID}: local_path is not a regular file: ${resolved}`))
            }
            if (stat.size === 0) {
              return yield* Effect.fail(new Error(`${TOOL_ID}: local_path is empty (0 bytes): ${resolved}`))
            }
            // Reject oversize BEFORE reading the file into memory.
            if (stat.size > maxUploadBytes) {
              return yield* Effect.fail(
                new Error(
                  `${TOOL_ID}: local_path is ${stat.size} bytes, exceeds the ${maxUploadBytes}-byte upload limit: ${resolved}`,
                ),
              )
            }

            const chosen = chooseExtension(resolved, params.content_type)
            const key = `${prefix}/${randomUUID()}${chosen.ext}`

            if (params.dryRun) {
              return {
                title: `dry-run ${TOOL_ID}`,
                output: JSON.stringify({ tool: TOOL_ID, key, dryRun: true }, null, 2),
                // `truncated: false` short-circuits tool.ts's post-execute
                // truncate path (every asset tool carries it — see
                // upscale-image / generate-sfx-elevenlabs).
                metadata: { truncated: false, dryRun: true, key },
              }
            }

            const buffer = yield* Effect.tryPromise({
              try: () => fs.promises.readFile(resolved),
              catch: (e) => new Error(`${TOOL_ID}: failed to read local_path — ${formatToolError(e)}`),
            })

            const ossUrl = yield* Effect.tryPromise({
              try: () => uploader(key, buffer),
              catch: (e) => new Error(`${TOOL_ID}: OSS upload failed — ${formatToolError(e)}`),
            })

            return {
              title: TOOL_ID,
              output: ossUrl,
              metadata: {
                truncated: false,
                ossUrl,
                key,
                // Only advertise content_type when the hint actually drove
                // the key extension. If the local file had its own extension,
                // OSS infers type from that and the caller's content_type was
                // ignored — echoing it would advertise a type the served
                // object will not have, which an LLM could wrongly chain on.
                ...(chosen.fromContentType ? { content_type: params.content_type } : {}),
                local_path: resolved,
              },
            }
          }).pipe(
            Effect.catch((err) =>
              Effect.succeed({
                title: `${TOOL_ID} failed`,
                output: `${TOOL_ID} error: ${formatToolError(err)}`,
                metadata: {
                  truncated: false,
                  error: true,
                  message: formatToolError(err),
                },
              }),
            ),
          ),
      }
    }),
  )
}

export const OssPutTool = makeOssPutTool()
