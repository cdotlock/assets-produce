# character-portrait-spec

Skill body for `intent.kind == "character_portrait"` — a single-character
立绘 (full-body or half-body) used as a stable visual reference across
chapters / shots in a comic, short video, or visual novel.

## Intent

You are producing **one image of one character**. The output should:

- Show exactly one character in a single, clearly readable pose.
- Match the project's style direction encoded in `spec_md` and `refs`.
- Be reusable: minimal background, neutral lighting unless the spec asks
  otherwise.
- Sit at the version-controlled asset key the caller gave you. Future
  iterations bump the version via `key`-collision on Asset.

If the caller wants a scene with a character in it, route to
`scene-bg-spec` or `shot-image-from-ls` instead — those skills know how
to compose multiple characters and a background.

## Atomic tools (allowed)

- `nrbi-render-prompt` — when the request is an NRBI series character
  (Layer A), assemble the prompt with `layer: "A"`,
  `variable_text: { orig_prompt: <upstream appearance prompt>, subject_id:
  <char_id> }`. Use the returned `prompt`/`model` verbatim, then
  `generate-image-gpt`. For non-NRBI portraits, skip this and use the
  image-gen tools directly.
- `generate-image-nanobanana` — default first choice; cheaper and faster.
  Good for stylised illustration. Pass `style_refs` from
  `refs[].kind=="image"` entries that carry `tag=="style"`.
- `generate-image-gpt` — fallback when nanobanana keeps producing
  off-style outputs (e.g. character-likeness collapse) or when the spec
  needs precise text rendering / instructions a GPT image model handles
  better.
- `oss-put` — upload the final image bytes to OSS under the asset key.

**Do not** call video tools (`generate-video-*`, `concat-clips`,
`crop-video`) under this skill.

## Inputs

- `intent.spec_md` — the brief. Look for character name, gender, age,
  outfit, signature features, pose, expression.
- `intent.refs` — array of `{kind, url, tag}`. `tag=="style"` images are
  style references (palette, line work). `tag=="character"` are
  character references (face / outfit consistency).
- `intent.constraints.ratio` — usually `"2:3"` or `"9:16"`. Default to
  `"2:3"` if absent.
- `intent.name` — if present, that's the stable lookup label callers
  use later (e.g. "Sylvia 立绘"). Echo it back on the Asset row.

Example minimal spec_md:

```
character: Sylvia
age: late-20s
hair: silver, shoulder-length, slight wave
outfit: black formal cloak with silver clasp; high-collar shirt underneath
pose: standing, three-quarter view, arms relaxed
expression: composed, faint half-smile
style: contemporary Korean webtoon, soft cell shading
```

## Output shape

Terminal `GenerationOutcome`:

```json
{
  "ok": true,
  "atomic_tool": "generate-image-nanobanana",
  "url": "<oss url returned by oss-put>",
  "ref_urls": ["<oss urls of any reference images you actually used>"],
  "langfuse_trace_id": "<trace id>"
}
```

The orchestrator writes the Asset row with `type="image"`,
`kind="character_portrait"`, and `name=intent.name`.

## Failure handling

- **Content filter / safety reject** from the image atomic tool → return
  `{ok: false, code: "GENERATION_REJECTED", message: "<reason>"}`. Do
  not retry — caller decides whether to revise spec_md.
- **Style drift** (image returned but visibly off-style after 1 retry on
  the alternate tool) → return `{ok: false, code: "GENERATION_REJECTED",
  message: "style drift; consider providing stronger refs"}`.
- **Atomic tool 5xx / transient** → fail with `code: "ATOMIC_TOOL_FAILED"`.
  The job ends; caller can re-create.
- **Step budget exhausted** is automatic — orchestrator handles it.

## Boundary

- Need a scene with character + background composed together →
  `scene-bg-spec` if the background is the focus, `shot-image-from-ls`
  if it's a specific shot in a video / comic.
- Need a CG (effect-heavy, particle / lighting beats) →
  `cg-render-spec`.
- Need a cover / promo art (title text, key composition) →
  `cover-spec`.
