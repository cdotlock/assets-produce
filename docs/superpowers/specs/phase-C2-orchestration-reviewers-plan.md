# C2 — Orchestration Skill + Reviewer Sub-Agent Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Author the `novel_to_mss` orchestration **knowledge body** (NOT code) that an agent (developer profile, `agent run`/chat) reads to walk the frozen C1 stage skills in n2m's documented order, dispatching reviewer sub-agents through opencode's **existing** `task` tool, with PASS/CONDITIONAL/FAIL gate semantics reproduced faithfully. Prove the gate halts on FAIL.

**Architecture (the load-bearing constraint):** Per design §4.2/§4.4 and §12 red line, sequencing + gate logic + loop-until-pass are **knowledge in the skill body**, not new `*-orchestration`/`*-workflow-service` code. Reviewer dispatch reuses opencode's existing `tool/task.ts` sub-agent tool — C2 writes **zero production orchestration code**. The only new artifacts are: (1) the orchestration skill body (markdown), (2) tests over that body + discovery. The "injected-FAIL test" is therefore a **deterministic gate-contract test**: extract the body's machine-checkable gate contract and prove that a `FAIL` reviewer verdict fixture maps to HALT (not advance), and `CONDITIONAL` maps to fix-and-re-review, `PASS` to advance — i.e., prove the *knowledge* encodes a correct, unambiguous gate. This respects the red line (the checker is test-only) while satisfying acceptance line 225.

**Spec linkage:** design `2026-05-19-upstream-authoring-migration-design.md` §4.2/§4.4/§4.5/§6 (C2 row, acceptance line 225); master spec §15 r1.16. C1 delivered the discovery mechanism (`skills.paths` → `knowledge/novel-to-mss/<name>/SKILL.md`, filesystem-served, no Langfuse/DB) and the 11 frozen stage/reviewer skills + `AUTHORING_STAGE_DIRS` workspace helper.

**Design refinement recorded (C2):** The orchestration skill is discovered by the same C1 mechanism, which globs `**/SKILL.md`. Therefore the body lives at `knowledge/novel-to-mss/novel_to_mss/SKILL.md` with frontmatter `name: novel_to_mss` (the design §4.2's `knowledge/novel-to-mss/novel_to_mss.md` was loose wording — the per-skill-dir `SKILL.md` form is required for discovery, consistent with C1). This refinement is logged in design §8 by Task 5.

---

## Source of truth for the stage order (do NOT invent)

The orchestration body must mirror n2m's **documented** sequencing verbatim in structure (D2: no rewriting creative wording; the orchestration doc is new *connective* knowledge but its stage order/gates must match n2m's own pipeline doc). C1 froze the source skills; the canonical ordered pipeline (from n2m `README.md §工作流`, captured in C1 survey) is:

```
novel full text
 → 1 novel-evaluator            (gate: GO/NO-GO)
 → 2 character-architect        ⇄ bible-reviewer
 → 3 entity-planner             ⇄ planner-reviewer        (spawn per-LI-route sub-agents)
 → 4 entity-normalizer
 → [4.5 entity-rename           ⇄ rename-reviewer]        (optional branch)
 → 5 episode-writer             ⇄ episode-writer-reviewer + arc-reviewer (after full route arc)
 → .mss scripts
```

Stage→skill→reviewer→`NN-stage` write dir mapping (frozen facts from C1 — authoritative):

| Stage | Producer skill | Reviewer skill (gate) | Writes to (`<base>/`) |
|---|---|---|---|
| 1 | `novel-evaluator` | (self GO/NO-GO; no separate reviewer) | `01-novel-evaluator/` |
| 2 | `character-architect` | `bible-reviewer` | `02-character-architect/` |
| 3 | `entity-planner` (spawn per-LI-route sub-agents) | `planner-reviewer` (per-route) | `03-entity-planner/` |
| 4 | `entity-normalizer` | (none) | `04-entity-normalizer/` |
| 4.5 (optional) | `entity-rename` | `rename-reviewer` | `04.5-entity-rename/` |
| 5 | `episode-writer` (per route) | `episode-writer-reviewer`, then `arc-reviewer` after the full route arc | `05-episode-writer/scripts/` |

`base = <workspace>/moonscripts/<book-slug>/` (the C1 `ensureNovelWorkspace` contract). `arc-reviewer` lives at `<base>/skills/arc-reviewer/`.

Gate contract (faithful to n2m's reviewer skills, which emit PASS / CONDITIONAL / FAIL):
- **PASS** → advance to the next stage.
- **CONDITIONAL** → the producer applies the reviewer's listed fixes, then the SAME reviewer re-reviews (loop) until PASS (or FAIL).
- **FAIL** → HALT the pipeline, surface the reviewer's report to the operator; do NOT advance.

---

## File Structure

- Create: `knowledge/novel-to-mss/novel_to_mss/SKILL.md` (the orchestration knowledge body; frontmatter `name: novel_to_mss` + `description`)
- Create: `agent/packages/opencode/test/skill/novel-to-mss-orchestration.test.ts` (discovery + gate-contract + injected-FAIL + reviewer-mapping tests)
- Create: `agent/packages/opencode/test/fixture/novel-to-mss/reviewer-verdicts/{pass,conditional,fail}.md` (reviewer-output fixtures for the injected-verdict test)
- Modify: `docs/superpowers/specs/2026-05-19-upstream-authoring-migration-design.md` (§8 record the `novel_to_mss/SKILL.md` filename refinement)
- Create: `docs/superpowers/specs/phase-C2-orchestration-reviewers-verification.md` (Task 6)

Test runner: from `agent/packages/opencode` → `PATH=$HOME/.bun/bin:$PATH bun test <file> --timeout 30000`.
`node_modules` is installed in `agent/` (C1); if a fresh worktree, `cd agent && bun install --frozen-lockfile` once.

---

### Task 1: Author the `novel_to_mss` orchestration skill body

**Files:** Create `knowledge/novel-to-mss/novel_to_mss/SKILL.md`

- [ ] **Step 1: Survey the exact n2m documented sequencing + each reviewer's verdict vocabulary**
  Read (read-only) from `/Users/august/MobAI/novels-to-moonscript`: `README.md` (§工作流 pipeline block), `SKILLS-GUIDE.md`, `CLAUDE.md`, and the frozen `knowledge/novel-to-mss/{bible-reviewer,planner-reviewer,episode-writer-reviewer,rename-reviewer,arc-reviewer}/SKILL.md` to confirm the exact verdict tokens each reviewer emits (PASS/CONDITIONAL/FAIL — confirm exact spelling/casing per reviewer; some may use GO/NO-GO for `novel-evaluator`). Record the exact tokens; the gate contract in the body MUST use the reviewers' real vocabulary, not a paraphrase. Output: a short notes block appended to the verification report later (not a separate file).

- [ ] **Step 2: Write `knowledge/novel-to-mss/novel_to_mss/SKILL.md`** with frontmatter:
  ```
  ---
  name: novel_to_mss
  description: Orchestrate the upstream novel→.mss authoring pipeline — walk the frozen stage skills (novel-evaluator → character-architect → entity-planner → entity-normalizer → [entity-rename] → episode-writer) in n2m's documented order, dispatching independent reviewer sub-agents at each gate with PASS/CONDITIONAL/FAIL semantics, writing each stage to the moonscripts/<book>/NN-stage/ contract.
  ---
  ```
  Body MUST contain these explicit, machine-checkable sections (Task 3/4 assert their presence/correctness):
  1. **`## Stage DAG`** — the ordered stage list above incl. the optional `[4.5 entity-rename]` branch and the per-LI-route fan-out at stage 3/5.
  2. **`## Gate contract`** — a table or list with one row per gated stage: `stage | producer skill | reviewer skill | PASS→ | CONDITIONAL→ | FAIL→`. The FAIL row MUST say halt+surface, never advance. CONDITIONAL MUST say producer-applies-fixes then same-reviewer-re-review loop. Use each reviewer's REAL verdict tokens (Step 1).
  3. **`## Reviewer dispatch`** — explicit instruction: spawn a **fresh-context** sub-agent via the existing `task` tool (name it exactly as opencode's subagent/task tool is invoked — confirm the tool name from `agent/packages/opencode/src/tool/task.ts` / the tool registry; reference it by that exact name), loaded with the reviewer skill body + the producer's just-written output + the relevant Bible/plan inputs. Faithful to n2m: "independent agent, full Evidence-Trail sweep, not sampling". NO new code — this is an instruction to the driving agent to use the existing tool.
  4. **`## Workspace writes`** — the stage→`NN-stage/` dir mapping table above; reference the C1 `ensureNovelWorkspace`/`AUTHORING_STAGE_DIRS` contract (`<base>/moonscripts/<book-slug>/...`).
  5. **`## Per-route fan-out`** — when/how to spawn per-LI-route sub-agents for `entity-planner`/`planner-reviewer`/per-route `episode-writer`, then `arc-reviewer` after a full route arc.
  6. **`## Halt & surface`** — on FAIL or unrecoverable error: stop, write the reviewer report to the stage dir, surface to operator; do not fabricate downstream stages.
  This is authored connective knowledge; it must NOT rewrite/duplicate the creative wording of the stage skills (it references them by `name`), and its stage order/gates must match n2m's documented pipeline (Step 1). Keep ≤ ~400 lines, focused.

- [ ] **Step 3: Commit**
  `git add knowledge/novel-to-mss/novel_to_mss && git commit -m "feat: author novel_to_mss orchestration skill body (C2)"`

---

### Task 2: Discovery test — orchestration skill is loadable

**Files:** Create `agent/packages/opencode/test/skill/novel-to-mss-orchestration.test.ts`

- [ ] **Step 1: Write failing test** — mirror C1's `novel-to-mss-discovery.test.ts` harness exactly (`testEffect(Layer.mergeAll(Skill.defaultLayer, CrossSpawnSpawner.defaultLayer)).pipe(provideInstance(REPO))`). Assert `novel_to_mss` appears in `Skill.Service.all()`, `location` is filesystem (NOT `langfuse://`) under `knowledge/novel-to-mss/novel_to_mss`, `content` non-empty, AND no `duplicate skill name` warning. Run: must FAIL before Task 1's body exists (if Task 1 already committed, this passes immediately — that is acceptable, it is a discovery guard; note it).
- [ ] **Step 2: Run** `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/skill/novel-to-mss-orchestration.test.ts --timeout 30000` → PASS (skill discovered, fs-served).
- [ ] **Step 3: Commit** `git add agent/packages/opencode/test/skill/novel-to-mss-orchestration.test.ts && git commit -m "test: assert novel_to_mss orchestration skill is discoverable (C2)"`

---

### Task 3: Gate-contract structural test (the knowledge encodes the gate correctly)

**Files:** Modify the C2 test file (append).

- [ ] **Step 1: Write failing tests** that read `knowledge/novel-to-mss/novel_to_mss/SKILL.md` raw and assert the knowledge is complete and correct:
  - the 6 required `## ` sections (Task 1 Step 2 list) are all present;
  - every gated stage from the authoritative mapping table (stages 2, 3, 4.5, 5 with reviewers `bible-reviewer`, `planner-reviewer`, `rename-reviewer`, `episode-writer-reviewer`+`arc-reviewer`) appears in the `## Gate contract` section, each referencing its correct reviewer skill `name`;
  - the Gate contract explicitly maps `FAIL`→halt/surface (assert the FAIL row contains a halt verb and does NOT contain "advance"/"next stage"), `CONDITIONAL`→producer-fix + same-reviewer re-review loop, `PASS`→advance;
  - stage 1 `novel-evaluator` GO/NO-GO and the optional `[4.5 entity-rename]` branch are documented;
  - every stage maps to its exact `NN-stage` dir from `AUTHORING_STAGE_DIRS` (import the C1 constant and assert each value appears in the `## Workspace writes` section).
- [ ] **Step 2: Run** → PASS (fix the body in Task 1, not the test, if a section/mapping is genuinely missing — re-commit body fix as `fix:` then proceed).
- [ ] **Step 3: Commit** `git commit -m "test: assert novel_to_mss body encodes full stage+gate contract (C2)"`

---

### Task 4: Injected-FAIL gate test (acceptance line 225 — the gate halts)

**Files:** Create reviewer-verdict fixtures; append to the C2 test file.

- [ ] **Step 1: Create fixtures** `agent/packages/opencode/test/fixture/novel-to-mss/reviewer-verdicts/{pass,conditional,fail}.md` — minimal realistic reviewer outputs using the REAL verdict tokens from Task 1 Step 1 (e.g. a `fail.md` whose verdict line is exactly what `bible-reviewer` emits for FAIL).
- [ ] **Step 2: Write the injected-verdict test.** Implement a small TEST-ONLY pure helper *inside the test file* (NOT in `src/` — must not be production orchestration code) that encodes the gate rule **as documented by the orchestration body**: parse the `## Gate contract` from `novel_to_mss/SKILL.md` into `{verdict → action}` and apply it to each fixture. Assert:
  - `fail.md` verdict → action is HALT (pipeline does NOT advance; matches the body's FAIL row);
  - `conditional.md` → action is FIX_AND_REREVIEW (loop, same reviewer);
  - `pass.md` → action is ADVANCE.
  This proves the *knowledge* (the body's gate contract), when mechanically followed, halts on FAIL — without writing any production orchestration/dispatch code (red line intact). Document in a test comment that the runtime gate is enforced by the driving agent following this same body; the deterministic proof is the contract derivation here, and the live behavioral proof is C3's real demo-book e2e.
- [ ] **Step 3: Run** → PASS (3 verdict cases). If the parser can't unambiguously derive actions from the body, that means the body's `## Gate contract` is under-specified — fix the BODY (Task 1) to be machine-unambiguous, not the test.
- [ ] **Step 4: Commit** `git add agent/packages/opencode/test/fixture/novel-to-mss agent/packages/opencode/test/skill/novel-to-mss-orchestration.test.ts && git commit -m "test: prove novel_to_mss gate halts on injected FAIL verdict (C2)"`

---

### Task 5: Record design refinement (§8)

**Files:** Modify `docs/superpowers/specs/2026-05-19-upstream-authoring-migration-design.md`

- [ ] **Step 1:** In §8 (or the C2 row context), add one line: the orchestration skill is `knowledge/novel-to-mss/novel_to_mss/SKILL.md` (per-skill-dir `SKILL.md`, frontmatter `name: novel_to_mss`) — required for the C1 `**/SKILL.md` discovery glob; §4.2's `novel_to_mss.md` was loose wording, no semantic change. Note the C2 injected-FAIL interpretation (deterministic gate-contract derivation test; live behavior proven by C3 e2e) so the design records the resolution.
- [ ] **Step 2: Commit** `git commit -m "docs: record C2 orchestration-skill filename + gate-test refinement (§8)"`

---

### Task 6: Suite + verification report + push + review

- [ ] **Step 1:** `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/skill test/business --timeout 30000` → no regressions; new C2 tests pass. Then `cd agent && PATH=$HOME/.bun/bin:$PATH bun run typecheck` → 4/4.
- [ ] **Step 2:** Write `docs/superpowers/specs/phase-C2-orchestration-reviewers-verification.md` — tick each C2 acceptance (line 225): orchestration skill authored; reviewer dispatch wired through existing `task.ts` (by instruction, zero new code — state this explicitly with the §12 red-line justification); gate semantics reproduced; injected-FAIL test proves halt. Include Task 1 Step 1 verdict-vocabulary notes. State explicitly: no `*-orchestration` code, no Langfuse, no DB, not in `ASSET_GENERATION_SKILLS`.
- [ ] **Step 3:** `git commit` the report, `git push origin claude/admiring-wilson-5d9f34` (assets-produce push pre-authorized per memory `assets-produce-push-policy.md`).
- [ ] **Step 4:** Run `superpowers:code-reviewer` on the C2 diff; address CRITICAL/HIGH; record MEDIUM/LOW in the report. `/compact` is user-gated — note, don't self-invoke.

---

## Self-Review

**Spec coverage (design §6 C2 row / line 225):** orchestration skill authored → Task 1; reviewer sub-agent dispatch wired through `task.ts` → Task 1 §3 (instruction to use the *existing* tool; design §4.4 says "dispatched through opencode's existing `tool/task.ts`" — explicitly NO new code, so "wired" = the body correctly instructs use of the existing tool; verified by Task 3 asserting the dispatch section names the real tool) → this is the faithful, red-line-safe reading; gate semantics PASS/CONDITIONAL/FAIL + loop-until-pass reproduced → Task 1 §2 + Task 3; injected-FAIL proves gate halts → Task 4 (deterministic contract-derivation; live proof deferred to C3 e2e, explicitly recorded). No gap.

**Red-line check (§12):** zero production `*-orchestration`/`*-coordination`/`*-workflow-service` code. Only a knowledge body + tests + a test-only gate-contract parser. Reviewer dispatch = existing `task` tool. ✓

**Ambiguity resolved:** design §4.2 said `novel_to_mss.md`; discovery needs `<name>/SKILL.md` (C1 fact) → resolved to `novel_to_mss/SKILL.md`, recorded in §8 (Task 5). The "injected-FAIL test" with knowledge-only gates → resolved as a deterministic gate-contract derivation test + C3 live e2e, recorded (Task 5). Both are defensible readings of the approved design; flagged in the C2 verification report and design §8 for user awareness.

**Placeholder scan:** no TBD. Task 1 Step 1 (verdict-vocabulary survey) is a real read-only investigation step with a concrete output, not a placeholder. Reviewer/tool exact name is resolved by reading `tool/task.ts` in Task 1 §3 (concrete procedure, not hand-waving).

**Decomposition:** Task 1 (author body) and Tasks 2-4 (tests over it) are sequential-coupled (tests need the body); Task 5 is an independent doc edit; Task 6 is closeout. Suitable for subagent-driven-development one-at-a-time.
