"""Pytest config for entity-rename tests.

The skill directory uses a hyphen (``skills/entity-rename/``) to match the
superpowers skill-naming convention, which is not a valid Python package name.
This conftest puts ``scripts/`` on ``sys.path`` so tests can import the CLI
modules directly (e.g. ``from validate_map_schema import validate_map``)
instead of going through a dotted package path.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))


@pytest.fixture
def fixtures_root() -> Path:
    return Path(__file__).parent.parent / "fixtures"


@pytest.fixture
def mini_project(fixtures_root: Path) -> Path:
    return fixtures_root / "mini-project"


@pytest.fixture
def rename_map_path(fixtures_root: Path) -> Path:
    return fixtures_root / "rename_map.json"
