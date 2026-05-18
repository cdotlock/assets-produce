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
