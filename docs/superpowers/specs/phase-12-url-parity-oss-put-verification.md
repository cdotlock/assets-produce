# Phase 12 — URL 对等 + oss-put · Verification

> Plan: [`phase-12-url-parity-oss-put-plan.md`](phase-12-url-parity-oss-put-plan.md)
> Spec: [§ 10 Phase 12](2026-04-29-assets-produce-spec.md) / [§ 15 r1.12](2026-04-29-assets-produce-spec.md)
> Date: 2026-05-16 · Branch `main` · Executed via `superpowers:subagent-driven-development` (fresh implementer per task + two-stage review)

## Commit chain (Phase 11 close `88e7d09` → Phase 12 HEAD `4584b1b`)

| SHA | Type | What |
|---|---|---|
| `bd83589` | feat | `oss-put` atomic tool + `.txt` + 11 tests (TDD) |
| `3008ab4` | fix | code-review: conditional `content_type` metadata + `MAX_UPLOAD_BYTES` cap + 3 tests |
| `0ff64d9` | feat | register `oss-put` in `registry.ts` (4 sites) |
| `97d41d2` | docs | `cg-render-spec.md` — `oss-put` made the mandatory delivery step |
| `160b298` | docs | `upscale-spec.md` — new 6-section skill body (165 L) |
| `c150855` | feat | register `upscale-spec` in asset-service picker allowlist (no new AssetKind) |
| `fe3d9dd` | docs | sync `SKILL.md` / `ERRORS.md` / README for Phase 12 |
| `a3f2064` | fix | correct `oss-put` schema-reject row in `ERRORS.md` to match real CLI behavior |
| `4584b1b` | docs | final-review IMPORTANT-1: reconcile `upscale-spec.md` registry-membership wording with `intent-to-skill.ts` + README |

Whole-range diff (`bd83589~1..4584b1b`): **11 files, +716 / −3**. No other file touched.

## §5 Acceptance Checklist

- [x] **`oss-put` 在 `agent tools list` 出现，`agent tools show oss-put` schema 完整.**
  `tools list` emits `"id": "oss-put"`; `tools export-schema oss-put` returns a complete JSON Schema: `local_path` (string, `minLength:1`, `required`), `oss_prefix`, `content_type`, `dryRun`, with the content-type-precedence description. Independently reviewed (Task B) + re-confirmed at controller e2e (Task F).

- [x] **`cg-render` / `upscale-image` 经 skill 编排最终产出 OSS URL** — structurally verified; live round-trip deferred (see §-3).
  `cg-render-spec.md` (`97d41d2`) makes `oss-put` a **bold REQUIRED final step** + a Output-shape delivery contract ("`url` is always the `oss-put` OSS URL, never the local path") + an `oss-put`-failure bullet. `upscale-spec.md` (`160b298`) created with the identical mandate and registered picker-selectable (`c150855`, with a test asserting the picker resolves `"upscale-spec"` and would fail without the allowlist entry). `oss-put` is registered and CLI-invocable: dryRun → deterministic plan JSON `{tool,key:"<prefix>/<uuid>.<ext>",dryRun:true}`; folded-error path byte-matches source. The real OSS upload path is fully unit-tested with an injected uploader. Live OSS round-trip with credentials is a documented deferred item (§-3), exactly mirroring Phase 11 §5.8.

- [x] **单元覆盖 `oss-put` happy / 错误 ≥ 80% 行覆盖；mock OSS.**
  `test/tool/oss-put.test.ts`: **14 tests**, **94.07 % line coverage** (code-quality-reviewer-verified). Injected `stubUploader` — no `ali-oss` / network. Covers: dryRun (no upload, not-https), happy (bare https URL, `metadata.ossUrl===output`, key regex, buffer size), `oss_prefix` slash-trim + empty-trim→default, `content_type`→extension (and NOT echoed when file has its own ext), non-absolute / non-existent / non-regular / 0-byte / over-`MAX_UPLOAD_BYTES`, uploader-throws fold, and schema decode (reject missing/empty `local_path`; accept full input).

- [x] **`bun --cwd=agent run typecheck` / `… run test` 全过；`bun --cwd=web run typecheck` / `… run build` 全过.**
  agent typecheck **4/4** green. opencode suite **2305 pass / 8 skip / 1 todo / 0 fail / 17 snapshots** (2314 tests, 177 files) — no drift vs the Phase 11 close baseline + the new oss-put/upscale-spec tests. web `tsc --noEmit` clean; web `build` succeeded (route table emitted, static+dynamic).

- [x] **`upscale-spec.md` ≥ 30 行；`cg-render-spec.md` 已更新为编排串 `oss-put`.**
  `upscale-spec.md` = **165 lines**, 6-section skill-body shape (Intent / Atomic tools / input contract / Inputs / Output / Failure / Boundary), `upscale-image` params verbatim from source, `oss-put` mandatory. `cg-render-spec.md` updated incrementally (`97d41d2`, +14/−2) — surgical 3-region tightening, zero Phase-9 content lost (independently reviewed).

- [x] **未新增 AssetKind；未改 `cg-render.ts` / `upscale-image.ts` 工具本体输出语义；未碰 `placeholderGenerator`.**
  Whole-range diff confirms EMPTY for: `types.ts`, `asset.sql` (n/a — kind enum lives in `types.ts`/`schema.test.ts`, both untouched), `DEFAULT_KIND_SKILL_MAP`, `schema.test.ts`, `http/routes.test.ts` (kind-suites 27/0, untouched → no AssetKind); `cg-render.ts` / `upscale-image.ts` (output semantics unchanged); `placeholderGenerator` / `asset.ts` / wire (untouched → REST still Phase-8 stub by design); `oss/oss.ts` (薄壳 — Phase 2 service NOT rewritten); `docs/api/openapi.yaml` (no enum change). agent typecheck green proves `Record<AssetKind, …>` exhaustiveness intact (no kind added).

- [x] **`phase-12-url-parity-oss-put-verification.md` 完成.** This document.

- [x] **所有 atomic commit push 到 origin/main.** Pushed `88e7d09..5053782 main -> main` (10 Phase 12 commits); `main…origin/main` = **0 / 0 in sync**; `origin/main` HEAD = `5053782`. (A trailing close-out commit ticks this very line.)

## Durable open items / notes (carry forward)

1. **registry.ts 收口 = 4 sites, not "3 处".** The plan §1.2 said "3 处"; reality is 4 (import / `yield*` bind / `Effect.all` `Tool.init` / `builtin[]` push). Same class of plan-undercount as Phase 11's "收口 is 6 not 4". Durable for all future atomic-tool registrations: mirror the closest sibling at all 4 sites, append-to-END.
2. **`upscale-spec` is the first skill in `ASSET_GENERATION_SKILLS` with no backing AssetKind / no `DEFAULT_KIND_SKILL_MAP` entry — intentional.** A no-kind post-process skill is reachable via tier-1 `skill_hint` / tier-2 picker, with no tier-3 kind fallback. The plan had an internal tension (Step 5 "intent-to-skill 能识别 upscale-spec" vs Acceptance "未新增 AssetKind"); resolved by registering in the *picker allowlist only* (allowlist membership ≠ AssetKind). A controller trust-but-verify caught that the first implementer attempt left `upscale-spec` out of the allowlist, which would have made the skill body a dead file (picker rejects non-allowlisted output as a hallucination). Durable pattern for future non-kind skill bodies.
3. **Real OSS round-trip e2e DEFERRED** — no `OSS_*` credentials in the local env. dryRun / folded-error / schema-reject / malformed-JSON CLI paths verified live; the real upload path is fully unit-tested via the injected uploader; skill orchestration is structurally wired + reviewed. Run a live `tools call oss-put` (and an `agent` session over cg-render-spec / upscale-spec) when OSS creds are available. Non-blocking; exact Phase 11 §5.8 precedent.
4. **`content_type` is advisory.** OSS infers the served content-type from the object key's file extension (proven Phase 11 SFX `.mp3` pattern). `oss-put` derives the key extension from `local_path`; `content_type` only selects the extension when the local file has none, and is then NOT echoed in metadata if it didn't drive the key (code-review IMPORTANT-2 fix `3008ab4`). `oss.ts` was deliberately NOT modified (薄壳 / red line). Documented in `oss-put.txt` + `ERRORS.md`.
5. **`MAX_UPLOAD_BYTES` = 512 MiB**, injectable via `MakeOssPutToolOpts.maxUploadBytes`; oversize is rejected via `stat.size` BEFORE `readFile` (memory-safety guard, code-review MINOR-1 `3008ab4`).
6. **Pre-existing Phase 11 `ERRORS.md` inaccuracy discovered during Phase 12 e2e (out of scope, flagged separately).** Phase 11's sfx/music rows + the shared convention prose mislabel schema-constraint rejections of well-formed JSON as `invalid JSON params: <reason>` exit 2; the real CLI behavior is `tool error: The <id> tool was called with invalid arguments: SchemaError(…)` exit **1** (the exit-2 `invalid JSON params` path is only for genuinely unparseable JSON). Phase 11 is closed → fixing its rows is out of Phase 12 scope; raised as a standalone follow-up task. Phase 12's own `oss-put` subsection was corrected (`a3f2064`, with three live CLI confirmations).
7. **`oss-sync` (batch directory upload) NOT registered as an atomic tool** — sustained Phase 9 decision (LLM should not drive bulk directory uploads); plan Out-of-Scope. `oss-put` is single-file only.
8. **REST `create {kind}` still returns the Phase-8 stub by design** (`placeholderGenerator` untouched) — non-goal, consistent with Phase 11; the real out-of-work path is CLI/Session per design §7.

## Residual (non-blocking, optional)

- One untested-but-correct branch in `oss-put.ts`: no-extension local file + an *unmapped* `content_type` → field correctly not echoed. Verified correct by two independent reviewers via inspection; an explicit test is optional (YAGNI) and does not gate. (Mirrors how Phase 11 carried optional residuals.)

## Final whole-phase `superpowers:code-reviewer`

Holistic pass over the entire `bd83589~1..a3f2064` diff + plan + this report. Verdict: **"Phase 12 ready to close: yes"** (0 CRITICAL). Cross-cutting findings:

- **IMPORTANT-1 (found & fixed → `4584b1b`):** `upscale-spec.md` body still asserted "does not appear in `ASSET_GENERATION_SKILLS` … discovery is by file" — written in `160b298` before the picker-registration fix `c150855` landed, and never reconciled. The skill body (LLM-facing routing context) thereby contradicted both `intent-to-skill.ts` and the same-phase README. A per-task review structurally could not see this cross-commit drift; the whole-phase pass did. Fixed: body now states it has no `DEFAULT_KIND_SKILL_MAP` entry (no tier-3 kind path) but IS in the `ASSET_GENERATION_SKILLS` picker allowlist (tier-1 `skill_hint` / tier-2 picker reachable). Now consistent across body ↔ code ↔ README.
- **MINOR-1 (optional, skipped — YAGNI):** `oss-put.txt:7` uses "ignored" for the content_type advisory rule where the schema/`ERRORS.md` say "selects the key extension if the local file has none" — same meaning, the `.txt` is if anything the clearest surface; no behavioral drift, no LLM-misleading risk. No code change.
- **MINOR-2 (optional, skipped — YAGNI):** the disclosed residual untested branch (no-ext file + unmapped `content_type`); coverage 94% > gate, correctness verified by inspection by two reviewers. Disclosure confirmed honest.

Reviewer explicitly confirmed: all red lines held, `never` channel sound end-to-end, security boundary honest+sufficient, suite genuinely green for the right reasons, the no-AssetKind `upscale-spec` decision architecturally sound, and the §5 tick-off + 8 open items honest (no defect hidden as an open item).

## Verdict

All §5 acceptance items satisfied with evidence. Phase 12 delivered exactly the planned scope — one new `oss-put` atomic tool (thin shell over the Phase 2 OSS service) + skill-orchestration parity for `cg-render` / `upscale-image` — with **no new AssetKind, no `placeholderGenerator` contact, no tool-body or `oss.ts` rewrite**. Ready for the final whole-phase `superpowers:code-reviewer`, then push + `/compact` + user gate before Phase 13.
