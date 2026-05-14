# assets-produce — agent-native CLI

Asset production platform with an agent-native CLI: runs from your shell, exposes a JSON tool schema for LLM-driven invocation, and uses standard exit codes for unattended operation.

This file is the entry point for any external coding agent (Claude Code, Codex,
Gemini CLI) pointed at this repo. It is not a manual — once you can run the CLI,
follow the links in section 8 for full surface area.

---

## 1. How to invoke

There are two ways to run the CLI today:

| Form | Status | Use when |
|---|---|---|
| `bun --conditions=browser ./agent/packages/opencode/src/index.ts <cmd>` | works at HEAD | development, agents driving the repo in place |
| `bunx agent <cmd>` (resolves `agent/dist/agent.mjs`) | shipped after Phase 6 Task 7 | unattended / production |

For brevity below, `agent` is shorthand for the dev invocation. Anchor the
alias to the repo root so it works from any sub-directory:

```bash
alias agent="bun --conditions=browser \"$(git rev-parse --show-toplevel)/agent/packages/opencode/src/index.ts\""
```

The CLI itself walks up to find `.env.example`, so it doesn't care which
sub-directory you `cd` to once the alias is set.

---

## 2. Quick start (60 seconds)

Five commands an agent can run right now to verify the install and discover
surface area. All exit 0 on a working install.

```bash
# 1. Version (sanity check)
agent --version
# → "local" in dev (or a semver tag once Task 7 ships the bundle)

# 2. Top-level command tree
agent --help

# 3. Export the full tool schema for LLM consumption (Anthropic shape by default;
#    pass --format openai for OpenAI tool-calling shape)
agent config export-schema --format openai | head -30

# 4. Verify required env vars are set (exits 3 with JSON {ok,missing} on failure)
agent config validate

# 5. Inspect a built-in tool's name + JSON params schema
agent tools list
agent tools show generate-image-nanobanana

# External video workflow CLI (kept outside opencode)
bun run videoctl:build
videoctl/bin/videoctl payload video-agent-test/works/silver-moon-manor/episodes/ep_2/shots/shot_1/prompt.md --allow-non-oss
videoctl/bin/videoctl validate video-agent-test/works/silver-moon-manor/episodes/ep_2/shots/shot_1/prompt.md --allow-non-oss --json
```

---

## 3. Output modes

- TTY: human-formatted text (tables, colors).
- Non-TTY (piped, captured, redirected): JSON by default.
- Force a mode with `--output text` or `--output json`.
- `CI=true` in the environment auto-implies `--output json` and disables prompts.
- `--non-interactive` makes any unanswerable prompt fail fast (exit 2) instead
  of blocking on stdin — required when an agent drives the CLI without a TTY.

---

## 4. Error handling

Exit codes are stable and machine-friendly:

| Code | Constant | Meaning |
|---|---|---|
| 0 | `SUCCESS` | normal completion |
| 1 | `GENERAL` | runtime failure |
| 2 | `USAGE` | invalid / missing args |
| 3 | `AUTH` | auth failure (incl. missing required env) |
| 4 | `QUOTA` | rate limit / quota |
| 5 | `TIMEOUT` | timeout |
| 6 | `NETWORK` | network error (ECONNREFUSED / ENOTFOUND / ...) |
| 10 | `CONTENT_FILTER` | content blocked |
| 130 | `SIGINT` | interrupted by Ctrl-C (auto-emitted by Node) |

For per-command × per-scenario error messages, see [`ERRORS.md`](ERRORS.md).

---

## 5. Agent-native usage patterns

### 5.1 Use the CLI as your LLM tool list

`agent config export-schema` emits a JSON document of the form
`{ tools: [...], global_flags: {...} }` that maps directly to a Claude or OpenAI
tool-calling tool list:

```bash
agent config export-schema --format openai > /tmp/tools.json
```

Every entry in `tools[]` has a kebab-case `name` (e.g. `users-add`,
`tools-call`, `oss-put`). Map it back to a CLI invocation by replacing each `-`
with a space — the leading group name (`users`, `tools`, `oss`, `skills`,
`config`) consumes the first `-`, and any remaining `-`s separate the
sub-command's own words. Examples:

| schema name | CLI invocation |
|---|---|
| `users-add` | `agent users add ...` |
| `tools-call` | `agent tools call <id> ...` |
| `oss-put` | `agent oss put <local> <key>` |
| `skills-export-schema` | `agent skills export-schema` |
| `run` | `agent run "..."` |

Top-level single-word entries like `run`, `serve`, `models` invoke directly
without a sub-command split.

Pass each property in the LLM's tool call as a `--<flag>` value (positionals
like `id`, `local`, `key`, `prefix` go before flags, in the order documented in
the `positionals` section of the schema entry).

### 5.2 Non-interactive runs

For unattended use (CI, scheduled job, agent harness):

```bash
CI=true agent --non-interactive run "say hi"
```

`CI=true` forces JSON output; `--non-interactive` makes prompts fatal so the
process never blocks on stdin.

### 5.3 Dry-run before mutate

Mutating commands (`users add`, `users passwd`, `skills add`, `skills update`,
…) accept `--dry-run`: the resolved request is printed as JSON and no DB /
Langfuse / OSS write happens.

```bash
agent users add --username alice --role creator --password testpw12 --dry-run
# → {"resolved":{"username":"alice","role":"creator","hasPassword":true},"dryRun":true}
```

Use this from an LLM to confirm field resolution before committing to a real
write.

### 5.4 External videoctl CLI

Video workflow execution is intentionally outside opencode. Use
`videoctl/bin/videoctl` for deterministic prompt payloads, media URL validation,
dry-run state, live submit after explicit user confirmation, download, and frame
post-processing.

```bash
bun run videoctl:build
videoctl/bin/videoctl payload <prompt.md>
videoctl/bin/videoctl validate <prompt.md> --timeout 300 --json
videoctl/bin/videoctl submit <prompt.md> --dry-run --run-dir /tmp/video-run --json
videoctl/bin/videoctl status /tmp/video-run --json
```

Claude Code sessions should load the source skill in
`claude-skills/novel-to-video/SKILL.md`; Codex/opencode sessions should use the
same CLI directly and read `knowledge/novel-to-video/`.

---

## 6. Required environment

Canonical list lives in [`.env.example`](.env.example). At minimum, to run
anything useful you need:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` (or `DEEPSEEK_API_KEY`) | LLM provider — Claude is the primary, DeepSeek is the fallback |
| `JWT_SECRET` | required by `agent serve` (WebUI auth); generate with `openssl rand -hex 32` |
| `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET` / `OSS_REGION` / `OSS_ENDPOINT` | required by `agent oss *` and any tool that uploads asset output |
| `LANGFUSE_HOST` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | required to fetch skill bodies and prompt templates |

Verify in one shot:

```bash
agent config validate
# → exit 0 with {"ok":true,"missing":[]}     when complete
# → exit 3 with {"ok":false,"missing":[...]} when incomplete
```

`agent config show` prints the effective env (with `*_KEY` / `*_SECRET` /
`*_TOKEN` redacted to `(set)` / `(unset)`) plus resolved defaults — useful for
debugging "why isn't this picking up my key?" without leaking secrets.

---

## 7. Architecture in 3 lines

SKILL/CLI/MCP/API four-layer. Production SKILL bodies are uploaded to Langfuse
(project `assets-produce`) when explicitly requested, but the current
novel-to-video source of truth is local and self-contained under
[`knowledge/novel-to-video/`](knowledge/novel-to-video/). The opencode CLI is
the generic agent entry point; video execution is delegated to the external
`videoctl` CLI; orchestration is by skills, never by hardcoded service code. See
[`docs/superpowers/specs/2026-04-29-assets-produce-spec.md`](docs/superpowers/specs/2026-04-29-assets-produce-spec.md)
§ 2 for the full design.

---

## 8. Public Asset Service API (Phase 8+)

`agent serve` exposes a REST surface at `/api/v1/assets/*` for external
callers (novels-to-moonscript, moonshort-backend, or any AI-native
consumer). Bearer-token gated; configure tokens via
`ASSETS_API_TOKEN_*` env vars (see [`.env.example`](.env.example)).

Four operations, all idempotent against (project_id, key, version):

| Op | Method + path | Use case |
|---|---|---|
| `asset.create` | `POST /api/v1/assets/create` | Trigger generation; returns queued job id |
| `asset.status` | `GET /api/v1/assets/jobs/:id` | Poll job state; succeeded view has url + meta |
| `asset.lookup` | `POST /api/v1/assets/lookup` | Batch resolve keys / names → urls |
| `asset.catalog.since` | `GET /api/v1/assets/catalog` | Incremental sync via cursor |

Canonical contract: [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

Phase 8 ships a placeholder atomic-tool generator that returns a
deterministic stub URL so the four endpoints round-trip end-to-end
without real LLM/atomic-tool calls. Phase 9+ swaps in the
LLM-driven mini agent loop that consumes the skill bodies in
[`knowledge/asset-generation/`](knowledge/asset-generation/).

Integration examples (Phase 10):

```bash
# moonshort-backend creates a CG asset
curl -X POST http://localhost:8001/api/v1/assets/create \
  -H 'Authorization: Bearer $ASSETS_API_TOKEN_MSB' \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "novel_silver_moon",
    "asset_intent": {
      "kind": "cg",
      "key": "ep_3/sylvia_glyph",
      "spec_md": "Sylvia raises hand; silver glyph ignites."
    },
    "client_request_id": "moonshort:remix:42"
  }'

# novels-to-moonscript resolves asset_refs back to OSS URLs
curl -X POST http://localhost:8001/api/v1/assets/lookup \
  -H 'Authorization: Bearer $ASSETS_API_TOKEN_NTMS' \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "novel_silver_moon",
    "queries": [{ "name": "Sylvia 立绘" }]
  }'
```

Errors follow `{error:{code,message}}` envelope; the full code matrix
lives in [`ERRORS.md` § Asset Service](ERRORS.md).

---

## 9. Links

- [Main spec](docs/superpowers/specs/2026-04-29-assets-produce-spec.md) — architecture, phase plan, acceptance criteria
- [`ERRORS.md`](ERRORS.md) — per-command × per-scenario error catalog
- [`.env.example`](.env.example) — canonical env list (every field the CLI reads)
- [`docs/api/openapi.yaml`](docs/api/openapi.yaml) — Asset Service REST contract
- [Phase plans](docs/superpowers/specs/) — `phase-N-*-plan.md` for active work, `phase-N-*-verification.md` for sign-offs
