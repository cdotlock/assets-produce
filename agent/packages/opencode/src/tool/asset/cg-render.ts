import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./cg-render.txt"

const TOOL_ID = "cg-render"
const DEFAULT_MODEL = "gemini-3.1-flash-image-preview"
const HttpsUrl = Schema.String.check(Schema.isPattern(/^https:\/\/.+/i)).annotate({
  description: "https URL",
})

// Tight identifier pattern — kills `..` / `/` injection from untrusted
// callers. The final path is `<assetsRoot>/<slug>/cg/<cgName>.webp`, so
// anything outside [A-Za-z0-9_-] could escape `assetsRoot`. Python side
// belt-and-braces validates this too (see render.py:_assert_inside).
const SafeIdent = Schema.String
  .check(Schema.isMinLength(1))
  .check(Schema.isMaxLength(128))
  .check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/))

export const Parameters = Schema.Struct({
  slug: SafeIdent.annotate({
    description:
      "Book / project slug — used to namespace the output directory. Must match /^[A-Za-z0-9][A-Za-z0-9_-]*$/ (no slashes, no dots — those would escape assetsRoot).",
  }),
  cgName: SafeIdent.annotate({
    description:
      "Unique cg identifier within the slug, e.g. `ep03_sylvia_glyph`. Must match /^[A-Za-z0-9][A-Za-z0-9_-]*$/.",
  }),
  prompt: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Render prompt — already in the form render-with-style expects.",
  }),
  panelCount: Schema.optional(Schema.Number).annotate({
    description: "Panels per CG (1-4 typical). Defaults to 1.",
  }),
  referenceImageUrls: Schema.Array(HttpsUrl)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(8))
    .annotate({
      description:
        "Ordered list of reference image OSS URLs. Position 0 should be the style anchor; later positions are character / scene anchors. 1-8 items.",
    }),
  model: Schema.optional(Schema.String).annotate({
    description: `Model id (default "${DEFAULT_MODEL}").`,
  }),
  assetsRoot: Schema.optional(Schema.String).annotate({
    description:
      "Directory the script writes the image into. Final path: <assetsRoot>/<slug>/cg/<cgName>.webp.",
  }),
  overwrite: Schema.optional(Schema.Boolean).annotate({
    description: "Overwrite existing output files. Default false.",
  }),
  mock: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run the Python script in mock mode (skips ZENMUX / SSH / OSS, writes a 1×1 placeholder). Use in tests + before creds are loaded.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description:
      "Print the resolved Python invocation without running it. Testing only — never set in production.",
  }),
})

// Validated shape of the Python script's stdout. Phase 8 review M1
// flagged that we previously used a bare `parsed as {...}` cast, which
// silently accepted malformed values (e.g. `outputs: [{path: null}]`).
// Schema.decodeUnknownEffect enforces the contract at the wrapper
// boundary so the agent loop never sees garbage.
const CgRenderResult = Schema.Struct({
  outputs: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      kind: Schema.String,
    }),
  ).check(Schema.isMinLength(1)),
  meta: Schema.optional(
    Schema.Struct({
      model: Schema.optional(Schema.String),
      latency_ms: Schema.optional(Schema.Number),
      atomic_tool: Schema.optional(Schema.String),
      mock: Schema.optional(Schema.Boolean),
    }),
  ),
})

// Factory so tests can swap in a fake runner without hitting Bun.spawn.
// Production wiring uses `CgRenderTool` directly (default runner =
// `runPython` from python-runner.ts).
export interface MakeCgRenderToolOpts {
  runner?: PythonRunner
  /** Absolute path to `tools/cg-render/render.py`. Defaults to repo-relative. */
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "cg-render", "render.py")

export function makeCgRenderTool(opts: MakeCgRenderToolOpts = {}) {
  const runner = opts.runner ?? runPython
  const scriptPath = opts.scriptPath ?? DEFAULT_SCRIPT

  return Tool.define<typeof Parameters, Record<string, unknown>, never>(
    TOOL_ID,
    Effect.gen(function* () {
      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
          // The whole pipeline below may fail; `Effect.catch` at the bottom
          // converts that into a uniform `metadata.error: true` result so the
          // execute channel matches Tool.define's `never` error type.
          Effect.gen(function* () {
            const model = params.model?.trim() || DEFAULT_MODEL
            const input = {
              slug: params.slug,
              task: {
                cg_name: params.cgName,
                render_mode: "image" as const,
                model,
                panel_count: params.panelCount ?? 1,
                prompt: params.prompt,
                reference_image_urls: [...params.referenceImageUrls],
              },
              assets_root: params.assetsRoot,
              overwrite: params.overwrite ?? false,
            }

            if (params.dryRun) {
              return {
                title: `dry-run ${TOOL_ID} (${model})`,
                output: JSON.stringify({ tool: TOOL_ID, script: scriptPath, input }, null, 2),
                metadata: {
                  truncated: false,
                  dryRun: true,
                  model,
                  scriptPath,
                  refCount: params.referenceImageUrls.length,
                },
              }
            }

            const extraArgs: string[] = params.mock ? ["--mock"] : []
            const result = yield* Effect.tryPromise({
              try: () =>
                runner({
                  script: scriptPath,
                  input,
                  extraArgs,
                  timeoutMs: 300_000,
                  signal: ctx.abort,
                }),
              catch: (e) =>
                new Error(`${TOOL_ID}: python subprocess failed to start — ${e instanceof Error ? e.message : String(e)}`),
            })

            if (result.exitCode !== 0) {
              const stderrMsg = result.stderr.trim() || `exited ${result.exitCode}`
              return {
                title: `${TOOL_ID} failed`,
                output: `${TOOL_ID} error: ${stderrMsg}`,
                metadata: {
                  truncated: false,
                  error: true,
                  exitCode: result.exitCode,
                  stderr: result.stderr,
                  scriptPath,
                  model,
                },
              }
            }

            // Parse Python's stdout JSON. The script promises strict JSON
            // there — anything else (progress, warnings) goes to stderr.
            let parsed: unknown
            try {
              parsed = JSON.parse(result.stdout)
            } catch {
              return {
                title: `${TOOL_ID} parse error`,
                output: `${TOOL_ID}: could not parse Python stdout as JSON`,
                metadata: {
                  truncated: false,
                  error: true,
                  stdout: result.stdout.slice(0, 500),
                  stderr: result.stderr.slice(0, 500),
                  scriptPath,
                  model,
                },
              }
            }

            // Runtime-validate the shape — we never trust the cast alone.
            const decoded = yield* Schema.decodeUnknownEffect(CgRenderResult)(parsed).pipe(
              Effect.mapError(
                (err) =>
                  new Error(
                    `${TOOL_ID}: Python stdout did not match expected schema: ${err instanceof Error ? err.message : String(err)}`,
                  ),
              ),
            )
            const localPath = decoded.outputs[0]!.path

            return {
              title: `${TOOL_ID} (${model})`,
              output: localPath,
              metadata: {
                truncated: false,
                localPath,
                model: decoded.meta?.model ?? model,
                latencyMs: decoded.meta?.latency_ms,
                mock: decoded.meta?.mock ?? params.mock ?? false,
                cgName: params.cgName,
                refCount: params.referenceImageUrls.length,
              },
            }
          }).pipe(
            Effect.catch((err) =>
              Effect.succeed({
                title: `${TOOL_ID} failed`,
                output: `${TOOL_ID} error: ${err instanceof Error ? err.message : String(err)}`,
                metadata: {
                  truncated: false,
                  error: true,
                  message: err instanceof Error ? err.message : String(err),
                },
              }),
            ),
          ),
      }
    }),
  )
}

export const CgRenderTool = makeCgRenderTool()
