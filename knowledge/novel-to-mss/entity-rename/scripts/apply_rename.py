"""Apply rename_map.json to a moonscripts book."""
from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


@dataclass(frozen=True)
class ReplacementPair:
    """A compiled regex + replacement + classification kind."""
    pattern: re.Pattern
    replacement: str
    kind: str


# Strict alphabetic boundary: matches anywhere the target isn't flanked by
# an ASCII letter. Treats ``_`` / ``-`` / digits / punctuation / CJK as
# non-boundaries so asset tokens like ``theme_alice_morning`` and
# flavor codes like ``alice-self-accept`` get caught — standard ``\b``
# would fail on ``_`` (a word char in regex) and on CJK under Unicode.
_BL = r"(?<![A-Za-z])"  # left — no letter before
_BR = r"(?![A-Za-z])"   # right — no letter after


def build_replacement_pairs(
    rename_map: Dict[str, Any],
    normalizer_chars: Dict[str, Any],
    normalizer_locs: Dict[str, Any],
) -> List[ReplacementPair]:
    """Generate all replacement pairs from rename_map + normalizer state.

    Pair types produced:
        full_name / given_name / surname — character name tokens in prose
        alias — renamed alias (old != new)
        drop_alias — alias marked null; replaced by new_full_name's first token
        speaker_label — uppercase character ID, matched anywhere (\\b boundary)
        mss_token — ``@<old_id>`` → ``@<new_id>``
        bg_id — location sub_location id change
        free_token — top-level free tokens; null means delete
    """
    pairs: List[ReplacementPair] = []

    # Characters: full_name, given_name, surname, aliases, speaker_label, mss_token
    for old_id, entry in rename_map.get("characters", {}).items():
        old_full = normalizer_chars.get(old_id, {}).get("full_name", "")
        new_full = entry["new_full_name"]
        new_given = new_full.split()[0] if new_full else ""
        new_id = entry["new_id"]
        old_parts = old_full.split()
        new_parts = new_full.split()

        if old_full and old_full != new_full:
            pairs.append(ReplacementPair(
                re.compile(rf"{_BL}{re.escape(old_full)}{_BR}", re.ASCII), new_full, "full_name"))
        if old_parts and new_parts and old_parts[0] != new_parts[0]:
            pairs.append(ReplacementPair(
                re.compile(rf"{_BL}{re.escape(old_parts[0])}{_BR}", re.ASCII),
                new_parts[0], "given_name"))
        if (
            len(old_parts) >= 2
            and len(new_parts) >= 2
            and old_parts[-1] != new_parts[-1]
        ):
            pairs.append(ReplacementPair(
                re.compile(rf"{_BL}{re.escape(old_parts[-1])}{_BR}", re.ASCII),
                new_parts[-1], "surname"))
            # Lowercase surname for asset tokens: 'theme_hernandez_home_warm'
            low_s = old_parts[-1].lower()
            if low_s != old_parts[-1]:
                pairs.append(ReplacementPair(
                    re.compile(rf"{_BL}{re.escape(low_s)}{_BR}", re.ASCII),
                    new_parts[-1].lower(), "surname_lower"))

        for old_alias, new_alias in entry.get("alias_mapping", {}).items():
            if new_alias is None:
                pairs.append(ReplacementPair(
                    re.compile(rf"{_BL}{re.escape(old_alias)}{_BR}", re.ASCII),
                    new_given, "drop_alias"))
            elif new_alias != old_alias:
                pairs.append(ReplacementPair(
                    re.compile(rf"{_BL}{re.escape(old_alias)}{_BR}", re.ASCII),
                    new_alias, "alias"))
                low_a = old_alias.lower()
                if low_a != old_alias and low_a:
                    pairs.append(ReplacementPair(
                        re.compile(rf"{_BL}{re.escape(low_a)}{_BR}", re.ASCII),
                        new_alias.lower(), "alias_lower"))

        # speaker_label: uppercase ID matched anywhere (not just line start).
        # This catches both MSS speaker labels ("ALICE: hi") and narrative
        # emphasis ("ALICE 对 BEN"). Word boundary prevents partial matches.
        if old_id.upper() != new_id.upper():
            pairs.append(ReplacementPair(
                re.compile(rf"{_BL}{re.escape(old_id.upper())}{_BR}", re.ASCII),
                new_id.upper(), "speaker_label"))
        if old_id != new_id:
            pairs.append(ReplacementPair(
                re.compile(rf"@{re.escape(old_id)}{_BR}", re.ASCII),
                f"@{new_id}", "mss_token"))
            # id_lower: bare lowercase old_id anywhere (flavor codes
            # like "alice-self-accept", bible filename refs like
            # "mc-bible-alice.md"). Word boundaries protect English words
            # (e.g. "alice" in "malice" is NOT matched).
            pairs.append(ReplacementPair(
                re.compile(rf"{_BL}{re.escape(old_id)}{_BR}", re.ASCII),
                new_id, "id_lower"))

    # Locations: full_name, bg_id, alias (no DROP for locations per spec)
    for old_id, entry in rename_map.get("locations", {}).items():
        old_full = normalizer_locs.get(old_id, {}).get("full_name", "")
        new_full = entry["new_full_name"]
        if old_full and old_full != new_full:
            pairs.append(ReplacementPair(
                re.compile(rf"{_BL}{re.escape(old_full)}{_BR}", re.ASCII), new_full, "full_name"))
        for old_sub, new_sub in entry.get("sub_location_ids", {}).items():
            if old_sub != new_sub:
                pairs.append(ReplacementPair(
                    re.compile(rf"{_BL}{re.escape(old_sub)}{_BR}", re.ASCII), new_sub, "bg_id"))
        for old_alias, new_alias in entry.get("alias_mapping", {}).items():
            if new_alias is not None and new_alias != old_alias:
                pairs.append(ReplacementPair(
                    re.compile(rf"{_BL}{re.escape(old_alias)}{_BR}", re.ASCII),
                    new_alias, "alias"))

    # Free tokens: top-level scalar replacements. null means DELETE — eat
    # the trailing space too to avoid double-spaces. Non-null means RENAME —
    # leave surrounding whitespace alone. When the token has alpha chars,
    # also emit a lowercase variant so asset tokens with compound naming
    # (e.g., ``theme_morhills_halls``) get caught.
    for old_token, new_token in rename_map.get("free_tokens", {}).items():
        is_drop = new_token is None
        replacement = "" if is_drop else new_token
        suffix = r"\s?" if is_drop else ""
        pairs.append(ReplacementPair(
            re.compile(rf"{_BL}{re.escape(old_token)}{_BR}{suffix}", re.ASCII),
            replacement, "free_token"))
        lower_old = old_token.lower()
        lower_new = "" if is_drop else new_token.lower()
        if lower_old != old_token and lower_old:
            pairs.append(ReplacementPair(
                re.compile(rf"{_BL}{re.escape(lower_old)}{_BR}{suffix}", re.ASCII),
                lower_new, "free_token"))

    return pairs


def _pattern_literal_length(pair: ReplacementPair) -> int:
    """Approximate the literal character length of a pattern (for sort ordering)."""
    s = pair.pattern.pattern
    # Strip \b markers and regex escape backslashes
    s = s.replace(r"\b", "").replace(r"\\", "")
    # Strip non-capturing / lookahead groups
    s = re.sub(r"\(\?[a-z]+:[^)]*\)", "", s)
    s = re.sub(r"\(\?[=!<][^)]*\)", "", s)
    # Strip line anchors
    return len(s.replace("^", "").replace("$", ""))


def sort_pairs(pairs: List[ReplacementPair]) -> List[ReplacementPair]:
    """Sort pairs longest-literal-first so long tokens match before short ones."""
    return sorted(pairs, key=_pattern_literal_length, reverse=True)


def apply_to_text(text: str, pairs: List[ReplacementPair]) -> str:
    """Apply a sorted list of ReplacementPairs to text, in order."""
    for p in pairs:
        text = p.pattern.sub(p.replacement, text)
    return text


def apply_to_json(
    data: Dict[str, Any],
    rename_map: Dict[str, Any],
    pairs: List[ReplacementPair],
    kind: str,
) -> Dict[str, Any]:
    """Transform one of the normalizer JSON files per rename_map.

    kind: "characters" | "locations" | "alias_map"
    Returns a new dict (input unmodified). For "alias_map", ``data`` is ignored
    and the output is rebuilt from rename_map's alias_mapping values.
    """
    if kind == "characters":
        return _transform_characters(data, rename_map, pairs)
    if kind == "locations":
        return _transform_locations(data, rename_map, pairs)
    if kind == "alias_map":
        return _transform_alias_map(rename_map)
    raise ValueError(f"unknown kind: {kind!r}")


def _transform_characters(
    data: Dict[str, Any],
    rename_map: Dict[str, Any],
    pairs: List[ReplacementPair],
) -> Dict[str, Any]:
    new_chars: Dict[str, Any] = {}
    for old_id, entry in data.get("characters", {}).items():
        renamed = rename_map.get("characters", {}).get(old_id)
        if renamed is None:
            new_chars[old_id] = entry
            continue
        new_id = renamed["new_id"]
        new_entry = dict(entry)
        new_entry["full_name"] = renamed["new_full_name"]
        mapping = renamed.get("alias_mapping", {})
        new_aliases: List[str] = []
        for a in entry.get("aliases", []):
            if a in mapping:
                if mapping[a] is not None:
                    new_aliases.append(mapping[a])
                # else: DROP — skip
            else:
                new_aliases.append(a)
        new_entry["aliases"] = new_aliases
        # Transform relation string if present (e.g., "Alice's mother" → "Nova's mother")
        if isinstance(new_entry.get("relation"), str):
            new_entry["relation"] = apply_to_text(new_entry["relation"], pairs)
        # Transform bible_file filename (e.g., "mc-bible-alice.md" → "mc-bible-nova.md")
        # Physical file is renamed in _rename_pipeline_files.
        if isinstance(new_entry.get("bible_file"), str):
            new_entry["bible_file"] = apply_to_text(new_entry["bible_file"], pairs)
        new_chars[new_id] = new_entry
    return {"characters": new_chars}


def _transform_locations(
    data: Dict[str, Any],
    rename_map: Dict[str, Any],
    pairs: List[ReplacementPair],
) -> Dict[str, Any]:
    new_locs: Dict[str, Any] = {}
    for old_id, entry in data.get("locations", {}).items():
        renamed = rename_map.get("locations", {}).get(old_id)
        if renamed is None:
            new_locs[old_id] = entry
            continue
        new_id = renamed["new_id"]
        new_entry = dict(entry)
        new_entry["full_name"] = renamed["new_full_name"]
        new_subs: Dict[str, Any] = {}
        for old_sub, desc in entry.get("sub_locations", {}).items():
            new_sub = renamed.get("sub_location_ids", {}).get(old_sub, old_sub)
            # sub_location desc values are user-facing labels that embed
            # character names (e.g., "Alice's bedroom"). Run text transform
            # so name renames flow through.
            new_subs[new_sub] = (
                apply_to_text(desc, pairs) if isinstance(desc, str) else desc
            )
        new_entry["sub_locations"] = new_subs
        mapping = renamed.get("alias_mapping", {})
        new_aliases: List[str] = []
        for a in entry.get("aliases", []):
            if a in mapping:
                if mapping[a] is not None:
                    new_aliases.append(mapping[a])
            else:
                new_aliases.append(a)
        new_entry["aliases"] = new_aliases
        new_locs[new_id] = new_entry
    return {"locations": new_locs}


def _transform_alias_map(rename_map: Dict[str, Any]) -> Dict[str, Any]:
    """Rebuild alias_map.json from rename_map's alias_mapping values.

    Only non-DROP aliases survive; new alias → new id.
    """
    new_char_aliases: Dict[str, str] = {}
    for _old_id, entry in rename_map.get("characters", {}).items():
        new_id = entry["new_id"]
        for _old_alias, new_alias in entry.get("alias_mapping", {}).items():
            if new_alias is not None:
                new_char_aliases[new_alias] = new_id

    new_loc_aliases: Dict[str, str] = {}
    for _old_id, entry in rename_map.get("locations", {}).items():
        new_id = entry["new_id"]
        for _old_alias, new_alias in entry.get("alias_mapping", {}).items():
            if new_alias is not None:
                new_loc_aliases[new_alias] = new_id

    return {
        "character_aliases": new_char_aliases,
        "location_aliases": new_loc_aliases,
    }


def apply_to_project(project_dir: Path, rename_map: Dict[str, Any]) -> str:
    """Apply rename_map to every pipeline-stage file in a moonscripts book.

    Creates a timestamped backup under ``04.5-entity-rename/.backups/`` first,
    then rewrites files in place, then writes ``.rename_applied`` marker.
    Returns "applied" on success, "already_applied" if marker exists and no
    residual old tokens remain.

    Order (long-before-short within-file + cross-file):
      1. Read 04-entity-normalizer JSON (seed for pairs)
      2. Build + sort pairs
      3. Rewrite 04 JSONs (characters, locations, alias_map)
      4. Rewrite 05 scripts (ep_*_final.md)
      5. Rewrite 02 bibles + 03 plans (.md)
      6. Rewrite 06 asset prompts (tasks_output.json — JSON-aware walk)
    """
    normalizer_dir = project_dir / "04-entity-normalizer"
    # Idempotency: if marker exists AND no residual old tokens, skip.
    if (normalizer_dir / ".rename_applied").exists():
        if not _has_residual_old_tokens(project_dir, rename_map):
            return "already_applied"
        # Residual exists (e.g., new episodes added) → re-apply incrementally.

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    _create_backup(project_dir, timestamp)

    chars_data = json.loads(
        (normalizer_dir / "characters.json").read_text("utf-8")
    )
    locs_data = json.loads(
        (normalizer_dir / "locations.json").read_text("utf-8")
    )
    pairs = sort_pairs(
        build_replacement_pairs(
            rename_map, chars_data["characters"], locs_data["locations"]
        )
    )

    # 04: structured JSON rewrites
    new_chars = apply_to_json(chars_data, rename_map, pairs, kind="characters")
    new_locs = apply_to_json(locs_data, rename_map, pairs, kind="locations")
    new_aliases = apply_to_json({}, rename_map, pairs, kind="alias_map")
    _write_json(normalizer_dir / "characters.json", new_chars)
    _write_json(normalizer_dir / "locations.json", new_locs)
    _write_json(normalizer_dir / "alias_map.json", new_aliases)

    # 05: episode scripts + arc reviews — pure text substitution.
    # All .md under scripts/ (ep_*_final.md, arc-review-*.md, notes, etc.)
    # get renamed; the directory holds only rename-scope prose.
    scripts_dir = project_dir / "05-episode-writer" / "scripts"
    if scripts_dir.exists():
        for f in scripts_dir.rglob("*.md"):
            f.write_text(apply_to_text(f.read_text("utf-8"), pairs), "utf-8")

    # 02 + 03: bibles + plans — pure text substitution
    for sub in ("02-character-architect", "03-entity-planner"):
        d = project_dir / sub
        if d.exists():
            for f in d.rglob("*.md"):
                f.write_text(apply_to_text(f.read_text("utf-8"), pairs), "utf-8")

    # 06: asset prompts — JSON walk with key rename for character IDs
    prompts_path = project_dir / "06-asset-prompt-generator" / "tasks_output.json"
    if prompts_path.exists():
        data = json.loads(prompts_path.read_text("utf-8"))
        data = _apply_to_prompts_json(data, rename_map, pairs)
        _write_json(prompts_path, data)

    # Physical file renames in 02/03 (bible files, route plans named after IDs).
    # Done last so content rewriting above operates on stable filenames.
    _rename_pipeline_files(project_dir, pairs)

    (normalizer_dir / ".rename_applied").write_text(
        f"Applied at {timestamp}\n", "utf-8"
    )
    return "applied"


def _rename_pipeline_files(
    project_dir: Path, pairs: List[ReplacementPair]
) -> None:
    """Rename files in 02/03 whose basenames embed old IDs (e.g.
    ``mc-bible-alice.md`` → ``mc-bible-nova.md``, ``04-route-mark.md`` →
    ``04-route-thomas.md``). Uses the same pair set as content rewriting so
    a filename and its references stay in sync.
    """
    for sub in ("02-character-architect", "03-entity-planner"):
        d = project_dir / sub
        if not d.exists():
            continue
        for f in d.rglob("*"):
            if ".backups" in f.parts or not f.is_file():
                continue
            new_name = apply_to_text(f.name, pairs)
            if new_name != f.name:
                f.rename(f.parent / new_name)


_BACKUP_SUBDIRS = (
    "02-character-architect",
    "03-entity-planner",
    "04-entity-normalizer",
    "05-episode-writer",
    "06-asset-prompt-generator",
)


def _create_backup(project_dir: Path, timestamp: str) -> Path:
    """Copy all pipeline-stage subdirs to ``04.5-entity-rename/.backups/<ts>/``."""
    backup_root = project_dir / "04.5-entity-rename" / ".backups" / timestamp
    backup_root.mkdir(parents=True, exist_ok=True)
    for sub in _BACKUP_SUBDIRS:
        src = project_dir / sub
        if src.exists():
            shutil.copytree(src, backup_root / sub)
    return backup_root


def _has_residual_old_tokens(
    project_dir: Path, rename_map: Dict[str, Any]
) -> bool:
    """True if any old_id from rename_map still appears in prose .md files
    (excluding backups). Used to detect whether the marker is stale.

    Only .md files are scanned — structured JSON may legitimately retain old
    IDs in filename references (e.g., ``bible_file: mc-bible-alice.md``) and
    that's not a rename regression.
    """
    old_tokens: List[str] = []
    for old_id, entry in rename_map.get("characters", {}).items():
        if entry["new_id"] != old_id:
            old_tokens.append(old_id)
    for old_id, entry in rename_map.get("locations", {}).items():
        if entry["new_id"] != old_id:
            old_tokens.append(old_id)
    for f in project_dir.rglob("*.md"):
        if ".backups" in f.parts:
            continue
        if not f.is_file():
            continue
        text = f.read_text("utf-8")
        for tok in old_tokens:
            if re.search(rf"{_BL}{re.escape(tok)}{_BR}", text, re.ASCII):
                return True
    return False


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    """Serialize JSON with stable formatting (indent=2, preserve UTF-8)."""
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _apply_to_prompts_json(
    data: Any, rename_map: Dict[str, Any], pairs: List[ReplacementPair]
) -> Any:
    """Recursively walk the 06 prompts JSON.

    Renames any dict key that matches a character or location old_id
    anywhere in the tree (06 nests char IDs at multiple levels —
    ``series_character_prompts.alice``, ``ep_character_sprites.ep1.alice``,
    ``sprite_id_mapping.alice_neutral``, etc.). String leaves pass through
    ``apply_to_text`` so their content is renamed too.
    """
    id_remap: Dict[str, str] = {}
    for old_id, entry in rename_map.get("characters", {}).items():
        if entry["new_id"] != old_id:
            id_remap[old_id] = entry["new_id"]
    for old_id, entry in rename_map.get("locations", {}).items():
        if entry["new_id"] != old_id:
            id_remap[old_id] = entry["new_id"]

    def _walk(node: Any) -> Any:
        if isinstance(node, dict):
            result: Dict[str, Any] = {}
            for k, v in node.items():
                # Exact-match rename: dict key == old_id.
                new_k = id_remap.get(k, k)
                # Prefix rename: key starts with "<old_id>_" (e.g.,
                # sprite_id_mapping keys like 'alice_neutral').
                if new_k == k:
                    for old, new in id_remap.items():
                        if k.startswith(old + "_"):
                            new_k = new + k[len(old):]
                            break
                result[new_k] = _walk(v)
            return result
        if isinstance(node, list):
            return [_walk(x) for x in node]
        if isinstance(node, str):
            return apply_to_text(node, pairs)
        return node

    return _walk(data)


def dry_run_report(project_dir: Path, rename_map: Dict[str, Any]) -> Dict[str, Any]:
    """Scan the project and report what would be replaced — without writing.

    Returns:
        {"files": [{"path": str, "replacement_count": int}, ...],
         "total_pairs": int,
         "high_risk_patterns": [str, ...]}  # patterns with ≤3 literal chars
    """
    normalizer_dir = project_dir / "04-entity-normalizer"
    chars = json.loads((normalizer_dir / "characters.json").read_text("utf-8"))
    locs = json.loads((normalizer_dir / "locations.json").read_text("utf-8"))
    pairs = sort_pairs(
        build_replacement_pairs(
            rename_map, chars["characters"], locs["locations"]
        )
    )

    files: List[Dict[str, Any]] = []
    for sub in ("02-character-architect", "03-entity-planner"):
        d = project_dir / sub
        if d.exists():
            for f in d.rglob("*.md"):
                text = f.read_text("utf-8")
                cnt = sum(len(p.pattern.findall(text)) for p in pairs)
                files.append({
                    "path": str(f.relative_to(project_dir)),
                    "replacement_count": cnt,
                })

    scripts_dir = project_dir / "05-episode-writer" / "scripts"
    if scripts_dir.exists():
        for f in scripts_dir.rglob("*.md"):
            text = f.read_text("utf-8")
            cnt = sum(len(p.pattern.findall(text)) for p in pairs)
            files.append({
                "path": str(f.relative_to(project_dir)),
                "replacement_count": cnt,
            })

    high_risk = [p.pattern.pattern for p in pairs if _pattern_literal_length(p) <= 3]

    return {
        "files": files,
        "total_pairs": len(pairs),
        "high_risk_patterns": high_risk,
    }


def main(argv: list[str]) -> int:
    import argparse

    p = argparse.ArgumentParser(
        description="Apply rename_map.json to a moonscripts book."
    )
    p.add_argument("--book-slug", required=True)
    p.add_argument("--map", required=True, help="Path to rename_map.json")
    p.add_argument("--project-root", default=".",
                   help="Repo root (expects moonscripts/<slug>/ under it)")
    p.add_argument("--dry-run", action="store_true",
                   help="Report what would change; don't write.")
    args = p.parse_args(argv)

    project_dir = Path(args.project_root) / "moonscripts" / args.book_slug
    rename_map = json.loads(Path(args.map).read_text("utf-8"))

    if args.dry_run:
        report = dry_run_report(project_dir, rename_map)
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0

    result = apply_to_project(project_dir, rename_map)
    print(f"[OK] rename {result} to {project_dir}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main(sys.argv[1:]))
