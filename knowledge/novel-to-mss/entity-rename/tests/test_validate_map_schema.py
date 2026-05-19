"""Tests for validate_map_schema.py."""
import json
from pathlib import Path

import pytest

from validate_map_schema import validate_map, ValidationError


def test_detects_id_collision():
    rename_map = {
        "schema_version": "1.0",
        "book_slug": "test",
        "approved_at": "2026-01-01",
        "approved_by": "t",
        "decisions_doc": "x",
        "characters": {
            "alice": {"new_id": "nova", "new_full_name": "Nova", "alias_mapping": {}},
            "amy": {"new_id": "nova", "new_full_name": "Nova2", "alias_mapping": {}},
        },
        "locations": {},
        "free_tokens": {},
    }
    with pytest.raises(ValidationError, match="collision"):
        validate_map(rename_map, normalizer_dir=None)


def test_rejects_uncovered_aliases(tmp_path: Path):
    normalizer = tmp_path / "04-entity-normalizer"
    normalizer.mkdir()
    (normalizer / "characters.json").write_text(json.dumps({
        "characters": {"alice": {"full_name": "Alice", "aliases": ["Ally", "Heart"]}}
    }))
    (normalizer / "alias_map.json").write_text(json.dumps({
        "character_aliases": {"Ally": "alice", "Heart": "alice"},
        "location_aliases": {},
    }))
    (normalizer / "locations.json").write_text(json.dumps({"locations": {}}))
    rename_map = {
        "schema_version": "1.0", "book_slug": "t", "approved_at": "x",
        "approved_by": "x", "decisions_doc": "x",
        "characters": {
            "alice": {
                "new_id": "nova", "new_full_name": "Nova",
                "alias_mapping": {"Ally": "Novy"},  # missing Heart
            },
        },
        "locations": {}, "free_tokens": {},
    }
    with pytest.raises(ValidationError, match="uncovered"):
        validate_map(rename_map, normalizer_dir=normalizer)


def test_rejects_orphan_old_id(tmp_path: Path):
    normalizer = tmp_path / "04-entity-normalizer"
    normalizer.mkdir()
    (normalizer / "characters.json").write_text(json.dumps({
        "characters": {"alice": {"full_name": "Alice", "aliases": []}}
    }))
    (normalizer / "alias_map.json").write_text(json.dumps({
        "character_aliases": {}, "location_aliases": {},
    }))
    (normalizer / "locations.json").write_text(json.dumps({"locations": {}}))
    rename_map = {
        "schema_version": "1.0", "book_slug": "t", "approved_at": "x",
        "approved_by": "x", "decisions_doc": "x",
        "characters": {
            "typo_id": {"new_id": "bob", "new_full_name": "Bob", "alias_mapping": {}},
        },
        "locations": {}, "free_tokens": {},
    }
    with pytest.raises(ValidationError, match="orphan"):
        validate_map(rename_map, normalizer_dir=normalizer)


def test_metaphor_drop_no_longer_blocks_validation():
    """preserve_metaphor=True + null alias is a DESIGN SMELL, not a blocker.

    Real cases need both preservation AND selective drops (e.g., keep
    the metaphor-carrying nickname but drop the surname-alias). Hard
    guarding all nulls is too strict; the rename-reviewer sub-agent
    does the semantic check post-apply.
    """
    rename_map = {
        "schema_version": "1.0", "book_slug": "t", "approved_at": "x",
        "approved_by": "x", "decisions_doc": "x",
        "characters": {
            "alice": {
                "new_id": "nova", "new_full_name": "Nova",
                "alias_mapping": {"Butterfly": "Butterfly", "Myers": None},
                "preserve_metaphor": True,
            },
        },
        "locations": {}, "free_tokens": {},
    }
    # Must not raise — the soft check surfaces it as a warning instead.
    validate_map(rename_map, normalizer_dir=None)


def test_collect_metaphor_warnings_surfaces_drop():
    """Soft-check helper returns a warning per (char, dropped-alias) pair."""
    from validate_map_schema import collect_metaphor_warnings

    rename_map = {
        "characters": {
            "alice": {
                "new_id": "nova", "new_full_name": "Nova",
                "alias_mapping": {"Butterfly": "Butterfly", "Myers": None},
                "preserve_metaphor": True,
            },
            "bob": {
                "new_id": "reid", "new_full_name": "Reid",
                "alias_mapping": {"Heart": None},  # no preserve_metaphor → no warn
            },
        },
        "locations": {}, "free_tokens": {},
    }
    warns = collect_metaphor_warnings(rename_map)
    assert any("alice" in w and "Myers" in w for w in warns), (
        f"expected alice/Myers warning, got {warns}"
    )
    assert not any("bob" in w for w in warns), (
        f"bob has no preserve_metaphor, should not warn; got {warns}"
    )


def test_collect_metaphor_warnings_empty_when_clean():
    """All KEEP/RENAME aliases under preserve_metaphor → no warnings."""
    from validate_map_schema import collect_metaphor_warnings

    rename_map = {
        "characters": {
            "alice": {
                "new_id": "nova", "new_full_name": "Nova",
                "alias_mapping": {"Butterfly": "Butterfly", "Sparrow": "Sparrow"},
                "preserve_metaphor": True,
            },
        },
        "locations": {}, "free_tokens": {},
    }
    assert collect_metaphor_warnings(rename_map) == []


def test_fixture_rename_map_passes(fixtures_root: Path):
    rename_map = json.loads((fixtures_root / "rename_map.json").read_text("utf-8"))
    normalizer_dir = fixtures_root / "mini-project" / "04-entity-normalizer"
    validate_map(rename_map, normalizer_dir=normalizer_dir)  # must not raise
