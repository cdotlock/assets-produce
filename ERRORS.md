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

### `tools call <id>` — audio tools (Phase 11)

Audio-tool execution errors surface through the generic
`tools call <id>` path: a folded `metadata.error=true` result becomes
`tool error: <message>` (exit 1), where `<message>` is exactly the
tool's `output` string. Schema-constraint rejections of **well-formed**
JSON (e.g. empty `prompt` failing `isMinLength(1)`, or an out-of-range
`duration_seconds`) surface as `tool error: The <id> tool was called
with invalid arguments: SchemaError(...)` (exit **1**) — the tool never
runs, but the CLI still folds it into the exit-1 path. Only input that
is **not parseable JSON** yields `invalid JSON params: <reason>`
(exit 2) — see the table above. The messages below are byte-accurate to
the tool code in
[`agent/.../tool/asset/generate-sfx-elevenlabs.ts`](agent/packages/opencode/src/tool/asset/generate-sfx-elevenlabs.ts)
and
[`agent/.../tool/asset/generate-music-suno.ts`](agent/packages/opencode/src/tool/asset/generate-music-suno.ts).

`generate-sfx-elevenlabs` (real ElevenLabs → inline OSS upload):

| Scenario | Error Message | Exit Code |
|---|---|---|
| `ELEVENLABS_API_KEY` not configured | `tool error: generate-sfx-elevenlabs error: ELEVENLABS_API_KEY is not configured (set it to enable this tool)` | 1 |
| Upstream auth failure (HTTP 401) | `tool error: generate-sfx-elevenlabs error: [elevenlabs/401] <detail (first 500 chars)>` | 1 |
| Content moderation reject (HTTP 422) | `tool error: generate-sfx-elevenlabs error: [elevenlabs/422] <detail (first 500 chars)>` | 1 |
| Upstream 5xx / other non-200 | `tool error: generate-sfx-elevenlabs error: [elevenlabs/<status>] <detail (first 500 chars)>` | 1 |
| Network / request failed | `tool error: generate-sfx-elevenlabs error: generate-sfx-elevenlabs: ElevenLabs request failed — <reason>` | 1 |
| Silent synthesis (200, body < 256 bytes) | `tool error: generate-sfx-elevenlabs error: ElevenLabs returned <n> bytes (< 256); treating as a silent/failed synthesis` | 1 |
| OSS upload failure | `tool error: generate-sfx-elevenlabs error: generate-sfx-elevenlabs: OSS upload failed — <detail>` | 1 |
| Empty / >1000-char `prompt`, or `duration_seconds` > 30 — well-formed JSON failing a Schema constraint | `tool error: The generate-sfx-elevenlabs tool was called with invalid arguments: SchemaError(Expected a value with a length of at least 1, got "" at ["prompt"]). Please rewrite the input so it satisfies the expected schema.` | 1 |
| Malformed `--json` payload (not parseable JSON) | `invalid JSON params: <reason>` | 2 |

`generate-music-suno` (deterministic placeholder, spec §15 row 1.13):

| Scenario | Error Message | Exit Code |
|---|---|---|
| Any accepted input | (no error) — returns the placeholder string with `metadata.placeholder:true` (NOT `metadata.error`); not a failure, exits 0 | 0 |
| Empty / >1000-char `prompt`, or `duration_seconds` > 300 — well-formed JSON failing a Schema constraint | `tool error: The generate-music-suno tool was called with invalid arguments: SchemaError(Expected a value with a length of at least 1, got "" at ["prompt"]). Please rewrite the input so it satisfies the expected schema.` | 1 |
| Malformed `--json` payload (not parseable JSON) | `invalid JSON params: <reason>` | 2 |

`generate-music-suno` has **no execution-error rows**: it performs no
HTTP and no OSS call, so it never produces `metadata.error=true`. The
only non-success paths are the two input-rejection rows above — a
well-formed JSON value failing a Schema constraint (exit 1) and a
non-parseable `--json` payload (exit 2). The deterministic placeholder
result is a normal success (exit 0) — callers
detect "music deferred" via `metadata.placeholder:true`, not via an
error.

### `tools call <id>` — oss-put (Phase 12)

`oss-put` execution errors surface through the same generic
`tools call <id>` path: every failure is folded into one uniform shape
— `title: "oss-put failed"`, `output: "oss-put error: <message>"`,
`metadata.error:true` — which the CLI renders as `tool error: <message>`
(exit 1), where `<message>` is exactly the tool's `output` string.
Schema-constraint rejections of **well-formed** JSON (e.g. empty
`local_path` failing `isMinLength(1)`) surface as
`tool error: The oss-put tool was called with invalid arguments:
SchemaError(...)` (exit **1**) — the tool never runs, but the CLI still
folds it into the exit-1 path. Only input that is **not parseable JSON**
yields `invalid JSON params: <reason>` (exit 2) — see the table above.
The messages below are byte-accurate to the tool code in
[`agent/.../tool/asset/oss-put.ts`](agent/packages/opencode/src/tool/asset/oss-put.ts).

`oss-put` (local file → permanent OSS https URL):

| Scenario | Error Message | Exit Code |
|---|---|---|
| `local_path` is not an absolute path | `tool error: oss-put error: oss-put: local_path must be an absolute path, got "<local_path>"` | 1 |
| `local_path` does not exist | `tool error: oss-put error: oss-put: local_path does not exist: <resolved>` | 1 |
| `local_path` is not a regular file (dir, fifo, …) | `tool error: oss-put error: oss-put: local_path is not a regular file: <resolved>` | 1 |
| `local_path` is empty (0 bytes) | `tool error: oss-put error: oss-put: local_path is empty (0 bytes): <resolved>` | 1 |
| `local_path` exceeds the upload limit (`MAX_UPLOAD_BYTES` = 536870912 = 512 MiB) | `tool error: oss-put error: oss-put: local_path is <size> bytes, exceeds the 536870912-byte upload limit: <resolved>` | 1 |
| Failed to read the file into memory | `tool error: oss-put error: oss-put: failed to read local_path — <detail>` | 1 |
| OSS upload failed (auth / network / 5xx) | `tool error: oss-put error: oss-put: OSS upload failed — <detail>` | 1 |
| `local_path` present but empty / fails a Schema constraint (well-formed JSON) | `tool error: The oss-put tool was called with invalid arguments: SchemaError(Expected a value with a length of at least 1, got "" at ["local_path"]). Please rewrite the input so it satisfies the expected schema.` | 1 |
| Malformed `--json` payload (not parseable JSON) | `invalid JSON params: <reason>` | 2 |

`dryRun: true` is **not an error**: it returns `title: "dry-run oss-put"`
with the resolved upload plan and `metadata.dryRun:true` (no `error`
flag, no OSS call), exits 0. It is testing-only and never set in
production.

### `tools call <id>` — image tools (Phase 13)

Image-tool execution errors surface through the same generic
`tools call <id>` path: every Python-side failure is folded into one
uniform shape — `output: "<id> error: <stderr>"`, `metadata.error:true` —
which the CLI renders as `tool error: <message>` (exit 1), where
`<message>` is exactly the tool's `output` string. Schema-constraint
rejections of **well-formed** JSON (e.g. empty `inputPath` failing
`isMinLength(1)`) surface as `tool error: The <id> tool was called with
invalid arguments: SchemaError(...)` (exit **1**) — the tool never runs,
but the CLI still folds it into the exit-1 path. Only input that is
**not parseable JSON** yields `invalid JSON params: <reason>` (exit 2) —
see the table above. The messages below are byte-accurate to the tool
code in
[`agent/.../tool/asset/matting.ts`](agent/packages/opencode/src/tool/asset/matting.ts),
[`agent/.../tool/asset/cutout.ts`](agent/packages/opencode/src/tool/asset/cutout.ts),
[`agent/.../tool/asset/hole-fill.ts`](agent/packages/opencode/src/tool/asset/hole-fill.ts),
[`agent/.../tool/asset/green-spill-clear.ts`](agent/packages/opencode/src/tool/asset/green-spill-clear.ts),
[`agent/.../tool/asset/rgb-unspill.ts`](agent/packages/opencode/src/tool/asset/rgb-unspill.ts), and
[`agent/.../tool/asset/hybrid-to-webp.ts`](agent/packages/opencode/src/tool/asset/hybrid-to-webp.ts).

All six tools share the same error-output pattern: Python exit≠0 →
`output: "<id> error: <stderr>"` (stderr trimmed; falls back to
`"exited <code>"` if empty); JSON parse failure →
`output: "<id>: could not parse Python stdout as JSON"`; schema mismatch
→ `output: "<id> error: <id>: Python stdout did not match expected schema:
<reason>"`; terminal `Effect.catch` → `output: "<id> error: <message>"`.

`matting` has one additional pre-flight guard not present in the other
five tools: if `format` is passed but is neither `"webp"` nor `"png"`,
the tool returns early (before calling Python) with
`output: "matting: format must be \"webp\" or \"png\" (got <fmt>)"`,
`metadata.error:true`. This never reaches the Python subprocess.

`matting` (MODNet ML background removal → transparent RGBA cutout):

| Scenario | Error Message | Exit Code |
|---|---|---|
| `format` not `"webp"` or `"png"` (pre-flight guard, no Python call) | `tool error: matting: format must be "webp" or "png" (got <fmt>)` | 1 |
| Python subprocess failed to start | `tool error: matting error: matting: python subprocess failed to start — <reason>` | 1 |
| Python exited non-zero | `tool error: matting error: <stderr>` (or `matting error: exited <code>` if stderr empty) | 1 |
| Python stdout not parseable as JSON | `tool error: matting: could not parse Python stdout as JSON` | 1 |
| Python stdout fails schema validation | `tool error: matting error: matting: Python stdout did not match expected schema: <reason>` | 1 |
| Terminal catch (unexpected) | `tool error: matting error: <message>` | 1 |
| `inputPath` / `outputPath` empty — well-formed JSON failing Schema constraint | `tool error: The matting tool was called with invalid arguments: SchemaError(...)` | 1 |
| Malformed `--json` payload | `invalid JSON params: <reason>` | 2 |

`cutout` (HSV chroma-key green-screen removal → RGBA cutout PNG):

| Scenario | Error Message | Exit Code |
|---|---|---|
| Python subprocess failed to start | `tool error: cutout error: cutout: python subprocess failed to start -- <reason>` | 1 |
| Python exited non-zero | `tool error: cutout error: <stderr>` (or `cutout error: exited <code>` if stderr empty) | 1 |
| Python stdout not parseable as JSON | `tool error: cutout: could not parse Python stdout as JSON` | 1 |
| Python stdout fails schema validation | `tool error: cutout error: cutout: Python stdout did not match expected schema: <reason>` | 1 |
| Terminal catch (unexpected) | `tool error: cutout error: <message>` | 1 |
| `inputPath` / `outputPath` empty — well-formed JSON failing Schema constraint | `tool error: The cutout tool was called with invalid arguments: SchemaError(...)` | 1 |
| Malformed `--json` payload | `invalid JSON params: <reason>` | 2 |

`hole-fill` (cv2 TELEA inpainting of interior alpha=0 holes):

| Scenario | Error Message | Exit Code |
|---|---|---|
| Python subprocess failed to start | `tool error: hole-fill error: hole-fill: python subprocess failed to start -- <reason>` | 1 |
| Python exited non-zero | `tool error: hole-fill error: <stderr>` (or `hole-fill error: exited <code>` if stderr empty) | 1 |
| Python stdout not parseable as JSON | `tool error: hole-fill: could not parse Python stdout as JSON` | 1 |
| Python stdout fails schema validation | `tool error: hole-fill error: hole-fill: Python stdout did not match expected schema: <reason>` | 1 |
| Terminal catch (unexpected) | `tool error: hole-fill error: <message>` | 1 |
| `inputPath` / `outputPath` empty — well-formed JSON failing Schema constraint | `tool error: The hole-fill tool was called with invalid arguments: SchemaError(...)` | 1 |
| Malformed `--json` payload | `invalid JSON params: <reason>` | 2 |

`green-spill-clear` (numpy/PIL green-spill suppression):

| Scenario | Error Message | Exit Code |
|---|---|---|
| Python subprocess failed to start | `tool error: green-spill-clear error: green-spill-clear: python subprocess failed to start -- <reason>` | 1 |
| Python exited non-zero | `tool error: green-spill-clear error: <stderr>` (or `green-spill-clear error: exited <code>` if stderr empty) | 1 |
| Python stdout not parseable as JSON | `tool error: green-spill-clear: could not parse Python stdout as JSON` | 1 |
| Python stdout fails schema validation | `tool error: green-spill-clear error: green-spill-clear: Python stdout did not match expected schema: <reason>` | 1 |
| Terminal catch (unexpected) | `tool error: green-spill-clear error: <message>` | 1 |
| `inputPath` / `outputPath` empty — well-formed JSON failing Schema constraint | `tool error: The green-spill-clear tool was called with invalid arguments: SchemaError(...)` | 1 |
| Malformed `--json` payload | `invalid JSON params: <reason>` | 2 |

`rgb-unspill` (numpy/PIL G-channel clamp decontamination):

| Scenario | Error Message | Exit Code |
|---|---|---|
| Python subprocess failed to start | `tool error: rgb-unspill error: rgb-unspill: python subprocess failed to start -- <reason>` | 1 |
| Python exited non-zero | `tool error: rgb-unspill error: <stderr>` (or `rgb-unspill error: exited <code>` if stderr empty) | 1 |
| Python stdout not parseable as JSON | `tool error: rgb-unspill: could not parse Python stdout as JSON` | 1 |
| Python stdout fails schema validation | `tool error: rgb-unspill error: rgb-unspill: Python stdout did not match expected schema: <reason>` | 1 |
| Terminal catch (unexpected) | `tool error: rgb-unspill error: <message>` | 1 |
| `inputPath` / `outputPath` empty — well-formed JSON failing Schema constraint | `tool error: The rgb-unspill tool was called with invalid arguments: SchemaError(...)` | 1 |
| Malformed `--json` payload | `invalid JSON params: <reason>` | 2 |

`hybrid-to-webp` (Pillow PNG→WebP re-encode):

| Scenario | Error Message | Exit Code |
|---|---|---|
| Python subprocess failed to start | `tool error: hybrid-to-webp error: hybrid-to-webp: python subprocess failed to start — <reason>` | 1 |
| Python exited non-zero | `tool error: hybrid-to-webp error: <stderr>` (or `hybrid-to-webp error: exited <code>` if stderr empty) | 1 |
| Python stdout not parseable as JSON | `tool error: hybrid-to-webp: could not parse Python stdout as JSON` | 1 |
| Python stdout fails schema validation | `tool error: hybrid-to-webp error: hybrid-to-webp: Python stdout did not match expected schema: <reason>` | 1 |
| Terminal catch (unexpected) | `tool error: hybrid-to-webp error: <message>` | 1 |
| `inputPath` / `outputPath` empty — well-formed JSON failing Schema constraint | `tool error: The hybrid-to-webp tool was called with invalid arguments: SchemaError(...)` | 1 |
| Malformed `--json` payload | `invalid JSON params: <reason>` | 2 |

Note: `cutout`, `hole-fill`, `green-spill-clear`, and `rgb-unspill` use `--`
(double dash, no space after) in the subprocess-failed-to-start message,
while `matting` and `hybrid-to-webp` use `—` (em dash). This is
byte-accurate to the `.ts` source.

`dryRun: true` is **not an error** for any of the six tools: it returns
`title: "dry-run <id>"` with the resolved Python invocation as JSON and
`metadata.dryRun:true` (no `error` flag, no Python subprocess call), exits 0.

#### `detect-matting` — offline CLI only (Phase 13)

`detect-matting` is **not a registered atomic tool**. It is an offline CLI
invoked directly as:

```bash
python tools/detect-matting/detect-matting.py --input <json-file>
# or piped (the explicit '--input -' is required to route stdin to the JSON path):
echo '{"input":"...", "output":"..."}' | python tools/detect-matting/detect-matting.py --input -
```

It emits a PASS/FAIL quality-judgement JSON report to the output path (stdout
on success); errors go to stderr as `{"error":{"code":"...","message":"..."}}`.

Exit-code contract (from `tools/detect-matting/detect-matting.py`):

| Exit Code | Meaning |
|---|---|
| 0 | Success — report written (a FAIL verdict is NOT an error; exit 0 with `verdict: "FAIL"`) |
| 2 | `INVALID_INPUT` — bad/missing input fields, non-numeric thresholds, unwritable output dir |
| 4 | `ATOMIC_TOOL_FAILED` — numpy/PIL/scipy processing error |
| 1 | `INTERNAL` — unexpected exception |

Because `detect-matting` is not an atomic tool, it does not go through the
`tools call` CLI envelope and does not produce `tool error: ...` output.
Shell callers inspect the exit code and stderr JSON directly.

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
