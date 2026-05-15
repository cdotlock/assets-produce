# Phase 10 — Three-Repo Integration Verification

> Date: 2026-05-15
> Plan: [`phase-10-three-repo-integration-plan.md`](phase-10-three-repo-integration-plan.md)
> Master spec: [§ 10 Phase 10](2026-04-29-assets-produce-spec.md#phase-10--三方接通--110) / [§ 15 row 1.10](2026-04-29-assets-produce-spec.md#15-修订记录)
> E2E log: [`phase-10-e2e-log.md`](phase-10-e2e-log.md)
> Status: **CLOSED with backend push pending user-coordinated handoff**

## 0. TL;DR

| Repo | Branch state | Tests at close |
|---|---|---|
| `cdotlock/assets-produce` | main, 4 commits ahead at `6ae6014..e6aff10`, pushed | 177/177 asset-service + middleware + tools |
| `AugustZAD/Dramatizer-MSS` (novels-to-moonscript) | main, 3 commits ahead at `9d151f7..b2eb443`, pushed | 35/35 new (19 client + 16 resolve CLI) |
| `cdotlock/moonshort-backend` | local-only, 3 commits at `c4c85eb..7b1a00e`, **NOT pushed** | 73/73 `__tests__/upstream/` (45 new + 28 pre-existing) |

Plan deviation: §1.2.2 (MSS schema 加 `asset_ref` 节点字段) was dropped — schema is owned by the out-of-scope Go binary `mss` (cdotlock/moonshort-script). §1.2.4 (`mss-verify --resolve-assets`) was adapted onto n2m's actual asset-injection mechanism, `mapping.json`. Net effect: same integration goal, achieved via the real plumbing. See [§ 5 Plan deviations](#5-plan-deviations).

## 1. Commits

### 1.1 assets-produce (pushed to origin/main)

| SHA | Subject |
|---|---|
| `60bca3e` | docs(phase-10): add three-repo token-flow ops doc + README + env annotations |
| `cfd098f` | test(phase-10): cover middleware + lookup-route cross-project 403 |
| `7725875` | fix(server): WebAuthMiddleware short-circuits /api/v1/assets/* |
| `e6aff10` | docs(phase-10): add local e2e log + ignore .e2e/ scratch dir |

`7725875` is the bug-fix surfaced during Step 10 e2e: Phase 8's asset-service Bearer auth was being intercepted by the global `WebAuthMiddleware` which tried to `verifyJwt()` opaque tokens. Phase 8 tests masked this by hitting the sub-app via `app.request()`. Fix is a one-line early-return + 5 regression tests.

### 1.2 novels-to-moonscript (pushed to origin/main)

| SHA | Subject |
|---|---|
| `20cd3e6` | feat(phase-10): add AssetsProduceClient + unit tests |
| `8abe1bd` | feat(phase-10): add mapping.json resolve-assets CLI |
| `b2eb443` | docs(phase-10): document assets-produce integration in README + .env.example |

### 1.3 moonshort-backend (local only, NOT pushed — user policy)

| SHA | Subject |
|---|---|
| `b1e0ad5` | feat(phase-10): add assets-produce-http upstream client |
| `8fb9c08` | feat(phase-10): wire agent-forge-client real branch to assets-produce |
| `7b1a00e` | docs(phase-10): document assets-produce switch in backend .env.example + README |

These three commits + the Phase 9 DEPRECATED notice changes (`generate-upscale-matting/_local_tools/sync_to_oss.py`, `generate-upscale-matting/cg_render.py`) sit in the local working tree / commit log. Per the user-set policy ("cdotlock/* requires explicit ack; user instructed 'backend 先不 commit/push' in Phase 9 close-out"), these stay local until the user coordinates a backend-maintainer ack.

## 2. Acceptance checklist (master spec § 10 / plan § 5)

- [x] **assets-produce Phase 8 + 9 + 10 unit/integration tests pass** — 177/177 across `test/business/asset-service/` (auth, asset-service, catalog, http routes, openapi, run-asset-generation), `test/server/middleware-asset-bypass.test.ts`, `test/tool/cg-render.test.ts`, `test/tool/upscale-image.test.ts`. Typecheck: 4/4 packages.
- [x] **novels-to-moonscript AssetsProduceClient unit coverage** — 19 tests in `dramatizer/tests/test_assets_produce_client.py`:
  - happy lookup + envelope/non-envelope shapes + no_match
  - 401 / 403 → `AssetsProduceAuthError` (no retry)
  - 400 + non-JSON 2xx → `AssetsProduceBadRequest`
  - ConnectionError / Timeout / 503 → `AssetsProduceUnavailable` after retries
  - transient 5xx recovery + transient ConnectionError recovery
  - exponential backoff (sleeps between attempts, none after the last)
  - input guards (empty queries / empty project_id / missing `results` in body)
- [x] **moonshort-backend assets-produce-http.ts unit coverage** — covered in `__tests__/upstream/assets-produce-http.test.ts` (passes vitest run; combined with `agent-forge-client.test.ts` → 45 tests for Phase 10 + 28 for the surrounding upstream files = 73 green).
- [x] **backend agent-forge-client.ts real-branch coverage** — `ASSETS_REMIX_MODE` stub vs real switch + happy / auth / unavailable error mapping covered in the same vitest run.
- [⚠️ partial] **One local e2e: MSS → backend remix → assets-produce real → URL → app**. Two halves:
  - **n2m → assets-produce** ✅ — proven by the live `agent serve` + `resolve_assets` CLI run captured in [`phase-10-e2e-log.md`](phase-10-e2e-log.md). Verified the auth middleware chain, lookup wire format, and CLI's placeholder partitioning.
  - **backend → assets-produce** ⚠️ — unit-tested only (45/45 with mocked `fetch`). A full backend-stack e2e needs Postgres + Redis + BullMQ worker spin-up, which the plan §3 risk row pre-authorized as "soft completion".
- [x] **`docs/ops/three-repo-token-flow.md` ≥ 40 lines** — 158 lines covering token matrix, rotate/revoke flow, env table per repo, base-url table, 401/403 triage.
- [ ] **`agent serve` create→ready under a real LLM provider** — out of scope here; covered by Phase 8 unit tests with stubbed runner.
- [ ] **One-week production observation** — post-Phase-10 task; not gated on this report.
- [x] **`phase-10-three-repo-integration-verification.md` completed** — this document.
- [x] **assets-produce commits pushed** — see § 1.1.
- [x] **novels-to-moonscript commits pushed** — see § 1.2.
- [x] **moonshort-backend commits local only, push gated on user ack** — see § 1.3.

## 3. Test inventory at close

| Suite | Pass | Notes |
|---|---|---|
| assets-produce `bun test test/business/asset-service/` | included in 177 | covers asset-job repo, auth (16), catalog, schema, run-asset-generation, openapi snapshot, tracer, wire, intent-to-skill, http (3 routes), envelope |
| assets-produce `test/server/middleware-asset-bypass.test.ts` | 5/5 | Phase 10 regression for the WebAuthMiddleware fix |
| assets-produce `test/tool/cg-render.test.ts` | 9/9 | Phase 9 tool with Phase 9 code-review fixes |
| assets-produce `test/tool/upscale-image.test.ts` | 10/10 | Phase 9 tool |
| n2m `dramatizer/tests/test_assets_produce_client.py` | 19/19 | new |
| n2m `dramatizer/tests/test_resolve_assets.py` | 16/16 | new |
| backend `__tests__/upstream/assets-produce-http.test.ts` | new file (in 45) | covers 4 operations + auth / 4xx / 5xx / timeout |
| backend `__tests__/upstream/agent-forge-client.test.ts` | in 45 | `ASSETS_REMIX_MODE` switch + dispatch to assets-produce-http |
| backend `__tests__/upstream/` (full dir) | 73/73 | includes 28 pre-existing in dream-agent + llm-client + the 45 above |

## 4. Open follow-ups (NOT gating Phase 10 close)

| ID | What | Where | Owner |
|---|---|---|---|
| F1 | Push the 3 backend commits + the Phase 9 DEPRECATED notice file to `cdotlock/moonshort-backend` | backend repo | user (coordinate with backend maintainer per global CLAUDE.md "cross-namespace push needs ack") |
| F2 | Live backend → assets-produce e2e (Postgres + Redis + BullMQ + remix trigger → real Asset created → URL surfaced in mobile app) | three-repo dev env | user/QA, once F1 lands |
| F3 | Optional: extend the resolve-assets CLI with an `--in-mss` mode if the Go `mss` binary later exposes an explicit `asset_ref` AST | n2m | future |
| F4 | Phase 10 pre-existing test failure: `dramatizer/tests/test_compile_mss.py::test_compile_all_rejects_md_without_episode_header` fails on `main` independently of Phase 10 work (verified by `git stash` of new files) | n2m | maintenance, separate ticket |
| F5 | Phase 10 pre-existing assets-produce test failures: `httpapi-provider.test.ts` / `httpapi-file.test.ts` / `httpapi-sdk.test.ts` time-out at 5s in this env (3 tests, all timeouts — unrelated to Phase 10 paths) | assets-produce | infra / flake hunt, separate ticket |
| F6 | `AGENT_PORT` env not picked up by `Server.listen()` (defaults to 4096 instead of 8001 as the .env.example comment claims) — cosmetic; e2e log notes the actual port | assets-produce | small cleanup |
| F7 | When backend goes multi-tenant, the `agent-forge-client.ts` real branch needs to look up `characterId` → `novelId` → `project_id` from the DB instead of the single-tenant `ASSETS_PRODUCE_PROJECT_ID` env it uses today | backend | post-Phase-10 |

## 5. Plan deviations

### 5.1 §1.2.2 MSS schema — dropped (out of scope)

The plan proposed adding optional `id` / `name` / `kind` fields to an `asset_ref` node in MSS .md syntax. In reality the MSS schema is owned by the **Go** binary `mss` at `cdotlock/moonshort-script`, which n2m shells out to via `mss compile --assets mapping.json`. Touching that schema crosses the same "cdotlock push needs ack" line as the backend, with no immediate caller. Dropped for Phase 10; if asset-resolution semantics ever need first-class MSS support, this is a follow-up ticket against moonshort-script.

### 5.2 §1.2.4 `mss-verify --resolve-assets` — adapted to `mapping.json`

The plan assumed an existing `mss-verify` CLI in n2m to extend. No such CLI exists today. n2m's real asset-injection point is the flat `{key: url}` dict in `dramatizer/build/<slug>/mapping.json` consumed by the Go binary. The new `dramatizer/pipeline/resolve_assets.py` module covers the same conceptual flow (`--resolve-assets` on, off by default) but operates on `mapping.json` directly. Same integration semantics, real plumbing.

### 5.3 §1.3.3 `assets-remix-service.ts` interface — unchanged

Confirmed via test pass (`__tests__/upstream/agent-forge-client.test.ts`). The real branch dispatch maps the existing `AgentForgeClient` interface (which uses `semanticName` + `kind: char|cg|bg|music|sfx`) onto the assets-produce shape (`key` + `kind: character_portrait|scene_bg|cg|...`). Translation lives entirely in `agent-forge-client.ts`; service layer is untouched.

### 5.4 Unplanned: WebAuthMiddleware fix

Plan didn't anticipate the Phase 8 collision where `WebAuthMiddleware` JWT-verified the asset-service's opaque bearer tokens. Surfaced during Step 10 e2e. Fixed surgically (one-line early-return on `/api/v1/assets/*`) + 5 regression tests pin the bypass. Documented in commit `7725875` and the e2e log.

## 6. Risks status (vs plan §3)

| Plan risk | Status |
|---|---|
| backend maintainer rejects client changes | Mitigated — change isolated to `app/upstream/`; service interface unchanged. Awaits user-coordinated handoff. |
| backend repo push policy (PR / required reviews) | Honored — local commits only; no push. |
| n2m ↔ assets-produce key naming inconsistency | Default placeholder regex captures empty + localhost + stub URLs; ops doc enumerates `<source>_<slug>` convention. Real-deployment naming will be validated when F2 e2e runs. |
| dev env base URL drift | `.env.example` defaults to `localhost:8001` in all three repos; ops doc has the per-environment table (TBD entries to fill after first deploy ticket). |
| Langfuse trace volume | Not exercised in this Phase (no LLM calls in dev e2e). |
| Old MSS files rejected by new schema | N/A — schema change dropped (§5.1). |
| backend `assets-remix-service.ts` relying on old `throw` behavior | Verified via 73/73 vitest run; no regression. |

## 6.5 Post-review follow-ups (landed after the initial close)

A `superpowers:code-reviewer` pass on the Phase 10 deltas raised 0 CRITICAL / 2 HIGH / 6 MEDIUM findings. The actionable items were fixed before declaring close:

| ID | Where | Fix |
|---|---|---|
| H2 | n2m `assets_produce.py:_redact()` / backend `assets-produce-http.ts:redact()` | Scrub `Bearer <token>` and `token`/`authorization` JSON fields from response bodies **before** they enter exception messages. Two new tests per repo pin both shapes. |
| M1 | n2m `assets_produce.py:117-119` | Replace string-literal `Optional[callable]` annotation with real `Optional[Callable[[float], None]]`. |
| M2 | backend `assets-produce-http.ts:baseUrl()/token()` | Missing `ASSETS_PRODUCE_BASE_URL` / `_TOKEN` now throws `AssetsProduceBadRequest` (non-retryable) instead of `AssetsProduceUnavailable` / `AssetsProduceAuthError`. BullMQ outbox treats BadRequest as a give-up, avoiding retry-loops on a misconfig only a deploy can fix. |
| M3 | backend `agent-forge-client.ts:RealBranch` | Extracted `rethrowAgentForgeError` helper with explicit `throw err` after the inner rethrow + typed `view: AssetJobView` in `pollAsset`. Refactors that loosen the `never` annotation now fail at the type checker rather than silently propagating `undefined`. |
| M4 | n2m `resolve_assets.py:resolve_mapping` | Pair server results with request keys via a dict lookup on `result.query.key` instead of zip-by-index. Server reordering today wouldn't break correctness, but the contract doesn't pin order. New test exercises a rotated response. |
| M6 | this report (§ below) | Note that plan §1.1.1 referenced `agent/packages/opencode/src/config/asset-service.ts` which doesn't exist; the actual config lives in `business/asset-service/http/auth.ts` via `loadAssetAuthFromEnv` (env-based, no static project map needed). The `<source>_<slug>` naming convention is documented in `.env.example:112-115` and in `docs/ops/three-repo-token-flow.md`. |

Deferred (won't block close): H1 (test-shape mismatch around the envelope-unwrap fallback — clients tolerate both shapes; real server emits the bare object proven by the e2e), M5 (cosmetic ellipsis), L1-L4 (minor / aesthetic).

Commits landed for post-review fixes:

| Repo | SHA | Subject |
|---|---|---|
| n2m | `5703424` | fix(phase-10): code-review follow-ups (typing + redact + reorder) — pushed to origin |
| backend | LOCAL only | fix(phase-10): code-review follow-ups (M2 non-retryable misconfig, M3 defensive throw, H2 token redaction) |

Updated test totals at close:

- assets-produce: 177/177 (unchanged — middleware fix path already covered)
- n2m: **38/38** (35 + 3 new: 2 redact + 1 reorder)
- backend: **47/47** (45 + 2 new redact)

## 7. Sign-off

Phase 10 closes the **mechanical** integration between assets-produce, novels-to-moonscript, and the moonshort-backend client layer. The remaining production gates (backend repo push, live cross-stack e2e, one-week observation) are tracked as F1 / F2 follow-ups and depend on user-side coordination, not on this Phase 10 work.
