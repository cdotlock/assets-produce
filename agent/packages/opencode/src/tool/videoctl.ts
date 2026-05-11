import { Effect, Schema } from "effect"
import path from "path"
import { Instance } from "@/project/instance"
import { buildPayload } from "@/video/payload"
import { comparePromptFiles, reviewPromptFile } from "@/video/review"
import { createRunDir, readState, writeDryRun } from "@/video/runstate"
import { validatePrompt } from "@/video/validate"
import * as Tool from "./tool"
import DESCRIPTION from "./videoctl.txt"

const Operation = Schema.Literals([
  "payload",
  "validate",
  "submit_dry_run",
  "status",
  "prompt_review",
  "prompt_compare",
])

export const Parameters = Schema.Struct({
  operation: Operation.annotate({
    description:
      "Local video CLI operation: payload, validate, submit_dry_run, status, prompt_review, or prompt_compare",
  }),
  promptPath: Schema.optional(Schema.String).annotate({
    description: "Path to prompt.md for payload, validate, submit_dry_run, prompt_review, or prompt_compare",
  }),
  referencePromptPath: Schema.optional(Schema.String).annotate({
    description: "Reference prompt.md path for prompt_compare",
  }),
  runDir: Schema.optional(Schema.String).annotate({
    description: "Run directory for status, or explicit output directory for submit_dry_run",
  }),
  projectRoot: Schema.optional(Schema.String).annotate({
    description: "Project root used to resolve relative prompt and asset paths. Defaults to the current opencode project.",
  }),
  allowNonOSS: Schema.optional(Schema.Boolean).annotate({
    description: "Allow generic http(s) media URLs instead of OSS-only URLs",
  }),
  allowTextOnly: Schema.optional(Schema.Boolean).annotate({
    description: "Allow payloads without sourceImageUrl for payload and submit_dry_run",
  }),
  allowEmpty: Schema.optional(Schema.Boolean).annotate({
    description: "Allow validate to pass prompt files without media references",
  }),
  timeoutSeconds: Schema.optional(Schema.Number).annotate({
    description: "URL validation timeout in seconds. Defaults to 300.",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

function resolveFromRoot(value: string | undefined, projectRoot: string, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required for this videoctl operation`)
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value)
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

async function executeVideoCtl(params: Params) {
  const projectRoot = path.resolve(params.projectRoot ? String(params.projectRoot) : Instance.directory)
  const promptPath = params.promptPath ? resolveFromRoot(params.promptPath, projectRoot, "promptPath") : undefined
  const commonPayloadOptions = {
    projectRoot,
    allowNonOSS: Boolean(params.allowNonOSS),
    allowTextOnly: Boolean(params.allowTextOnly),
  }

  switch (params.operation) {
    case "payload": {
      const payload = await buildPayload(resolveFromRoot(promptPath, projectRoot, "promptPath"), commonPayloadOptions)
      return {
        title: "videoctl payload",
        value: payload,
        metadata: { operation: params.operation, promptPath },
      }
    }
    case "validate": {
      const result = await validatePrompt(resolveFromRoot(promptPath, projectRoot, "promptPath"), {
        projectRoot,
        timeoutMs: Number(params.timeoutSeconds ?? 300) * 1000,
        allowNonOSS: Boolean(params.allowNonOSS),
        allowEmpty: Boolean(params.allowEmpty),
      })
      return {
        title: `videoctl validate (${result.ok ? "ok" : "failed"})`,
        value: result,
        metadata: { operation: params.operation, ok: result.ok, promptPath },
      }
    }
    case "submit_dry_run": {
      const resolvedPromptPath = resolveFromRoot(promptPath, projectRoot, "promptPath")
      const payload = await buildPayload(resolvedPromptPath, commonPayloadOptions)
      const runDir = await createRunDir(
        resolvedPromptPath,
        params.runDir ? resolveFromRoot(params.runDir, projectRoot, "runDir") : undefined,
      )
      const state = await writeDryRun(runDir, resolvedPromptPath, payload)
      return {
        title: "videoctl submit dry-run",
        value: { status: "dry_run", runDir, request: payload, state },
        metadata: { operation: params.operation, dryRun: true, promptPath: resolvedPromptPath, runDir },
      }
    }
    case "status": {
      const runDir = resolveFromRoot(params.runDir, projectRoot, "runDir")
      const state = await readState(runDir)
      return {
        title: `videoctl status (${state.status})`,
        value: state,
        metadata: { operation: params.operation, status: state.status, runDir },
      }
    }
    case "prompt_review": {
      const resolvedPromptPath = resolveFromRoot(promptPath, projectRoot, "promptPath")
      const report = await reviewPromptFile(resolvedPromptPath)
      return {
        title: `videoctl prompt review (${report.score})`,
        value: report,
        metadata: { operation: params.operation, ok: report.ok, score: report.score, promptPath: resolvedPromptPath },
      }
    }
    case "prompt_compare": {
      const resolvedPromptPath = resolveFromRoot(promptPath, projectRoot, "promptPath")
      const referencePromptPath = resolveFromRoot(params.referencePromptPath, projectRoot, "referencePromptPath")
      const report = await comparePromptFiles(resolvedPromptPath, referencePromptPath)
      return {
        title: `videoctl prompt compare (${report.score})`,
        value: report,
        metadata: {
          operation: params.operation,
          score: report.score,
          promptPath: resolvedPromptPath,
          referencePromptPath,
        },
      }
    }
  }
}

export const VideoCtlTool = Tool.define<typeof Parameters, Record<string, unknown>, never>(
  "videoctl",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "videoctl",
            patterns: [params.operation],
            always: [params.operation],
            metadata: {
              operation: params.operation,
              promptPath: params.promptPath,
              referencePromptPath: params.referencePromptPath,
              runDir: params.runDir,
            },
          })

          const result = yield* Effect.tryPromise({
            try: () => executeVideoCtl(params),
            catch: (err) => (err instanceof Error ? err : new Error(String(err))),
          })
          return {
            title: result.title,
            output: json(result.value),
            metadata: result.metadata,
          }
        }).pipe(
          Effect.catch((err) =>
            Effect.succeed({
              title: "videoctl failed",
              output: `videoctl error: ${err instanceof Error ? err.message : String(err)}`,
              metadata: { error: true, operation: params.operation, message: err instanceof Error ? err.message : String(err) },
            }),
          ),
        ),
    }
  }),
)
