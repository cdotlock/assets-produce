/**
 * Phase 6 Task 5 — centralized exit codes.
 *
 * Mirrors `cli-example/src/errors/codes.ts` (per plan § 0.8). The numeric
 * values match the cli-example contract exactly so external agents that
 * already understand MiniMax CLI exit codes can reuse the same mappings.
 *
 * `130` (SIGINT) is intentionally NOT a named constant — Node/Bun emit it
 * automatically on Ctrl-C and we never set it ourselves. It is documented in
 * `EXIT_CODE_DESCRIPTIONS` for completeness so `ERRORS.md` / SKILL.md
 * generators can surface it to users.
 */

export const ExitCode = {
  SUCCESS: 0,
  GENERAL: 1,
  USAGE: 2,
  AUTH: 3,
  QUOTA: 4,
  TIMEOUT: 5,
  NETWORK: 6,
  CONTENT_FILTER: 10,
} as const

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

/**
 * One-line user-facing meaning for each exit code. Used by `ERRORS.md`
 * generation tooling and (eventually) `--help` rendering.
 *
 * 130 is included because it's how Node/Bun signals SIGINT — even though we
 * don't emit it programmatically.
 */
export const EXIT_CODE_DESCRIPTIONS: Readonly<Record<number, string>> = {
  0: "Success — command completed normally",
  1: "General error — unspecified failure or runtime error",
  2: "Usage error — invalid or missing arguments",
  3: "Authentication error — missing/invalid credentials or required env",
  4: "Quota error — rate limit or quota exceeded",
  5: "Timeout — operation timed out",
  6: "Network error — connection refused, DNS failure, or similar",
  10: "Content filter — request blocked by safety filter",
  130: "Interrupted — process received SIGINT (e.g. Ctrl-C)",
}
