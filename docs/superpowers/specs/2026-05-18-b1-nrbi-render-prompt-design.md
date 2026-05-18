# B1 — NRBI Phase-1 Render-Prompt Wiring (Design)

> **Status:** approved design (brainstorming complete). Next: writing-plans.
> **Spec linkage:** main spec `2026-04-29-assets-produce-spec.md` §15 revision **r1.15**.
> **Not a numbered phase** — user-requested follow-up to the style-prompts corpus
> migration (`knowledge/style-prompts/`, committed `d4035cc`/`21890a3`).

---

## 1. Goal (one sentence)

Wire the migrated NRBI prompt corpus into assets-produce's real generation path
as a **deterministic atomic tool** that byte-faithfully reproduces NRBI demo
Phase-1 prompt assembly, fully self-maintained (local `styles.json`, no remote
PG / SSH / MCP, no moonshort-backend dependency).

## 2. Background — the NRBI "v10" standard pipeline

Authoritative process doc: `moonshort-backend/.claude/skills/generate-asset/SKILL.md`
(read-only reference; NOT modified by B1). NRBI art production = **3 phases**:

| Phase | What | assets-produce status |
|---|---|---|
| **Phase 1 render** | `render-with-style.py`: pick style row from `styles` table by category → fill template → apply deterministic reinforcement (green-screen `#00FF00`, sprite 硬约束, anchor lock, grid refill) → hand prompt to image model → green-screen raw image | ❌ **missing — this is B1** |
| Phase 2 upscale | Real-ESRGAN ×4 → ÷2 | ✅ `upscale-spec` (Phase 12) |
| Phase 3 matte+deliver | "V10" = MODNet + 4-step post-process → WebP Q90; scene = opaque copy | ✅ Phase 13 matting/cutout + `oss-put` (Phase 12) |

"v10" specifically names the **Phase-3 image post-processing** standard
(`moonshort-backend/generate-upscale-matting/matting.py` `V10_*` constants),
already ported into assets-produce Phase 13 (`tools/matting/matting.py`,
`GREEN_SCREEN_RGB=(0,255,0)` = `#00FF00`). Therefore the green-screen hex is
**not an open question**: B1 reproduces `render-with-style.py`'s post-rewrite
output (`#00FF00`), which is what NRBI actually shipped and what Phase-13
matting/cutout expects as input. The `#00B140` in raw upstream
`anchor_spec.py` / 06 templates is a stale value that `render-with-style.py`
already rewrites away (`clean_anchor_prompt` / `clean_sprite_prompt`).

**Iron rule** (from the canonical doc "Don'ts"): the prompt lives in the style
DB (migrated → `knowledge/style-prompts/source-of-record/styles.json`); the
renderer does **not** tweak prompt wording — it only orchestrates the template
fill and applies the fixed deterministic reinforcement blocks. B1 preserves
this exactly.

## 3. Decisions locked in brainstorming

| # | Decision | Value |
|---|---|---|
| D1 | Fidelity bar | **Strict reproduction** — byte-identical to NRBI; deterministic code assembly; LLM only fills the variable appearance/scene text |
| D2 | Scope | **Full set** — Layer A (series character), A.5 (outfit anchor), B (scene grid), C (scene square), D (scene variant), E (ep sprite) |
| D3 | Green hex | `#00FF00` — settled by the V10 standard (already canonical in Phase 13), reproduce `render-with-style.py` post-rewrite output |
| D4 | Assembler implementation | **Frozen-Python subprocess** — new atomic tool shells the verbatim `render-with-style.py` prompt-assembly code (byte-identity by construction); same pattern as `cg-render` |
| D5 | AssetKind | **No new AssetKinds** — register new skill bodies in `ASSET_GENERATION_SKILLS`, skill_hint-driven (Phase 12/13 no-kind precedent) |
| D6 | Style reference images | Use the remote Aliyun OSS URLs in `styles.json.reference_urls` **as-is**; re-hosting = future hardening (out of B1 scope) |

## 4. Architecture

### 4.1 New atomic tool: `nrbi-render-prompt`

Python-subprocess atomic tool, same shape/pattern as the existing `cg-render`
tool (`agent/packages/opencode/src/tool/asset/cg-render.ts` →
`tools/cg-render/render.py`). The tool **emits a prompt, not an image**.

**Surgery on the frozen `render-with-style.py`** (the sha256-pinned verbatim
copy at `knowledge/style-prompts/source-of-record/render-with-style.py`,
sha256 `35f55d9be989...`). Wrap, do not rewrite:

| Action | Functions / blocks (file:line in the frozen copy) | Why |
|---|---|---|
| ✂️ CUT | `load_styles()` SSH tunnel + psycopg | replace with local `styles.json` read |
| ✂️ CUT | `kc()` keyring; `google.genai` Zenmux image call | tool emits prompt only, no model call, no secrets |
| ✂️ CUT | legacy `main()` batch / category-dispatch / `ThreadPoolExecutor` | replace with single-task JSON I/O wrapper (mirror `tools/cg-render/render.py`) |
| ✅ KEEP **verbatim** | `extract_appearance`/`_APPEARANCE_RE` (150, 260-267); `build_sprite_text` 硬约束 + `_OUTFIT_RE` (274-293); `_ANCHOR_HEADER` (308-312); `_ANCHOR_CHROMAKEY` (314-327); `_clean_character_lock`/`clean_anchor_prompt` (330-353); `rebuild_grid_prompt` (356-380); `_SCENE_SQUARE_TEMPLATE`/`build_scene_square_prompt` (393-408); `clean_sprite_prompt` (417-423); `normalize_prompt_for_style` (592-625); `render_prompt` template fill | this **is** the reproduction guarantee — zero edits to assembly logic |

The new Python entry lives under `tools/nrbi-render-prompt/` (NOT inside
`source-of-record/`, which stays a frozen provenance copy). It imports/wraps
the frozen assembly functions; the cleanest mechanism (decided at plan time)
is either (a) a thin `render.py` that `sys.path`-imports the frozen module and
calls only the assembly functions, or (b) a vendored copy with the three CUT
sites surgically replaced — both keep assembly bytes identical; the plan picks
one and the golden test (see §7) proves byte-identity regardless.

### 4.2 Tool I/O contract

Input JSON (stdin or `--input <file>`):

```
{
  "category"            : "<styles.json category>"   // or "style_name"
  "style_name"          : "<e.g. YA_Impasto_character>"   // optional, wins over category
  "layer"               : "A|A5|B|C|D|E"
  "variable_text"       : { appearance? , scene? , grid_cells? , outfit_text? , sprite_action? }
  "reference_image_urls": [ "<caller-supplied upstream URLs, ordered>" ]
  "mock"                : false,
  "dryRun"              : false
}
```

Output JSON (stdout):

```
{
  "prompt"              : "<byte-exact final assembled prompt>",
  "reference_image_urls": [ "<image-1 first per update_character, then styles.json style refs>" ],
  "model"               : "image-gpt",          // from the style row
  "style_name"          : "<resolved>",
  "category"            : "<resolved>"
}
```

No image bytes. The skill body then passes `prompt` + `reference_image_urls` +
`model` to the existing `generate-image-gpt` tool.

### 4.3 Pipeline position

```
intent.spec_md
  → (skill body: extract variable appearance/scene/outfit text)
  → nrbi-render-prompt            ← B1 (new)
  → generate-image-gpt            ← existing
  → upscale-spec                  ← Phase 12 (existing)
  → V10 matting / cutout          ← Phase 13 (existing)
  → oss-put                       ← Phase 12 (existing)
```

Front half = B1. Back half = already shipped. The Phase-14 LLM loop is
**untouched** ("new skill = drop a body + register"). The LLM only orchestrates
steps and extracts variable text; it never authors the framework sentences.

## 5. AssetKind / skill body / 5-layer DAG

Per-layer assembly path (which frozen function each layer invokes, and the
variable-text it fills) is authoritatively documented in the already-migrated
`knowledge/style-prompts/_PIPELINE-MANIFEST.md` ("最终 prompt 按资产类型的装配
顺序" + the render-with-style.py block table). The plan reads it + the frozen
call sites (character series L771, EP sprite L1143-1148, anchor L838-857, scene
grid L954, scene square L1016, scene series L1050) for the exact mapping.

No new AssetKinds. Skill body map (2 updated + 2 new):

| Layer | Style row (category) | Skill body | AssetKind |
|---|---|---|---|
| A series character | `character series illustration` (YA_Impasto_character) | `character-portrait-spec` **(updated)** | `character_portrait` (existing) |
| B scene grid | `scene grid illustration` (YA_Impasto_grid) | folded into `scene-bg-spec` **(updated)** as internal intermediate — **NOT delivered to OSS** | — |
| C scene square | `scene series illustration` (YA_Impasto_scene) | `scene-bg-spec` (refs B) | `scene_bg` (existing) |
| D scene variant | `scene series illustration` | `scene-bg-spec` (refs C) | `scene_bg` |
| A.5 outfit anchor | anchor template (no styles row; reuses character_series style per manifest) | **new** `outfit-anchor-spec` (no kind, skill_hint, registered in `ASSET_GENERATION_SKILLS`) | — |
| E ep sprite | `character ep illustration` (update_character) + `build_sprite_text` reinforcement | **new** `ep-sprite-spec` (no kind, skill_hint, registered) | — |

Skill bodies live at `knowledge/asset-generation/<name>.md` (where the Phase-14
loader reads them: `llm-generator.ts` `defaultLoadSkill`). Each must carry an
`## Atomic tools (allowed)` section listing exactly the tools it may call
(`nrbi-render-prompt`, `generate-image-gpt`, `upscale`-chain, matting/cutout,
`oss-put`) — the loop enforces this allowlist.

Registry edit: add `outfit-anchor-spec` and `ep-sprite-spec` to
`ASSET_GENERATION_SKILLS` in
`agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`
(same edit shape as the Phase-14 `matting-spec`/`cutout-spec` registration).

### 5.1 Dependency edges (via `reference_image_urls`)

| Layer | reference_image_urls (in order) |
|---|---|
| A | styles.json `YA_Impasto_character.reference_urls` only |
| A.5 anchor | `[A character-portrait OSS url]` + style refs |
| B grid | styles.json `YA_Impasto_grid.reference_urls` only |
| C square | `[B grid url]` + style refs |
| D variant | `[C square url]` + style refs |
| E sprite | `[A series-portrait url = update_character "图1"]` + `[A.5 anchor url = outfit i2i]` + style refs |

**Dependency resolution = caller-supplied.** Whoever requests a downstream
asset requests upstream assets first and passes their OSS URLs down (via
`intent.refs` / `spec_md`). The skill body only enforces ref ordering. A
full-book auto-DAG orchestrator is **out of B1 scope** (would be a hardcoded
pipeline smell and is a separate concern).

## 6. Error handling

From the canonical doc failure-modes table (real, documented):

- **Safety reject / model non-determinism** (3 hands / wrong outfit): occurs at
  the `generate-image-gpt` step, not in `nrbi-render-prompt` (which only
  assembles text). Handled by existing retry + skill-body guidance documenting
  re-roll / inline-soften (canonical doc Phase-1 failure rows).
- **Ep sprite missing the Layer-A series-portrait ref**: `nrbi-render-prompt`
  fails fast with an explicit error ("ep sprite requires series portrait as
  image-1") — enforces the canonical Don't "series portraits before sprites".
- **`styles.json` missing category / malformed**: fail fast, clear error.
- **Python subprocess failure** (env/import): structured stderr + non-zero
  exit, same surfacing as `cg-render` / `matting`.
- **`normalize_prompt_for_style` scope**: fires **only** for the YA_Impasto
  family in the frozen script — preserved exactly, must NOT be globalized.

## 7. Testing (strict-reproduction is the命门)

TDD, ≥80% coverage (project rule).

1. **Golden byte-identity — anchor (have data):**
   `knowledge/style-prompts/source-of-record/nrbi-anchor_tasks.json` holds **73
   real NRBI anchor tasks** (each: sprite_id/char_id/outfit_id/outfit_text/
   prompt/model/reference_image_source). Feed each task's inputs to
   `nrbi-render-prompt`; assert the produced `prompt` is **byte-for-byte
   equal** to the recorded `prompt`. All 73 must pass → anchor path proven
   faithful by construction.
2. **Golden fixtures — non-anchor layers (A/B/C/D/E):** no pre-materialized
   golden file exists. One-time: run the frozen assembly path in `--dryRun`
   prompt-only mode over representative per-layer inputs; freeze the outputs as
   committed golden fixtures (under `tools/nrbi-render-prompt/fixtures/` or test
   fixtures). Assert `tool output == fixture`. The reference of record is the
   frozen script itself (strict reproduction is *defined as* "what
   render-with-style.py produces").
3. **Mock mode** test (no subprocess side effects).
4. **Input validation** tests (missing category, malformed `styles.json`,
   missing required ref for Layer E).
5. **Round-trip** test: `nrbi-render-prompt` output shape feeds cleanly into
   `generate-image-gpt` input schema.

## 8. Scope / non-goals / risks

**IN:** `nrbi-render-prompt` atomic tool (frozen-script surgery); 4 skill
bodies (2 updated + 2 new) + registry edit; golden tests; tool README/`.txt` +
docs; main-spec §15 r1.15 entry.

**OUT (explicit non-goals):**
- Full-book auto-DAG orchestrator
- Style reference-image re-hosting (D6: remote URLs as-is)
- New AssetKinds (D5)
- Touching Phase 2/3 (upscale / matting / oss-put already shipped)
- Changing the Phase-14 LLM loop (drop-a-body-and-register only)
- `scene ep illustration` category (canonical doc = "not wired yet"; keep so)
- Any change to moonshort-backend (read-only; frozen copy already migrated)

**RISKS & mitigants:**
- *Dependency on a DEPRECATED-marked frozen script* → it is a sha256-pinned
  verbatim copy in `source-of-record/`; B1 wraps (not rewrites) it; golden
  tests lock behavior.
- *Non-anchor golden capture uses the frozen script as its own reference* →
  acceptable: strict reproduction is defined as fidelity to
  `render-with-style.py` output.
- *Python runtime dependency for the subprocess* → already established and
  accepted via `cg-render` / `matting`.
- *Remote Aliyun OSS dependency for style ref images* → user-accepted (D6),
  recorded as a future hardening item.

## 9. Spec governance

B1 is spec-uncovered. Per project CLAUDE.md ("遇到 spec 没覆盖的情况 → 停下来
问用户 → 收到答复后更新 spec §15"), a revision entry **r1.15** is added to
`docs/superpowers/specs/2026-04-29-assets-produce-spec.md` §15 recording: the
B1 decisions (D1–D6), that §2 atomic-tools + skill-orchestration principle is
unchanged (the new tool is an LLM-via-skill-orchestrated atomic capability, not
a hardcoded pipeline service), and that §11.4 external interfaces are
unchanged. This design doc is the detailed companion to that entry.
