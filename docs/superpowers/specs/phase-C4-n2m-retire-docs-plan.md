# C4 — n2m Retirement + Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire n2m's upstream authoring pipeline (DEPRECATED header on its 10 upstream skills, push gated on explicit user ack), update assets-produce docs to declare it the sole novel→LS authority, and write the C4 + whole-C-track verification report — closing the C-track.

**Architecture:** C4 is documentation + a single cross-repo comment-only commit. Zero product code changes. assets-produce-side doc tasks run through normal subagent-driven two-stage review. The n2m edit/commit/push is a **separate, controller-executed, hard-gated stop-and-ask** (non-user namespace `cdotlock`/`LinghuC2333` per the global git red line + design §9/D7) — it is **never** delegated to a subagent and **nothing** is touched in `/Users/august/MobAI/novels-to-lunascript` until the user explicitly authorizes it in chat.

**Tech Stack:** Markdown only (assets-produce `README.md`, `SKILL.md`, `knowledge/novel-to-ls/README.md`, `FREEZE_SOURCES.md`, n2m `skills/<name>/SKILL.md`); existing Bun test suite as the no-regression guard (no new product code, so no new unit code-coverage target — design §7: "Frozen prose is not code-covered").

---

## Source-of-truth facts (verified pre-plan, do not re-derive)

- **Design:** `2026-05-19-upstream-authoring-migration-design.md` — C4 row (§6), D7, §2.2, §5, §7, §8, §9, §10 risk row "Frozen prose drifts from n2m later".
- **Master spec §15 r1.16** already records the whole C-track (line 804). Per design §11, r1.16 is the index entry and the design doc is the authoritative detail; **C1/C2/C3 added no new §15 row** — refinements went into design §8.x + the per-phase verification report. C4 follows the same: **no new §15 row** unless a genuine deviation from the approved design arises (then STOP and ask the user per CLAUDE.md).
- **C0–C3 are closed & green** (verification reports on disk): C1 `phase-C1-skill-freeze-ingest-verification.md`, C2 `phase-C2-orchestration-reviewers-verification.md`, C3 `phase-C3-ls-validate-e2e-verification.md`. Branch synced at `f4be4ea`.
- **n2m's 10 in-scope upstream authoring skills** (design §4.1 table; all `SKILL.md` present at n2m HEAD `8049ac7`, which equals the C1/C3 freeze provenance commit `8049ac772f7350ea593519fbeb891ccaee488c9c`):
  `novel-evaluator`, `character-architect`, `bible-reviewer`, `entity-planner`, `planner-reviewer`, `entity-normalizer`, `entity-rename`, `rename-reviewer`, `episode-writer`, `episode-writer-reviewer`.
- **`arc-reviewer` is OUT of the n2m-header scope by design** — it is the "+1 **project-scoped**" skill in §4.1 (n2m path `lunascripts/no-rules-in-bad-ideas/skills/arc-reviewer/`, a per-book reviewer template, **not** a top-level `n2m/skills/<name>`). D7 and the §6 C4 row both say precisely **"10 upstream skills"**. Excluding arc-reviewer's per-book copy is therefore the design's explicit intent, not a gap — recorded in Task 4. (It is still frozen in assets-produce as the 11th corpus entry; this is unaffected.) **Not deleted** anywhere (D7).
- **n2m downstream stays** (§2.2/§5): `asset-prompt-generator`, `asset-reviewer`, `music-normalizer`, `sfx-normalizer`, `outfit-anchor-renderer`, `wardrobe-consolidator`, all `dramatizer/` — **NOT** deprecated, continue in n2m. C4 touches only the 10 authoring `SKILL.md`.
- **Freeze drift guard scope (verified):** `agent/packages/opencode/test/skill/novel-to-ls-freeze.test.ts` iterates **only the lines of `FREEZE_MANIFEST.sha256`** (55 manifest-listed frozen files) and the directory test asserts `dirs.toContain(name)` for the 11 EXPECTED dirs (not exact-equality). Therefore **adding a new top-level `knowledge/novel-to-ls/README.md` does NOT touch the manifest and does NOT break the drift guard or the 11-dir test**; `FREEZE_SOURCES.md` is excluded from the manifest (C1 note 3, volatile provenance) so appending to it is safe. The hard rule: **do not modify any of the 55 manifest-listed frozen files.**
- **n2m remote = non-user namespace** (`git remote -v` showed `old-linghuc → github.com/LinghuC2333/novels-to-lunascript`; canonical is `cdotlock/novels-to-lunascript`). Either way it is NOT the user's `AugustZAD`/`s98081096` namespace ⇒ the global git red line applies in full: **explicit chat ack required before any push; given the lunaverse-backend incident sensitivity, the n2m working tree is not touched at all until ack.**

---

## File Structure

| File | C4 action | Gated? |
|---|---|---|
| `knowledge/novel-to-ls/README.md` | **Create** — corpus index (mirrors `novel-to-video/README.md` / `asset-generation/README.md` convention) | no |
| `knowledge/novel-to-ls/FREEZE_SOURCES.md` | **Append** — C4 retirement / authoritative-divergence note (not manifest-pinned) | no |
| `README.md` (repo root) | **Edit** — add `knowledge/novel-to-ls/` to Layout; correct the n2m consumer note to reflect authoring-half ownership | no |
| `SKILL.md` (repo root) | **Edit** — §7 add novel-to-ls local corpus; add `ls-validate` registered-tool + `novel_to_ls` orchestration pointer | no |
| `/Users/august/MobAI/novels-to-lunascript/skills/<10 names>/SKILL.md` | **Prepend DEPRECATED block** after frontmatter, single atomic commit, push | **YES — hard gate** |
| `docs/superpowers/specs/phase-C4-n2m-retire-docs-verification.md` | **Create** — C4 acceptance matrix + whole-C-track rollup | no |
| `docs/superpowers/specs/2026-05-19-upstream-authoring-migration-design.md` | **Append §8.3** only if a refinement is recorded (e.g. n2m-push-deferred status) | no |

No product code changes anywhere. No `agent/` source touched. No master-spec edit (unless a genuine deviation ⇒ STOP+ask).

---

### Task 1: assets-produce knowledge corpus index + provenance note

**Files:**
- Create: `knowledge/novel-to-ls/README.md`
- Modify: `knowledge/novel-to-ls/FREEZE_SOURCES.md` (append only)
- Guard: `agent/packages/opencode/test/skill/novel-to-ls-freeze.test.ts`, `agent/packages/opencode/test/skill/novel-to-ls-discovery.test.ts` (must stay green — proves no frozen file touched & discovery still finds 11)

- [ ] **Step 1: Capture the pre-change green baseline**

Run (from repo root):
```bash
cd agent/packages/opencode && bun test test/skill/novel-to-ls-freeze.test.ts test/skill/novel-to-ls-discovery.test.ts --timeout 30000 ; cd -
```
Expected: all pass (freeze 3/3 incl. 55-file no-drift; discovery asserts 11 names, filesystem location, no Langfuse/DB). Record the pass counts — this is the invariant Task 1 must not regress.

- [ ] **Step 2: Create `knowledge/novel-to-ls/README.md`**

Write exactly (mirrors the other corpora READMEs' "what this is / active files / provenance" shape; states the C-track ownership + that, unlike `novel-to-video`, this corpus **is** runtime-discovered via `skills.paths`):

```markdown
# Novel To LS Knowledge Pack

This directory is the local self-contained, **byte-frozen** source for the
novel → `.ls` *authoring* pipeline migrated from `cdotlock/novels-to-lunascript`
(n2m). As of the C-track (master-spec §15 r1.16), **assets-produce is the sole
authoritative owner** of this pipeline; n2m's upstream copies are retired
(DEPRECATED header, comment-only, not deleted — design D7).

Unlike `knowledge/novel-to-video/` (inert), this corpus **is** runtime-active:
each `<name>/SKILL.md` is discovered via the opencode filesystem skill system
(`skills.paths` → `knowledge/novel-to-ls`, design §4.3), served verbatim from
disk with **zero Langfuse / DB coupling**.

## Frozen authoring skills (11)

Driven by the `novel_to_ls/` orchestration skill (the stage DAG + reviewer-gate
semantics; design §4.2). 10 are n2m's global upstream authoring skills; the 11th
(`arc-reviewer`) is n2m's per-book reviewer template, frozen as the reference
copy.

| Skill dir | Role |
|---|---|
| `novel-evaluator/` | GO/NO-GO novel screen |
| `character-architect/` | producer — character bible |
| `bible-reviewer/` | reviewer — bible gate |
| `entity-planner/` | producer — per-LI-route plan |
| `planner-reviewer/` | reviewer — plan gate |
| `entity-normalizer/` | producer — characters/locations/alias json |
| `entity-rename/` | producer — optional copyright desensitization |
| `rename-reviewer/` | reviewer — rename gate |
| `episode-writer/` | producer — `.ls` script |
| `episode-writer-reviewer/` | reviewer — episode craft gate |
| `arc-reviewer/` | reviewer — per-book arc (project-scoped template) |
| `novel_to_ls/` | **orchestration skill** — stage sequencing + gate contract (authored, not frozen) |

## Validation

`.ls` output is gated by the **`ls-validate`** registered atomic tool
(`tools/ls-validate/`, frozen `cdotlock/lunascripts@b36a407` Go source,
sha256 drift-guarded — design §4.6 / §8.2). `agent tools list` discovers it.

## Provenance & drift

- `FREEZE_SOURCES.md` — n2m freeze commit + per-skill source paths + C4 retirement note.
- `FREEZE_MANIFEST.sha256` — sha256 of every frozen file; guarded by
  `agent/packages/opencode/test/skill/novel-to-ls-freeze.test.ts`.
- After C4, the assets-produce frozen copies and n2m's source intentionally
  differ by exactly the n2m-side DEPRECATED header (design §10 risk row); this
  is **by-design retirement, not drift** — assets-produce is authoritative.

## Design

`docs/superpowers/specs/2026-05-19-upstream-authoring-migration-design.md`
(C-track C0–C4; master-spec §15 r1.16). Per-phase verification reports:
`docs/superpowers/specs/phase-C{0..4}-*-verification.md`.
```

- [ ] **Step 3: Append the C4 retirement note to `FREEZE_SOURCES.md`**

Append (after the existing source-mapping list, leave the existing lines byte-identical):

```markdown

## C4 — n2m upstream retired (master-spec §15 r1.16)

As of the C-track close, n2m's 10 upstream authoring `skills/<name>/SKILL.md`
carry a comment-only DEPRECATED header pointing here; assets-produce is the
single source of truth. n2m copies are **retained, not deleted** (D7). From
this point the assets-produce frozen copy and the live n2m source intentionally
diverge by exactly that header — this is designed retirement, not drift. The
n2m commit's push status (committed locally vs pushed) is recorded in
`phase-C4-n2m-retire-docs-verification.md` (push is gated on explicit user ack
— global git red line, non-user namespace).
```

- [ ] **Step 4: Verify the freeze + discovery guard is still green (no frozen file touched)**

Run:
```bash
cd agent/packages/opencode && bun test test/skill/novel-to-ls-freeze.test.ts test/skill/novel-to-ls-discovery.test.ts --timeout 30000 ; cd -
```
Expected: identical pass counts to Step 1 (55-file no-drift still green ⇒ no manifest-listed file changed; discovery still finds 11 ⇒ the new top-level `README.md` is not mis-discovered as a skill). If drift fails → a frozen file was touched; revert and redo.

- [ ] **Step 5: Commit (atomic — one logical unit: corpus index + provenance note)**

```bash
git add knowledge/novel-to-ls/README.md knowledge/novel-to-ls/FREEZE_SOURCES.md
git commit -m "docs: add novel-to-ls corpus index + C4 retirement provenance note"
git push
```
(assets-produce = `cdotlock/assets-produce`, memory-authorized, no per-push ask.)

---

### Task 2: assets-produce top-level docs (README + SKILL)

**Files:**
- Modify: `README.md` (repo root)
- Modify: `SKILL.md` (repo root)

- [ ] **Step 1: `README.md` — add the corpus to Layout**

In the `## Layout` list, after the `knowledge/novel-to-video/` bullet (line ~17), insert:
```markdown
- [`knowledge/novel-to-ls/`](knowledge/novel-to-ls/) — self-contained **byte-frozen** novel→`.ls` authoring corpus (11 skills + `novel_to_ls` orchestration; migrated from n2m, now authoritative — §15 r1.16)
```

- [ ] **Step 2: `README.md` — correct the n2m consumer note**

In `## 对外 Asset 服务（三仓接入）`, the `novels-to-lunascript` bullet currently says it only calls `lookup`. Replace that single bullet with:
```markdown
- **novels-to-lunascript** — 上游写作流水线（选小说→`.ls`）已迁入本仓自维护（C-track，§15 r1.16），n2m 上游退役（DEPRECATED 注释，未删）。n2m 侧只保留**下游**（asset-prompt-generator / dramatizer 等），仍按 `lookup` 拉已生产 Asset URL
```
(Do not touch the `lunaverse-backend` bullet or any other section — atomic scope.)

- [ ] **Step 3: `SKILL.md` — §7 add the novel-to-ls local corpus**

In `## 7. Architecture in 3 lines`, the sentence currently names only `knowledge/novel-to-video/` as the local self-contained source. Append one sentence at the end of that paragraph (before the closing spec link sentence):
```markdown
The novel→`.ls` authoring pipeline is likewise local and self-contained under
[`knowledge/novel-to-ls/`](knowledge/novel-to-ls/) (byte-frozen from n2m,
runtime-discovered via `skills.paths`; n2m's upstream retired — §15 r1.16).
```

- [ ] **Step 4: `SKILL.md` — add the ls-validate tool + novel_to_ls pointer**

At the end of `## 9. Available asset production tools (Phase 9+)` table, add a row (keep the existing "Offline CLIs" / `detect-matting` rows; insert `ls-validate` above the "Offline CLIs" row):
```markdown
| `ls-validate` | `agent tools show ls-validate` | C-track — wraps `tools/ls-validate/` (frozen `cdotlock/lunascripts@b36a407` Go LS parser, sha256 drift-guarded). `mock: true` runs without a Go toolchain. The `.ls` quality gate for the `novel_to_ls` authoring pipeline (NOT asset generation; NOT in `ASSET_GENERATION_SKILLS`). |
```
Then directly under the `### When the loop should pick each atomic tool` list's last bullet, add:
```markdown
- **Novel→`.ls` authoring (C-track)** — not part of the asset-generation
  loop. An agent (developer profile) drives it via the `novel_to_ls`
  orchestration skill in [`knowledge/novel-to-ls/`](knowledge/novel-to-ls/):
  walk the stage DAG, dispatch fresh-context reviewer sub-agents
  (PASS/CONDITIONAL/FAIL gate), and gate each `.ls` with the `ls-validate`
  tool before declaring an episode/route FINAL. See
  [`knowledge/novel-to-ls/README.md`](knowledge/novel-to-ls/README.md).
```

- [ ] **Step 5: Grep-verify the doc invariants**

Run (from repo root):
```bash
grep -q 'knowledge/novel-to-ls/' README.md && \
grep -q '上游写作流水线（选小说' README.md && \
grep -q 'knowledge/novel-to-ls/' SKILL.md && \
grep -q 'ls-validate' SKILL.md && \
grep -q 'novel_to_ls' SKILL.md && echo "DOC INVARIANTS OK"
```
Expected: `DOC INVARIANTS OK`.

- [ ] **Step 6: Confirm no product/test regression (docs-only change)**

Run:
```bash
cd agent/packages/opencode && bun test test/skill/novel-to-ls-freeze.test.ts test/skill/novel-to-ls-discovery.test.ts --timeout 30000 ; cd -
```
Expected: unchanged green (sanity that nothing under `agent/` or `knowledge/` frozen was touched).

- [ ] **Step 7: Commit (atomic — one logical unit: top-level docs reflect novel→LS ownership)**

```bash
git add README.md SKILL.md
git commit -m "docs: declare assets-produce the novel->LS authority in README + SKILL"
git push
```

---

### Task 3: n2m DEPRECATED headers — **HARD-GATED, controller-only, separate stop-and-ask**

> **DO NOT delegate this to a subagent. DO NOT touch `/Users/august/MobAI/novels-to-lunascript` — not even a local edit or local commit — until the user explicitly authorizes it in chat.** n2m is a non-user namespace (`cdotlock`/`LinghuC2333`); the global git red line + the lunaverse-backend incident memory + design §9/D7 require explicit chat ack for any cross-repo write/push. The controller (not a subagent) executes this only after ack. If ack is not given this session, it is recorded as "prepared, push pending user ack" (Phase 9/10/13 backend-ack precedent) and the C-track still closes.

**Files (n2m repo, 10 exact paths):**
`/Users/august/MobAI/novels-to-lunascript/skills/{novel-evaluator,character-architect,bible-reviewer,entity-planner,planner-reviewer,entity-normalizer,entity-rename,rename-reviewer,episode-writer,episode-writer-reviewer}/SKILL.md`

- [ ] **Step 1: STOP — present the exact change & ask for explicit ack**

Surface to the user (plain language) a stop-and-ask containing: (a) the exact 10 file paths, (b) the verbatim DEPRECATED block below, (c) the single atomic commit message, (d) the exact push target & command, (e) that nothing in n2m has been or will be touched until they say go, (f) that this is non-user-namespace so global policy mandates their explicit chat ack. Use `AskUserQuestion` (or an explicit plain-language stop) — options: "Yes, edit + commit + push to n2m now" / "Edit + local commit only, do NOT push" / "Skip n2m this session (record as pending ack)". Do not proceed past this step without an explicit answer.

- [ ] **Step 2 (only after ack): Re-verify n2m state**

```bash
cd /Users/august/MobAI/novels-to-lunascript && git status --short && git rev-parse HEAD && git remote -v
```
Expected: clean tree, HEAD `8049ac7…` (the freeze provenance commit; if it has moved, re-confirm with the user before editing — the header text references the frozen mapping). Confirm the push remote/branch the user authorized.

- [ ] **Step 3 (only after ack): Prepend the DEPRECATED block to each of the 10 SKILL.md**

For every file, insert this block **immediately after the closing `---` of the YAML frontmatter and before the first `#` heading** (so frontmatter still parses — n2m skills must still load; D7 = retire, not break). `<NAME>` = that skill's directory name (e.g. `novel-evaluator`). The frozen-body bytes are NOT otherwise altered (verbatim except this prepended block).

```markdown

> **⚠️ DEPRECATED — upstream authoring migrated to `assets-produce`.**
>
> This skill is part of the novel → `.ls` *authoring* pipeline, which has been
> migrated **verbatim** into the `cdotlock/assets-produce` repo and is now
> maintained there as the single source of truth:
>
> - frozen skill body: `knowledge/novel-to-ls/<NAME>/SKILL.md`
> - driven by the `novel_to_ls` orchestration skill + the `ls-validate` atomic tool
> - design: `assets-produce` `docs/superpowers/specs/2026-05-19-upstream-authoring-migration-design.md` (master-spec §15 r1.16)
>
> This n2m copy is **retained for history only** (not deleted) and is **no
> longer authoritative**. Do not edit here — changes will not propagate.
> n2m's *downstream* stages (asset-prompt-generator, dramatizer, …) are
> unaffected and continue to run in this repo.

```

- [ ] **Step 4 (only after ack): Verify the edit is correct and bounded**

```bash
cd /Users/august/MobAI/novels-to-lunascript && \
git diff --stat && \
grep -lc 'DEPRECATED — upstream authoring migrated' skills/*/SKILL.md | sort && \
git diff -- skills/episode-writer/SKILL.md | head -30
```
Expected: exactly 10 files changed, each with the header added once, frontmatter intact (the `---\nname:` block is still the file head before the inserted blockquote), no downstream skill touched, no companion file touched.

- [ ] **Step 5 (only after ack): Single atomic commit**

```bash
cd /Users/august/MobAI/novels-to-lunascript && \
git add skills/novel-evaluator/SKILL.md skills/character-architect/SKILL.md skills/bible-reviewer/SKILL.md skills/entity-planner/SKILL.md skills/planner-reviewer/SKILL.md skills/entity-normalizer/SKILL.md skills/entity-rename/SKILL.md skills/rename-reviewer/SKILL.md skills/episode-writer/SKILL.md skills/episode-writer-reviewer/SKILL.md && \
git commit -m "docs: DEPRECATED — upstream authoring migrated to assets-produce (10 skills)"
```
(One logical unit: one comment-only header across the 10 retiring skills. No code, no deletion.)

- [ ] **Step 6 (only if the user authorized push in Step 1): Push to the user-authorized n2m remote/branch**

Use exactly the remote+branch the user named in Step 1 (do NOT assume `origin`/`main`). After push, capture the pushed commit SHA for the verification report.

- [ ] **Step 7: Record the outcome for Task 4**

Note which Step-1 option the user chose and the resulting state: pushed SHA, or "local commit only" SHA, or "skipped — pending ack". This feeds the Task 4 verification report's n2m-status row honestly (no overclaim).

---

### Task 4: C4 + whole-C-track verification report

**Files:**
- Create: `docs/superpowers/specs/phase-C4-n2m-retire-docs-verification.md`
- Modify (only if a refinement must be recorded): `docs/superpowers/specs/2026-05-19-upstream-authoring-migration-design.md` (append a §8.3 — e.g. n2m-push-deferred status — ONLY if applicable; otherwise leave untouched)

- [ ] **Step 1: Gather C-track rollup evidence**

Read the C0–C3 verification reports' conclusion lines and acceptance matrices (already on disk). Run the final regression: from repo root
```bash
cd agent/packages/opencode && bun test test/skill test/business test/tool/ls-validate* --timeout 60000 ; cd - && cd agent && bun run typecheck ; cd -
```
Record actual pass/fail counts (transient combined-run timeouts isolated per-suite as in C3 — document, do not overclaim).

- [ ] **Step 2: Write `phase-C4-n2m-retire-docs-verification.md`**

Sections (no placeholders — fill with the run's real numbers and the Task-3 real outcome):
1. **C4 acceptance matrix vs design §6 C4 row** — DEPRECATED header on 10 n2m skills (status: pushed SHA / local-only SHA / pending-ack — exactly per Task 3 Step 7); assets-produce README+SKILL+knowledge-index updated (Tasks 1–2 commit SHAs); track verification report (this file).
2. **Whole-C-track rollup (C0→C4)** — one row per phase citing its verification report + close commit; assert each green; the C-track acceptance from design §7 (verbatim freeze golden, e2e compat-golden+minimal-live per §8.2, reviewer-gate, coverage) discharged across C1/C2/C3.
3. **n2m retirement status** — the exact Task-3 outcome; arc-reviewer-excluded rationale (project-scoped, design §4.1 "10 global + 1 project-scoped", D7 "10"); n2m downstream untouched; intentional assets-produce↔n2m divergence = designed retirement not drift (design §10 risk row).
4. **Red-line / interface-stability compliance** (design §8) — no `*-orchestration` code; skills under `knowledge/`; no WebUI logic; no AssetKind/REST/DB/OpenAPI change; Phase 2/3 + Phase-14 loop + lunaverse-backend untouched; no Langfuse upload.
5. **Final-merge-gate readiness (post-C4, NOT executed in C4)** — the C-track is now functionally complete; merging the worktree to `main` requires: rebase onto latest main, reconcile master-spec §15 by **appending** (r1.16 already present; resolve any B1 §15/registry collision append-only), re-run tests (design §9). This is a **separate user-coordinated step** dependent on B1's state on main; explicitly NOT done as part of C4 and surfaced to the user at closeout.
6. **Deferred non-blocking items** — carry forward any C1–C3 deferred minors; the n2m push if still pending ack.
7. **Conclusion** — C-track closed (with the honest n2m-push status).

- [ ] **Step 3: Commit + push the verification report (assets-produce only)**

```bash
git add docs/superpowers/specs/phase-C4-n2m-retire-docs-verification.md
git commit -m "docs: C4 + whole-C-track verification report (n2m retirement + docs)"
git push
```
If a design §8.3 refinement was genuinely needed, commit it as a **separate** atomic `docs:` commit (do not mix with the verification report).

---

### Closeout (controller, after Task 4)

- [ ] Run `superpowers:code-reviewer` over the whole C4 change set (Tasks 1–2 + Task 4 commits; the n2m commit if executed). Apply CRITICAL/HIGH fixes via a follow-up atomic `docs:` commit; record MEDIUM/LOW as deferred.
- [ ] Surface to the user (plain language, two explicit decision points):
  1. **`/compact` is USER-ONLY** (CLAUDE.md mandate) — stop at the clean C4/C-track boundary; do not self-invoke.
  2. **Final C-track→main merge gate** — needs the user's go + B1's main state; rebase + §15 append-reconcile + re-test (design §9). Separate from C4.
  And, if Task 3 was deferred: the still-open n2m push ack.

---

## Self-Review (run before executing)

**1. Spec coverage** — design §6 C4 row decomposes to: (a) DEPRECATED header on 10 n2m skills, single commit, push gated → Task 3 (verbatim header, exact paths, hard gate). (b) assets-produce README/SKILL/knowledge-index updated → Tasks 1 (knowledge index = new corpus README + provenance note) + 2 (README + SKILL). (c) track verification report → Task 4 (C4 + whole-C-track rollup). D7 (retain not delete, ack-gated) → Task 3 gate protocol. §2.2/§5 (downstream stays) → Task 3 header text + verification §3. §8 red lines → verification §4. §9 merge gate → verification §5 (explicitly post-C4). §10 "frozen prose drifts" risk → resolved by the DEPRECATED header + documented as intentional divergence (Task 1 README + Task 4 §3). No spec requirement is unmapped. **`arc-reviewer` exclusion** is the design's explicit "10 vs +1 project-scoped" intent, documented (not a STOP-and-ask: D7 is unambiguous).

**2. Placeholder scan** — header block, 10 paths, all commit messages, all grep/test commands, and the corpus README content are given verbatim. The only intentionally deferred-to-runtime values are: the final regression pass counts (real numbers recorded at Task 4 Step 1) and the Task-3 outcome (depends on the user's ack choice — the three outcomes are all enumerated). No "TBD"/"implement later"/vague "handle edge cases".

**3. Type/identifier consistency** — no code; identifiers used (`ls-validate`, `novel_to_ls`, `skills.paths`, `FREEZE_MANIFEST.sha256`, `FREEZE_SOURCES.md`, the 10 skill names, n2m HEAD `8049ac7…`) are all verified against the on-disk repo state and the design doc in the source-of-truth section above; the n2m header's `knowledge/novel-to-ls/<NAME>/SKILL.md` path matches the C1 freeze layout.

**Execution mode:** Subagent-Driven (locked user preference). Tasks 1, 2, 4 → fresh implementer subagent each + two-stage review (spec then code-quality) + fix-loops. **Task 3 is controller-only and never delegated** (cross-repo, hard-gated). Proceed without waiting for plan approval.
