import { test, expect } from "bun:test"
import { mkdtempSync, existsSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { AUTHORING_STAGE_DIRS, ensureNovelWorkspace } from "../../src/business/novel/workspace"

test("AUTHORING_STAGE_DIRS is the frozen n2m authoring contract", () => {
  expect(AUTHORING_STAGE_DIRS).toEqual([
    "01-novel-evaluator",
    "02-character-architect",
    "03-entity-planner",
    "04-entity-normalizer",
    "04.5-entity-rename",
    "05-episode-writer/scripts",
  ])
})

test("ensureNovelWorkspace creates the n2m-compatible skeleton idempotently", () => {
  const root = mkdtempSync(path.join(tmpdir(), "c1-ws-"))
  try {
    const ws = ensureNovelWorkspace(root, "no-rules-in-bad-ideas")
    const base = path.join(root, "lunascripts", "no-rules-in-bad-ideas")
    expect(ws.base).toBe(base)
    for (const d of AUTHORING_STAGE_DIRS) expect(existsSync(path.join(base, d))).toBe(true)
    expect(existsSync(path.join(base, "skills", "arc-reviewer"))).toBe(true)
    expect(ws.stage("05-episode-writer/scripts")).toBe(path.join(base, "05-episode-writer/scripts"))
    expect(ensureNovelWorkspace(root, "no-rules-in-bad-ideas").base).toBe(base)
    expect(() => ensureNovelWorkspace(root, "../evil")).toThrow()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
