"""Pytest config for entity-normalizer tests.

The skill directory uses a hyphen (``skills/entity-normalizer/``) to match the
superpowers skill-naming convention, which is not a valid Python package name.
This conftest puts ``scripts/`` on ``sys.path`` so tests can import the CLI
modules directly (e.g. ``from validate_normalizer import validate_all``)
instead of going through a dotted package path.

It also exposes ``write_json`` as a shared fixture so individual test modules
don't each re-declare a one-line ``_write`` helper.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Callable, Dict

import pytest

_SCRIPTS_DIR = Path(__file__).parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))


@pytest.fixture
def write_json() -> Callable[[Path, Dict[str, Any]], None]:
    """Return a helper that writes a JSON payload to ``path`` (creating parents)."""

    def _write(path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")

    return _write
