import { mkdirSync } from "fs"
import path from "path"

/** n2m authoring-stage on-disk contract (verbatim from the demo book; the
 *  downstream-compat surface — do not reorder/rename). Post-LS stages
 *  (02.5/05.5/06/ls-build) are intentionally excluded: out of C-track scope. */
export const AUTHORING_STAGE_DIRS = [
  "01-novel-evaluator",
  "02-character-architect",
  "03-entity-planner",
  "04-entity-normalizer",
  "04.5-entity-rename",
  "05-episode-writer/scripts",
] as const

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export interface NovelWorkspace {
  readonly base: string
  readonly stage: (name: (typeof AUTHORING_STAGE_DIRS)[number]) => string
}

export function ensureNovelWorkspace(root: string, slug: string): NovelWorkspace {
  if (!SLUG_RE.test(slug)) throw new Error(`invalid book slug: ${JSON.stringify(slug)}`)
  const base = path.join(root, "lunascripts", slug)
  for (const d of AUTHORING_STAGE_DIRS) mkdirSync(path.join(base, d), { recursive: true })
  mkdirSync(path.join(base, "skills", "arc-reviewer"), { recursive: true })
  return { base, stage: (name) => path.join(base, name) }
}
