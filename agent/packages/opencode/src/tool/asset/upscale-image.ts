import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./upscale-image.txt"

const TOOL_ID = "upscale-image"
const DEFAULT_MODEL = "realesrgan-x4plus-anime"

export const Parameters = Schema.Struct({
  inputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path to the source PNG to upscale.",
  }),
  outputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path the upscaled PNG should land at.",
  }),
  scale: Schema.optional(Schema.Number).annotate({
    description: "Net upscale factor — must be 2 or 4. Default 2.",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: `Realesrgan model name (default "${DEFAULT_MODEL}").`,
  }),
  overwrite: Schema.optional(Schema.Boolean).annotate({
    description: "Overwrite an existing outputPath. Default false.",
  }),
  mock: Schema.optional(Schema.Boolean).annotate({
    description:
      "Skip realesrgan and write a 1×1 placeholder PNG. Use in tests / before the binary is installed.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Print the resolved Python invocation without running it.",
  }),
})

type UpscaleParams = {
  inputPath: string
  outputPath: string
  scale?: number
  model?: string
  overwrite?: boolean
  mock?: boolean
  dryRun?: boolean
}

export interface MakeUpscaleImageToolOpts {
  runner?: PythonRunner
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "upscale", "upscale.py")

export function makeUpscaleImageTool(opts: MakeUpscaleImageToolOpts = {}) {
  const runner = opts.runner ?? runPython
  const scriptPath = opts.scriptPath ?? DEFAULT_SCRIPT

  return Tool.define<typeof Parameters, Record<string, unknown>, never>(
    TOOL_ID,
    Effect.gen(function* () {
      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: UpscaleParams, ctx: Tool.Context) =>
          Effect.gen(function* () {
            const model = params.model?.trim() || DEFAULT_MODEL
            const scale = params.scale ?? 2
            if (scale !== 2 && scale !== 4) {
              return {
                title: `${TOOL_ID} invalid scale`,
                output: `${TOOL_ID}: scale must be 2 or 4 (got ${scale})`,
                metadata: { truncated: false, error: true, message: `scale=${scale} not allowed` },
              }
            }
            const input = {
              input_path: params.inputPath,
              output_path: params.outputPath,
              scale,
              model,
              overwrite: params.overwrite ?? false,
            }

            if (params.dryRun) {
              return {
                title: `dry-run ${TOOL_ID} (${model} x${scale})`,
                output: JSON.stringify({ tool: TOOL_ID, script: scriptPath, input }, null, 2),
                metadata: { truncated: false, dryRun: true, model, scale, scriptPath },
              }
            }

            const extraArgs: string[] = params.mock ? ["--mock"] : []
            const result = yield* Effect.tryPromise({
              try: () =>
                runner({
                  script: scriptPath,
                  input,
                  extraArgs,
                  timeoutMs: 600_000,
                  signal: ctx.abort,
                }),
              catch: (e) =>
                new Error(
                  `${TOOL_ID}: python subprocess failed to start — ${e instanceof Error ? e.message : String(e)}`,
                ),
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
                  scale,
                },
              }
            }

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
                  scriptPath,
                  model,
                  scale,
                },
              }
            }

            const out = parsed as {
              output?: { path: string }
              meta?: { scale?: number; latency_ms?: number; mock?: boolean; model?: string }
            }
            const outPath = out.output?.path
            if (!outPath) {
              return {
                title: `${TOOL_ID} no output`,
                output: `${TOOL_ID}: Python returned no output.path`,
                metadata: { truncated: false, error: true, scriptPath, model, scale, parsed },
              }
            }

            return {
              title: `${TOOL_ID} (${model} x${scale})`,
              output: outPath,
              metadata: {
                truncated: false,
                outputPath: outPath,
                scale: out.meta?.scale ?? scale,
                model: out.meta?.model ?? model,
                latencyMs: out.meta?.latency_ms,
                mock: out.meta?.mock ?? params.mock ?? false,
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

export const UpscaleImageTool = makeUpscaleImageTool()
