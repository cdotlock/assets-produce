---
name: novel_to_mss
description: Orchestrate the upstream novel→.mss authoring pipeline — walk the frozen stage skills (novel-evaluator → character-architect → entity-planner → entity-normalizer → [entity-rename] → episode-writer) in n2m's documented order, dispatching independent reviewer sub-agents at each gate with PASS/CONDITIONAL/FAIL semantics, writing each stage to the moonscripts/<book>/NN-stage/ contract.
---

# novel_to_mss — Upstream Authoring Orchestration

This is **connective knowledge**, not a creative skill and not code. It tells a
driving agent (developer profile) the order to walk the frozen C1 stage skills,
where each stage writes, when to spawn reviewer sub-agents, and exactly what to
do with each reviewer verdict.

It does **not** restate what any stage skill does. Each stage and reviewer is
referenced by its skill `name` only — load that skill's own body for its method.
The sequencing here mirrors n2m's documented pipeline (`README.md §工作流` /
`SKILLS-GUIDE.md` / `CLAUDE.md`); do not reorder it.

Hard rule: the driving agent owns the loop. There is no orchestration service.
Every reviewer is an **independent fresh-context sub-agent** — never self-review
(n2m core design principle: "所有 reviewer 强制另起 agent，不自审").

---

## Stage DAG

Walk these stages strictly in order. A stage may not start until the previous
stage's gate (if any) returned an advance verdict.

```
novel full text
 → 1  novel-evaluator        (self-gate: GO / CONDITIONAL / NO-GO; no separate reviewer)
 → 2  character-architect    ⇄ bible-reviewer
 → 3  entity-planner         ⇄ planner-reviewer        (per-LI-route fan-out)
 → 4  entity-normalizer      (no reviewer)
 → [4.5 entity-rename        ⇄ rename-reviewer]        (OPTIONAL branch)
 → 5  episode-writer         ⇄ episode-writer-reviewer  (per episode),
                              then arc-reviewer          (after a full route arc)
 → .mss scripts
```

- **Stage 1 `novel-evaluator`** self-gates. It emits `GO` / `CONDITIONAL` /
  `NO-GO`. `GO` → proceed to stage 2. `CONDITIONAL` → surface the report; the
  operator decides whether to proceed (do not auto-advance). `NO-GO` → halt &
  surface; the novel is not adaptable.
- **Stage 4.5 `entity-rename` is the OPTIONAL branch.** Only enter it on an
  explicit rename / copyright-desensitization request. When skipped, stage 5
  follows stage 4 directly. `entity-rename` overwrites stage-4 JSON in place
  (backed up); downstream stages always read the stage-4 dir.
- **Stage 3 fans out per LI route** (see `## Per-route fan-out`): the main agent
  writes the common segment, then spawns one sub-agent per LI route.
- **Stage 5 fans out per route** as well, and after a full route's episodes have
  each passed `episode-writer-reviewer`, run `arc-reviewer` once over that whole
  arc.

Stages 1 and 4 have no separate reviewer (stage 4 is mechanical
normalization). All other stages are gated — see `## Gate contract`.

---

## Gate contract

One row per gated stage. The driving agent applies the verdict's action
literally. Verdict tokens are each reviewer's **real** vocabulary (confirmed
from the frozen C1 reviewer bodies — do not paraphrase).

This table is the **authoritative machine-parsed source** of the gate rule; the
`### Verdict semantics` prose and the per-reviewer normalization table below
mirror it for humans and must stay in sync with it. Parsers MUST split each row
into pipe-delimited cells and classify per-cell — never whole-row grep, because
the PASS cell ("advance") and the FAIL cell ("halt") share one physical Markdown
table line.

Note: the four action cells (PASS / CONDITIONAL / FAIL) are intentionally
identical across all gated-stage rows; they MUST be edited together or not at
all (rewording one FAIL cell without the others is a silent drift hazard).

| stage | producer skill | reviewer skill | PASS→ | CONDITIONAL→ | FAIL→ |
|---|---|---|---|---|---|
| 2 | `character-architect` | `bible-reviewer` | PASS: advance to the next stage | CONDITIONAL: producer applies the reviewer's listed fixes, then the SAME reviewer re-reviews (loop until PASS or FAIL) | FAIL: halt the pipeline and surface the reviewer report to the operator; run no further stages |
| 3 | `entity-planner` | `planner-reviewer` | PASS: advance to the next stage | CONDITIONAL: producer applies the reviewer's listed fixes, then the SAME reviewer re-reviews (loop until PASS or FAIL) | FAIL: halt the pipeline and surface the reviewer report to the operator; run no further stages |
| 4.5 (optional) | `entity-rename` | `rename-reviewer` | PASS: advance to the next stage | CONDITIONAL: producer applies the reviewer's listed fixes, then the SAME reviewer re-reviews (loop until PASS or FAIL) | FAIL: halt the pipeline and surface the reviewer report to the operator; run no further stages |
| 5 | `episode-writer` | `episode-writer-reviewer`, then `arc-reviewer` | PASS: advance to the next stage | CONDITIONAL: producer applies the reviewer's listed fixes, then the SAME reviewer re-reviews (loop until PASS or FAIL) | FAIL: halt the pipeline and surface the reviewer report to the operator; run no further stages |

### Verdict semantics (the canonical 3-way contract)

- **PASS** → advance to the next stage. (Stage 5: an episode is PASS only at the
  reviewer's stated bar; the arc is PASS only after `arc-reviewer` has no
  blocking prescription left — see below.)
- **CONDITIONAL** → the producer applies the reviewer's listed fixes, then the
  **same** reviewer re-reviews. This is a loop: re-review repeats until the
  verdict becomes PASS (advance) or FAIL (halt). Never advance on CONDITIONAL.
- **FAIL** → **halt** the pipeline immediately. Surface the reviewer's report to
  the operator. Do not advance, do not run any later stage, do not fabricate
  downstream output. (See `## Halt & surface`.)

### Per-reviewer real verdict tokens + normalization

The standard contract above uses `PASS` / `CONDITIONAL` / `FAIL`. Two reviewers
emit a near-equivalent vocabulary; map them onto the canonical actions exactly
as follows so the gate stays unambiguous:

| reviewer skill | real tokens it emits | normalize to canonical action |
|---|---|---|
| `bible-reviewer` | `PASS` / `CONDITIONAL` / `FAIL` | identity (PASS→advance, CONDITIONAL→fix+same-reviewer re-review loop, FAIL→halt) |
| `planner-reviewer` | `PASS` / `CONDITIONAL` / `FAIL` (≥9.0 / 7.0–8.9 / <7.0) | identity |
| `episode-writer-reviewer` | `PASS` / `CONDITIONAL` / `FAIL` (≥9.0 / 7.0–8.9 / <7.0) | identity |
| `rename-reviewer` | `PASS` / `WARN` / `FAIL` | PASS→advance; **WARN→treat as CONDITIONAL** (producer fixes, same reviewer re-reviews — loop); FAIL→halt |
| `arc-reviewer` | prescription list graded `P0` / `P1` / `P2` (no single verdict line) | any **P0 present → treat as FAIL** (halt: P0 = blocking, must be fixed before ship); only P1/P2 (or none) and all applied/approved → the arc is PASS (advance). `arc-reviewer` itself only diagnoses + applies after operator approval; it never auto-advances the pipeline. |

`novel-evaluator` (stage 1, self-gate, not in the table because it has no
separate reviewer): `GO` → advance; `CONDITIONAL` → operator decides (do not
auto-advance); `NO-GO` → halt & surface.

---

## Reviewer dispatch

Every gate review is performed by a **fresh-context independent sub-agent**,
dispatched through opencode's **existing** sub-agent tool. The tool is named
exactly **`task`** (opencode `agent/packages/opencode/src/tool/task.ts`, tool id
`task`). Do **not** write any new dispatch/orchestration code — invoke the
existing `task` tool.

`task` tool call shape (existing parameters — do not invent fields):

- `description`: a short (3–5 word) label, e.g. `"bible-reviewer gate"`.
- `subagent_type`: `"general-purpose"` (a fresh general sub-agent, matching
  n2m's "另起一个独立 agent" — the n2m reviewer bodies say "spawn a
  `general-purpose` sub-agent via the Task tool"; opencode's equivalent tool is
  `task`).
- `prompt`: the full reviewer instruction payload (assembled by the driving
  agent), which MUST contain:
  - an instruction to load and follow the reviewer skill body (by `name`, e.g.
    `bible-reviewer`) verbatim as its review protocol;
  - the absolute path(s) of the producer's just-written stage output (the files
    under the stage's `NN-stage/` dir);
  - the relevant upstream inputs the reviewer needs to cross-check (e.g. the
    Character Bible dir, the plan dir, the entity-normalizer JSON, the original
    novel dir, the reading log) — exactly the input list the reviewer skill's
    own "输入" section names;
  - the output path the reviewer must write its report to (inside the stage's
    `NN-stage/` dir — see `## Workspace writes`);
  - the requirement to return its verdict using its real tokens (see the gate
    contract's per-reviewer table).

Faithfulness rules carried over from n2m (do not soften):

- The sub-agent is **independent**: it must not be the same context that
  produced the stage output. Self-review is forbidden — the whole point of the
  fresh sub-agent is to escape the producer's self-protection bias.
- The review is a **full sweep, not sampling**. `bible-reviewer` does a full
  Evidence-Trail scan of every claim ("不抽样。全扫"); `planner-reviewer` fans
  out one sub-agent per route; `arc-reviewer` reads every episode of the arc.
  The driving agent must pass enough input for a full sweep, not a sample.
- The driving agent does **not** re-judge, average, or override the
  sub-agent's verdict. It reads the verdict, applies the gate-contract action,
  and (on CONDITIONAL) loops by re-dispatching the SAME reviewer after the
  producer applies fixes.

This section is an instruction to the driving agent. It introduces **no code**;
`task` already exists in the opencode tool registry.

---

## Workspace writes

The C1 helper `ensureNovelWorkspace(root, slug)`
(`agent/packages/opencode/src/business/novel/workspace.ts`) creates the on-disk
contract. `<base>` = `<workspace-root>/moonscripts/<book-slug>/`. The slug must
match `^[a-z0-9][a-z0-9-]*$` (kebab-case). Each stage writes its producer output
**and** its reviewer report into that stage's directory. These dir strings are
the C1 `AUTHORING_STAGE_DIRS` constant — they are the downstream-compat surface
and must be used verbatim.

| stage | producer skill | writes to (`<base>/`) |
|---|---|---|
| 1 | `novel-evaluator` | `01-novel-evaluator` |
| 2 | `character-architect` (+ `bible-reviewer` report) | `02-character-architect` |
| 3 | `entity-planner` (+ `planner-reviewer` report, per-route reviews) | `03-entity-planner` |
| 4 | `entity-normalizer` | `04-entity-normalizer` |
| 4.5 (optional) | `entity-rename` (+ `rename-reviewer` report) | `04.5-entity-rename` |
| 5 | `episode-writer` (+ `episode-writer-reviewer` reports) | `05-episode-writer/scripts` |

Verbatim `AUTHORING_STAGE_DIRS` directory strings (must each appear literally
above): `01-novel-evaluator`, `02-character-architect`, `03-entity-planner`,
`04-entity-normalizer`, `04.5-entity-rename`, `05-episode-writer/scripts`.

`arc-reviewer` is a project-local skill, not a global stage dir. Its
prescription file and any applied edits live under `<base>/skills/arc-reviewer/`
(created by `ensureNovelWorkspace` alongside the stage dirs); the episodes it
edits remain in `05-episode-writer/scripts`.

Post-MSS stages (02.5 / 05.5 / 06 / mss-build) are intentionally **out of
scope** for this orchestration body (C-track boundary). Stop at `.mss scripts`.

---

## Per-route fan-out

A finished interactive script has one **common segment** plus **N LI route
segments** (one per love interest). Two stages fan out per route; the driving
agent must respect the n2m concurrency rules.

**Stage 3 — `entity-planner` / `planner-reviewer`:**

- Producer side: the main agent writes the structure decision + common segment +
  soft-routing segment, then **concurrently** spawns one `entity-planner`
  sub-agent per LI route to write that route's exclusive segment. ("主 agent 写
  公共段，并发创建 N 个 sub-agent 写各 LI 路线.")
- Reviewer side: `planner-reviewer` spawns **N concurrent** route-reviewer
  sub-agents — one per LI route. Each route reviewer sees only the common
  segment + its own route + that LI's bible + the MC bible; it must NOT see
  other routes' files (cognitive isolation is the design's core). After all N
  return, the main agent does the cross-route consistency pass (ending-skeleton
  alignment, `@signal` semantics, episode-count balance) that no isolated
  sub-agent can do. The gate verdict for stage 3 is `planner-reviewer`'s
  aggregate `PASS` / `CONDITIONAL` / `FAIL` over the whole plan.

**Stage 5 — `episode-writer` / `episode-writer-reviewer` / `arc-reviewer`:**

- Producer side: episodes are written per route, one episode at a time, the
  producer self-iterating to its own bar before review.
- Per-episode gate: each episode is reviewed by a fresh independent
  `episode-writer-reviewer` sub-agent. Apply the gate contract per episode
  (PASS → that episode is done; CONDITIONAL → fix + same-reviewer re-review
  loop; FAIL → halt & surface).
- **Arc gate (after a full route arc):** once **every** episode of a route's
  arc (common arc or a single LI route arc) has reached PASS under
  `episode-writer-reviewer`, dispatch `arc-reviewer` once over that whole arc.
  `arc-reviewer` is two-phase: Phase 1 a fresh sub-agent reads every episode and
  emits a prescription list (`P0` / `P1` / `P2`); the driving agent surfaces it
  and waits for explicit operator approval; Phase 2 applies approved
  prescriptions with per-item verification. Treat **any unresolved P0 as FAIL**
  (halt — blocking, do not ship the arc). The arc is PASS (advance) only when no
  P0 remains and approved fixes are applied.

Do not start an LI route's exclusive episodes until the common arc has passed
its arc gate (downstream segments depend on the common arc being stable).

---

## .mss quality gate

Stage 5's `episode-writer-reviewer` / `arc-reviewer` gates judge **craft**. They
do **not** prove the produced `.mss` actually parses. The C1-frozen
`episode-writer` SKILL makes that a hard, non-negotiable delivery gate (交付硬门槛)
in its own body, in its `### 交付硬门槛` section ("每集 FINAL 之前必须
`mss compile` exit 0"): 「光读 spec / 跑 review 都不够 …… 只有 mss 编译器的判决是真理。
退出码非 0 = 不能 FINAL」. This
section wires that upstream-source-authority rule into this orchestration as a
mechanical gate the driving agent must apply; it does not weaken or reinterpret
the frozen rule, only enforces it.

The enforcement uses the **already-registered** atomic tool `mss-validate`
(opencode tool id `mss-validate` — the C3-frozen wrapper around the upstream MSS
validator). It returns `{verdict:"PASS"|"FAIL", errors, raw?, meta}`; a
`verdict:"FAIL"` is a **successful judgement that the script is invalid** (the
validator ran and found problems — it is NOT a tool error), and a genuine tool
failure surfaces instead as `metadata.error`.

**Where it sits:** after stage-5 `episode-writer` writes an episode's script to
`05-episode-writer/scripts/<ep>.mss` (the C1 `05-episode-writer/scripts` dir —
see `## Workspace writes`) and that episode has reached PASS under its
`episode-writer-reviewer` craft gate, the driving agent MUST call the registered
`mss-validate` tool on that produced episode `.mss`. Every produced episode
`.mss` is gated this way — no sampling.

**Verdict → action (same shape as a reviewer CONDITIONAL — see `## Gate
contract`):**

- `verdict:"PASS"` → the `.mss` parses; that episode may proceed toward FINAL
  (subject to the still-required arc gate — this gate is additive to, not a
  replacement for, `episode-writer-reviewer` / `arc-reviewer`).
- A **non-PASS** verdict — `verdict:"FAIL"`, or a tool `metadata.error` — is
  treated **exactly like a reviewer CONDITIONAL**: the producer applies fixes to
  the script (the `errors` / `raw` payload localizes them), then the driving
  agent **re-runs** `mss-validate` on the corrected `.mss`; this is a **loop**
  that repeats until `verdict:"PASS"`. The episode/route **MUST NOT be declared
  FINAL** while any non-PASS verdict stands — FINAL is blocked until
  `verdict:"PASS"`. If the loop never converges (the validator keeps returning
  `verdict:"FAIL"`, or a `metadata.error` cannot be cleared), escalate to
  `## Halt & surface` exactly as a non-converging CONDITIONAL does.

This gate is **AND-composed** with the stage-5 craft gates: an episode is FINAL
only when it has BOTH passed `episode-writer-reviewer` (and the arc passed
`arc-reviewer`) AND obtained an `mss-validate` `verdict:"PASS"`. Never present a
craft-passed but unparseable episode as FINAL.

This section is **connective knowledge, not code**. It introduces **no code**
and **defines no engine or orchestration service** — it directs the driving
agent to call the **already-registered** `mss-validate` tool and to apply its
verdict with the gate-contract loop semantics above. The driving agent owns the
loop, exactly as everywhere else in this body.

---

## Halt & surface

On any **FAIL** verdict, any unresolved `arc-reviewer` **P0**, a `novel-evaluator`
**NO-GO**, or any unrecoverable error (missing required input, reviewer cannot
run, repeated CONDITIONAL that never converges):

1. **Stop.** Do not advance to any later stage. Do not run a downstream
   producer. Do not fabricate or stub downstream stage output to "keep going".
2. **Persist the report.** Ensure the reviewer's report (or the error
   description) is written into the failing stage's `NN-stage/` directory (see
   `## Workspace writes`), so the operator can inspect it on disk.
3. **Surface to the operator.** Report, in plain terms: which stage failed,
   which reviewer/verdict (using the reviewer's real token), the report path,
   and the blocking items. Then yield control — the operator decides whether to
   fix-and-resume or abandon.
4. **CONDITIONAL is not a halt by itself** — it is the fix + same-reviewer
   re-review loop. But if that loop fails to converge (the operator's call, or
   the reviewer eventually returns FAIL), escalate to halt & surface per the
   steps above.

Never present a partially-completed or fabricated pipeline as a success. A
halted pipeline with a clear surfaced report is the correct outcome on FAIL.
