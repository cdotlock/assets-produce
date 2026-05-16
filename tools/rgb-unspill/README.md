# rgb-unspill

Nuke-style G-channel decontamination (RGB unspill) on chromakey RGBA images
(numpy + Pillow, no ML).

After cutout + green_spill_clear, edge-band pixels and interior bounce-light
pixels still hold green-polluted RGB. This tool clamps the green channel to
`max(R, B)` for every alpha>0 pixel where `G > max(R, B)`. Only the G channel
changes; alpha is untouched so the silhouette is identical. Idempotent.

Atomic tool: ONE input file -> ONE output file. No directory walking, no
batch paths, no REPO_ROOT discovery.

> Migrated 2026-05-16 from
> `moonshort-backend/generate-upscale-matting/rgb_unspill.py`.
> Batch logic (--root, --paths, --workers, --dry-run, ThreadPoolExecutor,
> directory walk) removed entirely. Atomic tool preserves the per-file
> unspill algorithm verbatim.

## Setup

```bash
cd tools/rgb-unspill
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Mock mode for `.png` output needs NO deps** -- uses a hand-crafted 1x1 RGBA
PNG via stdlib `struct`+`zlib` (same as `tools/matting` and
`tools/green-spill-clear`). Mock mode for `.webp` output requires Pillow
(no stdlib WebP encoder -- same pattern as `tools/hybrid-to-webp`). Real
unspill processing requires numpy + Pillow.

## Entry -- JSON mode (preferred)

```bash
python3 rgb-unspill.py --input fixtures/rgb-unspill-mock.json
# or stdin
cat fixtures/rgb-unspill-mock.json | python3 rgb-unspill.py --input -
```

Input shape:

```json
{
  "input_path":  "/abs/in.png",
  "output_path": "/abs/out.png",
  "overwrite":   false,
  "mock":        false
}
```

`output_path` extension determines the output format: `.png` -> PNG, `.webp`
-> WEBP (quality=90, method=4 -- matching the backend's save kwargs).

Output (stdout):

```json
{
  "output": {"path": "/abs/out.png"},
  "meta": {
    "format":      "png",
    "latency_ms":  12,
    "atomic_tool": "rgb-unspill",
    "mock":        false
  }
}
```

Errors go to **stderr** as `{"error":{"code":"...","message":"..."}}` with
exit codes:

| Code | Exit | Meaning |
|------|------|---------|
| `INVALID_INPUT` | 2 | bad/missing `input_path`/`output_path`; unsupported output extension; output exists with `overwrite=false`; unwritable output dir |
| `ATOMIC_TOOL_FAILED` | 4 | numpy/Pillow processing error (corrupt source, I/O failure) |
| `INTERNAL` | 1 | unexpected exception |

## Environment variables

None. This tool has no ML model, no external service, no env-var-based config.

## Mock mode

```bash
python3 rgb-unspill.py --mock --input fixtures/rgb-unspill-mock.json
```

Writes a tiny valid 1x1 fully-transparent RGBA placeholder at `output_path`.
- `.png` output: stdlib `struct`+`zlib` -- no numpy or Pillow required.
- `.webp` output: Pillow -- required because stdlib has no WebP encoder.

Mock bypasses reading the real `input_path` (works even if the input file
does not exist).

## Explicit single-file CLI (back-compat)

```bash
python3 rgb-unspill.py --input in.png --output out.png [--overwrite]
```

Calls the same faithful `_unspill` helper as the JSON entry. Output format
resolved from `--output` extension (`.png` or `.webp`).
