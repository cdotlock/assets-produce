# upscale

Real-ESRGAN ×4 upscale → ÷2 resize → 2× output, in-place under
`<output_path>`. Wraps the external `realesrgan-ncnn-vulkan` binary; the
Python side is a small driver. Net effect: 1× source → 2× sharpened PNG.

> Migrated 2026-05-15 from
> `lunaverse-backend/generate-upscale-matting/upscale.py`. Original is
> marked DEPRECATED there.

## Setup

```bash
cd tools/upscale
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Real-ESRGAN binary + models (one-time, host-wide):

```bash
mkdir -p ~/bin/realesrgan
# Download realesrgan-ncnn-vulkan binary + models into ~/bin/realesrgan/
# (See lunaverse-backend/generate-upscale-matting/upscale.py for the exact
# release artifact lunaverse-backend has been pinning.)
```

## Entry — JSON mode (preferred)

```bash
python upscale.py --input fixtures/upscale-mock.json
# or stdin
cat fixtures/upscale-mock.json | python upscale.py --input -
```

Input shape:

```json
{
  "input_path": "/abs/in.png",
  "output_path": "/abs/out_upscaled.png",
  "scale": 2,
  "model": "realesrgan-x4plus-anime",
  "overwrite": false,
  "mock": false
}
```

Output (stdout):

```json
{
  "output": {"path": "/abs/out_upscaled.png"},
  "meta": {"scale": 2, "model": "realesrgan-x4plus-anime", "latency_ms": 39120, "atomic_tool": "upscale-image", "mock": false}
}
```

Errors go to **stderr** as `{"error":{"code":"...","message":"..."}}` with
codes `INVALID_INPUT` / `ATOMIC_TOOL_FAILED` / `INTERNAL`.

## Mock mode

```bash
python upscale.py --mock --input fixtures/upscale-mock.json
```

Skips realesrgan entirely and writes a 1×1 placeholder PNG at
`output_path`. Use in CI / before the realesrgan binary is installed.

## Legacy bulk CLI

The original `main()` (book-slug-aware lunaverse-backend driver) lives
above the JSON entry. Trigger by NOT passing `--input` / `--mock` /
`--json`:

```bash
python upscale.py --book-slug no-rules-in-bad-ideas --only ep_sprites
```
