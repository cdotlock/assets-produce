"""Tests for validate_normalizer.py.

Each test writes a minimal project under ``tmp_path`` so cases are
independent of any shared fixture. This keeps failures actionable:
one broken case doesn't cascade through the suite.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Dict

import pytest

from validate_normalizer import ValidationError, validate_all


@pytest.fixture
def minimal_valid_project(
    tmp_path: Path, write_json: Callable[[Path, Dict[str, Any]], None]
) -> Path:
    """Write a tiny valid project and return the normalizer dir."""
    normalizer = tmp_path / "04-entity-normalizer"
    write_json(
        normalizer / "characters.json",
        {
            "characters": {
                "alice": {
                    "full_name": "Alice Ann",
                    "role": "MC",
                    "aliases": ["Al"],
                    "bible_file": "mc-bible-alice.md",
                },
                "dad": {
                    "full_name": "Adam Ann",
                    "role": "supporting",
                    "aliases": ["Pops"],
                    "relation": "Alice's father",
                },
            }
        },
    )
    write_json(
        normalizer / "locations.json",
        {
            "locations": {
                "school": {
                    "full_name": "Westbluff Prep",
                    "sub_locations": {
                        "school_hall": "Hallway",
                    },
                    "aliases": ["the prep"],
                },
            }
        },
    )
    write_json(
        normalizer / "alias_map.json",
        {
            "character_aliases": {"Al": "alice", "Pops": "dad"},
            "location_aliases": {"the prep": "school"},
        },
    )
    return normalizer


def test_accepts_minimal_valid_project(minimal_valid_project: Path) -> None:
    normalizer = minimal_valid_project
    # MC bible file doesn't exist in tmp_path/02-character-architect → check
    # is skipped because that directory is absent. Must not raise.
    validate_all(normalizer)


def test_rejects_character_missing_full_name(minimal_valid_project: Path) -> None:
    normalizer = minimal_valid_project
    chars = json.loads((normalizer / "characters.json").read_text("utf-8"))
    del chars["characters"]["alice"]["full_name"]
    (normalizer / "characters.json").write_text(json.dumps(chars), encoding="utf-8")
    with pytest.raises(ValidationError, match="full_name"):
        validate_all(normalizer)


def test_rejects_invalid_role_enum(minimal_valid_project: Path) -> None:
    normalizer = minimal_valid_project
    chars = json.loads((normalizer / "characters.json").read_text("utf-8"))
    chars["characters"]["alice"]["role"] = "protagonist"
    (normalizer / "characters.json").write_text(json.dumps(chars), encoding="utf-8")
    with pytest.raises(ValidationError, match="role"):
        validate_all(normalizer)


def test_rejects_mc_without_bible_file(minimal_valid_project: Path) -> None:
    normalizer = minimal_valid_project
    chars = json.loads((normalizer / "characters.json").read_text("utf-8"))
    del chars["characters"]["alice"]["bible_file"]
    (normalizer / "characters.json").write_text(json.dumps(chars), encoding="utf-8")
    with pytest.raises(ValidationError, match="bible_file"):
        validate_all(normalizer)


def test_rejects_supporting_without_relation(minimal_valid_project: Path) -> None:
    normalizer = minimal_valid_project
    chars = json.loads((normalizer / "characters.json").read_text("utf-8"))
    del chars["characters"]["dad"]["relation"]
    (normalizer / "characters.json").write_text(json.dumps(chars), encoding="utf-8")
    with pytest.raises(ValidationError, match="relation"):
        validate_all(normalizer)


def test_rejects_sub_location_not_starting_with_parent_id(minimal_valid_project: Path) -> None:
    normalizer = minimal_valid_project
    locs = json.loads((normalizer / "locations.json").read_text("utf-8"))
    locs["locations"]["school"]["sub_locations"] = {"hallway": "Hallway"}
    (normalizer / "locations.json").write_text(json.dumps(locs), encoding="utf-8")
    # alias_map references school, not hallway; keep as-is
    with pytest.raises(ValidationError, match="sub_location"):
        validate_all(normalizer)


def test_rejects_duplicate_sub_location_id_across_parents(minimal_valid_project: Path) -> None:
    normalizer = minimal_valid_project
    locs = json.loads((normalizer / "locations.json").read_text("utf-8"))
    # Add a second parent location whose sub_location key collides with school_hall
    # (the prefix rule still holds individually — this test covers the
    # cross-parent uniqueness rule specifically)
    locs["locations"]["school_annex"] = {
        "full_name": "Annex",
        "sub_locations": {"school_hall": "Annex hallway"},
        "aliases": [],
    }
    (normalizer / "locations.json").write_text(json.dumps(locs), encoding="utf-8")
    with pytest.raises(ValidationError, match="duplicate"):
        validate_all(normalizer)


def test_rejects_alias_map_pointing_to_nonexistent_char(minimal_valid_project: Path) -> None:
    normalizer = minimal_valid_project
    amap = json.loads((normalizer / "alias_map.json").read_text("utf-8"))
    amap["character_aliases"]["Ghost"] = "ghost_char"
    (normalizer / "alias_map.json").write_text(json.dumps(amap), encoding="utf-8")
    with pytest.raises(ValidationError, match="ghost_char"):
        validate_all(normalizer)


def test_rejects_alias_in_characters_but_not_in_alias_map(minimal_valid_project: Path) -> None:
    """Canonical → alias_map sync gap."""
    normalizer = minimal_valid_project
    amap = json.loads((normalizer / "alias_map.json").read_text("utf-8"))
    del amap["character_aliases"]["Al"]
    (normalizer / "alias_map.json").write_text(json.dumps(amap), encoding="utf-8")
    with pytest.raises(ValidationError, match="Al"):
        validate_all(normalizer)


def test_rejects_alias_in_alias_map_but_not_in_characters(minimal_valid_project: Path) -> None:
    """Reverse sync gap: alias_map has a mapping that's not in characters.aliases."""
    normalizer = minimal_valid_project
    amap = json.loads((normalizer / "alias_map.json").read_text("utf-8"))
    amap["character_aliases"]["Stray"] = "alice"  # alice.aliases = ["Al"]
    (normalizer / "alias_map.json").write_text(json.dumps(amap), encoding="utf-8")
    with pytest.raises(ValidationError, match="Stray"):
        validate_all(normalizer)


def test_rejects_bible_file_missing_on_disk(
    tmp_path: Path, minimal_valid_project: Path
) -> None:
    normalizer = minimal_valid_project
    # Create the 02 dir BUT don't put alice's bible in it
    (tmp_path / "02-character-architect").mkdir()
    with pytest.raises(ValidationError, match="mc-bible-alice"):
        validate_all(normalizer)


def test_skips_bible_file_check_when_02_dir_absent(minimal_valid_project: Path) -> None:
    """Minimal fixtures never have 02-character-architect; don't trip on them."""
    normalizer = minimal_valid_project
    # 02-character-architect intentionally absent
    validate_all(normalizer)  # must not raise


def test_rejects_location_alias_map_pointing_to_nonexistent_location(
    minimal_valid_project: Path,
) -> None:
    normalizer = minimal_valid_project
    amap = json.loads((normalizer / "alias_map.json").read_text("utf-8"))
    amap["location_aliases"]["phantom"] = "nowhere"
    (normalizer / "alias_map.json").write_text(json.dumps(amap), encoding="utf-8")
    with pytest.raises(ValidationError, match="nowhere"):
        validate_all(normalizer)


def test_rejects_location_alias_in_locations_but_not_in_alias_map(
    minimal_valid_project: Path,
) -> None:
    normalizer = minimal_valid_project
    amap = json.loads((normalizer / "alias_map.json").read_text("utf-8"))
    del amap["location_aliases"]["the prep"]
    (normalizer / "alias_map.json").write_text(json.dumps(amap), encoding="utf-8")
    with pytest.raises(ValidationError, match="the prep"):
        validate_all(normalizer)
