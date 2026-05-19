"""Phase R hard checks — run after apply_rename to catch residuals."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from apply_rename import _BACKUP_SUBDIRS, _BL, _BR


class ResidualFound(Exception):
    """Old tokens still appear after apply."""


class IntegrityFail(Exception):
    """MSS tokens or speaker labels reference unknown IDs."""


def _iter_pipeline_md_files(project_dir: Path):
    """Yield .md files under the rename-owned pipeline subdirs (02-06).

    Skips Phase 01 source novels and book-root files (README, signal_checklist)
    which are intentionally outside the rename's modification scope, and skips
    ``.backups/`` mirrors.
    """
    for sub in _BACKUP_SUBDIRS:
        d = project_dir / sub
        if not d.exists():
            continue
        for f in d.rglob("*.md"):
            if ".backups" in f.parts:
                continue
            if f.is_file():
                yield f


def check_residual(project_dir: Path, rename_map: Dict[str, Any]) -> None:
    """Raise ResidualFound if any old_id / old_alias still appears in the
    rename-owned pipeline dirs (02-06). Files outside that scope (Phase 01
    source, book-root docs) are intentionally not scanned — apply_rename
    doesn't touch them, so residuals there are not regressions.
    """
    tokens: List[str] = []
    for old_id, entry in rename_map.get("characters", {}).items():
        if entry["new_id"] != old_id:
            tokens.append(old_id)
            tokens.append(old_id.upper())
        for old_alias, new_alias in entry.get("alias_mapping", {}).items():
            if new_alias != old_alias:
                tokens.append(old_alias)
    for old_id, entry in rename_map.get("locations", {}).items():
        if entry["new_id"] != old_id:
            tokens.append(old_id)
        for old_alias, new_alias in entry.get("alias_mapping", {}).items():
            if new_alias is not None and new_alias != old_alias:
                tokens.append(old_alias)
    for free in rename_map.get("free_tokens", {}):
        tokens.append(free)

    hits: List[str] = []
    for f in _iter_pipeline_md_files(project_dir):
        text = f.read_text("utf-8")
        for tok in tokens:
            # Strict non-letter boundary (not \b): \b treats underscore as
            # a word char, so \bmalia\b misses asset tokens like
            # 'theme_malia_morning'. _BL/_BR use negative lookbehind /
            # lookahead on [A-Za-z] only — digits, _, -, CJK all count as
            # boundaries, but "malice" (alphabet-continuous) stays safe.
            if re.search(rf"{_BL}{re.escape(tok)}{_BR}", text, re.ASCII):
                hits.append(f"{f.relative_to(project_dir)}: '{tok}'")
    if hits:
        raise ResidualFound("Residual old tokens:\n" + "\n".join(hits[:20]))


MSS_KEYWORDS = frozenset({
    "bg", "music", "sfx", "cg", "phone", "minigame", "choice", "option",
    "on", "affection", "xp", "san", "signal", "butterfly", "pause", "if",
    "else", "gate", "next", "ending", "episode", "text", "look", "show",
    "hide", "bubble", "play", "crossfade", "fadeout", "set", "from", "to", "for",
})


def _scan_mss_problems(root: Path) -> List[str]:
    """Scan one tree's 04 normalizer + 05 scripts, return integrity problems.

    Returns one string per (script, unknown_token) pair. Stable format so the
    strings can be diffed between backup and current trees.
    """
    norm = root / "04-entity-normalizer"
    if not norm.exists():
        return []
    chars = json.loads((norm / "characters.json").read_text("utf-8"))
    locs = json.loads((norm / "locations.json").read_text("utf-8"))
    known_chars = set(chars.get("characters", {}).keys())
    known_bgs: set = set()
    for loc in locs.get("locations", {}).values():
        known_bgs.update(loc.get("sub_locations", {}).keys())

    problems: List[str] = []
    scripts = root / "05-episode-writer" / "scripts"
    if not scripts.exists():
        return problems
    for s in scripts.glob("ep_*_final.md"):
        text = s.read_text("utf-8")
        for m in re.finditer(r"@([a-z_][a-z0-9_]*)\b", text):
            tok = m.group(1)
            if tok in MSS_KEYWORDS:
                continue
            if tok not in known_chars:
                problems.append(f"{s.name}: @{tok} (no matching character)")
        for m in re.finditer(r"@bg\s+set\s+(\S+)", text):
            bg = m.group(1).rstrip(";,")
            if bg not in known_bgs:
                problems.append(f"{s.name}: @bg set {bg} (no matching location)")
    return problems


def _find_latest_backup(project_dir: Path) -> Optional[Path]:
    """Return the most recent backup dir under 04.5-entity-rename/.backups/.

    Timestamps are ``YYYYMMDD-HHMMSS`` so lexicographic sort is chronological.
    Returns None if no backups exist.
    """
    backup_root = project_dir / "04.5-entity-rename" / ".backups"
    if not backup_root.exists():
        return None
    dirs = [p for p in backup_root.iterdir() if p.is_dir()]
    if not dirs:
        return None
    return sorted(dirs, reverse=True)[0]


def check_mss_integrity(
    project_dir: Path, backup_dir: Optional[Path] = None
) -> List[str]:
    """Return list of unknown ``@<id>`` and ``@bg set <id>`` references.

    The check is advisory — it never raises. Pre-existing MSS data gaps
    (missing speakers, unregistered sub_locations) are the normalizer's
    responsibility to fix; rename only reports problems that it caused.

    When ``backup_dir`` is supplied, problems present in the backup are
    filtered out — only rename-introduced regressions are returned. Without
    a backup, every current problem is returned so the caller can see the
    full state.
    """
    current = _scan_mss_problems(project_dir)
    if backup_dir is None or not backup_dir.exists():
        return current
    baseline = set(_scan_mss_problems(backup_dir))
    return [p for p in current if p not in baseline]


def check_dead_aliases(project_dir: Path) -> List[str]:
    """Return list of warnings for aliases in alias_map.json that never appear
    in the rename-owned pipeline corpus (02-06). Scope matches ``check_residual``
    — aliases referenced only in Phase 01 source or book-root docs are still
    considered dead, since downstream stages 05/06 are what consume them.
    """
    norm = project_dir / "04-entity-normalizer"
    alias_map = json.loads((norm / "alias_map.json").read_text("utf-8"))
    corpus_parts: List[str] = []
    for sub in _BACKUP_SUBDIRS:
        d = project_dir / sub
        if not d.exists():
            continue
        for f in d.rglob("*"):
            if ".backups" in f.parts:
                continue
            if f.is_file() and f.suffix in (".md", ".json"):
                corpus_parts.append(f.read_text("utf-8"))
    corpus = "\n".join(corpus_parts)
    warnings: List[str] = []
    for alias in alias_map.get("character_aliases", {}):
        if not re.search(rf"{_BL}{re.escape(alias)}{_BR}", corpus, re.ASCII):
            warnings.append(f"dead alias: '{alias}'")
    return warnings


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(
        description="Phase R hard checks: residual (hard), MSS integrity + "
                    "dead aliases (advisory warnings).",
    )
    p.add_argument("--book-slug", required=True)
    p.add_argument("--map", required=True)
    p.add_argument("--project-root", default=".")
    args = p.parse_args(argv)

    project_dir = Path(args.project_root) / "moonscripts" / args.book_slug
    rename_map = json.loads(Path(args.map).read_text("utf-8"))

    # check_residual is the only hard guard — it catches rename regressions
    # (old token still present in rename-owned dirs). Fails with exit 1.
    try:
        check_residual(project_dir, rename_map)
    except ResidualFound as e:
        print(f"[FAIL] {e}", file=sys.stderr)
        return 1

    # Advisory checks: MSS integrity and dead aliases are reported as warnings.
    # MSS integrity diffs against the latest backup so pre-existing data gaps
    # (a bug in normalizer, not rename) are not surfaced as rename issues.
    backup_dir = _find_latest_backup(project_dir)
    for w in check_mss_integrity(project_dir, backup_dir=backup_dir):
        print(f"[WARN] MSS: {w}", file=sys.stderr)
    for w in check_dead_aliases(project_dir):
        print(f"[WARN] {w}", file=sys.stderr)
    print("[OK] Phase R hard checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
