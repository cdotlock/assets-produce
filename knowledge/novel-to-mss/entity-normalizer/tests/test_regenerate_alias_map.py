"""Tests for regenerate_alias_map.py."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Dict

import pytest

from regenerate_alias_map import (
    AliasConflictError,
    build_alias_map,
    regenerate,
)


@pytest.fixture
def project_with_stale_alias_map(
    tmp_path: Path, write_json: Callable[[Path, Dict[str, Any]], None]
) -> Path:
    """Project whose alias_map.json has one orphan entry and one missing entry.

    Regen should drop ``Zombie`` (orphan in alias_map) and add ``Heart`` +
    ``Bobby`` + location aliases (missing from alias_map).
    """
    normalizer = tmp_path / "04-entity-normalizer"
    write_json(
        normalizer / "characters.json",
        {
            "characters": {
                "alice": {
                    "full_name": "Alice",
                    "role": "MC",
                    "aliases": ["Ally", "Heart"],
                    "bible_file": "mc-bible-alice.md",
                },
                "bob": {
                    "full_name": "Bob",
                    "role": "LI",
                    "aliases": ["Bobby"],
                    "bible_file": "li-bible-bob.md",
                },
            }
        },
    )
    write_json(
        normalizer / "locations.json",
        {
            "locations": {
                "school": {
                    "full_name": "Prep",
                    "sub_locations": {"school_hall": "Hallway"},
                    "aliases": ["the prep", "Prep"],
                },
            }
        },
    )
    write_json(
        normalizer / "alias_map.json",
        {
            "character_aliases": {"Ally": "alice", "Zombie": "alice"},
            "location_aliases": {},
        },
    )
    return normalizer


def test_regenerate_produces_canonical_alias_map(
    project_with_stale_alias_map: Path,
) -> None:
    normalizer = project_with_stale_alias_map
    regenerate(normalizer, dry_run=False, validate=False)
    amap = json.loads((normalizer / "alias_map.json").read_text("utf-8"))
    assert amap["character_aliases"] == {
        "Ally": "alice",
        "Bobby": "bob",
        "Heart": "alice",
    }
    assert amap["location_aliases"] == {
        "Prep": "school",
        "the prep": "school",
    }


def test_regenerate_sorts_keys_alphabetically(
    project_with_stale_alias_map: Path,
) -> None:
    normalizer = project_with_stale_alias_map
    regenerate(normalizer, dry_run=False, validate=False)
    data = json.loads((normalizer / "alias_map.json").read_text("utf-8"))
    assert list(data["character_aliases"].keys()) == sorted(
        data["character_aliases"].keys()
    )
    assert list(data["location_aliases"].keys()) == sorted(
        data["location_aliases"].keys()
    )


def test_regenerate_detects_duplicate_alias_across_chars(
    project_with_stale_alias_map: Path,
) -> None:
    normalizer = project_with_stale_alias_map
    chars = json.loads((normalizer / "characters.json").read_text("utf-8"))
    chars["characters"]["alice"]["aliases"].append("Boss")
    chars["characters"]["bob"]["aliases"].append("Boss")
    (normalizer / "characters.json").write_text(
        json.dumps(chars), encoding="utf-8"
    )
    with pytest.raises(AliasConflictError, match="Boss"):
        regenerate(normalizer, dry_run=False, validate=False)


def test_regenerate_dry_run_does_not_write(
    project_with_stale_alias_map: Path,
) -> None:
    normalizer = project_with_stale_alias_map
    before = (normalizer / "alias_map.json").read_text("utf-8")
    regenerate(normalizer, dry_run=True, validate=False)
    after = (normalizer / "alias_map.json").read_text("utf-8")
    assert before == after


def test_regenerate_validates_result_by_default(
    project_with_stale_alias_map: Path,
) -> None:
    """Default validate=True actually exercises the validator.

    Starting state: alias_map has a stale ``Zombie`` orphan entry and is
    missing ``Heart``/``Bobby``/location aliases — ``validate_all`` would
    FAIL on this starting state. After ``regenerate`` rewrites alias_map
    from canonical, the post-regen validate pass must succeed, proving the
    validate branch was actually run (rather than silently skipped).
    """
    from validate_normalizer import ValidationError, validate_all

    normalizer = project_with_stale_alias_map

    # Sanity check: the starting fixture is indeed invalid pre-regen.
    with pytest.raises(ValidationError):
        validate_all(normalizer)

    # Default validate=True should regen AND pass post-regen validation.
    regenerate(normalizer, dry_run=False, validate=True)


def test_regenerate_validate_propagates_post_regen_failure(
    project_with_stale_alias_map: Path,
) -> None:
    """If the post-regen state is still invalid, validate=True must raise.

    Constructs a state that regen alone can't fix: characters.json has a
    ``role`` that's not in the valid enum. After regen, alias_map will be
    rebuilt but the ``role`` error remains — validate must surface it.
    """
    from validate_normalizer import ValidationError

    normalizer = project_with_stale_alias_map
    chars = json.loads((normalizer / "characters.json").read_text("utf-8"))
    chars["characters"]["alice"]["role"] = "protagonist"  # not in VALID_ROLES
    (normalizer / "characters.json").write_text(
        json.dumps(chars), encoding="utf-8"
    )

    with pytest.raises(ValidationError, match="role"):
        regenerate(normalizer, dry_run=False, validate=True)


def test_build_alias_map_is_pure() -> None:
    """build_alias_map is a pure function — no I/O, deterministic."""
    characters = {
        "characters": {
            "a": {
                "full_name": "A",
                "role": "MC",
                "aliases": ["Alpha"],
                "bible_file": "a.md",
            }
        }
    }
    locations = {
        "locations": {
            "x": {
                "full_name": "X",
                "sub_locations": {"x_1": "1"},
                "aliases": ["xxx"],
            }
        }
    }
    result = build_alias_map(characters, locations)
    assert result == {
        "character_aliases": {"Alpha": "a"},
        "location_aliases": {"xxx": "x"},
    }


def test_build_alias_map_detects_location_collision() -> None:
    characters: Dict[str, Any] = {"characters": {}}
    locations = {
        "locations": {
            "a": {
                "full_name": "A",
                "sub_locations": {},
                "aliases": ["shared"],
            },
            "b": {
                "full_name": "B",
                "sub_locations": {},
                "aliases": ["shared"],
            },
        }
    }
    with pytest.raises(AliasConflictError, match="shared"):
        build_alias_map(characters, locations)
