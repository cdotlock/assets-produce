# C2 — Orchestration Skill + Reviewer Sub-Agent Wiring — Verification Report

**Phase:** C2 (C-track, master-spec §15 r1.16)
**Design:** `2026-05-19-upstream-authoring-migration-design.md` §4.2/§4.4/§6 (C2 row, acceptance line 225) + §8.1 (C2 refinements)
**Plan:** `phase-C2-orchestration-reviewers-plan.md`
**Branch:** `claude/admiring-wilson-5d9f34` (worktree, isolated from main's B1 task)
**Date:** 2026-05-19
**Status:** ✅ All acceptance items met (deterministic-proof + C3-live-deferral explicitly recorded)

---

## Acceptance Matrix (design §6 C2 row, line 225)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `novel_to_mss` orchestration skill authored | ✅ | Commits `4e9d33e` (+`c1714c5` hardening). `knowledge/novel-to-mss/novel_to_mss/SKILL.md` (263 lines), frontmatter `name: novel_to_mss`+`description`, 6 machine-checkable `## ` sections (Stage DAG / Gate contract / Reviewer dispatch / Workspace writes / Per-route fan-out / Halt & surface). Connective knowledge only — references the 11 frozen C1 stage/reviewer skills by `name`, no creative-wording duplication. **Task 2** discovery test (`6092762`) proves it is discovered via C1's filesystem `skills.paths` mechanism, `location` is a filesystem path (NOT `langfuse://`), `content` non-empty, exactly one occurrence (no duplicate-name) — real `Skill.Service.all()`, no stubbing. |
| 2 | Reviewer sub-agent dispatch wired through `task.ts` | ✅ | `## Reviewer dispatch` instructs the driving agent to spawn a fresh-context sub-agent via opencode's **existing** `task` tool (id confirmed `const id = "task"` in `agent/packages/opencode/src/tool/task.ts`), real params `description`/`prompt`/`subagent_type` (`general-purpose` = fresh context). Faithful red-line reading: design §4.4 says "dispatched through opencode's existing `tool/task.ts`" → "wired" = the body correctly instructs use of the **existing** tool; **zero new dispatch code**. **Task 3** structural test asserts the dispatch section names the real tool. |
| 3 | Gate semantics (PASS/CONDITIONAL/FAIL, loop-until-pass) reproduced | ✅ | `## Gate contract` per-cell table: `PASS`→advance, `CONDITIONAL`→producer applies fixes then **same** reviewer re-reviews (loop until PASS/FAIL), `FAIL`→halt+surface, no advance. Uses each reviewer's **real** verdict vocabulary (survey below), with explicit documented normalizations for the divergent reviewers. **Task 3** (`56e80f1`,+`e4dad4d`) asserts — per-cell, section-scoped — all 6 sections present, 4 gated stages each name the correct reviewer, FAIL cell has a halt verb and no "advance"/"next stage", CONDITIONAL = producer-fix+same-reviewer loop, PASS = advance, stage-1 GO/CONDITIONAL/NO-GO + optional 4.5 branch, and every `AUTHORING_STAGE_DIRS` value (imported from C1, not hardcoded) appears in `## Workspace writes`. Dual independent tamper-checks confirmed non-vacuous. |
| 4 | Injected-FAIL test proves the gate halts progression | ✅ (see note) | Commit `cecf310`. 3 reviewer-verdict fixtures (`test/fixture/novel-to-mss/reviewer-verdicts/{pass,conditional,fail}.md`, real `bible-reviewer` report shape + tokens) + a TEST-ONLY `deriveGateActions(body)` that per-cell-parses the body's `## Gate contract` (reusing Task 3's parser, no duplication) into `{PASS:ADVANCE, CONDITIONAL:FIX_AND_REREVIEW, FAIL:HALT}` and asserts `fail.md`→HALT (explicitly NOT advance), `conditional.md`→FIX_AND_REREVIEW, `pass.md`→ADVANCE. Classifier **throws** on any under-specified/unclassifiable verdict cell — a mis-specified FAIL is a hard error, never a silent advance (strictly stronger than "flips to ADVANCE"). Independently re-verified non-circular via on-disk body tamper. **Note:** because the gate is *knowledge* (no production gate engine — §12 red line), the durable proof is this **deterministic gate-contract derivation**; the **live behavioral** proof (a real driving agent halting end-to-end) is deferred to **C3's demo-book e2e**. Recorded in design §8.1. |

---

## Reviewer verdict-vocabulary survey (Task 1 Step 1 — durable)

Confirmed from the frozen C1 bodies `knowledge/novel-to-mss/<name>/SKILL.md`. The Gate contract uses these **real** tokens (not paraphrases); divergent reviewers carry an explicit documented normalization so the gate stays machine-unambiguous.

| Reviewer / gate | Real tokens | Normalization in body | Source confirmed |
|---|---|---|---|
| `novel-evaluator` (stage 1, self-gate) | `GO` / `CONDITIONAL` / `NO-GO` | GO→advance, CONDITIONAL→operator-decides (no auto-advance), NO-GO→halt | `novel-evaluator/SKILL.md` frontmatter + 门控决策规则 |
| `bible-reviewer` (stage 2) | `PASS` / `CONDITIONAL` / `FAIL` | identity (canonical 3-way) | `bible-reviewer/SKILL.md` frontmatter + 判决规则汇总 |
| `planner-reviewer` (stage 3) | `PASS` / `CONDITIONAL` / `FAIL` | identity; score-mapped ≥9.0 / 7.0–8.9 / <7.0 | `planner-reviewer/SKILL.md` 最终判决 L276-278 |
| `episode-writer-reviewer` (stage 5) | `PASS` / `CONDITIONAL` / `FAIL` | identity; score-mapped ≥9.0 / 7.0–8.9 / <7.0 | `episode-writer-reviewer/SKILL.md` 输出格式 L185-187 |
| `rename-reviewer` (stage 4.5 opt) | `PASS` / `WARN` / `FAIL` | **`WARN`→treat as CONDITIONAL** (producer-fix + same-reviewer loop) | `rename-reviewer/SKILL.md` frontmatter + 产出格式 |
| `arc-reviewer` (stage 5 arc) | prescriptions graded `P0` / `P1` / `P2` (no single verdict line) | **any unresolved `P0`→treat as FAIL (halt)**; only P1/P2 (or none) + approved/applied → PASS; two-phase diagnose→approve→apply | `arc-reviewer/SKILL.md` 两阶段强制流程 + 问题分级标准 |

**Discrepancy resolved & recorded:** n2m `README.md` loosely lists stage-1 as "GO/NO-GO", but the frozen `novel-evaluator/SKILL.md` actually emits a 3-way `GO`/`CONDITIONAL`/`NO-GO` (corroborated by `character-architect`'s precondition "novel-evaluator 输出 GO 或 CONDITIONAL"). Per the plan's "use the reviewers' REAL vocabulary, not a paraphrase", the body encodes the real 3-way. Faithful to the frozen source.

---

## Per-Task Two-Stage Review Ledger

| Task | Spec review | Code-quality review | Commits |
|------|-------------|---------------------|---------|
| 1 — orchestration body | ✅ Spec compliant (faithful to frozen sources; 3 verdict discrepancies resolved with documented normalizations; machine-unambiguous; zero code — red line intact) | ✅ APPROVED-WITH-MINORS → 3 parser-hardening minors applied as `c1714c5` (table-row coupling note, parser source-of-truth pointer, split-cells-not-rows note) | `4e9d33e`, `c1714c5` |
| 2 — discovery guard | ✅ Spec compliant (independent re-run + independent non-vacuousness re-check; harness faithfully mirrors C1; structural single-occurrence proxy verified faithful via `src/skill/index.ts` dedup path) | ✅ APPROVED (2 Minors both inherited-from-C1 pattern or explicitly-documented design; reviewer: changing them would *introduce* the cross-file inconsistency the plan warns against — no change) | `6092762` |
| 3 — gate-contract structural test | ✅ Spec compliant (independent re-run + own dual tamper-check; per-cell parsing honors body's parser-contract note; `AUTHORING_STAGE_DIRS` imported not hardcoded; section-scoped) | ✅ APPROVED-WITH-MINORS → M1 (`parseSections` fenced-code-block assumption comment) applied as `e4dad4d`; M2/M3 noted-only (documented design coupling, acceptable) | `56e80f1`, `e4dad4d` |
| 4 — injected-FAIL gate test | ✅ Spec compliant (independent re-run 12/0; independent on-disk tamper proved `deriveGateActions` genuinely body-driven, not tautological; "throw-instead-of-flip" judged sound & strictly stronger; full skill suite 33/0 no regression) | ✅ APPROVED (deterministic proof verified non-circular via adversarial mutations + the 7-PASS-tokens-in-`fail.md` extraction scoping; 2 optional non-blocking Minors recorded below) | `cecf310` |
| 5 — §8 design refinement | ✅ Controller-verified directly: append-only doc record, controller-supplied exact text; `git show` = 1 file +18/-0, §4.2 + all other sections byte-unchanged, §9 intact, facts accurate, atomic `docs:` (process note below) | n/a (doc-only; doc-quality checked in same controller pass: style consistent with doc's `### N.M` convention, accurate, no scope creep) | `e232e5d` |

---

## Final Verification Commands (evidence, run at C2 close)

- `bun test test/skill test/business --timeout 30000` (opencode pkg) → **219 pass, 0 fail, 856 expect() calls, 19 files** — covers the C2 test file (`novel-to-mss-orchestration.test.ts` = discovery + structural + injected-FAIL, 12 tests) + all C1 tests + every pre-existing skill/business test = full C2 blast radius, **zero regressions**.
- `bun run typecheck` (agent, all packages) → **4 successful, 4 total** (clean).
- `git status --short` → clean working tree.
- C2 diff `3789a0d..HEAD` → **6 files, 962 insertions, 0 deletions**: 1 knowledge body + 1 test file + 3 fixtures + 1 design-doc note. **ZERO `agent/.../src/**` production change** (verified: `git diff … -- 'agent/packages/opencode/src/**'` empty).

---

## Key Decisions & Findings (durable)

1. **Zero production orchestration code (red line §12 intact).** The C2 change set is 6 files: 1 markdown knowledge body + 1 test file + 3 fixtures + 1 design-doc append. No `*-orchestration`/`*-coordination`/`*-workflow-service` source; no `src/` production change at all. Sequencing/gate/loop logic lives ONLY as knowledge; reviewer dispatch = the **existing** opencode `task` tool, invoked by instruction.
2. **No Langfuse, no DB, NOT in `ASSET_GENERATION_SKILLS`/`intent-to-skill.ts`.** `novel_to_mss` is discovered ONLY via C1's filesystem `skills.paths` mechanism (Task 2 proved fs-served, not `langfuse://`, no DB row). This is design D3/D4 and keeps code-overlap with main's concurrent B1 ≈0 (B1 touches `ASSET_GENERATION_SKILLS`/`intent-to-skill.ts`; C2 does not).
3. **Orchestration-skill filename refinement (recorded §8.1).** `knowledge/novel-to-mss/novel_to_mss/SKILL.md` (per-skill-dir `SKILL.md`, frontmatter `name: novel_to_mss`) — required by C1's `**/SKILL.md` discovery glob; design §4.2's `novel_to_mss.md` was loose wording, no semantic change.
4. **Injected-FAIL interpretation (recorded §8.1).** Deterministic gate-contract derivation test (TEST-ONLY parser → `{verdict→action}`, throws on under-specified gate) satisfies the §6 C2 / line-225 acceptance without any production gate engine (red-line safe). The live behavioral proof (real agent halting end-to-end) is **deferred to C3's demo-book e2e** — explicitly on record, not an unstated gap.
5. **3 verdict-vocabulary discrepancies resolved faithfully.** novel-evaluator real 3-way `GO/CONDITIONAL/NO-GO`; rename-reviewer `WARN`→CONDITIONAL; arc-reviewer `P0`→FAIL — real tokens + documented normalizations, machine-unambiguous (Task 3/4 tests parse them deterministically).
6. **Open non-blocking Minors (deferred, not defects):** Task 4 M1 — `classifyVerdictCell` PASS branch (`includes("advance") && !includes("halt")`) is the loosest of the 3 rules (defensible: the body's PASS cell is intentionally a single clause; verified non-circular — a PASS cell stripped of "advance" throws). Task 4 M2 — action keywords are inline string literals duplicated between the Task 3 structural test and the Task 4 derivation (intentional: the two tests assert the same body contract from different angles; extracting shared constants would couple them). Neither affects correctness or the proof's validity; recorded for a future polish pass.
7. **Process note (authorized, consistent with C1 precedent):** Tasks 1–4 (all implementation/test tasks) received the full two-stage subagent review (spec-compliance THEN code-quality, with fix loops). Task 5 (an append-only design-doc record whose exact text the controller authored) was verified directly by the controller in a single spec+doc-quality pass — the same trivial-doc handling used and recorded in the C1 verification ledger. No implementation task skipped review.

---

## Conclusion

C2 is **complete**. The `novel_to_mss` orchestration knowledge body is authored, discoverable via opencode's filesystem skill system (zero Langfuse/DB/`ASSET_GENERATION_SKILLS` coupling), encodes the full stage DAG + per-cell gate contract with each reviewer's real verdict vocabulary, instructs reviewer dispatch through opencode's existing `task` tool (zero new code), and the gate's HALT-on-FAIL semantics are proven deterministically by the injected-FAIL contract-derivation test — with the live end-to-end behavioral proof explicitly scheduled for C3. All design §6 C2 acceptance items met; all four implementation tasks passed both review stages; §12 red line intact. Ready for C3 (`mss-validate` atomic tool + demo-book novel→MSS e2e + downstream-compat).
