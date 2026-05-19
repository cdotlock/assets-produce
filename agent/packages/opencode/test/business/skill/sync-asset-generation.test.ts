// S1 — hermetic unit tests for `skills sync asset-generation`.
//
// The Langfuse Service is faked via Layer.succeed (tests the real Effect
// wiring); the skill list + local body reader are injected so nothing
// touches disk or the network. Covers plan §S1 tests ①–④ + the promote
// gate (D5) and the never-silent-half-success rule.

import { describe, expect, test } from "bun:test"
import { Effect, Layer, Exit } from "effect"
import { Service as LangfuseService, LangfuseError, type PromptInfo } from "@/langfuse/langfuse"
import { SkillCli } from "@/business/skill/cli"

const GOOD_BODY = ["# spec", "", "## Atomic tools (allowed)", "- `cg-render`", "- `oss-put`", ""].join("\n")
const BAD_BODY = ["# spec", "", "## Overview", "no atomic tools section at all", ""].join("\n")

interface FakeOpts {
  store?: Record<string, string>
  onCreate?: (name: string, body: string, label?: string) => void
  failCreate?: (name: string) => boolean
}

function fakeLangfuse(opts: FakeOpts = {}) {
  const store = opts.store ?? {}
  return Layer.succeed(
    LangfuseService,
    LangfuseService.of({
      getPrompt: (name, o) =>
        name in store
          ? Effect.succeed({
              name,
              version: 1,
              label: o?.label ?? "production",
              body: store[name]!,
              type: "text",
            } satisfies PromptInfo)
          : Effect.fail(new LangfuseError({ op: "getPrompt", target: name, message: "not found" })),
      createPrompt: (name, body, o) => {
        if (opts.failCreate?.(name))
          return Effect.fail(new LangfuseError({ op: "createPrompt", target: name, message: "boom" }))
        opts.onCreate?.(name, body, o?.label)
        store[name] = body
        return Effect.succeed({
          name,
          version: 1,
          label: o?.label ?? "production",
          body,
          type: "text",
        } satisfies PromptInfo)
      },
    }),
  )
}

const run = <A, E>(eff: Effect.Effect<A, E, LangfuseService>, layer: Layer.Layer<LangfuseService>) =>
  Effect.runPromiseExit(eff.pipe(Effect.provide(layer)) as Effect.Effect<A, E, never>)

describe("syncAssetGeneration", () => {
  test("① push to staging — Langfuse receives byte-identical bodies; round-trips", async () => {
    const created: { name: string; body: string; label?: string }[] = []
    const layer = fakeLangfuse({ onCreate: (name, body, label) => created.push({ name, body, label }) })
    const exit = await run(
      SkillCli.syncAssetGeneration({
        label: "staging",
        check: false,
        skills: ["cg-render-spec", "sfx-spec"],
        readBody: async () => GOOD_BODY,
      }),
      layer,
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.ok).toBe(true)
    expect(exit.value.statuses.every((s) => s.state === "pushed")).toBe(true)
    // Langfuse prompt-key namespace is `skill_<name>` (spec/CLAUDE.md).
    expect(created.map((c) => c.name).sort()).toEqual(["skill_cg-render-spec", "skill_sfx-spec"])
    expect(created.every((c) => c.body === GOOD_BODY && c.label === "staging")).toBe(true)
  })

  test("② promote gate — a bad-allowlist body is REJECTED for production, ALLOWED for staging", async () => {
    // production: rejected, never pushed, overall non-ok
    const createdProd: string[] = []
    const prod = await run(
      SkillCli.syncAssetGeneration({
        label: "production",
        check: false,
        skills: ["cg-render-spec"],
        readBody: async () => BAD_BODY,
      }),
      fakeLangfuse({ onCreate: (n) => createdProd.push(n) }),
    )
    expect(Exit.isSuccess(prod)).toBe(true)
    if (!Exit.isSuccess(prod)) return
    expect(prod.value.ok).toBe(false)
    expect(prod.value.statuses[0]!.state).toBe("rejected-allowlist")
    expect(createdProd).toEqual([]) // gate fired BEFORE any write

    // staging: same body is allowed (staging is the editor scratch label)
    const createdStg: string[] = []
    const stg = await run(
      SkillCli.syncAssetGeneration({
        label: "staging",
        check: false,
        skills: ["cg-render-spec"],
        readBody: async () => BAD_BODY,
      }),
      fakeLangfuse({ onCreate: (n) => createdStg.push(n) }),
    )
    expect(Exit.isSuccess(stg)).toBe(true)
    if (!Exit.isSuccess(stg)) return
    expect(stg.value.ok).toBe(true)
    expect(stg.value.statuses[0]!.state).toBe("pushed")
    expect(createdStg).toEqual(["skill_cg-render-spec"])
  })

  test("③ --check — matched ⇒ ok; any drift ⇒ non-ok with the drifting skill named", async () => {
    const inSync = await run(
      SkillCli.syncAssetGeneration({
        label: "production",
        check: true,
        skills: ["cg-render-spec"],
        readBody: async () => GOOD_BODY,
      }),
      fakeLangfuse({ store: { "skill_cg-render-spec": GOOD_BODY } }),
    )
    expect(Exit.isSuccess(inSync)).toBe(true)
    if (!Exit.isSuccess(inSync)) return
    expect(inSync.value.ok).toBe(true)
    expect(inSync.value.statuses[0]!.state).toBe("matched")

    const drifted = await run(
      SkillCli.syncAssetGeneration({
        label: "production",
        check: true,
        skills: ["cg-render-spec"],
        readBody: async () => GOOD_BODY + "\nlocal edit not pushed\n",
      }),
      fakeLangfuse({ store: { "skill_cg-render-spec": GOOD_BODY } }),
    )
    expect(Exit.isSuccess(drifted)).toBe(true)
    if (!Exit.isSuccess(drifted)) return
    expect(drifted.value.ok).toBe(false)
    expect(drifted.value.statuses[0]!.state).toBe("drift")
    expect(drifted.value.statuses[0]!.name).toBe("cg-render-spec")
  })

  test("③ b — --check writes NOTHING even when drifted", async () => {
    const created: string[] = []
    await run(
      SkillCli.syncAssetGeneration({
        label: "production",
        check: true,
        skills: ["cg-render-spec"],
        readBody: async () => "totally different\n",
      }),
      fakeLangfuse({ store: { "skill_cg-render-spec": GOOD_BODY }, onCreate: (n) => created.push(n) }),
    )
    expect(created).toEqual([])
  })

  test("④ a per-skill Langfuse failure ⇒ status error + overall non-ok (no silent half-success)", async () => {
    const exit = await run(
      SkillCli.syncAssetGeneration({
        label: "staging",
        check: false,
        skills: ["cg-render-spec", "sfx-spec"],
        readBody: async () => GOOD_BODY,
      }),
      fakeLangfuse({ failCreate: (n) => n === "skill_sfx-spec" }),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.ok).toBe(false)
    const sfx = exit.value.statuses.find((s) => s.name === "sfx-spec")!
    expect(sfx.state).toBe("error")
    const cg = exit.value.statuses.find((s) => s.name === "cg-render-spec")!
    expect(cg.state).toBe("pushed") // the good one still went through; failure is reported, not swallowed
  })

  test("missing local body ⇒ status missing-local + overall non-ok, never crashes", async () => {
    const exit = await run(
      SkillCli.syncAssetGeneration({
        label: "staging",
        check: false,
        skills: ["ep-sprite-spec"],
        readBody: async () => {
          throw new Error("ENOENT: no such file")
        },
      }),
      fakeLangfuse(),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.ok).toBe(false)
    expect(exit.value.statuses[0]!.state).toBe("missing-local")
  })

  test("invalid label ⇒ Effect fails with SkillCliError (defensive)", async () => {
    const exit = await run(
      SkillCli.syncAssetGeneration({
        label: "prod",
        check: false,
        skills: ["cg-render-spec"],
        readBody: async () => GOOD_BODY,
      }),
      fakeLangfuse(),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  test("default skill list = ASSET_GENERATION_SKILLS (no injection) — function is callable as the CLI uses it", async () => {
    // readBody injected so we stay off disk; this asserts the default
    // skill list is wired (statuses cover the whole asset-generation set).
    const exit = await run(
      SkillCli.syncAssetGeneration({
        label: "staging",
        check: false,
        readBody: async () => GOOD_BODY,
      }),
      fakeLangfuse(),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.statuses.length).toBeGreaterThanOrEqual(11)
    expect(exit.value.statuses.some((s) => s.name === "cg-render-spec")).toBe(true)
  })
})
