// Mini-agent-loop budgets (Phase 14, spec §15/1.14).
//
// Two independent backstops keep a runaway LLM loop bounded:
//   - step budget  : max LLM<->tool round-trips per job
//   - token budget : cumulative LLM token usage per job
//
// Both are config-driven via env (ASSETS_SERVICE_MAX_STEPS_PER_JOB /
// ASSETS_SERVICE_MAX_TOKENS_PER_JOB, declared in .env.example). When the
// env is unset/invalid the literal defaults below apply, so existing
// callers that never set the env keep their previous behaviour (step
// default stays 30 — identical to the pre-Phase-14 DEFAULT_MAX_STEPS).

export const DEFAULT_MAX_STEPS = 30
export const DEFAULT_MAX_TOKENS_PER_JOB = 200_000

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback
  return n
}

// Default step cap for a job when the caller does not pass an explicit
// maxSteps. Reads ASSETS_SERVICE_MAX_STEPS_PER_JOB, else DEFAULT_MAX_STEPS.
export function resolveMaxStepsPerJob(): number {
  return readPositiveIntEnv("ASSETS_SERVICE_MAX_STEPS_PER_JOB", DEFAULT_MAX_STEPS)
}

// Cumulative LLM-token budget for a single job. Reads
// ASSETS_SERVICE_MAX_TOKENS_PER_JOB, else DEFAULT_MAX_TOKENS_PER_JOB.
export function resolveMaxTokensPerJob(): number {
  return readPositiveIntEnv("ASSETS_SERVICE_MAX_TOKENS_PER_JOB", DEFAULT_MAX_TOKENS_PER_JOB)
}
