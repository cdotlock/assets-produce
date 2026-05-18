# asset-generation skill bodies (Phase 8 draft)

This directory is the **local source of truth** for the five Phase 8 asset
generation skill bodies. They drive the mini agent loop that runs inside
`AssetService.runJob` — the LLM reads the picked skill body, then chooses
which atomic tool to call based on the spec_md / refs / constraints in the
incoming `AssetIntent`.

## Status

**Draft (Phase 8) → cg-render-spec is Phase 9 production-ready.** Per
master spec § 2 principle 4, skill bodies stay local until the user
explicitly requests an upload to Langfuse.

Phase 9 (2026-05-15) shipped the first concrete atomic-tool wiring: the
`cg-render` atomic tool is registered and the matching `cg-render-spec.md`
body has been rewritten to reference it (see § "Atomic tool input
contract" inside that file). The other four bodies still describe the
intended flow but call into Phase 8's placeholder generator until Phase
10+ replaces it with the real LLM-driven loop.

Phase 11 (2026-05-16) shipped two audio bodies: `sfx-spec` is
**production-ready**, backed by the real `generate-sfx-elevenlabs`
atomic tool (real ElevenLabs sound-generation → inline OSS upload →
permanent OSS mp3 URL). `music-spec` is a **deterministic placeholder**
per master spec §15 row 1.13 — Suno publishes no official first-party
API, so the real gateway integration is a deferred open item; the
backing `generate-music-suno` tool calls nothing, uploads nothing, and
returns a fixed placeholder with `metadata.placeholder: true`. The
`music-spec.md` body documents the placeholder state explicitly so the
loop treats a music result as "deferred", not as a hard failure.

Phase 12 (2026-05-16) closed asset-delivery URL parity: `cg-render` and
`upscale-image` now deliver a **permanent OSS https URL** by chaining
the `oss-put` atomic tool in their skill bodies (`cg-render-spec` /
`upscale-spec`), instead of returning a local filesystem path. `oss-put`
reuses the Phase 2 OSS service (no new env), so the loop's terminal
`url` for cg / upscale outcomes is now an OSS-served URL end to end.

Phase 13 (2026-05-17) migrated the backend image-processing suite from
`moonshort-backend` to `tools/` atomic tools. Two post-process skill bodies
are added to this directory: `matting-spec` documents the MODNet ML-based
alpha-matte pipeline and `cutout-spec` documents the HSV chromakey
green-screen pipeline; both chain `oss-put` as a mandatory final step for
OSS-URL delivery parity. Four sub-step tools (`hole-fill`, `green-spill-clear`,
`rgb-unspill`, `hybrid-to-webp`) are documented as optional chained repair /
encoding steps inside those two bodies — they have no standalone skill body.
The `detect-matting` CLI tool is CLI-only and has no skill body. **These two
bodies are NOT yet added to `ASSET_GENERATION_SKILLS` (picker registration
deferred / out of Phase-13 scope) — they are documented, not runtime-wired;**
the loop is still wired to the placeholder generator and does not consume them
at runtime yet.

The `intent-to-skill` resolver only needs the skill **names**, which are
baked into
`agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`
as `ASSET_GENERATION_SKILLS`:

- `character-portrait-spec`
- `scene-bg-spec`
- `cg-render-spec`
- `cover-spec`
- `shot-image-from-mss`
- `sfx-spec`
- `music-spec`
- `upscale-spec`

When the user runs (in a future phase) `agent skills sync
asset-generation`, the body markdown here gets pushed to Langfuse under the
canonical prompt name `skill_<name>` (e.g. `skill_character-portrait-spec`).
Until then the AssetService loop is wired to the **placeholder generator**
(see `wire.ts`) and does not actually consume these files at runtime.

## File layout

| File | Skill name | When the picker chooses it |
|---|---|---|
| `character-portrait-spec.md` | character-portrait-spec | intent.kind == "character_portrait" |
| `scene-bg-spec.md` | scene-bg-spec | intent.kind == "scene_bg" |
| `cg-render-spec.md` | cg-render-spec | intent.kind == "cg" |
| `cover-spec.md` | cover-spec | intent.kind == "cover" |
| `shot-image-from-mss.md` | shot-image-from-mss | intent.kind == "shot_image" OR "shot_video" |
| `sfx-spec.md` | sfx-spec | intent.kind == "sfx" |
| `music-spec.md` | music-spec | intent.kind == "music" |
| `upscale-spec.md` | upscale-spec | no AssetKind — selected via `skill_hint` / picker only (Phase 12 post-process body) |
| `matting-spec.md` | matting-spec | not picker-wired — documented Phase-13 post-process body; registration deferred |
| `cutout-spec.md` | cutout-spec | not picker-wired — documented Phase-13 post-process body; registration deferred |
| `outfit-anchor-spec.md` | outfit-anchor-spec | no AssetKind — B1 NRBI Layer A.5; selected via `skill_hint` / picker only |
| `ep-sprite-spec.md` | ep-sprite-spec | no AssetKind — B1 NRBI Layer E; selected via `skill_hint` / picker only |

## Conventions

Each skill body markdown follows the same shape so the LLM finds what it
needs in the same place every time:

1. **Intent** — what asset shape this skill produces.
2. **Atomic tools (allowed)** — explicit allowlist; the LLM must not call
   tools outside this set when running under this skill.
3. **Inputs** — what fields of the `AssetIntent` matter (spec_md, refs,
   constraints), with examples.
4. **Output shape** — what the loop's terminal `GenerationOutcome` should
   look like (`url`, `ref_urls`, `atomic_tool`).
5. **Failure handling** — content filter, atomic-tool failure, spec
   infeasible.
6. **Boundary** — when to defer to a different skill instead.

## Cross-references

- Master spec: `docs/superpowers/specs/2026-04-29-assets-produce-spec.md`
  (§ 5, § 11 Phase 8)
- Phase 8 design: `docs/superpowers/specs/2026-05-14-three-repo-asset-integration-design.md`
  (§ 5)
- Picker registry: `agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`
- Mini agent loop: `agent/packages/opencode/src/business/asset-service/run-asset-generation.ts`
