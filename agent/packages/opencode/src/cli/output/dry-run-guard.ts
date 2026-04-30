/**
 * Phase 6 § 0.21 — `--dry-run` guard helpers.
 *
 * Two functions used by leaf-command handlers:
 *
 *   - `applyGlobalDryRun(local)` — preserves the local opt-in pattern (a
 *     mutating command's own `--dry-run`), but falls back to the global
 *     flag from `getGlobalContext()` when no local flag was passed. So a
 *     mutating command without its own `--dry-run` registration still
 *     honors the root-level one.
 *
 *   - `warnDryRunIgnored(cmd)` — emit the canonical stderr warning for
 *     read-only commands so scripts that pass `--dry-run` to every
 *     command (`agent users list --dry-run`, `agent models --dry-run`)
 *     do not blow up.
 *
 * Wiring: read-only handlers add one line at the top —
 *   `if (getGlobalContext().dryRun) warnDryRunIgnored("<cmd>")`
 * Mutating handlers without a local `--dry-run` use
 *   `applyGlobalDryRun(localValue)` to gate their write.
 */
import { getGlobalContext } from "../global-context"

/**
 * Resolve effective dry-run state. Local opt (the command's own flag) wins
 * when present; otherwise the global wins. Use as
 * `applyGlobalDryRun(Boolean(args["dry-run"]))` in commands that already
 * read a local flag, or `applyGlobalDryRun()` in commands that do not.
 */
export function applyGlobalDryRun(localDryRun?: boolean): boolean {
  return localDryRun === true ? true : getGlobalContext().dryRun
}

/**
 * Emit the standard "ignored on read-only command" warning to stderr.
 * Single-line, machine-greppable. Does not exit; caller continues normally.
 */
export function warnDryRunIgnored(cmdName: string): void {
  process.stderr.write(
    `--dry-run not applicable to read-only command, ignored (${cmdName})\n`,
  )
}
