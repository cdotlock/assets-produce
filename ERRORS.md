# Agent CLI Error Reference

This document lists each user-facing error scenario per command together with
the message printed and the resulting exit code. Exit codes follow the central
table at the bottom of this file (`SUCCESS=0`, `GENERAL=1`, `USAGE=2`,
`AUTH=3`, `QUOTA=4`, `TIMEOUT=5`, `NETWORK=6`, `CONTENT_FILTER=10`,
`SIGINT=130`).

The mapping is implemented in
[`agent/packages/opencode/src/cli/errors/router.ts`](agent/packages/opencode/src/cli/errors/router.ts);
the per-command paths trace back to the cmd files in
[`agent/packages/opencode/src/cli/cmd/`](agent/packages/opencode/src/cli/cmd/).

---

## `agent users`

### `users add`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `--username` (or other required flag) | `Missing required argument: <flag>` (yargs) + help text | 2 |
| Username already exists | `[user] username already exists: <name>` (or similar `[op] message`) | 1 |
| Invalid role | `Invalid values: Argument: role, Given: "..."` (yargs) | 2 |
| Database write failure | `[user] <runtime error>` | 1 |

### `users list`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Database read failure | `[user] <runtime error>` | 1 |

### `users passwd`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `--username` / `--password` | `Missing required argument: <flag>` (yargs) | 2 |
| User not found | `[user] user not found: <name>` | 1 |
| Password hashing failure | `[user] <runtime error>` | 1 |

### `users delete`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `--username` | `Missing required argument: --username` (yargs) | 2 |
| User does not exist | `[user] user not found: <name>` (or empty Cause line) | 1 |
| Database delete failure | `[user] <runtime error>` | 1 |

---

## `agent tools`

### `tools list`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Tool registry initialization failure | `[tool] <runtime error>` (routed via Cause) | 1 |

### `tools show <id>`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `<id>` positional | `Not enough non-option arguments` (yargs) | 2 |
| Unknown tool id | `tool not found: <id>` | 1 |

### `tools call <id>`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `<id>` positional | `Not enough non-option arguments` (yargs) | 2 |
| TTY without `--json` / `--params-file` | `provide --json '<obj>' or --params-file <path>; pipe JSON via stdin only when non-TTY` | 2 |
| `--params-file` exceeds 1MB | `params file too large: <bytes> bytes (max 1000000)` | 2 |
| stdin payload exceeds 1MB | `stdin payload too large (max 1000000 bytes)` | 2 |
| Invalid JSON params | `invalid JSON params: <reason>` | 2 |
| Unknown tool id | `tool not found: <id>` | 1 |
| Tool execution returned `metadata.error=true` | `tool error: <message>` | 1 |
| Tool aborted by SIGINT | (no message; Node exits) | 130 |

### `tools export-schema [id]`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Filtered id not found | `tool not found: <id>` | 1 |
| Tool registry initialization failure | `[tool] <runtime error>` | 1 |

---

## `agent skills`

### `skills add`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `--name` / `--description` | `Missing required argument: <flag>` (yargs) | 2 |
| Multiple content sources passed | `only one of --content-file / --content-url / --langfuse-prompt-key allowed` | 2 |
| No content source provided | `must provide one of --content-file / --content-url / --langfuse-prompt-key` | 2 |
| `--content-file` not found | `[skill] failed to read file: <path>` | 1 |
| `--content-url` HTTP fetch failed | `[skill] failed to fetch url: <reason>` | 1 |
| Langfuse prompt key not found | `[skill] langfuse prompt not found: <key>` | 1 |
| Skill name already exists | `[skill] skill already exists: <name>` | 1 |
| Network error to Langfuse | `[skill] <ECONNREFUSED / ENOTFOUND ...>` | 6 |

### `skills update`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `--name` | `Missing required argument: --name` (yargs) | 2 |
| Multiple content sources passed | `only one of --content-file / --content-url / --langfuse-prompt-key allowed` | 2 |
| Skill not found | `[skill] skill not found: <name>` | 1 |
| Langfuse update failure | `[skill] <runtime error>` | 1 |

### `skills delete`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `--name` | `Missing required argument: --name` (yargs) | 2 |
| Skill not found | `[skill] skill not found: <name>` | 1 |

### `skills list`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Invalid `--scope` value | `Invalid values: Argument: scope, Given: "..."` (yargs) | 2 |
| Database read failure | `[skill] <runtime error>` | 1 |

### `skills enable` / `skills disable`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `--name` | `Missing required argument: --name` (yargs) | 2 |
| Skill not found | `[skill] skill not found: <name>` | 1 |

### `skills show <name>`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `<name>` positional | `Not enough non-option arguments` (yargs) | 2 |
| Skill not found | `skill not found: <name>` | 1 |

### `skills export-schema`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Skill index read failure | `[skill] <runtime error>` | 1 |

---

## `agent oss`

All `oss` errors are surfaced via the `OSSService` Effect. Underlying SDK
errors are routed by name (`*Auth*` → AUTH, network errno → NETWORK).

### `oss put <local> <key>`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `<local>` or `<key>` positional | `Not enough non-option arguments` (yargs) | 2 |
| Local file does not exist | `ENOENT: no such file or directory, open '<path>'` | 1 |
| OSS credentials missing/invalid | `[oss] auth: <reason>` | 3 |
| OSS endpoint unreachable | `getaddrinfo ENOTFOUND ...` / `ECONNREFUSED ...` | 6 |
| OSS upload failure (5xx) | `[oss] put failed: HTTP <status>` | 1 |

### `oss get <key> <local>`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing `<key>` or `<local>` positional | `Not enough non-option arguments` (yargs) | 2 |
| Object not found | `[oss] not found: <key>` | 1 |
| Cannot write `<local>` (permission denied) | `EACCES: permission denied, open '<path>'` | 1 |
| OSS credentials missing/invalid | `[oss] auth: <reason>` | 3 |
| OSS endpoint unreachable | `getaddrinfo ENOTFOUND ...` | 6 |

### `oss list [prefix]`

| Scenario | Error Message | Exit Code |
|---|---|---|
| OSS credentials missing/invalid | `[oss] auth: <reason>` | 3 |
| OSS endpoint unreachable | `ECONNREFUSED ...` | 6 |
| OSS list failure | `[oss] list failed: HTTP <status>` | 1 |

---

## `agent config`

### `config export-schema`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Invalid `--format` value | `Invalid values: Argument: format, Given: "..."` (yargs) | 2 |

### `config show`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Filesystem read failure on local `.env` | (warning to stderr; falls back to empty record) | 0 |

### `config validate`

| Scenario | Error Message | Exit Code |
|---|---|---|
| `.env.example` not found by walking up | `could not find .env.example by walking up from <cwd>` | 3 |
| `.env.example` unreadable | `failed to read <path>: <reason>` | 3 |
| Required env var missing | JSON `{ ok: false, missing: [...] }` printed to stdout | 3 |
| All required env present | JSON `{ ok: true, missing: [] }` printed to stdout | 0 |

---

## `agent run [message..]`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Empty `message` AND no `--command` | `You must provide a message or a command` | 2 |
| `--fork` without `--continue` / `--session` | `--fork requires --continue or --session` | 2 |
| `--dir` chdir failure | `Failed to change directory to <path>` | 2 |
| `--file` path not found | `File not found: <path>` | 1 |
| Session creation failure | `Session not found` | 1 |
| Loop fatal (unhandled exception) | `<error stack>` | 1 |
| `ANTHROPIC_API_KEY` missing | `[provider] auth validation failed` (via `ProviderAuthValidationFailed`) | 3 |
| Model not found | `Model not found: <provider>/<model>` + suggestions | 1 |
| Network failure to provider | `ECONNREFUSED ...` / `ENOTFOUND ...` | 6 |
| Provider rate limit | `RateLimitError: <reason>` | 4 |
| Request timeout | `RequestTimeout: <reason>` | 5 |
| Content blocked by safety filter | `ContentFilter triggered: <reason>` | 10 |
| Ctrl-C during run | (no message; Node exits) | 130 |

---

## `agent serve`

| Scenario | Error Message | Exit Code |
|---|---|---|
| `OPENCODE_SERVER_PASSWORD` not set | `Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.` (warning, not fatal) | 0 |
| Port already in use | `EADDRINUSE: address already in use` | 1 |
| Permission denied binding port | `EACCES: permission denied <port>` | 1 |
| Healthy startup | `opencode server listening on http://<host>:<port>` (long-running) | (running) |
| Ctrl-C while running | (no message; Node exits) | 130 |

---

## `agent models [provider]`

| Scenario | Error Message | Exit Code |
|---|---|---|
| Provider id not found | `Provider not found: <name>` | 1 |
| `--refresh` with network error | `<network error>` | 6 |
| Model registry read failure | `[provider] <runtime error>` | 1 |

---

## Global Errors (any command)

### Yargs argument-validation errors

These are produced by yargs before any handler runs.

| Scenario | Error Message | Exit Code |
|---|---|---|
| Missing required argument | `Missing required argument: <flag>` + help text | 2 |
| Unknown flag | `Unknown argument: <flag>` + help text | 2 |
| Unknown subcommand | `Unknown argument: <subcommand>` + help text | 2 |
| Invalid enum value (`--role`, `--scope`, ...) | `Invalid values: Argument: <name>, Given: "..."` | 2 |

### Process signals

| Scenario | Error Message | Exit Code |
|---|---|---|
| SIGINT (Ctrl-C) | (no agent-emitted message; Node default) | 130 |
| SIGTERM | (no agent-emitted message) | 143 |

### Runtime errors caught at the top-level

If a handler throws an unrecognized error it lands in the top-level catch in
`src/index.ts`. The router classifies it according to the rules above.

| Scenario | Error Message | Exit Code |
|---|---|---|
| `NamedError`-style with known prefix | `<formatted>` | per router |
| Plain `Error` with network errno | `<message>` | 6 |
| Anything else | `Unexpected error, check log file at <path>` | 1 |

---

## Exit Code Reference

| Code | Constant | Meaning |
|---|---|---|
| 0 | `SUCCESS` | Normal completion |
| 1 | `GENERAL` | Unspecified failure / runtime error |
| 2 | `USAGE` | Invalid or missing arguments |
| 3 | `AUTH` | Authentication failure |
| 4 | `QUOTA` | Rate limit / quota exceeded |
| 5 | `TIMEOUT` | Operation timed out |
| 6 | `NETWORK` | Network error (ECONNREFUSED, ENOTFOUND, ...) |
| 10 | `CONTENT_FILTER` | Content blocked by safety filter |
| 130 | (SIGINT) | Interrupted by SIGINT (auto from Node/Bun) |

The constants are defined in
[`agent/packages/opencode/src/cli/errors/codes.ts`](agent/packages/opencode/src/cli/errors/codes.ts).

---

## Asset Service (Phase 8 REST API)

The Asset Service surface (`/api/v1/assets/*`) speaks a different error
envelope from the CLI: every non-2xx response is
`{ "error": { "code": <enum>, "message": <human> } }` with the HTTP
status pulled from
[`ASSET_SERVICE_ERROR_HTTP`](agent/packages/opencode/src/business/asset-service/errors.ts).
This is **not** the CLI exit-code matrix above — Asset Service callers
are external HTTP clients (novels-to-moonscript, moonshort-backend), not
shell processes.

The enum is the AssetServiceErrorCode union defined in
[`agent/.../asset-service/errors.ts`](agent/packages/opencode/src/business/asset-service/errors.ts);
the HTTP mapping (also in that file) is the only authoritative source —
this table mirrors it for documentation. Drift between the table and
`ASSET_SERVICE_ERROR_HTTP` is a bug; update both.

| Code | HTTP | When |
|---|---|---|
| `NOT_FOUND` | 404 | Job, asset, or project missing |
| `PROJECT_NOT_FOUND` | 404 | (reserved) project_id ref doesn't resolve |
| `ASSET_NOT_FOUND` | 404 | (reserved) asset_id ref doesn't resolve |
| `INVALID_INPUT` | 400 | zod body / query validation failed |
| `UNAUTHENTICATED` | 401 | Missing / wrong `Authorization: Bearer <token>` |
| `FORBIDDEN` | 403 | Token's project allowlist excludes requested project_id |
| `BUDGET_EXCEEDED` | 422 | Mini agent loop hit `ASSETS_SERVICE_MAX_STEPS_PER_JOB` |
| `GENERATION_REJECTED` | 422 | Atomic tool's content filter / safety reject |
| `ATOMIC_TOOL_FAILED` | 502 | Upstream atomic tool 5xx / unrecoverable error |
| `INTERNAL` | 500 | Unhandled server error (also the fallback for unknown thrown values) |

Routes never throw raw exceptions to the wire — anything inside the
`handle(c, async () => …)` wrapper either resolves to a typed view or
becomes one of the codes above via
[`http/envelope.ts`](agent/packages/opencode/src/business/asset-service/http/envelope.ts).

Worth knowing while debugging:

- `UNAUTHENTICATED` always returns the same body regardless of whether
  the header is missing, malformed, or pointing at a token the server
  has never seen. Don't infer "token name exists" from a 401.
- `FORBIDDEN` includes the requested project_id in the message; the
  caller can log it for support. The token's `name` (`ntms` / `msb` /
  `dev`) is not in the response — log lookup happens server-side via
  `c.var.assetToken.name`.
- `BUDGET_EXCEEDED` carries the step count in the message when the
  generator surfaced one (`steps` from `GenerationOutcome`); use this
  to decide whether the caller should retry with simpler `spec_md`.
- `ATOMIC_TOOL_FAILED` is a 502 (bad gateway), not a 500. Callers should
  treat it as a "try again later" signal — the bug is in the upstream
  tool, not in `asset-service`.

The OpenAPI contract is [`docs/api/openapi.yaml`](docs/api/openapi.yaml);
the `ErrorEnvelope` schema there enumerates the same codes.
