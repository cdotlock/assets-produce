# Phase 7 Prompt Workflow Parity Verification

Date: 2026-05-11

Superseded update: on 2026-05-12, the Phase 7 video workflow surface was
externalized to the top-level `videoctl/` CLI and `claude-skills/novel-to-video/`.
The historical `agent video` and built-in opencode `videoctl` evidence below is
kept as implementation history, not the current runtime boundary.

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
| Related unit tests | ✅ | `bun --cwd=agent/packages/opencode test test/video/video.test.ts test/cli/cmd-config.test.ts`: `17` pass, `0` fail |
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

## 6. AB Prompt Parity

Added repeatable prompt-only AB script:

```bash
bun scripts/phase7-ab-prompt-parity.mjs
```

It compares the copied reference `video-agent-test` Go `videoctl` against the new built `agent video` CLI without calling any image/video generation, upload, download, or postprocess command.

Latest result:

- ✅ basic payload: payload JSON and `prompt` field match reference `videoctl`
- ✅ continuation payload: payload JSON and `prompt` field match reference `videoctl`
- ✅ text-only payload: payload JSON and `prompt` field match reference `videoctl`
- ✅ invalid duration: both sides fail
- ✅ dry-run request: `request.json` matches reference `videoctl`
- ✅ validate: normalized URL validation result matches reference `videoctl`

AB caught and fixed two parity bugs:

- duplicate `previous_video_url` handling: `agent video payload` now deduplicates previous video URL exactly like `videoctl`.
- invalid string duration: `agent video payload` now fails instead of silently falling back to `12`.

The AB assertion that matters for final prompt output is strict: `payload.prompt` from `videoctl` must equal `payload.prompt` from `agent video` for every AB payload case.

## 7. Notes And Deviations

- Built CLI smoke found and fixed a prompt-local asset sidecar gap: local asset refs now resolve against `--project-root` first, then the prompt file directory. This preserves copied reference prompts that use repo-root paths while making standalone prompt files portable.
- The named `superpowers:code-reviewer` command is not installed in this local environment (`which superpowers` returned no executable). A read-only Phase 7 code-review pass was run through the available review workflow instead; findings are recorded below.
- `/compact` cannot be invoked from this environment as a shell/tool command. It remains the next manual session step after commit and push.

## 8. Code Review

The available read-only code-review pass found one P2 issue:

- `agent video submit <prompt> --dry-run` skipped run-state artifacts unless `--run-dir` was explicitly provided.

Resolution:

- `video submit --dry-run` now always creates a run directory. With no `--run-dir`, it uses the default prompt-local `runs/<timestamp>` path and writes `request.json` plus `state.json`.
- Added a CLI handler test covering submit without `--run-dir`.
- The same pass reported no runtime references from production code/tests to `video-agent-test` or `legacy`, no sanitized snapshot blockers under `video-agent-test`, and no hardcoded workflow/orchestration service names in production `agent`/`web` code.

## 9. Real Agent AB Test

A real prompt-generation AB matrix was added and run through:

```bash
bun scripts/phase7-real-agent-ab.mjs --clean --run-id full-20260511-real-agent-ab-v1
```

The harness uses five distinct EP2 Silver Moon Manor cases, three repetitions per side, isolated `/tmp` workspaces, and no answer prompt files. Each run records:

- elapsed wall time
- token/cost data from the opencode SQLite trace
- full tool trace
- generated image prompt JSON
- generated video prompt markdown
- legacy-compatible video prompt JSON
- self-review and trace summary
- deterministic evaluation against script truth, authority prompt sections, review checklist, and prompt compare score

Media safety audit:

| Check | Result |
| --- | --- |
| image generation tool calls | `0` |
| video generation tool calls | `0` |
| upload/download/extract/live submit calls | `0` |
| forbidden answer-file reads | `0` |
| failed runs | `0` |

Direct Claude Code execution for `video-agent-test/scripts/claude-mob` could not be used in this environment because the configured Claude Code model endpoint rejected every tested model ID. The reference side therefore ran the isolated `video-agent-test` workflow bundle through the same opencode runner, while still using the copied reference rules, script, character DNA, Seedance lessons, director playbook, and review checklist.

## 10. Managed Skill Fix And Final Candidate Run

The initial full matrix exposed two real replacement gaps:

- The global `oh-my-openagent` plugin registered its own `skill` tool and did not receive assets-produce managed skills, so `novel-to-video` could be missing during `opencode run`.
- The Langfuse `novel-to-video` body was still the old short template that directly called media generation tools and capped prompts at 200 characters.

Fixes:

- `agent/packages/opencode/src/plugin/index.ts` now passes native managed skills, with loaded Langfuse bodies, into external plugins that understand the optional `ctx.skills` extension.
- The Langfuse `skill_novel-to-video` production body was updated to the agent-native workflow: prompt-only default, Agent-Forge style material prompts, video-agent-test nine-section video prompt rules, review/checklist gates, and explicit live-generation boundaries.
- The AB harness candidate prompt now requires loading `novel-to-video` first and records the error if loading fails.

Final candidate verification run:

```bash
bun scripts/phase7-real-agent-ab.mjs --sides candidate --clean --run-id candidate-20260511-managed-skill-v2
```

Comparison uses the already-run reference side from `full-20260511-real-agent-ab-v1` and the updated candidate side from `candidate-20260511-managed-skill-v2`.

| Case | Reference final | Candidate v2 final | Delta | Ref elapsed | Cand elapsed | Ref tokens | Cand tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| case1 cemetery departure | 94.67 | 96.33 | +1.66 | 209.5s | 221.8s | 254,442 | 388,473 |
| case2 living room Alpha command | 95.00 | 95.00 | 0.00 | 219.4s | 245.6s | 404,140 | 419,702 |
| case3 group entrance | 95.33 | 96.00 | +0.67 | 180.0s | 250.0s | 173,499 | 420,768 |
| case4 truth reveal | 97.00 | 97.00 | 0.00 | 211.9s | 272.6s | 329,585 | 446,706 |
| case5 silent pact | 95.00 | 95.00 | 0.00 | 218.5s | 224.7s | 403,871 | 355,795 |

Aggregate:

| Side | Final | Consistency | Behavior | Avg elapsed | Avg tokens | Avg cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| reference | 95.40 | 93.53 | 100 | 207.8s | 313,107 | $1.81 |
| candidate v2 | 95.87 | 94.53 | 100 | 242.9s | 406,289 | $2.32 |

Interpretation:

- Candidate v2 matches or beats the reference prompt effect score on all five cases.
- Candidate v2 loaded `novel-to-video` in all 15/15 runs.
- Candidate v2 is more expensive and slower on average: roughly +35.1s and +93k tokens per run.
- The remaining launch risk is performance/cost, not prompt behavior parity.

## 11. Local Self-Contained Prompt Knowledge Pack

Follow-up analysis found the v2 candidate path was correct but too heavy:

- It loaded the remote Langfuse `novel-to-video` skill and then read the local video-agent reference bundle.
- Several mandatory files were workflow-maintenance or live-generation documents, not prompt-only inputs.
- Extra context increased assistant turns and token cost without improving final prompt scores.

The candidate path was changed to use an inert local knowledge pack instead:

```text
knowledge/novel-to-video/
```

Active files:

- `prompt-only-contract.md`
- `image-style-presets.json`
- `video-prompt-standard.md`
- `character-reference-policy.md`
- `seedance-core-lessons.md`
- `director-playbook-core.md`
- `shot-id-policy.md`
- `nine-section-template.md`
- `videoctl-tool-reference.md`
- `langfuse-draft.md`
- `source-inventory.json`

The AB harness candidate side now copies only this compact local pack into the isolated workspace. It no longer requires or asks for the Langfuse `novel-to-video` skill. Any `skill` tool call is scored as a prompt-only boundary violation.

The old `video-agent-test/agent-skills/` tree, `legacy/`, and `cli-example/` are removed from the active repo. The AB harness now reads the local knowledge pack for both distilled reference instructions and candidate instructions; it no longer depends on deleted reference snapshots.

Validation:

```bash
node --check scripts/phase7-real-agent-ab.mjs
```

Result: pass.

## Local opencode `videoctl` tool integration

Added a built-in opencode tool named `videoctl` that wraps the local TypeScript `agent video` implementation. The tool is prompt-only/dry-run safe and exposes these operations:

- `payload`
- `validate`
- `submit_dry_run`
- `status`
- `prompt_review`
- `prompt_compare`

It intentionally does not expose live video submission, upload, download, frame extraction, concat, crop, or any image/video generation path.

Validation:

```bash
bun --cwd=agent/packages/opencode test test/video/video.test.ts test/tool/tool-define.test.ts
bun --cwd=agent/packages/opencode run typecheck
bun --cwd=agent/packages/opencode src/index.ts tools show videoctl
bun --cwd=agent/packages/opencode src/index.ts tools export-schema videoctl
bun --cwd=agent/packages/opencode src/index.ts tools call videoctl --json '{"operation":"prompt_review","promptPath":"<tmp>/prompt.md","projectRoot":"<tmp>"}' --output json
bun --cwd=agent/packages/opencode src/index.ts tools call videoctl --json '{"operation":"payload","promptPath":"<tmp>/prompt.md","projectRoot":"<tmp>"}' --output json
bun --cwd=agent/packages/opencode src/index.ts tools call videoctl --json '{"operation":"submit_dry_run","promptPath":"<tmp>/prompt.md","projectRoot":"<tmp>","runDir":"<tmp>/run"}' --output json
bun --cwd=agent/packages/opencode src/index.ts tools call videoctl --json '{"operation":"status","runDir":"<tmp>/run","projectRoot":"<tmp>"}' --output json
bun --cwd=agent/packages/opencode src/index.ts tools call videoctl --json '{"operation":"validate","promptPath":"<tmp>/empty.md","projectRoot":"<tmp>","allowEmpty":true,"timeoutSeconds":1}' --output json
bun --cwd=agent/packages/opencode src/index.ts tools call videoctl --json '{"operation":"prompt_compare","promptPath":"<tmp>/empty.md","referencePromptPath":"<tmp>/empty.md","projectRoot":"<tmp>"}' --output json
bun run agent:build
bun agent/dist/agent.mjs tools show videoctl
bun agent/dist/agent.mjs tools call videoctl --json '{"operation":"prompt_review","promptPath":"<tmp>/prompt.md","projectRoot":"<tmp>"}' --output json
git diff --check
```

Results:

- tests: 12 pass, 0 fail
- typecheck: pass
- source CLI: all six `videoctl` operations returned local JSON results
- built CLI: `videoctl` is discoverable and callable from `agent/dist/agent.mjs`
- live media generation: not attempted

No new full AB matrix was run after this cleanup; the next matrix should use a new run id and compare the local-pack candidate against the saved reference baseline.

## Reference Folder Cleanup

Removed non-runtime reference folders after their useful lessons were distilled into local knowledge and opencode tools:

- `legacy/`
- `cli-example/`
- `video-agent-test/agent-skills/`

The live project path is now `agent/`, `web/`, `knowledge/`, `video-agent-test/` fixtures, and docs.
