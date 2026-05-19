// langfuse-skill-loader — Langfuse-`production`-first skill body loader
// with a git-canonical local fallback (design D1/D6, plan §S2).
//
// Resolution per skill:
//   1. fetch the `production`-labelled `skill_<name>` prompt from Langfuse
//      (bounded by a timeout; missing creds / miss / error / timeout all
//      degrade to `null` — this fetch NEVER throws),
//   2. on a body: parse its allowlist with the EXACT same parser the
//      Phase-14 loop uses (skill-source.parseAllowlist). An empty
//      allowlist on a *present* production body is infeasible →
//      SkillInfeasibleError (maps to GENERATION_REJECTED, never a 500).
//      The S1 promote gate makes this unreachable in production; this is
//      the defensive backstop.
//   3. on `null`: fall back to the git-canonical local body
//      (skill-source.loadLocalSkill) — identical to pre-Langfuse behaviour.
//
// A short in-process TTL cache (env ASSETS_SKILL_LANGFUSE_TTL_MS, default
// 60s) keeps Langfuse off the per-job hot path; a Langfuse hot-edit takes
// ~1 TTL to propagate. Successful resolutions are cached; a thrown
// SkillInfeasibleError is NOT cached (so a fixed Langfuse body recovers
// on the next call).
//
// **Langfuse being unreachable must NEVER hard-fail a job** — that
// invariant is the whole point of the local fallback.

import { Effect } from "effect"
import { Service as LangfuseService, defaultLayer as langfuseLayer } from "@/langfuse/langfuse"
import { promptKeyFor } from "@/business/skill/cli"
import { loadLocalSkill, parseAllowlist, SkillInfeasibleError, type LoadedSkill } from "./skill-source"

const DEFAULT_TTL_MS = 60_000
const DEFAULT_TIMEOUT_MS = 4_000
// The loader reads ONLY the production label (D1/D7). `staging` is the
// editor's landing spot; promote = repoint `production` in Langfuse.
const LANGFUSE_LABEL = "production"

export interface LangfuseSkillLoaderOptions {
  /**
   * Fetch the production body for a skill from Langfuse. Returns the body
   * string on hit, or `null` on miss / error / timeout / missing-creds.
   * MUST NOT throw — the loader treats any throw as `null` defensively.
   */
  fetchLangfuseBody?: (skill: string) => Promise<string | null>
  /** Git-canonical local fallback. Defaults to skill-source.loadLocalSkill. */
  localLoad?: (skill: string) => Promise<LoadedSkill>
  /**
   * In-process cache TTL in ms. Defaults to env
   * `ASSETS_SKILL_LANGFUSE_TTL_MS` (fallback 60000). `<= 0` disables the
   * cache (every call re-resolves — used by hermetic tests).
   */
  ttlMs?: number
  /** Langfuse fetch timeout in ms. Defaults to 4000. */
  timeoutMs?: number
  /** Injectable monotonic clock (ms) for deterministic TTL tests. */
  now?: () => number
}

function resolveTtlMs(opt?: number): number {
  if (typeof opt === "number") return opt
  const raw = process.env.ASSETS_SKILL_LANGFUSE_TTL_MS
  if (raw === undefined || raw.trim() === "") return DEFAULT_TTL_MS
  const n = Number(raw)
  return Number.isFinite(n) ? n : DEFAULT_TTL_MS
}

// Default fetch: the Effect Langfuse Service + its layer, bounded by a
// timeout, collapsed to `string | null`. `runPromiseExit` never rejects,
// so missing creds (readEnv fails → layer build fails), a getPrompt
// LangfuseError, or a timeout all surface as a failure Exit → `null`.
function makeDefaultFetch(timeoutMs: number): (skill: string) => Promise<string | null> {
  return async (skill) => {
    const program = Effect.gen(function* () {
      const lf = yield* LangfuseService
      const p = yield* lf.getPrompt(promptKeyFor(skill), { label: LANGFUSE_LABEL })
      return p.body
    }).pipe(Effect.timeout(timeoutMs), Effect.provide(langfuseLayer))

    const exit = await Effect.runPromiseExit(program as Effect.Effect<string, unknown, never>)
    if (exit._tag === "Success") {
      const body = exit.value
      return typeof body === "string" && body.length > 0 ? body : null
    }
    return null
  }
}

interface CacheEntry {
  value: LoadedSkill
  expiresAt: number
}

/**
 * Build a `loadSkill(name) => Promise<LoadedSkill>` suitable for
 * `createLlmGenerator({ loadSkill })`. Production wiring (wire.ts) injects
 * this; hermetic unit tests inject fakes via the options.
 */
export function createLangfuseSkillLoader(
  options: LangfuseSkillLoaderOptions = {},
): (skill: string) => Promise<LoadedSkill> {
  const ttlMs = resolveTtlMs(options.ttlMs)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = options.now ?? Date.now
  const localLoad = options.localLoad ?? loadLocalSkill
  const fetchLangfuseBody = options.fetchLangfuseBody ?? makeDefaultFetch(timeoutMs)
  const cache = new Map<string, CacheEntry>()

  async function resolve(skill: string): Promise<LoadedSkill> {
    let body: string | null = null
    try {
      body = await fetchLangfuseBody(skill)
    } catch {
      // A custom/default fetch that misbehaves must still degrade — the
      // job is NEVER hard-failed because Langfuse is unreachable (D1).
      body = null
    }

    if (body !== null) {
      const allowlist = parseAllowlist(body)
      if (allowlist.length === 0) {
        // Present-but-broken production body. Not a transport failure, so
        // we do NOT silently fall back (that would hide a corrupt
        // production prompt); we classify it as infeasible so the loop
        // returns GENERATION_REJECTED — never a 500. S1's promote gate
        // is the primary protection that keeps this unreachable.
        throw new SkillInfeasibleError(
          `Langfuse production body for "${skill}" declares no usable atomic tools`,
        )
      }
      return { body, allowlist }
    }

    // miss / error / timeout / no-creds → git-canonical local fallback.
    return localLoad(skill)
  }

  return async function loadSkill(skill: string): Promise<LoadedSkill> {
    if (ttlMs > 0) {
      const hit = cache.get(skill)
      if (hit && hit.expiresAt > now()) return hit.value
    }

    // A thrown SkillInfeasibleError propagates WITHOUT being cached, so a
    // subsequently-fixed Langfuse body recovers on the next call.
    const resolved = await resolve(skill)

    if (ttlMs > 0) {
      cache.set(skill, { value: resolved, expiresAt: now() + ttlMs })
    }
    return resolved
  }
}
