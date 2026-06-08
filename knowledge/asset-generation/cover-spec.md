# cover-spec

Skill body for `intent.kind == "cover"` — a **cover / promo art** image
used for the title screen, episode cover, or marketing material of a
project. Title typography, character framing, and tone-setting visual
hierarchy are all in scope here.

## Intent

You are producing **one promo-ready image** that:

- Reads at thumbnail size (silhouette + dominant color contrast).
- Carries the project's title (when `intent.constraints.title` is set,
  render legible text; otherwise leave space for title overlay added in
  post).
- Strongly conveys the project's genre and mood within 500ms of viewing.
- Targets the platform-specific aspect ratio (vertical for short-video
  apps; horizontal for trailer thumbnails; square for some social
  surfaces).

Covers are **not** episode shots. Don't try to depict a specific scene
from the story; depict the project's identity.

## Atomic tools (allowed)

- `generate-image-gpt` — preferred when the cover needs **inline title
  text** with crisp typography. GPT image models render text more
  reliably than nanobanana.
- `generate-image-nanobanana` — preferred when the cover is text-free /
  text-overlay-in-post, and the style is stylised illustration.
- `oss-put` — upload final cover image to OSS.

**Do not** call video / CG tools here. Animated covers are a separate
future skill (not in Phase 8 scope).

## Inputs

- `intent.spec_md` — should describe: genre (action / romance / horror /
  slice-of-life / comedy / drama), primary subjects (character / object
  / symbol), focal color palette, mood adjectives, intended platform.
- `intent.refs[tag=="character"]` — hero character refs.
- `intent.refs[tag=="style"]` — palette / typographic-style refs.
- `intent.constraints.ratio` — `"9:16"` (TikTok-style), `"16:9"`
  (YouTube-style), `"1:1"` (Instagram-style), `"2:3"` (book cover).
  Default to `"9:16"` if absent.
- `intent.constraints.title` — optional text the LLM should render in
  the image. Pass it verbatim to `generate-image-gpt`.

Example spec_md:

```
project: Silver Moon (银月)
genre: dark romance with supernatural overtones
hero: Sylvia, silver-haired, formal cloak (see ref)
mood: melancholic, mysterious, faint warmth
palette: deep indigo, silver, hint of amber from a single light source
platform: vertical short-video (9:16)
title: "银月" (rendered in image, centered upper third, serif)
hook line below title: "她为亡者点亮最后一盏灯"
```

## Output shape

```json
{
  "ok": true,
  "atomic_tool": "generate-image-gpt",
  "url": "<oss url>",
  "ref_urls": ["<refs used>"],
  "langfuse_trace_id": "<trace id>"
}
```

The orchestrator writes the Asset row with `type="image"`,
`kind="cover"`, and `name=intent.name`. If the cover is the project's
canonical cover, callers usually pass `key="cover/main"` and
`name="<project title> 主封面"`.

## Failure handling

- **Title text garbled** (when `constraints.title` was set and the
  rendered text is illegible) → 1 retry on the same atomic tool with a
  simplified prompt. On second miss, return successfully with the image
  and a note in `meta` — the caller can overlay title in post; covers
  are still useful without inline text.
- **Content filter** → `GENERATION_REJECTED`.
- **Atomic tool failure** → `ATOMIC_TOOL_FAILED`.
- **Style mismatch with refs** → 1 retry on the alternate atomic tool,
  then `GENERATION_REJECTED` if still off.

## Boundary

- Character alone, no cover styling → `character-portrait-spec`.
- Scene background → `scene-bg-spec`.
- Climactic in-story beat → `cg-render-spec`.
- A specific shot in a video / comic → `shot-image-from-ls`.
