"""Validate rename_map.json structure + semantic invariants.

Hard guards (raise ValidationError):
    - id_collisions   — two old IDs → same new ID in a section
    - alias_coverage  — every normalizer alias has a mapping decision
    - orphan_old_ids  — every rename_map ID exists in the normalizer

Soft checks (return warnings; never raise):
    - metaphor_preserved — preserve_metaphor=True + null alias is suspicious
      but not always wrong (e.g., keep the metaphor-carrying nickname AND
      drop a separate surname alias on the same character). The
      rename-reviewer sub-agent does the real semantic audit post-apply.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


class ValidationError(Exception):
    """Raised when rename_map fails a hard guard."""


def validate_map(rename_map: Dict[str, Any], normalizer_dir: Optional[Path]) -> None:
    """Raise ValidationError if rename_map violates any hard guard.

    Soft checks (metaphor preservation) are returned by
    :func:`collect_metaphor_warnings` — call that separately.
    """
    _check_id_collisions(rename_map)
    if normalizer_dir is not None:
        _check_alias_coverage(rename_map, normalizer_dir)
        _check_orphan_old_ids(rename_map, normalizer_dir)


def _check_id_collisions(rename_map: Dict[str, Any]) -> None:
    """No two old_ids may map to the same new_id within a section."""
    for section in ("characters", "locations"):
        seen: Dict[str, str] = {}
        for old_id, entry in rename_map.get(section, {}).items():
            new_id = entry.get("new_id")
            if new_id in seen:
                raise ValidationError(
                    f"collision in {section}: '{seen[new_id]}' and '{old_id}' "
                    f"both map to '{new_id}'"
                )
            seen[new_id] = old_id


def _check_alias_coverage(rename_map: Dict[str, Any], normalizer_dir: Path) -> None:
    """Every alias registered in alias_map.json must have an explicit mapping decision."""
    alias_map = json.loads((normalizer_dir / "alias_map.json").read_text("utf-8"))
    char_aliases = alias_map.get("character_aliases", {})
    for alias, char_id in char_aliases.items():
        entry = rename_map.get("characters", {}).get(char_id)
        if entry is None:
            raise ValidationError(
                f"uncovered: character '{char_id}' (owner of alias '{alias}') "
                f"not in rename_map.characters"
            )
        if alias not in entry.get("alias_mapping", {}):
            raise ValidationError(
                f"uncovered: alias '{alias}' (owner {char_id}) missing from "
                f"rename_map alias_mapping"
            )


def _check_orphan_old_ids(rename_map: Dict[str, Any], normalizer_dir: Path) -> None:
    """rename_map must not reference IDs that don't exist in the normalizer."""
    chars = json.loads((normalizer_dir / "characters.json").read_text("utf-8"))
    locs = json.loads((normalizer_dir / "locations.json").read_text("utf-8"))
    known_chars = set(chars.get("characters", {}).keys())
    known_locs = set(locs.get("locations", {}).keys())
    for old_id in rename_map.get("characters", {}):
        if old_id not in known_chars:
            raise ValidationError(
                f"orphan: character '{old_id}' not found in "
                f"04-entity-normalizer/characters.json"
            )
    for old_id in rename_map.get("locations", {}):
        if old_id not in known_locs:
            raise ValidationError(
                f"orphan: location '{old_id}' not found in "
                f"04-entity-normalizer/locations.json"
            )


def collect_metaphor_warnings(rename_map: Dict[str, Any]) -> List[str]:
    """Return one warning per (char, dropped-alias) when preserve_metaphor=True.

    Advisory-only — dropping a single alias on a metaphor-preserving character
    is a legitimate pattern (e.g., keep "Butterfly" as the metaphor carrier
    and drop "Myers" because the surname metaphor was never meaningful).
    Surfaced as a warning so the reviewer can eyeball it, not a blocker.
    """
    warnings: List[str] = []
    for char_id, entry in rename_map.get("characters", {}).items():
        if not entry.get("preserve_metaphor"):
            continue
        for alias, new_alias in entry.get("alias_mapping", {}).items():
            if new_alias is None:
                warnings.append(
                    f"metaphor hint: '{char_id}' has preserve_metaphor=true "
                    f"but alias '{alias}' is dropped — confirm the metaphor "
                    f"chain is carried by a different alias"
                )
    return warnings


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--book-slug", required=True)
    p.add_argument("--map", required=True)
    p.add_argument("--project-root", default=".")
    args = p.parse_args(argv)
    rename_map = json.loads(Path(args.map).read_text("utf-8"))
    normalizer_dir = (
        Path(args.project_root) / "moonscripts" / args.book_slug / "04-entity-normalizer"
    )
    try:
        validate_map(
            rename_map,
            normalizer_dir=normalizer_dir if normalizer_dir.exists() else None,
        )
    except ValidationError as e:
        print(f"[FAIL] {e}", file=sys.stderr)
        return 1
    for w in collect_metaphor_warnings(rename_map):
        print(f"[WARN] {w}", file=sys.stderr)
    print("[OK] rename_map passes all guards")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
