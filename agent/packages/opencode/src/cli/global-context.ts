/**
 * Resolved global flag context, populated once after yargs parsing and read
 * by leaf-command handlers.
 *
 * Phase 6 § Task 4.2 — singleton mutable record. Avoids threading global
 * flags through every command handler / Effect layer. Set exactly once from
 * the root yargs `.middleware()` callback in `index.ts`. Tests / fixtures
 * that bypass yargs simply call `getGlobalContext()` and receive defaults.
 */
import type { OutputFormat } from "./output/mode"

export interface GlobalContext {
  /** Resolved output format (TTY pretty vs JSON). */
  output: OutputFormat
  /** Resolved `--dry-run` (or env equivalent). */
  dryRun: boolean
  /** Resolved `--non-interactive` (CI=true implies). */
  nonInteractive: boolean
  /** Resolved `--no-color` (CI=true / NO_COLOR env imply). */
  noColor: boolean
  /** Resolved `--quiet`. */
  quiet: boolean
  /** Resolved `--verbose`. */
  verbose: boolean
}

const DEFAULTS: GlobalContext = {
  output: "tty",
  dryRun: false,
  nonInteractive: false,
  noColor: false,
  quiet: false,
  verbose: false,
}

let _ctx: GlobalContext | undefined

/**
 * Install the resolved context. Called once by the root yargs middleware in
 * `index.ts`. Safe to call multiple times (the last write wins) but tests
 * should generally reset by calling with a fresh object.
 */
export function setGlobalContext(ctx: GlobalContext): void {
  _ctx = ctx
}

/**
 * Read the resolved global context. Returns conservative defaults when
 * unset (e.g. unit tests, internal helpers) so callers never need to guard
 * on undefined.
 */
export function getGlobalContext(): GlobalContext {
  return _ctx ?? DEFAULTS
}
