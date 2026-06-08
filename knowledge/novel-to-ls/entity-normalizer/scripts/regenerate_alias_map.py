"""Regenerate alias_map.json from canonical aliases in characters/locations.

alias_map.json is a **derived artifact**: every mapping in it should come
from the ``aliases`` array of some entry in characters.json or
locations.json. Hand-editing alias_map leads to drift (this is how the
production ``no-rules-in-bad-ideas`` dataset ended up with orphan
``Mrs. Ashby`` and ``MJ`` keys that point at canonical entries whose
``aliases`` array is empty).

Run this after editing ``characters.json`` / ``locations.json``. By default
it writes alias_map.json with sorted keys and then re-runs the full
normalizer validator on the result.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

# Keep ``validate_normalizer`` importable when this script is run directly as a
# CLI from any working dir (``python regenerate_alias_map.py ...``). Pytest's
# conftest does the same sys.path insert, but that only helps tests — not the
# CLI entry point, which is how users invoke this in the real workflow.
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import validate_normalizer  # noqa: E402  (after sys.path guard above)
from validate_normalizer import ValidationError  # noqa: E402


class AliasConflictError(Exception):
    """Raised when two canonical entries claim the same alias."""


def build_alias_map(
    characters: Dict[str, Any], locations: Dict[str, Any]
) -> Dict[str, Dict[str, str]]:
    """Pure function: derive alias_map contents from canonical entries.

    Raises :class:`AliasConflictError` if two characters (or two locations)
    share an alias — we refuse to silently pick a winner.
    """
    char_aliases = _collect_aliases(
        characters.get("characters", {}), kind="character"
    )
    loc_aliases = _collect_aliases(
        locations.get("locations", {}), kind="location"
    )
    return {
        "character_aliases": _sorted(char_aliases),
        "location_aliases": _sorted(loc_aliases),
    }


def _collect_aliases(entries: Dict[str, Any], kind: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for entity_id, entry in entries.items():
        for alias in entry.get("aliases", []):
            if alias in result and result[alias] != entity_id:
                raise AliasConflictError(
                    f"{kind} alias '{alias}' is claimed by both "
                    f"'{result[alias]}' and '{entity_id}'"
                )
            result[alias] = entity_id
    return result


def _sorted(mapping: Dict[str, str]) -> Dict[str, str]:
    return {key: mapping[key] for key in sorted(mapping)}


def regenerate(
    normalizer_dir: Path, *, dry_run: bool, validate: bool
) -> Dict[str, Dict[str, str]]:
    """Rebuild alias_map.json. Returns the new content.

    ``dry_run=True`` prints a diff to stdout and leaves the file untouched.
    ``validate=True`` runs :func:`validate_normalizer.validate_all` on the
    post-regen state (must be False when callers want the new content
    without side effects, e.g. in unit tests that don't set up bibles).
    """
    characters = json.loads(
        (normalizer_dir / "characters.json").read_text(encoding="utf-8")
    )
    locations = json.loads(
        (normalizer_dir / "locations.json").read_text(encoding="utf-8")
    )
    new_map = build_alias_map(characters, locations)

    alias_map_path = normalizer_dir / "alias_map.json"
    old_text = (
        alias_map_path.read_text(encoding="utf-8")
        if alias_map_path.is_file()
        else ""
    )
    new_text = json.dumps(new_map, indent=2, ensure_ascii=False) + "\n"

    if dry_run:
        _print_diff(old_text, new_text)
        return new_map

    alias_map_path.write_text(new_text, encoding="utf-8")
    if validate:
        validate_normalizer.validate_all(normalizer_dir)
    return new_map


def _print_diff(old_text: str, new_text: str) -> None:
    if old_text == new_text:
        print("[OK] alias_map.json is already up to date (no changes)")
        return
    # Small projects — just show both bodies; callers can eyeball the diff.
    print("[DRY-RUN] alias_map.json would change:")
    print("--- current ---")
    print(old_text.rstrip() or "(empty)")
    print("--- proposed ---")
    print(new_text.rstrip())


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Regenerate alias_map.json from canonical aliases."
    )
    parser.add_argument("--book-slug", required=True)
    parser.add_argument("--project-root", default=".")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change and exit without writing.",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip running validate_normalizer after regen.",
    )
    args = parser.parse_args(argv)
    normalizer_dir = (
        Path(args.project_root)
        / "lunascripts"
        / args.book_slug
        / "04-entity-normalizer"
    )
    try:
        regenerate(
            normalizer_dir,
            dry_run=args.dry_run,
            validate=not args.no_validate,
        )
    except (AliasConflictError, ValidationError) as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1
    if not args.dry_run:
        print("[OK] alias_map.json regenerated")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
