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
import json
import os
import tempfile
from pathlib import Path

# tools/nrbi-render-prompt/render.py -> parents[2] == repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
FROZEN_PATH = REPO_ROOT / "knowledge" / "style-prompts" / "source-of-record" / "render-with-style.py"
FROZEN_SHA256 = "35f55d9be989f208edf8ff59fb9fc95ba79bcfb6f680a1379ca2846272b53e06"

# Frozen category constants (mirror render-with-style.py).
CHAR_SERIES_CATEGORY = "character series illustration"
SCENE_GRID_CATEGORY = "scene grid illustration"
SCENE_SERIES_CATEGORY = "scene series illustration"
CHAR_EP_CATEGORY = "character ep illustration"


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


SOR_DIR = REPO_ROOT / "knowledge" / "style-prompts" / "source-of-record"
STYLES_JSON = SOR_DIR / "styles.json"

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
    tmp = Path("/tmp")

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
            anchor_path = Path(fh.name)
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

    return {
        "prompt": prompt,
        "reference_image_urls": refs,
        "model": model,
        "style_name": style["name"],
        "category": style["category"],
        "layer": layer,
    }
