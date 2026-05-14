# cg-render-spec

Skill body for `intent.kind == "cg"` — a **CG beat**: an effect-driven
image or short loop showing a magical / dynamic / climactic moment. Used
for hero beats in short videos, comic key panels, or visual novel
"event CGs".

The cg-render pipeline originally lived in `moonshort-backend` (Python
`cg_render.py`). Phase 9 migrates the underlying tool to
`tools/cg-render/`; this skill body wraps the future atomic tool. Until
Phase 9 lands, the placeholder generator returns a stub URL.

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

- `cg-render` (Phase 9; atomic-tool wrapper around the migrated Python
  `cg_render.py`) — default.
- `generate-image-gpt` — used to draft a still keyframe that the
  cg-render tool then animates / refines.
- `generate-image-nanobanana` — used for stylised CG stills when the
  cg-render tool isn't applicable.
- `oss-put` — upload the final image / mp4 to OSS.

**Do not** call `generate-video-*` here unless the spec explicitly says
"animate this CG". CG short loops have their own pipeline (cg-render) —
this is not a generic video generation skill.

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
- **CG-render pipeline failure** (Python tool 5xx, render hang) →
  `ATOMIC_TOOL_FAILED` with the wrapped error message. Do not retry —
  cg-render runs are expensive.
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
