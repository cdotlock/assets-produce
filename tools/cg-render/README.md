# cg-render

Layer-B of the CG pipeline: render one .webp per `cg_task` via ZENMUX
(google-genai) using a style anchor + character anchor reference image set,
then return a local file path. The opencode atomic tool
[`cg-render`](../../agent/packages/opencode/src/tool/asset/cg-render.ts)
wraps this script with a JSON schema, OSS download/upload, and tests.

> Migrated 2026-05-15 from
> `lunaverse-backend/generate-upscale-matting/cg_render.py` +
> `render-with-style.py`. Originals are marked DEPRECATED there.

## Setup

```bash
cd tools/cg-render
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Entry — JSON mode (preferred)

```bash
python render.py --input fixtures/cg-input.json
# or via stdin
cat fixtures/cg-input.json | python render.py --input -
```

Input shape:

```json
{
  "task": {
    "cg_name": "ep03_sylvia_glyph",
    "render_mode": "image",
    "model": "gemini-3.1-flash-image-preview",
    "panel_count": 1,
    "prompt": "Sylvia raises her hand; silver glyph ignites.",
    "reference_image_urls": [
      "https://oss.example.com/styles/yA_impasto.png",
      "https://oss.example.com/sprites/sylvia.png"
    ]
  },
  "slug": "silver-moon-manor",
  "assets_root": "/tmp/cg-out",
  "overwrite": false,
  "mock": false
}
```

Output (stdout):

```json
{
  "outputs": [{"path": "/tmp/cg-out/silver-moon-manor/cg/ep03_sylvia_glyph.webp", "kind": "image"}],
  "meta": {"model": "gemini-3.1-flash-image-preview", "latency_ms": 4123, "atomic_tool": "cg-render", "mock": false}
}
```

Errors go to **stderr** as `{"error":{"code":"...","message":"..."}}` with
codes: `INVALID_INPUT` / `NOT_IMPLEMENTED` / `ATOMIC_TOOL_FAILED` /
`INTERNAL`. Non-zero exit code is set in lock-step.

## Mock mode

```bash
python render.py --mock --input fixtures/cg-input.json
```

Skips every external call (ZENMUX, SSH tunnel to style PG, OSS) and writes a
1x1 placeholder PNG to the resolved output path so atomic-tool wrappers can
still round-trip OSS PUT in test environments. Always use `--mock` in CI.

## Environment

Real (non-mock) mode reads these from the environment. Mock mode reads none.

| Variable | Purpose |
|---|---|
| `ZENMUX_API_KEY` | ZENMUX (google-genai) auth — keyring fallback is also tried |
| `ZENMUX_BASE_URL` | Defaults to ZENMUX's production endpoint (set in render-with-style.py) |
| `ASSETS_ROOT` | Default output directory when `payload.assets_root` is omitted |
| Style PG SSH tunnel creds | Stored in keyring; see `render-with-style.py` for keys |

## Legacy bulk CLI

The original `cg_render.py` driver lives at the bottom of `render.py` —
invoked via `python render.py --slug … --tasks-json …`. Kept intact for
operators that still drive the legacy backend layout. Any new caller should
go through the JSON entry above (the atomic-tool wrapper does).
