import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./ls-validate.txt"

const TOOL_ID = "ls-validate"

// Absolute-path constraint: non-empty + must start with "/" (POSIX).
// We enforce POSIX-absolute since the bridge only runs on Linux/macOS CI.
// Relative paths would silently resolve differently depending on cwd, so
// we reject them at the parameter boundary (mirrors nrbi's HttpsUrl pattern).
const AbsolutePath = Schema.String.check(Schema.isPattern(/^\/.+/))

export const Parameters = Schema.Struct({
  script_path: AbsolutePath.annotate({
    description:
      "Absolute path to the .ls (or .md) file to validate. Must be an absolute path; relative paths are rejected.",
  }),
  mock: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run the bridge in mock mode (hermetic, no Go toolchain required). Use in tests. Returns a canned PASS unless script_path ends with __LS_MOCK_FAIL__.",
  }),
  dryRun: Schema.optional(Schema.Boolean).annotate({
    description: "Print the resolved invocation without calling the bridge. Testing only.",
  }),
})

// Validated shape of ls_validate.py's stdout on success (both PASS and FAIL
// verdicts exit 0). We never trust a bare cast — Schema.decodeUnknownEffect
// enforces the contract at the wrapper boundary (mirrors nrbi-render-prompt M1
// hardening).
//
// The `meta` field is ALWAYS present in real bridge output:
//   PASS: {"verdict":"PASS","errors":[],"meta":{"atomic_tool":"ls-validate","mock":<bool>}}
//   FAIL: {"verdict":"FAIL","errors":[...],"raw":"...","meta":{"atomic_tool":"ls-validate","mock":<bool>}}
// A schema without `meta` would reject real output and only "pass" against
// minimal stub fixtures, silently breaking integration. We model it explicitly.
export const LsValidateResult = Schema.Struct({
  verdict: Schema.Literals(["PASS", "FAIL"]),
  errors: Schema.Array(Schema.String),
  raw: Schema.optional(Schema.String),
  meta: Schema.optional(
    Schema.Struct({
      atomic_tool: Schema.String,
      mock: Schema.Boolean,
    }),
  ),
})

export interface MakeLsValidateToolOpts {
  runner?: PythonRunner
  /** Absolute path to `tools/ls-validate/ls_validate.py`. Defaults to repo-relative. */
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "ls-validate", "ls_validate.py")

export function makeLsValidateTool(opts: MakeLsValidateToolOpts = {}) {
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
              script_path: params.script_path,
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
                  scriptTarget: params.script_path,
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
                  // First non-mock run builds the Go binary; allow 5 minutes.
                  timeoutMs: 300_000,
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

            // Parse ls_validate.py's stdout JSON. The bridge promises strict
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
            const decoded = yield* Schema.decodeUnknownEffect(LsValidateResult)(parsed).pipe(
              Effect.mapError(
                (err) =>
                  new Error(
                    `${TOOL_ID}: Python stdout did not match expected schema: ${err instanceof Error ? err.message : String(err)}`,
                  ),
              ),
            )

            // A FAIL verdict is a successful judgement (the validator ran and
            // found problems in the script). It is NOT `metadata.error`.
            // Only operational failures (non-zero exit, bad JSON, bad schema) are errors.
            return {
              title: `${TOOL_ID} ${decoded.verdict}`,
              output: JSON.stringify(decoded),
              metadata: {
                truncated: false,
                verdict: decoded.verdict,
                errorCount: decoded.errors.length,
                mock: params.mock ?? false,
                scriptTarget: params.script_path,
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

export const LsValidateTool = makeLsValidateTool()
