"""Coverage for argparse entry points + less-traveled schema edges."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Dict

import pytest

from regenerate_alias_map import main as regen_main
from validate_normalizer import ValidationError, _load_json, validate_all
from validate_normalizer import main as validate_main


WriteJson = Callable[[Path, Dict[str, Any]], None]


@pytest.fixture
def valid_project(tmp_path: Path, write_json: WriteJson) -> Path:
    """Book-slug-shaped layout so CLIs resolve paths naturally.

    Returns the normalizer dir at
    ``{tmp_path}/lunascripts/sample/04-entity-normalizer/``.
    """
    normalizer = tmp_path / "lunascripts" / "sample" / "04-entity-normalizer"
    write_json(
        normalizer / "characters.json",
        {
            "characters": {
                "alice": {
                    "full_name": "Alice",
                    "role": "MC",
                    "aliases": ["Al"],
                    "bible_file": "mc.md",
                }
            }
        },
    )
    write_json(
        normalizer / "locations.json",
        {
            "locations": {
                "school": {
                    "full_name": "Prep",
                    "sub_locations": {"school_hall": "Hall"},
                    "aliases": ["Prep"],
                }
            }
        },
    )
    write_json(
        normalizer / "alias_map.json",
        {
            "character_aliases": {"Al": "alice"},
            "location_aliases": {"Prep": "school"},
        },
    )
    return normalizer


def test_validate_main_ok(
    tmp_path: Path, valid_project: Path, capsys: pytest.CaptureFixture
) -> None:
    rc = validate_main(
        ["--book-slug", "sample", "--project-root", str(tmp_path)]
    )
    assert rc == 0
    assert "[OK]" in capsys.readouterr().out


def test_validate_main_fail_exits_1(
    tmp_path: Path, valid_project: Path, capsys: pytest.CaptureFixture
) -> None:
    # Break it: remove a canonical alias so alias_map has a stray.
    chars = json.loads((valid_project / "characters.json").read_text("utf-8"))
    chars["characters"]["alice"]["aliases"] = []
    (valid_project / "characters.json").write_text(
        json.dumps(chars), encoding="utf-8"
    )
    rc = validate_main(
        ["--book-slug", "sample", "--project-root", str(tmp_path)]
    )
    assert rc == 1
    assert "[FAIL]" in capsys.readouterr().err


def test_regen_main_dry_run_no_write(
    tmp_path: Path, valid_project: Path, capsys: pytest.CaptureFixture
) -> None:
    before = (valid_project / "alias_map.json").read_text("utf-8")
    rc = regen_main(
        [
            "--book-slug",
            "sample",
            "--project-root",
            str(tmp_path),
            "--dry-run",
            "--no-validate",
        ]
    )
    assert rc == 0
    after = (valid_project / "alias_map.json").read_text("utf-8")
    assert before == after


def test_regen_main_writes_and_reports_ok(
    tmp_path: Path,
    valid_project: Path,
    write_json: WriteJson,
    capsys: pytest.CaptureFixture,
) -> None:
    # Mangle alias_map so regen has something to correct.
    write_json(
        valid_project / "alias_map.json",
        {"character_aliases": {}, "location_aliases": {}},
    )
    rc = regen_main(
        [
            "--book-slug",
            "sample",
            "--project-root",
            str(tmp_path),
            "--no-validate",
        ]
    )
    assert rc == 0
    fresh = json.loads((valid_project / "alias_map.json").read_text("utf-8"))
    assert fresh["character_aliases"] == {"Al": "alice"}
    assert "[OK]" in capsys.readouterr().out


def test_regen_main_fail_on_conflict(
    tmp_path: Path, valid_project: Path, capsys: pytest.CaptureFixture
) -> None:
    chars = json.loads((valid_project / "characters.json").read_text("utf-8"))
    chars["characters"]["bob"] = {
        "full_name": "Bob",
        "role": "LI",
        "aliases": ["Al"],  # collides with alice's "Al"
        "bible_file": "li.md",
    }
    (valid_project / "characters.json").write_text(
        json.dumps(chars), encoding="utf-8"
    )
    rc = regen_main(
        ["--book-slug", "sample", "--project-root", str(tmp_path)]
    )
    assert rc == 1
    assert "[FAIL]" in capsys.readouterr().err


def test_regen_main_dry_run_up_to_date(
    tmp_path: Path, valid_project: Path, capsys: pytest.CaptureFixture
) -> None:
    """Dry-run on a consistent project prints 'already up to date'."""
    # Match what build_alias_map emits (sorted, json.dumps(indent=2) + \n)
    (valid_project / "alias_map.json").write_text(
        json.dumps(
            {
                "character_aliases": {"Al": "alice"},
                "location_aliases": {"Prep": "school"},
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    rc = regen_main(
        [
            "--book-slug",
            "sample",
            "--project-root",
            str(tmp_path),
            "--dry-run",
            "--no-validate",
        ]
    )
    assert rc == 0
    assert "already up to date" in capsys.readouterr().out


def test_load_json_missing_file(tmp_path: Path) -> None:
    with pytest.raises(ValidationError, match="missing required file"):
        _load_json(tmp_path / "nonexistent.json")


def test_load_json_bad_json(tmp_path: Path) -> None:
    path = tmp_path / "broken.json"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(ValidationError, match="invalid JSON"):
        _load_json(path)


def test_rejects_non_dict_character_entry(
    tmp_path: Path, write_json: WriteJson
) -> None:
    normalizer = tmp_path / "04-entity-normalizer"
    write_json(
        normalizer / "characters.json",
        {"characters": {"alice": "not-an-object"}},
    )
    write_json(normalizer / "locations.json", {"locations": {}})
    write_json(
        normalizer / "alias_map.json",
        {"character_aliases": {}, "location_aliases": {}},
    )
    with pytest.raises(ValidationError, match="must be an object"):
        validate_all(normalizer)


def test_rejects_top_level_not_dict(
    tmp_path: Path, write_json: WriteJson
) -> None:
    normalizer = tmp_path / "04-entity-normalizer"
    write_json(normalizer / "characters.json", {"characters": []})
    write_json(normalizer / "locations.json", {"locations": {}})
    write_json(
        normalizer / "alias_map.json",
        {"character_aliases": {}, "location_aliases": {}},
    )
    with pytest.raises(ValidationError, match="must be a dict"):
        validate_all(normalizer)


def test_rejects_alias_list_with_non_str(
    tmp_path: Path, write_json: WriteJson
) -> None:
    normalizer = tmp_path / "04-entity-normalizer"
    write_json(
        normalizer / "characters.json",
        {
            "characters": {
                "alice": {
                    "full_name": "Alice",
                    "role": "MC",
                    "aliases": ["ok", 42],
                    "bible_file": "m.md",
                }
            }
        },
    )
    write_json(normalizer / "locations.json", {"locations": {}})
    write_json(
        normalizer / "alias_map.json",
        {"character_aliases": {}, "location_aliases": {}},
    )
    with pytest.raises(ValidationError, match="list\\[str\\]"):
        validate_all(normalizer)


def test_rejects_location_sub_locations_not_dict(
    tmp_path: Path, write_json: WriteJson
) -> None:
    normalizer = tmp_path / "04-entity-normalizer"
    write_json(
        normalizer / "characters.json",
        {"characters": {}},
    )
    write_json(
        normalizer / "locations.json",
        {
            "locations": {
                "school": {
                    "full_name": "Prep",
                    "sub_locations": [],  # wrong type
                    "aliases": [],
                }
            }
        },
    )
    write_json(
        normalizer / "alias_map.json",
        {"character_aliases": {}, "location_aliases": {}},
    )
    with pytest.raises(ValidationError, match="sub_locations must be a dict"):
        validate_all(normalizer)


def test_rejects_alias_map_section_not_dict(
    tmp_path: Path, write_json: WriteJson
) -> None:
    normalizer = tmp_path / "04-entity-normalizer"
    write_json(normalizer / "characters.json", {"characters": {}})
    write_json(normalizer / "locations.json", {"locations": {}})
    write_json(
        normalizer / "alias_map.json",
        {"character_aliases": "broken", "location_aliases": {}},
    )
    with pytest.raises(ValidationError, match="character_aliases"):
        validate_all(normalizer)


def test_rejects_alias_map_empty_target(
    tmp_path: Path, write_json: WriteJson
) -> None:
    normalizer = tmp_path / "04-entity-normalizer"
    write_json(
        normalizer / "characters.json",
        {
            "characters": {
                "alice": {
                    "full_name": "Alice",
                    "role": "MC",
                    "aliases": ["Al"],
                    "bible_file": "m.md",
                }
            }
        },
    )
    write_json(normalizer / "locations.json", {"locations": {}})
    write_json(
        normalizer / "alias_map.json",
        {"character_aliases": {"Al": ""}, "location_aliases": {}},
    )
    with pytest.raises(ValidationError, match="target must be non-empty"):
        validate_all(normalizer)
