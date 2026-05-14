# scene-bg-spec

Skill body for `intent.kind == "scene_bg"` — a **background plate** for a
scene: location, environment, lighting, atmosphere. No characters in
focus. Used as a substrate that other shots (with characters) composite
onto, or directly as an establishing-shot image.

## Intent

You are producing **one wide environment image**. The output should:

- Establish a location at a specific time of day / weather / mood.
- Leave foreground space for a character to be composited later (when
  `intent.constraints.background_kind` says so).
- Match style refs in `refs[tag=="style"]`.
- Be consistent across scenes: if the project has earlier scene_bg
  images for the same location key prefix (e.g. `ep_3/scene_cemetery/*`),
  prefer using one as a reference rather than re-imagining.

## Atomic tools (allowed)

- `generate-image-nanobanana` — first choice for stylised painterly
  backgrounds.
- `generate-image-gpt` — fallback / alternate model when nanobanana
  produces flat backgrounds and the spec calls for photographic / cinematic
  realism.
- `oss-put` — upload the final image to OSS.

**Do not** call `generate-video-*` here even if the spec mentions
animation — that's `shot-image-from-mss`'s territory.

## Inputs

- `intent.spec_md` — should describe: location type (interior /
  exterior / liminal), time of day, weather, lighting, mood / palette,
  camera angle (eye-level / low / high / aerial).
- `intent.refs[tag=="style"]` — style sheet images for consistency.
- `intent.refs[tag=="location"]` — earlier scene_bg from the same
  location, if any. Use as direct visual anchor.
- `intent.constraints.ratio` — usually `"16:9"` or `"21:9"` for
  cinematic backgrounds. Default to `"16:9"`.
- `intent.constraints.background_kind` — optional hint:
  - `"with_character_space"` — leave a clear focal area for a character
    composite (rule-of-thirds left or right).
  - `"establishing"` — no character will be composited; you can fill
    the frame.
  - `null` — treat as `"establishing"`.

Example spec_md:

```
location: abandoned cemetery on a hillside outside the city
time: blue hour, just after sunset
weather: light fog rolling between gravestones
lighting: cool sodium streetlamp in the distance, indigo sky overhead
mood: somber, faintly melancholic
camera: low angle, slight tilt, foreground gravestones in focus
style: cinematic painterly, muted palette, soft brush
```

## Output shape

```json
{
  "ok": true,
  "atomic_tool": "generate-image-nanobanana",
  "url": "<oss url>",
  "ref_urls": ["<style refs used>", "<location anchor refs used>"],
  "langfuse_trace_id": "<trace id>"
}
```

Asset row written: `type="image"`, `kind="scene_bg"`,
`name=intent.name ?? null`.

## Failure handling

- **Content filter** → `GENERATION_REJECTED`, do not retry.
- **Mood collapse** (image returned but tonal mismatch e.g. cheerful
  when spec asked for somber) → 1 retry on the alternate model;
  on second miss, return `GENERATION_REJECTED` with `mood drift` reason.
- **Atomic tool failure** → `ATOMIC_TOOL_FAILED`.

## Boundary

- Need a scene with a character _in_ it → `shot-image-from-mss`.
- Need a character standalone → `character-portrait-spec`.
- Need a CG with magical / dynamic effects (lightning, magic circles) →
  `cg-render-spec`, even if the focus is environmental.
- Need a marketing cover with title text → `cover-spec`.
