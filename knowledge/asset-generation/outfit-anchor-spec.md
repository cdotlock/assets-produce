# outfit-anchor-spec

You are producing **one NRBI outfit anchor** (Layer A.5) — a neutral-pose
character立绘 that locks a specific outfit, used as the i2i reference for EP
sprites. Reachable via `skill_hint: outfit-anchor-spec` or the picker; it has
no AssetKind.

## Intent

The output should:
- Reproduce the NRBI demo anchor prompt byte-for-byte (the framework wording
  is fixed in the frozen render path — you only supply variable fields).
- Lock face + body from the series portrait (image-1) and only change the
  outfit; chromakey green background.

Route elsewhere if the request is a plain character portrait
(`character-portrait-spec`) or an EP sprite (`ep-sprite-spec`).

## Atomic tools (allowed)

- `nrbi-render-prompt` — assemble the anchor prompt. Call with
  `layer: "A5"`, `variable_text: { char_id, outfit_id, prompt }` (where
  `prompt` is the raw upstream anchor prompt for this char×outfit from the
  intent), and `reference_image_urls: [<series portrait OSS url>]` (the
  series portrait must already exist — request it first). The tool returns
  the final `prompt` + `model`; do not edit the returned wording.
- `generate-image-gpt` — pass the returned `prompt`, `reference_image_urls`,
  and `model` verbatim.
- `oss-put` — upload the final image bytes to OSS under the asset key.

**Do not** call video tools or other `generate-*` image tools, and **do not**
hand-write the framework prompt — `nrbi-render-prompt` owns it.

## Inputs

- `intent.spec_md` — carries `char_id`, `outfit_id`, and the raw anchor
  `prompt` for this outfit, plus the series-portrait OSS url under
  `intent.refs` (the upstream dependency you resolve first).

Example minimal spec_md:
```
char_id: selena
outfit_id: casual
anchor_prompt: |
  Korean manhwa illustration, full-body ... (verbatim upstream)
series_portrait_url: https://oss.example.com/character_selena.png
```

## Output shape

```json
{ "ok": true, "asset": { "ossUrl": "https://oss.example.com/anchor_selena_casual.webp" } }
```
The orchestrator writes an Asset row `type=image, kind=null (skill_hint), name=anchor_<char>_<outfit>`.

## Failure handling

- Missing series-portrait ref → `nrbi-render-prompt` (Layer A5 with empty
  refs still assembles, but the binder header is omitted); if the spec
  mandates a locked face, treat absent ref as `GENERATION_REJECTED`.
- `nrbi-render-prompt` non-zero exit → `ATOMIC_TOOL_FAILED` (surface stderr).

## Boundary

- Need a plain portrait → `character-portrait-spec`
- Need an EP sprite (per-beat pose/expression) → `ep-sprite-spec`
- Need a background → `scene-bg-spec`