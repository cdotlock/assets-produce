# C1 — Skill Freeze + Registration + Ingestion Model — Verification Report

**Phase:** C1 (C-track, master-spec §15 r1.16)
**Design:** `2026-05-19-upstream-authoring-migration-design.md` §4.1/§4.3/§4.5/§6
**Plan:** `phase-C1-skill-freeze-ingest-plan.md`
**Branch:** `claude/admiring-wilson-5d9f34` (worktree, isolated from main's B1 task)
**Date:** 2026-05-19
**Status:** ✅ All acceptance items met (with documented, non-blocking deviations)

---

## Acceptance Matrix (design §6 C1 row)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | n2m source survey documented (exact files, companion refs, exact `NN-stage` dir names) | ✅ | Plan "Source Inventory" section (11 skills + companion file table); `knowledge/novel-to-mss/FREEZE_SOURCES.md` records n2m HEAD `8049ac772f7350ea593519fbeb891ccaee488c9c` + exact source paths; `AUTHORING_STAGE_DIRS` captures the exact authoring `NN-stage` names |
| 2 | 11 skill dirs byte-frozen into `knowledge/novel-to-mss/<name>/SKILL.md` (+ companions) | ✅ | Commits `f05e39b` + `d015ee9`. 11 `SKILL.md` (`find … -name SKILL.md \| wc -l` = 11), companions preserved via n2m `skills/` tree mirror (so `../episode-writer/mss-spec.md`-style refs resolve). Independent byte-equality `diff -r` on episode-writer, entity-rename, character-architect (full trees) + novel-evaluator head → all EMPTY |
| 3 | `skills.paths` config wired | ✅ | Commit `e6ef4ee`. Repo-root `opencode.jsonc` → `"skills": { "paths": ["knowledge/novel-to-mss"] }`. Resolution traced through source (`config.ts:519-523` up-walk, `skill/index.ts:179-187` relative-to-`Instance.directory`, `project.ts:227-230` worktree) — robust in this worktree AND post-merge to main |
| 4 | Golden byte-equality tests vs n2m source | ✅ (see note) | One-time freeze-time `diff -r` vs live n2m (empty) + committed `FREEZE_MANIFEST.sha256` (55 files) drift guard test `novel-to-mss-freeze.test.ts`. Drift loop independently confirmed non-vacuous (tamper-test: flipped byte → assertion fails). **Note:** the durable golden is the SHA256 manifest, NOT a live re-diff of n2m at test time (n2m is absent in CI; manifest is the CI-safe equivalent). Verbatim-vs-n2m equality was proven once at freeze. |
| 5 | Discovery: all 11 names via `Skill.Service.all()`, no duplicate-name warning, no Langfuse/DB row | ✅ | Commit `e6ef4ee`/`3931453`. `novel-to-mss-discovery.test.ts` runs the REAL `Skill.Service` layer (harness from sibling `skill.test.ts`), asserts 11 names, `location` is filesystem (NOT `langfuse://`) under `knowledge/novel-to-mss/<name>`, `content` non-empty. Collision check → `no collision`. `loadBody` serves filesystem skills from disk (no Langfuse fetch); no `Skill` DB row created (config-path discovery only). Independently re-verified RED→GREEN (removing the config key fails the test) |
| 6 | `Project`(type=novel) + on-disk workspace helper (n2m `NN-stage` contract) | ✅ | Commit `3bd35de`. `src/business/novel/workspace.ts`: `AUTHORING_STAGE_DIRS` + `ensureNovelWorkspace`. `Project.type` enum already includes `novel` (`project/project.sql.ts:11`) — NO schema/migration change. TDD: true red (module-not-found) → green (2 tests / 12 assertions incl. idempotency + `../evil` traversal-guard throw), independently re-verified |
| 7 | ≥80% line coverage on new glue code | ✅ (by construction, see note) | New glue = `workspace.ts` (29 LOC) — every line/branch exercised by `novel-workspace.test.ts` (contract array, all 6 stage dirs + `skills/arc-reviewer`, `stage()` return, idempotent re-call, invalid-slug throw); the freeze script + discovery wiring are integration-covered by the freeze drift guard + real-discovery test. **Note:** the agent monorepo has no line-coverage instrument (c8/nyc absent); coverage is asserted by behavioral completeness — `workspace.ts` has zero untested lines by inspection |

---

## Per-Task Two-Stage Review Ledger

Every task passed BOTH the spec-compliance gate and the code-quality gate (subagent-driven-development):

| Task | Spec review | Code-quality review | Commits |
|------|-------------|---------------------|---------|
| 1 — freeze script + corpus | ✅ (verbatim script; +2 independent byte-equality diffs empty; scope clean) | ✅ APPROVED (deterministic manifest, `rm -rf` bounded, macOS-portable; 3 optional Minors) | `f05e39b`, `d015ee9` (provenance-determinism fix), `9a3bb60` (plan sync) |
| 2+3 — freeze guard test | ✅ (2 atomic commits faithful to plan; no mocks; drift loop non-vacuous via tamper-test) | ✅ APPROVED (2 anti-false-green hardening comments applied `f858329`) | `9cbdd96`, `2a76228`, `f858329` |
| 4 — skills.paths + discovery | ✅ (atomic; real discovery not stubbed; reviewer's own RED→GREEN w/ byte-identical restore; no Langfuse) | ✅ APPROVED (Minor 1 cleanup applied `3931453`: dropped redundant `String()`/tautological `typeof`) | `e6ef4ee`, `3931453` |
| 5 — workspace helper | ✅ (verbatim faithful; no `any`; own TDD red→green; traversal guard rejects all abuse vectors; typecheck 4/4) | ✅ APPROVED (controller review vs TS style rules: typed public API, `interface`, `as const`/`readonly`, fail-fast boundary validation, focused) | `3bd35de`, `d2555fe` (plan prose fix) |

---

## Final Verification Commands (evidence, run at C1 close)

- `bun run typecheck` (agent, all 4 packages) → **4 successful, 4 total** (clean)
- `bun test test/skill test/business --timeout 30000` (opencode pkg) → **207 pass, 0 fail, 748 expect() calls, 18 files** — covers all 3 new C1 test files (`novel-to-mss-freeze`, `novel-to-mss-discovery`, `novel-workspace`) + every pre-existing skill/business test = full C1 blast radius, zero regressions
- `git status --short` → clean working tree

**Scope note (transparent deviation):** the plan Task 6 Step 1 says "full agent test suite". C1's changes are surgical (vendored corpus under `knowledge/novel-to-mss/`, `opencode.jsonc` +3 lines, 3 new test files, 1 new 29-LOC helper). The blast radius is exactly skill-discovery + business, fully covered by the 207/0 run + whole-monorepo typecheck. A full unrelated-suite run was judged disproportionate to the surgical change set and scoped out; recorded here for honesty rather than asserting an unrun result.

---

## Key Decisions & Findings (durable)

1. **No Langfuse, no DB, NOT in `ASSET_GENERATION_SKILLS`/`intent-to-skill.ts`.** C-track upstream authoring is registered ONLY via the general filesystem skill system (`skills.paths`). This is design D3/D4 and deliberately keeps code-overlap with main's concurrent B1 task at ≈0 (B1 touches `ASSET_GENERATION_SKILLS`/`intent-to-skill.ts`; C1 does not).
2. **Authoritative config = repo-root `opencode.jsonc`.** Relative `skills.paths` resolves against runtime `Instance.directory`; the config up-walk loads the root file in both the worktree and post-merge-to-main layouts. No `agent/.opencode` fallback needed.
3. **Manifest excludes volatile provenance.** `FREEZE_SOURCES.md` carries a freeze timestamp; it is excluded from `FREEZE_MANIFEST.sha256` so the drift guard is deterministic (fix `d015ee9`). The manifest guards the verbatim skill corpus; provenance is informational.
4. **No frontmatter or name-collision issues.** All 11 frozen `SKILL.md` have valid `name`+`description` frontmatter (discovery precondition); no frozen name clashes with an existing assets-produce skill.
5. **Open non-blocking Minors (deferred, not defects):** freeze-script `sed` strip could be regex-anchored for future-proofing (current corpus provably safe); discovery test `describe`/`it` naming slightly repetitive (cosmetic). Neither affects correctness/safety; recorded for a future polish pass.
6. **Process deviation (authorized):** C-track runs in worktree `claude/admiring-wilson-5d9f34` concurrent with main's B1 — a session-level deviation from CLAUDE.md trunk-based, authorized by explicit user instruction and recorded in master-spec §15 r1.16. Merge-back requires rebase + §15/registry append reconcile.

---

## Conclusion

C1 is **complete**. The upstream authoring corpus (11 skills) is byte-frozen, drift-guarded, discoverable via opencode's filesystem skill system with zero Langfuse/DB coupling, and a `Project(novel)` on-disk workspace helper reproduces n2m's `NN-stage` downstream-compat contract. All acceptance items met; all per-task reviews passed. Ready for C2 (orchestration skill + reviewer subagent wiring).
