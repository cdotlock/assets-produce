import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import { callFc, extractUrlFromResult, FcCallError, formatToolError, readEndpoint } from "./fc-client"
import DESCRIPTION from "./crop-video.txt"

const HttpsUrl = Schema.String.check(Schema.isPattern(/^https:\/\/.+/i)).annotate({
  description: "https URL",
})

export const Parameters = Schema.Struct({
  videoUrl: HttpsUrl.annotate({ description: "Source video URL (https)" }),
  startTime: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
    description: "Start time in seconds (>= 0)",
  }),
  endTime: Schema.Number.check(Schema.isGreaterThan(0)).annotate({
    description: "End time in seconds (> startTime)",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Return resolved request without invoking FC. Testing only.",
  }),
})

export const CropVideoTool = Tool.define<typeof Parameters, Record<string, unknown>, never>(
  "crop-video",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (params.endTime <= params.startTime) {
            return {
              title: "crop-video invalid range",
              output: `crop-video error: endTime (${params.endTime}) must be > startTime (${params.startTime})`,
              metadata: { error: true, message: "invalid time range" },
            }
          }
          const body: Record<string, unknown> = {
            videoUrl: params.videoUrl,
            startTime: params.startTime,
            endTime: params.endTime,
          }

          if (params.dryRun) {
            return {
              title: "dry-run crop-video",
              output: JSON.stringify({ tool: "crop-video", body, dryRun: true }, null, 2),
              metadata: { dryRun: true },
            }
          }

          const endpoint = yield* Effect.try({
            try: () => readEndpoint("crop-video", "FC_CROP_VIDEO_URL", "FC_CROP_VIDEO_TOKEN"),
            catch: (e) => e as FcCallError,
          })
          const result = yield* callFc<unknown>({
            tool: "crop-video",
            endpoint,
            body,
            timeoutMs: 120_000,
            signal: ctx.abort,
          })
          const ossUrl = yield* extractUrlFromResult("crop-video", result, ["videoUrl", "url", "result"])
          return {
            title: "crop-video",
            output: ossUrl,
            metadata: { ossUrl, startTime: params.startTime, endTime: params.endTime },
          }
        }).pipe(
          Effect.catch((err) =>
            Effect.succeed({
              title: "crop-video failed",
              output: `crop-video error: ${formatToolError(err)}`,
              metadata: { error: true, message: formatToolError(err) },
            }),
          ),
        ),
    }
  }),
)
