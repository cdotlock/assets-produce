# `tools/` — External asset-production utilities

This directory holds Python tools migrated from
`moonshort-backend/generate-upscale-matting/`. They sit outside the opencode
runtime intentionally: the originals stay Python because re-writing
`render-with-style.py` (~74 KB of SSH-tunnel + PG + Google GenAI logic) in
TypeScript would be a rewrite without a payoff. Wrapping is enough.

> **Phase ref:** Phase 9 — Asset Tool Migration. See
> [`docs/superpowers/specs/phase-9-asset-tools-migration-plan.md`](../docs/superpowers/specs/phase-9-asset-tools-migration-plan.md).
>
> **Phase ref:** Phase 13 — Image Processing Tool Migration. See
> [`docs/superpowers/specs/phase-13-image-processing-migration-plan.md`](../docs/superpowers/specs/phase-13-image-processing-migration-plan.md).

## Subdirectories

| Tool | Purpose | atomic tool? | Entry |
|---|---|---|---|
| [`cg-render/`](cg-render/) | CG image render via ZENMUX / google-genai (Layer B of CG pipeline) | yes — `cg-render` | `render.py --input <json>` |
| [`oss-sync/`](oss-sync/) | Idempotent bulk upload of local `final/` directories to OSS | **no** (offline CLI) | `sync.py --input <json>` or flag-form |
| [`upscale/`](upscale/) | Real-ESRGAN x4 → resize /2 in-place upscaling | yes — `upscale-image` | `upscale.py --input <json>` |
| [`matting/`](matting/) | MODNet ML background removal → transparent RGBA cutout (WebP/PNG) | yes — `matting` | `matting.py --input <json>` |
| [`cutout/`](cutout/) | HSV chroma-key green-screen removal → RGBA cutout PNG | yes — `cutout` | `cutout.py --input <json>` |
| [`hole-fill/`](hole-fill/) | cv2 TELEA inpainting — fills interior alpha=0 holes in RGBA images | yes — `hole-fill` | `hole-fill.py --input <json>` |
| [`green-spill-clear/`](green-spill-clear/) | numpy/PIL green-spill suppression on RGBA images | yes — `green-spill-clear` | `green-spill-clear.py --input <json>` |
| [`rgb-unspill/`](rgb-unspill/) | numpy/PIL G-channel clamp to remove green contamination from RGB | yes — `rgb-unspill` | `rgb-unspill.py --input <json>` |
| [`hybrid-to-webp/`](hybrid-to-webp/) | Pillow PNG→WebP re-encode with configurable quality/method | yes — `hybrid-to-webp` | `hybrid-to-webp.py --input <json>` |
| [`detect-matting/`](detect-matting/) | numpy/PIL/scipy matting-quality PASS/FAIL judgement report (no image output) | **no** (offline CLI) | `detect-matting.py --input <json>` |

## Conventions

- **One venv per tool**, located at `tools/<name>/.venv/`. Gitignored. Each
  tool has its own `requirements.txt` — installing the union of all of them
  into one venv would cause version conflicts (oss2 vs google-genai vs PIL
  pins disagree).
- **JSON entry**: every tool's main script accepts either `--input
  <path-to-json>` or JSON on stdin, and writes JSON to stdout. Anything else
  (progress, logs, warnings) goes to stderr — never mix into stdout.
- **Errors**: non-zero exit + a stderr JSON `{"error":{"code":"...",
  "message":"..."}}`. Codes are tool-specific; the atomic-tool wrappers in
  `agent/packages/opencode/src/tool/asset/` map them onto the FC-client
  error vocabulary.
- **No silent OSS uploads from inside a tool** (except `oss-sync` itself).
  Tools output local file paths; the atomic-tool wrapper does the OSS PUT
  through the existing `oss-put` helper.
- **Mock mode**: every tool understands `--mock` and produces a deterministic
  output without calling real external services. Used by tests + by
  `agent serve` smoke checks before real creds are in place.
- **Env injection from `.env`**: scripts read `os.environ[...]`; tests set
  fixtures via env, never hardcode keys.

## Atomic-tool registration

`cg-render` and `upscale-image` register in the opencode tool table via
`agent/packages/opencode/src/tool/asset/`. They're discoverable through
`agent tools list` / `agent tools show <name>` and routable from the mini
agent loop's skill bodies (see
[`knowledge/asset-generation/`](../knowledge/asset-generation/)).

The six Phase-13 image-processing tools — `matting`, `cutout`, `hole-fill`,
`green-spill-clear`, `rgb-unspill`, and `hybrid-to-webp` — also register in
the opencode tool table via `agent/packages/opencode/src/tool/asset/` and are
discoverable through `agent tools list` / `agent tools show <id>`. See
[`knowledge/asset-generation/matting-spec.md`](../knowledge/asset-generation/matting-spec.md)
and [`knowledge/asset-generation/cutout-spec.md`](../knowledge/asset-generation/cutout-spec.md)
for the skill bodies that describe how these tools chain together.

`oss-sync` deliberately does **not** register — it's an operator-only
utility (the LLM has no business deciding to bulk-upload a directory). Call
it directly from the shell when you need it.

`detect-matting` deliberately does **not** register for the same
detection/judgement reason as `oss-sync`: it emits a PASS/FAIL quality report
about an already-matte image, not an asset. The LLM must not call it
autonomously. Invoke it directly from the shell when you need a quality check.

## Setup (per tool)

```bash
cd tools/<name>
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Smoke:
python <entry>.py --mock --input fixtures/<entry>-input.json
```

Replace `--mock` with real inputs once credentials are loaded into the
environment (see each tool's `README.md` for the env vars it reads).
