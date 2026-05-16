import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./green-spill-clear.txt"

const TOOL_ID = "green-spill-clear"

export const Parameters = Schema.Struct({
  inputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path to the source RGBA PNG to clean.",
  }),
  outputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path the cleaned PNG should be written to.",
  }),
  delta: Schema.optional(Schema.Number).annotate({
    description:
      "Green dominance threshold: g > r+delta AND g > b+delta to qualify as leak. Default 5.",
  }),
  brightSum: Schema.optional(Schema.Number).annotate({
    description:
      "Min R+G+B sum to count as a leak (excludes dark green clothing). Default 400.",
  }),
  overwrite: Schema.optional(Schema.Boolean).annotate({
    description: "Overwrite an existing outputPath. Default false.",
  }),
  mock: Schema.optional(Schema.Boolean).annotate({
    description:
      "Write a 1x1 RGBA placeholder PNG instead of processing a real file. Stdlib-only -- no numpy/Pillow required. Use in tests.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Print the resolved Python invocation without running it.",
  }),
})

// Validated shape of the Python script's stdout.
const GreenSpillClearResult = Schema.Struct({
  output: Schema.Struct({ path: Schema.String }),
  meta: Schema.optional(
    Schema.Struct({
      delta: Schema.optional(Schema.Number),
      bright_sum: Schema.optional(Schema.Number),
      latency_ms: Schema.optional(Schema.Number),
      atomic_tool: Schema.optional(Schema.String),
      mock: Schema.optional(Schema.Boolean),
    }),
  ),
})

export interface MakeGreenSpillClearToolOpts {
  runner?: PythonRunner
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "green-spill-clear", "green-spill-clear.py")

export function makeGreenSpillClearTool(opts: MakeGreenSpillClearToolOpts = {}) {
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
            const input: Record<string, unknown> = {
              input_path: params.inputPath,
              output_path: params.outputPath,
              delta: params.delta ?? 5,
              bright_sum: params.brightSum ?? 400,
              overwrite: params.overwrite ?? false,
            }

            if (params.dryRun) {
              return {
                title: `dry-run ${TOOL_ID}`,
                output: JSON.stringify({ tool: TOOL_ID, script: scriptPath, input }, null, 2),
                metadata: { truncated: false, dryRun: true, scriptPath },
              }
            }

            const extraArgs: string[] = params.mock ? ["--mock"] : []
            const result = yield* Effect.tryPromise({
              try: () =>
                runner({
                  script: scriptPath,
                  input,
                  extraArgs,
                  timeoutMs: 120_000,
                  signal: ctx.abort,
                }),
              catch: (e) =>
                new Error(
                  `${TOOL_ID}: python subprocess failed to start -- ${e instanceof Error ? e.message : String(e)}`,
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
                },
              }
            }

            // Runtime-validate the shape (mirrors Phase 9 code review M1).
            const decoded = yield* Schema.decodeUnknownEffect(GreenSpillClearResult)(parsed).pipe(
              Effect.mapError(
                (err) =>
                  new Error(
                    `${TOOL_ID}: Python stdout did not match expected schema: ${err instanceof Error ? err.message : String(err)}`,
                  ),
              ),
            )

            return {
              title: TOOL_ID,
              output: decoded.output.path,
              metadata: {
                truncated: false,
                outputPath: decoded.output.path,
                delta: decoded.meta?.delta ?? (params.delta ?? 5),
                brightSum: decoded.meta?.bright_sum ?? (params.brightSum ?? 400),
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

export const GreenSpillClearTool = makeGreenSpillClearTool()
