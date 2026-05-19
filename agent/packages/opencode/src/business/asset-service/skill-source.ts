// skill-source — shared primitives for asset-generation skill bodies.
//
// Extracted from llm-generator.ts so the SAME allowlist parser + local
// body reader are reused by:
//   1. the Phase-14 mini agent loop (llm-generator.ts re-exports these),
//   2. the Langfuse-backed loader (langfuse-skill-loader.ts), and
//   3. the `skills sync asset-generation` promote gate (D5) — the gate
//      MUST validate with the EXACT parser the loop runs, never a fork.
//
// This module is a leaf: it imports nothing from llm-generator (no Tool /
// ai-SDK graph), so the skill CLI can pull `parseAllowlist` without
// dragging in the whole atomic-tool registry.

import * as fs from "fs"
import * as path from "path"

// ---------- canonical atomic-tool id list ----------
//
// The single source of truth for "which atomic tools exist". llm-generator
// builds its ATOMIC_TOOLS effect map keyed by exactly these ids (and
// asserts the keys match at module load — see llm-generator.ts). The
// allowlist parser validates every token against this set so a skill body
// can only ever expose tools that actually exist.
export const ATOMIC_TOOL_IDS = [
  "generate-image-nanobanana",
  "generate-image-gpt",
  "generate-video-seedance",
  "generate-sfx-elevenlabs",
  "generate-music-suno",
  "concat-clips",
  "crop-video",
  "generate-video-happyhorse",
  "cg-render",
  "nrbi-render-prompt",
  "upscale-image",
  "oss-put",
  "matting",
  "hybrid-to-webp",
  "green-spill-clear",
  "rgb-unspill",
  "hole-fill",
  "cutout",
] as const

export type AtomicToolId = (typeof ATOMIC_TOOL_IDS)[number]

export const KNOWN_TOOL_IDS: ReadonlySet<string> = new Set<string>(ATOMIC_TOOL_IDS)

// ---------- loaded skill shape ----------

export interface LoadedSkill {
  body: string
  allowlist: string[]
}

// Distinguishes "the skill spec is infeasible / missing" (→ GENERATION_REJECTED,
// not a 500) from genuine internal/tool failures.
export class SkillInfeasibleError extends Error {
  readonly _tag = "SkillInfeasibleError"
}

// ---------- allowlist parser ----------

/**
 * Parse the `## Atomic tools (allowed)` section of a skill body and return
 * every kebab-case token that exactly matches a known atomic-tool id.
 * Case-insensitive on the heading; collection stops at the next `##`.
 *
 * Behaviour is byte-for-byte the historical llm-generator implementation
 * (moved here, not rewritten) so the loop, the Langfuse loader, and the
 * promote gate can never disagree about what an allowlist parses to.
 */
export function parseAllowlist(body: string): string[] {
  const lines = body.split(/\r?\n/)
  // 0 = not in the section; otherwise the markdown heading level (2-6)
  // at which the "Atomic tools (allowed)" section was opened.
  let sectionLevel = 0
  const found = new Set<string>()
  for (const line of lines) {
    const heading = /^(#{2,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const title = heading[2].trim().toLowerCase()
      if (sectionLevel > 0) {
        // A heading at the section's level or shallower ends it; a
        // deeper sub-heading stays *inside* the section so a skill
        // body can structure its allowlist with sub-sections.
        if (level <= sectionLevel) break
        continue
      }
      if (title.startsWith("atomic tools")) sectionLevel = level
      continue
    }
    if (sectionLevel === 0) continue
    // Collect every backtick-wrapped token AND bare kebab tokens; only
    // those exactly equal to a known tool id survive.
    for (const m of line.matchAll(/[`"]?([a-z0-9]+(?:-[a-z0-9]+)*)[`"]?/g)) {
      const token = m[1]
      if (KNOWN_TOOL_IDS.has(token)) found.add(token)
    }
  }
  return [...found]
}

// ---------- local body source (git canonical + offline fallback) ----------

// skill-source.ts lives at src/business/asset-service/ — the same 6-up
// depth llm-generator.ts (and cg-render.ts:95) use to reach the repo root
// (/home/user/assets-produce). Resolve identically so the knowledge dir
// is found regardless of cwd.
export const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")

/** Absolute path of a skill's git-canonical body file. */
export function localSkillBodyPath(skill: string): string {
  return path.join(REPO_ROOT, "knowledge", "asset-generation", `${skill}.md`)
}

/**
 * Read a skill's local body. Throws SkillInfeasibleError when the file is
 * absent so callers map it to GENERATION_REJECTED (not a crash).
 */
export async function readLocalSkillBody(skill: string): Promise<string> {
  const file = localSkillBodyPath(skill)
  try {
    return await fs.promises.readFile(file, "utf8")
  } catch {
    throw new SkillInfeasibleError(`skill body not found for "${skill}" (${file})`)
  }
}

/**
 * Local loader: read git-canonical body + parse its allowlist. Empty
 * allowlist → SkillInfeasibleError (a body with no usable atomic tool is
 * not generatable). This is the historical `defaultLoadSkill` behaviour
 * and the never-fail fallback the Langfuse loader degrades to.
 */
export async function loadLocalSkill(skill: string): Promise<LoadedSkill> {
  const body = await readLocalSkillBody(skill)
  const allowlist = parseAllowlist(body)
  if (allowlist.length === 0) {
    throw new SkillInfeasibleError(
      `skill "${skill}" declares no usable atomic tools in its "Atomic tools (allowed)" section`,
    )
  }
  return { body, allowlist }
}
