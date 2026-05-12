# Phase 7 — Prompt Workflow Parity & Launch Readiness Plan

> Spec ref: [§ 10 Phase 7](2026-04-29-assets-produce-spec.md#phase-7--prompt-workflow-parity--launch-readiness--18) / [§ 15 row 1.8](2026-04-29-assets-produce-spec.md#15-修订记录)
> Date: 2026-05-11
> Scope update from user: do not attempt any image or video generation; only generate prompt text and compare quality with the supplied reference.
> Superseded update: on 2026-05-12, video workflow execution was externalized to the top-level `videoctl/` CLI and Claude skill source; opencode no longer owns `agent video` or a built-in `videoctl` tool.

## 0. Decision Table

| Item | Decision | Reason |
|---|---|---|
| Phase name | Phase 7 — Prompt Workflow Parity & Launch Readiness | Scope is outside Phase 0-6 and touches reference snapshots, CLI, tests, and readiness gates |
| Reference sync | `video-agent-test/` becomes a sanitized learning snapshot of `/Users/Clock/video-agent-claude-wangbo` | User explicitly asked to overwrite the old `video-agent-test` with effective content |
| Sanitization | Copy source/docs/tests/scripts/skills/works text, `.url` sidecars, and prompt samples; exclude `.git/`, `.claude/`, `.DS_Store`, local binaries, `node_modules`, true video files, generated frame/media outputs | Keeps useful workflow knowledge without committing local secrets, worktrees, or heavy/generated artifacts |
| Agent-Forge sync | Replace `legacy/` with latest `Rydia-China/Agent-Forge@main` | User explicitly asked for direct latest sync; `legacy/` remains reference-only |
| Runtime dependency | CLI implementation must not depend on `video-agent-test/` or `legacy/` at runtime | References are learning snapshots, not production code paths |
| Generation policy | No true image/video generation tests in this phase | User explicitly prohibited image/video generation attempts |
| Prompt quality | Verify generated prompt text against reference structure and review checklist | User wants prompt generation and comparison to reference level |
| Skill body | Do not add a loadable markdown skill body outside Langfuse | Keeps § 2/§ 5 red line intact |
| Implementation shape | Add a `video` CLI group plus reusable TS library under `agent/packages/opencode/src/video/` | Mirrors `videoctl` deterministic boundary while fitting existing agent-native CLI patterns |
| Atomic tools | Keep existing `generate-image-*` / `generate-video-*` tools unchanged except type fixes required for typecheck | User said image generation should be retained, but not invoked now |

## 1. Deliverables

### 1.1 Reference Snapshots

- `video-agent-test/` overwritten with sanitized `video-agent-claude-wangbo` effective content.
- `video-agent-test/README.md` updated or preserved from the source snapshot so future agents understand it is a reference sample.
- `legacy/` overwritten with Agent-Forge `main` at commit `9a51410f42f76b5887a3d4a11bbae13cd80cf73c` or newer if `main` advances before sync.
- Verification records exact upstream SHA and sanitization exclusions.

### 1.2 CLI / Library

- New video prompt deterministic library:
  - prompt frontmatter parser
  - asset URL and `.url` sidecar resolver
  - payload builder compatible with the reference `videoctl` contract
  - URL validation with `HEAD` then fallback `GET`
  - dry-run run directory writer (`request.json`, `state.json`)
  - status reader
  - prompt review/checklist evaluator
  - prompt comparison report against a reference prompt
- New `agent video` command group:
  - `video payload <prompt.md>`
  - `video validate <prompt.md>`
  - `video submit <prompt.md> --dry-run`
  - `video status <run-dir>`
  - `video prompt review <prompt.md>`
  - `video prompt compare <candidate.md> <reference.md>`
  - optional `video prompt scaffold` only if needed to create test fixtures or guide external agents without LLM calls
- `agent config export-schema` includes new video commands.
- `ERRORS.md` / `SKILL.md` mention prompt-only video workflow commands and explicitly warn that real media generation is not part of Phase 7 tests.

### 1.3 Existing Blockers

- Fix current `agent` typecheck failures:
  - metadata union inference in asset tools and `skill` tool
  - `Skill.loadBody` Effect error type mismatch
- Preserve runtime behavior of existing tools after type fixes.
- Keep WebUI build and typecheck green.

### 1.4 Real Agent AB Expansion

User correction after the first parity pass: comparing copied prompt payloads is not sufficient. The required AB test must start from the same real story/source context and let each Agent independently produce prompt artifacts.

Expected output:
- Five distinct real cases from the Silver Moon Manor production corpus, each run three times on both sides.
- Reference side for video prompt behavior: `video-agent-test` Claude Code workflow and its video generation skill/reference files.
- Reference side for image and general asset prompt behavior: `legacy/` Agent-Forge prompt workflow and style/resource prompt conventions.
- Candidate side: current `agent` CLI / opencode Agent, using the same source context and no answer files.
- Per run artifacts:
  - raw Agent stdout/stderr or stream JSON trace
  - elapsed wall time
  - token usage when reported by the Agent runtime
  - generated image prompt JSON/text
  - generated video prompt markdown/text
  - self-review / checklist output when produced
  - evaluator report for behavior trajectory correctness and final prompt effect
- A final AB report with aggregated timing, token usage, trajectory scores, prompt consistency scores, and replacement gaps.

Isolation rules:
- The Agent under test may read scripts, style rules, character/resource mappings, and production reference manuals.
- The Agent under test must not read existing answer prompts under `works/**/episodes/**/shots/**/prompt.md`, `video-agent-test/ablation/**`, or any generated AB output from another run.
- The harness must not call image/video generation, upload, live video submit, download, or frame extraction commands.
- `videoctl` and `agent video` may only be used for prompt parsing, review, payload construction, URL validation with explicit dry-run/local fixtures, and run-state dry-run checks.
- `legacy/` hardcoded orchestration services remain reference material only; production fixes must stay agent-native and atomic-tool/skill based.

## 2. Execution Steps

### Step 1 — Baseline Capture

Expected output:
- Record current `git status`, current `agent` typecheck failure classes, and current web/build state.
- Record reference source SHA or local state for `/Users/Clock/video-agent-claude-wangbo`.
- Record Agent-Forge remote `main` SHA.

Tests:
- `bun run agent:build`
- `bun --cwd=agent run typecheck` expected to fail before fixes; capture failing files.
- `bun --cwd=web run typecheck`
- `bun --cwd=web run build`

### Step 2 — Reference Snapshot Sync

Expected output:
- `video-agent-test/` replaced by sanitized effective content from `/Users/Clock/video-agent-claude-wangbo`.
- `legacy/` replaced by Agent-Forge latest `main`.
- No `.git/`, `.claude/`, `.DS_Store`, binary `scripts/bin/videoctl`, mp4, or generated frame files in the copied reference snapshot.

Tests:
- `find video-agent-test -name .git -o -name .claude -o -name .DS_Store`
- `find video-agent-test -type f \( -name '*.mp4' -o -name '*-last.png' -o -name 'last_frame.png' \)`
- `git -C /tmp/assets-produce-agent-forge-latest rev-parse HEAD`
- `test -f legacy/AGENTS.md && test -f legacy/docs/api-playbook.md`

### Step 3 — Implement Video Prompt Library

Expected output:
- TS modules under `agent/packages/opencode/src/video/`.
- Unit tests for:
  - YAML frontmatter parse errors
  - ratio `9:16` preservation
  - duration parsing (`12`, `12s`, default)
  - local path sidecar resolution
  - missing sidecar failure
  - OSS URL requirement and `--allow-non-oss`
  - payload image/video mapping
  - dry-run run directory artifacts
  - status reader
  - checklist review failure/success classes
  - prompt compare report

Tests:
- Targeted Bun tests for new `test/video/*`.

### Step 4 — Implement `agent video` CLI

Expected output:
- `agent video` command group wired into root CLI.
- Commands follow existing `OptionDef[]` pattern.
- JSON output works in non-TTY and explicit `--output json` paths.
- Mutating/disk-writing commands support `--dry-run` where applicable.
- Errors route through the central exit-code router.

Tests:
- `bun --conditions=browser ./src/index.ts video --help`
- `bun --conditions=browser ./src/index.ts video payload <fixture>`
- `bun --conditions=browser ./src/index.ts video validate <fixture> --allow-non-oss --json`
- `bun --conditions=browser ./src/index.ts video submit <fixture> --dry-run --run-dir <tmp> --json`
- `bun --conditions=browser ./src/index.ts video status <tmp>`
- `bun --conditions=browser ./src/index.ts video prompt review <fixture> --json`
- `bun --conditions=browser ./src/index.ts video prompt compare <candidate> <reference> --json`

### Step 5 — Export Schema / Docs

Expected output:
- `agent config export-schema` exposes video command tools.
- `ERRORS.md` includes video command error cases.
- `SKILL.md` includes prompt-only workflow quick start and no-media-generation warning.
- `.env.example` gets any new optional gateway config only if code reads it.

Tests:
- `bun --conditions=browser ./src/index.ts config export-schema | jq '.tools[] | select(.name | startswith("video-")) | .name'`
- `bun --conditions=browser ./src/index.ts config export-schema --command video-payload`
- Existing `test/cli/cmd-config.test.ts` updated and passing.

### Step 6 — Fix Existing Typecheck Blockers

Expected output:
- Asset tools and skill tool return metadata with stable superset shapes or explicit metadata typing.
- `Skill.loadBody` exposes the correct error channel or catches managed loader errors.
- No behavior regression in `tools list/show/export-schema`.

Tests:
- `bun --cwd=agent run typecheck`
- targeted `bun --cwd=agent/packages/opencode test test/tool/skill.test.ts`
- targeted tests for asset tool schema/export if existing.

### Step 7 — Prompt-Only E2E

Expected output:
- A temporary prompt fixture is created in `/tmp` with sidecar URL(s).
- CLI builds payload and dry-run run state.
- Review/compare produces a measurable report against a copied reference prompt.
- No true image/video generation command is invoked.

Tests:
- `agent video payload`
- `agent video validate` with mocked/local HTTP or `--allow-non-oss` fixture
- `agent video submit --dry-run`
- `agent video status`
- `agent video prompt review`
- `agent video prompt compare`
- Search command history / logs for accidental `generate-image` or `generate-video` live calls; none should exist in this phase.

### Step 8 — Full Readiness Gates

Expected output:
- Build/typecheck/test gates green.
- Phase 7 verification report written.
- Code review run and findings resolved or explicitly documented.
- Atomic commit(s), push to `origin/main`.

Tests:
- `bun run agent:build`
- `bun --cwd=agent run typecheck`
- relevant `bun --cwd=agent/packages/opencode test ...`
- `bun --cwd=web run typecheck`
- `bun --cwd=web run build`
- CLI smoke against built `agent/dist/agent.mjs`

### Step 9 — Real Agent AB Matrix

Expected output:
- A repeatable AB harness that executes five real cases, three repetitions each, for the reference Agent path and the candidate `agent` path.
- Each run writes a normalized artifact directory with prompts, traces, metrics, and no media outputs.
- The run prompt explicitly forbids answer-file reads and live media tool calls.
- Metrics are collected directly from runtime outputs where available and marked unavailable only when the runtime does not expose them.

Tests:
- One pilot case run for each side proves the harness captures prompt artifacts, trace, elapsed time, and token metadata.
- Full `5 cases × 3 reps × 2 sides` matrix completes or records a concrete runtime failure for each missing run.
- A post-run audit confirms no media generation/upload/download/extract command was invoked.
- Generated prompts are evaluated against script truth, reference manuals, existing authority prompt samples, and the historical `ablation/ABLATION_REPORT.md` scoring rubric.

## 3. Risks

| Risk | Trigger | Mitigation |
|---|---|---|
| Reference snapshot grows too large | Copying generated media from `video-agent-claude-wangbo` | Sanitized copy excludes generated video/frame files and local worktrees |
| Accidentally calls media generation | Testing `tools call generate-*` or live `video submit` without `--dry-run` | Verification commands are prompt-only; search logs and shell history in report; no `tools call generate-image-*` or `generate-video-*` live calls |
| Violates skill body red line | Copying `SKILL.md` as a production-loaded skill | Keep local prompt knowledge under inert `knowledge/novel-to-video/`; no file is named `SKILL.md`, and upload to Langfuse only after explicit user instruction |
| Reintroduces hardcoded workflow service | Porting Agent-Forge service names or orchestration classes | Implement deterministic primitives and CLI commands only; high-level playbook remains skill/prompt-level knowledge |
| `legacy/` AGENTS conflicts with current repo rules | Agent-Forge has its own workflow rules | `legacy/` is copied as inert reference content; current repo AGENTS controls active implementation |
| URL validation flakes on public network | Live URL HEAD/GET unstable | Unit tests use local mocked HTTP server; manual smoke may use `--allow-non-oss` fixture |
| Existing type errors hide new errors | Current typecheck already fails | Fix current failures before final gate and note baseline in verification |

## 4. Completion Definition

- [ ] Spec § 15 row 1.8 exists and Phase 7 section exists.
- [ ] This plan exists before code changes.
- [ ] `video-agent-test/` sanitized snapshot is refreshed.
- [ ] `legacy/` is refreshed from Agent-Forge latest `main`.
- [ ] `agent video` prompt-only CLI works and is schema-exported.
- [ ] No real image/video generation was attempted.
- [ ] Typecheck/build/test gates pass.
- [ ] Phase 7 verification report is written.
- [ ] Commit + push to `origin/main`.
- [ ] `/compact` requested after completion.
