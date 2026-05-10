# Phase 7 Prompt Workflow Parity Verification

Date: 2026-05-11

## 1. Scope

Phase 7 absorbed two references without turning them into production runtime dependencies:

- `video-agent-test/` was overwritten with the effective text/source/prompt contents from `/Users/Clock/video-agent-claude-wangbo`.
- `legacy/` was overwritten with `Rydia-China/Agent-Forge` latest `main` as reference code only.
- `agent/` gained a prompt-only, agent-native video CLI surface for payload dry-run, URL validation, run-state inspection, and prompt quality review/compare.

No real image generation or video generation was attempted in this phase.

## 2. Reference Sync

| Check | Result |
| --- | --- |
| Agent-Forge latest `main` SHA | `9a51410f42f76b5887a3d4a11bbae13cd80cf73c` |
| `git ls-remote https://github.com/Rydia-China/Agent-Forge.git refs/heads/main` | matched the synced SHA |
| `video-agent-test/` forbidden artifacts check | `0` forbidden `.git` / `.claude` / `.DS_Store` / mp4 / mov / generated-frame matches |
| `go test ./...` in `video-agent-test/` | passed |

`go test ./...` covered the copied reference modules:

- `video-agent-claude-wangbo/internal/download`
- `video-agent-claude-wangbo/internal/payload`
- `video-agent-claude-wangbo/internal/postprocess`
- `video-agent-claude-wangbo/internal/runstate`
- `video-agent-claude-wangbo/internal/upload`
- `video-agent-claude-wangbo/internal/validate`
- `video-agent-claude-wangbo/tests/e2e`

## 3. Implemented CLI Surface

The final Phase 7 CLI command set is:

- `agent video payload <prompt>`
- `agent video validate <prompt>`
- `agent video submit <prompt> --dry-run`
- `agent video status <runDir>`
- `agent video prompt review <prompt>`
- `agent video prompt compare <candidate> <reference>`

Live submit is intentionally disabled in this prompt-only path. Running `agent video submit <prompt>` without `--dry-run` exits with code `2` and tells the caller to rerun with `--dry-run`.

## 4. Acceptance Checklist

| Acceptance item | Status | Evidence |
| --- | --- | --- |
| `video-agent-test/` synced from `video-agent-claude-wangbo` effective content | ✅ | directory overwritten; reference Go tests passed |
| `video-agent-test/` has no local heavy/generated artifacts | ✅ | forbidden artifact count `0` |
| `legacy/` synced to Agent-Forge latest `main` | ✅ | SHA `9a51410f42f76b5887a3d4a11bbae13cd80cf73c` verified with `git ls-remote` |
| Prompt-only video CLI implemented | ✅ | `payload`, `validate`, `submit --dry-run`, `status`, `review`, `compare` implemented under `agent/packages/opencode/src/video/` and `src/cli/cmd/video.ts` |
| Prompt generation/quality comparison only; no real media generation | ✅ | no `generate-image-*` or `generate-video-*` tool invocation; live submit blocked |
| Existing media atomic tool interfaces preserved | ✅ | only metadata typing fixes; no provider call behavior changed |
| `agent config export-schema` exposes new commands | ✅ | schema tool count updated to `28`; includes `video-submit` |
| `bun run agent:build` | ✅ | passed; bundle generated at `agent/packages/opencode/dist/agent.mjs` |
| `bun --cwd=agent run typecheck` | ✅ | passed via turbo, `4` tasks successful |
| Related unit tests | ✅ | `bun --cwd=agent/packages/opencode test test/video/video.test.ts test/cli/cmd-config.test.ts`: `16` pass, `0` fail |
| `bun --cwd=web run typecheck` | ✅ | passed |
| `bun --cwd=web run build` | ✅ | passed after replacing build-time Google Font fetch with system font tokens |
| Patch hygiene | ✅ | `git diff --check` passed |

## 5. CLI Smoke Results

Built CLI smoke checks were run against `agent/packages/opencode/dist/agent.mjs`:

| Smoke | Result |
| --- | --- |
| `video payload` preserves unquoted `ratio: 9:16` | ✅ output ratio `9:16` |
| `config export-schema` contains `video-submit` | ✅ |
| `video submit --dry-run` | ✅ wrote default prompt-local dry-run state; status `dry_run` |
| `video status <runDir>` | ✅ read the dry-run run directory state as `dry_run` |
| `video prompt compare` same-file comparison | ✅ score `100` |
| `video validate` with local mocked PNG URL | ✅ output `true` and `image/png` |
| live `video submit` without `--dry-run` | ✅ exit code `2`; live submit disabled |

Prompt quality comparison against copied reference prompts:

- `video-agent-test/works/silver-moon-manor/episodes/ep_2/shots/shot_1/prompt.md` review score: `92`, `11/12` checks.
- `shot_1` vs `shot_2` compare score: `98`; deltas: score `0`, body length `-13`, timecode count `1`, image marker count `-2`, forbidden count `0`.

## 6. Notes And Deviations

- Built CLI smoke found and fixed a prompt-local asset sidecar gap: local asset refs now resolve against `--project-root` first, then the prompt file directory. This preserves copied reference prompts that use repo-root paths while making standalone prompt files portable.
- The named `superpowers:code-reviewer` command is not installed in this local environment (`which superpowers` returned no executable). A read-only Phase 7 code-review pass was run through the available review workflow instead; findings are recorded below.
- `/compact` cannot be invoked from this environment as a shell/tool command. It remains the next manual session step after commit and push.

## 7. Code Review

The available read-only code-review pass found one P2 issue:

- `agent video submit <prompt> --dry-run` skipped run-state artifacts unless `--run-dir` was explicitly provided.

Resolution:

- `video submit --dry-run` now always creates a run directory. With no `--run-dir`, it uses the default prompt-local `runs/<timestamp>` path and writes `request.json` plus `state.json`.
- Added a CLI handler test covering submit without `--run-dir`.
- The same pass reported no runtime references from production code/tests to `video-agent-test` or `legacy`, no sanitized snapshot blockers under `video-agent-test`, and no hardcoded workflow/orchestration service names in production `agent`/`web` code.
