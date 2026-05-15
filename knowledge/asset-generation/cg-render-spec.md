# cg-render-spec

Skill body for `intent.kind == "cg"` — a **CG beat**: an effect-driven
image or short loop showing a magical / dynamic / climactic moment. Used
for hero beats in short videos, comic key panels, or visual novel
"event CGs".

The cg-render pipeline originally lived in `moonshort-backend` (Python
`cg_render.py`). Phase 9 migrated it to `tools/cg-render/` and registered
a thin TypeScript wrapper as the atomic tool
[`cg-render`](../../agent/packages/opencode/src/tool/asset/cg-render.ts).
The wrapper accepts a single CG task per call, dispatches to the Python
script via subprocess, and returns the local image path. Phase 9+ wires
this into the asset-service mini agent loop in place of the Phase 8
placeholder generator.

## Intent

You are producing **a single CG image** (or, when explicitly asked, a
short MP4 loop) showing one decisive narrative beat. The output should:

- Carry strong directionality (motion lines, lighting beats, particle
  effects).
- Use the character and scene refs as visual anchors so the CG stays
  in-world.
- Be expressive but readable — silhouette + composition first, detail
  second.

## Atomic tools (allowed)

- **`cg-render` — primary.** Dispatches to `tools/cg-render/render.py`
  via subprocess. Input: `slug`, `cgName`, `prompt`, `panelCount`,
  `referenceImageUrls[]` (order matters — first ref is the style anchor),
  optional `model` / `assetsRoot` / `overwrite` / `mock` / `dryRun`.
  Output: local file path. Mock mode (`mock: true`) skips ZENMUX entirely
  and writes a 1×1 placeholder PNG — use it in CI and any time
  `ZENMUX_API_KEY` is not loaded.
- `generate-image-nanobanana` — **fallback** when cg-render is
  unavailable (no ZENMUX creds, Python venv not provisioned, or the
  caller wants a stylised CG still rather than the render-with-style
  pipeline output). Stitch refs into the prompt manually since this tool
  doesn't have the cg-render anchor-ordering convention.
- `generate-image-gpt` — alternate fallback for stills when both
  cg-render and nanobanana fall over.
- **`oss-put` — REQUIRED final step.** `cg-render` returns a *local
  file path*, never a URL. You MUST chain `oss-put` on that local path
  to obtain the permanent OSS https URL that is the actual deliverable.
  Skipping this step (returning the local path) is a failure — the
  downstream consumer cannot read a local path.

**Do not** call `generate-video-*` here unless the spec explicitly says
"animate this CG". CG short loops have their own pipeline (cg-render) —
this is not a generic video generation skill.

## Atomic tool input contract (cg-render)

The wrapper expects the loop to assemble this shape per call. The shape
mirrors `tools/cg-render/render.py`'s JSON entry — keep the keys
verbatim:

```json
{
  "slug": "silver-moon-manor",
  "cgName": "ep03_sylvia_glyph",
  "prompt": "Sylvia raises hand; silver glyph ignites at her fingertip.",
  "panelCount": 1,
  "referenceImageUrls": [
    "https://oss/styles/ya_impasto.png",
    "https://oss/sprites/sylvia.png"
  ],
  "model": "gemini-3.1-flash-image-preview",
  "mock": false
}
```

Map intent fields:
- `slug` ← `intent.key` first path segment (e.g. `ep_3/sylvia_glyph` →
  the surrounding project slug)
- `cgName` ← last segment of `intent.key`
- `prompt` ← composed from `intent.spec_md` + ref descriptors
- `referenceImageUrls` ← `intent.refs[]` urls, ordered style→character→scene

## Inputs

- `intent.spec_md` — CG beat description. Look for: focal subject
  (character / object / phenomenon), action verb (cast / strike /
  shatter / bloom), effect descriptors (particle, lighting, color),
  camera framing.
- `intent.refs[tag=="character"]` — character anchor refs.
- `intent.refs[tag=="scene"]` — scene anchor refs.
- `intent.refs[tag=="effect"]` — visual-effect refs (palette swatches,
  particle styles).
- `intent.constraints.ratio` — `"16:9"` (default) / `"9:16"`.
- `intent.constraints.duration_sec` — when present, produce an mp4 loop
  of that length (Phase 9 cg-render tool). Otherwise produce a still.

Example spec_md:

```
beat: Sylvia raises her right hand; a silver glyph ignites in the air
character: Sylvia (see ref)
location: cemetery hilltop (see ref)
effect: cool silver-blue magic glyph rotating slowly, faint particle
        drift, soft rim light on Sylvia from the glyph
camera: medium close, slight low angle on Sylvia, glyph centered
style: cinematic painterly with stronger color contrast than scene_bg
```

## Output shape

The `url` field below is **always the OSS https URL returned by
`oss-put`**, never `cg-render`'s local path. The delivery chain is:
`cg-render` → local path → `oss-put` → OSS https URL → emit below.

Still:

```json
{
  "ok": true,
  "atomic_tool": "cg-render",
  "url": "<oss url, image>",
  "ref_urls": ["<refs actually used>"],
  "langfuse_trace_id": "<trace id>"
}
```

Loop (when constraints.duration_sec set):

```json
{
  "ok": true,
  "atomic_tool": "cg-render",
  "url": "<oss url, mp4>",
  "ref_urls": [...],
  "langfuse_trace_id": "<trace id>",
  "asset_type": "video"
}
```

The orchestrator picks `Asset.type = "video"` when `asset_type` is
`"video"`, otherwise `"image"`.

## Failure handling

- **Content filter** on any atomic tool → `GENERATION_REJECTED`.
- **CG-render pipeline failure** (Python tool exit ≠ 0, render hang) →
  `ATOMIC_TOOL_FAILED` with the wrapped error message. Do not retry —
  cg-render runs are expensive. The wrapper surfaces Python's stderr
  envelope verbatim so the loop sees the structured `{code, message}`.
- **`oss-put` upload failure** (OSS auth/network/5xx, surfaced as the
  tool's `metadata.error`) → `ATOMIC_TOOL_FAILED`. Retry `oss-put`
  once; if it still fails, fail the job with the wrapped OSS error.
  NEVER substitute the local path for the URL to "succeed" — a
  local path is not a deliverable.
- **cg-render unavailable** (script path missing, Python interpreter not
  found, venv broken) → fall back to `generate-image-nanobanana` with
  the refs stitched into the prompt. Surface a warning event to Langfuse
  but do not fail the job.
- **Effect intent infeasible** (e.g. asked for water-effect on a still
  image of fire-based magic, plus refs are inconsistent) → first attempt
  with relaxed effect, surface as `GENERATION_REJECTED` if the LLM
  decides the spec is internally inconsistent.

## Boundary

- Just a character pose, no effect → `character-portrait-spec`.
- Just a background, no character / effect → `scene-bg-spec`.
- A specific shot in a video sequence with composited character +
  background, no special CG effect → `shot-image-from-mss`.
- Cover art with title text → `cover-spec`.
