# Phase 13 Migration Survey
## lunaverse-backend/generate-upscale-matting → assets-produce/tools/

> Status: **decision document only** — no files migrated, no code written.
> Date: 2026-05-16
> Surveyor: Claude Sonnet 4.6 (Phase 13 pre-work)

---

## A. Full Directory Tree (39 .py files)

```
generate-upscale-matting/
├── matting.py                           ← CANDIDATE
├── cutout.py                            ← CANDIDATE
├── hole_fill.py                         ← CANDIDATE
├── green_spill_clear.py                 ← CANDIDATE
├── rgb_unspill.py                       ← CANDIDATE
├── detect_matting_failures.py           ← CANDIDATE
├── batch_modnet_hybrid.py               ← CLASSIFY (orchestration/glue)
├── render-with-style.py                 ← CLASSIFY (already migrated + deprecated)
├── to-final.py                          ← CLASSIFY (backend orchestrator)
├── cg_render.py                         ← already migrated Phase 9
├── upscale.py                           ← already migrated Phase 9
├── _local_tools/
│   ├── hybrid_to_webp.py                ← CANDIDATE
│   ├── process_via_5070ti_service.py    ← CLASSIFY (backend infra client)
│   └── sync_to_oss.py                  ← already migrated Phase 9
├── scripts/
│   └── upsert_scene_grid_style.py      ← CLASSIFY (backend DB admin)
├── test_connected_chromakey.py          ← skip (experiment)
├── test_modnet_10.py                    ← skip (experiment)
├── test_modnet_edge_decon_10.py         ← skip (experiment)
├── test_modnet_only.py                  ← skip (experiment)
├── test_modnet_strict_chromakey_10.py   ← skip (experiment)
├── test_modnet_v10_10.py                ← skip (experiment)
├── test_modnet_v4_10.py                 ← skip (experiment)
├── test_modnet_v5_10.py                 ← skip (experiment)
├── test_modnet_v6_10.py                 ← skip (experiment)
├── test_modnet_v7_10.py                 ← skip (experiment)
├── test_modnet_v8_10.py                 ← skip (experiment)
├── test_modnet_v9_10.py                 ← skip (experiment)
└── tests/
    ├── __init__.py                      ← skip (backend test suite)
    ├── conftest.py                      ← skip (backend test suite)
    ├── test_cg_render.py                ← skip (backend test suite)
    ├── test_cutout.py                   ← skip (backend test suite)
    ├── test_detect_matting_failures.py  ← skip (backend test suite)
    ├── test_green_spill_clear.py        ← skip (backend test suite)
    ├── test_hole_fill.py                ← skip (backend test suite)
    ├── test_matting_png_output.py       ← skip (backend test suite)
    ├── test_render_dag.py               ← skip (backend test suite)
    ├── test_render_input_override.py    ← skip (backend test suite)
    ├── test_sync_to_oss_strict.py       ← skip (backend test suite)
    └── test_to_final_phases.py          ← skip (backend test suite)
```

---

## B. Per-File Determination Table

| # | File path | 迁/不迁 | Category | External deps (heavy ML flagged) | Env vars | Implicit-import risk | Current invocation | Notes |
|---|-----------|---------|----------|----------------------------------|----------|----------------------|--------------------|-------|
| 1 | `matting.py` | **迁** | 产视觉产物 → register atomic tool | **[HEAVY-ML]** `torch`, `torchvision`, `cv2`, `numpy`, `PIL` | none | `sys.path.insert(0, ~/modnet)` to import `src.models.modnet.MODNet` from MODNet repo — MUST be resolved at install/mock time | `--src <png> --dst <png> [--fmt webp\|png] [--device cpu] [--overwrite]` argparse CLI; `matte_one()`/`matte_one_v10()` importable functions | Heaviest ML file: requires MODNet repo clone at `~/modnet` + 26 MB ckpt. `--mock` must produce deterministic RGBA PNG without torch. v10 pipeline (`matte_v10`, `_matte_array_v10`, `matte_one_v10`) is the production path; legacy `matte_one` kept for back-compat. |
| 2 | `cutout.py` | **迁** | 产视觉产物 → register atomic tool | `numpy`, `PIL` (no ML) | `CHROMAKEY_HUE_LOW`, `CHROMAKEY_HUE_HIGH`, `CHROMAKEY_SAT_MIN`, `CHROMAKEY_VAL_MIN`, `CHROMAKEY_FEATHER` | No sibling imports; no `sys.path` manipulation | `--root <dir> [--only ids] [--workers N] [--force] [--backup-to rel_path]` argparse; walks `series/character_*.png` + `ep_sprites/**/*.png` under `--root` | Walks a book-slug-shaped directory tree. Normalized contract: input dir → mutate-in-place PNG files; needs redesign to accept a single-file or list-of-files JSON I/O for atomic-tool use (or accept path list via stdin JSON). All 5 chromakey env vars become configurable JSON inputs. |
| 3 | `hole_fill.py` | **迁** | 产视觉产物 → register atomic tool | `cv2`, `numpy`, `PIL`, `scipy.ndimage` (no ML weights) | none | No sibling imports; no `sys.path` manipulation | `--paths a.png,b.png,... [--dilate 2] [--min-size 200] [--max-size 8000]` argparse; in-place mutation | Mutates files in-place (reads+writes same path). Normalized contract: JSON input with `paths[]` list; JSON output summary. No ML weights — deterministic + GPU-free, `--mock` is trivial. |
| 4 | `green_spill_clear.py` | **迁** | 产视觉产物 → register atomic tool | `numpy`, `PIL` (no ML) | none | No sibling imports; no `sys.path` manipulation | `--paths a.png,b.png,... [--delta 5] [--bright-sum 400] [--workers 8]` argparse; in-place mutation | Same in-place pattern as `hole_fill.py`. Very lightweight — only numpy+PIL. `--mock` trivially returns no-op. |
| 5 | `rgb_unspill.py` | **迁** | 产视觉产物 → register atomic tool | `numpy`, `PIL` (no ML) | none | No sibling imports; no `sys.path` manipulation | `--root <dir> \| --paths a.webp,b.webp [--workers 8] [--dry-run]` argparse; in-place mutation on webp+png | Same in-place pattern. Accepts either `--root` (directory walk) or `--paths` (explicit list). Handles `.webp` and `.png` output formats. |
| 6 | `detect_matting_failures.py` | **迁** | 检测/判定 → CLI-only, NOT registered | `numpy`, `PIL`, `scipy.ndimage` (no ML weights) | none | No sibling imports; no `sys.path` manipulation | `--root <dir> [--only ids] [--threshold-holes float] [--threshold-body-gap int] [--out path]` argparse; writes `detect_report.json` | Per design decision: detection/judgement tools must NOT be registered as atomic tools (LLM must not directly call them). Output is a JSON report consumed by downstream orchestration. Migrate the script to `tools/detect-matting/` as CLI-only (no TypeScript bridge, no skill registration). |
| 7 | `batch_modnet_hybrid.py` | **不迁** | 编排/胶水/backend-coupled → skip | `numpy`, `PIL`; imports from sibling `matting.py` | none | `sys.path.insert(0, SCRIPT_DIR)` to import from `matting.py` — classic coupling | argparse CLI; walks backend book-slug directory tree (`lunascripts/<slug>/assets/…`) | Tightly coupled to lunaverse-backend's `lunascripts/<slug>/assets/` directory layout. Orchestrates the MODNet hybrid pass over a whole book. This is a backend operational tool, not a portable atomic tool. Its core `hybrid_one()` logic is already in `matting.py` (which does migrate). Skip. |
| 8 | `render-with-style.py` | **不迁** | already migrated (via cg-render, Phase 9) — skip | `keyring`, `psycopg`, `sshtunnel`, `google-genai`, `oss2`, `PIL`, `numpy` | `MOB_AI_API_KEY`, `MOB_AI_BASE_URL`, `WAVESPEED_API_KEY`, `OSS_ENDPOINT`, `OSS_BUCKET`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `__SPRITE_MODEL_OVERRIDE__` | No sibling imports (guards all heavy deps with try/except) | Complex argparse CLI; SSH tunnel to remote PG for style config; Gemini/Wan/WaveSpeed rendering | File header explicitly states `DEPRECATED 2026-05-15 — migrated to cdotlock/assets-produce/tools/cg-render/`. Do not migrate again. |
| 9 | `to-final.py` | **不迁** | 编排/胶水/backend-coupled → skip | `numpy`, `PIL`; calls sibling scripts via `subprocess` | none | `sys.path.insert(0, SCRIPT_DIR)` to import `matting.matte_one`; uses `subprocess` to call `cutout.py`, `hole_fill.py`, `green_spill_clear.py`, `rgb_unspill.py`, `detect_matting_failures.py` | argparse CLI; multi-phase orchestrator for whole-book pipeline | This is the top-level orchestrator that chains all the individual tools in sequence. Its value is entirely as backend glue — it knows about `lunascripts/<slug>/assets/` paths and the multi-phase order. In assets-produce, skill orchestration replaces this role. Skip. |
| 10 | `cg_render.py` | already migrated (Phase 9) → exclude | — | — | — | — | — | Confirmed: `tools/cg-render/` exists in assets-produce. |
| 11 | `upscale.py` | already migrated (Phase 9) → exclude | — | — | — | — | — | Confirmed: `tools/upscale/` exists in assets-produce. |
| 12 | `_local_tools/hybrid_to_webp.py` | **迁** | 产视觉产物 → register atomic tool | `PIL` only (no ML) | none | `REPO_ROOT = Path(__file__).resolve().parents[2]` — hard-coded 3-level path assumption; breaks when moved | argparse CLI; reads `asset-img-chromakey/ep_sprites/<sid>.png`, writes `final/ep_sprites/<sid>.webp` | Thin PNG→WebP encoder. The path logic (`parents[2]`) is backend-repo-coupled and must be replaced with explicit `--input` / `--output` args in the normalized JSON I/O contract. No ML weights; lightweight. Skip the book-slug directory walking entirely — atomic tool receives explicit input path. |
| 13 | `_local_tools/process_via_5070ti_service.py` | **不迁** | 编排/胶水/backend-coupled → skip | `numpy`, `PIL`, `requests` | `SPRITE_SVC_HOST` | Hardcodes `REPO = Path.home() / "MobAI" / "lunaverse-backend"` | argparse CLI; HTTP client that POSTs sprites to 5070Ti Windows service, receives RGBA back | Backend infrastructure client for a specific GPU service. Hardcoded to lunaverse-backend's directory layout. Backend operational tooling only. Skip. |
| 14 | `_local_tools/sync_to_oss.py` | already migrated (Phase 9) → exclude | — | — | — | — | — | Confirmed: `tools/oss-sync/` exists in assets-produce. |
| 15 | `scripts/upsert_scene_grid_style.py` | **不迁** | 编排/胶水/backend-coupled → skip | `keyring`, `psycopg`, `sshtunnel` | none (reads from keyring) | No sibling imports | One-off DB admin script; connects via SSH tunnel to remote PG `style_config` DB | Pure backend DB maintenance script (upserts a row into the style_config database). Has zero relevance to assets-produce's atomic tool system. Skip. |
| 16 | `test_connected_chromakey.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2` | none | — | — | Standalone ablation script testing connected-component chromakey approach. |
| 17 | `test_modnet_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: pure MODNet on 10 representative sprites. |
| 18 | `test_modnet_edge_decon_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: MODNet + edge decontamination variant. |
| 19 | `test_modnet_only.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: pure MODNet smoke test (3 images). |
| 20 | `test_modnet_strict_chromakey_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: MODNet + strict chromakey + spill. |
| 21 | `test_modnet_v10_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: v10 pipeline validation on 10 samples. |
| 22 | `test_modnet_v4_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: v4 iteration. |
| 23 | `test_modnet_v5_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: v5 iteration. |
| 24 | `test_modnet_v6_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: v6 iteration. |
| 25 | `test_modnet_v7_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: v7 iteration. |
| 26 | `test_modnet_v8_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: v8 iteration. |
| 27 | `test_modnet_v9_10.py` | **不迁** | backend test/experiment → skip | `numpy`, `cv2`, `torch` | none | — | — | Ablation: v9 iteration. |
| 28 | `tests/__init__.py` | **不迁** | backend test/experiment → skip | none | — | — | — | Backend pytest test suite init. |
| 29 | `tests/conftest.py` | **不迁** | backend test/experiment → skip | `numpy`, `PIL`, `pytest` | — | — | — | Backend pytest fixtures at 1882×3344 delivery size. |
| 30 | `tests/test_cg_render.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for cg_render (already migrated). |
| 31 | `tests/test_cutout.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for cutout. |
| 32 | `tests/test_detect_matting_failures.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for detect_matting_failures. |
| 33 | `tests/test_green_spill_clear.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for green_spill_clear. |
| 34 | `tests/test_hole_fill.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for hole_fill. |
| 35 | `tests/test_matting_png_output.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for matting PNG output. |
| 36 | `tests/test_render_dag.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for render DAG logic. |
| 37 | `tests/test_render_input_override.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for render input override. |
| 38 | `tests/test_sync_to_oss_strict.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for sync_to_oss (already migrated). |
| 39 | `tests/test_to_final_phases.py` | **不迁** | backend test/experiment → skip | `pytest` | — | — | — | Backend tests for to-final.py orchestrator. |

---

## C. Backend Python Version

No `.python-version` or `pyproject.toml` exists directly in `generate-upscale-matting/` or its immediate parent (`lunaverse-backend/`). The only versioned Python service in the repo is `services/dream-agent/` which specifies `python>=3.11,<3.13` (pinned to `3.11` via `.python-version`).

**Conclusion:** `generate-upscale-matting/` uses Python 3.11 by convention (same as the repo's only declared version). The `from __future__ import annotations` usage in every file and `tuple[...]` return-type syntax (used throughout) confirm Python ≥ 3.10. Each migrated tool's `tools/<name>/` directory should declare its own `requirements.txt` and a `venv` created with Python 3.11.

---

## D. Confirmed Concrete Migration List

### D.1 Atomic Tool Set (register — output goes through `oss-put`)

| Tool dir | Source file | One-line justification |
|----------|-------------|------------------------|
| `tools/matting/` | `matting.py` | Produces an RGBA visual asset (MODNet portrait alpha matting + green-screen unmix + alpha sharpen); primary deliverable is the matted PNG/WebP. **Heaviest ML file** — requires torch + MODNet ckpt. |
| `tools/cutout/` | `cutout.py` | Produces an RGBA visual asset (HSV chromakey green-screen removal); fast and deterministic, no ML weights. |
| `tools/hole-fill/` | `hole_fill.py` | Produces a visually corrected RGBA asset (inpaints interior body-leak holes); uses cv2 TELEA inpaint, no ML weights. |
| `tools/green-spill-clear/` | `green_spill_clear.py` | Produces a visually corrected RGBA asset (removes chromakey green-spill leak pixels); numpy+PIL only. |
| `tools/rgb-unspill/` | `rgb_unspill.py` | Produces a visually corrected RGBA asset (Nuke-style G channel decontamination); numpy+PIL only. |
| `tools/hybrid-to-webp/` | `_local_tools/hybrid_to_webp.py` | Produces a delivery WebP from an RGBA PNG; final encoding step in the chromakey hybrid pipeline. PIL only, no ML. |

### D.2 CLI-Only Set (migrate, NOT registered as atomic tool)

| Tool dir | Source file | One-line justification |
|----------|-------------|------------------------|
| `tools/detect-matting/` | `detect_matting_failures.py` | Detection/judgement output only (holes_pct, body_gap_px, PASS/FAIL report); per spec §10 and Phase 9 oss-sync precedent, detection tools must not be registered — an LLM must not directly call them. Migrate to CLI for downstream orchestration use. |

### D.3 Skipped Set (do NOT migrate)

| File | One-line justification |
|------|------------------------|
| `cg_render.py` | Already migrated Phase 9 → `tools/cg-render/`. |
| `upscale.py` | Already migrated Phase 9 → `tools/upscale/`. |
| `_local_tools/sync_to_oss.py` | Already migrated Phase 9 → `tools/oss-sync/`. |
| `render-with-style.py` | Already migrated Phase 9 → `tools/cg-render/`; file header marks it DEPRECATED 2026-05-15. |
| `batch_modnet_hybrid.py` | Backend orchestration tool — tightly coupled to `lunascripts/<slug>/assets/` layout; its core logic (`hybrid_one`) lives in `matting.py` which does migrate. |
| `to-final.py` | Backend multi-phase orchestrator for whole-book pipeline; glue code whose role is replaced by skill orchestration in assets-produce. |
| `_local_tools/process_via_5070ti_service.py` | Backend HTTP client for a specific Windows GPU service (`windows-5070ti.local:8000`); hardcodes `~/MobAI/lunaverse-backend` paths. |
| `scripts/upsert_scene_grid_style.py` | Backend DB admin one-off; connects via SSH tunnel to remote PG `style_config`. |
| All `test_*.py` (12 files) | Backend ablation experiments — iteration history for the v1–v10 matting algorithm. No migration value. |
| `tests/` directory (11 files) | Backend pytest suite — tests for the backend's own copies of the tools. Will be written fresh against migrated versions. |

---

## E. Per-Migrating-File Implicit Import Notes

### `matting.py` → `tools/matting/`

**Critical import hazard.** The file does:
```python
MODNET_REPO = pathlib.Path.home() / "modnet"
sys.path.insert(0, str(MODNET_REPO))
from src.models.modnet import MODNet  # relative inside ~/modnet repo
```

This `sys.path` mutation is inside `load_modnet()`, not at module import time, so the module is importable without the ckpt present. However, any invocation that actually runs inference will fail if `~/modnet` is not present or not on the Python path.

**Required changes on migration:**
1. Replace hardcoded `~/modnet` with a configurable `MODNET_REPO` env var (e.g. `MODNET_REPO_PATH`).
2. `--mock` mode must return a deterministic RGBA PNG (e.g. a solid 1×1 pixel) without calling `load_modnet()` at all.
3. The MODNet ckpt path and repo path must be documented in `tools/matting/README.md` as required install steps.

No other sibling-module imports in this file.

### `cutout.py` → `tools/cutout/`

No sibling imports. No `sys.path` manipulation. Clean.

The directory-walking logic (`collect_targets`) uses a hardcoded book-slug tree shape (`series/character_*.png`, `ep_sprites/**/*.png`). The normalized atomic-tool contract replaces `--root <dir>` with an explicit JSON input containing a `paths: string[]` array (or a single `path: string`). The `run()` function is easily refactored for this.

### `hole_fill.py` → `tools/hole-fill/`

No sibling imports. No `sys.path` manipulation. Clean.

### `green_spill_clear.py` → `tools/green-spill-clear/`

No sibling imports. No `sys.path` manipulation. Clean.

### `rgb_unspill.py` → `tools/rgb-unspill/`

No sibling imports. No `sys.path` manipulation. Clean.

### `_local_tools/hybrid_to_webp.py` → `tools/hybrid-to-webp/`

**Import hazard (path).** The file does:
```python
REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
```
This assumes the file lives exactly 2 directories below the repo root (`_local_tools/` is one level, `generate-upscale-matting/` is another). When moved to `tools/hybrid-to-webp/`, `parents[2]` points somewhere wrong.

**Required changes on migration:**
- Remove all `REPO_ROOT` / book-slug directory construction logic.
- Replace with explicit `--input <png-path>` and `--output <webp-path>` args, consistent with JSON I/O contract.

No sibling-module imports.

### `detect_matting_failures.py` → `tools/detect-matting/` (CLI-only)

No sibling imports. No `sys.path` manipulation. Clean.

The directory-walking logic (`collect_targets`) mirrors `cutout.py`'s book-slug tree shape. As a CLI-only tool (not atomic-tool registered), this can keep `--root` / `--out` convention or accept a JSON paths list. No TypeScript bridge needed.

---

## F. Candidate-List Cross-Check

The design doc (phase-13-image-processing-migration-plan.md § 0, candidate list from design §6) named these candidates:

> matting/MODNet, cutout, hole_fill, green_spill/rgb_unspill, detect_matting_failures, hybrid_to_webp

**Verification:**

| Candidate | Decision | Notes |
|-----------|----------|-------|
| matting/MODNet (`matting.py`) | CONFIRMED MIGRATE — atomic tool | Heaviest file; v10 pipeline is the current production path. |
| cutout (`cutout.py`) | CONFIRMED MIGRATE — atomic tool | Lightweight; HSV chromakey only. |
| hole_fill (`hole_fill.py`) | CONFIRMED MIGRATE — atomic tool | Medium weight; cv2+scipy inpaint. |
| green_spill (`green_spill_clear.py`) | CONFIRMED MIGRATE — atomic tool | Lightweight; numpy+PIL only. |
| rgb_unspill (`rgb_unspill.py`) | CONFIRMED MIGRATE — atomic tool (separate from green_spill) | Design lists "green_spill/rgb_unspill" together but these are two distinct scripts with distinct algorithms; both migrate as separate tools. |
| detect_matting_failures (`detect_matting_failures.py`) | CONFIRMED MIGRATE — CLI-only, NOT registered | Per design decision: detection/judgement ≠ atomic tool. |
| hybrid_to_webp (`_local_tools/hybrid_to_webp.py`) | CONFIRMED MIGRATE — atomic tool | Thin WebP encoder; migrating makes it available as the delivery-encoding step independent of backend paths. |

**Non-candidates that qualify:** None found. All remaining non-test files (`batch_modnet_hybrid.py`, `to-final.py`, `render-with-style.py`, `scripts/upsert_scene_grid_style.py`, `_local_tools/process_via_5070ti_service.py`) are legitimately orchestration, glue, or already-migrated.

**Candidate listed that is actually glue/coupled:** None. The candidate list from the design doc was accurate. No candidate turned out to be orchestration-only.

**Deviation from candidate list:** Design listed "green_spill/rgb_unspill" as one item; survey confirms they are two separate tools (`green_spill_clear.py` and `rgb_unspill.py`) and both should become separate `tools/<name>/` entries. This is an additive clarification, not a contradiction.

---

## G. Summary Counts

| Category | Count | Files |
|----------|-------|-------|
| Migrate → atomic tool (register) | 6 | matting, cutout, hole-fill, green-spill-clear, rgb-unspill, hybrid-to-webp |
| Migrate → CLI-only (not registered) | 1 | detect-matting |
| Already migrated Phase 9 → exclude | 3 | cg_render, upscale, sync_to_oss |
| Already migrated (render-with-style, DEPRECATED) → exclude | 1 | render-with-style |
| Backend orchestration/glue → skip | 4 | batch_modnet_hybrid, to-final, process_via_5070ti_service, upsert_scene_grid_style |
| Backend test/experiment → skip | 24 | 12 top-level test_*.py + 11 tests/ + 1 tests/__init__.py |
| **Total** | **39** | |

---

## H. Heavy-ML Files Flagged

Exactly **one** file requires heavy ML infrastructure:

**`matting.py`** — requires:
- `torch` (PyTorch)
- `torchvision`
- `cv2` (OpenCV)
- `numpy`
- `Pillow`
- MODNet repo cloned at configurable path (default `~/modnet`)
- MODNet checkpoint `modnet_photographic_portrait_matting.ckpt` (~26 MB)

All other files in the migrate set use only lightweight OpenCV (`cv2`), `numpy`, `Pillow`, and/or `scipy.ndimage` — no model weights required.

The `tools/matting/` tool will need:
- A separate `requirements.txt` isolating `torch`, `torchvision` from lighter tools
- A `--mock` implementation that skips `load_modnet()` entirely and returns a solid RGBA placeholder
- Documentation on the MODNet ckpt install (one-time setup)

---

*End of Phase 13 Survey — produced 2026-05-16*
