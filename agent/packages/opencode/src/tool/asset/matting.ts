import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./matting.txt"

const TOOL_ID = "matting"

export const Parameters = Schema.Struct({
  inputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path to the source image to matte.",
  }),
  outputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path the matted transparent cutout should land at.",
  }),
  format: Schema.optional(Schema.String).annotate({
    description: 'Output format for the transparent cutout — "webp" (default) or "png".',
  }),
  device: Schema.optional(Schema.String).annotate({
    description: 'Inference backend device (default "cpu"; pass "cuda" or "mps" for GPU).',
  }),
  overwrite: Schema.optional(Schema.Boolean).annotate({
    description: "Overwrite an existing outputPath. Default false.",
  }),
  mock: Schema.optional(Schema.Boolean).annotate({
    description:
      "Skip MODNet and write a 1×1 RGBA placeholder PNG. Use in tests / before the MODNet weights are downloaded.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Print the resolved Python invocation without running it.",
  }),
})

// Validated shape of the Python script's stdout — mirrors upscale-image.ts M1 pattern.
const MattingResult = Schema.Struct({
  output: Schema.Struct({ path: Schema.String }),
  meta: Schema.optional(
    Schema.Struct({
      format: Schema.optional(Schema.String),
      device: Schema.optional(Schema.String),
      latency_ms: Schema.optional(Schema.Number),
      atomic_tool: Schema.optional(Schema.String),
      mock: Schema.optional(Schema.Boolean),
    }),
  ),
})

export interface MakeMattingToolOpts {
  runner?: PythonRunner
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "matting", "matting.py")

export function makeMattingTool(opts: MakeMattingToolOpts = {}) {
  const runner = opts.runner ?? runPython
  const scriptPath = opts.scriptPath ?? DEFAULT_SCRIPT

  return Tool.define<typeof Parameters, Record<string, unknown>, never>(
    TOOL_ID,
    Effect.gen(function* () {
      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
          Effect.gen(function* () {
            const fmt = params.format ?? "webp"
            if (fmt !== "webp" && fmt !== "png") {
              return {
                title: `${TOOL_ID} invalid format`,
                output: `${TOOL_ID}: format must be "webp" or "png" (got ${fmt})`,
                metadata: { truncated: false, error: true, message: `format=${fmt} not allowed` },
              }
            }
            const input: Record<string, unknown> = {
              input_path: params.inputPath,
              output_path: params.outputPath,
              format: fmt,
              overwrite: params.overwrite ?? false,
            }
            if (params.device !== undefined) {
              input.device = params.device
            }

            if (params.dryRun) {
              return {
                title: `dry-run ${TOOL_ID} (${fmt})`,
                output: JSON.stringify({ tool: TOOL_ID, script: scriptPath, input }, null, 2),
                metadata: { truncated: false, dryRun: true, format: fmt, scriptPath },
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
                  format: fmt,
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
                  format: fmt,
                },
              }
            }

            // Runtime-validate the shape (mirrors Phase 9 code review M1).
            const decoded = yield* Schema.decodeUnknownEffect(MattingResult)(parsed).pipe(
              Effect.mapError(
                (err) =>
                  new Error(
                    `${TOOL_ID}: Python stdout did not match expected schema: ${err instanceof Error ? err.message : String(err)}`,
                  ),
              ),
            )

            return {
              title: `${TOOL_ID} (${fmt})`,
              output: decoded.output.path,
              metadata: {
                truncated: false,
                outputPath: decoded.output.path,
                format: decoded.meta?.format ?? fmt,
                device: decoded.meta?.device ?? params.device ?? "cpu",
                latencyMs: decoded.meta?.latency_ms,
                mock: decoded.meta?.mock ?? params.mock ?? false,
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

export const MattingTool = makeMattingTool()
