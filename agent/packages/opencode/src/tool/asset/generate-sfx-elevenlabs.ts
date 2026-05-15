import { randomUUID } from "crypto"
import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import * as OSS from "../../oss/oss"
import { formatToolError } from "./fc-client"
import DESCRIPTION from "./generate-sfx-elevenlabs.txt"

const TOOL_ID = "generate-sfx-elevenlabs"
// n2m does not hardcode a model id (it comes from project config). This
// standalone tool needs a sensible default; ElevenLabs' current sound-effects
// model. Callers may override via `params.model`.
const DEFAULT_MODEL = "eleven_text_to_sound_v2"
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
const DEFAULT_BASE_URL = "https://api.elevenlabs.io"
// Ported from n2m build_prompt() — keeps SFX output free of voice/music.
const DEFAULT_PROMPT_SUFFIX =
  "High-quality foley sound effect. No human voice, no music, no speech. Clean, isolated sound."
// n2m treats a < 256 byte 200-body as a silent/failed synthesis.
const MIN_AUDIO_BYTES = 256
const MAX_PROMPT_LEN = 1000
const MAX_DURATION_SECONDS = 30

export { DEFAULT_MODEL }

export const Parameters = Schema.Struct({
  prompt: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(MAX_PROMPT_LEN)).annotate({
    description: `Text description of the sound effect to synthesize (1-${MAX_PROMPT_LEN} chars). e.g. "A brief warm doorbell chime".`,
  }),
  duration_seconds: Schema.optional(
    Schema.Number.check(Schema.isGreaterThan(0)).check(Schema.isLessThanOrEqualTo(MAX_DURATION_SECONDS)),
  ).annotate({
    description: `Optional target duration in seconds (0 < d <= ${MAX_DURATION_SECONDS}). Omit to let the model auto-pick a natural length.`,
  }),
  prompt_influence: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1)),
  ).annotate({
    description: "Optional 0..1 — how strictly the model follows the prompt vs. its own creativity. Default 0.3.",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: `Model id (default "${DEFAULT_MODEL}").`,
  }),
  promptSuffix: Schema.optional(Schema.String).annotate({
    description:
      "Optional override for the default foley suffix appended to the prompt. Pass an empty string to send the prompt verbatim.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Return the resolved request without calling ElevenLabs / OSS. Testing only — never set in production.",
  }),
})

// HTTP synthesis call, ported from n2m elevenlabs_generator.py generate()
// (request construction → POST → 200-body-is-mp3-bytes). Injectable so tests
// never hit the network. Returns the raw status + body; the caller folds
// non-200 / silent responses into the tool result.
export type SfxHttp = (
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
) => Promise<{ status: number; body: Buffer }>

// OSS uploader. Injectable so tests don't touch ali-oss. The default runs the
// Phase 2 OSS Effect service as a self-contained promise (same pattern as
// cli/cmd/oss.ts `runWithOSS`) — keeps this tool's Effect error channel
// `never` (no OSS.Service in its requirement set).
export type SfxUploader = (key: string, body: Buffer) => Promise<string>

export interface MakeGenerateSfxElevenlabsToolOpts {
  http?: SfxHttp
  uploader?: SfxUploader
  resolveApiKey?: () => string | undefined
  baseUrl?: string
}

const defaultHttp: SfxHttp = async (url, headers, body, signal) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  const arr = await res.arrayBuffer()
  return { status: res.status, body: Buffer.from(arr) }
}

const defaultUploader: SfxUploader = (key, body) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const oss = yield* OSS.Service
      const { url } = yield* oss.put(key, body)
      return url
    }).pipe(Effect.provide(OSS.defaultLayer)) as Effect.Effect<string, unknown, never>,
  )

function buildPrompt(prompt: string, suffix: string | undefined): string {
  // Mirrors n2m build_prompt: append the (overridable) suffix. An explicit
  // empty string means "send the prompt verbatim".
  if (suffix === undefined) return `${prompt} ${DEFAULT_PROMPT_SUFFIX}`
  if (suffix === "") return prompt
  return `${prompt} ${suffix}`
}

export function makeGenerateSfxElevenlabsTool(opts: MakeGenerateSfxElevenlabsToolOpts = {}) {
  const http = opts.http ?? defaultHttp
  const uploader = opts.uploader ?? defaultUploader
  const resolveApiKey = opts.resolveApiKey ?? (() => process.env.ELEVENLABS_API_KEY)
  const baseUrl = (opts.baseUrl ?? process.env.ELEVENLABS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "")

  return Tool.define<typeof Parameters, Record<string, unknown>, never>(
    TOOL_ID,
    Effect.gen(function* () {
      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
          // Whole pipeline may fail (ElevenLabs HTTP error OR OSSError); the
          // `Effect.catch` at the bottom folds that into a uniform
          // `metadata.error: true` result so the channel matches Tool.define's
          // `never` (tool.ts does Effect.orDie at the wrap boundary).
          Effect.gen(function* () {
            const model = params.model?.trim() || DEFAULT_MODEL
            const text = buildPrompt(params.prompt, params.promptSuffix)
            const body: Record<string, unknown> = {
              text,
              model_id: model,
              output_format: DEFAULT_OUTPUT_FORMAT,
            }
            if (params.duration_seconds !== undefined) body.duration_seconds = params.duration_seconds
            if (params.prompt_influence !== undefined) body.prompt_influence = params.prompt_influence

            if (params.dryRun) {
              return {
                title: `dry-run ${TOOL_ID} (${model})`,
                output: JSON.stringify({ tool: TOOL_ID, body, dryRun: true }, null, 2),
                metadata: { truncated: false, dryRun: true, model },
              }
            }

            const apiKey = resolveApiKey()
            if (!apiKey) {
              return {
                title: `${TOOL_ID} failed`,
                output: `${TOOL_ID} error: ELEVENLABS_API_KEY is not configured (set it to enable this tool)`,
                metadata: {
                  truncated: false,
                  error: true,
                  message: "ELEVENLABS_API_KEY is not configured",
                },
              }
            }

            const url = `${baseUrl}/v1/sound-generation`
            const resp = yield* Effect.tryPromise({
              try: () => http(url, { "xi-api-key": apiKey }, body, ctx.abort),
              catch: (e) =>
                new Error(`${TOOL_ID}: ElevenLabs request failed — ${e instanceof Error ? e.message : String(e)}`),
            })

            if (resp.status !== 200) {
              const detail = resp.body.toString("utf8").slice(0, 500) || "(empty body)"
              return {
                title: `${TOOL_ID} failed`,
                output: `${TOOL_ID} error: [elevenlabs/${resp.status}] ${detail}`,
                metadata: {
                  truncated: false,
                  error: true,
                  status: resp.status,
                  message: detail,
                  model,
                },
              }
            }

            // n2m guards: a 200 with a tiny body is a silent/failed synthesis.
            if (resp.body.length < MIN_AUDIO_BYTES) {
              return {
                title: `${TOOL_ID} failed`,
                output: `${TOOL_ID} error: ElevenLabs returned ${resp.body.length} bytes (< ${MIN_AUDIO_BYTES}); treating as a silent/failed synthesis`,
                metadata: {
                  truncated: false,
                  error: true,
                  message: `silent response (${resp.body.length} bytes)`,
                  model,
                },
              }
            }

            // Inline-call the Phase 2 OSS service. Key suffix MUST be `.mp3`
            // — ali-oss infers content-type from the extension (output_format
            // default is mp3_44100_128).
            const key = `audio/sfx/${randomUUID()}.mp3`
            const ossUrl = yield* Effect.tryPromise({
              try: () => uploader(key, resp.body),
              catch: (e) => new Error(`${TOOL_ID}: OSS upload failed — ${formatToolError(e)}`),
            })

            return {
              title: `${TOOL_ID} (${model})`,
              output: ossUrl,
              metadata: {
                truncated: false,
                ossUrl,
                model,
                prompt: params.prompt,
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

export const GenerateSfxElevenlabsTool = makeGenerateSfxElevenlabsTool()
