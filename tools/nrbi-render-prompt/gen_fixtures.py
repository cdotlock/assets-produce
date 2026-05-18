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
        no_ref = frozen.normalize_prompt_for_style(tasks[0]["prompt"], char_family)
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
