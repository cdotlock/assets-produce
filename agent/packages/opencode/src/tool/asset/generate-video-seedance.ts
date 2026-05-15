import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import { callFc, extractUrlFromResult, FcCallError, formatToolError, readEndpoint } from "./fc-client"
import DESCRIPTION from "./generate-video-seedance.txt"

const TOOL_ID = "generate-video-seedance"
const DEFAULT_MODEL = "seedance-2-pro"

const HttpsUrl = Schema.String.check(Schema.isPattern(/^https:\/\/.+/i)).annotate({
  description: "https URL",
})

export const Parameters = Schema.Struct({
  prompt: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(4000)).annotate({
    description: "Text description of the video scene to generate",
  }),
  sourceImageUrl: Schema.optional(HttpsUrl).annotate({
    description: "Optional source image URL — if provided, animates from this image (image-to-video mode)",
  }),
  styleName: Schema.optional(Schema.String).annotate({
    description: "Optional preset style name (defined by FC backend)",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: `Model id (default "${DEFAULT_MODEL}", SeedDance 2 pro)`,
  }),
  referenceImageUrls: Schema.optional(Schema.Array(HttpsUrl).check(Schema.isMaxLength(8))).annotate({
    description: "Optional reference image URLs (max 8) for style/content conditioning",
  }),
  sourceVideoUrls: Schema.optional(Schema.Array(HttpsUrl).check(Schema.isMaxLength(8))).annotate({
    description: "Optional source video URLs (max 8) for style/content conditioning",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Return resolved request without invoking FC. Testing only.",
  }),
})

export const GenerateVideoSeedanceTool = Tool.define<typeof Parameters, Record<string, unknown>, never>(
  TOOL_ID,
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const model = params.model?.trim() || DEFAULT_MODEL
          const body: Record<string, unknown> = {
            action: "generate",
            prompt: params.prompt,
            model,
          }
          if (params.sourceImageUrl) body.imageUrl = params.sourceImageUrl
          if (params.styleName) body.styleName = params.styleName
          if (params.referenceImageUrls?.length) body.referenceImageUrls = params.referenceImageUrls
          if (params.sourceVideoUrls?.length) body.sourceVideoUrls = params.sourceVideoUrls

          if (params.dryRun) {
            return {
              title: `dry-run ${TOOL_ID} (${model})`,
              output: JSON.stringify({ tool: TOOL_ID, body, dryRun: true }, null, 2),
              metadata: { dryRun: true, model },
            }
          }

          const endpoint = yield* Effect.try({
            try: () =>
              readEndpoint(TOOL_ID, "FC_GENERATE_VIDEO_SEEDANCE_URL", "FC_GENERATE_VIDEO_SEEDANCE_TOKEN"),
            catch: (e) => e as FcCallError,
          })
          const result = yield* callFc<unknown>({
            tool: TOOL_ID,
            endpoint,
            body,
            timeoutMs: 300_000,
            signal: ctx.abort,
          })
          const ossUrl = yield* extractUrlFromResult(TOOL_ID, result, ["videoUrl", "url", "result"])
          return {
            title: `${TOOL_ID} (${model})`,
            output: ossUrl,
            metadata: { ossUrl, model, prompt: params.prompt },
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
