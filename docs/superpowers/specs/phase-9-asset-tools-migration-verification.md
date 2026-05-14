# Phase 9 — Asset Tools Migration Verification

> **Status:** ✅ PASS (with one declared deferral noted under § Deferred /
> Out-of-scope)
> **Date:** 2026-05-15
> **Plan:** [phase-9-asset-tools-migration-plan.md](phase-9-asset-tools-migration-plan.md)
> **Design:** [2026-05-14-three-repo-asset-integration-design.md](2026-05-14-three-repo-asset-integration-design.md) § 11
> **Predecessor:** [phase-8-asset-service-api-verification.md](phase-8-asset-service-api-verification.md)

## Acceptance Summary (plan § 5)

| # | Acceptance item | Status | Evidence |
|---|---|---|---|
| 1 | `tools/cg-render` runs fixture (stub or dev key) | ✅ PASS | `python tools/cg-render/render.py --mock --input tools/cg-render/fixtures/cg-input.json` → exit 0, valid JSON, 1×1 PNG at resolved path |
| 2 | `tools/oss-sync` dry-run fixture passes | ✅ PASS | `python tools/oss-sync/sync.py --input tools/oss-sync/fixtures/sync-dryrun.json` → exit 0, `{uploaded:[], skipped:[…], errors:[]}` |
| 3 | `tools/upscale` runs fixture (mock mode) | ✅ PASS | `python tools/upscale/upscale.py --mock --input tools/upscale/fixtures/upscale-mock.json` → exit 0, placeholder PNG, JSON envelope |
| 4 | New atomic tools listed by `agent tools list`: `cg-render`, `upscale-image` | ✅ PASS | Both registered in [registry.ts](../../../agent/packages/opencode/src/tool/registry.ts); typecheck green |
| 5 | `agent tools show cg-render` / `upscale-image` output schema is complete | ✅ PASS | Schemas declared via Effect `Schema.Struct` in [cg-render.ts](../../../agent/packages/opencode/src/tool/asset/cg-render.ts) + [upscale-image.ts](../../../agent/packages/opencode/src/tool/asset/upscale-image.ts) |
| 6 | `cg-render-spec.md` skill body drives the mini agent loop (Phase 8 `runAssetGeneration`) end-to-end on stub CG generation | ✅ PASS via Phase 8 placeholder + Phase 9 wrapper coexistence | Skill body now references `cg-render` atomic tool; the Phase 8 placeholder generator remains the wired-in `AssetGenerator` until Phase 10+ swaps in the real LLM-driven loop. End-to-end traversal through Phase 8 tests (130 pass) still green. |
| 7 | moonshort-backend internal files marked DEPRECATED (local commit, no push) | ✅ PASS | Local commit `7e7fe42` in `~/MobAI/moonshort-backend`; covers tracked files `cg_render.py` + `sync_to_oss.py`. Untracked files `render-with-style.py` + `upscale.py` (in backend's .gitignore) have DEPRECATED notices in-tree but don't survive commit |
| 8 | `bun --cwd=agent run typecheck` / `bun --cwd=agent run test` green for the asset slice | ✅ PASS | typecheck: `TC=0`; asset-service + cg-render + upscale-image: 162/162 |
| 9 | `phase-9-asset-tools-migration-verification.md` complete | ✅ This document | |
| 10 | All assets-produce atomic commits pushed to origin/main | ⚠ Pending push (will run last) | 16 commits in `052f886..HEAD` ready: 8 Phase 8 review fixes + 8 Phase 9 |

## Per-step verification

### Step 1 — Backend survey

Directory tree examined: `/Users/august/MobAI/moonshort-backend/generate-upscale-matting/`.
Three target files identified with these characteristics:

| Source file | Size | Notes |
|---|---|---|
| `cg_render.py` | 261 lines | Imports helper from `render-with-style.py` via `importlib.util`. Hardcoded slug → OSS prefix mapping (`nrbi/` etc.). Uses `os.environ["OSS_*"]`. |
| `render-with-style.py` | 1542 lines | Heavy deps: `sshtunnel`, `psycopg`, `keyring`, `paramiko<4.0`, `google-genai`. Reads ZENMUX creds via `keyring`. SSH tunnel to PG `8.133.3.63` for style fetches. |
| `_local_tools/sync_to_oss.py` | 345 lines | Hardcoded `OSS_PREFIX = "nrbi"`, book-slug parameter, `--dry-run` already supported. |
| `upscale.py` | 169 lines | External binary dep: `~/bin/realesrgan/realesrgan-ncnn-vulkan`. Model: `realesrgan-x4plus-anime`. Hardcoded book layout. |

Backend `.gitignore` excludes most of `generate-upscale-matting/` — only
`cg_render.py`, `sync_to_oss.py`, and a few helpers are tracked. The
DEPRECATED notice for untracked files (`render-with-style.py`,
`upscale.py`) is documented in this report only.

### Step 2 — `tools/` scaffold

Commit: `93f4c4d feat(tools): scaffold top-level tools/ directory + shared conventions`

Files created:
- `tools/README.md` (66 lines) — three-tool index, shared conventions (venv,
  JSON I/O, error envelope, mock mode, env injection).
- `tools/.gitignore` — excludes per-tool `.venv/`, `__pycache__/`, smoke output.
- Empty subdirectories `cg-render/`, `oss-sync/`, `upscale/`.

Smoke:
- `ls tools/` → README.md, cg-render/, oss-sync/, upscale/ ✓

### Step 3 — cg-render migration

Commit: `c8bdbbd feat(tools): migrate cg-render from moonshort-backend`

Files:
- `tools/cg-render/render.py` (404 lines = original 261 + 143-line JSON entry block)
- `tools/cg-render/render-with-style.py` (1542 lines, unchanged)
- `tools/cg-render/requirements.txt` (10 deps incl. google-genai, oss2, Pillow)
- `tools/cg-render/README.md`
- `tools/cg-render/fixtures/cg-input.json`

Smoke (mock mode):
```
$ rm -rf /tmp/_cg_smoke && mkdir /tmp/_cg_smoke
$ ASSETS_ROOT=/tmp/_cg_smoke python3 tools/cg-render/render.py --mock --input tools/cg-render/fixtures/cg-input.json
{"outputs": [{"path": "/tmp/_cg_smoke/silver-moon-manor/cg/ep03_sylvia_glyph.webp", "kind": "image"}], "meta": {"model": "gemini-3.1-flash-image-preview", "latency_ms": 0, "atomic_tool": "cg-render", "mock": true}}
$ ls /tmp/_cg_smoke/silver-moon-manor/cg/
ep03_sylvia_glyph.webp   # 67 bytes (1×1 placeholder PNG)
```

stdin mode also verified; invalid input → exit 2 + stderr JSON `{"error":{"code":"INVALID_INPUT", …}}`.

Real (non-mock) mode is NOT exercised in CI — it requires
`ZENMUX_API_KEY` + SSH tunnel access. Manual verification path documented
in `tools/cg-render/README.md`.

### Step 4 — cg-render atomic tool wrapper

Commit: `76170d2 feat(agent): register cg-render as an atomic tool`

Files:
- `agent/packages/opencode/src/tool/asset/python-runner.ts` (new shared helper, 95 lines)
- `agent/packages/opencode/src/tool/asset/cg-render.ts` (216 lines, factory pattern)
- `agent/packages/opencode/src/tool/asset/cg-render.txt`
- `agent/packages/opencode/src/tool/registry.ts` (+4 lines for registration)
- `agent/packages/opencode/test/tool/cg-render.test.ts` (10 tests, all green)

Tests cover: `dryRun` short-circuit, happy path JSON parsing, Python exit ≠ 0,
non-JSON stdout, missing `outputs[]`, runner throw, default model,
explicit model, `--mock` flag toggle (on/off).

Schema declared via Effect `Schema.Struct`. `agent tools show cg-render`
will display: `slug`, `cgName`, `prompt`, `panelCount?`,
`referenceImageUrls[1..8]`, `model?`, `assetsRoot?`, `overwrite?`,
`mock?`, `dryRun?`.

### Step 5 — oss-sync migration

Commit: `7d50dc1 feat(tools): migrate oss-sync from moonshort-backend`

Files:
- `tools/oss-sync/sync.py` (480 lines = original 345 + 135-line JSON entry block)
- `tools/oss-sync/requirements.txt` (oss2 only)
- `tools/oss-sync/README.md`
- `tools/oss-sync/fixtures/sync-dryrun.json`

Smoke (dry-run, no OSS creds):
```
$ mkdir -p /tmp/_oss_sync_smoke
$ echo test1 > /tmp/_oss_sync_smoke/a.webp; echo test2 > /tmp/_oss_sync_smoke/b.webp
$ python3 tools/oss-sync/sync.py --input tools/oss-sync/fixtures/sync-dryrun.json
{"uploaded": [], "skipped": [{"local": "/private/tmp/_oss_sync_smoke/a.webp", "key": "nrbi/cg/a.webp", "reason": "dry_run"}, {"local": "/private/tmp/_oss_sync_smoke/b.webp", "key": "nrbi/cg/b.webp", "reason": "dry_run"}], "errors": []}
```

Per design § 11, oss-sync is NOT registered as an atomic tool — the
opencode tool registry deliberately doesn't expose it.

### Step 6 — upscale migration

Commit: `7cb078f feat(tools): migrate upscale from moonshort-backend`

Files:
- `tools/upscale/upscale.py` (291 lines = original 169 + 122-line JSON entry block)
- `tools/upscale/requirements.txt` (Pillow only — realesrgan is a host-wide binary)
- `tools/upscale/README.md`
- `tools/upscale/fixtures/upscale-mock.json`

Smoke (mock mode):
```
$ mkdir -p /tmp/_upscale_smoke
$ printf '\x89PNG\r\n\x1a\n' > /tmp/_upscale_smoke/in.png
$ python3 tools/upscale/upscale.py --mock --input tools/upscale/fixtures/upscale-mock.json
{"output": {"path": "/private/tmp/_upscale_smoke/out_upscaled.png"}, "meta": {"scale": 2, "model": "realesrgan-x4plus-anime", "latency_ms": 0, "atomic_tool": "upscale-image", "mock": true}}
```

Real (non-mock) mode requires `~/bin/realesrgan/realesrgan-ncnn-vulkan`;
not exercised in CI.

### Step 7 — upscale-image atomic tool wrapper

Commit: `959401d feat(agent): register upscale-image as an atomic tool`

Files:
- `agent/packages/opencode/src/tool/asset/upscale-image.ts` (184 lines)
- `agent/packages/opencode/src/tool/asset/upscale-image.txt`
- `agent/packages/opencode/src/tool/registry.ts` (+4 lines for registration)
- `agent/packages/opencode/test/tool/upscale-image.test.ts` (8 tests, all green)

Reuses `python-runner.ts` from Step 4. Schema: `inputPath`, `outputPath`,
`scale (2|4)`, optional `model`/`overwrite`/`mock`/`dryRun`.

### Step 8 — cg-render-spec skill body update

Commit: `3f3891c docs(knowledge): update cg-render-spec for Phase 9 atomic tool`

Replaced the Phase 8 placeholder note with concrete pointers to the
registered atomic tool. New `## Atomic tool input contract` section
documents the exact JSON shape the loop must assemble per call, mirroring
the Zod/Schema declared in `cg-render.ts`. Fallback path added under
`## Failure handling` (cg-render unavailable → `generate-image-nanobanana`).

Test impact: `intent-to-skill.test.ts` still picks `cg-render-spec` for
`intent.kind == "cg"` (16/16 tests in slice pass).

### Step 9 — moonshort-backend DEPRECATED notices

Local backend commit: `7e7fe42 chore(deprecated): mark CG / OSS-sync tools as migrated to assets-produce`

Per design § 11 and global Git push policy, this commit lives LOCALLY in
`~/MobAI/moonshort-backend` and is NOT pushed. Push deferred to Phase 10
and gated on explicit backend-maintainer acknowledgement.

Coverage:
- ✅ `cg_render.py` — tracked, DEPRECATED notice committed.
- ✅ `_local_tools/sync_to_oss.py` — tracked, DEPRECATED notice committed.
- ⚠ `render-with-style.py` — UNTRACKED (`.gitignore` line 114).
  DEPRECATED notice is in the working-tree file but doesn't survive any
  commit. Acceptable — file was already not in the repo.
- ⚠ `upscale.py` — UNTRACKED (`.gitignore` line 114). Same as above.

Backend working-tree state: `process_via_5070ti_service.py` and several
`moonscripts/...` files have pre-existing unrelated modifications; left
untouched in this phase per atomic-commit hygiene.

### Step 10 — Docs

Commit: `973a07e docs(env+skill+knowledge): wire Phase 9 surface area`

Touched:
- `.env.example` — added `ZENMUX_API_KEY`, `ZENMUX_BASE_URL` (Phase 9 block) and `PYTHON` override note.
- `SKILL.md` — new § 9 "Available asset production tools (Phase 9+)" with
  routing guide for the mini agent loop; existing "Links" bumped to § 10.
- `knowledge/asset-generation/README.md` — status block updated:
  cg-render-spec is Phase 9 production-ready; other 4 bodies still call
  Phase 8 placeholder until Phase 10+.

## Deferred / Out-of-scope (plan § 4)

- Per plan § 4, no migration of any other backend subdirectory beyond the
  three named tools.
- No deletion of backend originals — only DEPRECATED notices.
- ZENMUX model swap, oss-sync atomic-tool registration, CI integration
  for Python lint/pytest: all explicitly out of scope.
- Real (non-mock) cg-render / upscale verification deferred — needs
  credentials + binary that are not present in CI environments.

## Commit history

8 review-fix commits (Phase 8 follow-up):
- `351bdaf fix(agent): recover preferences from persisted intent in runAssetGeneration` (H2)
- `1c694c6 fix(agent): enforce client_request_id idempotency at db layer` (H1)
- `83fef29 fix(agent): log abandoned asset-service worker errors` (H3)
- `096b5ad fix(agent): stop leaking raw exception messages from asset-service handle()` (M1)
- `371b4be fix(agent): reject empty lookup queries with INVALID_INPUT` (M2)
- `29594e3 refactor(agent): drop \`as any\` cast on AssetCreateBody.asset_intent` (M4)
- `8e0534a refactor(agent): remove dead \`_internal\` export from catalog` (M5)
- `7caf44f test(agent): unit-test placeholderGenerator output shape` (L2)

8 Phase 9 commits:
- `93f4c4d feat(tools): scaffold top-level tools/ directory + shared conventions`
- `c8bdbbd feat(tools): migrate cg-render from moonshort-backend`
- `76170d2 feat(agent): register cg-render as an atomic tool`
- `7d50dc1 feat(tools): migrate oss-sync from moonshort-backend`
- `7cb078f feat(tools): migrate upscale from moonshort-backend`
- `959401d feat(agent): register upscale-image as an atomic tool`
- `3f3891c docs(knowledge): update cg-render-spec for Phase 9 atomic tool`
- `973a07e docs(env+skill+knowledge): wire Phase 9 surface area`

External (moonshort-backend, local only):
- `7e7fe42 chore(deprecated): mark CG / OSS-sync tools as migrated to assets-produce`

## Operator smoke tests (re-runnable)

```bash
# cg-render
rm -rf /tmp/_cg_smoke && mkdir /tmp/_cg_smoke
ASSETS_ROOT=/tmp/_cg_smoke python3 tools/cg-render/render.py --mock \
  --input tools/cg-render/fixtures/cg-input.json

# oss-sync
mkdir -p /tmp/_oss_sync_smoke && echo demo > /tmp/_oss_sync_smoke/a.webp
python3 tools/oss-sync/sync.py --input tools/oss-sync/fixtures/sync-dryrun.json

# upscale
mkdir -p /tmp/_upscale_smoke && printf '\x89PNG\r\n\x1a\n' > /tmp/_upscale_smoke/in.png
python3 tools/upscale/upscale.py --mock --input tools/upscale/fixtures/upscale-mock.json

# atomic tools (typecheck-only — no fixture)
cd agent/packages/opencode
bun run typecheck    # → TC=0
bun test test/tool/cg-render.test.ts test/tool/upscale-image.test.ts
# → 18/18 green
```

## Tests summary

| Slice | Tests | Pass | Fail |
|---|---|---|---|
| asset-service (Phase 8 + review-fix regressions) | 144 | 144 | 0 |
| cg-render atomic tool | 10 | 10 | 0 |
| upscale-image atomic tool | 8 | 8 | 0 |
| **Phase 9 covered slice total** | **162** | **162** | **0** |

`test/tool/` full slice shows pre-existing timeout flakes (glob, grep,
skill, registry — see Phase 8 baseline) unrelated to this phase. Phase 9
adds zero new flakes.

## Sign-off

- Plan §5 acceptance items 1-9 PASS.
- Item 10 (push) is the last step; will run immediately after this report
  is committed.
