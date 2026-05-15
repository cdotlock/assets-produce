# Phase 11 — 音频生产（music / sfx）Verification

> Date: 2026-05-16
> Plan: [`phase-11-audio-production-plan.md`](phase-11-audio-production-plan.md)
> Survey: [`phase-11-survey.md`](phase-11-survey.md)
> Master spec: [§ 10 Phase 11](2026-04-29-assets-produce-spec.md#phase-11--音频生产music--sfx-112-113) / [§ 15 row 1.13](2026-04-29-assets-produce-spec.md#15-修订记录)
> Status: **CLOSED** — SFX full-real; music deterministic placeholder by deliberate governance decision (§15 r1.13). All atomic commits pushed to `origin/main`.

## 0. TL;DR

| Item | Outcome |
|---|---|
| `generate-sfx-elevenlabs` | **Full real** — n2m ElevenLabs `POST /v1/sound-generation` port → mp3 bytes → inline Phase 2 OSS upload → permanent OSS https URL. Injectable `http`/`uploader` keep the tool's Effect channel `never`. |
| `generate-music-suno` | **Deterministic placeholder** by §15 r1.13 (Suno has no official first-party API). No HTTP / no OSS / no fake URL. `metadata.placeholder:true` + fixed message, params echoed for future wiring. |
| AssetKind 收口 | `sfx` + `music` consistent across **6** sites (plan said 4; type-system forced 6 — durable note §5.3). asset-service `z.enum(ASSET_KINDS)` auto-validates; API layer zero-change. |
| Tests at close | opencode **2290 pass / 8 skip / 1 todo / 0 fail / 17 snapshots** (no drift); `agent` typecheck 4/4; `web` typecheck + build green. |
| Branch | `cdotlock/assets-produce` main, pushed, `main…origin/main` in sync at `0a73c3c`. |

Mid-phase a spawned-task cleanup landed on `origin/main` (`81bfee1`, cross-tool `type XParams` → `Schema.Schema.Type<typeof Parameters>`); it was integrated by rebase — pure type refactor, no runtime/contract/doc impact (see §5.4).

## 1. Commits (8cb2af2..0a73c3c on origin/main)

| SHA | Subject | Atomic unit |
|---|---|---|
| `17650d9` | docs(phase-11): add Step 1 survey (OSS iface / n2m sfx boundary / Suno API) | survey (pre-BASE) |
| `8cb2af2` | docs(spec): record §15 r1.13 — music→placeholder, SFX→full | governance (BASE) |
| `4c9fe95` | feat: add generate-sfx-elevenlabs atomic tool | SFX tool + .txt + test |
| `403baef` | feat: register generate-sfx-elevenlabs + wire sfx AssetKind | SFX registry + 收口 |
| `dac2535` | fix: remove NUL byte / vacuous assertion in generate-sfx-elevenlabs test | SFX test fix |
| `d01a244` | feat: add generate-music-suno placeholder atomic tool | music tool + .txt + test |
| `0bd2466` | feat: register generate-music-suno + wire music AssetKind | music registry + 收口 |
| `81bfee1` | refactor: derive asset tool Params types from Schema | cross-tool cleanup (spawned task, see §5.4) |
| `00f6ab6` | docs: add Phase 11 sfx/music skill bodies | C5 skill bodies + README |
| `0a73c3c` | docs: sync env/SKILL/ERRORS/openapi for Phase 11 audio tools | C6 config/docs |

Each commit independently typechecks and keeps the opencode suite green. SFX (`4c9fe95`/`403baef`/`dac2535`) and music (`d01a244`/`0bd2466`) each cleared spec-compliance + code-quality review before push; skill/docs (`00f6ab6`/`0a73c3c`) cleared spec-compliance (✅ no issues) + code-quality (Approved-with-minors; 0 Critical/Important) before push.

## 2. Acceptance checklist (master spec § 10 Phase 11 / plan § 5)

- [x] **`generate-sfx-elevenlabs` / `generate-music-suno` 在 `agent tools list` 出现，`agent tools show` schema 完整（结构对等）.** `agent tools list` lists both with full `.txt` descriptions. `agent tools export-schema generate-sfx-elevenlabs` → JSON schema `properties{prompt(string,1..1000),duration_seconds(number,0<x≤30),prompt_influence(0..1),model,promptSuffix,dryRun}`, `required:[prompt]`. `generate-music-suno` → `properties{prompt(1..1000),duration_seconds(0<x≤300),style,instrumental,dryRun}`, `required:[prompt]`. Same shape as the other asset tools.
- [x] **SFX 单元 / schema / 错误矩阵 ≥ 80% 行覆盖（mock ElevenLabs + mock OSS）；music 占位确定性 + 无副作用测试.** `test/tool/generate-sfx-elevenlabs.test.ts` (mock `http` + mock `uploader`): success→OSS url, dryRun, no-key, 401/5xx, silent <256B, OSS-fail, schema bounds. `test/tool/generate-music-suno.test.ts`: placeholder determinism + no-side-effect. All green in the 2290-pass suite; spec + code-quality reviewers independently confirmed coverage of the documented matrix.
- [x] **CLI/Session 跑 `sfx-spec` 出真实 OSS URL（dev key；无 key 记延后 + mock 路径）；跑 `music-spec` 返回确定性占位 `metadata.placeholder=true`.** `ELEVENLABS_API_KEY` absent locally → **real-network SFX e2e deferred** (open item §5.5); mock path verified: `tools call generate-sfx-elevenlabs --json '{...,"dryRun":true}'` → resolved request `{text:<prompt+foley suffix>,model_id:eleven_text_to_sound_v2,output_format:mp3_44100_128}` no network; no-key → exact `generate-sfx-elevenlabs error: ELEVENLABS_API_KEY is not configured (set it to enable this tool)`. `tools call generate-music-suno` → exact `music generation pending Suno gateway selection — see spec §15 row 1.13 (no official Suno API; gateway deferred)`; default == dryRun == repeat **byte-identical** (deterministic, `metadata.placeholder:true`).
- [x] **REST API `create {kind:"music"|"sfx"}` 校验通过、返回 stub（符合非目标）.** `test/business/asset-service/http/routes.test.ts:165` "200 accepts the Phase 11 sfx kind through z.enum(ASSET_KINDS)" → POST `/api/v1/assets/create {kind:"sfx"}` asserts `status 200`, `body.status==="queued"`, stub outcome. `music` traverses the identical `create.ts:21 kind: z.enum(ASSET_KINDS)` path; `schema.test.ts:63` round-trips `AssetTable.kind` for both `sfx`+`music`; `intent-to-skill.test.ts:70/73` map `sfx→sfx-spec`, `music→music-spec`. placeholderGenerator untouched (stub == video kinds).
- [x] **`AssetKind` / `ASSET_KINDS` / `DEFAULT_KIND_SKILL_MAP` / `defaultAssetTypeForKind` 收口一致 (`music`+`sfx`).** Verified across the actual 6 sites (§5.3) by the SFX & music spec-compliance reviewers; closed-set tests (`schema.test.ts`, `intent-to-skill.test.ts`) green with both kinds.
- [x] **`agent` typecheck / opencode test 全过；`web` typecheck / build 全过.** `bun --cwd=agent run typecheck` → 4 successful / 4 total. `bun --cwd=agent/packages/opencode run test` → **2290 pass / 8 skip / 1 todo / 0 fail / 17 snapshots** (no snapshot drift; known env flakes did not surface this run). `bun --cwd=web run typecheck` → clean (`tsc --noEmit`, no errors). `bun --cwd=web run build` → success (route manifest emitted, no build error).
- [x] **`knowledge/asset-generation/sfx-spec.md` ≥ 30 行；`music-spec.md` ≥ 30 行且明确标注占位态 + §15 行 1.13.** `sfx-spec.md` = **165** lines; `music-spec.md` = **158** lines. music-spec leads with a blockquoted `STATUS — DETERMINISTIC PLACEHOLDER (read this first)` before `## Intent`, citing spec §15 row 1.13, "no official Suno API", "deferred open item", framed as deliberate governance decision; reinforced in every 6-段式 section. Both follow the cg-render-spec.md 6-段式 convention.
- [x] **`phase-11-audio-production-verification.md` 完成（music 占位 + Suno 接入开放项明确记录）.** This document; open items §5.5–§5.7.
- [x] **所有 atomic commit push 到 origin/main.** `git status` → `## main...origin/main` (in sync); `git log origin/main..HEAD` empty. HEAD `0a73c3c` pushed (`81bfee1..0a73c3c main -> main`).

## 3. e2e summary (Step 8, deterministic / no dev key)

| Check | Command | Result |
|---|---|---|
| Registration | `tools list` | both tools present w/ full `.txt` |
| Structural parity | `tools export-schema <t>` | complete JSON Schema, `required:[prompt]`, all optional fields |
| SFX mock | `tools call generate-sfx-elevenlabs --json '{...,"dryRun":true}'` | resolved request JSON, **no network** |
| SFX no-key | `tools call generate-sfx-elevenlabs --json '{"prompt":...}'` | exact documented config-error, `metadata.error` |
| Music placeholder | `tools call generate-music-suno --json '{"prompt":...}'` | exact `PLACEHOLDER_MESSAGE`, `metadata.placeholder:true` |
| Music determinism | default vs dryRun vs repeat | **byte-identical** |
| REST kind 收口 | `routes.test.ts:165` + `schema.test.ts:63` + `intent-to-skill.test.ts:70/73` | 200 queued stub; both kinds validate |

CI does not require e2e (Phase 10 convention retained).

## 4. Plan deviations

None of substance. Plan Step 10 atomic-commit split was honored as 7 logical units; the SFX cycle required one extra fix commit (`dac2535`, NUL/vacuous-assertion Critical caught in code-quality review and fixed before push) — process working as designed, not a deviation.

## 5. Open items & durable notes (carry forward)

### 5.1 Music is a deliberate placeholder — not an incomplete feature
Per **§15 row 1.13** (user decision, recorded `8cb2af2`): Suno has no official first-party public API; every public "Suno API" is a reverse-engineered third-party gateway with divergent auth/endpoint/async contracts. `generate-music-suno` therefore ships as a deterministic, plainly-identifiable placeholder (`metadata.placeholder:true`, fixed message, no HTTP/OSS, no fake URL). Structural parity with SFX is complete so the future real path is a drop-in. **This is governance-approved scope, not a defect — do not "fix" it as missing work.**

### 5.2 Real Suno gateway integration — DEFERRED open item
Wiring a real Suno gateway is explicitly deferred until the user selects a gateway. When selected: open a new §15 revision, then wire the real gateway HTTP + Phase 2 OSS upload at the marked `DEFERRED OPEN ITEM` site in `generate-music-suno.ts` (replacing the placeholder return; reuse the SFX wrapper pattern). No code change should anticipate a specific gateway before that decision.

### 5.3 收口 is 6 points, NOT 4 (durable)
Plan §1.5 listed 4 收口 sites; SFX + music cycles proved **6** (the extra two are type-system forced). Append new `AssetKind` to the **END** at every site (snapshot/ordinal safety):
1. `business/asset-service/types.ts` — `AssetKind` union + `ASSET_KINDS` tuple
2. `business/asset-service/intent-to-skill.ts` — `DEFAULT_KIND_SKILL_MAP` entry + name in `ASSET_GENERATION_SKILLS`
3. `business/asset-service/run-asset-generation.ts` — `defaultAssetTypeForKind()` → `"audio"`
4. `business/asset/asset.sql.ts` (~L19) — drizzle `AssetTable.kind` `text({enum:[...]})`
5. `business/asset/asset.ts` (~L99-106) — insert cast union `| "<kind>"`
6. `tool/registry.ts` — 3-spot registration (import / `Tool.init` / `builtin[]`)
Plus closed-set test maintenance: `test/business/asset-service/intent-to-skill.test.ts` + `schema.test.ts`. `openapi.test.ts` uses a hardcoded `toContain` list (not closed-set; untouched). `docs/api/openapi.yaml` `AssetKind` enum is doc-only and was synced append-only in C6 (`0a73c3c`).

### 5.4 Mid-phase integration of `81bfee1` (cross-tool Params-type refactor)
The cross-tool cleanup flagged via `spawn_task` in the prior session ("replace hand-duplicated `type <X>Params` with `Schema.Schema.Type<typeof Parameters>`") ran independently and pushed to `origin/main` as `81bfee1` while skill/docs (C5/C6) were in review. It was integrated by **rebase** (trunk-based, linear). Confirmed a **pure type refactor**: it deletes the `type SfxParams`/`type MusicParams` aliases and switches `execute(params: …)` to `Schema.Schema.Type<typeof Parameters>` — the `Parameters` schema, `PLACEHOLDER_MESSAGE`, every error string, output/metadata shape, env vars, and `.txt` are all unchanged. The skill-body/ERRORS.md byte-accuracy verdicts (verified against the pre-refactor tool code) therefore still hold. Combined tree: typecheck 4/4, opencode 2290/0, web green.

### 5.5 SFX real-network e2e — DEFERRED (no local dev key)
`ELEVENLABS_API_KEY` is not configured in the local `.env`, so the live ElevenLabs → real-OSS round-trip was not exercised. The mock/dryRun + no-key deterministic paths are fully verified and the real path is implemented + documented (`.env.example` Phase 11 block, `sfx-spec.md`, `ERRORS.md`). When a dev key is available, run `agent run` over `sfx-spec` and confirm one reachable OSS mp3 URL. Non-blocking per plan acceptance ("无 key 则记为延后 + 跑 mock 路径").

### 5.6 Suno commercial-license posture — UNCONFIRMED (ops risk)
User chose "proceed as ops risk" (plan Risks table). Recorded as a non-technical open item; to be settled by the user before any commercial music release. Not a Phase 11 blocker (music ships as placeholder regardless).

### 5.7 REST `create` still returns stub by design
asset-service `create {kind:music|sfx}` validates and returns the Phase 8 placeholder stub (placeholderGenerator deliberately untouched, identical to video kinds). This is the §2.2 / Decision-Table non-goal, not incomplete work. Real LLM-driven loop replacement remains Phase-8 legacy debt tracked separately.
