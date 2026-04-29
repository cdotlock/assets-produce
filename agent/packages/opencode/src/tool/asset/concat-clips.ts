import { Effect, Schema } from "effect"
import * as Tool from "../tool"
import { callFc, extractUrlFromResult, FcCallError, formatToolError, readEndpoint } from "./fc-client"
import DESCRIPTION from "./concat-clips.txt"

const HttpsUrl = Schema.String.check(Schema.isPattern(/^https?:\/\/.+/i)).annotate({
  description: "https URL",
})

export const Parameters = Schema.Struct({
  clipUrls: Schema.Array(HttpsUrl)
    .check(Schema.isMinLength(2))
    .check(Schema.isMaxLength(16))
    .annotate({ description: "Ordered list of 2-16 clip URLs to concatenate" }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Return resolved request without invoking FC. Testing only.",
  }),
})

export const ConcatClipsTool = Tool.define(
  "concat-clips",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { clipUrls: readonly string[]; dryRun?: boolean }, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const body: Record<string, unknown> = { clipUrls: params.clipUrls }

          if (params.dryRun) {
            return {
              title: `dry-run concat-clips (${params.clipUrls.length} clips)`,
              output: JSON.stringify({ tool: "concat-clips", body, dryRun: true }, null, 2),
              metadata: { dryRun: true, clipCount: params.clipUrls.length },
            }
          }

          const endpoint = yield* Effect.try({
            try: () => readEndpoint("concat-clips", "FC_CONCAT_CLIPS_URL", "FC_CONCAT_CLIPS_TOKEN"),
            catch: (e) => e as FcCallError,
          })
          const result = yield* callFc<unknown>({
            tool: "concat-clips",
            endpoint,
            body,
            timeoutMs: 120_000,
          })
          const ossUrl = extractUrlFromResult("concat-clips", result, ["result", "videoUrl", "url"])
          return {
            title: `concat-clips (${params.clipUrls.length} clips)`,
            output: ossUrl,
            metadata: { ossUrl, clipCount: params.clipUrls.length },
          }
        }).pipe(
          Effect.catch((err) =>
            Effect.succeed({
              title: "concat-clips failed",
              output: `concat-clips error: ${formatToolError(err)}`,
              metadata: { error: true, message: formatToolError(err) },
            }),
          ),
        ),
    }
  }),
)
