import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./hole-fill.txt"

const TOOL_ID = "hole-fill"

export const Parameters = Schema.Struct({
  inputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path to the source RGBA PNG image to inpaint.",
  }),
  outputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path the inpainted PNG should be written to.",
  }),
  dilate: Schema.optional(Schema.Number).annotate({
    description: "Dilation radius in pixels (0 disables dilation). Default 2.",
  }),
  minSize: Schema.optional(Schema.Number).annotate({
    description: "Ignore interior alpha=0 components smaller than this (noise floor). Default 200.",
  }),
  maxSize: Schema.optional(Schema.Number).annotate({
    description: "Preserve interior alpha=0 components >= this size as legitimate negative space. Default 8000.",
  }),
  overwrite: Schema.optional(Schema.Boolean).annotate({
    description: "Overwrite an existing outputPath. Default false.",
  }),
  mock: Schema.optional(Schema.Boolean).annotate({
    description:
      "Write a 1x1 RGBA placeholder instead of processing a real file. Stdlib-only (no cv2/scipy/numpy needed). Use in tests.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Print the resolved Python invocation without running it.",
  }),
})

// Validated shape of the Python script's stdout.
const HoleFillResult = Schema.Struct({
  output: Schema.Struct({ path: Schema.String }),
  meta: Schema.optional(
    Schema.Struct({
      dilate: Schema.optional(Schema.Number),
      min_size: Schema.optional(Schema.Number),
      max_size: Schema.optional(Schema.Number),
      latency_ms: Schema.optional(Schema.Number),
      atomic_tool: Schema.optional(Schema.String),
      mock: Schema.optional(Schema.Boolean),
    }),
  ),
})

export interface MakeHoleFillToolOpts {
  runner?: PythonRunner
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "hole-fill", "hole-fill.py")

export function makeHoleFillTool(opts: MakeHoleFillToolOpts = {}) {
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
              overwrite: params.overwrite ?? false,
              ...(params.dilate !== undefined && { dilate: params.dilate }),
              ...(params.minSize !== undefined && { min_size: params.minSize }),
              ...(params.maxSize !== undefined && { max_size: params.maxSize }),
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
            const decoded = yield* Schema.decodeUnknownEffect(HoleFillResult)(parsed).pipe(
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
                dilate: decoded.meta?.dilate,
                minSize: decoded.meta?.min_size,
                maxSize: decoded.meta?.max_size,
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

export const HoleFillTool = makeHoleFillTool()
