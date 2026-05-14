# shot-image-from-mss

Skill body for `intent.kind == "shot_image"` and `intent.kind ==
"shot_video"` — produce a **single shot** in a video / comic sequence,
where "shot" means one composed frame (or short clip) showing the
specific action / framing called for by an `asset_ref` in a
moonshort-script (MSS) document.

This is the most common asset kind during the novels-to-moonscript →
moonshort-backend → assets-produce pipeline. MSS authors mark
`asset_ref` nodes with a `name` and a `kind` of either `shot_image` or
`shot_video`; the moonshort-backend resolver eventually calls
`POST /api/v1/assets/create` with that intent, and this skill drives the
mini agent loop that turns the asset_ref into an OSS URL.

## Intent

You are producing **one shot** that:

- Composites the indicated character (`refs[tag=="character"]`) into the
  indicated background (`refs[tag=="scene"]`).
- Carries out the action verb in the spec (standing / running / talking
  / watching / pointing / etc.).
- Stays consistent with the project's overall style and prior shots.
- Falls into the same `key` family as other shots in the same scene
  (e.g. `ep_3/shot_001`, `ep_3/shot_002`).

For `shot_video` you produce a short clip (animated) of the same beat.

## Atomic tools (allowed)

- For `kind == "shot_image"`:
  - `generate-image-nanobanana` — default. Good for action moments and
    composed scenes.
  - `generate-image-gpt` — fallback / alternate model.
  - `oss-put` — upload.
- For `kind == "shot_video"`:
  - `generate-video-seedance` — default for cinematic short clips.
  - `generate-video-happyhorse` — alternate / fallback for Kling-style
    motion.
  - `crop-video` — trim to `constraints.duration_sec`.
  - `oss-put` — upload final mp4.

Do not call `cg-render` here — that's `cg-render-spec`'s territory.

## Inputs

- `intent.spec_md` — the asset_ref's `note` / `prompt` field from the
  MSS document. Look for: action verb, blocking, framing, dialogue
  intent.
- `intent.refs[tag=="character"]` — character立绘 references resolved
  from upstream Asset rows by the MSS asset-ref resolver.
- `intent.refs[tag=="scene"]` — scene_bg references.
- `intent.refs[tag=="prior_shot"]` — earlier shots in the same scene
  for continuity.
- `intent.constraints.ratio` — usually `"9:16"` (TikTok-style) or
  `"16:9"` (YouTube). Default to `"9:16"`.
- `intent.constraints.duration_sec` — only for `shot_video`. Default
  `5` seconds if absent. Hard cap at `20`.

Example spec_md (shot_image):

```
shot: Sylvia stands at the cemetery gate, facing the camera
character: Sylvia (see ref)
scene: cemetery gate, blue hour (see ref)
framing: medium shot, eye-level, slight off-center to the left
lighting: cool sodium streetlamp behind her, faint warm rim from below
expression: looking just past the camera, weight slightly on the right foot
beats: she is about to step forward but hasn't yet
```

Example spec_md (shot_video):

```
shot: Sylvia opens her hand; a silver feather drifts down
character: Sylvia
scene: cemetery hilltop, blue hour
duration: 6 seconds
camera: static, slight breathing
motion: feather drifts diagonally across frame from upper right to lower
        left; Sylvia's eyes follow it
```

## Output shape

shot_image:

```json
{
  "ok": true,
  "atomic_tool": "generate-image-nanobanana",
  "url": "<oss png url>",
  "ref_urls": ["<all refs actually used>"],
  "langfuse_trace_id": "<trace id>"
}
```

shot_video:

```json
{
  "ok": true,
  "atomic_tool": "generate-video-seedance",
  "url": "<oss mp4 url>",
  "ref_urls": [...],
  "langfuse_trace_id": "<trace id>",
  "asset_type": "video"
}
```

The orchestrator picks `Asset.type = "video"` when `asset_type` is
`"video"`, otherwise `"image"`. `kind` is recorded as `shot_image` /
`shot_video` per the original intent.

## Failure handling

- **Content filter** → `GENERATION_REJECTED`.
- **Character likeness collapse** (character ref provided but the
  output character looks different) → 1 retry on the alternate atomic
  tool with stronger character-ref weighting. On second miss, return
  `GENERATION_REJECTED` with `character drift` reason.
- **Scene inconsistency** (background mismatch with provided scene ref)
  → similar 1-retry policy. After two failed attempts, return
  `GENERATION_REJECTED`.
- **Video too long / too short** → `crop-video` to fit
  `constraints.duration_sec`. If duration cannot be met after crop
  (e.g. video model returned 2s when the spec wants 10s), return
  `GENERATION_REJECTED`.
- **Atomic tool 5xx** → `ATOMIC_TOOL_FAILED`.

## Boundary

- Character alone, no scene → `character-portrait-spec`.
- Scene alone, no character / shot framing → `scene-bg-spec`.
- A CG beat with effects → `cg-render-spec`.
- A project cover / promo → `cover-spec`.
