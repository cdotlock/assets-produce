# cutout-spec

Skill body for **HSV chromakey green-screen cutout** — producing an
alpha-transparent RGBA PNG from a flat-green-background character or sprite
image using numpy + Pillow HSV thresholding. No ML weights required. Used
when the source image was shot against a green screen and the background
removal must be fast, deterministic, and reproducible.

The cutout pipeline originally lived in `lunaverse-backend`
(`generate-upscale-matting/cutout.py`). Phase 13 migrated it to
`tools/cutout/` and registered a thin TypeScript wrapper as the atomic tool
[`cutout`](../../agent/packages/opencode/src/tool/asset/cutout.ts).
The wrapper dispatches to `tools/cutout/cutout.py` via subprocess and
returns a **local RGBA PNG path**. This Phase-13 skill body adds `oss-put`
delivery parity so the loop's terminal `url` for a cutout outcome is an
OSS-served URL, matching the contract of other asset skills.

This skill is **not its own `AssetKind`** — chromakey cutout is
post-processing of an existing image, not content generation. It has no
`DEFAULT_KIND_SKILL_MAP` entry and is **not yet added to the
`ASSET_GENERATION_SKILLS` picker allowlist** (registration deferred — out of
Phase-13 scope). The loop is still wired to the placeholder generator and
does not consume this body at runtime yet. The body is documented here for
the future phase that wires it, matching the pattern of the other Phase-8
draft bodies in this directory.

## Intent

You are producing **a single RGBA PNG cutout of one green-screen image that
already exists**. The output should:

- Remove the flat green background via HSV thresholding — pixels whose hue
  falls in `[hueLow, hueHigh]` degrees and whose saturation ≥ `satMin` and
  value ≥ `valMin` are set to alpha 0; all other pixels keep alpha 255.
- Optionally feather the alpha edge with a Gaussian blur of radius `feather`
  px to soften the silhouette boundary.
- Preserve the subject's original RGB values exactly — only alpha is written.
- Be RGBA-aware and idempotent: if the input is already RGBA, the output
  alpha is `min(new_alpha, old_alpha)`, so re-running on a previously-cut
  image cannot resurrect the green screen even if the thresholds change.

You are **not** generating new content here — there is no prompt, no style
transfer, no refs. If the intent is "make a new character image", this is the
wrong skill (see Boundary). If the source image does not have a flat green
background and requires ML-based matting, use `matting-spec` instead.

## Atomic tools (allowed)

- **`cutout` — primary.** Dispatches to `tools/cutout/cutout.py` via
  subprocess (numpy + Pillow HSV chromakey). Required inputs: `inputPath`
  (absolute local path to the source green-screen PNG, RGB or RGBA),
  `outputPath` (absolute local path the RGBA cutout PNG should land at).
  Optional: `hueLow` (lower hue bound in degrees, default 80), `hueHigh`
  (upper hue bound in degrees, default 160), `satMin` (min saturation on a
  0..1 scale, default 0.30), `valMin` (min value on a 0..1 scale, default
  0.25), `feather` (Gaussian blur radius in px applied to the alpha edge, 0
  disables, default 0.8), `overwrite` (bool, default false), `mock` (bool —
  writes a 1×1 RGBA placeholder via stdlib, no numpy/Pillow required; use in
  CI), `dryRun` (bool). Output: a **local RGBA PNG path**, never a URL.
  Output is always PNG regardless of input format; the cutout tool does not
  produce WebP directly.

- **`hole-fill` — optional repair sub-step.** After chromakey, interior
  alpha=0 regions that should be opaque (body-leak holes from the green
  backing bleeding through clothing or semi-transparent areas) can be
  inpainted using OpenCV TELEA. Required inputs: `inputPath` (RGBA PNG from
  the cutout step), `outputPath`. Optional: `dilate` (dilation radius in px
  before inpaint, default 2), `minSize` (ignore components smaller than this
  — noise floor, default 200), `maxSize` (preserve components >= this as
  legitimate negative space such as between-limbs gaps, default 8000),
  `overwrite`, `mock`, `dryRun`. Apply when the spec calls for clean interior
  fill or the source is known to have body-leak holes.

- **`green-spill-clear` — optional repair sub-step.** Removes residual
  green-spill pixels: opaque pixels where `g > r+delta AND g > b+delta AND
  a > 0 AND R+G+B >= brightSum` are zeroed (alpha and RGB set to 0). Required inputs:
  `inputPath`, `outputPath`. Optional: `delta` (green dominance threshold,
  default 5), `brightSum` (minimum R+G+B sum — excludes dark green
  clothing/fabric, default 400), `overwrite`, `mock`, `dryRun`. Apply when
  residual green leak pixels remain along the subject boundary after the
  cutout step.

- **`rgb-unspill` — optional repair sub-step.** Applies Nuke-style G-channel
  RGB decontamination: clamps G to max(R, B) on every alpha>0 pixel where G
  exceeds both R and B. No tunable numeric parameters. Required inputs:
  `inputPath`, `outputPath` (extension determines output format — `.png` →
  PNG, `.webp` → WebP quality=90 method=4). Optional: `overwrite`, `mock`,
  `dryRun`. Apply as a softer alternative or complement to `green-spill-clear`
  when a conservative decontamination is preferred — the unspill clamp is
  gentler than zeroing the pixel entirely. Alpha is never modified.

- **`hybrid-to-webp` — optional encoding sub-step.** Converts a processed
  RGBA PNG to a delivery WebP using Pillow. Required inputs: `inputPath`
  (RGBA PNG), `outputPath` (WebP path). Optional: `quality` (0–100, default
  90), `method` (0=fast … 6=best/slowest, default 6), `overwrite`, `mock`,
  `dryRun`. Apply when the final deliverable must be WebP. Note: `cutout`
  always outputs PNG; if the spec requires a WebP delivery file, chain
  `hybrid-to-webp` (or `rgb-unspill` with a `.webp` `outputPath`) as the
  final encoding step before `oss-put`.

- **`oss-put` — REQUIRED final step.** Every tool above returns a *local
  file path*, never a URL. You MUST chain `oss-put` on the local path of
  the last step in the chain to obtain the permanent OSS https URL that is
  the actual deliverable. The delivery chain is mandatory:
  `cutout` (+ optional repair/encode sub-steps) → local path → `oss-put`
  → OSS https URL. Skipping `oss-put` and returning a local path is a
  **failure** — the downstream consumer cannot read a local path. There is
  no exception: even in mock mode the local placeholder path must still be
  passed through `oss-put`.

This skill is **post-processing of an existing image**. Do **not** call
`generate-image-nanobanana`, `generate-image-gpt`, `cg-render`, or any
`generate-*` tool here — those produce new content and are out of scope for
a chromakey cutout job.

## Inputs

- `intent.spec_md` — should identify: the source image (a reference or local
  path, green-screen PNG), the desired HSV thresholds if non-default, the
  feather radius, and which repair sub-steps are needed.
- The source image reference — resolved to an absolute local path for
  `inputPath`. Cutout always operates on an already-materialised file; if
  only a URL is available it must be fetched to a local path first.
- `intent.constraints.hueLow` / `hueHigh` / `satMin` / `valMin` / `feather`
  — override defaults when the spec provides tuned threshold values.
- There are **no** `refs` and **no** prompt for a cutout job — ignore
  ref-driven fields that other skills consume.

Example spec_md:

```
source: ep_3/sprites/sylvia_greenscreen.png (green-screen sprite, 1024×1536)
goal: HSV chromakey cutout; remove flat green background
thresholds: hueLow=80 hueHigh=160 satMin=0.30 valMin=0.25 feather=0.8 (defaults)
repair: apply hole-fill (body-leak expected); apply green-spill-clear
output_format: webp (chain hybrid-to-webp after repair)
constraint: preserve hair edges; do not alter subject RGB
```

## Output shape

The `url` field below is **always the OSS https URL returned by `oss-put`**,
never any intermediate tool's local path. The delivery chain is:
`cutout` (+ optional sub-steps) → local path → `oss-put` → OSS https URL →
emit below. A result whose `url` is a local filesystem path is invalid.

```json
{
  "ok": true,
  "atomic_tool": "cutout",
  "url": "<oss url, image/png or image/webp>",
  "langfuse_trace_id": "<trace id>"
}
```

The orchestrator writes the Asset row with `type="image"` — a cutout result
is always a still image, never video. `name` follows `intent.name ?? null`.

## Failure handling

- **`cutout` failure** (Python tool exit ≠ 0, numpy/Pillow not installed,
  venv broken, subprocess fails to start) → in CI / when the venv is known
  to be unavailable, retry once with `mock: true` so the pipeline stays
  unblocked; otherwise return `ATOMIC_TOOL_FAILED` with the wrapped stderr
  envelope. Cutout is fast (no ML), so a retry with adjusted thresholds is
  reasonable if the initial threshold set is clearly wrong for the source
  image.
- **Invalid threshold range** (the spec provides nonsensical HSV bounds, e.g.
  `hueLow > hueHigh`) → this is a contract error in the assembled input.
  Re-derive the threshold values from the intent; do not retry the same
  invalid configuration.
- **Repair sub-step failure** (`hole-fill` / `green-spill-clear` /
  `rgb-unspill` / `hybrid-to-webp` exits ≠ 0) → return `ATOMIC_TOOL_FAILED`
  with the wrapped stderr. In CI retry with `mock: true`. Do not skip a
  requested repair step and pass a partial result to `oss-put`.
- **`oss-put` upload failure** (OSS auth / network / 5xx, surfaced as the
  tool's `metadata.error`) → retry `oss-put` once; if it still fails, fail
  the job with the wrapped OSS error. NEVER substitute the local path for
  the URL to "succeed" — a local path is not a deliverable.

## Boundary

- The source image has a complex or natural background (not a flat green
  screen) and requires ML-based segmentation → `matting-spec`.
- Generating a **new** character image from a prompt → `character-portrait-spec`.
- Generating a new scene background → `scene-bg-spec`.
- Upscaling an existing image to higher resolution → `upscale-spec`.
- Producing a CG effect beat → `cg-render-spec`.
- Cover / promo art with title text → `cover-spec`.
