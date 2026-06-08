# Phase 11 — 音频生产 · Step 1 Survey

> Research-only deliverable. Gates the two implementation tasks (`generate-sfx-elevenlabs`, `generate-music-suno`).
> No implementation code written. n2m repo READ-ONLY (not modified). No `placeholderGenerator` touched.

Date: 2026-05-15
Author: Claude Code (Phase 11 Step 1 subagent)

---

## Baseline record

| Check | Command | Result |
|---|---|---|
| git status | `git status` | **CLEAN** — `nothing to commit, working tree clean`, branch `main` up to date with `origin/main`, HEAD `3c77f45` |
| typecheck | `PATH=$HOME/.bun/bin:$PATH bun --cwd=agent run typecheck` | **PASS** — 4 successful / 4 total (3 cached), 8.55s |
| test | `PATH=$HOME/.bun/bin:$PATH bun --cwd=agent/packages/opencode run test` | **PASS** — 2260 pass, 8 skip, 1 todo, **0 fail**, 174 files, 208.83s |

> Note: the **root** `agent` `test` script is intentionally guarded (`echo 'do not run tests from root' && exit 1`).
> The real Bun test suite is `bun --cwd=agent/packages/opencode run test` (`bun test --timeout 30000`).
> Phase 11 implementation tasks must invoke tests via the `agent/packages/opencode` cwd, not `agent`.

---

## Block (A) — OSS service interface (`agent/packages/opencode/src/oss/oss.ts`)

The Phase 2 OSS service is an Effect service. The audio tools will **inline-reuse** it (acquire the service in their Effect, call `put`, take `PutResult.url`).

### Service tag & shapes (exact, from source)

```ts
// line 19
export interface PutResult {
  key: string
  url: string          // <-- the OSS https URL to return from the tool
  etag?: string
}

// line 31
export interface Interface {
  readonly put: (key: string, body: Buffer | string) => Effect.Effect<PutResult, OSSError>
  readonly get: (key: string) => Effect.Effect<Buffer, OSSError>
  readonly list: (opts?: { prefix?: string; marker?: string; maxKeys?: number }) => Effect.Effect<ListResult, OSSError>
  readonly delete: (key: string) => Effect.Effect<void, OSSError>
}

// line 38
export class Service extends Context.Service<Service, Interface>()("@assets-produce/OSS") {}

// line 146
export const defaultLayer = layer   // === `layer` (Layer.effect(Service, ...))
```

### Upload method — exact signature & semantics

- **Method:** `put(key: string, body: Buffer | string) => Effect.Effect<PutResult, OSSError>`
- **Audio bytes path:** pass the audio `Buffer` directly as `body`. (A `string` body is treated as UTF-8 text — NOT for audio.)
- **Content-type:** **NOT a parameter.** `put` calls `ali-oss` `client.put(key, buf)` with no options object (oss.ts line 107). `ali-oss` infers `Content-Type` from the **object key's file extension**. → **The audio tools MUST encode the format in the `key` suffix** (e.g. `.../sfx/<id>.mp3`, `.../music/<id>.mp3`). There is no way to pass an explicit MIME type through the current interface; if an explicit content-type is ever required, that is an `oss.ts` change and is OUT OF SCOPE for Phase 11 Step 1 (flag to user if needed).
- **Returned URL form:** `PutResult.url` is whatever `ali-oss` `res.url` returns for the configured bucket/region/endpoint — a bucket-qualified HTTPS object URL (`https://<bucket>.<region|endpoint>/<key>`). It is **permanent** (object URL, not a signed/expiring URL). This is the value the tools return as their `output`.
- **Errors:** `OSSError` (NamedError) — channel is `OSSError`, not `never`. Wrapping `ali-oss` promise rejections via `Effect.tryPromise`. The tool wrapper must **fold** this into the result text (see Block-D never-channel pattern), not let it escape.

### How a caller acquires the service in Effect

```ts
import * as OSS from "../../oss/oss"   // path from src/tool/asset/*

// inside Effect.gen:
const oss = yield* OSS.Service
const { url } = yield* oss.put(`audio/sfx/${id}.mp3`, audioBuffer)
// `url` -> permanent OSS https URL, return as tool output
```

The `OSS.Service` requirement is satisfied by providing `OSS.defaultLayer` (a.k.a. `OSS.layer`) in the tool's runtime layer composition. Env required at layer build: `OSS_REGION`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_BUCKET` (required), `OSS_ENDPOINT` (optional). Implementer must confirm where the audio tools' layer is wired (same place seedance/FC tools get their deps) — Step 1 does not prescribe wiring.

> **Open item for the implementer (not a blocker):** unlike the seedance tool (which gets a permanent OSS URL back from the FC backend and only *extracts* it), the audio tools must do the OSS upload **themselves**. Confirm the audio tools' Effect runtime actually has `OSS.Service` provided. This is a wiring detail for the implementation task, surfaced here so it is not missed.

---

## Block (B) — n2m ElevenLabs sound-effect synthesis: extraction boundary

n2m repo: `/Users/august/MobAI/novels-to-lunascript` (READ-ONLY, unmodified).

### Locator grep (verification artifact)

`grep -rn 'api_key|API_KEY|getenv|environ|ELEVENLABS' --include='*.py' skills/sfx-normalizer/` →
synthesis lives in **`skills/sfx-normalizer/elevenlabs_generator.py`**; API-key env resolved in `skills/sfx-normalizer/__main__.py:206`.

### PORT THIS — the minimal synthesis HTTP call

**File:** `/Users/august/MobAI/novels-to-lunascript/skills/sfx-normalizer/elevenlabs_generator.py`
**Function:** `ElevenLabsGenerator.generate()` (lines 107–188) — specifically the **HTTP request construction + single-shot success path** (lines 139–167). Helper `build_prompt()` (lines 41–52) is trivially portable. The `_default_http` (lines 102–105) is the raw `requests.post(url, headers=headers, json=body, timeout=60)` call to replicate in TS `fetch`.

Exact synthesis call (lines 139–167, the bytes-returning core to port):

```python
url = "https://api.elevenlabs.io/v1/sound-generation"
headers = {
    "xi-api-key": self.api_key,            # API key header form
    "Content-Type": "application/json",
}
body = {
    "text": prompt,                        # build_prompt(description, suffix)
    "model_id": gen_cfg["model"],          # caller-supplied model id (NOT hardcoded in n2m)
    "output_format": gen_cfg.get("output_format", "mp3_44100_128"),
}
if duration_s:        body["duration_seconds"] = duration_s        # optional
if prompt_influence:  body["prompt_influence"] = prompt_influence  # optional, n2m default 0.3
# POST -> on HTTP 200, resp.content is the raw mp3 BYTES (synchronous, no polling)
# n2m treats len(content) < 256 as a "silent"/failed response
```

Synthesis facts the new tool must preserve:
- **Endpoint:** `POST https://api.elevenlabs.io/v1/sound-generation`
- **Auth:** request header `xi-api-key: <ELEVENLABS_API_KEY>` (API-key header, NOT Bearer, NOT OAuth)
- **Env var name:** **`ELEVENLABS_API_KEY`** (n2m resolves `.env` then `os.getenv`, `__main__.py:206`)
- **Response:** **synchronous raw mp3 bytes** in the HTTP 200 body (NO async job, NO polling, NO temporary URL). 422 = content moderation; 5xx = retryable. ElevenLabs returns audio inline → feed those bytes straight into `OSS.put`.
- **Request fields:** `text` (required, the prompt), `model_id` (required), `output_format` (default `mp3_44100_128`), `duration_seconds` (optional), `prompt_influence` (optional, n2m default 0.3).
- **Prompt shaping (`build_prompt`, lines 17–52):** appends `DEFAULT_PROMPT_SUFFIX` ("High-quality foley sound effect. No human voice, no music, no speech. Clean, isolated sound.") unless an override suffix is given. **Optional to port** — sensible default for an SFX tool; the implementer may keep, parametrize, or drop it. It is prompt-engineering, not pipeline coupling.

### DO NOT PORT — n2m clustering / normalization / MoonScript-pipeline coupling

The following are MoonScript-pipeline-specific and **MUST NOT** come into the atomic tool (they are the "name-based clustering + replacing manual mp3 URLs" the task explicitly flagged OUT OF SCOPE):

| n2m artifact | Why it does NOT port |
|---|---|
| `skills/sfx-normalizer/llm_clusterer.py` | LLM semantic clustering of `@sfx` names into buckets — Phase-1 normalization, pipeline-specific. |
| `skills/sfx-normalizer/normalize_orchestrator.py`, `generate_orchestrator.py` | Batch orchestration over `sfx_buckets.json`, cost-cap loop, "skip if already generated" — pipeline state mgmt. **Note: `generate_orchestrator.py` is named `*_orchestrator` — exactly the kind of orchestration the assets-produce red-line forbids. Do not port it.** |
| `context_collector.py`, `report_writer.py` | Scans `lunascripts/<slug>/05-episode-writer/scripts/*.md`, writes `normalize_report.md` / `generate_report.md` — MoonScript repo layout coupling. |
| `__main__.py` slug/CLI/`sfx_buckets.json`/`config.yaml` (`sfx.generator.*`) plumbing | Reads project YAML config, slug-scoped paths, rewrites `sfx_buckets.json` with `generated.file` — LS compile-time URL substitution. |
| Bucket abstraction (`bucket["description"]`, `bucket["duration_s"]`, `prompt_override_suffix`) | The atomic tool takes a **direct prompt + params**, not a bucket dict. |
| `GenResult` / `Status` enum, `estimate_cost()`, cost-cap accumulation | Cost accounting + pipeline reporting — not part of the atomic synthesis call. |
| Retry loop (lines 154–188), `FAILED_SILENT`/moderation classification | Optional to port. A single attempt + fold-error-into-result satisfies the atomic-tool contract. The implementer MAY add a thin retry, but n2m's 5-status taxonomy and silent-detection are reporting concerns; keep any retry minimal and out of the result schema. |
| `dry_run` writing `b"\x00"*512` placeholder bytes | This is a **placeholder generator** — explicitly forbidden by the task. Do NOT port. (A `dryRun` that returns the resolved request without calling the API — like seedance's `dryRun` — is fine; writing fake audio bytes is not.) |

**Sharp boundary statement:** Port only the *HTTP request construction → POST → 200-body-is-mp3-bytes* path (elevenlabs_generator.py lines 139–167, plus optionally `build_prompt`). Everything that touches buckets, slugs, MoonScript paths, clustering, cost, reports, retry-taxonomy, or placeholder bytes stays in n2m.

---

## Block (C) — Suno API shape — **ESCALATION: NEEDS_CONTEXT**

### Finding

**Suno has NO official, first-party, public API as of May 2026.** Independent confirmation from multiple sources: Suno has only rolled out beta access to *select partners*; there is no public-facing official API key you can self-provision. Every "Suno API" in public documentation is a **reverse-engineered third-party gateway** wrapping Suno's private web-app endpoints, each with its own base URL, auth, pricing, async contract, **commercial-license claims (legal complexity), and rate limits**. This matches the design's flagged ops open item exactly (API maturity / rate limits / likely needs a third-party gateway; commercial-license assumption = user on a paid plan).

### Representative third-party shape (kie.ai gateway — for the user's decision, NOT a chosen implementation)

To give the user concrete data, one representative gateway (kie.ai) documents:

- **Base URL:** `https://api.kie.ai`
- **Auth:** `Authorization: Bearer <API_KEY>` (Bearer token, gateway-issued)
- **Generate:** `POST /api/v1/generate` — body: `prompt` (req), `customMode` (req), `instrumental` (req), `model` (`V3_5`/`V4`/`V4_5`/...), optional `style`/`title`/`negativeTags`, optional `callBackUrl`
- **Response shape: ASYNC JOB-POLL.** Initial `POST` returns `{ code, msg, data: { taskId } }` — **not** audio bytes, **not** a direct URL.
- **Poll:** `GET /api/v1/generate/record-info?taskId=<id>` → states `PENDING|TEXT_SUCCESS|FIRST_SUCCESS|SUCCESS|<failure>`; on `SUCCESS` the body carries the audio URL(s).
- **Audio URL validity:** kie.ai says files expire after **14 days** (other gateways quote 72 hours) → tool MUST download bytes and re-upload to OSS for a permanent URL (consistent with Phase 11 design).

Other gateways seen (sunoapi.org, PiAPI, AIMLAPI, evolink, apipass, gcui-art/suno-api self-host) use *different* paths/auth (`x-api-key` vs `Bearer`, `/api/generate` vs `/v1/audios/generations` vs `/api/v1/jobs/createTask`, callbacks vs polling). **There is no single canonical Suno endpoint to port.**

### Why this blocks implementation (cannot guess)

`generate-music-suno` cannot be implemented without deciding **which provider/gateway** and obtaining **that provider's API key + base URL + exact contract**. The async-job-poll vs callback model, the env var name, and the request schema all differ per gateway. Guessing would produce a tool wired to the wrong service.

### Question for the user (REQUIRED before the Suno implementation task can start)

> **Suno music generation has no official first-party API (confirmed May 2026) — only reverse-engineered third-party gateways, each with different endpoints/auth/async contracts and their own commercial-license terms. To implement `generate-music-suno` I need you to decide:**
> 1. **Which Suno gateway/provider** should we target? (e.g. `kie.ai`, `sunoapi.org`, `PiAPI`, `AIMLAPI`, self-hosted `gcui-art/suno-api`, or another you already pay for.)
> 2. **Do you have an API key / account for that provider?** (and what env var name should hold it — proposing `SUNO_API_KEY` + `SUNO_API_BASE_URL`.)
> 3. **Confirm commercial-license posture** — Phase 11 design assumes you are on a paid plan with commercial rights via the chosen gateway. Is that the case for the gateway you pick?
>
> The ElevenLabs SFX side (Block B) is fully specced and can proceed independently; only the Suno tool is gated on this answer.

---

## Appendix — Seedance atomic-tool template pattern (what the implementer replicates)

Template files (read in full):
- `agent/packages/opencode/src/tool/asset/generate-video-seedance.ts` (104 lines)
- `agent/packages/opencode/src/tool/asset/generate-video-seedance.txt` (11 lines, the LLM-facing description sidecar)

Pattern the two audio tools must follow:

1. **Effect + `effect/Schema` params.** `export const Parameters = Schema.Struct({...})` with per-field `.check(...).annotate({ description })`. Reusable `HttpsUrl = Schema.String.check(Schema.isPattern(/^https:\/\/.+/i))` for URL inputs (sourceImageUrl analogue not needed for audio, but the validation idiom is the model).
2. **`Tool.define<typeof Parameters, Record<string, unknown>, never>(TOOL_ID, Effect.gen(...))`** — `tool.ts:130` signature: `define<Parameters, Result extends Metadata, R, ID>(id, init: Effect.Effect<Init<...>, never, R>)`. The **third generic / error channel is `never`**.
3. **`never` error channel = errors are FOLDED into the result, never thrown.** The execute body ends with:
   ```ts
   .pipe(
     Effect.catch((err) =>
       Effect.succeed({
         title: `${TOOL_ID} failed`,
         output: `${TOOL_ID} error: ${formatToolError(err)}`,
         metadata: { error: true, message: formatToolError(err) },
       }),
     ),
   )
   ```
   `formatToolError` (`fc-client.ts:82`) normalizes `FcCallError` / `{data}` / `Error` / unknown into a string. The audio tools must similarly catch their HTTP error + `OSSError` and fold into `{ title, output, metadata.error }`. Nothing escapes the Effect (consistent with `tool.ts` `Effect.orDie` at the wrap boundary, which expects a `never` error channel from `execute`).
4. **Success result shape:** `{ title, output, metadata }` where `output` is the **permanent OSS https URL string** and `metadata` carries `{ ossUrl, model, prompt }`-style context. (Seedance gets its OSS URL via `extractUrlFromResult(...)` from the FC response; the audio tools instead get it from `oss.put(...).url` — same *result shape*, different *URL source*.)
5. **`dryRun` (optional, copy seedance semantics):** `if (params.dryRun) return { title: 'dry-run ...', output: JSON.stringify({tool, body, dryRun:true}), metadata: { dryRun:true } }` — returns the **resolved request without calling the external API**. (This is the *acceptable* dry-run; do NOT adopt n2m's placeholder-bytes dry-run.)
6. **`.txt` sidecar:** `import DESCRIPTION from "./<tool-id>.txt"` and set `description: DESCRIPTION`. The `.txt` is the **LLM-facing tool doc**: what it does, what it returns ("Returns a permanent OSS URL of the generated audio"), required/optional params, gotchas, when to use a sibling tool instead, and the dry-run caveat ("never set in production"). Each audio tool needs its own `<tool-id>.txt` written in this voice.
7. **Constants:** `const TOOL_ID = "..."`, `const DEFAULT_MODEL = "..."` near the top; model resolved as `params.model?.trim() || DEFAULT_MODEL`. For SFX, the n2m default `output_format` is `mp3_44100_128`; n2m does NOT hardcode a model id (comes from project config) — the implementer picks a sensible `DEFAULT_MODEL` for the standalone tool (decision for the implementation task, with the n2m field names as the contract).

**Tests:** new tool tests run under `bun --cwd=agent/packages/opencode run test`. Follow existing `src/tool/asset/*` test patterns (dry-run path + error-fold path are the high-signal cases since the `never` channel means failures are observable in `output`/`metadata`, not via throws).
