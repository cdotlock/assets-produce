# B1 — NRBI Phase-1 Render-Prompt Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on code in this plan:** B1 is *not* a numbered phase (project CLAUDE.md's "no code in phase plans" rule applies to `phase-N-*-plan.md`). This plan was produced via `superpowers:writing-plans`, whose convention is complete code in every step. Concrete code below is intentional and required.

**Goal:** Add a deterministic `nrbi-render-prompt` atomic tool that byte-faithfully reproduces NRBI demo Phase-1 prompt assembly by importing and calling the sha256-pinned frozen `render-with-style.py` builders verbatim, then wire it into the Phase-14 LLM loop via 2 new + 2 updated skill bodies.

**Architecture:** A Python subprocess tool (`tools/nrbi-render-prompt/render.py`) `importlib`-loads the frozen `knowledge/style-prompts/source-of-record/render-with-style.py` (sha256-pinned), and for each of 6 layers translates JSON `variable_text` into the *minimal in-memory input* each frozen `_build_*` builder requires, calls the builder **verbatim** (zero reimplementation of assembly logic), then applies the two documented post-steps the frozen render path applies (`_ANCHOR_HEADER` prepend for anchors with a bound ref; `normalize_prompt_for_style` last). A TS wrapper (`nrbi-render-prompt.ts`, cloning the `cg-render` factory) shells it. Byte-identity is guaranteed *by construction* (same function objects) and locked by committed golden fixtures regenerable from the frozen reference + the real 73-task NRBI anchor corpus.

**Tech Stack:** Python 3 stdlib only (frozen assembly needs just `re`), `effect/Schema` + `ai` (TS tool), `bun:test`, `pytest`.

---

## Background (read before Task 1)

NRBI art production = 3 phases. Phase 2 (`upscale-spec`) + Phase 3 (`matting`/`cutout`/`oss-put`) already shipped (Phase 12/13). **B1 is Phase 1 only.** Authoritative design: `docs/superpowers/specs/2026-05-18-b1-nrbi-render-prompt-design.md` (decisions D1–D6). Main spec governance: `docs/superpowers/specs/2026-04-29-assets-produce-spec.md` §15 r1.15.

**Ground-truth facts the implementer must trust (verified during planning):**

- Frozen file: `knowledge/style-prompts/source-of-record/render-with-style.py`, **1547 lines**, marked `# DEPRECATED 2026-05-15`, sha256 `35f55d9be989f208edf8ff59fb9fc95ba79bcfb6f680a1379ca2846272b53e06` (verified on disk at plan time). It is `importlib`-loadable with **zero external packages** (all heavy deps `keyring`/`psycopg`/`sshtunnel`/`google.genai` are ImportError-guarded to `None`; nothing at module scope executes them — only `if __name__ == "__main__"` runs `main()`).
- The 6 prompt-assembly builders and `normalize_prompt_for_style` are **pure given in-memory inputs**, with exactly two exceptions: `_build_outfit_anchor_tasks` reads `book_paths["anchor_file"]` from disk (`.exists()`/`.read_text()` — so the adapter writes a temp file), and `_build_ep_sprite_tasks_template` reads env `__SPRITE_MODEL_OVERRIDE__` (affects only the returned `model`, never the prompt — keep it unset). No builder performs network/subprocess/genai/secret access.
- `normalize_prompt_for_style(prompt, style_family)` early-returns unchanged unless `style_family.startswith("YA_Impasto")`. The frozen render path applies it at `render_image` L636 with the global `_CURRENT_STYLE_FAMILY` (set only from `--style-family`; otherwise `None` → no-op). For faithful NRBI reproduction the adapter applies it **as the final step** with `style_family = <resolved styles.json row's `name`>`. The 4 NRBI rows: `YA_Impasto_character` / `YA_Impasto_grid` / `YA_Impasto_scene` (normalize fires) and `update_character` (no-op — correct, EP sprite is not YA_Impasto-rewritten).
- `styles.json` = JSON **array of 4** objects, keys: `id`, `name`, `category`, `model` (all `"image-gpt"`), `prompt`, `reference_urls` (array), `created_at` (float epoch). Field is **`name`** (not `style_name`); no negative-prompt field. category→name: `character series illustration`→`YA_Impasto_character`; `scene grid illustration`→`YA_Impasto_grid`; `scene series illustration`→`YA_Impasto_scene`; `character ep illustration`→`update_character`.
- `nrbi-anchor_tasks.json` = JSON **object** with single key `outfit_anchors` → array of **73**. Per-task keys: `sprite_id`, `char_id`, `outfit_id`, `outfit_text`, `prompt`, `model`, `reference_image_source`. The recorded `prompt` is the **raw upstream input** (`#00B140`, "Korean manhwa illustration…") that `clean_anchor_prompt` *transforms* — it is **not** the assembled output. Therefore the anchor byte-identity target is the frozen `_build_outfit_anchor_tasks` **output** over those 73 raw inputs, captured once into a committed fixture (genuine reproduction: real inputs, real frozen transformation, regenerable).

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `tools/nrbi-render-prompt/render.py` | Subprocess entry: sha256-pinned `importlib` loader; per-layer JSON→builder-input adapter calling frozen `_build_*` verbatim; anchor header rule; final `normalize_prompt_for_style`; styles.json resolution; matting-style JSON stdin→stdout harness (exit 0/2/4/5/1). |
| `tools/nrbi-render-prompt/gen_fixtures.py` | One-time, rerunnable golden generator. Calls the frozen builders over the real 73 anchors + representative per-layer inputs; writes `fixtures/*.json`. |
| `tools/nrbi-render-prompt/fixtures/anchor_golden.json` | Committed: 73 `{input, expected_prompt}` anchor goldens. |
| `tools/nrbi-render-prompt/fixtures/layer_golden.json` | Committed: A/B/C/D/E representative `{input, expected_prompt}` goldens. |
| `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py` | pytest, hermetic (plain python3, no external deps). Golden byte-identity + error envelopes + exit codes + dryRun + round-trip. |
| `tools/nrbi-render-prompt/requirements.txt` | stdlib-only note. |
| `tools/nrbi-render-prompt/README.md` | Contract, run command, the anchor-golden definition. |
| `agent/packages/opencode/src/tool/asset/nrbi-render-prompt.ts` | TS atomic tool (clone of `cg-render.ts` factory). |
| `agent/packages/opencode/src/tool/asset/nrbi-render-prompt.txt` | Tool description text module. |
| `agent/packages/opencode/test/tool/nrbi-render-prompt.test.ts` | bun test, fake `PythonRunner` injected via factory. |
| `knowledge/asset-generation/outfit-anchor-spec.md` | New skill body — Layer A.5. |
| `knowledge/asset-generation/ep-sprite-spec.md` | New skill body — Layer E. |

**Modified files:**

| Path | Change |
|---|---|
| `agent/packages/opencode/src/tool/registry.ts` | 4-site tool registration. |
| `agent/packages/opencode/src/business/asset-service/llm-generator.ts` | Import + `ATOMIC_TOOLS` entry (so skill bodies can allowlist it + loop wires it). |
| `agent/packages/opencode/src/business/asset-service/intent-to-skill.ts` | Append `outfit-anchor-spec`, `ep-sprite-spec` to `ASSET_GENERATION_SKILLS` (no `DEFAULT_KIND_SKILL_MAP` change). |
| `agent/packages/opencode/test/business/asset-service/intent-to-skill.test.ts` | Membership `expected` array += 2; add picker + skill_hint tests. |
| `knowledge/asset-generation/character-portrait-spec.md` | Route Layer A through `nrbi-render-prompt`. |
| `knowledge/asset-generation/scene-bg-spec.md` | Route Layers B/C/D through `nrbi-render-prompt`. |
| `knowledge/asset-generation/README.md` | Index += 2 bodies. |
| `docs/superpowers/specs/2026-05-18-b1-nrbi-render-prompt-design.md` | §7.1 one-sentence clarification (anchor golden = frozen-reference output, not raw recorded prompt). |

---

## Conventions

- All `bun` commands: prefix `PATH=$HOME/.bun/bin:$PATH`, run from `agent/packages/opencode`.
- Python tests: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q` from repo root.
- Atomic commits — one logical change per commit, message ends with no attribution (global setting). Push to `origin/main` after each commit (assets-produce pre-authorized).
- TDD: write the failing test, run it red, implement minimally, run it green, commit.

---

### Task 1: Frozen-module loader (sha256-pinned importlib)

**Files:**
- Create: `tools/nrbi-render-prompt/render.py`
- Test: `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py`

- [ ] **Step 1: Write the failing test**

Create `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py`:

```python
"""
Hermetic tests — MUST pass on plain python3 with NO external packages.
Run:  python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q
"""
import importlib.util
import sys
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
RENDER = TOOL_DIR / "render.py"


def _load_render_module():
    spec = importlib.util.spec_from_file_location("nrbi_render_prompt_render", RENDER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_frozen_module_loads_and_is_sha_pinned():
    mod = _load_render_module()
    frozen = mod._load_frozen()
    # The KEEP-verbatim assembly surface must be present.
    for fn in (
        "render_prompt",
        "extract_appearance",
        "build_sprite_text",
        "clean_anchor_prompt",
        "clean_sprite_prompt",
        "rebuild_grid_prompt",
        "build_scene_square_prompt",
        "normalize_prompt_for_style",
        "_build_series_character_tasks",
        "_build_outfit_anchor_tasks",
        "_build_scene_grid_tasks",
        "_build_scene_square_tasks_template",
        "_build_scene_variant_tasks_template",
        "_build_ep_sprite_tasks_template",
    ):
        assert hasattr(frozen, fn), f"frozen module missing {fn}"
    assert mod.FROZEN_SHA256 == (
        "35f55d9be989f208edf8ff59fb9fc95ba79bcfb6f680a1379ca2846272b53e06"
    )


def test_sha_mismatch_raises(monkeypatch):
    mod = _load_render_module()
    mod._load_frozen.cache_clear()
    monkeypatch.setattr(mod, "FROZEN_SHA256", "deadbeef")
    try:
        mod._load_frozen()
        raised = False
    except RuntimeError as e:
        raised = "sha256" in str(e).lower()
    finally:
        mod._load_frozen.cache_clear()
    assert raised, "tampered frozen reference must fail fast"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q`
Expected: FAIL — `render.py` does not exist (collection error / ModuleNotFound).

- [ ] **Step 3: Write minimal implementation**

Create `tools/nrbi-render-prompt/render.py`:

```python
#!/usr/bin/env python3
"""
nrbi-render-prompt — deterministic NRBI Phase-1 prompt assembler.

Imports the sha256-pinned frozen render-with-style.py and calls its
prompt-assembly builders VERBATIM. Emits a prompt, never an image.
See docs/superpowers/specs/2026-05-18-b1-nrbi-render-prompt-design.md.
"""
from __future__ import annotations

import functools
import hashlib
import importlib.util
from pathlib import Path

# tools/nrbi-render-prompt/render.py -> parents[2] == repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
FROZEN_PATH = REPO_ROOT / "knowledge" / "style-prompts" / "source-of-record" / "render-with-style.py"
FROZEN_SHA256 = "35f55d9be989f208edf8ff59fb9fc95ba79bcfb6f680a1379ca2846272b53e06"


@functools.lru_cache(maxsize=1)
def _load_frozen():
    if not FROZEN_PATH.exists():
        raise RuntimeError(f"frozen reference not found: {FROZEN_PATH}")
    digest = hashlib.sha256(FROZEN_PATH.read_bytes()).hexdigest()
    if digest != FROZEN_SHA256:
        raise RuntimeError(
            f"frozen reference sha256 drift: expected {FROZEN_SHA256}, got {digest}. "
            "Byte-identity reproduction is void; do not proceed."
        )
    spec = importlib.util.spec_from_file_location("nrbi_frozen_render_with_style", FROZEN_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add tools/nrbi-render-prompt/render.py tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py
git commit -m "feat: add sha256-pinned frozen render-with-style loader for nrbi-render-prompt"
git push origin main
```

---

### Task 2: Golden fixture generator + committed fixtures

**Files:**
- Create: `tools/nrbi-render-prompt/gen_fixtures.py`
- Create: `tools/nrbi-render-prompt/fixtures/anchor_golden.json`
- Create: `tools/nrbi-render-prompt/fixtures/layer_golden.json`
- Test: `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py`

This task produces the byte-identity reference. The generator calls the frozen builders directly with the exact minimal inputs documented below. **These input shapes are verified ground truth — every dereferenced key is shown.**

- [ ] **Step 1: Write `gen_fixtures.py`**

Create `tools/nrbi-render-prompt/gen_fixtures.py`:

```python
#!/usr/bin/env python3
"""
One-time, rerunnable golden generator. Calls the frozen render-with-style.py
builders over the real 73-anchor NRBI corpus + representative per-layer
inputs, and writes byte-exact golden fixtures. Re-running MUST reproduce the
committed fixtures byte-for-byte (the frozen reference is sha-pinned).

Run:  python3 tools/nrbi-render-prompt/gen_fixtures.py
"""
from __future__ import annotations

import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import render as R  # noqa: E402

FX = pathlib.Path(__file__).resolve().parent / "fixtures"
SOR = R.REPO_ROOT / "knowledge" / "style-prompts" / "source-of-record"


def _styles():
    rows = json.loads((SOR / "styles.json").read_text())
    return {r["category"]: r for r in rows}


def _layer_golden(frozen, styles):
    out = []
    TMP = pathlib.Path("/tmp")

    # Layer A — series character
    a_style = styles["character series illustration"]
    a_in = {"layer": "A", "subject_id": "demo", "orig_prompt": "现代都市少女，黑长直，无文字。一位身穿米色风衣的年轻女性，眉眼清冷 [BACKGROUND CONTRACT — chromakey green]\n绿幕"}
    a_tasks = frozen._build_series_character_tasks(
        {"series_character_prompts": {"demo": {"prompt": a_in["orig_prompt"]}}},
        {"out_character": TMP},
        {R.CHAR_SERIES_CATEGORY: a_style},
        {},
        None,
    )
    a_prompt = frozen.normalize_prompt_for_style(a_tasks[0]["prompt"], a_style["name"])
    out.append({"input": a_in, "expected_prompt": a_prompt, "model": a_tasks[0]["model"]})

    # Layer B — scene grid (simple branch: location_name)
    b_style = styles["scene grid illustration"]
    b_in = {"layer": "B", "location_id": "cafe", "location_name": "downtown cafe"}
    b_tasks = frozen._build_scene_grid_tasks(
        {"scene_tasks": [{"id": "cafe", "has_sub_locations": True, "location_name": "downtown cafe"}]},
        {"out_series": TMP},
        {R.SCENE_GRID_CATEGORY: b_style},
        {},
        None,
    )
    b_prompt = frozen.normalize_prompt_for_style(b_tasks[0]["prompt"], b_style["name"])
    out.append({"input": b_in, "expected_prompt": b_prompt, "model": b_tasks[0]["model"]})

    # Layer C — scene square (sub_location_name path)
    c_style = styles["scene series illustration"]
    c_in = {"layer": "C", "scene_id": "sc1", "sub_location_name": "front counter"}
    c_tasks = frozen._build_scene_square_tasks_template(
        {"scene_tasks": [{"id": "cafe", "scenes": [{"scene_id": "sc1", "sub_location_name": "front counter"}]}]},
        {"out_scene": TMP},
        {R.SCENE_SERIES_CATEGORY: c_style},
        {},
        None,
    )
    c_prompt = frozen.normalize_prompt_for_style(c_tasks[0]["prompt"], c_style["name"])
    out.append({"input": c_in, "expected_prompt": c_prompt, "model": c_tasks[0]["model"]})

    # Layer D — scene variant (explicit prompt)
    d_style = styles["scene series illustration"]
    d_in = {"layer": "D", "variant_id": "v1", "base_scene_id": "sc1", "prompt": "雨夜的同一场景，霓虹倒影"}
    d_tasks = frozen._build_scene_variant_tasks_template(
        {"scene_variants": [{"variant_id": "v1", "base_scene_id": "sc1", "prompt": "雨夜的同一场景，霓虹倒影"}]},
        {"out_scene": TMP},
        {R.SCENE_SERIES_CATEGORY: d_style},
        {},
        None,
    )
    d_prompt = frozen.normalize_prompt_for_style(d_tasks[0]["prompt"], d_style["name"])
    out.append({"input": d_in, "expected_prompt": d_prompt, "model": d_tasks[0]["model"]})

    # Layer E — ep sprite (anchor-locked branch: sprite.prompt present)
    e_style = styles["character ep illustration"]
    e_in = {"layer": "E", "char_id": "selena", "sprite_id": "sp1", "prompt": "参考图1，保持脸/服装，改神态为微笑，绿幕 #00B140 RGB 0,177,64"}
    e_tasks = frozen._build_ep_sprite_tasks_template(
        {"ep_character_sprites": {"ep1": {"selena": {"sprites": [{"sprite_id": "sp1", "prompt": e_in["prompt"]}]}}}},
        {"out_sprites": TMP},
        {R.CHAR_EP_CATEGORY: e_style},
        {},
        None,
    )
    e_prompt = frozen.normalize_prompt_for_style(e_tasks[0]["prompt"], e_style["name"])
    out.append({"input": e_in, "expected_prompt": e_prompt, "model": e_tasks[0]["model"]})

    return out


def _anchor_golden(frozen, styles):
    corpus = json.loads((SOR / "nrbi-anchor_tasks.json").read_text())["outfit_anchors"]
    char_model = styles["character series illustration"]["model"]
    char_family = styles["character series illustration"]["name"]
    out = []
    for spec in corpus:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"outfit_anchors": [spec]}, fh, ensure_ascii=False)
            anchor_path = pathlib.Path(fh.name)
        try:
            tasks = frozen._build_outfit_anchor_tasks(
                {"anchor_file": anchor_path, "out_anchors": pathlib.Path("/tmp"), "out_character": pathlib.Path("/tmp")},
                {R.CHAR_SERIES_CATEGORY: {"model": char_model, "name": char_family}},
                None,
            )
        finally:
            anchor_path.unlink(missing_ok=True)
        assert tasks, f"anchor builder produced nothing for {spec.get('sprite_id')}"
        # No ref bound here -> NO _ANCHOR_HEADER (Tier-3); then normalize.
        no_ref = frozen.normalize_prompt_for_style(tasks[0]["prompt"], char_family)
        # With a ref bound -> _ANCHOR_HEADER prepended (Tier-1/2), then normalize.
        with_ref = frozen.normalize_prompt_for_style(
            frozen._ANCHOR_HEADER + tasks[0]["prompt"], char_family
        )
        out.append({
            "sprite_id": spec["sprite_id"],
            "char_id": spec["char_id"],
            "outfit_id": spec["outfit_id"],
            "raw_prompt": spec["prompt"],
            "expected_prompt_no_ref": no_ref,
            "expected_prompt_with_ref": with_ref,
            "model": char_model,
        })
    return out


def main() -> int:
    frozen = R._load_frozen()
    styles = _styles()
    FX.mkdir(exist_ok=True)
    (FX / "layer_golden.json").write_text(
        json.dumps(_layer_golden(frozen, styles), ensure_ascii=False, indent=2) + "\n"
    )
    (FX / "anchor_golden.json").write_text(
        json.dumps(_anchor_golden(frozen, styles), ensure_ascii=False, indent=2) + "\n"
    )
    print(f"wrote {FX}/layer_golden.json + anchor_golden.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Generate the fixtures**

Run: `python3 tools/nrbi-render-prompt/gen_fixtures.py`
Expected: prints `wrote .../fixtures/layer_golden.json + anchor_golden.json`; `fixtures/anchor_golden.json` has 73 entries, `fixtures/layer_golden.json` has 5.

Verify count: `python3 -c "import json;print(len(json.load(open('tools/nrbi-render-prompt/fixtures/anchor_golden.json'))))"` → `73`.

- [ ] **Step 3: Write the regenerability test (append to test file)**

Append to `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py`:

```python
import json as _json
import subprocess


def test_fixtures_are_regenerable_and_pinned():
    """Re-running gen_fixtures.py must byte-reproduce the committed fixtures.
    This locks the frozen reference's assembly behavior."""
    fx = TOOL_DIR / "fixtures"
    before_anchor = (fx / "anchor_golden.json").read_text()
    before_layer = (fx / "layer_golden.json").read_text()
    proc = subprocess.run(
        [sys.executable, str(TOOL_DIR / "gen_fixtures.py")],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert (fx / "anchor_golden.json").read_text() == before_anchor
    assert (fx / "layer_golden.json").read_text() == before_layer
    anchors = _json.loads(before_anchor)
    assert len(anchors) == 73
    assert len(_json.loads(before_layer)) == 5
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q`
Expected: PASS (3 passed — loader×2 + regenerability).

- [ ] **Step 5: Commit**

```bash
git add tools/nrbi-render-prompt/gen_fixtures.py tools/nrbi-render-prompt/fixtures/ tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py
git commit -m "feat: add NRBI golden fixture generator + committed goldens (73 anchors + 5 layers)"
git push origin main
```

---

### Task 3: Adapter — style resolution + Layers A & A.5 (anchor)

**Files:**
- Modify: `tools/nrbi-render-prompt/render.py`
- Test: `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py`

The adapter exposes `assemble(payload: dict) -> dict`. It resolves the styles row, builds the **exact minimal in-memory input** per layer (verified shapes), calls the frozen builder verbatim, applies the anchor header rule, then `normalize_prompt_for_style`.

- [ ] **Step 1: Write the failing tests (append)**

Append to `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py`:

```python
def test_layer_A_matches_golden():
    mod = _load_render_module()
    g = _json.loads((TOOL_DIR / "fixtures" / "layer_golden.json").read_text())
    a = next(x for x in g if x["input"]["layer"] == "A")
    res = mod.assemble({
        "layer": "A",
        "variable_text": {"orig_prompt": a["input"]["orig_prompt"], "subject_id": "demo"},
        "reference_image_urls": [],
    })
    assert res["prompt"] == a["expected_prompt"]
    assert res["model"] == a["model"]
    assert res["style_name"] == "YA_Impasto_character"
    assert res["category"] == "character series illustration"


def test_layer_A5_anchor_no_ref_and_with_ref_match_golden():
    mod = _load_render_module()
    anchors = _json.loads((TOOL_DIR / "fixtures" / "anchor_golden.json").read_text())
    a0 = anchors[0]
    no_ref = mod.assemble({
        "layer": "A5",
        "variable_text": {"char_id": a0["char_id"], "outfit_id": a0["outfit_id"], "prompt": a0["raw_prompt"]},
        "reference_image_urls": [],
    })
    assert no_ref["prompt"] == a0["expected_prompt_no_ref"]
    with_ref = mod.assemble({
        "layer": "A5",
        "variable_text": {"char_id": a0["char_id"], "outfit_id": a0["outfit_id"], "prompt": a0["raw_prompt"]},
        "reference_image_urls": ["https://oss.example.com/character_selena.png"],
    })
    assert with_ref["prompt"] == a0["expected_prompt_with_ref"]
    assert with_ref["prompt"].startswith(mod._load_frozen()._ANCHOR_HEADER) or \
        mod._load_frozen()._ANCHOR_HEADER[:8] in with_ref["prompt"]


def test_all_73_anchors_byte_identical():
    mod = _load_render_module()
    anchors = _json.loads((TOOL_DIR / "fixtures" / "anchor_golden.json").read_text())
    for a in anchors:
        res = mod.assemble({
            "layer": "A5",
            "variable_text": {"char_id": a["char_id"], "outfit_id": a["outfit_id"], "prompt": a["raw_prompt"]},
            "reference_image_urls": [],
        })
        assert res["prompt"] == a["expected_prompt_no_ref"], f"drift at {a['sprite_id']}"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q -k "layer_A or anchors"`
Expected: FAIL — `module 'render' has no attribute 'assemble'`.

- [ ] **Step 3: Implement style resolution + Layers A/A5 (append to `render.py`)**

Append to `tools/nrbi-render-prompt/render.py`:

```python
import json
import tempfile

SOR_DIR = REPO_ROOT / "knowledge" / "style-prompts" / "source-of-record"
STYLES_JSON = SOR_DIR / "styles.json"

# Frozen category constants (mirror render-with-style.py L116-119).
CHAR_SERIES_CATEGORY = "character series illustration"
SCENE_GRID_CATEGORY = "scene grid illustration"
SCENE_SERIES_CATEGORY = "scene series illustration"
CHAR_EP_CATEGORY = "character ep illustration"

_LAYER_CATEGORY = {
    "A": CHAR_SERIES_CATEGORY,
    "A5": CHAR_SERIES_CATEGORY,  # anchor has no styles row; reuse char-series for model+family
    "B": SCENE_GRID_CATEGORY,
    "C": SCENE_SERIES_CATEGORY,
    "D": SCENE_SERIES_CATEGORY,
    "E": CHAR_EP_CATEGORY,
}


@functools.lru_cache(maxsize=1)
def _styles_by_category():
    rows = json.loads(STYLES_JSON.read_text())
    return {r["category"]: r for r in rows}, {r["name"]: r for r in rows}


def _resolve_style(layer: str, category: str | None, style_name: str | None) -> dict:
    by_cat, by_name = _styles_by_category()
    if style_name:
        if style_name not in by_name:
            raise ValueError(f"unknown style_name '{style_name}'")
        return by_name[style_name]
    cat = category or _LAYER_CATEGORY.get(layer)
    if cat not in by_cat:
        raise ValueError(f"unknown category '{cat}' for layer '{layer}'")
    return by_cat[cat]


def _norm(frozen, prompt: str, style_row: dict) -> str:
    # Reproduces render_image L636: normalize_prompt_for_style(prompt, family).
    return frozen.normalize_prompt_for_style(prompt, style_row["name"])


def assemble(payload: dict) -> dict:
    layer = payload.get("layer")
    if layer not in _LAYER_CATEGORY:
        raise ValueError(f"layer must be one of {sorted(_LAYER_CATEGORY)}; got {layer!r}")
    vt = payload.get("variable_text") or {}
    refs = list(payload.get("reference_image_urls") or [])
    frozen = _load_frozen()
    style = _resolve_style(layer, payload.get("category"), payload.get("style_name"))
    tmp = pathlib.Path("/tmp")

    if layer == "A":
        orig = vt.get("orig_prompt")
        if not orig:
            raise ValueError("layer A requires variable_text.orig_prompt")
        sid = vt.get("subject_id") or "subject"
        tasks = frozen._build_series_character_tasks(
            {"series_character_prompts": {sid: {"prompt": orig}}},
            {"out_character": tmp}, {CHAR_SERIES_CATEGORY: style}, {}, None,
        )
        prompt = _norm(frozen, tasks[0]["prompt"], style)
        model = tasks[0]["model"]

    elif layer == "A5":
        char_id = vt.get("char_id")
        outfit_id = vt.get("outfit_id")
        raw = vt.get("prompt")
        if not (char_id and outfit_id and raw):
            raise ValueError("layer A5 requires variable_text.char_id, .outfit_id, .prompt")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"outfit_anchors": [
                {"char_id": char_id, "outfit_id": outfit_id, "prompt": raw}
            ]}, fh, ensure_ascii=False)
            anchor_path = pathlib.Path(fh.name)
        try:
            tasks = frozen._build_outfit_anchor_tasks(
                {"anchor_file": anchor_path, "out_anchors": tmp, "out_character": tmp},
                {CHAR_SERIES_CATEGORY: {"model": style["model"], "name": style["name"]}},
                None,
            )
        finally:
            anchor_path.unlink(missing_ok=True)
        if not tasks:
            raise ValueError("anchor builder produced no task (check char_id/outfit_id/prompt)")
        base = tasks[0]["prompt"]
        # Binder rule: _ANCHOR_HEADER prepended iff a ref image is bound.
        if refs:
            base = frozen._ANCHOR_HEADER + base
        prompt = _norm(frozen, base, style)
        model = tasks[0]["model"]

    else:
        raise NotImplementedError(f"layer {layer} implemented in a later task")

    return {
        "prompt": prompt,
        "reference_image_urls": refs,
        "model": model,
        "style_name": style["name"],
        "category": style["category"],
        "layer": layer,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q`
Expected: PASS (all, including `test_all_73_anchors_byte_identical`).

- [ ] **Step 5: Commit**

```bash
git add tools/nrbi-render-prompt/render.py tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py
git commit -m "feat: nrbi-render-prompt adapter — style resolution + Layer A/A5 byte-identity"
git push origin main
```

---

### Task 4: Adapter — Layers B, C, D, E

**Files:**
- Modify: `tools/nrbi-render-prompt/render.py`
- Test: `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py`

- [ ] **Step 1: Write the failing tests (append)**

```python
def test_layers_B_C_D_E_match_golden():
    mod = _load_render_module()
    g = _json.loads((TOOL_DIR / "fixtures" / "layer_golden.json").read_text())
    by_layer = {x["input"]["layer"]: x for x in g}

    b = by_layer["B"]
    rb = mod.assemble({"layer": "B", "variable_text": {"location_name": b["input"]["location_name"], "location_id": b["input"]["location_id"]}, "reference_image_urls": []})
    assert rb["prompt"] == b["expected_prompt"]
    assert rb["style_name"] == "YA_Impasto_grid"

    c = by_layer["C"]
    rc = mod.assemble({"layer": "C", "variable_text": {"sub_location_name": c["input"]["sub_location_name"], "scene_id": c["input"]["scene_id"]}, "reference_image_urls": ["https://oss.example.com/grid.png"]})
    assert rc["prompt"] == c["expected_prompt"]
    assert rc["style_name"] == "YA_Impasto_scene"

    d = by_layer["D"]
    rd = mod.assemble({"layer": "D", "variable_text": {"variant_id": d["input"]["variant_id"], "base_scene_id": d["input"]["base_scene_id"], "prompt": d["input"]["prompt"]}, "reference_image_urls": ["https://oss.example.com/square.png"]})
    assert rd["prompt"] == d["expected_prompt"]

    e = by_layer["E"]
    re_ = mod.assemble({"layer": "E", "variable_text": {"char_id": e["input"]["char_id"], "sprite_id": e["input"]["sprite_id"], "prompt": e["input"]["prompt"]}, "reference_image_urls": ["https://oss.example.com/series_selena.png", "https://oss.example.com/anchor_selena_casual.png"]})
    assert re_["prompt"] == e["expected_prompt"]
    assert re_["style_name"] == "update_character"


def test_layer_E_requires_reference_images():
    mod = _load_render_module()
    try:
        mod.assemble({"layer": "E", "variable_text": {"char_id": "selena", "sprite_id": "sp1", "prompt": "x"}, "reference_image_urls": []})
        raised = False
    except ValueError as e:
        raised = "series portrait" in str(e).lower() or "reference" in str(e).lower()
    assert raised, "Layer E without refs must fail fast (canonical Don't: series portraits before sprites)"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q -k "B_C_D_E or layer_E"`
Expected: FAIL — `NotImplementedError: layer B implemented in a later task`.

- [ ] **Step 3: Implement Layers B/C/D/E (replace the `else: raise NotImplementedError` block in `assemble`)**

In `tools/nrbi-render-prompt/render.py`, replace:

```python
    else:
        raise NotImplementedError(f"layer {layer} implemented in a later task")
```

with:

```python
    elif layer == "B":
        name = vt.get("location_name") or vt.get("location_id")
        if not name:
            raise ValueError("layer B requires variable_text.location_name (or .location_id)")
        task = {"id": vt.get("location_id") or "loc", "has_sub_locations": True, "location_name": name}
        if vt.get("grid_prompt"):
            task["grid"] = {"prompt": vt["grid_prompt"]}
        tasks = frozen._build_scene_grid_tasks(
            {"scene_tasks": [task]}, {"out_series": tmp},
            {SCENE_GRID_CATEGORY: style}, {}, None,
        )
        if not tasks:
            raise ValueError("scene grid builder produced no task")
        prompt = _norm(frozen, tasks[0]["prompt"], style)
        model = tasks[0]["model"]

    elif layer == "C":
        sub = vt.get("sub_location_name")
        if not sub:
            raise ValueError("layer C requires variable_text.sub_location_name")
        tasks = frozen._build_scene_square_tasks_template(
            {"scene_tasks": [{"id": vt.get("location_id") or "loc",
                              "scenes": [{"scene_id": vt.get("scene_id") or "sc", "sub_location_name": sub}]}]},
            {"out_scene": tmp}, {SCENE_SERIES_CATEGORY: style}, {}, None,
        )
        if not tasks:
            raise ValueError("scene square builder produced no task")
        prompt = _norm(frozen, tasks[0]["prompt"], style)
        model = tasks[0]["model"]

    elif layer == "D":
        vid = vt.get("variant_id")
        base = vt.get("base_scene_id")
        if not (vid and base):
            raise ValueError("layer D requires variable_text.variant_id and .base_scene_id")
        variant = {"variant_id": vid, "base_scene_id": base}
        if vt.get("prompt"):
            variant["prompt"] = vt["prompt"]
        tasks = frozen._build_scene_variant_tasks_template(
            {"scene_variants": [variant]}, {"out_scene": tmp},
            {SCENE_SERIES_CATEGORY: style}, {}, None,
        )
        if not tasks:
            raise ValueError("scene variant builder produced no task")
        prompt = _norm(frozen, tasks[0]["prompt"], style)
        model = tasks[0]["model"]

    elif layer == "E":
        if not refs:
            raise ValueError(
                "layer E (ep sprite) requires reference_image_urls "
                "(series portrait as image-1 + anchor i2i); none supplied"
            )
        char_id = vt.get("char_id")
        sid = vt.get("sprite_id")
        if not (char_id and sid):
            raise ValueError("layer E requires variable_text.char_id and .sprite_id")
        sprite: dict = {"sprite_id": sid}
        if vt.get("prompt"):
            sprite["prompt"] = vt["prompt"]
        elif vt.get("orig_prompt"):
            sprite["orig_prompt"] = vt["orig_prompt"]
        else:
            raise ValueError("layer E requires variable_text.prompt or .orig_prompt")
        os.environ.pop("__SPRITE_MODEL_OVERRIDE__", None)  # keep model deterministic
        tasks = frozen._build_ep_sprite_tasks_template(
            {"ep_character_sprites": {"ep1": {char_id: {"sprites": [sprite]}}}},
            {"out_sprites": tmp}, {CHAR_EP_CATEGORY: style}, {}, None,
        )
        if not tasks:
            raise ValueError("ep sprite builder produced no task (update_character style required)")
        prompt = _norm(frozen, tasks[0]["prompt"], style)
        model = tasks[0]["model"]

    else:
        raise ValueError(f"unhandled layer {layer!r}")
```

Add `import os` to the top imports of `render.py` (next to `import json`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add tools/nrbi-render-prompt/render.py tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py
git commit -m "feat: nrbi-render-prompt adapter — Layers B/C/D/E with Layer-E ref guard"
git push origin main
```

---

### Task 5: JSON stdin→stdout subprocess harness

**Files:**
- Modify: `tools/nrbi-render-prompt/render.py`
- Test: `tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py`

Clone the `tools/matting/matting.py` harness contract: dispatch on `--input`/`--mock`/`--json`; read JSON from stdin (`--input -`) or `--input <file>`; emit **only** JSON on stdout; emit `{"error":{"code","message"}}` on stderr; exit codes 0/2/4/5/1; `__main__` wrapped in `try/except BaseException` for a last-resort INTERNAL envelope. `dryRun` echoes the resolved invocation without assembling. `mock` marks `meta.mock=true` (assembly is already side-effect-free; mock additionally downgrades a sha drift to a non-fatal `meta.sha_warning` so hermetic CI works even if the frozen file is intentionally absent/edited — production path stays hard-fail).

- [ ] **Step 1: Write the failing tests (append)**

```python
def _run(stdin: str, args=None):
    args = args or ["--input", "-"]
    return subprocess.run(
        [sys.executable, str(RENDER), *args],
        input=stdin, capture_output=True, text=True,
    )


def test_cli_happy_path_layer_A():
    g = _json.loads((TOOL_DIR / "fixtures" / "layer_golden.json").read_text())
    a = next(x for x in g if x["input"]["layer"] == "A")
    payload = _json.dumps({"layer": "A", "variable_text": {"orig_prompt": a["input"]["orig_prompt"], "subject_id": "demo"}, "reference_image_urls": []})
    p = _run(payload)
    assert p.returncode == 0, p.stderr
    out = _json.loads(p.stdout)
    assert out["prompt"] == a["expected_prompt"]
    assert out["meta"]["atomic_tool"] == "nrbi-render-prompt"
    assert out["meta"]["mock"] is False


def test_cli_invalid_json_exit_2_stderr_envelope():
    p = _run("not json{")
    assert p.returncode == 2
    assert p.stdout.strip() == ""
    assert _json.loads(p.stderr)["error"]["code"] == "INVALID_INPUT"


def test_cli_bad_layer_exit_2():
    p = _run(_json.dumps({"layer": "Z", "variable_text": {}}))
    assert p.returncode == 2
    assert _json.loads(p.stderr)["error"]["code"] == "INVALID_INPUT"


def test_cli_dryrun_echoes_without_assembling():
    p = _run(_json.dumps({"layer": "A", "variable_text": {"orig_prompt": "x"}, "dryRun": True}))
    assert p.returncode == 0
    out = _json.loads(p.stdout)
    assert out["dryRun"] is True and "prompt" not in out


def test_cli_mock_marks_meta():
    g = _json.loads((TOOL_DIR / "fixtures" / "layer_golden.json").read_text())
    a = next(x for x in g if x["input"]["layer"] == "A")
    p = _run(_json.dumps({"layer": "A", "variable_text": {"orig_prompt": a["input"]["orig_prompt"]}, "mock": True}))
    assert p.returncode == 0
    assert _json.loads(p.stdout)["meta"]["mock"] is True


def test_roundtrip_shape_feeds_generate_image_gpt():
    """Output must carry exactly the fields a downstream image tool needs."""
    g = _json.loads((TOOL_DIR / "fixtures" / "layer_golden.json").read_text())
    a = next(x for x in g if x["input"]["layer"] == "A")
    p = _run(_json.dumps({"layer": "A", "variable_text": {"orig_prompt": a["input"]["orig_prompt"]}, "reference_image_urls": ["https://oss.example.com/ref.png"]}))
    out = _json.loads(p.stdout)
    assert isinstance(out["prompt"], str) and out["prompt"]
    assert out["reference_image_urls"] == ["https://oss.example.com/ref.png"]
    assert isinstance(out["model"], str) and out["model"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q -k cli or roundtrip`
Expected: FAIL — running `render.py` as a script does nothing (no `__main__`).

- [ ] **Step 3: Implement the harness (append to `render.py`)**

Append to `tools/nrbi-render-prompt/render.py`:

```python
import argparse
import sys


def _emit_error(code: str, message: str) -> None:
    print(json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _looks_like_json_entry(argv) -> bool:
    return any(a in ("--input", "--mock", "--json") for a in argv)


def _run_json_main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="nrbi-render-prompt")
    parser.add_argument("--input", default="-")
    parser.add_argument("--mock", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        raw = sys.stdin.read() if args.input in ("-", None) else open(args.input).read()
    except OSError as e:
        _emit_error("INVALID_INPUT", f"cannot read input: {e}")
        return 2
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        _emit_error("INVALID_INPUT", f"invalid JSON: {e}")
        return 2

    mock = args.mock or bool(payload.get("mock", False))

    if payload.get("dryRun"):
        print(json.dumps({
            "dryRun": True,
            "tool": "nrbi-render-prompt",
            "input": payload,
        }, ensure_ascii=False))
        return 0

    try:
        if mock:
            # Hermetic-CI escape hatch: a sha drift becomes a warning, not a
            # hard fail. Production (mock=false) stays strict.
            try:
                result = assemble(payload)
                result["meta"] = {"atomic_tool": "nrbi-render-prompt", "mock": True}
            except RuntimeError as e:
                if "sha256" in str(e).lower():
                    _load_frozen.cache_clear()
                    result = assemble(payload)
                    result["meta"] = {"atomic_tool": "nrbi-render-prompt", "mock": True,
                                      "sha_warning": str(e)}
                else:
                    raise
        else:
            result = assemble(payload)
            result["meta"] = {"atomic_tool": "nrbi-render-prompt", "mock": False}
    except (ValueError, KeyError) as e:
        _emit_error("INVALID_INPUT", str(e))
        return 2
    except NotImplementedError as e:
        _emit_error("NOT_IMPLEMENTED", str(e))
        return 5
    except RuntimeError as e:
        _emit_error("ATOMIC_TOOL_FAILED", str(e))
        return 4
    except Exception as e:  # noqa: BLE001
        _emit_error("INTERNAL", f"{type(e).__name__}: {e}")
        return 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        if _looks_like_json_entry(sys.argv[1:]) or not sys.argv[1:]:
            raise SystemExit(_run_json_main())
        raise SystemExit(_run_json_main())
    except SystemExit:
        raise
    except BaseException as e:  # last-resort INTERNAL envelope
        _emit_error("INTERNAL", f"{type(e).__name__}: {e}")
        raise SystemExit(1)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add tools/nrbi-render-prompt/render.py tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py
git commit -m "feat: nrbi-render-prompt JSON subprocess harness (stdin/stdout, exit codes, dryRun/mock)"
git push origin main
```

---

### Task 6: Python tool docs (`requirements.txt`, `README.md`)

**Files:**
- Create: `tools/nrbi-render-prompt/requirements.txt`
- Create: `tools/nrbi-render-prompt/README.md`

- [ ] **Step 1: Create `requirements.txt`**

```
# nrbi-render-prompt assembles prompts from the sha256-pinned frozen
# render-with-style.py, which depends ONLY on the Python 3 stdlib (`re`).
# No external packages. Hermetic by design.
```

- [ ] **Step 2: Create `README.md`**

```markdown
# nrbi-render-prompt

Deterministic NRBI Phase-1 prompt assembler. Emits a **prompt, not an image**.

`render.py` `importlib`-loads the sha256-pinned frozen
`knowledge/style-prompts/source-of-record/render-with-style.py` and calls its
prompt-assembly builders **verbatim** (zero reimplementation). Byte-identity
to the NRBI demo is guaranteed by construction and locked by
`fixtures/{anchor_golden,layer_golden}.json` (regenerate: `python3
gen_fixtures.py`).

## Contract

Input JSON (stdin via `--input -`):
`{ layer: "A|A5|B|C|D|E", category?, style_name?, variable_text{}, reference_image_urls[], mock?, dryRun? }`

Output JSON (stdout): `{ prompt, reference_image_urls, model, style_name, category, layer, meta }`.
Errors: `{"error":{"code","message"}}` on stderr; exit 0/2/4/5/1 (matting contract).

## Anchor golden definition (important)

`nrbi-anchor_tasks.json.outfit_anchors[].prompt` is the **raw upstream input**
(`#00B140`, "Korean manhwa illustration…") that `clean_anchor_prompt`
transforms. The byte-identity target is therefore the frozen
`_build_outfit_anchor_tasks` **output** over the real 73 inputs (→ `#00FF00`,
stripped CHARACTER LOCK, `+_ANCHOR_CHROMAKEY`, optional `_ANCHOR_HEADER`,
final `normalize_prompt_for_style`), captured once into `anchor_golden.json`.

## Run

```
python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q
echo '{"layer":"A","variable_text":{"orig_prompt":"…"}}' | python3 tools/nrbi-render-prompt/render.py --input -
```
```

- [ ] **Step 3: Commit**

```bash
git add tools/nrbi-render-prompt/requirements.txt tools/nrbi-render-prompt/README.md
git commit -m "docs: add nrbi-render-prompt README + requirements"
git push origin main
```

---

### Task 7: TS atomic tool (`nrbi-render-prompt.ts` + `.txt`)

**Files:**
- Create: `agent/packages/opencode/src/tool/asset/nrbi-render-prompt.ts`
- Create: `agent/packages/opencode/src/tool/asset/nrbi-render-prompt.txt`
- Test: `agent/packages/opencode/test/tool/nrbi-render-prompt.test.ts`

Clone the `cg-render.ts` factory pattern exactly: `effect/Schema` params, factory `makeNrbiRenderPromptTool({ runner?, scriptPath? })`, `Tool.define<typeof Parameters, Record<string, unknown>, never>`, `import.meta.url`-relative `DEFAULT_SCRIPT`, reuse `runPython` from `./python-runner`, runtime-decode the stdout via a `Schema.Struct` (never trust the cast), `dryRun` early-return without calling the runner, `mock` → `extraArgs: ["--mock"]`, `Effect.catch` tail, `metadata.truncated: false`.

- [ ] **Step 1: Write the failing test**

Create `agent/packages/opencode/test/tool/nrbi-render-prompt.test.ts` (mirror `test/tool/cg-render.test.ts` structure — fake `PythonRunner`, no real subprocess):

```ts
import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import { makeNrbiRenderPromptTool, Parameters } from "@/tool/asset/nrbi-render-prompt"
import type { PythonRunner } from "@/tool/asset/python-runner"
import { Truncate } from "@/tool/truncate"
import { Agent } from "@/agent/agent"
import * as Tool from "@/tool/tool"

const runtime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))
const okStdout = JSON.stringify({
  prompt: "ASSEMBLED",
  reference_image_urls: ["https://oss.example.com/ref.png"],
  model: "image-gpt",
  style_name: "YA_Impasto_character",
  category: "character series illustration",
  layer: "A",
  meta: { atomic_tool: "nrbi-render-prompt", mock: false },
})
const stubRunner = (o: Partial<{ stdout: string; stderr: string; exitCode: number }> = {}): PythonRunner =>
  async () => ({ stdout: o.stdout ?? okStdout, stderr: o.stderr ?? "", exitCode: o.exitCode ?? 0 })

function ctx(): Tool.Context {
  return { sessionID: "s", messageID: "m", abort: new AbortController().signal, metadata: () => {} } as unknown as Tool.Context
}
async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeNrbiRenderPromptTool({ runner }))
  return await Effect.runPromise(info.init())
}

describe("nrbi-render-prompt tool", () => {
  test("happy path returns the assembled prompt + decoded metadata", async () => {
    const def = await buildExec()
    const out = await def.execute({ layer: "A", variable_text: { orig_prompt: "x" } }, ctx())
    expect(out.metadata.error).toBeUndefined()
    expect(out.output).toContain("ASSEMBLED")
    expect(out.metadata.model).toBe("image-gpt")
  })

  test("dryRun does not call the runner", async () => {
    let called = false
    const def = await buildExec(async () => { called = true; return { stdout: "", stderr: "", exitCode: 0 } })
    const out = await def.execute({ layer: "A", variable_text: { orig_prompt: "x" }, dryRun: true }, ctx())
    expect(called).toBe(false)
    expect(out.metadata.dryRun).toBe(true)
  })

  test("non-zero exit surfaces as failure", async () => {
    const def = await buildExec(stubRunner({ exitCode: 2, stderr: JSON.stringify({ error: { code: "INVALID_INPUT", message: "bad" } }) }))
    const out = await def.execute({ layer: "A", variable_text: {} }, ctx())
    expect(out.metadata.error).toBe(true)
    expect(out.title).toBe("nrbi-render-prompt failed")
  })

  test("malformed stdout JSON is a parse error, not a crash", async () => {
    const def = await buildExec(stubRunner({ stdout: "not json" }))
    const out = await def.execute({ layer: "A", variable_text: {} }, ctx())
    expect(out.metadata.error).toBe(true)
  })

  test("Parameters rejects an unknown layer", () => {
    const r = Schema.decodeUnknownEither(Parameters)({ layer: "Z", variable_text: {} })
    expect(r._tag).toBe("Left")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/tool/nrbi-render-prompt.test.ts` (from `agent/packages/opencode`)
Expected: FAIL — cannot resolve `@/tool/asset/nrbi-render-prompt`.

- [ ] **Step 3: Create `nrbi-render-prompt.txt`**

```
Assemble a byte-faithful NRBI Phase-1 prompt for one asset layer.

This tool emits a PROMPT (not an image). It reproduces the frozen NRBI
render-with-style.py prompt assembly exactly. Pass `layer` (A=series
character, A5=outfit anchor, B=scene grid, C=scene square, D=scene
variant, E=ep sprite), `variable_text` (the per-layer variable fields),
and caller-resolved `reference_image_urls` in dependency order. The
returned `prompt` + `reference_image_urls` + `model` feed
`generate-image-gpt` verbatim. Layer E requires reference_image_urls
(series portrait as image-1). Never tweak the returned prompt wording.
```

- [ ] **Step 4: Write `nrbi-render-prompt.ts`**

Create `agent/packages/opencode/src/tool/asset/nrbi-render-prompt.ts` (mirror `cg-render.ts`):

```ts
import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "../tool"
import { runPython, type PythonRunner } from "./python-runner"
import DESCRIPTION from "./nrbi-render-prompt.txt"

const TOOL_ID = "nrbi-render-prompt"

const Layer = Schema.Literal("A", "A5", "B", "C", "D", "E")
const HttpsUrl = Schema.String.pipe(Schema.pattern(/^https:\/\/.+/))

export const Parameters = Schema.Struct({
  layer: Layer,
  category: Schema.optional(Schema.String),
  style_name: Schema.optional(Schema.String),
  variable_text: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  reference_image_urls: Schema.optional(Schema.Array(HttpsUrl)),
  mock: Schema.optional(Schema.Boolean),
  dryRun: Schema.optional(Schema.Boolean),
})

const NrbiResult = Schema.Struct({
  prompt: Schema.String,
  reference_image_urls: Schema.Array(Schema.String),
  model: Schema.String,
  style_name: Schema.String,
  category: Schema.String,
  layer: Schema.String,
  meta: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
})

export interface MakeNrbiRenderPromptToolOpts {
  runner?: PythonRunner
  scriptPath?: string
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")
const DEFAULT_SCRIPT = path.join(REPO_ROOT, "tools", "nrbi-render-prompt", "render.py")

export function makeNrbiRenderPromptTool(opts: MakeNrbiRenderPromptToolOpts = {}) {
  const runner = opts.runner ?? runPython
  const scriptPath = opts.scriptPath ?? DEFAULT_SCRIPT
  return Tool.define<typeof Parameters, Record<string, unknown>, never>(
    TOOL_ID,
    Effect.gen(function* () {
      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: Schema.Schema.Type<typeof Parameters>, c: Tool.Context) =>
          Effect.gen(function* () {
            const input = {
              layer: params.layer,
              category: params.category,
              style_name: params.style_name,
              variable_text: params.variable_text,
              reference_image_urls: params.reference_image_urls ?? [],
              mock: params.mock ?? false,
              dryRun: params.dryRun ?? false,
            }
            if (params.dryRun) {
              return {
                title: `${TOOL_ID} (dry run)`,
                output: JSON.stringify({ tool: TOOL_ID, script: scriptPath, input }, null, 2),
                metadata: { truncated: false, dryRun: true },
              }
            }
            const extraArgs = params.mock ? ["--mock"] : []
            const result = yield* Effect.tryPromise({
              try: () => runner({ script: scriptPath, input, extraArgs, timeoutMs: 120_000, signal: c.abort }),
              catch: (e) => new Error(`${TOOL_ID} subprocess error: ${e instanceof Error ? e.message : String(e)}`),
            })
            if (result.exitCode !== 0) {
              return {
                title: `${TOOL_ID} failed`,
                output: result.stderr || result.stdout,
                metadata: { truncated: false, error: true, exitCode: result.exitCode, stderr: result.stderr, scriptPath },
              }
            }
            let parsed: unknown
            try {
              parsed = JSON.parse(result.stdout)
            } catch {
              return {
                title: `${TOOL_ID} parse error`,
                output: result.stdout,
                metadata: { truncated: false, error: true },
              }
            }
            const decoded = yield* Schema.decodeUnknownEffect(NrbiResult)(parsed).pipe(
              Effect.mapError((e) => new Error(`${TOOL_ID} bad stdout shape: ${e}`)),
            )
            return {
              title: `${TOOL_ID} ${decoded.layer}`,
              output: JSON.stringify(decoded),
              metadata: {
                truncated: false,
                model: decoded.model,
                styleName: decoded.style_name,
                category: decoded.category,
                layer: decoded.layer,
                refCount: decoded.reference_image_urls.length,
                mock: params.mock ?? false,
              },
            }
          }).pipe(
            Effect.catchAll((err) =>
              Effect.succeed({
                title: `${TOOL_ID} failed`,
                output: `${TOOL_ID} error: ${err instanceof Error ? err.message : String(err)}`,
                metadata: { truncated: false, error: true, message: err instanceof Error ? err.message : String(err) },
              }),
            ),
          ),
      }
    }),
  )
}

export const NrbiRenderPromptTool = makeNrbiRenderPromptTool()
```

> If any imported symbol path (`../tool`, `./python-runner`, `Tool.define` signature, `Tool.Context`) differs from `cg-render.ts`, copy it verbatim from `agent/packages/opencode/src/tool/asset/cg-render.ts` — that file is the authoritative pattern. Do not invent APIs.

- [ ] **Step 5: Run test to verify it passes**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/tool/nrbi-render-prompt.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add agent/packages/opencode/src/tool/asset/nrbi-render-prompt.ts agent/packages/opencode/src/tool/asset/nrbi-render-prompt.txt agent/packages/opencode/test/tool/nrbi-render-prompt.test.ts
git commit -m "feat: add nrbi-render-prompt TS atomic tool (cg-render factory pattern)"
git push origin main
```

---

### Task 8: Register the tool in `registry.ts` (4 sites)

**Files:**
- Modify: `agent/packages/opencode/src/tool/registry.ts`

- [ ] **Step 1: Read the 4 precedent sites**

Run: `grep -n "CgRenderTool\|cgRender" agent/packages/opencode/src/tool/registry.ts`
Expected: ~4 lines (import near line 23; `const cgRender = yield* CgRenderTool` near 143; `cgRender: Tool.init(cgRender),` near 249; `tool.cgRender,` near 286). Use these exact lines as the precedent.

- [ ] **Step 2: Write the failing test (append to `test/tool/nrbi-render-prompt.test.ts`)**

```ts
import { Registry } from "@/tool/registry"

test("nrbi-render-prompt is registered as a builtin tool", async () => {
  const tools = await runtime.runPromise(Registry.tools())
  const ids = tools.map((t: { id: string }) => t.id)
  expect(ids).toContain("nrbi-render-prompt")
})
```

> If `Registry.tools()` is not the actual accessor, copy the exact assertion used by an existing registry test (grep `test/tool` for a test that enumerates builtin tool ids) and mirror it.

- [ ] **Step 3: Run test to verify it fails**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/tool/nrbi-render-prompt.test.ts -t "registered as a builtin"`
Expected: FAIL — `nrbi-render-prompt` not in builtin ids.

- [ ] **Step 4: Apply the 4-site edit**

In `agent/packages/opencode/src/tool/registry.ts`, mirroring the `cgRender` lines:

1. Import (next to `import { CgRenderTool } from "./asset/cg-render"`):
```ts
import { NrbiRenderPromptTool } from "./asset/nrbi-render-prompt"
```
2. Bind (next to `const cgRender = yield* CgRenderTool`):
```ts
const nrbiRenderPrompt = yield* NrbiRenderPromptTool
```
3. Init map (next to `cgRender: Tool.init(cgRender),`):
```ts
nrbiRenderPrompt: Tool.init(nrbiRenderPrompt),
```
4. Builtin array (next to `tool.cgRender,`):
```ts
tool.nrbiRenderPrompt,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/tool/nrbi-render-prompt.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add agent/packages/opencode/src/tool/registry.ts agent/packages/opencode/test/tool/nrbi-render-prompt.test.ts
git commit -m "feat: register nrbi-render-prompt in the builtin tool registry"
git push origin main
```

---

### Task 9: Register in `llm-generator.ts` ATOMIC_TOOLS

**Files:**
- Modify: `agent/packages/opencode/src/business/asset-service/llm-generator.ts`
- Test: `agent/packages/opencode/test/business/asset-service/llm-generator.test.ts`

Without this, skill bodies cannot allowlist `nrbi-render-prompt` (`parseAllowlist` validates against `KNOWN_TOOL_IDS = new Set(Object.keys(ATOMIC_TOOLS))`, currently 17 ids; `nrbi-render-prompt` is absent) and the loop cannot wire it.

- [ ] **Step 1: Write the failing test (append to `llm-generator.test.ts`)**

```ts
test("nrbi-render-prompt is a known atomic tool and parses in an allowlist", () => {
  const body = "## Atomic tools (allowed)\n\n- `nrbi-render-prompt` — assembler\n- `generate-image-gpt` — render\n- `oss-put` — upload\n"
  const allow = parseAllowlist(body)
  expect(allow).toContain("nrbi-render-prompt")
  expect(allow).toContain("generate-image-gpt")
})
```

> Confirm `parseAllowlist` is exported from `llm-generator.ts` (it is — line 107 `export function parseAllowlist`). Import it the same way the existing `llm-generator.test.ts` imports from the module.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/llm-generator.test.ts -t "known atomic tool"`
Expected: FAIL — `allow` does not contain `nrbi-render-prompt` (not in `KNOWN_TOOL_IDS`).

- [ ] **Step 3: Apply the edit**

In `agent/packages/opencode/src/business/asset-service/llm-generator.ts`:

Add import (next to `import { CgRenderTool } from "@/tool/asset/cg-render"`, line 38):
```ts
import { NrbiRenderPromptTool } from "@/tool/asset/nrbi-render-prompt"
```

Add map entry inside `ATOMIC_TOOLS` (next to `"cg-render": asInfoEffect(CgRenderTool),`, line 76):
```ts
  "nrbi-render-prompt": asInfoEffect(NrbiRenderPromptTool),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/llm-generator.test.ts -t "known atomic tool"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/packages/opencode/src/business/asset-service/llm-generator.ts agent/packages/opencode/test/business/asset-service/llm-generator.test.ts
git commit -m "feat: register nrbi-render-prompt in llm-generator ATOMIC_TOOLS"
git push origin main
```

---

### Task 10: Register skill bodies in `intent-to-skill.ts`

**Files:**
- Modify: `agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`
- Test: `agent/packages/opencode/test/business/asset-service/intent-to-skill.test.ts`

Append-only, no `DEFAULT_KIND_SKILL_MAP` / `AssetKind` change (no-kind pattern — D5). **Warning:** `llm-generator.test.ts` has a parametrized `test.each([...ASSET_GENERATION_SKILLS])` disk-loader gate that auto-adds a case per registered skill — after this task it WILL fail until Tasks 11–12 create the body files. That is expected; the subagent-driven order keeps Task 10→12 contiguous. (If running plan tasks strictly isolated, do Task 10's registry edit and Tasks 11–12's body files in one combined commit-set; the recommended execution does Task 10 then 11 then 12 back-to-back.)

- [ ] **Step 1: Update the failing membership test + add picker/hint tests**

In `agent/packages/opencode/test/business/asset-service/intent-to-skill.test.ts`, in the membership test's `expected` array, append:
```ts
    "outfit-anchor-spec",
    "ep-sprite-spec",
```
Add (mirroring the existing matting/cutout picker + skill_hint block):
```ts
test("outfit-anchor-spec / ep-sprite-spec are picker-selectable (B1 no-kind bodies)", async () => {
  for (const skill of ["outfit-anchor-spec", "ep-sprite-spec"] as const) {
    const picker: SkillPicker = { async pick() { return skill } }
    const result = await intentToSkill({ intent: intent({ kind: "cg" }), picker })
    expect(result).toBe(skill)
  }
})

test("outfit-anchor-spec / ep-sprite-spec are reachable via skill_hint", async () => {
  for (const skill of ["outfit-anchor-spec", "ep-sprite-spec"] as const) {
    const result = await intentToSkill({ intent: intent({ kind: "cg" }), preferences: { skill_hint: skill } })
    expect(result).toBe(skill)
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/intent-to-skill.test.ts`
Expected: FAIL — membership set-equality mismatch + picker tests reject unregistered skills.

- [ ] **Step 3: Apply the registry edit**

In `agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`, replace the trailing `"cutout-spec",\n] as const` of `ASSET_GENERATION_SKILLS` with:

```ts
  "matting-spec",
  "cutout-spec",
  // B1 (spec §15 r1.15) — NRBI Phase-1 render-prompt bodies. Like
  // upscale-spec these have NO AssetKind — reachable via skill_hint /
  // picker only, absent from DEFAULT_KIND_SKILL_MAP. Appended at the end
  // to keep ordinal / snapshot expectations stable.
  "outfit-anchor-spec",
  "ep-sprite-spec",
] as const
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/intent-to-skill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/packages/opencode/src/business/asset-service/intent-to-skill.ts agent/packages/opencode/test/business/asset-service/intent-to-skill.test.ts
git commit -m "feat: register outfit-anchor-spec + ep-sprite-spec skill bodies (B1, no-kind)"
git push origin main
```

---

### Task 11: New skill body `outfit-anchor-spec.md` (Layer A.5)

**Files:**
- Create: `knowledge/asset-generation/outfit-anchor-spec.md`
- Test: `agent/packages/opencode/test/business/asset-service/llm-generator.test.ts` (existing `test.each` disk-loader gate)

Mirror `character-portrait-spec.md`'s 6-section structure. The `## Atomic tools (allowed)` section MUST list `nrbi-render-prompt` + `generate-image-gpt` + `oss-put` (all in `KNOWN_TOOL_IDS` after Task 9).

- [ ] **Step 1: Run the disk-loader gate to see it fail for this body**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/llm-generator.test.ts -t "outfit-anchor-spec loads via defaultLoadSkill"`
Expected: FAIL — `skill body not found for "outfit-anchor-spec"`.

- [ ] **Step 2: Create `knowledge/asset-generation/outfit-anchor-spec.md`**

```markdown
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
```

- [ ] **Step 3: Run the disk-loader gate to verify it passes**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/llm-generator.test.ts -t "outfit-anchor-spec loads via defaultLoadSkill"`
Expected: PASS (allowlist non-empty: `nrbi-render-prompt`, `generate-image-gpt`, `oss-put`).

- [ ] **Step 4: Commit**

```bash
git add knowledge/asset-generation/outfit-anchor-spec.md
git commit -m "feat: add outfit-anchor-spec skill body (Layer A.5)"
git push origin main
```

---

### Task 12: New skill body `ep-sprite-spec.md` (Layer E)

**Files:**
- Create: `knowledge/asset-generation/ep-sprite-spec.md`
- Test: existing `llm-generator.test.ts` disk-loader gate

- [ ] **Step 1: Run the disk-loader gate to see it fail**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/llm-generator.test.ts -t "ep-sprite-spec loads via defaultLoadSkill"`
Expected: FAIL — body not found.

- [ ] **Step 2: Create `knowledge/asset-generation/ep-sprite-spec.md`**

```markdown
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
```

- [ ] **Step 3: Run the disk-loader gate to verify it passes**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/llm-generator.test.ts -t "ep-sprite-spec loads via defaultLoadSkill"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add knowledge/asset-generation/ep-sprite-spec.md
git commit -m "feat: add ep-sprite-spec skill body (Layer E)"
git push origin main
```

---

### Task 13: Update existing bodies to route through `nrbi-render-prompt`

**Files:**
- Modify: `knowledge/asset-generation/character-portrait-spec.md`
- Modify: `knowledge/asset-generation/scene-bg-spec.md`
- Modify: `knowledge/asset-generation/README.md`

- [ ] **Step 1: Update `character-portrait-spec.md` `## Atomic tools (allowed)`**

Add `nrbi-render-prompt` as the first bullet (keep `generate-image-gpt` + `oss-put`; `generate-image-nanobanana` may stay as the non-NRBI fallback). Prepend to the section body:

```markdown
- `nrbi-render-prompt` — when the request is an NRBI series character
  (Layer A), assemble the prompt with `layer: "A"`,
  `variable_text: { orig_prompt: <upstream appearance prompt>, subject_id:
  <char_id> }`. Use the returned `prompt`/`model` verbatim, then
  `generate-image-gpt`. For non-NRBI portraits, skip this and use the
  image-gen tools directly.
```

- [ ] **Step 2: Update `scene-bg-spec.md` `## Atomic tools (allowed)`**

Prepend:

```markdown
- `nrbi-render-prompt` — for NRBI scenes: Layer B (scene grid,
  `variable_text: { location_name }`), Layer C (scene square,
  `variable_text: { sub_location_name }`, ref = grid url), Layer D (scene
  variant, `variable_text: { variant_id, base_scene_id, prompt }`, ref =
  square url). The grid (Layer B) is an internal intermediate — do NOT
  `oss-put` it as a delivered asset; only C/D outputs are delivered. Use
  returned `prompt`/`model` verbatim → `generate-image-gpt`.
```

- [ ] **Step 3: Update `README.md` index**

Add two rows to the skill-body index table listing `outfit-anchor-spec` (Layer A.5) and `ep-sprite-spec` (Layer E) as B1 no-kind bodies.

- [ ] **Step 4: Verify the loader gate still green for the edited bodies**

Run: `PATH=$HOME/.bun/bin:$PATH bun test test/business/asset-service/llm-generator.test.ts -t "loads via defaultLoadSkill"`
Expected: PASS for all (including `character-portrait-spec`, `scene-bg-spec` — `nrbi-render-prompt` now a known id, sections still parse).

- [ ] **Step 5: Commit (two atomic commits — body wiring vs. index doc)**

```bash
git add knowledge/asset-generation/character-portrait-spec.md knowledge/asset-generation/scene-bg-spec.md
git commit -m "feat: route NRBI Layer A/B/C/D through nrbi-render-prompt in existing skill bodies"
git add knowledge/asset-generation/README.md
git commit -m "docs: index outfit-anchor-spec + ep-sprite-spec in asset-generation README"
git push origin main
```

---

### Task 14: Design-doc consistency clarification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-18-b1-nrbi-render-prompt-design.md`

The design §7.1 says the anchor golden is "byte-for-byte equal to the recorded prompt". Ground truth: the recorded `prompt` is the *raw input* to `clean_anchor_prompt`. Add one clarifying sentence so design ↔ plan agree (no decision change — §7.2 already states "strict reproduction is defined as what render-with-style.py produces").

- [ ] **Step 1: Edit §7.1**

Append to the §7.1 paragraph:

```markdown
   > **Clarification (plan-time, ground-truth):** the recorded
   > `outfit_anchors[].prompt` is the *raw upstream input* to
   > `clean_anchor_prompt`, not the assembled output. The byte-identity
   > target is therefore the frozen `_build_outfit_anchor_tasks` **output**
   > over those 73 real inputs (→ `#00FF00`, stripped CHARACTER LOCK,
   > `+_ANCHOR_CHROMAKEY`, optional `_ANCHOR_HEADER`, final
   > `normalize_prompt_for_style`), captured once into the committed
   > `anchor_golden.json` and regenerable via `gen_fixtures.py`. This is
   > the §7.2 principle applied to the anchor layer; the 73 real inputs
   > make it genuine NRBI reproduction, not synthetic.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-18-b1-nrbi-render-prompt-design.md
git commit -m "docs: clarify B1 design §7.1 anchor golden = frozen-reference output"
git push origin main
```

---

### Task 15: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full Python suite**

Run: `python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q`
Expected: PASS, all (loader×2, regenerability, layer goldens, 73 anchors, CLI/error/dryRun/mock/roundtrip).

- [ ] **Step 2: Run the affected bun suites**

Run (from `agent/packages/opencode`):
```bash
PATH=$HOME/.bun/bin:$PATH bun test test/tool/nrbi-render-prompt.test.ts test/business/asset-service/intent-to-skill.test.ts test/business/asset-service/llm-generator.test.ts
```
Expected: PASS, all (incl. the parametrized `test.each` disk-loader gate now covering 12 skills).

- [ ] **Step 3: Full repo bun test (regression sweep)**

Run: `PATH=$HOME/.bun/bin:$PATH bun test`
Expected: PASS (no regression in registry / asset-service / tool suites). Investigate and fix any red before closing.

- [ ] **Step 4: Write the B1 verification report**

Create `docs/superpowers/specs/2026-05-18-b1-nrbi-render-prompt-verification.md`: tick each design §1–§9 acceptance item (D1 strict=73-anchor + 5-layer byte-identity green; D2 full scope=A/A5/B/C/D/E covered; D3 #00FF00=frozen `clean_*` + golden lock; D4 frozen subprocess=Tasks 1–6; D5 no-kind=Task 10 append-only, no `DEFAULT_KIND_SKILL_MAP`/`AssetKind` change; D6 remote urls echoed as-is). Note any deviation.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-18-b1-nrbi-render-prompt-verification.md
git commit -m "docs: B1 verification report (all acceptance items green)"
git push origin main
```

---

## Self-Review (run by plan author, completed)

**1. Spec coverage:** design §1 (goal) → Tasks 1–7; §2 (3-phase, iron rule) → Background + frozen-verbatim Tasks 3–4; §3 D1 → Tasks 2–5 golden; D2 → Tasks 3–4 all 6 layers; D3 → frozen `clean_*` + golden (Tasks 2–4); D4 → Tasks 1–6; D5 → Task 10 (append-only, no kind map); D6 → tool echoes caller refs (Tasks 3–4,7); §4 (tool, surgery, I/O, pipeline) → Tasks 1–7; §5 (skill bodies, registry, DAG) → Tasks 8–13; §5.1 (caller-supplied refs) → Tasks 4/11/12 (E ref guard, body instructions); §6 (errors) → Task 1 (sha), 4 (E guard), 5 (exit codes/envelopes); §7 (testing) → Tasks 2–5,7; §7.1 ambiguity → Task 14; §8 (non-goals) → no full-DAG/no-rehost/no-new-kind tasks present; §9 (governance) → r1.15 already committed + Task 14. No gaps.

**2. Placeholder scan:** every code step shows complete code; the only "read the precedent and mirror" instructions (registry 4 sites, ATOMIC_TOOLS entry, registry test accessor) cite exact in-repo precedent lines with grep commands and the verbatim shape to copy — bounded lookups, not hand-waving. No TBD/TODO.

**3. Type consistency:** Python `assemble(payload)->dict` returns the same keys consumed by the harness and asserted in tests (`prompt`/`reference_image_urls`/`model`/`style_name`/`category`/`layer`/`meta`). TS `NrbiResult` Schema matches that exact shape. `makeNrbiRenderPromptTool`/`Parameters`/`NrbiRenderPromptTool` names consistent across Tasks 7–9. Layer codes `A|A5|B|C|D|E` consistent in Python `_LAYER_CATEGORY`, TS `Schema.Literal`, fixtures, and skill bodies. Category/`name` constants match verified `styles.json` (`character series illustration`→`YA_Impasto_character`, etc.).
