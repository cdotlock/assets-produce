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
