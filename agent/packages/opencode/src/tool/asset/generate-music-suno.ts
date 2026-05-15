import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import { formatToolError } from "./fc-client"
import DESCRIPTION from "./generate-music-suno.txt"

const TOOL_ID = "generate-music-suno"
// Suno publishes no official first-party API; this is the genre/style-driven
// model id a real gateway would eventually carry. Kept as a default so the
// echoed metadata has the same shape the real path will produce.
const DEFAULT_MODEL = "suno-v4"
const MAX_PROMPT_LEN = 1000
// Music clips run longer than SFX; cap at 5 minutes so an obviously bogus
// value is rejected at the schema boundary (parity with the SFX cap idiom).
const MAX_DURATION_SECONDS = 300

// The single fixed placeholder string. MUST stay byte-identical across calls
// for the same input (no timestamps / random / UUIDs) — the determinism
// contract depends on it. Exported so the test asserts the exact contract.
export const PLACEHOLDER_MESSAGE =
  "music generation pending Suno gateway selection — see spec §15 row 1.13 (no official Suno API; gateway deferred)"

export { DEFAULT_MODEL }

export const Parameters = Schema.Struct({
  prompt: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(MAX_PROMPT_LEN)).annotate({
    description: `Text description of the music track to generate (1-${MAX_PROMPT_LEN} chars). e.g. "Upbeat lo-fi hip hop background track".`,
  }),
  duration_seconds: Schema.optional(
    Schema.Number.check(Schema.isGreaterThan(0)).check(Schema.isLessThanOrEqualTo(MAX_DURATION_SECONDS)),
  ).annotate({
    description: `Optional target duration in seconds (0 < d <= ${MAX_DURATION_SECONDS}). Omit to let the model auto-pick a natural length.`,
  }),
  style: Schema.optional(Schema.String).annotate({
    description: 'Optional free-form genre/style hint, e.g. "lo-fi", "epic orchestral".',
  }),
  instrumental: Schema.optional(Schema.Boolean).annotate({
    description: "Optional — request a vocal-free (instrumental) track.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description:
      "Accepted for structural parity with the other asset tools. There is no real upstream to skip, so this behaves identically to the default path.",
  }),
})

type MusicParams = {
  prompt: string
  duration_seconds?: number
  style?: string
  instrumental?: boolean
  dryRun?: boolean
}

export const GenerateMusicSunoTool = Tool.define<typeof Parameters, Record<string, unknown>, never>(
  TOOL_ID,
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: MusicParams, _ctx: Tool.Context) =>
        // The happy path cannot fail upstream (no HTTP / OSS), but the
        // `Effect.catch` tail is kept for structural parity with the other
        // asset tools so the channel matches Tool.define's `never`.
        Effect.gen(function* () {
          // DEFERRED OPEN ITEM (spec §15 row 1.13): Suno has no official
          // first-party public API. Every public "Suno API" is a
          // reverse-engineered third-party gateway with a different
          // auth/endpoint/async contract. Music generation is intentionally
          // a deterministic placeholder until a gateway is selected. A future
          // §15 revision wires the real gateway HTTP + OSS upload HERE,
          // replacing the placeholder return below. Do NOT add a real call,
          // fake audio bytes, or a fabricated URL — the placeholder must stay
          // plainly identifiable.
          const model = DEFAULT_MODEL
          return {
            title: `${TOOL_ID} (placeholder)`,
            output: PLACEHOLDER_MESSAGE,
            // `truncated: false` keeps the framework's truncate path (which
            // needs an Instance context) bypassed — the placeholder string is
            // tiny and never needs truncation. Mirrors generate-sfx-elevenlabs.
            metadata: {
              truncated: false,
              placeholder: true,
              prompt: params.prompt,
              model,
              duration_seconds: params.duration_seconds ?? null,
              style: params.style ?? null,
              instrumental: params.instrumental ?? null,
            },
          }
        }).pipe(
          Effect.catch((err) =>
            Effect.succeed({
              title: `${TOOL_ID} failed`,
              output: `${TOOL_ID} error: ${formatToolError(err)}`,
              metadata: { truncated: false, error: true, message: formatToolError(err) },
            }),
          ),
        ),
    }
  }),
)
