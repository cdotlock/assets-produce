import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import { callFc, extractUrlFromResult, FcCallError, formatToolError, readEndpoint } from "./fc-client"
import DESCRIPTION from "./generate-image-nanobanana.txt"

const TOOL_ID = "generate-image-nanobanana"
const DEFAULT_MODEL = "gemini-3.1-flash-image-preview"

const HttpsUrl = Schema.String.check(Schema.isPattern(/^https:\/\/.+/i)).annotate({
  description: "https URL",
})

export const Parameters = Schema.Struct({
  prompt: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(4000)).annotate({
    description: "Text description of the image to generate (1-4000 chars)",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: `Model id (default "${DEFAULT_MODEL}", a.k.a. nanobanana 2)`,
  }),
  referenceImageUrls: Schema.optional(Schema.Array(HttpsUrl).check(Schema.isMaxLength(8))).annotate({
    description: "Optional reference image URLs (max 8) the model should condition on",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Return resolved request without invoking FC. Testing only — never set in production.",
  }),
})

export const GenerateImageNanobananaTool = Tool.define<typeof Parameters, Record<string, unknown>, never>(
  TOOL_ID,
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const model = params.model?.trim() || DEFAULT_MODEL
          const refs = params.referenceImageUrls ?? []
          const body: Record<string, unknown> = { prompt: params.prompt, model }
          if (refs.length > 0) body.referenceImageUrls = refs

          if (params.dryRun) {
            return {
              title: `dry-run ${TOOL_ID} (${model})`,
              output: JSON.stringify({ tool: TOOL_ID, body, dryRun: true }, null, 2),
              metadata: { dryRun: true, model, refCount: refs.length },
            }
          }

          const endpoint = yield* Effect.try({
            try: () =>
              readEndpoint(TOOL_ID, "FC_GENERATE_IMAGE_NANOBANANA_URL", "FC_GENERATE_IMAGE_NANOBANANA_TOKEN"),
            catch: (e) => e as FcCallError,
          })
          const result = yield* callFc<unknown>({
            tool: TOOL_ID,
            endpoint,
            body,
            timeoutMs: 60_000,
            signal: ctx.abort,
          })
          const ossUrl = yield* extractUrlFromResult(TOOL_ID, result, ["imageUrl", "url", "result"])
          return {
            title: `${TOOL_ID} (${model})`,
            output: ossUrl,
            metadata: { ossUrl, model, refCount: refs.length },
          }
        }).pipe(
          Effect.catch((err) =>
            Effect.succeed({
              title: `${TOOL_ID} failed`,
              output: `${TOOL_ID} error: ${formatToolError(err)}`,
              metadata: { error: true, message: formatToolError(err) },
            }),
          ),
        ),
    }
  }),
)
