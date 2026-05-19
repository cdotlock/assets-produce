# asset-generation skill bodies

This directory holds the **git-canonical** asset-generation skill bodies.
They drive the real Phase-14 LLM mini agent loop inside
`AssetService.runJob` — the LLM reads the picked skill body, then chooses
which allowlisted atomic tool to call based on the spec_md / refs /
constraints in the incoming `AssetIntent`.

## Loading model (spec §15 r1.17 — Langfuse-`production`-first)

The production loader (`langfuse-skill-loader.ts`, wired in `wire.ts`)
resolves a picked skill body as:

1. **Langfuse `production` label** for `skill_<name>` — if present, used
   (its allowlist is parsed by the EXACT same `skill-source.parseAllowlist`
   the loop runs);
2. **miss / error / timeout / missing creds → this directory** —
   `knowledge/asset-generation/<name>.md` is the git-canonical source,
   offline fallback, and first-push seed. **Langfuse being unreachable
   NEVER hard-fails a job.**

A short in-process TTL cache (`ASSETS_SKILL_LANGFUSE_TTL_MS`, default
60000ms) keeps Langfuse off the per-job hot path; a Langfuse hot-edit to
`production` propagates in ~1 TTL.

This realigns with master spec §2 原则 4 / §5.2 (Langfuse storage was the
original design; the earlier local-only state was §15 r1.14 deferred
debt) — it is **not** an overturn. The Phase-14 real loop is unchanged;
only the body *source* gained a Langfuse-first layer.

### label convention + promote gate (D5/D7)

- `production` = what the runtime loader reads. `staging` = where edits
  land first. promote = repoint `production` at a validated version
  inside Langfuse (native, no code change — §5.2).
- `agent skills sync asset-generation --label staging|production` pushes
  these git bodies to Langfuse. Pushing `--label production` runs a
  **promote gate**: a body whose allowlist parses to 0 known atomic tools
  is refused *before any write* (pointing production at an infeasible
  body would reject every creator of that kind).

### git is still canonical — re-flow discipline (D2/D3)

Editing in Langfuse counts as a hotfix: the change MUST be re-flowed back
into this directory's git file. CI / local runs
`agent skills sync asset-generation --check` as a drift sentinel — it
compares git vs Langfuse `production`, writes nothing, and exits non-zero
on any drift or unreachable Langfuse.

## Registered skills

`agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`
`ASSET_GENERATION_SKILLS` (12 entries; the loop only needs the names):

- `character-portrait-spec`, `scene-bg-spec`, `cg-render-spec`,
  `cover-spec`, `shot-image-from-mss`, `sfx-spec`, `music-spec`
- `upscale-spec` (Phase 12 post-process — no AssetKind)
- `matting-spec`, `cutout-spec` (Phase 13 bodies, **registered in
  Phase 14** per spec §15 r1.14 — reachable via skill_hint / picker)
- `outfit-anchor-spec`, `ep-sprite-spec` (B1 NRBI render bodies,
  spec §15 r1.15 — no AssetKind)

`music-spec` is a deterministic placeholder (spec §15 r1.13 — Suno has
no official API; `generate-music-suno` returns `metadata.placeholder:
true`, treated as deferred success, never a hard failure). All other
registered bodies drive real atomic tools end to end.

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
| `upscale-spec.md` | upscale-spec | no AssetKind — `skill_hint` / picker only (Phase 12 post-process) |
| `matting-spec.md` | matting-spec | no AssetKind — `skill_hint` / picker only (Phase 13 body, registered Phase 14) |
| `cutout-spec.md` | cutout-spec | no AssetKind — `skill_hint` / picker only (Phase 13 body, registered Phase 14) |
| `outfit-anchor-spec.md` | outfit-anchor-spec | no AssetKind — `skill_hint` / picker only (B1 NRBI, spec §15 r1.15) |
| `ep-sprite-spec.md` | ep-sprite-spec | no AssetKind — `skill_hint` / picker only (B1 NRBI, spec §15 r1.15) |

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
