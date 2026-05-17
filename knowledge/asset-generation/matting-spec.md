# matting-spec

Skill body for **ML-based foreground matting** — producing an
alpha-transparent cutout of the foreground subject from one existing image
via MODNet. Layer C of the asset pipeline: portrait / object matting for
composite work (visual novel sprites, key-art overlays, character sticker
packs, promo composites).

The matting pipeline originally lived in `moonshort-backend`
(`generate-upscale-matting/matting.py`, MODNet). Phase 13 migrated it to
`tools/matting/` and registered a thin TypeScript wrapper as the atomic tool
[`matting`](../../agent/packages/opencode/src/tool/asset/matting.ts).
The wrapper dispatches to `tools/matting/matting.py` via subprocess and
returns a **local file path**. This Phase-13 skill body adds `oss-put`
delivery parity so the loop's terminal `url` for a matting outcome is an
OSS-served URL, matching the contract of other asset skills.

This skill is **not its own `AssetKind`** — matting is post-processing of an
existing image, not content generation. It has no `DEFAULT_KIND_SKILL_MAP`
entry and is **not yet added to the `ASSET_GENERATION_SKILLS` picker
allowlist** (registration deferred — out of Phase-13 scope). The loop is
still wired to the placeholder generator and does not consume this body at
runtime yet. The body is documented here for the future phase that wires
it, matching the pattern of the other Phase-8 draft bodies in this directory.

## Intent

You are producing **a single alpha-transparent cutout of one image that
already exists**. The output should:

- Segment the foreground subject (person, character, object) cleanly from
  the background using MODNet's neural matting.
- Output a transparent-background WebP (default) or PNG with accurate alpha
  at the subject boundary — preserving fine detail such as hair and fabric
  edges where possible.
- Preserve the subject's original color and composition exactly — you are
  matting, not re-imagining content, adjusting colors, or generating new
  visual information.

You are **not** generating new content here — there is no prompt, no style
transfer, no refs. If the intent is "make a new character image", this is the
wrong skill (see Boundary).

## Atomic tools (allowed)

- **`matting` — primary.** Dispatches to `tools/matting/matting.py` via
  subprocess (MODNet). Required inputs: `inputPath` (absolute local path to
  source image), `outputPath` (absolute local path the matted cutout lands
  at). Optional: `format` (`"webp"` default — smaller, lossless alpha; or
  `"png"` when a downstream compositor requires PNG), `device` (`"cpu"`
  default; pass `"cuda"` or `"mps"` when a GPU is available), `overwrite`
  (bool, default false), `mock` (bool — writes a 1×1 RGBA placeholder PNG,
  no GPU or MODNet weights required; use in CI), `dryRun` (bool). Output: a
  **local file path**, never a URL.

- **`hole-fill` — optional repair sub-step.** After matting, interior
  alpha=0 regions that should be opaque (body-leak holes where the
  chromakey bled through) can be inpainted. Required inputs: `inputPath`
  (RGBA PNG from the previous step), `outputPath`. Optional: `dilate`
  (dilation radius in px before inpaint, default 2), `minSize` (ignore
  components smaller than this — noise floor, default 200), `maxSize`
  (preserve components >= this as legitimate negative space such as
  between-limbs gaps, default 8000), `overwrite`, `mock`, `dryRun`.
  Apply when the spec calls for clean interior fill or the matted image
  is known to have body-leak holes from a prior chromakey pass.

- **`green-spill-clear` — optional repair sub-step.** Removes residual
  green-spill pixels (opaque pixels where green still dominates R and B).
  Required inputs: `inputPath`, `outputPath`. Optional: `delta` (green
  dominance threshold; `g > r+delta AND g > b+delta` to qualify as leak,
  default 5), `brightSum` (minimum R+G+B sum to count as a leak — excludes
  dark green clothing/fabric, default 400), `overwrite`, `mock`, `dryRun`.
  Apply when the source had a green-screen backing and residual green leak
  pixels remain after matting.

- **`rgb-unspill` — optional repair sub-step.** Applies Nuke-style G-channel
  RGB decontamination: clamps G to max(R, B) on every alpha>0 pixel where
  G exceeds both R and B. No tunable numeric parameters — the unspill
  condition is fixed. Required inputs: `inputPath`, `outputPath` (extension
  determines output format — `.png` → PNG, `.webp` → WebP quality=90
  method=4). Optional: `overwrite`, `mock`, `dryRun`. Apply as a softer
  alternative or complement to `green-spill-clear` when a more conservative
  decontamination is preferred (alpha is never modified).

- **`hybrid-to-webp` — optional encoding sub-step.** Converts the processed
  RGBA PNG to a delivery WebP using Pillow. Required inputs: `inputPath`
  (RGBA PNG), `outputPath` (WebP path). Optional: `quality` (0–100, default
  90), `method` (0=fast … 6=best/slowest, default 6), `overwrite`, `mock`,
  `dryRun`. Apply when the final deliverable must be WebP and an earlier
  repair step produced a PNG intermediate. Do **not** use this in place of
  `matting`'s native `format: "webp"` output if no repair steps were needed
  — the native path is more direct.

- **`oss-put` — REQUIRED final step.** Every tool above returns a *local
  file path*, never a URL. You MUST chain `oss-put` on the local path
  of the last step in the chain to obtain the permanent OSS https URL
  that is the actual deliverable. The delivery chain is mandatory:
  `matting` (+ optional repair/encode sub-steps) → local path → `oss-put`
  → OSS https URL. Skipping `oss-put` and returning a local path is a
  **failure** — the downstream consumer cannot read a local path. There is
  no exception: even in mock mode the local placeholder path must still be
  passed through `oss-put`.

This skill is **post-processing of an existing image**. Do **not** call
`generate-image-nanobanana`, `generate-image-gpt`, `cg-render`, or any
`generate-*` tool here — those produce new content and are out of scope for
a matting job.

## Inputs

- `intent.spec_md` — should identify: the source image (a reference or local
  path), the desired output format (WebP default / PNG), whether repair
  sub-steps are needed (hole-fill, spill removal, unspill), and the inference
  device if non-default.
- The source image reference — resolved to an absolute local path for
  `inputPath`. Matting always operates on an already-materialised file;
  if only a URL is available it must be fetched to a local path first.
- `intent.constraints.format` — `"webp"` or `"png"` when present; default
  `"webp"`.
- `intent.constraints.device` — `"cpu"` (default) / `"cuda"` / `"mps"`.
- There are **no** `refs` and **no** prompt for a matting job — ignore
  ref-driven fields that other skills consume.

Example spec_md:

```
source: ep_3/sprites/sylvia_greenscreen.png (existing sprite, 1024×1536)
goal: ML alpha-matte foreground; remove background for composite use
format: webp (lossless alpha, delivery)
device: cpu
repair: apply hole-fill (body-leak expected); apply rgb-unspill (green tint)
constraint: preserve hair edges; do not alter subject color
```

## Output shape

The `url` field below is **always the OSS https URL returned by `oss-put`**,
never any intermediate tool's local path. The delivery chain is:
`matting` (+ optional sub-steps) → local path → `oss-put` → OSS https URL →
emit below. A result whose `url` is a local filesystem path is invalid.

```json
{
  "ok": true,
  "atomic_tool": "matting",
  "url": "<oss url, image/webp or image/png>",
  "format": "webp",
  "langfuse_trace_id": "<trace id>"
}
```

The orchestrator writes the Asset row with `type="image"` — a matting result
is always a still image, never video. `name` follows `intent.name ?? null`.

## Failure handling

- **`matting` failure** (Python tool exit ≠ 0, MODNet weights missing, venv
  broken, subprocess fails to start) → in CI / when the weights are known
  to be unavailable, retry once with `mock: true` so the pipeline stays
  unblocked; otherwise return `ATOMIC_TOOL_FAILED` with the wrapped stderr
  envelope. Do **not** blindly retry a real MODNet run — matting is
  compute-intensive and a clean failure is better than a retry storm.
- **Invalid format** (the wrapper rejects any `format` other than `"webp"`
  or `"png"`) → this is a contract error in the assembled input. Re-derive
  `format` from the intent (clamp to a valid value); do not retry the same
  bad value.
- **Repair sub-step failure** (`hole-fill` / `green-spill-clear` /
  `rgb-unspill` / `hybrid-to-webp` exits ≠ 0) → return `ATOMIC_TOOL_FAILED`
  with the wrapped stderr. In CI retry with `mock: true`. Do not skip a
  mandatory repair step and pass a partial result to `oss-put`.
- **`oss-put` upload failure** (OSS auth / network / 5xx, surfaced as the
  tool's `metadata.error`) → retry `oss-put` once; if it still fails, fail
  the job with the wrapped OSS error. NEVER substitute the local path for
  the URL to "succeed" — a local path is not a deliverable.

## Boundary

- Generating a **new** character image from a prompt → `character-portrait-spec`.
- Generating a new scene background → `scene-bg-spec`.
- Upscaling an existing image to higher resolution → `upscale-spec`.
- Green-screen HSV chromakey (non-ML, no MODNet weights) → `cutout-spec`.
- Producing a CG effect beat → `cg-render-spec`.
- Cover / promo art with title text → `cover-spec`.
