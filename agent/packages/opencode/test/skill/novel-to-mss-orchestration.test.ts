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
 *  asserted fact lives inside a `## ` section. TEST-ONLY.
 *
 *  ASSUMPTION: no `## `-prefixed line ever appears inside a fenced code block
 *  (```), which holds for the current body by construction (its only fenced
 *  block — the Stage DAG diagram — contains no `## ` lines). This is a line
 *  scanner, not a Markdown parser (fence-tracking logic would be YAGNI and
 *  risks the no-production-parser red line). If a future body edit ever puts
 *  a `## ` line inside a code fence, the `.toEqual` section-set assertion
 *  below will fail — read THIS note rather than the misleading
 *  "stray/renamed section" message. */
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

// LOCK-STEP NOTE (C3 Task 5): the section-set assertion below pins the body's
// `## ` headings by EXACT equality (`.toEqual`). C3 Task 5 additively wires the
// registered `mss-validate` tool as the post-stage-5 `.mss` quality gate, which
// requires its own `## .mss quality gate` section. Adding that heading to the
// body without adding it here would make the exact-equality assertion fail, so
// this single entry is appended in lock-step with that additive body edit —
// nothing else in this list is reordered or removed. The dedicated
// `## .mss quality gate` content guard (its own describe block further down)
// is the actual new TDD assertion for the wired gate.
const REQUIRED_SECTIONS = [
  "Stage DAG",
  "Gate contract",
  "Reviewer dispatch",
  "Workspace writes",
  "Per-route fan-out",
  "Halt & surface",
  ".mss quality gate",
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

  test("all required `## ` sections are present (exact headings)", () => {
    for (const h of REQUIRED_SECTIONS) {
      expect(sections.has(h), `missing required section: ## ${h}`).toBe(true)
      expect((sections.get(h) ?? "").trim().length, `section ## ${h} is empty`).toBeGreaterThan(0)
    }
    // Exactly the expected level-2 headings — no stray/renamed sections.
    // (REQUIRED_SECTIONS is the single source of truth for the count; it grew
    // by one in lock-step with C3 Task 5's additive `## .mss quality gate`.)
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

// ── .mss QUALITY GATE WIRING GUARD (C3 Task 5) ─────────────────────────────
//
// C3 froze the upstream MSS validator as the registered atomic tool
// `mss-validate` (tool id "mss-validate"; returns {verdict:"PASS"|"FAIL",
// errors, raw?, meta}; a `verdict:"FAIL"` is a successful judgement that the
// script is invalid, NOT a tool error). Task 5 wires that tool into THIS
// orchestration body as the post-stage-5 per-episode `.mss` quality gate,
// ADDITIVELY (its own `## .mss quality gate` section) so no prior C2 invariant
// breaks. This guard pins the wired contract the body must encode:
//
//   - the section names the registered `mss-validate` tool by id;
//   - it is positioned as the gate AFTER stage-5 `episode-writer` writes
//     `05-episode-writer/scripts/<ep>.mss`;
//   - `verdict:"PASS"` is required before an episode/route may be declared
//     FINAL; a non-PASS verdict (FAIL, or a tool `metadata.error`) drives a
//     producer-fix loop with the SAME shape as a reviewer CONDITIONAL and
//     BLOCKS FINAL until PASS;
//   - it cites the C1-frozen `episode-writer` SKILL's hard gate
//     (「每集 FINAL 之前必须 `mss compile` exit 0」) as the upstream source
//     authority this gate enforces;
//   - it stays KNOWLEDGE: it directs use of the already-registered
//     `mss-validate` tool and introduces no code / engine / service.
//
// Non-vacuity: every assertion is scoped to the `## .mss quality gate` section
// (via the same TEST-ONLY parseSections) — not a whole-file grep. A body that
// omitted the section, failed to name the tool, let a non-PASS verdict reach
// FINAL, or dropped the frozen-source citation would fail here. The
// pre-existing C2 assertions remain unchanged and green; the only lock-step
// edit was appending ".mss quality gate" to REQUIRED_SECTIONS (documented at
// its definition), because the C2 section-set assertion pins headings by exact
// `.toEqual` equality and would otherwise reject the additive section.

describe("novel_to_mss body wires mss-validate as the post-episode .mss quality gate (C3 Task 5)", () => {
  const body = readFileSync(BODY_PATH, "utf8")
  const sections = parseSections(body)

  test("a dedicated `## .mss quality gate` section exists and is non-empty", () => {
    expect(sections.has(".mss quality gate"), "body must add a `## .mss quality gate` section").toBe(true)
    expect(
      (sections.get(".mss quality gate") ?? "").trim().length,
      "`## .mss quality gate` section must not be empty",
    ).toBeGreaterThan(0)
  })

  test("the section names the registered `mss-validate` tool as the post-stage-5 `.mss` gate", () => {
    const gate = sections.get(".mss quality gate")!
    // Names the registered atomic tool by its exact id.
    expect(gate, "must reference the registered `mss-validate` tool by id").toContain("`mss-validate`")
    // Anchored to stage-5 episode-writer's produced `.mss` under the C1 dir.
    expect(gate, "must tie the gate to stage-5 episode-writer").toContain("episode-writer")
    expect(
      gate.includes("05-episode-writer/scripts"),
      "must anchor the gate to the C1 `05-episode-writer/scripts` output dir",
    ).toBe(true)
    expect(gate.toLowerCase(), "must talk about the produced episode `.mss`").toContain(".mss")
  })

  test("PASS is mandatory before FINAL; a non-PASS verdict drives a CONDITIONAL-shaped fix loop that blocks FINAL", () => {
    const gate = sections.get(".mss quality gate")!
    const g = gate.toLowerCase()
    // PASS verdict is the advance condition (verbatim tool verdict value).
    expect(gate, "must require the tool's `verdict:\"PASS\"`").toContain('verdict:"PASS"')
    // A non-PASS verdict: FAIL, or a tool metadata.error, both handled.
    expect(gate, "must handle the tool's `verdict:\"FAIL\"`").toContain('verdict:"FAIL"')
    expect(g, "must also treat a tool metadata.error as non-PASS").toContain("metadata.error")
    // Same shape as a reviewer CONDITIONAL: producer fixes + re-run + loop.
    expect(g, "non-PASS must be treated like a reviewer CONDITIONAL").toContain("conditional")
    expect(g, "non-PASS must trigger a producer fix").toContain("fix")
    expect(g, "the fixed script must be re-validated").toContain("re-run")
    expect(g, "the fix cycle must loop until PASS").toContain("loop")
    // FINAL is blocked until PASS — this is the whole point of the gate.
    expect(g, "the section must talk about FINAL").toContain("final")
    // Collapse whitespace (incl. newlines) + strip markdown emphasis so the
    // semantic check is robust to prose reflow, not brittle on exact wording.
    const flat = g.replace(/[*`]/g, "").replace(/\s+/g, " ")
    expect(
      /must not be declared final/.test(flat) || /final is blocked/.test(flat) || /blocks? final/.test(flat),
      "a non-PASS verdict must block the episode/route from being declared FINAL",
    ).toBe(true)
  })

  test("the section cites the C1-frozen episode-writer hard gate as the upstream source authority", () => {
    const gate = sections.get(".mss quality gate")!
    // Cite the frozen episode-writer SKILL by name as source authority.
    expect(gate, "must cite the frozen `episode-writer` SKILL as source authority").toContain("episode-writer")
    // The frozen rule it enforces: 「每集 FINAL 之前必须 `mss compile` exit 0」.
    expect(
      gate.includes("mss compile") && gate.includes("exit 0"),
      "must quote the frozen episode-writer hard gate (`mss compile` exit 0)",
    ).toBe(true)
  })

  test("the section stays knowledge: declares it adds no code / engine / service", () => {
    const gate = sections.get(".mss quality gate")!.toLowerCase()
    // The body's house style elsewhere asserts "no code / no orchestration
    // service"; the wired gate must self-declare the same to stay on the
    // knowledge side of the project red line.
    expect(gate, "must state it is knowledge, not code").toContain("knowledge")
    expect(
      gate.includes("no code") || gate.includes("introduces no code") || gate.includes("not code"),
      "must self-declare it introduces no code",
    ).toBe(true)
    expect(
      gate.includes("no engine") ||
        gate.includes("no orchestration service") ||
        gate.includes("defines no engine") ||
        gate.includes("already-registered") ||
        gate.includes("already registered"),
      "must make clear it only directs the already-registered tool (no new engine/service)",
    ).toBe(true)
  })
})

// ── INJECTED-FAIL GATE PROOF (C2 Task 4) ───────────────────────────────────
//
// Satisfies design acceptance line 225: prove the orchestration body's gate
// contract, when mechanically followed, HALTS on a FAIL verdict (and loops on
// CONDITIONAL, advances on PASS).
//
// DETERMINISTIC vs LIVE proof split (intentional, do not "fix" by adding a
// production engine):
//   - The runtime gate is NOT a production gate engine. The project red line
//     forbids orchestration/gate code in src/; the body itself states the
//     driving agent owns the loop and "There is no orchestration service".
//   - The DETERMINISTIC proof here is a contract-DERIVATION: a TEST-ONLY pure
//     helper reads the body's documented `## Gate contract` and mechanically
//     derives {verdict → action}, then applies that derived map to real
//     reviewer-verdict fixtures. This proves the *documented contract* a
//     conforming driving agent must follow halts on FAIL.
//   - The LIVE behavioral proof — a real driving agent following THIS SAME
//     body and actually halting end-to-end — is deferred to C3's real
//     demo-book e2e (the agent at runtime reads this same body; this test
//     pins the contract that run is judged against).
//
// Non-vacuity: deriveGateActions parses the body off disk per-cell (reusing
// Task 3's parseSections/gateContractDataRows/rowCells — NO duplicated
// parser). We assert the derived map is LITERALLY {PASS:ADVANCE,
// CONDITIONAL:FIX_AND_REREVIEW, FAIL:HALT}: a body that mis-specified the
// FAIL cell would derive a different map (or, because classifyVerdictCell is
// per-token-prefix strict, fail to derive at all). A documented in-test
// reverted tamper additionally proves the helper genuinely reads the body
// rather than returning a hardcoded map: ANY rewording of the FAIL cell away
// from its documented halt semantics makes deriveGateActions throw — i.e. the
// helper structurally CANNOT emit a gate where FAIL advances or loops; a
// mis-specified FAIL contract is a hard error, not a silent regression. All
// tampering is on an in-memory string copy; BODY_PATH on disk is never
// written (self-reverting). The helper is TEST-ONLY (must NOT live in src/).

type GateAction = "ADVANCE" | "FIX_AND_REREVIEW" | "HALT"
type Verdict = "PASS" | "CONDITIONAL" | "FAIL"

const VERDICTS_FIXTURE_DIR = path.join(
  import.meta.dir,
  "..",
  "fixture",
  "novel-to-mss",
  "reviewer-verdicts",
)

/** Classify ONE token-prefixed verdict cell from the Gate-contract table into
 *  the action the body documents for it. Per-cell only — honoring the body's
 *  parser-contract note (the PASS cell legitimately contains "advance" and the
 *  FAIL cell "halt" on the SAME physical Markdown line, so whole-row grep is
 *  forbidden). Returns null if the cell text does not unambiguously match one
 *  documented action (caller treats that as "body under-specified" and fails
 *  loudly rather than guessing). TEST-ONLY. */
function classifyVerdictCell(cell: string): GateAction | null {
  const c = cell.toLowerCase()
  if (c.startsWith("pass:")) {
    // PASS → advance to the next stage (must NOT also say "halt").
    if (c.includes("advance") && !c.includes("halt")) return "ADVANCE"
    return null
  }
  if (c.startsWith("conditional:")) {
    // CONDITIONAL → producer applies fixes, SAME reviewer re-reviews (loop).
    if (c.includes("fix") && c.includes("same reviewer") && c.includes("re-review") && c.includes("loop"))
      return "FIX_AND_REREVIEW"
    return null
  }
  if (c.startsWith("fail:")) {
    // FAIL → halt + surface, and crucially NOT "advance"/"next stage".
    if (c.includes("halt") && c.includes("surface") && !c.includes("advance") && !c.includes("next stage"))
      return "HALT"
    return null
  }
  return null
}

/** Derive the {verdict → action} map purely from the body's documented
 *  `## Gate contract` table. Reuses Task 3's parseSections +
 *  gateContractDataRows + rowCells (single source of the per-cell parse — no
 *  duplicated parser). The body guarantees all gated rows carry IDENTICAL
 *  action cells (it says they "are intentionally identical across all
 *  gated-stage rows"); we derive per row and require every row to agree, so a
 *  body that reworded one row's FAIL cell out of sync with the others would
 *  make this throw. Throws (test fails loudly) if any cell is unclassifiable
 *  or rows disagree — i.e. if the body's contract is under-specified. This
 *  helper is the deterministic encoding of the body's documented gate rule;
 *  it adds NO new gate policy of its own. TEST-ONLY. */
function deriveGateActions(body: string): Map<Verdict, GateAction> {
  const gate = parseSections(body).get("Gate contract")
  if (!gate) throw new Error("body has no `## Gate contract` section — cannot derive gate actions")
  const rows = gateContractDataRows(gate)
  if (rows.length === 0) throw new Error("`## Gate contract` has no data rows — cannot derive gate actions")

  const tokens: ReadonlyArray<Verdict> = ["PASS", "CONDITIONAL", "FAIL"]
  let derived: Map<Verdict, GateAction> | null = null

  for (const cells of rows) {
    const rowMap = new Map<Verdict, GateAction>()
    for (const token of tokens) {
      const cell = cells.find((c) => c.startsWith(`${token}:`))
      if (!cell) throw new Error(`Gate-contract row ${JSON.stringify(cells[0])} has no ${token}: cell`)
      const action = classifyVerdictCell(cell)
      if (action === null)
        throw new Error(
          `Gate-contract ${token} cell is under-specified / unclassifiable: ${JSON.stringify(cell)}`,
        )
      rowMap.set(token, action)
    }
    if (derived === null) {
      derived = rowMap
    } else {
      // Every gated row's action cells must agree (body's "identical across
      // all rows" invariant). Disagreement = silent drift → fail loudly.
      for (const token of tokens) {
        if (rowMap.get(token) !== derived.get(token))
          throw new Error(
            `Gate-contract rows disagree on ${token}: ${derived.get(token)} vs ${rowMap.get(token)} ` +
              `(row ${JSON.stringify(cells[0])}) — the four action cells must be edited together`,
          )
      }
    }
  }
  return derived!
}

/** Extract the canonical bible-reviewer verdict token from a real
 *  bible-review-report.md. bible-reviewer writes its final verdict as a
 *  standalone line under the `## 总结论` section (its real output template,
 *  knowledge/novel-to-mss/bible-reviewer/SKILL.md `## 输出格式` / `## 总结论`:
 *  the line is exactly one of `PASS` / `CONDITIONAL` / `FAIL`). We read that
 *  section's first standalone verdict-token line. TEST-ONLY. */
function bibleReviewerVerdict(report: string): Verdict {
  const conclusion = parseSections(report).get("总结论")
  if (!conclusion) throw new Error("reviewer report has no `## 总结论` section")
  for (const raw of conclusion.split("\n")) {
    const line = raw.trim()
    if (line === "PASS" || line === "CONDITIONAL" || line === "FAIL") return line
  }
  throw new Error("`## 总结论` has no standalone PASS/CONDITIONAL/FAIL verdict line")
}

describe("novel_to_mss gate halts on injected FAIL verdict", () => {
  const body = readFileSync(BODY_PATH, "utf8")
  const gateActions = deriveGateActions(body)

  test("derived gate map is exactly {PASS→ADVANCE, CONDITIONAL→FIX_AND_REREVIEW, FAIL→HALT}", () => {
    // Literal-map assertion: a body that mis-specified ANY verdict cell (most
    // critically: a FAIL cell that advanced) would derive a different map and
    // fail right here. This is the structural half of the non-vacuity proof.
    expect(Object.fromEntries(gateActions)).toEqual({
      PASS: "ADVANCE",
      CONDITIONAL: "FIX_AND_REREVIEW",
      FAIL: "HALT",
    })
  })

  // The core acceptance: mechanically following the body's documented gate,
  // each REAL bible-reviewer verdict token maps to the documented action.
  // fail.md MUST resolve to HALT (pipeline does NOT advance).
  const cases: ReadonlyArray<{ fixture: string; verdict: Verdict; action: GateAction }> = [
    { fixture: "pass.md", verdict: "PASS", action: "ADVANCE" },
    { fixture: "conditional.md", verdict: "CONDITIONAL", action: "FIX_AND_REREVIEW" },
    { fixture: "fail.md", verdict: "FAIL", action: "HALT" },
  ]

  for (const { fixture, verdict, action } of cases) {
    test(`${fixture}: bible-reviewer ${verdict} → gate action ${action}`, () => {
      const report = readFileSync(path.join(VERDICTS_FIXTURE_DIR, fixture), "utf8")
      const got = bibleReviewerVerdict(report)
      // Fixture really emits the real token we expect (no paraphrase drift).
      expect(got, `${fixture} must emit real bible-reviewer token ${verdict}`).toBe(verdict)
      // Applying the body-derived gate map to that real verdict.
      expect(
        gateActions.get(got),
        `${fixture} verdict ${got} must map to ${action} per the body's Gate contract`,
      ).toBe(action)
    })
  }

  test("fail.md does NOT advance the pipeline (the acceptance: FAIL halts)", () => {
    const report = readFileSync(path.join(VERDICTS_FIXTURE_DIR, "fail.md"), "utf8")
    const resolved = gateActions.get(bibleReviewerVerdict(report))
    expect(resolved).toBe("HALT")
    expect(resolved).not.toBe("ADVANCE")
  })

  test("non-vacuity: any tamper to the body's FAIL cell breaks derivation (helper reads the body, never silently yields a non-halting FAIL)", () => {
    // Behavioral half of the non-vacuity proof: prove deriveGateActions truly
    // derives from body TEXT (not a hardcoded constant) AND that it can never
    // emit a map where FAIL does not HALT — it fails loudly instead. All
    // tampers are on an in-memory copy ONLY (BODY_PATH on disk is never
    // written, so this self-reverts; every other test reads the untouched
    // disk body).
    //
    // classifyVerdictCell is intentionally per-token-prefix strict: a `FAIL:`
    // cell is only ever matched against the documented halt pattern (halt +
    // surface + NOT advance/next-stage). So ANY rewording of the FAIL cell
    // away from its documented halt semantics — toward "advance", toward the
    // CONDITIONAL loop text, anything — makes that cell unclassifiable and
    // deriveGateActions THROWS. This is strictly stronger than "FAIL flips to
    // ADVANCE": the helper structurally refuses to produce a gate where a
    // FAIL verdict advances or loops; a mis-specified FAIL contract is a hard
    // error, not a silent regression. That throwing behavior is exactly what
    // protects design-acceptance line 225.
    const FAIL_CELL = "FAIL: halt the pipeline and surface the reviewer report to the operator; run no further stages"
    const COND_LOOP =
      "CONDITIONAL: producer applies the reviewer's listed fixes, then the SAME reviewer re-reviews (loop until PASS or FAIL)"
    expect(body.includes(FAIL_CELL), "real body must contain the documented FAIL cell verbatim").toBe(true)

    // Tamper variants — each keeps the `FAIL:` token prefix (so it's still
    // located as the FAIL cell) but strips the documented halt semantics.
    const failCellTampers: ReadonlyArray<{ label: string; cell: string }> = [
      { label: "FAIL says 'advance'", cell: "FAIL: advance to the next stage" },
      { label: "FAIL reworded to the CONDITIONAL loop text", cell: COND_LOOP.replace(/^CONDITIONAL:/, "FAIL:") },
      { label: "FAIL no longer mentions halt", cell: "FAIL: surface the reviewer report to the operator" },
    ]
    for (const { label, cell } of failCellTampers) {
      const tampered = body.split(FAIL_CELL).join(cell)
      expect(tampered, `tamper (${label}) must actually change the body`).not.toBe(body)
      expect(
        () => deriveGateActions(tampered),
        `tamper (${label}): a FAIL cell stripped of its documented halt semantics must be rejected, ` +
          `never silently turned into an advancing/looping gate`,
      ).toThrow(/under-specified \/ unclassifiable/)
    }

    // And the helper genuinely reads the body for OTHER tokens too: blanking
    // the PASS cell's advance verb makes the PASS cell unclassifiable and
    // also throws (so the map is not a hardcoded constant ignoring body text).
    const passBlanked = body
      .split("PASS: advance to the next stage")
      .join("PASS: proceed somehow")
    expect(passBlanked, "PASS-cell tamper must change the body").not.toBe(body)
    expect(
      () => deriveGateActions(passBlanked),
      "a PASS cell without the documented advance verb must be rejected too — derivation is body-driven",
    ).toThrow(/under-specified \/ unclassifiable/)

    // Revert is implicit: `body` (disk-read) is untouched; re-derive from it
    // and confirm the canonical contract is intact and unchanged.
    expect(Object.fromEntries(deriveGateActions(body))).toEqual({
      PASS: "ADVANCE",
      CONDITIONAL: "FIX_AND_REREVIEW",
      FAIL: "HALT",
    })
  })
})
