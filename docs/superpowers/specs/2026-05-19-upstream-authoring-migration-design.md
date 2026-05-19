# C-Track — Upstream Authoring Migration (novel → .mss) — Design

> **Status:** approved design (brainstorming complete). Next: writing-plans.
> **Spec linkage:** main spec `2026-04-29-assets-produce-spec.md` §15 revision **r1.16**.
> **⚠ Merge-time §15 reconcile (2026-05-19, post-C4, design §9):** when the C-track branch was merged into `main`, `main` had independently consumed §15 **r1.16** (Claude 主脑→`mob-ai` 网关) and **r1.17** (asset-generation Langfuse skill-loader). Per the append-only §15 rule the C-track entry was renumbered **r1.16 → §15 r1.18** and appended after r1.17 (the master-spec §15 table is authoritative). Per the user-approved minimal reconcile (Option A), this design doc, the C0–C4 phase plans/verifications, the `knowledge/novel-to-mss/` indices, and the n2m `DEPRECATED` headers retain the original **"r1.16"** wording as historical records — read every C-track "§15 r1.16" reference as "**the C-track entry = master-spec §15 r1.18**".
> **New track, not a single phase** — decomposed into phases **C0–C4**.
> **Source repo:** `cdotlock/novels-to-moonscript` (local `/Users/august/MobAI/novels-to-moonscript`).

---

## 1. Goal (one sentence)

Migrate novels-to-moonscript's **upstream authoring pipeline** — everything from
"selecting a novel" to "producing the `.mss` script" — into assets-produce as
**verbatim-frozen skill bodies driven by one top-level orchestration skill**
(zero hardcoded pipeline code), making assets-produce the sole authoritative
novel→MSS entry while n2m's upstream retires.

## 2. Background

### 2.1 What n2m's upstream is

n2m's novel→MSS authoring pipeline is **already skill-based**: each stage is a
`SKILL.md` playbook run by the user via Claude Code slash commands; stage order
lives in documentation (README / SKILLS-GUIDE / CLAUDE.md), **not in code**;
there is no DAG engine or orchestration service. Independent reviewer agents
(fresh context) gate progression. This maps cleanly onto assets-produce §2
principle 1 (atomic capability + skill orchestration, no hardcoded pipeline).

Canonical n2m stage chain (authoring half only — the part this track migrates):

```
novel full text
   ↓
novel-evaluator              ← GO/NO-GO gate (6-dimension screen)
   ↓
character-architect  ⇄  bible-reviewer            (PASS/CONDITIONAL/FAIL gate)
   ↓
entity-planner       ⇄  planner-reviewer          (per-LI-route sub-agents)
   ↓
entity-normalizer            → characters.json / locations.json / alias_map.json
   ↓
[entity-rename       ⇄  rename-reviewer]          (optional: copyright desens.)
   ↓
episode-writer       ⇄  episode-writer-reviewer  ⇄  arc-reviewer (per-book)
   ↓
.mss scripts                 ← TRACK OUTPUT (stop here)
```

### 2.2 Why migrate, and what stays in n2m

assets-produce has, to date, migrated only the **downstream** (image / video /
audio / CG / upscale / matting / NRBI render-prompt — Phases 8–14, B1). The
**upstream authoring half** has never been migrated. The user wants
assets-produce to own novel→MSS end-to-end.

**Hard constraint:** scope stops at `.mss`. n2m's post-MSS downstream
(`asset-prompt-generator`, `asset-reviewer`, `music-normalizer`,
`sfx-normalizer`, `outfit-anchor-renderer`, `wardrobe-consolidator`, the entire
`dramatizer/` post-production) is **NOT migrated** and continues to run in n2m.
Therefore assets-produce's produced artifacts **must remain byte-compatible
with n2m's un-migrated downstream's on-disk contract** (the
`moonscripts/<book>/NN-stage/` numbered-directory layout). Compatibility is a
constraint, not an option.

## 3. Decisions locked in brainstorming

| # | Decision | Value |
|---|---|---|
| D1 | Scope | **Authoring half only** — `novel-evaluator` → … → `episode-writer`/reviewers, output `.mss`. Downstream / visual / normalizer / dramatizer stages explicitly out. |
| D2 | Content fidelity | **Verbatim freeze** — n2m `SKILL.md` bodies copied byte-identical into `knowledge/novel-to-mss/`. Creative wording is the quality core; zero rewrite, zero drift (B1 D1 precedent for the *content*). |
| D3 | Driver | **Top-level `novel_to_mss` orchestration skill + agent-driven.** Agent (developer profile, CLI/chat) reads it and drives stage-by-stage. Zero pipeline code. (Rejected: reuse Phase-14 asset-service loop — wrong contract; rejected: per-stage CLI verbs as primary driver.) |
| D4 | Registration surface | Register into the **general skill system** (spec §5 Skill table + `skill <name>` tool + system-prompt description injection). **NOT** `ASSET_GENERATION_SKILLS` (Phase-14 downstream picker) — this is not asset generation. Side effect: near-zero code overlap with the concurrent B1 task. |
| D5 | Artifact source-of-truth | **On-disk `moonscripts/<book>/NN-stage/` layout is canonical/authoritative.** assets-produce writes that layout directly. `Asset` table = optional index only. Simplest, zero downstream-compat risk. |
| D6 | MSS validation | **Freeze n2m's MSS validator into a `mss-validate` atomic tool** (B1 / `cg-render` frozen-subprocess pattern). Pipeline self-checks `.mss` without depending on n2m. |
| D7 | n2m upstream fate | **Retire.** n2m's 10 upstream authoring skills get a `DEPRECATED` header comment pointing to assets-produce. **Not deleted** (Phase 9/13 precedent; deletion left to user). Push to `cdotlock/novels-to-moonscript` **requires explicit user ack** per global git policy. |
| D8 | Reviewer mechanism | **Faithfully reproduce n2m's independent-reviewer gate** using opencode's existing `tool/task.ts` subagent dispatch — fresh-context sub-agent per review, gate semantics (PASS / CONDITIONAL-with-fixes / FAIL) preserved verbatim. No new dispatch code. |

## 4. Architecture

### 4.1 Frozen skill corpus — `knowledge/novel-to-mss/`

New local-self-contained directory (parallel to `knowledge/asset-generation/`,
`knowledge/novel-to-video/`, `knowledge/style-prompts/`; CLAUDE.md local-source
principle). Each in-scope n2m skill is copied **byte-identical** into a
per-skill subdirectory: `knowledge/novel-to-mss/<name>/SKILL.md` (the `SKILL.md`
filename + its YAML frontmatter `name:`/`description:` are preserved verbatim —
opencode skill discovery requires both frontmatter keys, see §4.3). Every
companion file the SKILL.md depends on (`scripts/*.py`, `mss-spec.md`,
templates, tests, `README.md`) is frozen alongside under the same per-skill
dir, path-faithfully. Langfuse upload is **not** in this track (CLAUDE.md: only
on explicit user request).

In-scope frozen skills (10 global + 1 project-scoped):

| Skill | Role | n2m source |
|---|---|---|
| `novel-evaluator` | GO/NO-GO gate | `skills/novel-evaluator/SKILL.md` |
| `character-architect` | producer | `skills/character-architect/SKILL.md` |
| `bible-reviewer` | reviewer | `skills/bible-reviewer/SKILL.md` |
| `entity-planner` | producer | `skills/entity-planner/SKILL.md` |
| `planner-reviewer` | reviewer | `skills/planner-reviewer/SKILL.md` |
| `entity-normalizer` | producer | `skills/entity-normalizer/SKILL.md` |
| `entity-rename` | producer (optional) | `skills/entity-rename/SKILL.md` |
| `rename-reviewer` | reviewer | `skills/rename-reviewer/SKILL.md` |
| `episode-writer` | producer | `skills/episode-writer/SKILL.md` |
| `episode-writer-reviewer` | reviewer | `skills/episode-writer-reviewer/SKILL.md` |
| `arc-reviewer` | reviewer (per-book) | n2m project-scoped `moonscripts/<book>/skills/arc-reviewer/`. **Freeze the demo book `no-rules-in-bad-ideas` copy as the reference template** into `knowledge/novel-to-mss/arc-reviewer.md`; C1 survey must confirm whether the body is book-invariant (if book-specific parts exist, they are parameterized in the orchestration skill, not the frozen body). Invoked per-book after a full route arc passes. |

### 4.2 Orchestration skill — `novel_to_mss`

One frozen/authored knowledge body (`knowledge/novel-to-mss/novel_to_mss.md`),
**not code**. It documents, exactly mirroring n2m's documented sequencing:

- the stage DAG above (including the optional `entity-rename` branch),
- the gate rule at each ⇄ point: a reviewer sub-agent must return PASS, or
  CONDITIONAL with the producer applying the listed fixes and re-review, before
  the next stage; FAIL halts and surfaces,
- when to spawn per-LI-route sub-agents (`entity-planner` / `planner-reviewer` /
  per-route `episode-writer`),
- where each stage writes (the `NN-stage/` directory contract, §4.5).

The agent (CLI `agent run` / chat, developer profile) invokes
`skill novel_to_mss`, then walks the stages, calling each stage skill and
dispatching reviewer sub-agents. **No `*-orchestration` / `*-workflow-service`
code is written** (§12 red line). Sequencing is knowledge, exactly as in n2m.

### 4.3 Stage skill registration (filesystem discovery, NOT the managed-CLI/Langfuse path)

**Resolved during C1 planning (codebase fact, supersedes an earlier CLI-based
sketch):** opencode's `agent skills add --content-file` path **force-uploads
the body to Langfuse** (`business/skill/cli.ts` → `LangfuseService.createPrompt`)
and stores only metadata + `langfuse_prompt_key` in the `Skill` DB table. That
violates D2/D4 and the CLAUDE.md "local-self-contained, no Langfuse without
explicit request" red line. It is **not** used by this track.

Instead, registration uses opencode's **local filesystem skill discovery**
(`agent/packages/opencode/src/skill/index.ts` `discoverSkills`):

- The config key `skills.paths` (`config/skills.ts` `ConfigSkills.Info` =
  `{ paths?: string[]; urls?: string[] }`) takes extra skill-folder paths.
  Discovery scans each with glob `**/SKILL.md`, resolving relative paths
  against the runtime project `directory`.
- C1 adds `"skills": { "paths": ["knowledge/novel-to-mss"] }` to the loaded
  opencode config (C1 verifies which file is authoritative — repo-root
  `opencode.jsonc` vs `agent/.opencode/opencode.jsonc`).
- Each `knowledge/novel-to-mss/<name>/SKILL.md` is parsed for frontmatter
  `name`/`description` (`skill/index.ts:98`), served **directly from on-disk
  `info.content`** by `loadBody` (`skill/index.ts:302` — the non-`langfuse://`
  branch). No DB row, no Langfuse, no network.
- `skill <name>` tool resolves them; `session/system.ts` `SystemPrompt.skills()`
  injects their descriptions. This **is** the general skill system (D4
  satisfied) and is **absent** from `ASSET_GENERATION_SKILLS` /
  `intent-to-skill.ts` (D4) and from the Phase-14 asset-service loop.
- Skill identity = the frozen frontmatter `name` (n2m uses kebab-case, e.g.
  `novel-evaluator`); the orchestration skill (§4.2) references skills by that
  exact name. C1 asserts no `duplicate skill name` warning vs existing skills.

No `Skill` DB rows are created for this track; `scope` (system/creator) does
not apply to filesystem-discovered skills (they are developer/CLI-side by
nature; WebUI `creator` profile exposure is out of scope).

### 4.4 Reviewer sub-agents

Reviewers are dispatched through opencode's existing `tool/task.ts`. The
orchestration skill instructs the driving agent to spawn a **fresh-context**
sub-agent loaded with the reviewer skill body + the producer's output + the
relevant Bible/plan inputs (faithful to n2m's "independent agent, full
Evidence-Trail sweep, not sampling"). Gate verdict parsing
(PASS/CONDITIONAL/FAIL) and the loop-until-pass behavior live in the
orchestration skill (knowledge), not in new code.

### 4.5 Ingestion + artifact contract (on-disk, canonical — D5)

- "Selecting a novel" → a `Project` (type=`novel`) is created; the novel full
  text is written into the project workspace as the stage-0 source, following
  n2m's existing convention.
- Project workspace root mirrors n2m exactly:
  `<workspace>/moonscripts/<book-slug>/` with numbered stage directories
  (`01-novel-evaluator/`, `02-character-architect/`, `03-entity-planner/`,
  `04-entity-normalizer/`, `04.5-entity-rename/`, `05-episode-writer/scripts/`,
  `signal_checklist.md`, `skills/arc-reviewer/`, …) — **byte-for-byte the layout
  n2m's un-migrated downstream reads**. Exact directory names/ordinals are
  frozen from n2m during C1 (survey step), not invented here.
- `Asset` table rows (type=`script`/`metadata`) **may** index produced files
  for WebUI/lookup, but the on-disk files are authoritative. No export step.

### 4.6 `mss-validate` atomic tool (D6)

n2m's MSS validator (`scripts/validate_scripts.sh` + its Go MSS parser) frozen
as a Python/Go-subprocess atomic tool, identical pattern to `cg-render` /
B1's `nrbi-render-prompt`: JSON I/O, `--mock`, `python-runner.ts`-style bridge,
verbatim parser, no behavior change. Registered in the opencode tool registry
(an atomic tool — not a skill, not in `ASSET_GENERATION_SKILLS`). The
orchestration skill calls it as the `.mss` quality gate before declaring the
episode/route done.

## 5. Non-goals (explicit)

- ❌ No migration of `asset-prompt-generator`, `asset-reviewer`,
  `music-normalizer`, `sfx-normalizer`, `outfit-anchor-renderer`,
  `wardrobe-consolidator`, or any `dramatizer/` module.
- ❌ No new `AssetKind`; no change to the 4 REST endpoints, DB schema,
  `AssetServiceErrorCode`, `GenerationOutcome`, or OpenAPI (§11.4 untouched).
- ❌ No reuse of / change to the Phase-14 asset-service loop or
  `placeholderGenerator`.
- ❌ No `*-orchestration` / `*-coordination` / `*-workflow-service` code
  (§12 red line). Sequencing is knowledge.
- ❌ No rewrite of creative skill wording (D2).
- ❌ No Langfuse upload this track (local frozen bodies only).
- ❌ No deletion of n2m files; no auto-push to `cdotlock/novels-to-moonscript`
  without user ack.
- ❌ No automatic whole-book DAG runner / batch orchestrator beyond the
  agent-driven orchestration skill.

## 6. Phase decomposition (C0–C4)

Each phase follows the project workflow: write `docs/superpowers/specs/phase-CN-<slug>-plan.md`
→ execute → write `phase-CN-<slug>-verification.md` → commit + push → run
`superpowers:code-reviewer` → `/compact` → next phase.

| Phase | Goal | Key acceptance |
|---|---|---|
| **C0** | Design freeze | This design doc committed; master-spec §15 r1.16 added; user review-gate passed. |
| **C1** | Freeze + register + ingestion model | n2m source survey (exact files, companion refs, exact `NN-stage` dir names) documented; 11 skill dirs byte-frozen into `knowledge/novel-to-mss/<name>/SKILL.md` (+ companions); `skills.paths` config wired; golden byte-equality tests vs n2m source; discovery asserts all 11 names visible via `Skill.Service.all()` with no duplicate-name warning, no Langfuse/DB row; `Project`(type=novel) + on-disk workspace layout helper (n2m `NN-stage` contract); ≥80% line cov on new glue code. |
| **C2** | Orchestration + reviewers | `novel_to_mss` orchestration skill authored; reviewer sub-agent dispatch wired through `task.ts`; gate semantics (PASS/CONDITIONAL/FAIL, loop-until-pass) reproduced; injected-FAIL test proves the gate halts progression. |
| **C3** | `mss-validate` + end-to-end | `mss-validate` atomic tool (frozen parser) in `agent tools list`, schema complete, mock + real fixture; full novel→MSS run on demo book `no-rules-in-bad-ideas` original novel; produced `.mss` passes `mss-validate`; produced workspace structurally matches n2m's existing `moonscripts/no-rules-in-bad-ideas/` (compat acceptance). |
| **C4** | n2m retirement + docs | DEPRECATED header on n2m's 10 upstream skills (single commit; push gated on user ack); assets-produce README / SKILL.md / knowledge index updated; track verification report. |

## 7. Testing & acceptance strategy

- **Verbatim freeze:** golden byte-equality assertions — each
  `knowledge/novel-to-mss/<name>.md` byte-identical to its n2m source (same as
  B1's golden text assertions).
- **End-to-end:** demo book `no-rules-in-bad-ideas` original novel → full
  authoring pipeline → `.mss` passes `mss-validate`; output workspace
  structurally aligned with n2m's existing
  `moonscripts/no-rules-in-bad-ideas/` (downstream-compat acceptance).
- **Reviewer gate:** synthetic FAIL fixture must block progression; synthetic
  CONDITIONAL must force a fix-and-re-review cycle.
- **Coverage:** ≥80% line coverage on new glue code (ingestion helper,
  `mss-validate` bridge, registration). Frozen prose is not code-covered.

## 8. Red-line / interface-stability compliance

- §2 principle 1 (atomic capability + skill orchestration): satisfied —
  sequencing is a knowledge body; the only new *code* is `mss-validate` (a
  deterministic atomic tool) + thin ingestion/registration glue. No pipeline
  service.
- §12 red lines: no `*-orchestration`/`*-workflow-service`; skill bodies live
  under `knowledge/` (not scattered); no WebUI business logic; no
  creator/developer profile confusion (these are `scope=system`).
- §11.4 interface stability: no new `AssetKind`, no REST/DB/error-code/OpenAPI
  change; Phase-2/3 and the Phase-14 loop untouched (zero loop code change).
- moonshort-backend untouched. n2m: comment-only DEPRECATED, no deletion,
  push gated on ack.

### 8.1 Design refinements recorded during C2 execution

- **Orchestration-skill filename.** The skill is authored at
  `knowledge/novel-to-mss/novel_to_mss/SKILL.md` — a per-skill-dir
  `SKILL.md` with frontmatter `name: novel_to_mss`. This is required by C1's
  filesystem discovery, which globs `**/SKILL.md`; §4.2's
  `knowledge/novel-to-mss/novel_to_mss.md` was loose wording, not a semantic
  change. No red-line or scope impact.
- **C2 injected-FAIL acceptance interpretation.** The gate is knowledge, not a
  production gate engine (§12 red line), so the §6 C2 / line-225 "injected-FAIL
  proves the gate halts" acceptance is met *deterministically*: a TEST-ONLY
  helper derives `{verdict → action}` by per-cell parsing of the body's
  `## Gate contract` and asserts `FAIL → HALT`, `CONDITIONAL →
  FIX_AND_REREVIEW`, `PASS → ADVANCE`, throwing if any verdict cell is
  under-specified/unclassifiable (a mis-specified FAIL is a hard error, never a
  silent advance). The *live behavioral* proof — a real driving agent halting
  end-to-end — is deferred to C3's demo-book e2e. No red-line or scope change.

### 8.2 Design refinements recorded during C3 planning

- **D6 premise correction — the MSS validator is the upstream
  `cdotlock/moonshort-script`, not "n2m's".** C3 survey + mob-wiki
  (`entities/moonshort-script`) established that n2m contains **zero** Go
  source; `scripts/validate_scripts.sh` clones the external canonical repo
  `cdotlock/moonshort-script` (`./cmd/mss`) and builds it at runtime. That `mss`
  binary is a **platform-wide single source of truth** (validator ~98.9%
  coverage, 200+ tests, two audits; consumed by Dramatizer / Remix Executor /
  the frontend player). D6's "freeze n2m's MSS validator" wording is corrected:
  the artifact frozen is the **upstream `cdotlock/moonshort-script` Go source**,
  pinned to the project-convention commit **`@b36a407`** (n2m's
  `validate_scripts.sh` floats to upstream HEAD; assets-produce improves on it
  by pinning). D6's *intent* — reuse the real parser verbatim, no rewrite,
  assets-produce self-contained — is preserved exactly; only the source
  location is corrected. A Python re-implementation from the C1-frozen
  `mss-spec.md` was explicitly **rejected** (user-confirmed): it would
  functionally duplicate a canonical heavily-tested tool, inevitably drift from
  ground truth (the spec is documentation; the Go binary is authority), and
  violate Research-&-Reuse + D2/D6 no-rewrite.
- **`mss-validate` freeze form — vendored, sha256-pinned Go source
  (user-confirmed).** Per the established `cg-render` / `nrbi-render-prompt`
  frozen-subprocess pattern: the upstream Go source `@b36a407` is vendored into
  `tools/mss-validate/`, sha256-pinned with a drift guard (nrbi's
  `FROZEN_SHA256` precedent), built once by the Python/subprocess bridge
  (Go 1.22+ is a *build-time* dependency only, exercised solely by the C3
  compat-golden real run), JSON I/O, `--mock`. **Registered in the opencode
  tool registry** (the 3 registry sites; per §4.6 the orchestration skill calls
  it, so — unlike `detect-matting` — it IS a registered atomic tool). All
  automated tests run `--mock` (CI needs no Go toolchain).
- **`mss-validate` gate seam wired into the C2 orchestration body.** The
  C2-authored `novel_to_mss/SKILL.md` stops at `.mss scripts` and does not yet
  reference the validator. C3 amends that **authored** body (authored, not
  C1-frozen — absent from `FREEZE_MANIFEST.sha256`, so editing is in-scope) to
  add `mss-validate` as the per-episode `.mss` quality gate **after** stage-5
  `episode-writer` writes `05-episode-writer/scripts/` and **before** that
  episode/route is declared FINAL — mirroring the C1-frozen
  `episode-writer/SKILL.md` hard门槛 「每集 FINAL 之前必须 `mss compile` exit
  0」. This makes design §4.6 concrete (the design always intended the
  orchestration skill to call mss-validate); the gate sits **at** the `.mss`
  boundary (inside C-track scope), not past it.
- **C3 e2e acceptance interpretation — compat-golden + minimal-live slice
  (user-confirmed).** §6 C3 / §7 "full novel→MSS run on demo book original
  novel" is discharged as: **(a) downstream-compat golden** — the C1 workspace
  helper reproduces n2m's exact `moonscripts/no-rules-in-bad-ideas/`
  `NN-stage` structure, and the demo book's **real existing** produced
  `ep_*_final.md` scripts pass the frozen `mss-validate` (validator fidelity +
  compat proven on real data, deterministic / reproducible); **(b) minimal live
  slice** — a tiny self-supplied public-domain / synthetic micro-novel really
  drives the orchestration through **one** episode with real reviewer `task`
  dispatch and a real injected-FAIL halt, producing one real `.mss` that passes
  `mss-validate` (discharges the C2→C3 live behavioural watch-item). The
  literal full-book-from-original-novel run is **infeasible from repo state**
  (n2m `.gitignore`s `novels/`; the source text is absent) and disproportionate
  (multi-hour 6-stage creative-LLM spend); recorded as a transparent,
  user-authorized scope interpretation (C1/C2 transparent-deviation precedent),
  not an unstated gap. No change to the migration scope or any red line.

## 9. Worktree / git strategy

- This track runs in worktree `claude/admiring-wilson-5d9f34`, branched from
  `main@659fbdb`; the concurrent B1 task runs on `main`.
- D4 (general skill registry, not `ASSET_GENERATION_SKILLS`/`intent-to-skill.ts`)
  reduces code overlap with B1 to ~zero. The only realistic merge contention is
  master-spec §15 (append-only — append r1.16; trivial manual reconcile) and
  possibly `.env.example`.
- Before merging to main: rebase onto latest main, reconcile §15 by appending,
  re-run tests.
- Push to `cdotlock/assets-produce` (this repo): no per-push ask (memory-recorded
  authorization). Push to `cdotlock/novels-to-moonscript` (C4 DEPRECATED):
  **requires explicit user ack** (global git policy — non-user namespace).
- The trunk-based deviation (feature worktree for this track, by explicit user
  request) is recorded in §15 r1.16.

## 10. Risks & rollback

| Risk | Mitigation |
|---|---|
| n2m `NN-stage` directory contract under-documented → downstream incompat | C1 includes an explicit n2m source/layout survey step; C3 compat acceptance diffs against the real `no-rules-in-bad-ideas` workspace. |
| Reviewer sub-agent context bleed (not truly independent) | Dispatch via fresh `task.ts` context only; injected-FAIL test verifies independence behaviorally. |
| Companion files a SKILL.md silently depends on get missed | C1 survey enumerates every referenced asset before freeze; golden tests fail loudly on drift. |
| Concurrent B1 merge conflict | D4 minimizes overlap; rebase-before-merge; §15 append-only. |
| Frozen prose drifts from n2m later | Golden byte-equality tests in CI-equivalent; n2m DEPRECATED header makes n2m the non-authoritative copy. |

## 11. §15 revision r1.16 (text appended to master spec)

> See master spec `2026-04-29-assets-produce-spec.md` §15 — row r1.16 records
> this track's authorization, scope, the eight locked decisions (D1–D8), the
> C0–C4 decomposition, and the trunk-based worktree deviation. This design doc
> is the authoritative detail; r1.16 is the index entry.
