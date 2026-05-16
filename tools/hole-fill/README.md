# hole-fill

Inpaint interior body-leak holes in chromakey RGBA images using cv2 TELEA inpainting and scipy connected-component analysis.

## What it does

After chromakey cutout, green pixels leaked onto the character body create see-through holes (alpha=0). This tool detects interior alpha=0 components NOT touching the image border whose size falls in `[min_size, max_size)` and inpaints them using OpenCV's TELEA algorithm.

- Components `< min_size` (default 200): noise, skipped
- Components in `[min_size, max_size)`: body leaks, inpainted
- Components `>= max_size` (default 8000): legitimate negative space (akimbo arms, between-legs gap), kept transparent

Idempotent: re-running on a hole-free image is a no-op.

## JSON entry (preferred)

```bash
python3 hole-fill.py --input fixtures/hole-fill-mock.json
cat fixtures/hole-fill-mock.json | python3 hole-fill.py --input -
```

### Input

```json
{
  "input_path":  "/abs/path/to/in.png",
  "output_path": "/abs/path/to/out.png",
  "dilate":      2,
  "min_size":    200,
  "max_size":    8000,
  "overwrite":   false
}
```

### Output (stdout)

```json
{
  "output": {"path": "/abs/path/to/out.png"},
  "meta": {
    "dilate":      2,
    "min_size":    200,
    "max_size":    8000,
    "latency_ms":  120,
    "atomic_tool": "hole-fill",
    "mock":        false
  }
}
```

## Explicit single-file CLI

```bash
python3 hole-fill.py \
  --input in.png \
  --output out.png \
  --dilate 2 \
  --min-size 200 \
  --max-size 8000 \
  --overwrite
```

## Environment variables

None required. All parameters passed via JSON input or CLI flags.

## Mock mode

```bash
python3 hole-fill.py --mock --input fixtures/hole-fill-mock.json
```

Mock writes a 1x1 RGBA placeholder PNG using stdlib `struct+zlib` only — **no cv2, scipy, numpy, or Pillow required** for mock mode. Useful in tests and CI without the full OpenCV/scipy stack.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 2 | `INVALID_INPUT` — bad/missing fields, non-integer numeric params, output exists with overwrite=false, unwritable output dir |
| 4 | `ATOMIC_TOOL_FAILED` — cv2/scipy/Pillow processing error |
| 1 | `INTERNAL` — unexpected exception |

## Dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Mock mode needs **no deps** (stdlib-only). Real inpainting needs: `opencv-python`, `numpy`, `Pillow`, `scipy`.

## Tests

```bash
cd tools/hole-fill
python3 -m pytest test_hole_fill_mock.py -q
```
