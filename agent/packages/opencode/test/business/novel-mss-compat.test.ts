/**
 * Task 6 — downstream-compat golden parity test
 *
 * (a) Workspace NN-stage parity: AUTHORING_STAGE_DIRS must exactly match
 *     the n2m demo-book authoring stage dirs (recorded constant; n2m absent
 *     in CI — C1 precedent).
 *
 * (b) Golden input-contract: for each committed mss-golden fixture, invoking
 *     mss-validate in hermetic mock mode (--mock, no Go) must yield a
 *     well-formed MssValidateResult. Real-validator verdict is deferred to
 *     Task-7 acceptance (Go-absent-in-CI).
 */

import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Truncate } from "@/tool/truncate"
import { makeMssValidateTool, MssValidateResult } from "@/tool/asset/mss-validate"
import type { Tool } from "@/tool/tool"
import { MessageID, SessionID } from "@/session/schema"
import { AUTHORING_STAGE_DIRS, ensureNovelWorkspace } from "../../src/business/novel/workspace"

// ─── Frozen n2m reference constant (workspace NN-stage parity) ────────────────
//
// Recorded from the n2m authoring subset of `moonscripts/no-rules-in-bad-ideas/`
// at HEAD sha 8049ac772f7350ea593519fbeb891ccaee488c9c — downstream music/sfx/asset
// stages (`05.5-music-normalizer`, `05.5c-sfx-normalizer`, `06-asset-prompt-generator`)
// and asset-side `02.5-outfit-anchor` are excluded per C-track scope; `05-episode-writer`
// is narrowed to its `scripts/` .mss output dir. See workspace.ts:4-6 for the rationale.
// n2m is absent in CI — this constant is the recorded equivalent (C1 precedent).
// Do NOT read the n2m repo at test time.
const N2M_DEMO_BOOK_AUTHORING_STAGE_DIRS = [
  "01-novel-evaluator",
  "02-character-architect",
  "03-entity-planner",
  "04-entity-normalizer",
  "04.5-entity-rename",
  "05-episode-writer/scripts",
] as const

// ─── Golden fixture paths (committed copies, never read n2m at runtime) ────────
const GOLDEN_DIR = path.resolve(
  import.meta.dirname,
  "../fixture/novel-to-mss/mss-golden",
)
const GOLDEN_FILES = [
  "ep_10_weston_final.md",
  "ep_10_diego_final.md",
  "ep_11_luca_final.md",
] as const

// ─── Effect runtime (mirrors mss-validate.test.ts) ────────────────────────────
const runtime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

const ctx = (): Tool.Context => ({
  sessionID: SessionID.descending(),
  messageID: MessageID.ascending(),
  abort: new AbortController().signal,
  callID: "call_test",
  agent: "build",
  messages: [],
  metadata() {
    return Effect.void
  },
  ask() {
    return Effect.void
  },
})

// ─── (a) Workspace NN-stage parity ────────────────────────────────────────────

describe("novel workspace NN-stage parity", () => {
  test("AUTHORING_STAGE_DIRS verbatim-matches n2m demo-book stage dirs", () => {
    // Must be element-for-element equal, in the same order.
    expect(AUTHORING_STAGE_DIRS).toEqual(N2M_DEMO_BOOK_AUTHORING_STAGE_DIRS)
    // Belt-and-suspenders: every element must be a string-equal match.
    for (let i = 0; i < N2M_DEMO_BOOK_AUTHORING_STAGE_DIRS.length; i++) {
      expect(AUTHORING_STAGE_DIRS[i]).toBe(N2M_DEMO_BOOK_AUTHORING_STAGE_DIRS[i])
    }
  })

  test("ensureNovelWorkspace materializes all stage dirs + skills/arc-reviewer", () => {
    const root = mkdtempSync(path.join(tmpdir(), "c3-compat-"))
    try {
      const ws = ensureNovelWorkspace(root, "demo-book")
      const base = path.join(root, "moonscripts", "demo-book")
      expect(ws.base).toBe(base)
      // All AUTHORING_STAGE_DIRS must exist (imported — never hardcoded)
      for (const d of AUTHORING_STAGE_DIRS) {
        expect(existsSync(path.join(base, d))).toBe(true)
      }
      // skills/arc-reviewer must also be materialized
      expect(existsSync(path.join(base, "skills", "arc-reviewer"))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ─── (b) Golden input-contract ─────────────────────────────────────────────────

describe("mss-golden input-contract (hermetic mock mode)", () => {
  for (const filename of GOLDEN_FILES) {
    const fixturePath = path.join(GOLDEN_DIR, filename)

    test(`${filename} — fixture exists and is non-empty`, () => {
      expect(existsSync(fixturePath)).toBe(true)
      const { statSync } = require("fs")
      const stat = statSync(fixturePath)
      expect(stat.size).toBeGreaterThan(0)
    })

    test(`${filename} — mss-validate mock mode yields well-formed MssValidateResult`, async () => {
      // Use the real bridge in hermetic --mock mode (no Go required, CI-safe).
      // C1 precedent: real-validator verdict deferred to Task-7 (Go-absent-in-CI).
      // We assert only: tool returns a MssValidateResult that decodes against the schema.
      const info = await runtime.runPromise(makeMssValidateTool())
      const def = await Effect.runPromise(info.init())

      const out = await runtime.runPromise(
        def.execute(
          {
            script_path: fixturePath,
            mock: true,
          },
          ctx(),
        ),
      )

      // The tool must not have errored at the operational level.
      const meta = out.metadata as Record<string, unknown>
      expect(meta.error).toBeFalsy()

      // The output must be a well-formed MssValidateResult JSON string.
      const parsed: unknown = JSON.parse(out.output)
      const exit = Effect.runSyncExit(Schema.decodeUnknownEffect(MssValidateResult)(parsed))
      expect(exit._tag).toBe("Success")

      if (exit._tag === "Success") {
        // verdict must be one of the two legal values
        expect(["PASS", "FAIL"]).toContain(exit.value.verdict)
        // errors must be an array
        expect(Array.isArray(exit.value.errors)).toBe(true)
        // Do NOT assert a specific verdict — real validation is Task-7.
      }
    })
  }
})
