import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./hybrid-to-webp.txt"

const TOOL_ID = "hybrid-to-webp"

export const Parameters = Schema.Struct({
  inputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path to the source RGBA PNG to encode.",
  }),
  outputPath: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Absolute local path the output WebP should be written to.",
  }),
  quality: Schema.optional(Schema.Number).annotate({
    description: "WebP quality (0–100). Default 90 (matches backend default).",
  }),
  method: Schema.optional(Schema.Number).annotate({
    description: "WebP encoder method (0=fast, 6=best/slowest). Default 6.",
  }),
  overwrite: Schema.optional(Schema.Boolean).annotate({
    description: "Overwrite an existing outputPath. Default false.",
  }),
  mock: Schema.optional(Schema.Boolean).annotate({
    description:
      "Write a 1×1 RGBA WebP placeholder instead of encoding a real file. Requires Pillow but no source image. Use in tests.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Print the resolved Python invocation without running it.",
  }),
})

// Validated shape of the Python script's stdout.
const HybridToWebpResult = Schema.Struct({
  output: Schema.Struct({ path: Schema.String }),
  meta: Schema.optional(
    Schema.Struct({
      quality: Schema.optional(Schema.Number),
      method: Schema.optional(Schema.Number),
      latency_ms: Schema.optional(Schema.Number),
      atomic_tool: Schema.optional(Schema.String),
      mock: Schema.optional(Schema.Boolean),
    }),
  ),
})

export interface MakeHybridToWebpToolOpts {
  runner?: PythonRunner
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "hybrid-to-webp", "hybrid-to-webp.py")

export function makeHybridToWebpTool(opts: MakeHybridToWebpToolOpts = {}) {
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
              quality: params.quality ?? 90,
              method: params.method ?? 6,
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
            const decoded = yield* Schema.decodeUnknownEffect(HybridToWebpResult)(parsed).pipe(
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
                quality: decoded.meta?.quality ?? (params.quality ?? 90),
                method: decoded.meta?.method ?? (params.method ?? 6),
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

export const HybridToWebpTool = makeHybridToWebpTool()
