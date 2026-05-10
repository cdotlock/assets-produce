import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import { callFc, FcCallError, formatToolError, readEndpoint } from "./fc-client"
import DESCRIPTION from "./generate-video-happyhorse.txt"

const TOOL_ID = "generate-video-happyhorse"

const HttpsUrl = Schema.String.check(Schema.isPattern(/^https:\/\/.+/i)).annotate({
  description: "https URL",
})

const MediaItem = Schema.Struct({
  type: Schema.Literals(["video", "reference_image"]).annotate({
    description: 'Media role: "video" (source clip) or "reference_image" (style/content reference)',
  }),
  url: HttpsUrl,
})

export const Parameters = Schema.Struct({
  prompt: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(4000)).annotate({
    description: "Text description of the video to generate",
  }),
  media: Schema.Array(MediaItem)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(8))
    .annotate({ description: "1-8 media items (videos or reference images)" }),
  resolution: Schema.optional(Schema.Literals(["1080P", "720P"])).annotate({
    description: "Output resolution",
  }),
  ratio: Schema.optional(Schema.Literals(["16:9", "9:16", "1:1", "4:3", "3:4"])).annotate({
    description: "Aspect ratio",
  }),
  duration: Schema.optional(
    Schema.Number.check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(1))
      .check(Schema.isLessThanOrEqualTo(30)),
  ).annotate({ description: "Duration in seconds (1-30)" }),
  model: Schema.optional(Schema.String).annotate({
    description: "Optional HappyHorse model id (FC backend default if omitted)",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Return resolved request without invoking FC. Testing only.",
  }),
})

interface MediaInput {
  type: "video" | "reference_image"
  url: string
}

export const GenerateVideoHappyHorseTool = Tool.define<typeof Parameters, Record<string, unknown>, never>(
  TOOL_ID,
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (
        params: {
          prompt: string
          media: readonly MediaInput[]
          resolution?: "1080P" | "720P"
          ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4"
          duration?: number
          model?: string
          dryRun?: boolean
        },
        ctx: Tool.Context,
      ) =>
        Effect.gen(function* () {
          const body: Record<string, unknown> = {
            action: "generate",
            prompt: params.prompt,
            media: params.media,
          }
          if (params.resolution) body.resolution = params.resolution
          if (params.ratio) body.ratio = params.ratio
          if (params.duration !== undefined) body.duration = params.duration
          if (params.model) body.model = params.model

          if (params.dryRun) {
            return {
              title: `dry-run ${TOOL_ID}`,
              output: JSON.stringify({ tool: TOOL_ID, body, dryRun: true }, null, 2),
              metadata: { dryRun: true, mediaCount: params.media.length },
            }
          }

          const endpoint = yield* Effect.try({
            try: () =>
              readEndpoint(TOOL_ID, "FC_GENERATE_VIDEO_HAPPYHORSE_URL", "FC_GENERATE_VIDEO_HAPPYHORSE_TOKEN"),
            catch: (e) => e as FcCallError,
          })
          const result = yield* callFc<{ taskId?: string; status?: string; videoUrl?: string }>({
            tool: TOOL_ID,
            endpoint,
            body,
            timeoutMs: 300_000,
            signal: ctx.abort,
          })
          if (!result?.videoUrl || !/^https?:\/\//i.test(result.videoUrl)) {
            return yield* Effect.fail(
              new FcCallError({
                tool: TOOL_ID,
                op: "parse",
                message: `expected videoUrl URL in response, got ${JSON.stringify(result).slice(0, 256)}`,
              }),
            )
          }
          return {
            title: TOOL_ID,
            output: result.videoUrl,
            metadata: {
              ossUrl: result.videoUrl,
              taskId: result.taskId,
              status: result.status,
              mediaCount: params.media.length,
            },
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
