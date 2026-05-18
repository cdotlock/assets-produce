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
    assert with_ref["prompt"].startswith(mod._load_frozen()._ANCHOR_HEADER)


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


def test_cli_non_object_json_exit_2():
    for body in ("42", '"x"', "[1, 2]", "null"):
        p = _run(body)
        assert p.returncode == 2, (body, p.stdout, p.stderr)
        assert p.stdout.strip() == ""
        assert _json.loads(p.stderr)["error"]["code"] == "INVALID_INPUT"


def test_cli_input_file_not_utf8(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_bytes(b'\xff\xfe{"layer": "A"}')
    p = _run("", args=["--input", str(bad)])
    assert p.returncode == 2
    assert _json.loads(p.stderr)["error"]["code"] == "INVALID_INPUT"
