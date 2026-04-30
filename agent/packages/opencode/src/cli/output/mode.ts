/**
 * Output-mode resolution for the CLI.
 *
 * Phase 6 § 0.5 / Task 4.1 — pure module. Three small functions resolve
 * `(flags, env)` into the CLI's runtime UX shape:
 *
 *   - `outputMode(flags)`  — `"tty"` (pretty / table) vs `"json"` (machine).
 *   - `isNonInteractive(flags)`  — block any stdin prompt; fail-fast instead.
 *   - `isNoColor(flags)`  — disable ANSI colors.
 *
 * Resolution rules favor explicit flags first, then well-known env signals
 * (CI=true / NO_COLOR), then auto-detection (process.stdout.isTTY). Pure
 * functions of inputs only — tests mutate `process.env` and pass flags
 * directly. No imports beyond `process`.
 */
export type OutputFormat = "tty" | "json"

/** True when env value is the conventional truthy form ("true" or "1"). */
function envTrue(value: string | undefined): boolean {
  return value === "true" || value === "1"
}

/**
 * Resolve the desired output format. First match wins:
 *   1. Explicit `--output json` / `--output text` (text → tty).
 *   2. `process.env.CI === "true" | "1"` → json (CI runners pipe).
 *   3. `process.stdout.isTTY === false` → json (output is being piped).
 *   4. Default → tty (interactive shell).
 */
export function outputMode(flags?: { output?: string }): OutputFormat {
  const explicit = flags?.output
  if (explicit === "json") return "json"
  if (explicit === "text") return "tty"
  if (envTrue(process.env.CI)) return "json"
  if (process.stdout.isTTY === false) return "json"
  return "tty"
}

/**
 * True when the CLI must not block on user input. Fall-through order:
 *   1. Explicit `--non-interactive` flag.
 *   2. `CI=true|1` env (CI runners cannot answer prompts).
 *   3. Otherwise false.
 */
export function isNonInteractive(flags?: { nonInteractive?: boolean }): boolean {
  if (flags?.nonInteractive === true) return true
  if (envTrue(process.env.CI)) return true
  return false
}

/**
 * True when the CLI should suppress ANSI color codes. Fall-through order:
 *   1. Explicit `--no-color` flag.
 *   2. `CI=true|1` env (color codes pollute CI logs).
 *   3. `NO_COLOR` env set to ANY value (de-facto standard, https://no-color.org).
 *   4. Otherwise false.
 */
export function isNoColor(flags?: { noColor?: boolean }): boolean {
  if (flags?.noColor === true) return true
  if (envTrue(process.env.CI)) return true
  if (typeof process.env.NO_COLOR === "string") return true
  return false
}
