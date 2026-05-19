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
// (Identical resolution to novel-to-mss-discovery.test.ts.)
const REPO = path.resolve(import.meta.dir, "../../../../..")

const SKILL = "novel_to_mss"

const node = CrossSpawnSpawner.defaultLayer
const it = testEffect(Layer.mergeAll(Skill.defaultLayer, node))

// STANDING DISCOVERY GUARD — NOT a TDD red-first case.
//
// C2 Task 1 already committed the orchestration body
// (knowledge/novel-to-mss/novel_to_mss/SKILL.md, commits 4e9d33e + c1714c5),
// so this test PASSES immediately. Per the C2 plan that is explicitly
// acceptable: this is a regression guard that the 12th (orchestration) skill
// stays discoverable via opencode's real filesystem discovery and stays
// filesystem-served (NOT langfuse://), mirroring C1's corpus-discovery guard.
//
// Single-occurrence assertion rationale: discoverSkills' add() keys skills by
// frontmatter name (src/skill/index.ts) — a duplicate name logs a
// "duplicate skill name" warning and then OVERWRITES the same map key, and
// merged() returns a Map keyed by name. So svc.all() can structurally never
// contain two entries with the same name; the only faithful proxy reachable
// from Skill.Service is asserting exactly one occurrence. That occurrence
// count would be 0 (failing) if discovery did not see the skill, which is
// what makes this guard non-vacuous.
describe("novel_to_mss orchestration skill discovery", () => {
  // Points the runtime Instance.directory at the real repo root so this
  // exercises REAL discoverSkills: it loads the real repo-root opencode.jsonc
  // (via the ConfigPaths up-walk), reads skills.paths, resolves
  // "knowledge/novel-to-mss" against Instance.directory, and scans the
  // on-disk SKILL.md files. No stubbing of discovery or the filesystem.
  it.live("opencode discovery sees the novel_to_mss orchestration skill, filesystem-served", () =>
    Effect.gen(function* () {
      const svc = yield* Skill.Service
      const list = yield* svc.all()

      const matches = list.filter((s) => s.name === SKILL)
      // Discovered exactly once: >1 is structurally impossible (Map dedup),
      // 0 would mean discovery failed to see the orchestration body.
      expect(matches.length, `expected exactly one ${SKILL} skill, got ${matches.length}`).toBe(1)

      const info = matches[0]!
      expect(info.location.startsWith("langfuse://")).toBe(false)
      expect(info.location).toContain(path.join("knowledge", "novel-to-mss", "novel_to_mss"))
      expect(info.content.length).toBeGreaterThan(0)
    }).pipe(provideInstance(REPO)),
  )
})
