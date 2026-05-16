# hybrid-to-webp

Convert a MODNet-hybrid chromakey PNG to delivery WebP (PIL-only, no ML).

This is a thin PNG→WebP delivery encoder. Unlike to-final.py, it does NOT
apply the "last-gate" green-spill unspill pass — hybrid output's RGB is
already cleaned by `edge_decontaminate`, so re-applying `G := max(R,B)` would
destroy dark olive / dark green fabric color.

Atomic tool: ONE input file → ONE output file. No directory walking, no
book-slug logic, no REPO_ROOT discovery.

> Migrated 2026-05-16 from
> `moonshort-backend/generate-upscale-matting/_local_tools/hybrid_to_webp.py`.
> Path-walking / batch logic removed. Original is marked DEPRECATED there.

## Setup

```bash
cd tools/hybrid-to-webp
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**No ML stack required** — the only dependency is Pillow.

Note: unlike `tools/matting`, mock mode here also requires Pillow (there is no
standard-library WebP encoder). Both real and mock runs need the venv.

## Entry — JSON mode (preferred)

```bash
python3 hybrid-to-webp.py --input fixtures/hybrid-to-webp-mock.json
# or stdin
cat fixtures/hybrid-to-webp-mock.json | python3 hybrid-to-webp.py --input -
```

Input shape:

```json
{
  "input_path":  "/abs/in.png",
  "output_path": "/abs/out.webp",
  "quality":     90,
  "method":      6,
  "overwrite":   false,
  "mock":        false
}
```

Output (stdout):

```json
{
  "output": {"path": "/abs/out.webp"},
  "meta": {
    "quality": 90,
    "method": 6,
    "latency_ms": 12,
    "atomic_tool": "hybrid-to-webp",
    "mock": false
  }
}
```

Errors go to **stderr** as `{"error":{"code":"...","message":"..."}}` with
exit codes:

| Code | Exit | Meaning |
|------|------|---------|
| `INVALID_INPUT` | 2 | bad/missing `input_path`/`output_path`; output exists with `overwrite=false`; unwritable output dir |
| `ATOMIC_TOOL_FAILED` | 4 | Pillow encode error (corrupt source, I/O failure) |
| `INTERNAL` | 1 | unexpected exception |

## Environment variables

None. This tool has no ML model, no external service, no env-var-based config.

## Mock mode

```bash
python3 hybrid-to-webp.py --mock --input fixtures/hybrid-to-webp-mock.json
```

Writes a tiny valid 1×1 RGBA WebP at `output_path` using Pillow.

Note: unlike `tools/matting` whose mock runs on plain `python3` (no Pillow),
mock here still requires Pillow because there is no standard-library WebP
encoder. This is expected — Pillow is this tool's only runtime dep anyway.

## Legacy CLI (batch back-compat)

The original batch `main()` is preserved for scripts that invoked
`hybrid_to_webp.py --book-slug ...` directly. Trigger by NOT passing
`--input` / `--mock` / `--json`:

```bash
python3 hybrid-to-webp.py --book-slug <slug> [--overwrite] [--quality 90] [--method 6]
```
