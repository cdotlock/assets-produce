# detect-matting

Inspect RGBA PNG alpha channels for chromakey matting failures. Emits a PASS/FAIL JSON report.

**CLI-ONLY: this tool is intentionally NOT registered as an atomic tool.** It has no TypeScript shell in `agent/packages/opencode/src/tool/asset/` and does not appear in `registry.ts`. Detection/judgement tools must not be LLM-callable. Call it directly from the shell or operator scripts.

## What it does

Reads a single RGBA PNG produced by the cutout + green-spill-clear pipeline and flags structural alpha-channel failure modes:

- **Interior holes** — clothing / body punched through (chromakey matched body pixels)
- **Central body band heavily transparent** — dark sleeves or garments were chromakeyed away

### Algorithm rationale

Naive `binary_fill_holes(alpha >= 240)` over-counts the gap between two legs as an internal hole, false-flagging stand-pose sprites. We close narrow gaps via `binary_closing` with `disk=20` BEFORE filling holes, then count only pixels enclosed by the silhouette AFTER closing. `disk=20` is the empirical sweet spot for 1882×3344 sprites.

## Report schema (single-sample)

```json
{
  "verdict":           "PASS",
  "holes_pct":         0.1234,
  "body_gap_px":       42,
  "threshold_holes":   5.0,
  "threshold_body_gap": 400000,
  "input":             "/abs/path/to/in.png"
}
```

- `verdict`: `"PASS"` or `"FAIL"`
- `holes_pct`: interior hole pixels as a % of solid (alpha ≥ 240) pixels; rounded to 4 decimal places
- `body_gap_px`: transparent (alpha < 10) pixel count in the central body band (y: 30–95%, x: 30–70%)
- A **FAIL verdict is NOT a tool error** — exit 0 with `verdict:"FAIL"` means the inspection succeeded and the image has failures. Reserve non-zero exits for actual processing errors.

## JSON entry (preferred)

```bash
python3 detect-matting.py --input fixtures/detect-matting-mock.json
cat fixtures/detect-matting-mock.json | python3 detect-matting.py --input -
```

### Input

```json
{
  "input":              "/abs/path/to/in.png",
  "output":             "/abs/path/to/report.json",
  "threshold_holes":    5.0,
  "threshold_body_gap": 400000
}
```

### Output (stdout)

```json
{
  "output": {"path": "/abs/path/to/report.json"},
  "meta": {
    "atomic_tool":       "detect-matting",
    "mock":              false,
    "verdict":           "PASS",
    "holes_pct":         0.0,
    "body_gap_px":       0,
    "threshold_holes":   5.0,
    "threshold_body_gap": 400000
  }
}
```

## Explicit single-file CLI

```bash
python3 detect-matting.py \
  --input in.png \
  --output report.json \
  --threshold-holes 5.0 \
  --threshold-body-gap 400000
```

## Environment variables

None required. All parameters passed via JSON input or CLI flags.

## Mock mode

```bash
python3 detect-matting.py --mock --input fixtures/detect-matting-mock.json
```

Mock writes a deterministic `PASS` report using stdlib `json + pathlib` only — **no numpy, scipy, or Pillow required** for mock mode. Useful in tests and CI without the full scipy stack.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success (includes FAIL verdict — judging succeeded) |
| 2 | `INVALID_INPUT` — bad/missing fields, non-numeric thresholds, unwritable output dir |
| 4 | `ATOMIC_TOOL_FAILED` — numpy/PIL/scipy processing error |
| 1 | `INTERNAL` — unexpected exception |

## Dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Mock mode needs **no deps** (stdlib-only). Real detection needs: `numpy`, `Pillow`, `scipy`.

## Tests

```bash
cd tools/detect-matting
python3 -m pytest test_detect_matting_mock.py -q
```
