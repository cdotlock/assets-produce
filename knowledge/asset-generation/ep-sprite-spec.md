# ep-sprite-spec

You are producing **one NRBI EP sprite** (Layer E) — a per-beat character
立绘 with a specific expression/pose, i2i-locked to the series portrait
(image-1) and the outfit anchor. Reachable via `skill_hint: ep-sprite-spec`
or the picker; it has no AssetKind.

## Intent

The output should:
- Reproduce the NRBI demo sprite prompt byte-for-byte (anchor-locked branch
  when an upstream sprite prompt is provided; legacy build_sprite_text
  branch otherwise — `nrbi-render-prompt` decides).
- Keep face + outfit identical to the references; change only
  expression/pose; chromakey green.

Route elsewhere for portraits (`character-portrait-spec`), anchors
(`outfit-anchor-spec`), or backgrounds (`scene-bg-spec`).

## Atomic tools (allowed)

- `nrbi-render-prompt` — assemble the sprite prompt. Call with
  `layer: "E"`, `variable_text: { char_id, sprite_id, prompt }` (or
  `orig_prompt` for the legacy path), and `reference_image_urls` ordered
  **[series portrait url, outfit anchor url]** — this is REQUIRED; Layer E
  fails fast without it (canonical Don't: series portraits before sprites).
  Use the returned `prompt`/`model` verbatim.
- `generate-image-gpt` — pass the returned `prompt`,
  `reference_image_urls`, `model` verbatim.
- `oss-put` — upload the final bytes to OSS.

**Do not** hand-write the framework prompt or call video / other image-gen
tools.

## Inputs

- `intent.spec_md` — carries `char_id`, `sprite_id`, the upstream sprite
  `prompt`, and `intent.refs` with the series-portrait + anchor OSS urls
  (resolved upstream first).

Example minimal spec_md:
```
char_id: selena
sprite_id: ep3_beat7_smile
sprite_prompt: |
  参考图1 ... 改神态为微笑 ... (verbatim upstream)
series_portrait_url: https://oss.example.com/character_selena.png
anchor_url: https://oss.example.com/anchor_selena_casual.png
```

## Output shape

```json
{ "ok": true, "asset": { "ossUrl": "https://oss.example.com/ep3_beat7_smile.webp" } }
```
Orchestrator writes Asset `type=image, kind=null (skill_hint), name=<sprite_id>`.

## Failure handling

- Empty `reference_image_urls` → `nrbi-render-prompt` exits 2
  `INVALID_INPUT` → map to `GENERATION_REJECTED`.
- `nrbi-render-prompt` non-zero exit → `ATOMIC_TOOL_FAILED`.
- Model safety reject (extra hands / wrong outfit) happens at
  `generate-image-gpt` — retry / re-roll per existing loop guidance.

## Boundary

- Need the outfit-locked neutral anchor → `outfit-anchor-spec`
- Need the series identity portrait → `character-portrait-spec`
- Need a scene → `scene-bg-spec`