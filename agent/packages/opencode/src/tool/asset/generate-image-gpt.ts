import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import { callFc, extractUrlFromResult, FcCallError, readEndpoint } from "./fc-client"
import DESCRIPTION from "./generate-image-gpt.txt"

const HttpsUrl = Schema.String.check(Schema.isPattern(/^https?:\/\/.+/i)).annotate({
  description: "https URL",
})

export const Parameters = Schema.Struct({
  prompt: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(4000)).annotate({
    description: "Text description of the image to generate",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: 'Model id (default "gpt-image-1", OpenAI GPT-Image)',
  }),
  referenceImageUrls: Schema.optional(Schema.Array(HttpsUrl)).annotate({
    description: "Optional reference image URLs the model should condition on",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Return resolved request without invoking FC. Testing only.",
  }),
})

export const GenerateImageGptTool = Tool.define(
  "generate-image-gpt",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (
        params: {
          prompt: string
          model?: string
          referenceImageUrls?: readonly string[]
          dryRun?: boolean
        },
        _ctx: Tool.Context,
      ) =>
        Effect.gen(function* () {
          const model = params.model?.trim() || "gpt-image-1"
          const refs = params.referenceImageUrls ?? []
          const body: Record<string, unknown> = { prompt: params.prompt, model }
          if (refs.length > 0) body.referenceImageUrls = refs

          if (params.dryRun) {
            return {
              title: `dry-run generate-image-gpt (${model})`,
              output: JSON.stringify({ tool: "generate-image-gpt", body, dryRun: true }, null, 2),
              metadata: { dryRun: true, model, refCount: refs.length },
            }
          }

          const endpoint = yield* Effect.try({
            try: () => readEndpoint("generate-image-gpt", "FC_GENERATE_IMAGE_GPT_URL", "FC_GENERATE_IMAGE_GPT_TOKEN"),
            catch: (e) => e as FcCallError,
          })
          const result = yield* callFc<unknown>({
            tool: "generate-image-gpt",
            endpoint,
            body,
            timeoutMs: 60_000,
          })
          const ossUrl = extractUrlFromResult("generate-image-gpt", result, ["result", "imageUrl", "url"])
          return {
            title: `generate-image-gpt (${model})`,
            output: ossUrl,
            metadata: { ossUrl, model, refCount: refs.length },
          }
        }).pipe(
          Effect.catch((err) =>
            Effect.succeed({
              title: "generate-image-gpt failed",
              output: `generate-image-gpt error: ${err instanceof Error ? err.message : String(err)}`,
              metadata: { error: true, message: err instanceof Error ? err.message : String(err) },
            }),
          ),
        ),
    }
  }),
)
