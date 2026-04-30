import { Cause } from "effect"
import { ExitCode } from "./codes"

/**
 * Phase 6 Task 5 — error→ExitCode router.
 *
 * Replaces the per-cmd-file `formatErrorFromCause` helpers (`users.ts:33-57`,
 * `tools.ts:51-93`, `skills.ts:42-66`) with one canonical mapping. Handlers
 * call `formatError(exit.cause)` to derive both a user-facing message and
 * the right exit code in one pass.
 *
 * Mapping rules (in order of precedence — see plan § 0.8):
 *   1. `null` / `undefined`                        → SUCCESS
 *   2. Effect `Cause` containing an Interrupt      → GENERAL (130 is OS-handled)
 *   3. Effect `Cause` — recurse into the first `Fail` / `Die` reason
 *   4. NamedError-like (`.name` matches an allow-list — see `classifyByName`):
 *        - `ProviderAuthValidationFailed` / `*AuthError` / `*AuthFailed` → AUTH
 *        - `*RateLimitError` / `*QuotaError`                            → QUOTA
 *        - `*TimeoutError` / `RequestTimeout`                           → TIMEOUT
 *        - `*NetworkError`                                              → NETWORK
 *        - `*ContentFilter` / `*ContentBlocked`                         → CONTENT_FILTER
 *        - else                                                         → GENERAL
 *   5. Plain `Error` with network-y errno or message → NETWORK
 *   6. Default                                      → GENERAL
 *
 * Recovery from Cause is mirror-image of the per-file helpers: walk
 * `cause.reasons`, pick the first `Fail` (typed error) or `Die` (defect),
 * then re-route the unwrapped value.
 */

const NETWORK_ERRNOS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
])

const NETWORK_MSG_FRAGMENTS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "fetch failed",
  "getaddrinfo",
]

interface NamedErrorLike {
  name?: unknown
  message?: unknown
  code?: unknown
  data?: unknown
}

function asNamed(value: unknown): NamedErrorLike | null {
  if (value === null || typeof value !== "object") return null
  return value as NamedErrorLike
}

function classifyByName(name: string): ExitCode {
  // Tightened from `.includes(...)` substring tests to explicit allow-lists so
  // names like `NoAuthRequired` or `UnauthorizedAccess` don't accidentally
  // match the AUTH bucket. Each branch lists the exact suffix/equality patterns
  // we want to recognize; everything else falls through to GENERAL.
  if (
    name === "ProviderAuthValidationFailed" ||
    name === "AuthError" ||
    name.endsWith("AuthError") ||
    name.endsWith("AuthFailed")
  ) {
    return ExitCode.AUTH
  }
  if (
    name === "RateLimitError" ||
    name === "QuotaError" ||
    name.endsWith("RateLimitError") ||
    name.endsWith("QuotaError")
  ) {
    return ExitCode.QUOTA
  }
  if (name === "TimeoutError" || name === "RequestTimeout" || name.endsWith("TimeoutError")) {
    return ExitCode.TIMEOUT
  }
  if (name === "NetworkError" || name.endsWith("NetworkError")) {
    return ExitCode.NETWORK
  }
  if (name === "ContentFilter" || name.endsWith("ContentFilter") || name.endsWith("ContentBlocked")) {
    return ExitCode.CONTENT_FILTER
  }
  return ExitCode.GENERAL
}

function looksLikeNetworkMessage(message: string): boolean {
  return NETWORK_MSG_FRAGMENTS.some((frag) => message.includes(frag))
}

/**
 * Walk a Cause tree and return the first `Fail.error` or `Die.defect` payload,
 * or `undefined` if the cause is empty / pure interruption. Mirrors the
 * helper in `cli/cmd/users.ts` so behavior is preserved.
 */
function firstReasonError<E>(cause: Cause.Cause<E>): unknown {
  for (const reason of cause.reasons) {
    if (reason._tag === "Fail") return reason.error
    if (reason._tag === "Die") return reason.defect
  }
  return undefined
}

function hasInterrupt<E>(cause: Cause.Cause<E>): boolean {
  for (const reason of cause.reasons) {
    if (reason._tag === "Interrupt") return true
  }
  return false
}

export function router(err: unknown): ExitCode {
  if (err === null || err === undefined) return ExitCode.SUCCESS

  if (Cause.isCause(err)) {
    // Programmatic `Cause.Interrupt` (e.g. internal abort signals, fiber
    // cancellation) maps to GENERAL — NOT 130. Node only emits 130 when the
    // process itself receives SIGINT from the OS; we let that path fire
    // naturally. Don't "fix" this to 130: a programmatic interrupt isn't a
    // user-initiated Ctrl-C.
    if (hasInterrupt(err)) return ExitCode.GENERAL
    const inner = firstReasonError(err)
    if (inner === undefined) return ExitCode.GENERAL
    return router(inner)
  }

  const named = asNamed(err)
  if (named && typeof named.name === "string") {
    const byName = classifyByName(named.name)
    if (byName !== ExitCode.GENERAL) return byName
  }

  if (err instanceof Error) {
    const errno = (err as NodeJS.ErrnoException).code
    if (typeof errno === "string" && NETWORK_ERRNOS.has(errno)) return ExitCode.NETWORK
    if (looksLikeNetworkMessage(err.message)) return ExitCode.NETWORK
    return ExitCode.GENERAL
  }

  if (named && typeof named.code === "string" && NETWORK_ERRNOS.has(named.code as string)) {
    return ExitCode.NETWORK
  }
  if (named && typeof named.message === "string" && looksLikeNetworkMessage(named.message)) {
    return ExitCode.NETWORK
  }

  return ExitCode.GENERAL
}

/**
 * Reduce an error to a one-line user-facing string. Mirrors the
 * `formatErrorFromCause` shape in `cli/cmd/users.ts:33-57`.
 *
 * Precedence (matches the per-file helpers we're replacing):
 *   1. NamedError-style `{ data: { op, message } }` → `[op] message`
 *   2. `Error` → `message` (or `name` if name === message)
 *   3. plain string → as-is
 *   4. fallback → `Cause.pretty(...).split("\n")[0]` if input was a Cause,
 *      otherwise `String(value)`
 */
function singleLine(value: unknown, originatingCause?: Cause.Cause<unknown>): string {
  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: { op?: unknown; message?: unknown } }).data
    if (data && typeof data === "object") {
      const { op, message } = data as { op?: unknown; message?: unknown }
      const opStr = typeof op === "string" ? op : "error"
      const msgStr = typeof message === "string" ? message : JSON.stringify(data)
      return `[${opStr}] ${msgStr}`
    }
  }
  if (value instanceof Error) {
    return value.name === value.message ? value.name : value.message
  }
  if (typeof value === "string") return value
  if (value !== undefined && value !== null) return String(value)
  if (originatingCause) {
    return Cause.pretty(originatingCause).split("\n")[0] ?? "unexpected error"
  }
  return "unexpected error"
}

/**
 * One-shot helper: classify an error into `{ exitCode, message }` so the
 * existing P1 cmd-handler boilerplate can be reduced to:
 *
 *   const { exitCode, message } = formatError(exit.cause)
 *   UI.error(message)
 *   process.exit(exitCode)
 */
export function formatError(err: unknown): { exitCode: ExitCode; message: string } {
  if (err === null || err === undefined) {
    return { exitCode: ExitCode.SUCCESS, message: "" }
  }

  if (Cause.isCause(err)) {
    const inner = firstReasonError(err)
    return {
      exitCode: router(err),
      message: singleLine(inner, err),
    }
  }

  return {
    exitCode: router(err),
    message: singleLine(err),
  }
}
