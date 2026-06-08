"""Validate entity-normalizer JSONs: schema + bidirectional alias sync.

Hard guards (raise ValidationError):
    - Schema shape of characters.json / locations.json / alias_map.json
    - role enum and role-conditional fields (MC/LI need bible_file;
      supporting/minor need relation)
    - Sub-location keys must be prefixed by their parent location id
    - Sub-location ids must be globally unique across parents
    - bible_file paths must exist on disk (skipped if 02-character-architect
      is absent — minimal test fixtures don't ship it)
    - Every alias listed in characters[*].aliases / locations[*].aliases must
      appear as a key in alias_map and point back to the owning id (and
      vice versa — alias_map values must exist as canonical ids)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Set, Tuple


VALID_ROLES: Set[str] = {"MC", "LI", "supporting", "minor"}
ROLES_WITH_BIBLE: Set[str] = {"MC", "LI"}


class ValidationError(Exception):
    """Raised when entity-normalizer JSONs fail a hard guard."""


def validate_all(normalizer_dir: Path) -> None:
    """Run every hard guard. Raises on the first failure.

    ``normalizer_dir`` is expected to be
    ``{project_root}/lunascripts/{book-slug}/04-entity-normalizer/``.
    The MC/LI bible-file-on-disk check walks one level up to reach
    ``02-character-architect/`` and is skipped if that directory is absent.
    """
    characters = _load_json(normalizer_dir / "characters.json")
    locations = _load_json(normalizer_dir / "locations.json")
    alias_map = _load_json(normalizer_dir / "alias_map.json")

    _validate_characters_schema(characters)
    _validate_locations_schema(locations)
    _validate_alias_map_schema(alias_map)

    _validate_sub_location_uniqueness(locations)
    _validate_sub_location_prefixes(locations)

    bible_dir = normalizer_dir.parent / "02-character-architect"
    if bible_dir.is_dir():
        _validate_bible_files_exist(characters, bible_dir)

    _validate_alias_sync(characters, locations, alias_map)


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        raise ValidationError(f"missing required file: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValidationError(f"invalid JSON in {path}: {exc}") from exc


def _validate_characters_schema(data: Dict[str, Any]) -> None:
    chars = data.get("characters")
    if not isinstance(chars, dict):
        raise ValidationError(
            "characters.json: top-level 'characters' must be a dict"
        )
    for char_id, entry in chars.items():
        if not isinstance(entry, dict):
            raise ValidationError(
                f"characters.json: entry '{char_id}' must be an object"
            )
        if not isinstance(entry.get("full_name"), str) or not entry["full_name"]:
            raise ValidationError(
                f"characters.json: '{char_id}' missing or empty full_name"
            )
        role = entry.get("role")
        if role not in VALID_ROLES:
            raise ValidationError(
                f"characters.json: '{char_id}' has invalid role "
                f"{role!r} (expected one of {sorted(VALID_ROLES)})"
            )
        aliases = entry.get("aliases")
        if not isinstance(aliases, list) or any(
            not isinstance(a, str) for a in aliases
        ):
            raise ValidationError(
                f"characters.json: '{char_id}' aliases must be list[str]"
            )
        if role in ROLES_WITH_BIBLE:
            if not isinstance(entry.get("bible_file"), str) or not entry["bible_file"]:
                raise ValidationError(
                    f"characters.json: {role} '{char_id}' missing bible_file"
                )
        else:
            if not isinstance(entry.get("relation"), str) or not entry["relation"]:
                raise ValidationError(
                    f"characters.json: {role} '{char_id}' missing relation"
                )


def _validate_locations_schema(data: Dict[str, Any]) -> None:
    locs = data.get("locations")
    if not isinstance(locs, dict):
        raise ValidationError(
            "locations.json: top-level 'locations' must be a dict"
        )
    for loc_id, entry in locs.items():
        if not isinstance(entry, dict):
            raise ValidationError(
                f"locations.json: entry '{loc_id}' must be an object"
            )
        if not isinstance(entry.get("full_name"), str) or not entry["full_name"]:
            raise ValidationError(
                f"locations.json: '{loc_id}' missing or empty full_name"
            )
        sublocs = entry.get("sub_locations")
        if not isinstance(sublocs, dict):
            raise ValidationError(
                f"locations.json: '{loc_id}' sub_locations must be a dict"
            )
        for sub_id, desc in sublocs.items():
            if not isinstance(sub_id, str) or not sub_id:
                raise ValidationError(
                    f"locations.json: '{loc_id}' has empty sub_location key"
                )
            if not isinstance(desc, str):
                raise ValidationError(
                    f"locations.json: '{loc_id}.{sub_id}' description must be str"
                )
        aliases = entry.get("aliases")
        if not isinstance(aliases, list) or any(
            not isinstance(a, str) for a in aliases
        ):
            raise ValidationError(
                f"locations.json: '{loc_id}' aliases must be list[str]"
            )


def _validate_alias_map_schema(data: Dict[str, Any]) -> None:
    for key in ("character_aliases", "location_aliases"):
        section = data.get(key)
        if not isinstance(section, dict):
            raise ValidationError(f"alias_map.json: '{key}' must be a dict")
        for alias, target in section.items():
            if not isinstance(alias, str) or not alias:
                raise ValidationError(
                    f"alias_map.json: '{key}' has an empty alias key"
                )
            if not isinstance(target, str) or not target:
                raise ValidationError(
                    f"alias_map.json: '{key}.{alias}' target must be non-empty str"
                )


def _validate_sub_location_prefixes(data: Dict[str, Any]) -> None:
    # ``data.get`` rather than ``data["locations"]`` keeps these helpers safe
    # to call on malformed input (e.g. in a test that bypasses the schema
    # check). ``validate_all`` always runs ``_validate_locations_schema``
    # first so real invocations never hit the default.
    for loc_id, entry in data.get("locations", {}).items():
        prefix = f"{loc_id}_"
        for sub_id in entry.get("sub_locations", {}):
            if not sub_id.startswith(prefix):
                raise ValidationError(
                    f"locations.json: sub_location '{sub_id}' under '{loc_id}' "
                    f"must start with '{prefix}'"
                )


def _validate_sub_location_uniqueness(data: Dict[str, Any]) -> None:
    seen: Dict[str, str] = {}
    for loc_id, entry in data.get("locations", {}).items():
        for sub_id in entry.get("sub_locations", {}):
            if sub_id in seen and seen[sub_id] != loc_id:
                raise ValidationError(
                    f"locations.json: duplicate sub_location id '{sub_id}' "
                    f"under both '{seen[sub_id]}' and '{loc_id}'"
                )
            seen[sub_id] = loc_id


def _validate_bible_files_exist(
    characters: Dict[str, Any], bible_dir: Path
) -> None:
    for char_id, entry in characters["characters"].items():
        if entry["role"] not in ROLES_WITH_BIBLE:
            continue
        bible_path = bible_dir / entry["bible_file"]
        if not bible_path.is_file():
            raise ValidationError(
                f"characters.json: '{char_id}' bible_file "
                f"'{entry['bible_file']}' not found at {bible_path}"
            )


def _validate_alias_sync(
    characters: Dict[str, Any],
    locations: Dict[str, Any],
    alias_map: Dict[str, Any],
) -> None:
    known_char_ids = set(characters["characters"].keys())
    known_loc_ids = set(locations["locations"].keys())

    # alias_map → canonical: target must exist
    for alias, char_id in alias_map["character_aliases"].items():
        if char_id not in known_char_ids:
            raise ValidationError(
                f"alias_map.json: character alias '{alias}' points to "
                f"unknown character '{char_id}'"
            )
    for alias, loc_id in alias_map["location_aliases"].items():
        if loc_id not in known_loc_ids:
            raise ValidationError(
                f"alias_map.json: location alias '{alias}' points to "
                f"unknown location '{loc_id}'"
            )

    # canonical → alias_map: every listed alias must be mapped back correctly
    expected_char, expected_loc = _expected_alias_index(characters, locations)

    _check_bijection(
        kind="character",
        expected=expected_char,
        actual=alias_map["character_aliases"],
    )
    _check_bijection(
        kind="location",
        expected=expected_loc,
        actual=alias_map["location_aliases"],
    )


def _expected_alias_index(
    characters: Dict[str, Any], locations: Dict[str, Any]
) -> Tuple[Dict[str, str], Dict[str, str]]:
    char_idx: Dict[str, str] = {}
    for char_id, entry in characters["characters"].items():
        for alias in entry["aliases"]:
            char_idx[alias] = char_id
    loc_idx: Dict[str, str] = {}
    for loc_id, entry in locations["locations"].items():
        for alias in entry["aliases"]:
            loc_idx[alias] = loc_id
    return char_idx, loc_idx


def _check_bijection(
    kind: str, expected: Dict[str, str], actual: Dict[str, str]
) -> None:
    for alias, canonical_id in expected.items():
        if alias not in actual:
            raise ValidationError(
                f"alias_map.json: {kind} alias '{alias}' (owner "
                f"'{canonical_id}') missing from alias_map"
            )
        if actual[alias] != canonical_id:
            raise ValidationError(
                f"alias_map.json: {kind} alias '{alias}' maps to "
                f"'{actual[alias]}' but canonical owner is '{canonical_id}'"
            )
    expected_keys = set(expected.keys())
    for alias in actual:
        if alias not in expected_keys:
            raise ValidationError(
                f"alias_map.json: {kind} alias '{alias}' is not listed "
                f"under any canonical entry's aliases"
            )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Validate entity-normalizer JSONs."
    )
    parser.add_argument("--book-slug", required=True)
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args(argv)
    normalizer_dir = (
        Path(args.project_root)
        / "lunascripts"
        / args.book_slug
        / "04-entity-normalizer"
    )
    try:
        validate_all(normalizer_dir)
    except ValidationError as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1
    print("[OK] entity-normalizer validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
