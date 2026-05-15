// intent-to-skill — pick which skill body the mini agent loop should run.
//
// Three resolution tiers, in order:
// 1. preferences.skill_hint matches a known skill → use it (caller win)
// 2. injected picker (LLM-backed in prod, stub in tests) → use its output,
//    rejected if not in availableSkills (defensive against hallucinations)
// 3. deterministic kind→skill table (DEFAULT_KIND_SKILL_MAP)
//
// Skill registry stays a local constant for Phase 8 — Phase 6's Skill DB is
// for creator-profile skills, the 5 Asset Service bodies are system-profile
// and lookup happens by name only.

import { AssetServiceError } from "./errors"
import type { AssetIntent, AssetKind, AssetPreferences } from "./types"

export const ASSET_GENERATION_SKILLS = [
  "character-portrait-spec",
  "scene-bg-spec",
  "cg-render-spec",
  "cover-spec",
  "shot-image-from-mss",
  "sfx-spec",
] as const

export type AssetGenerationSkill = (typeof ASSET_GENERATION_SKILLS)[number]

// Default kind → skill mapping. Every AssetKind must have an entry so the
// no-hint / no-picker path stays deterministic. shot_video reuses the
// shot-image skill in Phase 8 (skill body decides whether to call a video
// atomic tool); video-only skill body is a follow-up.
export const DEFAULT_KIND_SKILL_MAP: Record<AssetKind, AssetGenerationSkill> = {
  character_portrait: "character-portrait-spec",
  scene_bg: "scene-bg-spec",
  cg: "cg-render-spec",
  cover: "cover-spec",
  shot_image: "shot-image-from-mss",
  shot_video: "shot-image-from-mss",
  sfx: "sfx-spec",
}

// Prompt template passed to the picker so its output stays in vocabulary.
// `${...}` placeholders are filled by the picker implementation itself, not
// by this module — we just hand it the canonical text.
export const SKILL_PICK_PROMPT = `You are routing an asset_intent to one of N skill bodies.
Choose exactly one skill name from the provided list — do not invent names.

Inputs:
- intent.kind: the fine-grained asset sub-type
- intent.spec_md: free-form brief (markdown)
- intent.constraints: ratio / duration / background_kind
- preferences.atomic_tool_hint: non-binding hint about preferred atomic tool

Output: a single skill name, no quotes, no surrounding text.
Available skills: \${availableSkills}.

intent.kind: \${kind}
intent.spec_md:
\${spec_md}
preferences: \${preferences_json}`

export interface SkillPickContext {
  intent: AssetIntent
  preferences?: AssetPreferences
  availableSkills: readonly string[]
  promptTemplate: string
}

export interface SkillPicker {
  pick(ctx: SkillPickContext): Promise<string>
}

export interface IntentToSkillInput {
  intent: AssetIntent
  preferences?: AssetPreferences
  picker?: SkillPicker
  availableSkills?: readonly string[]
}

export async function intentToSkill(input: IntentToSkillInput): Promise<string> {
  const skills = input.availableSkills ?? ASSET_GENERATION_SKILLS
  const skillSet = new Set<string>(skills)

  // Tier 1 — explicit hint wins if it's a known skill.
  const hint = input.preferences?.skill_hint
  if (hint && skillSet.has(hint)) return hint

  // Tier 2 — injected picker.
  if (input.picker) {
    const picked = await input.picker.pick({
      intent: input.intent,
      preferences: input.preferences,
      availableSkills: skills,
      promptTemplate: SKILL_PICK_PROMPT,
    })
    if (!skillSet.has(picked)) {
      throw new AssetServiceError({
        code: "INTERNAL",
        op: "intent-to-skill.pick",
        message: `picker returned skill "${picked}" not in availableSkills`,
        detail: { picked, availableSkills: skills },
      })
    }
    return picked
  }

  // Tier 3 — kind table fallback.
  const fromKind = DEFAULT_KIND_SKILL_MAP[input.intent.kind]
  if (fromKind && skillSet.has(fromKind)) return fromKind

  // Final fallback — first available. We never want to throw on the no-hint
  // happy path, so picking anything sane is preferred to failing.
  return skills[0]!
}
