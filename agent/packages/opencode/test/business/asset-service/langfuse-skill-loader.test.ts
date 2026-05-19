// S2 — hermetic unit tests for the Langfuse-backed skill loader.
//
// Every external dependency is injected so NOTHING touches the real
// Langfuse, the network, or disk:
//   - `fetchLangfuseBody` : fake Langfuse production-body fetch
//   - `localLoad`         : fake git-canonical fallback
//   - `now`               : deterministic clock for TTL assertions
//
// Covers plan §S2 tests ①–⑤ + the never-hard-fail invariant.

import { describe, expect, test } from "bun:test"
import { createLangfuseSkillLoader } from "@/business/asset-service/langfuse-skill-loader"
import { SkillInfeasibleError, type LoadedSkill } from "@/business/asset-service/skill-source"

const LOCAL: LoadedSkill = {
  body: "LOCAL BODY\n## Atomic tools (allowed)\n- `oss-put`\n",
  allowlist: ["oss-put"],
}
const localLoad = async (_skill: string): Promise<LoadedSkill> => LOCAL

const GOOD_LF_BODY = [
  "# cg-render-spec (served from Langfuse production)",
  "",
  "## Atomic tools (allowed)",
  "- `cg-render`",
  "- `oss-put`",
  "",
].join("\n")

describe("createLangfuseSkillLoader", () => {
  test("① Langfuse hit → uses the Langfuse body + its parsed allowlist", async () => {
    const load = createLangfuseSkillLoader({
      fetchLangfuseBody: async () => GOOD_LF_BODY,
      localLoad,
      ttlMs: 0,
    })
    const r = await load("cg-render-spec")
    expect(r.body).toBe(GOOD_LF_BODY)
    expect(r.allowlist.slice().sort()).toEqual(["cg-render", "oss-put"])
  })

  test("② Langfuse miss/error/timeout (fetch→null) → local fallback, never throws", async () => {
    const load = createLangfuseSkillLoader({
      fetchLangfuseBody: async () => null,
      localLoad,
      ttlMs: 0,
    })
    expect(await load("cg-render-spec")).toEqual(LOCAL)
  })

  test("② b — a fetch that THROWS still degrades to local (never hard-fail job)", async () => {
    const load = createLangfuseSkillLoader({
      fetchLangfuseBody: async () => {
        throw new Error("langfuse exploded")
      },
      localLoad,
      ttlMs: 0,
    })
    expect(await load("cg-render-spec")).toEqual(LOCAL)
  })

  test("③ no creds → real default fetch resolves null (no throw) → local", async () => {
    const savedPk = process.env.LANGFUSE_PUBLIC_KEY
    const savedSk = process.env.LANGFUSE_SECRET_KEY
    delete process.env.LANGFUSE_PUBLIC_KEY
    delete process.env.LANGFUSE_SECRET_KEY
    try {
      const load = createLangfuseSkillLoader({ localLoad, ttlMs: 0, timeoutMs: 500 })
      expect(await load("cg-render-spec")).toEqual(LOCAL)
    } finally {
      if (savedPk !== undefined) process.env.LANGFUSE_PUBLIC_KEY = savedPk
      if (savedSk !== undefined) process.env.LANGFUSE_SECRET_KEY = savedSk
    }
  })

  test("④ TTL — within TTL no repeat fetch; after expiry it refetches", async () => {
    let calls = 0
    let clock = 1_000
    const load = createLangfuseSkillLoader({
      fetchLangfuseBody: async () => {
        calls++
        return GOOD_LF_BODY
      },
      localLoad,
      ttlMs: 60_000,
      now: () => clock,
    })
    await load("cg-render-spec")
    await load("cg-render-spec")
    expect(calls).toBe(1) // second call served from TTL cache
    clock += 60_001
    await load("cg-render-spec")
    expect(calls).toBe(2) // expired → refetched
  })

  test("⑤ bad Langfuse body (empty allowlist) → SkillInfeasibleError (NOT fallback, NOT 500)", async () => {
    const load = createLangfuseSkillLoader({
      fetchLangfuseBody: async () => "# header only\n\nno atomic tools section\n",
      localLoad,
      ttlMs: 0,
    })
    await expect(load("cg-render-spec")).rejects.toBeInstanceOf(SkillInfeasibleError)
  })

  test("⑤ b — a bad body is not cached; loader recovers once Langfuse is fixed", async () => {
    let good = false
    const load = createLangfuseSkillLoader({
      fetchLangfuseBody: async () => (good ? GOOD_LF_BODY : "broken, no tools\n"),
      localLoad,
      ttlMs: 60_000,
      now: () => 1,
    })
    await expect(load("cg-render-spec")).rejects.toBeInstanceOf(SkillInfeasibleError)
    good = true
    expect((await load("cg-render-spec")).body).toBe(GOOD_LF_BODY)
  })

  test("⑥ per-skill cache isolation — different skills do not collide", async () => {
    const bodies: Record<string, string> = {
      "cg-render-spec": GOOD_LF_BODY,
      "sfx-spec": "# sfx\n## Atomic tools (allowed)\n- `generate-sfx-elevenlabs`\n",
    }
    const load = createLangfuseSkillLoader({
      fetchLangfuseBody: async (s) => bodies[s] ?? null,
      localLoad,
      ttlMs: 60_000,
      now: () => 1,
    })
    expect((await load("cg-render-spec")).allowlist.slice().sort()).toEqual(["cg-render", "oss-put"])
    expect((await load("sfx-spec")).allowlist).toEqual(["generate-sfx-elevenlabs"])
  })
})
