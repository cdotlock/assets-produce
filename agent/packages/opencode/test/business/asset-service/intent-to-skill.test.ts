import { describe, expect, test } from "bun:test"
import {
  ASSET_GENERATION_SKILLS,
  DEFAULT_KIND_SKILL_MAP,
  intentToSkill,
  type SkillPickContext,
  type SkillPicker,
} from "@/business/asset-service/intent-to-skill"
import type { AssetIntent } from "@/business/asset-service/types"

const intent = (overrides: Partial<AssetIntent> = {}): AssetIntent => ({
  kind: "cg",
  key: "k1",
  spec_md: "## spec",
  ...overrides,
})

describe("intentToSkill — skill_hint shortcut", () => {
  test("returns the hint when it matches a known skill", async () => {
    const out = await intentToSkill({
      intent: intent(),
      preferences: { skill_hint: "character-portrait-spec" },
    })
    expect(out).toBe("character-portrait-spec")
  })

  test("ignores an unknown skill_hint (falls through to default kind map)", async () => {
    const out = await intentToSkill({
      intent: intent({ kind: "character_portrait" }),
      preferences: { skill_hint: "nonexistent-skill" },
    })
    expect(out).toBe("character-portrait-spec")
  })

  test("respects availableSkills override (hint must be in the override list)", async () => {
    const out = await intentToSkill({
      intent: intent({ kind: "cover" }),
      preferences: { skill_hint: "cover-spec" },
      availableSkills: ["character-portrait-spec"], // cover-spec NOT here
    })
    // hint missed → falls through to picker / default; with no picker and a
    // kind that has no entry in the override list, default is the first
    // skill in the override.
    expect(out).toBe("character-portrait-spec")
  })
})

describe("intentToSkill — default kind map", () => {
  test("character_portrait → character-portrait-spec", async () => {
    expect(await intentToSkill({ intent: intent({ kind: "character_portrait" }) })).toBe(
      "character-portrait-spec",
    )
  })
  test("scene_bg → scene-bg-spec", async () => {
    expect(await intentToSkill({ intent: intent({ kind: "scene_bg" }) })).toBe("scene-bg-spec")
  })
  test("cg → cg-render-spec", async () => {
    expect(await intentToSkill({ intent: intent({ kind: "cg" }) })).toBe("cg-render-spec")
  })
  test("cover → cover-spec", async () => {
    expect(await intentToSkill({ intent: intent({ kind: "cover" }) })).toBe("cover-spec")
  })
  test("shot_image → shot-image-from-mss", async () => {
    expect(await intentToSkill({ intent: intent({ kind: "shot_image" }) })).toBe("shot-image-from-mss")
  })
  test("shot_video routes through shot-image-from-mss (Phase 8 reuses the shot skill)", async () => {
    expect(await intentToSkill({ intent: intent({ kind: "shot_video" }) })).toBe("shot-image-from-mss")
  })
})

describe("intentToSkill — picker injection", () => {
  test("invokes the picker with kind/spec_md/availableSkills/promptTemplate when no hint", async () => {
    const captured: SkillPickContext[] = []
    const picker: SkillPicker = {
      async pick(ctx) {
        captured.push(ctx)
        return "scene-bg-spec"
      },
    }
    const result = await intentToSkill({
      intent: intent({ kind: "cg", spec_md: "# detailed brief" }),
      preferences: { atomic_tool_hint: "gpt-image" },
      picker,
    })
    expect(result).toBe("scene-bg-spec")
    expect(captured).toHaveLength(1)
    const ctx = captured[0]!
    expect(ctx.intent.kind).toBe("cg")
    expect(ctx.intent.spec_md).toBe("# detailed brief")
    expect(ctx.preferences?.atomic_tool_hint).toBe("gpt-image")
    expect(ctx.availableSkills).toEqual(ASSET_GENERATION_SKILLS)
    expect(typeof ctx.promptTemplate).toBe("string")
    expect(ctx.promptTemplate.length).toBeGreaterThan(0)
  })

  test("does NOT call the picker when skill_hint already wins", async () => {
    let called = 0
    const picker: SkillPicker = {
      async pick() {
        called++
        return "anything"
      },
    }
    await intentToSkill({
      intent: intent(),
      preferences: { skill_hint: "cg-render-spec" },
      picker,
    })
    expect(called).toBe(0)
  })

  test("rejects a picker output that is not in availableSkills", async () => {
    const picker: SkillPicker = {
      async pick() {
        return "totally-made-up"
      },
    }
    let err: unknown
    try {
      await intentToSkill({ intent: intent(), picker })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    // NamedError stringifies just to its name; the schema fields live on .data.
    const e = err as { data?: { code?: string; message?: string } }
    expect(e.data?.code).toBe("INTERNAL")
    expect(e.data?.message).toMatch(/skill/i)
    expect(e.data?.message).toMatch(/totally-made-up/)
  })

  test("propagates picker errors as-is", async () => {
    const picker: SkillPicker = {
      async pick() {
        throw new Error("LLM down")
      },
    }
    let err: unknown
    try {
      await intentToSkill({ intent: intent(), picker })
    } catch (e) {
      err = e
    }
    expect(String(err)).toMatch(/LLM down/)
  })
})

describe("intentToSkill — sanity asserts on internal tables", () => {
  test("DEFAULT_KIND_SKILL_MAP covers every AssetKind in the union", () => {
    // We need every kind to map to something, otherwise prod calls without a
    // hint/picker silently fall back to skills[0] which is misleading.
    const kinds: (keyof typeof DEFAULT_KIND_SKILL_MAP)[] = [
      "character_portrait",
      "scene_bg",
      "cg",
      "cover",
      "shot_image",
      "shot_video",
    ]
    for (const k of kinds) {
      const skill = DEFAULT_KIND_SKILL_MAP[k]
      expect(typeof skill).toBe("string")
      expect(ASSET_GENERATION_SKILLS.includes(skill)).toBe(true)
    }
  })

  test("ASSET_GENERATION_SKILLS lists exactly the 5 Phase 8 skill bodies", () => {
    expect([...ASSET_GENERATION_SKILLS].sort()).toEqual(
      [
        "character-portrait-spec",
        "scene-bg-spec",
        "cg-render-spec",
        "cover-spec",
        "shot-image-from-mss",
      ].sort(),
    )
  })
})
