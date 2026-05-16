# cutout

HSV chromakey green-screen removal on a single image, producing an RGBA cutout
(numpy + Pillow, no ML).

Converts a flat-green-background character / sprite PNG to a transparent RGBA
PNG via HSV thresholding on the green region (binary green mask) plus an
optional gaussian feather on the alpha edge. RGBA-aware: when the input is
already RGBA, the new alpha is `min(new, old)`, so re-running on a
previously-cut PNG never resurrects the green screen. Deterministic, no model
dependency, sharper edges than U2Net-class segmentation on a flat known
background.

Atomic tool: ONE input file -> ONE output file. No directory walking, no
batch paths/ids, no worker pool, no backup tree, no REPO_ROOT discovery.

> Migrated 2026-05-17 from
> `moonshort-backend/generate-upscale-matting/cutout.py`.
> Batch logic (`--root`, `--only`, `--workers`, `--force`, `--backup-to`,
> the `series/character_*.png` + `ep_sprites/**` directory walk,
> ThreadPoolExecutor) removed entirely. The atomic tool preserves the per-file
> HSV chromakey-removal algorithm verbatim (thresholds, mask construction,
> RGBA-aware alpha, gaussian feather, dtype/casting).

## Setup

```bash
cd tools/cutout
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Mock mode needs NO deps** -- uses a hand-crafted 1x1 RGBA PNG via stdlib
`struct`+`zlib` (same as `tools/hole-fill`, `tools/rgb-unspill` and
`tools/green-spill-clear`). Real chromakey processing requires numpy + Pillow.

## Entry -- JSON mode (preferred)

```bash
python3 cutout.py --input fixtures/cutout-mock.json
# or stdin
cat fixtures/cutout-mock.json | python3 cutout.py --input -
```

Input shape:

```json
{
  "input_path":  "/abs/in.png",
  "output_path": "/abs/out.png",
  "hue_low":     80.0,
  "hue_high":    160.0,
  "sat_min":     0.30,
  "val_min":     0.25,
  "feather":     0.8,
  "overwrite":   false,
  "mock":        false
}
```

`hue_low` / `hue_high` are degrees (0..360); `sat_min` / `val_min` are
fractions (0..1); `feather` is a gaussian blur radius in pixels (0 disables).
All five are optional and default to the backend's tuned constants
(`80.0 / 160.0 / 0.30 / 0.25 / 0.8`). `output_path` is always a PNG (RGBA).

Output (stdout):

```json
{
  "output": {"path": "/abs/out.png"},
  "meta": {
    "hue_low":     80.0,
    "hue_high":    160.0,
    "sat_min":     0.3,
    "val_min":     0.25,
    "feather":     0.8,
    "latency_ms":  12,
    "atomic_tool": "cutout",
    "mock":        false
  }
}
```

Errors go to **stderr** as `{"error":{"code":"...","message":"..."}}` with
exit codes:

| Code | Exit | Meaning |
|------|------|---------|
| `INVALID_INPUT` | 2 | bad/missing `input_path`/`output_path`; non-numeric `hue_low`/`hue_high`/`sat_min`/`val_min`/`feather`; output exists with `overwrite=false`; unwritable output dir |
| `ATOMIC_TOOL_FAILED` | 4 | numpy/Pillow processing error (corrupt source, I/O failure) |
| `INTERNAL` | 1 | unexpected exception |

## Environment variables

None. The backend's `CHROMAKEY_HUE_LOW` / `CHROMAKEY_HUE_HIGH` /
`CHROMAKEY_SAT_MIN` / `CHROMAKEY_VAL_MIN` / `CHROMAKEY_FEATHER` deployment env
vars are NOT read here -- the atomic contract is explicit JSON params
(`hue_low` / `hue_high` / `sat_min` / `val_min` / `feather`). This tool has no
ML model and no external service.

## Mock mode

```bash
python3 cutout.py --mock --input fixtures/cutout-mock.json
```

Writes a tiny valid 1x1 fully-transparent RGBA PNG at `output_path` using
stdlib `struct`+`zlib` only -- **no numpy or Pillow required**. Mock bypasses
reading the real `input_path` (works even if the input file does not exist).

## Explicit single-file CLI (back-compat)

```bash
python3 cutout.py \
  --input in.png \
  --output out.png \
  --hue-low 80 \
  --hue-high 160 \
  --sat-min 0.30 \
  --val-min 0.25 \
  --feather 0.8 \
  --overwrite
```

Calls the same faithful `_cutout` helper as the JSON entry. No batch loop, no
directory walking, no `--root`/`--only`/`--workers`/`--force`/`--backup-to`.

## Tests

```bash
cd tools/cutout
python3 -m pytest test_cutout_mock.py -q
```
