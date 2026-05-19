import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import { Skill } from "../../src/skill"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Repo/worktree root — three packages up from test/skill (packages/opencode),
// then up out of agent/. Matches the path skills.paths resolves against at
// runtime (Instance.directory), since opencode.jsonc declares the relative
// "knowledge/novel-to-mss" entry resolved against the project directory.
const REPO = path.resolve(import.meta.dir, "../../../../..")

const EXPECTED = [
  "novel-evaluator",
  "character-architect",
  "bible-reviewer",
  "entity-planner",
  "planner-reviewer",
  "entity-normalizer",
  "entity-rename",
  "rename-reviewer",
  "episode-writer",
  "episode-writer-reviewer",
  "arc-reviewer",
]

const node = CrossSpawnSpawner.defaultLayer
const it = testEffect(Layer.mergeAll(Skill.defaultLayer, node))

describe("novel-to-mss corpus discovery", () => {
  // Points the runtime Instance.directory at the real repo root so this
  // exercises REAL discoverSkills: it loads the real repo-root opencode.jsonc
  // (via the ConfigPaths up-walk), reads skills.paths, resolves
  // "knowledge/novel-to-mss" against Instance.directory, and scans the
  // on-disk frozen SKILL.md files. No stubbing of discovery or the filesystem.
  it.live("opencode discovery sees all 11 novel-to-mss skills, filesystem-served", () =>
    Effect.gen(function* () {
      const svc = yield* Skill.Service
      const list = yield* svc.all()
      const byName = new Map(list.map((s) => [s.name, s]))

      for (const name of EXPECTED) {
        const info = byName.get(name)
        expect(info, `discovery missing skill: ${name}`).toBeTruthy()
        expect(String(info!.location).startsWith("langfuse://")).toBe(false)
        expect(String(info!.location)).toContain(path.join("knowledge", "novel-to-mss", name))
        expect(typeof info!.content).toBe("string")
        expect(info!.content.length).toBeGreaterThan(0)
      }
    }).pipe(provideInstance(REPO)),
  )
})
