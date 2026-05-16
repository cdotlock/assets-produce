# green-spill-clear

Remove chromakey green-spill leak pixels from RGBA PNGs (numpy + Pillow, no ML).

Some sprites have visible green halos inside the silhouette after chromakey --
typically narrow gaps (between arm and torso, between legs) where HSV chromakey
skipped because saturation was too low. This tool detects opaque green-leaning
pixels (g > r+DELTA, g > b+DELTA, R+G+B >= BRIGHT_SUM) and zeros their alpha.

Atomic tool: ONE input file -> ONE output file. No directory walking, no
batch paths, no REPO_ROOT discovery.

> Migrated 2026-05-16 from
> `moonshort-backend/generate-upscale-matting/green_spill_clear.py`.
> Batch logic (--paths, --workers, ThreadPoolExecutor) removed entirely.
> Original is marked DEPRECATED there.

## Setup

```bash
cd tools/green-spill-clear
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Mock mode needs NO deps** -- mock runs on plain `python3` with no numpy or
Pillow (uses a hand-crafted 1x1 RGBA PNG via struct+zlib, identical to
`tools/matting`). Real green-spill clearing requires numpy + Pillow.

## Entry -- JSON mode (preferred)

```bash
python3 green-spill-clear.py --input fixtures/green-spill-clear-mock.json
# or stdin
cat fixtures/green-spill-clear-mock.json | python3 green-spill-clear.py --input -
```

Input shape:

```json
{
  "input_path":  "/abs/in.png",
  "output_path": "/abs/out.png",
  "delta":       5,
  "bright_sum":  400,
  "overwrite":   false,
  "mock":        false
}
```

Output (stdout):

```json
{
  "output": {"path": "/abs/out.png"},
  "meta": {
    "delta": 5,
    "bright_sum": 400,
    "latency_ms": 12,
    "atomic_tool": "green-spill-clear",
    "mock": false
  }
}
```

Errors go to **stderr** as `{"error":{"code":"...","message":"..."}}` with
exit codes:

| Code | Exit | Meaning |
|------|------|---------|
| `INVALID_INPUT` | 2 | bad/missing `input_path`/`output_path`; non-integer `delta`/`bright_sum`; output exists with `overwrite=false`; unwritable output dir |
| `ATOMIC_TOOL_FAILED` | 4 | numpy/Pillow processing error (corrupt source, I/O failure) |
| `INTERNAL` | 1 | unexpected exception |

## Environment variables

None. This tool has no ML model, no external service, no env-var-based config.

## Mock mode

```bash
python3 green-spill-clear.py --mock --input fixtures/green-spill-clear-mock.json
```

Writes a tiny valid 1x1 fully-transparent RGBA PNG at `output_path` using
stdlib `struct`+`zlib` only -- no numpy or Pillow required. Unlike
`tools/hybrid-to-webp` whose mock needs Pillow (no stdlib WebP encoder), this
tool's mock runs on plain `python3`.

## Explicit single-file CLI (back-compat)

```bash
python3 green-spill-clear.py --input in.png --output out.png \
    [--delta 5] [--bright-sum 400] [--overwrite]
```

Calls the same faithful `_clear_green_spill` helper as the JSON entry.
