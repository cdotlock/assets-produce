/**
 * Single source of truth for CLI option definitions.
 *
 * Phase 6 § 0.1: shape borrowed verbatim from `cli-example/src/command.ts:4-9`
 * (MiniMax CLI). Three adapters derive yargs builder chains, JSON schema for
 * LLM tool exports, and plain-text help blocks from the same definitions so
 * SKILL.md / ERRORS.md / `agent config export-schema` stay in sync.
 *
 * Pure functions only — no side-effects, no async, no imports beyond the
 * `Argv` type from yargs. Adapters take a yargs instance as argument so this
 * file does not pin a parser instance and stays easy to unit test.
 */
import type { Argv, Options as YargsOptions } from "yargs"

export interface OptionDef {
  /** CLI flag form, e.g. `"--username <name>"`, `"--dry-run"`, `"--file <path>"` (array). */
  flag: string
  /** One-line description shown in help and exported in schemas. */
  description: string
  /** Value type. Defaults to `"string"` when omitted. */
  type?: "string" | "number" | "boolean" | "array"
  /** When true, yargs `demandOption` is set. */
  required?: boolean
  /**
   * Escape hatch for yargs option features the OptionDef shape does not cover
   * (e.g. `choices`, `coerce`, `conflicts`, `alias`, `default`). Merged into
   * the yargs config last and wins on key collisions.
   */
  extra?: YargsOptions
}

/**
 * Strip leading `--` and any `<placeholder>` / `[placeholder]` value form so
 * the result is a yargs option name (`--username <name>` → `username`).
 */
function flagToName(flag: string): string {
  const head = flag.split(/\s+/)[0] ?? flag
  return head.replace(/^--?/, "")
}

/** Resolve OptionDef.type to yargs option config fragment. */
function typeFragment(type: OptionDef["type"]): YargsOptions {
  switch (type) {
    case "boolean":
      return { type: "boolean" }
    case "number":
      return { type: "number" }
    case "array":
      // yargs convention: array-of-strings is `array: true, type: "string"`.
      return { type: "string", array: true }
    case "string":
    case undefined:
    default:
      return { type: "string" }
  }
}

/**
 * Apply each OptionDef to the yargs instance via `.option()`. Returns the
 * (chained) yargs instance for further composition.
 */
export function toYargsBuilder<T = Record<string, unknown>>(yargs: Argv<T>, options: OptionDef[]): Argv<T> {
  let acc = yargs
  for (const opt of options) {
    const name = flagToName(opt.flag)
    const config: YargsOptions = {
      ...typeFragment(opt.type),
      describe: opt.description,
      ...(opt.required ? { demandOption: true } : {}),
      ...(opt.extra ?? {}),
    }
    acc = acc.option(name, config) as Argv<T>
  }
  return acc
}

/**
 * Convert OptionDefs to a JSON-shape suitable for embedding into Anthropic /
 * OpenAI tool schemas. Map keyed by option name (post-strip), each value
 * `{ type, description, required? }`. Array options are reported as `array`.
 */
export function toJsonSchema(
  options: OptionDef[],
): Record<string, { type: string; description: string; required?: boolean }> {
  const out: Record<string, { type: string; description: string; required?: boolean }> = {}
  for (const opt of options) {
    const name = flagToName(opt.flag)
    out[name] = {
      type: opt.type ?? "string",
      description: opt.description,
      ...(opt.required ? { required: true } : {}),
    }
  }
  return out
}

/**
 * Render a multi-line help block:
 *   <cmdName>
 *     --flag  description
 *     --flag  description
 *
 * Used by Task 5 error messages and (eventually) `agent help <cmd>`.
 */
export function helpFor(cmdName: string, options: OptionDef[]): string {
  const lines: string[] = [cmdName]
  if (options.length === 0) return lines.join("\n")
  const flagWidth = Math.max(...options.map((o) => o.flag.length))
  for (const opt of options) {
    lines.push(`  ${opt.flag.padEnd(flagWidth)}  ${opt.description}`)
  }
  return lines.join("\n")
}

/**
 * Global flags shared by every CLI command. Adapted from
 * `cli-example/src/command.ts:44-57` (MiniMax CLI). Names are kept identical
 * where possible so SKILL.md can borrow MiniMax docs verbatim.
 *
 * Wiring into the yargs root + per-command honoring is done in later Phase 6
 * tasks (Task 4 for output mode + dry-run + non-interactive, Task 5 for exit
 * code routing). Task 1 only defines the constants — no behavior change yet.
 */
export const GLOBAL_OPTIONS: OptionDef[] = [
  { flag: "--api-key <key>", description: "API key (overrides env)" },
  { flag: "--base-url <url>", description: "API base URL" },
  { flag: "--output <format>", description: "Output format: text, json", type: "string" },
  { flag: "--timeout <seconds>", description: "Request timeout in seconds", type: "number" },
  { flag: "--quiet", description: "Suppress non-essential output", type: "boolean" },
  { flag: "--verbose", description: "Print HTTP request/response details", type: "boolean" },
  { flag: "--no-color", description: "Disable ANSI colors", type: "boolean" },
  { flag: "--dry-run", description: "Plan the action; do not mutate state", type: "boolean" },
  { flag: "--non-interactive", description: "Disable interactive prompts; fail when input is required", type: "boolean" },
  { flag: "--help", description: "Show help", type: "boolean" },
  { flag: "--version", description: "Print version", type: "boolean" },
]
