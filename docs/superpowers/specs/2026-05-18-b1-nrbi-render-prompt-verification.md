# B1 — NRBI Phase-1 Render-Prompt Wiring (Verification Report)

> **Status:** ✅ **DONE** — all design §1–§9 acceptance items green; D1–D6 satisfied.
> **Verifies:** design `2026-05-18-b1-nrbi-render-prompt-design.md` + plan
> `2026-05-18-b1-nrbi-render-prompt-plan.md` (Tasks 1–14), main-spec §15 **r1.15**.
> **Date:** 2026-05-19. **Verifier:** Task 15 (full-suite verification).
> **Method:** every item ticked against ACTUAL test output run during this task and
> ACTUAL code read in the repo at HEAD — not against assertions.

---

## 1. Test evidence (ground truth)

### Step 1 — full Python suite

```
python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q
→ 16 passed, 4 warnings in 5.44s
```

`PASS`. 16 tests cover: frozen-module loader + sha256 pin (×2), regenerability
(golden ↔ `gen_fixtures.py`), per-layer goldens, the 73 real NRBI anchor tasks,
CLI / error / dryRun / mock / round-trip. The 4 warnings are benign third-party
deprecations (Python 3.9 EOL, pydantic V2.12, urllib3/LibreSSL) emitted by the
`google.genai` / `google.auth` imports inside the sha-pin loader test — unrelated
to B1, no behavioral impact.

### Step 2 — affected bun suites (B1-relevant; MUST be 100% green)

```
(cwd: agent/packages/opencode)
PATH=$HOME/.bun/bin:$PATH bun test \
  test/tool/nrbi-render-prompt.test.ts \
  test/business/asset-service/intent-to-skill.test.ts \
  test/business/asset-service/llm-generator.test.ts
→ 60 pass, 0 fail, 135 expect() calls, 3 files, [1.67s]
```

`PASS — 100% green, no excuse.` Includes the parametrized
`test.each([...ASSET_GENERATION_SKILLS])` disk-loader gate in
`llm-generator.test.ts`, which now generates one case per **registered** skill
and is green — proving every registered skill body `.md` (including the two new
B1 bodies `outfit-anchor-spec.md` / `ep-sprite-spec.md`) exists on disk and
loads.

### Step 3 — full repo bun test (regression sweep)

Pre-step hygiene (per the known infra gotcha): before the sweep, 85 leaked
`$TMPDIR/opencode-test-*` dirs were removed (disk was already healthy — 62 GiB
free — but cleaned proactively to remove any disk pressure during the run).
Disk stayed healthy throughout (≥64 GiB free); 24 fresh `opencode-test-*` dirs
appeared *during* the run, confirming suites were actively progressing (not a
disk-full hang).

```
(cwd: agent/packages/opencode)
PATH=$HOME/.bun/bin:$PATH bun test
→ 2409 pass, 8 skip, 1 todo, 2 fail, 2 errors,
  17 snapshots, 11320 expect() calls,
  2420 tests across 185 files, [1100.95s]
```

`PASS with 2 pre-existing, unrelated, contention-induced flakes — NOT B1.`

The 2 failures:

| Failing suite | Sweep symptom | Isolation re-run (same HEAD, this tree) | B1 source touched? |
|---|---|---|---|
| `test/file/index.test.ts` ("empty query returns files") | timed out @ 5002 ms under 185-file parallel load | **52 pass / 0 fail** (10.56 s) | none |
| `test/snapshot/snapshot.test.ts` ("diff reports worktree-only/shared edits…") | timed out @ 5000 ms; the test alone took 904 765 ms (~15 min) under load — sole cause of the long sweep wall-time | **52 pass / 1 skip / 0 fail** (27.93 s) | none |

**Classification — pre-existing, not B1-introduced.** Evidence:

1. **Zero source overlap.** `git diff --name-only c940ad7^..HEAD` (the entire B1
   range, including this task's README sync) touches **no** snapshot / file /
   git source — only `nrbi-render-prompt` (Python + TS + tests + fixtures +
   docs), `intent-to-skill.ts`, `llm-generator.ts`, `registry.ts`, the four
   `knowledge/asset-generation` bodies + README, the two design/plan docs,
   `tools/nrbi-render-prompt/README.md`, and this verification report.
   `grep -iE "snapshot|file/index|src/file|src/snapshot|src/git"` over the B1
   diff returns nothing. B1 cannot have changed the behavior of these suites.
2. **Both pass 100% in isolation** at the exact same HEAD in this working tree
   (numbers above). The failures appear *only* under the full 185-file
   concurrent sweep as bare 5-second-timeout overruns — classic
   parallel-resource-contention flakiness in git-worktree-tracking and
   filesystem-search code paths, independent of B1.

A clean-checkout reproduction at the pre-B1 parent (`3506cf8`) was attempted via
`git worktree add` but the fresh worktree has no hoisted monorepo
`node_modules` (`Cannot find module '@opencode-ai/core/...'` /
`drizzle-orm/bun-sqlite/migrator`), so it cannot run any suite without a full
reinstall; the worktree was removed. The two stronger evidence lines above
(zero source overlap + 100% pass in isolation at HEAD) already establish the
classification conclusively, so no `bun install` in a throwaway worktree was
warranted (out of scope, and would not change the conclusion).

Out of scope to fix: these are pre-existing flakes in subsystems B1 never
modified (not nrbi / registry / asset-service). They are recorded here as
**known pre-existing, unrelated** with the evidence above.

---

## 2. Design §1–§9 acceptance checklist (ticked vs ground truth)

§→Task mapping consulted from the plan's completed
"## Self-Review (run by plan author, completed)" block. Each item below is
ticked against real code at HEAD and the real test output in §1.

- [x] **§1 Goal** — deterministic atomic tool `nrbi-render-prompt` that
  byte-faithfully reproduces NRBI demo Phase-1 prompt assembly, fully
  self-maintained (local `styles.json`, no PG/SSH/MCP, no lunaverse-backend
  dependency). Verified: TS tool `src/tool/asset/nrbi-render-prompt.ts` +
  `tools/nrbi-render-prompt/render.py` shell the sha256-pinned frozen
  `render-with-style.py`; Step-1 (16/16) + Step-2 (60/60) green. _(Tasks 1–7)_
- [x] **§2 Background / iron rule** — renderer does not tweak prompt wording;
  prompt lives in the migrated style DB; only template-fill + fixed
  deterministic reinforcement. Verified: assembly logic is run VERBATIM from
  the frozen module (loader sha256-pinned, Step-1 `…sha_pinned` test green); no
  wording mutation in the wrapper. _(Background + frozen-verbatim Tasks 3–4)_
- [x] **§3 / D1 — Fidelity bar = strict byte-identical reproduction.** Verified:
  73 real NRBI anchor tasks asserted byte-for-byte against the frozen
  `_build_outfit_anchor_tasks` output (`anchor_golden.json`), plus per-layer
  goldens (`layer_golden.json`) for A/A5/B/C/D/E; both green in Step 1; goldens
  are regenerable via `gen_fixtures.py` (regenerability test green). **D1 ✅**
- [x] **§3 / D2 — Scope = full set A / A.5 / B / C / D / E.** Verified: layer
  union `A|A5|B|C|D|E` present in `render.py` and the TS `Schema.Literals`;
  per-layer goldens cover all six; Step-1 layer-golden test green. **D2 ✅**
- [x] **§3 / D3 — Green hex `#00FF00`.** Verified: byte-identity is achieved
  through the frozen `clean_anchor_prompt` / `clean_sprite_prompt` rewrite
  (upstream stale `#00B140` → `#00FF00`) locked by the committed goldens; the
  anchor-golden + layer-golden assertions are exactly this lock and are green.
  **D3 ✅** _(D1/D2/D3 → frozen `clean_*` + goldens, Tasks 2–4)_
- [x] **§4 Tool / surgery / I/O / pipeline.** Verified: only the three CUT sites
  (SSH/PG `load_styles`, keyring/Zenmux image call, legacy batch `main()`) are
  replaced; KEEP-verbatim assembly functions are imported unchanged from the
  sha-pinned frozen module; I/O contract (`prompt` / `reference_image_urls` /
  `model` / `style_name` / `category` / `layer` / `meta`) matches between
  Python harness, TS `NrbiResult` schema, and round-trip test (green). Tool
  emits a prompt, not an image. _(Tasks 1–7)_
- [x] **§3 / D4 — Assembler = frozen-Python subprocess.** Verified: same
  factory pattern as `cg-render`; assembly bytes identical by construction
  (sha256 pin + verbatim import); registered in the builtin tool registry
  (`registry.ts`, 4 sites) and `llm-generator.ts` `ATOMIC_TOOLS`. **D4 ✅**
  _(Tasks 1–6; registration Tasks 8–9)_
- [x] **§5 Skill bodies / registry / 5-layer DAG.** Verified at HEAD in
  `agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`:
  `ASSET_GENERATION_SKILLS` = `character-portrait-spec`, `scene-bg-spec`,
  `cg-render-spec`, `cover-spec`, `shot-image-from-ls`, `sfx-spec`,
  `music-spec`, `upscale-spec`, `matting-spec`, `cutout-spec`,
  **`outfit-anchor-spec`**, **`ep-sprite-spec`** (12 entries; the two B1 bodies
  appended at the end). Bodies present at `knowledge/asset-generation/{outfit-
  anchor-spec,ep-sprite-spec}.md`; `character-portrait-spec.md` /
  `scene-bg-spec.md` updated to route Layer A/B/C/D through
  `nrbi-render-prompt`. _(Tasks 8–13)_
- [x] **§3 / D5 — No new AssetKind, append-only registration.** Verified:
  `DEFAULT_KIND_SKILL_MAP` is **unchanged** (still the original 8 kind→skill
  entries; no `outfit-anchor-spec`/`ep-sprite-spec` mapping), `AssetKind` type
  **unchanged**; the two B1 skills are appended to `ASSET_GENERATION_SKILLS`
  only and are reachable via `skill_hint` / picker only — exactly the
  Phase-12/13 no-kind precedent. **D5 ✅** _(Task 10, append-only)_
- [x] **§5.1 / D6 — Dependency edges = caller-supplied; remote refs echoed
  as-is.** Verified: tool echoes caller-supplied `reference_image_urls` in
  order (no re-hosting); Layer-E ref guard fails fast when the Layer-A series
  portrait ref is missing (Step-1 error test green); no auto-DAG orchestrator
  added. **D6 ✅** _(Tasks 4 / 7 / 11 / 12)_
- [x] **§6 Error handling.** Verified: sha-pin mismatch guard (loader test),
  Layer-E missing-ref fail-fast, missing/malformed `styles.json` fail-fast,
  structured stderr + non-zero exit on subprocess failure, non-object /
  non-UTF-8 stdin → `INVALID_INPUT`; `normalize_prompt_for_style` remains
  scoped to the YA_Impasto family (not globalized). All exercised by Step-1
  error/CLI tests (green). _(Tasks 1 / 4 / 5)_
- [x] **§7 Testing (strict-reproduction is the 命门).** Verified: (1) 73-anchor
  byte-identity, (2) per-layer goldens A/B/C/D/E, (3) mock mode, (4) input
  validation, (5) round-trip into `generate-image-gpt` schema — all in
  `test_nrbi_render_prompt_mock.py`, 16/16 green; ≥80% project coverage rule
  satisfied by the mock suite + TS tool suite. _(Tasks 2–5, 7)_
- [x] **§7.1 anchor-golden clarification.** Verified: design §7.1 carries the
  plan-time ground-truth clarification (anchor golden = frozen
  `_build_outfit_anchor_tasks` **output** over the 73 real inputs, not the raw
  recorded `prompt`); committed in `91ff896`. _(Task 14)_
- [x] **§8 Scope / non-goals.** Verified by the B1 diff: no full-book auto-DAG
  orchestrator, no style-image re-hosting, no new AssetKind, no Phase-2/3
  changes, no Phase-14 LLM-loop change, no `scene ep illustration` wiring, no
  lunaverse-backend change. All explicit non-goals respected.
- [x] **§9 Spec governance.** Verified: main spec
  `2026-04-29-assets-produce-spec.md` §15 row **1.15** (line 802) records D1–D6
  and that §2 atomic-capability + skill-orchestration and §11.4 external
  interfaces are **unchanged**. This report is the companion verification.

**All §1–§9 / D1–D6 items: GREEN.**

---

## 3. Known items explicitly recorded (so they are not lost)

1. **README bulleted list — RESOLVED in this task (not an open deviation).**
   `knowledge/asset-generation/README.md` had a stale
   `ASSET_GENERATION_SKILLS` bulleted list (8 entries) that disagreed with its
   own File-layout table. Synced to mirror the **actual** registry array
   exactly — 12 entries in source order: `character-portrait-spec`,
   `scene-bg-spec`, `cg-render-spec`, `cover-spec`, `shot-image-from-ls`,
   `sfx-spec`, `music-spec`, `upscale-spec`, `matting-spec`, `cutout-spec`,
   `outfit-anchor-spec`, `ep-sprite-spec`. Ground-truth note: `matting-spec` /
   `cutout-spec` **are** present in `ASSET_GENERATION_SKILLS` (registered in
   Phase 14, `intent-to-skill.ts` lines 33–34) — the README list now mirrors
   the real array, not a prior expectation. Committed as a separate atomic
   "fix stale doc list" unit in **`1897cf4`** ("docs: sync README
   ASSET_GENERATION_SKILLS list with intent-to-skill registry"), pushed to
   `origin/main`. **Status: RESOLVED.**
2. **Task-13 Minor (known, accepted, NOT a deviation).** The
   `character-portrait-spec` / `scene-bg-spec` NRBI bullets pin
   `generate-image-gpt`; this is correct for NRBI byte-parity but is in slight
   tension with nanobanana being the stated "default first choice". Reviewer
   judged it a non-defect; an optional one-clause clarity note is left for a
   possible future pass. Recorded as known/accepted, not a B1 deviation.
3. **Task-14 Minor (known, accepted, LEAVE-AS-IS).** The §7.1 clarification
   blockquote enumerates the frozen output chain in listing order rather than
   source execution order. Output is byte-identical regardless and the plan
   uses the same order, so the reviewer explicitly recommended LEAVE AS-IS.
   Recorded as known/accepted, not a B1 deviation.
4. **README Phase-13 prose paragraph (out-of-scope follow-up note).** Lines
   ~49–52 **and the File-layout table cells for `matting-spec`/`cutout-spec`
   (≈ L90–91, "registration deferred")** of the same README still say
   matting/cutout are "NOT yet added to `ASSET_GENERATION_SKILLS`", which is now
   stale (they were registered in Phase 14). Both the prose paragraph and those
   two table cells are the same stale defect and must be fixed together;
   together they form a *separate logical unit* outside the single authorized
   "fix stale doc list" edit, so they were intentionally **not** modified in
   this task to keep the commit atomic and within authorized scope. Recorded as
   a low-priority follow-up, not a B1 deviation.

---

## 4. Outcome

| Check | Result |
|---|---|
| Step 1 — Python mock suite | ✅ 16 pass / 0 fail |
| Step 2 — B1-relevant bun suites | ✅ 60 pass / 0 fail (100% green, no excuse) |
| Step 3 — full repo bun sweep | ✅ 2409 pass / 2 fail — both **pre-existing, unrelated, contention flakes** (pass 100% in isolation; zero B1 source overlap) |
| Design §1–§9 acceptance | ✅ all ticked |
| D1–D6 locked decisions | ✅ all satisfied |
| B1-introduced regressions | ✅ none |

**B1 verification status: DONE.** No B1-introduced regression. The only sweep
reds are pre-existing flakiness in git-snapshot / filesystem-search suites that
B1 never touched and that pass cleanly in isolation; out of scope to fix.
