import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./nrbi-render-prompt.txt"

const TOOL_ID = "nrbi-render-prompt"

const LayerLiteral = Schema.Literal("A", "A5", "B", "C", "D", "E")
const HttpsUrl = Schema.String.check(Schema.isPattern(/^https:\/\/.+/i)).annotate({
  description: "https URL",
})

export const Parameters = Schema.Struct({
  layer: LayerLiteral.annotate({
    description:
      "Asset layer: A=series character, A5=outfit anchor, B=scene grid, C=scene square, D=scene variant, E=ep sprite.",
  }),
  category: Schema.optional(Schema.String).annotate({
    description: "Optional category override; defaults to the layer's frozen NRBI category.",
  }),
  style_name: Schema.optional(Schema.String).annotate({
    description: "Optional style name override; defaults to the layer's frozen NRBI style.",
  }),
  variable_text: Schema.Record(Schema.String, Schema.Unknown).annotate({
    description: "Per-layer variable fields the prompt template interpolates (e.g. orig_prompt).",
  }),
  reference_image_urls: Schema.optional(Schema.Array(HttpsUrl)).annotate({
    description:
      "Caller-resolved reference image OSS URLs in dependency order. Layer E requires the series portrait as image-1.",
  }),
  mock: Schema.optional(Schema.Boolean).annotate({
    description: "Run render.py in mock mode (deterministic, no external calls). Use in tests.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Print the resolved Python invocation without running it. Testing only.",
  }),
})

// Validated shape of render.py's stdout. We never trust a bare cast —
// Schema.decodeUnknownEffect enforces the contract at the wrapper
// boundary so the agent loop never sees a malformed prompt payload
// (mirrors the cg-render M1 hardening).
const NrbiResult = Schema.Struct({
  prompt: Schema.String,
  reference_image_urls: Schema.Array(Schema.String),
  model: Schema.String,
  style_name: Schema.String,
  category: Schema.String,
  layer: Schema.String,
  meta: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})

// Factory so tests can swap in a fake runner without hitting Bun.spawn.
// Production wiring uses `NrbiRenderPromptTool` directly (default runner
// = `runPython` from python-runner.ts).
export interface MakeNrbiRenderPromptToolOpts {
  runner?: PythonRunner
  /** Absolute path to `tools/nrbi-render-prompt/render.py`. Defaults to repo-relative. */
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "nrbi-render-prompt", "render.py")

export function makeNrbiRenderPromptTool(opts: MakeNrbiRenderPromptToolOpts = {}) {
  const runner = opts.runner ?? runPython
  const scriptPath = opts.scriptPath ?? DEFAULT_SCRIPT

  return Tool.define<typeof Parameters, Record<string, unknown>, never>(
    TOOL_ID,
    Effect.gen(function* () {
      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
          // The whole pipeline below may fail; `Effect.catch` at the bottom
          // converts that into a uniform `metadata.error: true` result so the
          // execute channel matches Tool.define's `never` error type.
          Effect.gen(function* () {
            const input = {
              layer: params.layer,
              category: params.category,
              style_name: params.style_name,
              variable_text: params.variable_text,
              reference_image_urls: params.reference_image_urls
                ? [...params.reference_image_urls]
                : [],
              mock: params.mock ?? false,
              dryRun: params.dryRun ?? false,
            }

            if (params.dryRun) {
              return {
                title: `${TOOL_ID} (dry run)`,
                output: JSON.stringify({ tool: TOOL_ID, script: scriptPath, input }, null, 2),
                metadata: {
                  truncated: false,
                  dryRun: true,
                  scriptPath,
                  layer: params.layer,
                },
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

            // Parse render.py's stdout JSON. The script promises strict
            // JSON there — logs/warnings go to stderr.
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
                  stderr: result.stderr.slice(0, 500),
                  scriptPath,
                },
              }
            }

            // Runtime-validate the shape — we never trust the cast alone.
            const decoded = yield* Schema.decodeUnknownEffect(NrbiResult)(parsed).pipe(
              Effect.mapError(
                (err) =>
                  new Error(
                    `${TOOL_ID}: Python stdout did not match expected schema: ${err instanceof Error ? err.message : String(err)}`,
                  ),
              ),
            )

            return {
              title: `${TOOL_ID} ${decoded.layer}`,
              output: JSON.stringify(decoded),
              metadata: {
                truncated: false,
                model: decoded.model,
                styleName: decoded.style_name,
                category: decoded.category,
                layer: decoded.layer,
                refCount: decoded.reference_image_urls.length,
                mock: params.mock ?? false,
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

export const NrbiRenderPromptTool = makeNrbiRenderPromptTool()
