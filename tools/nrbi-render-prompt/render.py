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
