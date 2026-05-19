import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { readFileSync } from "fs"
import path from "path"
import { Skill } from "../../src/skill"
import { AUTHORING_STAGE_DIRS } from "../../src/business/novel/workspace"
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

// ── STRUCTURAL CONTRACT GUARD (C2 Task 3) ──────────────────────────────────
//
// Proves the orchestration KNOWLEDGE body encodes the full stage + gate
// contract correctly. Reads the body RAW off disk (same REPO resolution as
// the discovery guard above) — this is documentation, not code, so we assert
// on its text, not on a parser. The helpers below are TEST-ONLY (they MUST
// NOT live in src/ — project red line forbids production orchestration /
// gate-parser code; the body itself says the driving agent owns the loop and
// there is no orchestration service).
//
// Non-vacuity: every content assertion is scoped to the specific `## `
// section it belongs to (not a whole-file grep), and the FAIL-cell check
// splits each Gate-contract table row into pipe-delimited cells and isolates
// the FAIL cell — exactly honoring the body's explicit parser-contract note
// ("split each row into pipe-delimited cells and classify per-cell — never
// whole-row grep, because the PASS cell ('advance') and the FAIL cell
// ('halt') share one physical Markdown table line"). A body that advanced on
// FAIL, lost a heading, dropped a reviewer name, or omitted a stage dir would
// fail this test.

const BODY_PATH = path.join(REPO, "knowledge", "novel-to-mss", "novel_to_mss", "SKILL.md")

/** Split the body into `## `-delimited sections. Key = the exact heading text
 *  after `## ` (trimmed); value = the section's body text up to the next
 *  `## ` (or EOF). The pre-`## ` preamble is intentionally dropped — every
 *  asserted fact lives inside a `## ` section. TEST-ONLY. */
function parseSections(body: string): Map<string, string> {
  const sections = new Map<string, string>()
  const lines = body.split("\n")
  let heading: string | null = null
  let buf: string[] = []
  const flush = () => {
    if (heading !== null) sections.set(heading, buf.join("\n"))
  }
  for (const line of lines) {
    // A section heading is exactly `## X` (level-2), not `### X` (level-3).
    const m = /^## (?!#)(.+?)\s*$/.exec(line)
    if (m) {
      flush()
      heading = m[1]!.trim()
      buf = []
    } else if (heading !== null) {
      buf.push(line)
    }
  }
  flush()
  return sections
}

/** Split one Markdown table row into its logical cells (the text between the
 *  outer pipes), trimmed. Honors the body's parser-contract note: callers
 *  classify a row PER-CELL via this, never by grepping the whole row. The
 *  leading/trailing empty fragments from `| a | b |`.split("|") are dropped.
 *  TEST-ONLY. */
function rowCells(row: string): string[] {
  const parts = row.split("|")
  // First and last fragments are empty for a well-formed `| ... |` row.
  return parts.slice(1, parts.length - 1).map((c) => c.trim())
}

/** The Gate-contract data rows: lines inside the `## Gate contract` section
 *  that look like a pipe table row but are NOT the header / `|---|` divider /
 *  the per-reviewer normalization sub-table (which lives under a `### `
 *  sub-heading). We stop at the first `### ` so the normalization table and
 *  prose can't leak in. TEST-ONLY. */
function gateContractDataRows(gateSection: string): string[][] {
  const rows: string[][] = []
  for (const raw of gateSection.split("\n")) {
    const line = raw.trim()
    if (line.startsWith("### ")) break // stop before `### Verdict semantics` etc.
    if (!line.startsWith("|")) continue
    if (/^\|\s*-+/.test(line)) continue // |---|---| divider
    const cells = rowCells(line)
    // The header row's stage cell is the literal word "stage"; data rows
    // start with a stage number/label (2, 3, 4.5 (optional), 5).
    if (cells[0]?.toLowerCase() === "stage") continue
    rows.push(cells)
  }
  return rows
}

const REQUIRED_SECTIONS = [
  "Stage DAG",
  "Gate contract",
  "Reviewer dispatch",
  "Workspace writes",
  "Per-route fan-out",
  "Halt & surface",
] as const

// Authoritative gated-stage → reviewer-skill mapping (the literal kebab-case
// skill names). Stage 5 has two reviewers (per-episode + arc).
const GATED_STAGES: ReadonlyArray<{ stage: string; reviewers: string[] }> = [
  { stage: "2", reviewers: ["bible-reviewer"] },
  { stage: "3", reviewers: ["planner-reviewer"] },
  { stage: "4.5", reviewers: ["rename-reviewer"] },
  { stage: "5", reviewers: ["episode-writer-reviewer", "arc-reviewer"] },
]

describe("novel_to_mss body encodes the full stage + gate contract", () => {
  const body = readFileSync(BODY_PATH, "utf8")
  const sections = parseSections(body)

  test("all 6 required `## ` sections are present (exact headings)", () => {
    for (const h of REQUIRED_SECTIONS) {
      expect(sections.has(h), `missing required section: ## ${h}`).toBe(true)
      expect((sections.get(h) ?? "").trim().length, `section ## ${h} is empty`).toBeGreaterThan(0)
    }
    // Exactly the 6 expected level-2 headings — no stray/renamed sections.
    expect([...sections.keys()].sort()).toEqual([...REQUIRED_SECTIONS].sort())
  })

  test("Gate contract names every gated stage with its correct reviewer skill(s)", () => {
    const gate = sections.get("Gate contract")!
    const rows = gateContractDataRows(gate)
    // Exactly the four gated stages: 2, 3, 4.5, 5 (no more, no fewer).
    expect(rows.length, `expected 4 gated-stage rows, got ${rows.length}`).toBe(4)

    for (const { stage, reviewers } of GATED_STAGES) {
      const row = rows.find((cells) => cells[0]!.startsWith(stage))
      expect(row, `Gate contract has no row for stage ${stage}`).toBeDefined()
      // Reviewer-skill column is cell index 2 (0=stage, 1=producer, 2=reviewer).
      const reviewerCell = row![2]!
      for (const r of reviewers) {
        expect(
          reviewerCell.includes(`\`${r}\``),
          `stage ${stage} reviewer cell ${JSON.stringify(reviewerCell)} must reference \`${r}\``,
        ).toBe(true)
      }
    }
  })

  test("Gate contract maps FAIL→halt/surface, CONDITIONAL→fix+same-reviewer loop, PASS→advance (per-cell)", () => {
    const gate = sections.get("Gate contract")!
    const rows = gateContractDataRows(gate)
    expect(rows.length).toBe(4)

    for (const cells of rows) {
      // Isolate each verdict cell by its own `<TOKEN>:` prefix — this is the
      // per-cell classification the body's parser-contract note mandates.
      const passCell = cells.find((c) => c.startsWith("PASS:"))
      const condCell = cells.find((c) => c.startsWith("CONDITIONAL:"))
      const failCell = cells.find((c) => c.startsWith("FAIL:"))
      const stage = cells[0]
      expect(passCell, `stage ${stage}: no PASS: cell`).toBeDefined()
      expect(condCell, `stage ${stage}: no CONDITIONAL: cell`).toBeDefined()
      expect(failCell, `stage ${stage}: no FAIL: cell`).toBeDefined()

      // PASS → advance.
      expect(passCell!.toLowerCase(), `stage ${stage} PASS cell must say "advance"`).toContain("advance")

      // CONDITIONAL → producer fixes + SAME reviewer re-review loop.
      const cond = condCell!.toLowerCase()
      expect(cond, `stage ${stage} CONDITIONAL cell must mention producer fixes`).toContain("fix")
      expect(cond, `stage ${stage} CONDITIONAL cell must name the SAME reviewer`).toContain("same reviewer")
      expect(cond, `stage ${stage} CONDITIONAL cell must describe a re-review loop`).toContain("re-review")
      expect(cond, `stage ${stage} CONDITIONAL cell must describe a loop`).toContain("loop")

      // FAIL → halt + surface, and crucially NOT "advance"/"next stage"
      // (the whole reason the body forbids whole-row grep: PASS on the same
      // physical line contains "advance"/"next stage").
      const fail = failCell!.toLowerCase()
      expect(fail, `stage ${stage} FAIL cell must halt`).toContain("halt")
      expect(fail, `stage ${stage} FAIL cell must surface the report`).toContain("surface")
      expect(fail.includes("advance"), `stage ${stage} FAIL cell must NOT contain "advance"`).toBe(false)
      expect(fail.includes("next stage"), `stage ${stage} FAIL cell must NOT contain "next stage"`).toBe(false)
    }
  })

  test("Stage DAG documents stage-1 novel-evaluator self-gate tokens and the optional 4.5 branch", () => {
    const dag = sections.get("Stage DAG")!
    // Stage 1 self-gate reviewer-less, with its REAL tokens GO/CONDITIONAL/NO-GO.
    expect(dag).toContain("novel-evaluator")
    expect(dag).toContain("GO")
    expect(dag).toContain("CONDITIONAL")
    expect(dag).toContain("NO-GO")
    // The 4.5 entity-rename branch is documented AND marked optional.
    expect(dag).toContain("entity-rename")
    expect(dag.toUpperCase(), "stage 4.5 must be marked OPTIONAL in Stage DAG").toContain("OPTIONAL")
  })

  test("Workspace writes contains every AUTHORING_STAGE_DIRS dir verbatim", () => {
    const ws = sections.get("Workspace writes")!
    // Imported from src — not hardcoded — so the body stays pinned to the
    // single C1 source of truth for the downstream-compat dir surface.
    for (const dir of AUTHORING_STAGE_DIRS) {
      expect(ws.includes(dir), `Workspace writes must contain dir literal ${JSON.stringify(dir)}`).toBe(true)
    }
    expect(AUTHORING_STAGE_DIRS.length).toBe(6)
  })
})
