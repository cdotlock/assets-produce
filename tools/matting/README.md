# matting

MODNet portrait alpha matting + green-screen unmix + alpha sharpen.
Produces an RGBA PNG/WebP from a green-screen source image using the v10
production pipeline (MODNet ∩ chromakey + connected-component filtering).

> Migrated 2026-05-16 from
> `moonshort-backend/generate-upscale-matting/matting.py`. Original is
> marked DEPRECATED there.

## Setup

```bash
cd tools/matting
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

MODNet repo + checkpoint (one-time, host-wide):

```bash
git clone https://github.com/ZHKKKe/MODNet.git ~/modnet
cd ~/modnet && mkdir -p pretrained
pip install gdown
gdown 'https://drive.google.com/uc?id=1mcr7ALciuAsHCpLnrtG_eop5-EYhbCmz' \
      -O pretrained/modnet_photographic_portrait_matting.ckpt
```

The default repo location is `~/modnet`. Override with the env var:

```bash
export MODNET_REPO_PATH=/path/to/modnet
```

## Entry — JSON mode (preferred)

```bash
python3 matting.py --input fixtures/matting-mock.json
# or stdin
cat fixtures/matting-mock.json | python3 matting.py --input -
```

Input shape:

```json
{
  "input_path":  "/abs/in.png",
  "output_path": "/abs/out_matted.png",
  "format":      "webp",
  "device":      "cpu",
  "overwrite":   false,
  "mock":        false
}
```

Output (stdout):

```json
{
  "output": {"path": "/abs/out_matted.png"},
  "meta": {
    "format": "webp",
    "device": "cpu",
    "latency_ms": 1043,
    "atomic_tool": "matting",
    "mock": false
  }
}
```

Errors go to **stderr** as `{"error":{"code":"...","message":"..."}}` with
exit codes:

| Code | Exit | Meaning |
|------|------|---------|
| `INVALID_INPUT` | 2 | bad/missing `input_path`, `output_path`, or `format`; output exists with `overwrite=false` |
| `ATOMIC_TOOL_FAILED` | 4 | MODNet repo/ckpt missing or inference failed |
| `INTERNAL` | 1 | unexpected exception |

## Mock mode

```bash
python3 matting.py --mock --input fixtures/matting-mock.json
```

Skips MODNet entirely and writes a tiny valid 1×1 RGBA PNG at `output_path`.
No torch, no venv, no MODNet ckpt needed — runs on plain `python3`. Used in
CI and for smoke-testing before the ML stack is installed.

## Legacy CLI

The original `main()` (single-file argparse CLI) is preserved for
back-compat with scripts that invoked `matting.py --src ... --dst ...`
directly. Trigger by NOT passing `--input` / `--mock` / `--json`:

```bash
python3 matting.py --src input.png --dst output.webp --fmt webp
python3 matting.py --src input.png --dst output.png --fmt png --overwrite
```

This path calls `load_modnet()` and requires the full ML stack.
