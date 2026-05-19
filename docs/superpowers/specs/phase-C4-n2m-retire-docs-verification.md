# C4 — n2m Retirement + Docs — Verification Report

**Phase:** C4 (C-track, master-spec §15 r1.16)
**Design:** `2026-05-19-upstream-authoring-migration-design.md` §6 C4 row, D7, §2.2, §5, §8, §9, §10
**Plan:** `phase-C4-n2m-retire-docs-plan.md`
**Branch:** `claude/admiring-wilson-5d9f34` (worktree, concurrent with main's B1 task)
**Date:** 2026-05-19
**Status:** ✅ All C4 acceptance items met; whole C-track closed

---

## 1. C4 Acceptance Matrix (design §6 C4 row)

| Criterion | Status | Evidence |
|---|---|---|
| DEPRECATED header on n2m's 10 upstream authoring skills (single commit, push gated on user ack) | ✅ Pushed to user's own namespace (see §3 for design-vs-reality and authorized resolution) | Controller-executed commit `e2802bd` — `docs: DEPRECATED — upstream authoring migrated to assets-produce (10 skills)` — 10 files changed, 150 insertions, 0 deletions. Pushed fast-forward `8049ac7..e2802bd` to `origin` = `AugustZAD/Dramatizer-MSS`. SHA is the controller-reported n2m outcome (separate repo; not verifiable from this assets-produce worktree). |
| assets-produce `knowledge/novel-to-mss/README.md` (corpus index) created; `FREEZE_SOURCES.md` C4 provenance note appended | ✅ | Task 1 commit `a146bde`: `knowledge/novel-to-mss/README.md` (+55 lines) + `knowledge/novel-to-mss/FREEZE_SOURCES.md` (+11 lines). Two-stage review passed: spec-compliance ✅ COMPLIANT; code-quality ✅ APPROVED (one optional cosmetic Minor, no fix required). |
| assets-produce `README.md` (Layout bullet + consumer bullet corrected) and `SKILL.md` (§7 sentence + §9 tool row + novel-to-mss picker bullet) updated | ✅ | Task 2 commit `4c8de60`: `README.md` (+3/-2) + `SKILL.md` (+14/-1). Two-stage review passed: spec-compliance ✅ COMPLIANT; code-quality ✅ APPROVED (two optional cosmetic Minors, no fix required). |
| C4 + whole-C-track verification report | ✅ | This file. |

---

## 2. Whole-C-Track Rollup (C0→C4)

| Phase | Deliverable | Verification artifact | Close commit / state | Green? |
|---|---|---|---|---|
| **C0** | Design doc `2026-05-19-upstream-authoring-migration-design.md` committed; master-spec §15 r1.16 added | No separate verification file exists (`ls phase-C0*` = empty); C0's acceptance was the committed design doc + §15 r1.16 entry, per design §6 C0 row ("This design doc committed; master-spec §15 r1.16 added; user review-gate passed") | Design doc + §15 r1.16 committed on this worktree's initial setup | ✅ |
| **C1** | 11 skill dirs byte-frozen into `knowledge/novel-to-mss/`; `skills.paths` wired; drift-guard test; `Project(novel)` workspace helper | `phase-C1-skill-freeze-ingest-verification.md` — "C1 is **complete**. The upstream authoring corpus (11 skills) is byte-frozen, drift-guarded, discoverable via opencode's filesystem skill system with zero Langfuse/DB coupling, and a `Project(novel)` on-disk workspace helper reproduces n2m's `NN-stage` downstream-compat contract. All acceptance items met." | 7 code+doc commits; final: `3bd35de` (workspace helper) + `d2555fe` (plan fix) | ✅ |
| **C2** | `novel_to_mss` orchestration skill; reviewer sub-agent dispatch via `task.ts`; gate semantics (PASS/CONDITIONAL/FAIL); injected-FAIL test | `phase-C2-orchestration-reviewers-verification.md` — "C2 is **complete**. The `novel_to_mss` orchestration knowledge body is authored, discoverable via opencode's filesystem skill system (zero Langfuse/DB/`ASSET_GENERATION_SKILLS` coupling)… All design §6 C2 acceptance items met; all four implementation tasks passed both review stages; §12 red line intact." | 6 files, 962 insertions, 0 deletions; final: `e232e5d` (design §8.1 note) | ✅ |
| **C3** | `mss-validate` atomic tool (vendored `@b36a407`, sha256 drift-guarded); demo-book compat-golden (3 real `.mss` scripts, real validator); minimal-live slice (real reviewer gate + FAIL-halt); `.mss` quality gate wired into orchestration body | `phase-C3-mss-validate-e2e-verification.md` — "All C3 acceptance criteria are met (§2). Every code task passed independent two-stage review with fix-loops resolved (§3). The live e2e acceptance proved validator fidelity on real data, a faithful PASS-advance gate-contract loop, and a **genuine** FAIL-halt — all against real independent sub-agents, with the body validated as-authored (§4). No CRITICAL/HIGH open." | 19 commits (corrected by `f4be4ea`): `693b697..f4be4ea`; final: `f4be4ea` (C3 report correction) | ✅ |
| **C4** | n2m 10-skill DEPRECATED headers + push; assets-produce corpus index + provenance note + top-level docs update; this verification report | This file | `1121f4d` (plan) + `a146bde` (Task 1) + `4c8de60` (Task 2) + this closeout commit | ✅ |

**Design §7 acceptance strategy discharged across C1–C3:**
- **Verbatim-freeze golden:** C1 committed `FREEZE_MANIFEST.sha256` (55 files, sha256 per-file) + `novel-to-mss-freeze.test.ts` drift guard; tamper-test confirmed non-vacuous (flipped byte → assertion fails). Byte-identical freeze proven once vs live n2m at freeze time.
- **e2e compat-golden + minimal-live:** C3 Task 7 Step 1 ran real `mss-validate` (non-mock) over 3 real n2m demo-book golden `.mss` scripts (weston/diego/luca → `verdict:"PASS"` exit 0 each). Step 2 ran a minimal-live slice (public-domain micro-novel, 1 episode, real reviewer sub-agent gate-contract loop, real validator, `verdict:"PASS"`). Full-book-from-original-novel run transparently recorded as infeasible (n2m `.gitignore`s `novels/`), user-confirmed per §8.2.
- **Reviewer-gate:** C2 injected-FAIL contract-derivation test (deterministic, throws on mis-specified gate); C3 Step 3 proved a **real** (non-injected) reviewer FAIL (5.8/10) halted the pipeline with no advance, no downstream artifact. C3 Step 2 proved the CONDITIONAL→fix→re-review→PASS loop converged on a real independent sub-agent (7.5 → 8.8 → 9.0).
- **≥80% coverage on glue:** C1 `workspace.ts` (29 LOC, every line/branch tested behaviorally); C3 `mss_validate.py` bridge (12 hermetic tests), `mss-validate.ts` wrapper (14 tests), registry (mutation-tested guard), body (5 section-scoped guards), compat parity test — all discharged per their verification reports.

---

## 3. n2m Retirement Status

### Task 3 outcome (controller-executed)

**Commit:** `e2802bd` — `docs: DEPRECATED — upstream authoring migrated to assets-produce (10 skills)`
**Scope:** 10 files changed, 150 insertions(+), 0 deletions. The 10 files are exactly `skills/{novel-evaluator,character-architect,bible-reviewer,entity-planner,planner-reviewer,entity-normalizer,entity-rename,rename-reviewer,episode-writer,episode-writer-reviewer}/SKILL.md`, each with the verbatim DEPRECATED blockquote inserted **after the YAML frontmatter closing `---` and before the H1 heading** (frontmatter still parses; comment-only; nothing deleted — design D7).
**Push:** Fast-forward `8049ac7..e2802bd` to `origin` = `github.com/AugustZAD/Dramatizer-MSS.git`. SHA is the controller-reported n2m outcome; the n2m repo is separate from this assets-produce worktree and cannot be independently verified here.

### Design-vs-reality discrepancy and authorized resolution

The plan (Task 3 Step 1 preamble) and design §9/D7 assumed the n2m push target was `cdotlock/novels-to-moonscript`. On-disk reality differed and was surfaced to the user before any n2m file was touched:

- **Local n2m path:** `/Users/august/MobAI/novels-to-moonscript`
- **Actual `origin` remote:** `github.com/AugustZAD/Dramatizer-MSS.git` (user's own namespace `AugustZAD`)
- **Secondary remote `old-linghuc`:** `github.com/LinghuC2333/novels-to-moonscript.git`
- **No `cdotlock` remote present** in this working tree
- **n2m HEAD:** `8049ac772f7350ea593519fbeb891ccaee488c9c` — exactly the C1/C3 freeze-provenance commit; frozen mapping still accurate
- **Pre-existing unrelated dirty files** (`M CLAUDE.md`, `M docs/comparison-with-norules-vn-2026-05-08.html`, `D moonscripts/.../ep_1_final.md`, `?? ...ep_1_final.mss`) belonging to other work

Per CLAUDE.md "spec-uncovered → stop and ask", this discrepancy was stopped on and put to the user. The user explicitly chose: **push to their own repo** (`AugustZAD/Dramatizer-MSS`). This is the user's own namespace (`AugustZAD`) and carries explicit chat ack — the global git red line is satisfied. The pre-existing dirty files were NOT staged or committed. This is recorded as an authorized scope clarification (consistent with the C1/C2/C3 transparent-deviation precedent of recording execution-time clarifications in the verification report).

### `arc-reviewer` exclusion rationale

`arc-reviewer` is correctly excluded from the 10 DEPRECATED files. Design §4.1 enumerates "10 global + 1 project-scoped": the 10 are top-level `n2m/skills/<name>/SKILL.md`; `arc-reviewer` is the "+1 project-scoped" — it lives at n2m path `moonscripts/no-rules-in-bad-ideas/skills/arc-reviewer/`, a per-book reviewer template, **not** a top-level `skills/<name>` entry. D7 and the §6 C4 row both say precisely "10 upstream skills". Excluding `arc-reviewer`'s per-book copy is the design's explicit intent, not a gap. It remains frozen in assets-produce as the 11th corpus entry (`knowledge/novel-to-mss/arc-reviewer/`); this is unaffected.

### n2m downstream and user's dirty files

n2m's 6 downstream skills (`asset-prompt-generator`, `asset-reviewer`, `music-normalizer`, `sfx-normalizer`, `outfit-anchor-renderer`, `wardrobe-consolidator`) and the `dramatizer/` post-production are **NOT touched** — per design §2.2/§5 these continue to run in n2m. The user's pre-existing unrelated dirty files in the n2m working tree were NOT staged, committed, or pushed.

### Intentional divergence

After C4, the assets-produce frozen copies and n2m's live `skills/<name>/SKILL.md` intentionally differ by exactly the DEPRECATED blockquote header. This is **designed retirement, not drift** — assets-produce is the authoritative copy (design §10 risk row "Frozen prose drifts from n2m later" / mitigation "n2m DEPRECATED header makes n2m the non-authoritative copy").

---

## 4. Red-Line / Interface-Stability Compliance (design §8)

| Check | Status | Evidence |
|---|---|---|
| No `*-orchestration` / `*-workflow-service` / `*-coordination` code | ✅ | C4 is documentation-only: `git show --stat 1121f4d a146bde 4c8de60` shows only `.md` files under `docs/`, `knowledge/`, `README.md`, `SKILL.md`. Zero `agent/packages/opencode/src/**` production change in the entire C4 range. The n2m commit (`e2802bd`) is likewise comment-only `.md` edits. |
| Skill bodies under `knowledge/` (not scattered) | ✅ | C4 adds `knowledge/novel-to-mss/README.md` (corpus index, not a skill body); `FREEZE_SOURCES.md` gets an appended C4 note. All 11 frozen skill bodies from C1 remain under `knowledge/novel-to-mss/<name>/SKILL.md`. |
| No WebUI business logic | ✅ | C4 touches zero `web/` files. |
| No new `AssetKind`, REST endpoint, DB schema, `AssetServiceErrorCode`, or OpenAPI change | ✅ | C4 is docs-only; no `AssetKind` enum, no migration, no schema change; confirmed by `git show --stat` of all C4 commits. |
| Phase-2/3 + Phase-14 asset-service loop + moonshort-backend untouched | ✅ | No `agent/packages/opencode/src/tool/` or `agent/packages/opencode/src/business/` files modified in C4. moonshort-backend has no C4 commits. |
| No Langfuse upload | ✅ | C4 docs-only; design §4.3 prohibits Langfuse for this track; no `LangfuseService` call in C4 range. |

---

## 5. Final Regression Results

Run immediately before writing this report (from `agent/packages/opencode/`):

| Suite | Command | Result |
|---|---|---|
| `test/skill` + `test/business` | `bun test test/skill test/business --timeout 60000` | **232 pass / 0 fail** / 911 expect() calls / 20 files |
| `test/tool/mss-validate.test.ts` | `bun test test/tool/mss-validate.test.ts --timeout 60000` | **14 pass / 0 fail** / 29 expect() calls / 1 file |
| Typecheck | `cd agent && bun run typecheck` | **4 successful, 4 total** |
| Working tree | `git status --short` | clean |

**Notes:**
- C4 is documentation-only; no new test files were added. The regression confirms the C3 baseline is intact: the `test/skill` suite now includes C3's novel-to-mss-compat test (232 vs C2's 219 / C3's 232 — stable at C4), `mss-validate.test.ts` (14/0) is unchanged from C3.
- The `test/tool` full suite was not re-run in its entirety for C4 (docs-only change set; C3 already ran all 30 tool-test files at 391/0; the targeted `mss-validate.test.ts` subset re-confirms the C-track's tool test is green). Per C3 precedent, combined full-suite runs can trigger transient per-test timeouts under load — isolated per-suite runs are the reliable baseline.
- Typecheck: turbo cache hit for 3 packages, fresh run for `opencode` (4 successful, 4 total — clean, same as C3).

---

## 6. Final-Merge-Gate Readiness (post-C4, NOT executed in C4)

The C-track is **functionally complete** as of this C4 closeout. All five phases (C0–C4) have met their acceptance criteria. However, merging this worktree (`claude/admiring-wilson-5d9f34`) into `main` is a **separate, user-coordinated step** that is explicitly NOT part of C4. Per design §9, the merge requires:

1. **Rebase onto latest `main`** — `main` has been advanced by the concurrent B1 task (B1 commits since the worktree branched from `main@659fbdb`; this is by design and not a C4 problem).
2. **Reconcile master-spec §15** — append-only merge: r1.16 is already present in the worktree; any B1 §15 additions on `main` are resolved by appending (no §15 row is deleted or modified from either side; trivial manual reconcile).
3. **Resolve any `opencode.jsonc` / `.env.example` / registry contention** — expected minimal per design §9 (D4 keeps code overlap with B1 ≈0).
4. **Re-run tests** on the merged state.

This step depends on B1's current state on `main` and requires the user's go-ahead. It is surfaced here as required closeout information, not executed.

**Branch sync (pre-closeout commit):** `git rev-list --left-right --count origin/claude/admiring-wilson-5d9f34...HEAD` = `0 0` (fully synced; all C4 commits pushed).

---

## 7. Deferred Non-Blocking Items

### Carried forward from C1

- Freeze-script `sed` strip could be regex-anchored for future-proofing (current corpus provably safe; C1 §5, Minor 5).
- Discovery test `describe`/`it` naming slightly repetitive — cosmetic (C1 §5, Minor 6).

### Carried forward from C2

- Task 4 M1 — `classifyVerdictCell` PASS branch is the loosest of the 3 rules (defensible; verified non-circular; C2 §6, Minor).
- Task 4 M2 — action keywords are inline string literals duplicated between Task 3 structural test and Task 4 derivation (intentional coupling; C2 §6, Minor).

### Carried forward from C3

- Task 3 `mss-validate.ts`: M1 (coarse absolute-path regex — sibling-parity), M2 (no schema-level `.annotate`), M3 (alias-vs-relative import — sibling-consistent). All explicitly non-blocking per code-quality reviewer; fixing would regress sibling consistency (C3 §6).
- Task 6: Minor 3 (relative import) + `out.metadata as Record<string,unknown>` cast — accepted-as-is (C3 §6).
- Environmental: combined full test run is per-test-timeout-prone under load — use adequate `--timeout` or per-suite runs (C3 §1 note).

### C4 items

- Task 1 code-quality review: one optional cosmetic Minor (no description given requiring fix; reviewer approved as-is).
- Task 2 code-quality review: two optional cosmetic Minors (no fix required; reviewer approved as-is).

**None of the above are blocking.** None gate the C-track closure or the merge-gate step.

---

## 8. Conclusion

The C-track (C0→C4) is **closed**.

All five phases met their acceptance criteria. The upstream novel→`.mss` authoring pipeline is:
- **Byte-frozen** in assets-produce under `knowledge/novel-to-mss/` (11 skills + `novel_to_mss` orchestration, drift-guarded);
- **Runtime-discoverable** via opencode's filesystem skill system (`skills.paths`, zero Langfuse/DB coupling);
- **End-to-end validated** — real `mss-validate` (non-mock, frozen `@b36a407`) passes on 3 real demo-book `.mss` scripts; minimal-live slice exercised real reviewer gate contract with genuine FAIL-halt;
- **Documented** — assets-produce `README.md`, `SKILL.md`, `knowledge/novel-to-mss/README.md` declare it the sole novel→MSS authority.

**n2m push status (honest):** The 10 upstream n2m authoring skills were retired (DEPRECATED header, comment-only, not deleted — D7) via commit `e2802bd`, pushed to **`AugustZAD/Dramatizer-MSS`** (the user's own namespace) — NOT the design-named `cdotlock/novels-to-moonscript` repo. This deviation from the design's assumed push target was surfaced to the user before any edit; the user explicitly chose to push to their own repo. The global git red line is satisfied (user's namespace + explicit chat ack). This is recorded here as an authorized scope clarification, not a gap.

The C-track is complete. Merging to `main` is a separate, user-coordinated step (§5 above).
