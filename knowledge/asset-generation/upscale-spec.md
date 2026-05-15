# upscale-spec

Skill body for **image super-resolution / upscaling** — producing a
higher-resolution version of an *existing* raster asset (a sprite, CG
still, scene background, cover) so it holds up at print size or as a
hero / banner crop. This is **post-processing**, not generation: the
input is an image that already exists; the output is the same image at
2× or 4× the pixel dimensions.

Upscale is deliberately **not its own `AssetKind`** (Phase 12 decision —
"upscale 是后处理，不单独成 kind"). It has no `DEFAULT_KIND_SKILL_MAP`
entry, so it is **never** reached by the tier-3 deterministic
kind→skill fallback. It *is* registered in the `ASSET_GENERATION_SKILLS`
picker allowlist, so it is reachable via a tier-1 `skill_hint` or a
tier-2 picker selection — the picker rejects any skill name not in that
allowlist. It is not auto-selected from a `kind`; a caller asking to
upscale an existing image selects it explicitly.

The `upscale-image` pipeline originally lived in `moonshort-backend`
(Python `upscale.py`, Real-ESRGAN). Phase 9 migrated it to
`tools/upscale/` and registered a thin TypeScript wrapper as the atomic
tool
[`upscale-image`](../../agent/packages/opencode/src/tool/asset/upscale-image.ts).
The wrapper dispatches to the Python script via subprocess and returns a
**local file path**. Phase 12 adds this skill body so the deliverable is
brought to OSS-URL parity with the other asset skills.

## Intent

You are producing **a single higher-resolution copy of one image that
already exists**. The output should:

- Preserve the source composition, palette, and subject exactly — you
  are scaling pixels, not re-imagining content.
- Increase resolution by a clean factor (2× or 4×) suitable for the
  intended downstream use (print, hero banner, large crop).
- Use the anime-tuned Real-ESRGAN model by default; only override the
  model when the source is photographic and the spec says so.

You are **not** generating new content here — there is no prompt, no
refs, no style transfer. If the intent is "make a *new* image", this is
the wrong skill (see Boundary).

## Atomic tools (allowed)

- **`upscale-image` — primary.** Dispatches to `tools/upscale/upscale.py`
  via subprocess (Real-ESRGAN). Input: `inputPath` (absolute local path
  to the source PNG), `outputPath` (absolute local path the upscaled PNG
  lands at), `scale` (2 or 4), optional `model` / `overwrite` / `mock` /
  `dryRun`. Output: a **local file path**, never a URL. Mock mode
  (`mock: true`) skips Real-ESRGAN entirely and writes a 1×1 placeholder
  PNG — use it in CI and any time the Real-ESRGAN binary is not
  installed.
- **`oss-put` — REQUIRED final step.** `upscale-image` returns a *local
  file path*, never a URL. You MUST chain `oss-put` on that local path
  to obtain the permanent OSS https URL that is the actual deliverable.
  The delivery chain is mandatory: `upscale-image` → local path →
  `oss-put` → OSS https URL. Skipping `oss-put` and returning the local
  path is a **failure** — the downstream consumer cannot read a local
  path. There is no exception: even in mock mode the local placeholder
  path must still be passed through `oss-put`.

This skill is **post-processing of an existing image**. Do **not** call
`generate-image-nanobanana`, `generate-image-gpt`, `cg-render`, or any
`generate-*` tool here — those produce new content and are out of scope
for an upscale job.

## Atomic tool input contract (upscale-image)

The wrapper expects the loop to assemble this shape per call. Keep the
keys verbatim — they map straight onto the tool's `Parameters` schema:

```json
{
  "inputPath": "/work/assets/ep_3/sprites/sylvia.png",
  "outputPath": "/work/assets/ep_3/sprites/sylvia@4x.png",
  "scale": 4,
  "model": "realesrgan-x4plus-anime",
  "overwrite": false,
  "mock": false
}
```

Map intent fields:
- `inputPath` ← the source image's absolute local path (resolve the
  intent's source-image reference to a local path first)
- `outputPath` ← the chosen target path (convention: same directory,
  suffix the scale, e.g. `name@4x.png`)
- `scale` ← `2` or `4` from the intent's desired resolution; the tool
  rejects any other value
- `model` ← leave default (`realesrgan-x4plus-anime`) unless the source
  is photographic and the spec asks for a general model
- `mock` ← `true` only in CI / before the Real-ESRGAN binary is
  installed; `false` for real runs

## Inputs

- `intent.spec_md` — should identify: the source image (a reference or
  local path), the desired upscale factor or target resolution, and any
  constraint (e.g. "anime model", "do not change aspect ratio").
- The source image reference — resolved to an absolute local path for
  `inputPath`. Upscale always operates on an already-materialised file;
  if only a URL is available, it must be fetched to a local path first.
- `intent.constraints.scale` — `2` or `4` when present; default to `2`.
- There are **no** `refs` and **no** prompt for an upscale job — ignore
  ref-driven fields that other skills consume.

Example spec_md:

```
source: ep_3/sprites/sylvia.png (existing sprite, 1024×1536)
goal: 4× upscale for a print-resolution character standee
factor: 4
model: realesrgan anime (default — source is illustrated, not photo)
constraint: keep aspect ratio; do not alter colors or composition
```

## Output shape

The `url` field below is **always the OSS https URL returned by
`oss-put`**, never `upscale-image`'s local path. The delivery chain is:
`upscale-image` → local path → `oss-put` → OSS https URL → emit below.
A result whose `url` is a local filesystem path is invalid.

```json
{
  "ok": true,
  "atomic_tool": "upscale-image",
  "url": "<oss url, image>",
  "scale": 4,
  "langfuse_trace_id": "<trace id>"
}
```

The orchestrator writes the Asset row with `type="image"` — an upscale
result is always a still image, never video. `name` follows
`intent.name ?? null`.

## Failure handling

- **`upscale-image` failure** (Python tool exit ≠ 0, Real-ESRGAN binary
  missing, venv broken, subprocess fails to start) → in CI / when the
  binary is known to be unavailable, retry once with `mock: true` so the
  pipeline stays unblocked; otherwise return `ATOMIC_TOOL_FAILED` with
  the wrapped stderr envelope. Do **not** blindly retry a real
  Real-ESRGAN run — upscaling is expensive and a clean failure is
  better than a retry storm.
- **Invalid scale** (the tool rejects any `scale` other than 2 or 4) →
  this is a contract error in the assembled input, not a model failure.
  Re-derive `scale` from the intent (clamp to 2 or 4); do not retry the
  same bad value.
- **`oss-put` upload failure** (OSS auth / network / 5xx, surfaced as
  the tool's `metadata.error`) → retry `oss-put` once; if it still
  fails, fail the job with the wrapped OSS error. NEVER substitute the
  local path for the URL to "succeed" — a local path is not a
  deliverable.

## Boundary

- Generating a **new** image from a prompt → the relevant generate /
  render skill (`scene-bg-spec`, `cover-spec`, …), not this skill.
- Producing a CG effect beat (motion, particles, magic) →
  `cg-render-spec`.
- A standalone character pose / portrait → `character-portrait-spec`.
- Cover / promo art with title text → `cover-spec`.
- A specific shot composited from character + background →
  `shot-image-from-mss`.
