"""Scan a project for proper nouns not already in the normalizer."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Set

SKIP_CAPS: Set[str] = {
    "The", "A", "An", "I", "You", "He", "She", "It", "We", "They",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December",
    "Yes", "No", "OK", "Beat", "Episode", "Scene",
}


def scan_project(project_dir: Path, known_tokens: Set[str]) -> Dict[str, Any]:
    """Scan .md / .json files in pipeline stages for capitalized proper nouns.

    Returns {"unknown_tokens": {token: frequency}} — tokens NOT in
    known_tokens, SKIP_CAPS, or matching common English words.
    """
    pattern = re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b")
    freq: Dict[str, int] = {}
    for sub in (
        "02-character-architect",
        "03-entity-planner",
        "05-episode-writer",
        "06-asset-prompt-generator",
    ):
        d = project_dir / sub
        if not d.exists():
            continue
        for f in d.rglob("*"):
            if not f.is_file() or f.suffix not in (".md", ".json"):
                continue
            for m in pattern.finditer(f.read_text("utf-8")):
                tok = m.group(0)
                if tok in known_tokens or tok in SKIP_CAPS:
                    continue
                freq[tok] = freq.get(tok, 0) + 1
    return {"unknown_tokens": freq}


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(
        description="Scan for capitalized proper nouns not in the normalizer."
    )
    p.add_argument("--book-slug", required=True)
    p.add_argument("--project-root", default=".")
    p.add_argument(
        "--exclude-known-from",
        default=None,
        help="Path to characters.json; full_names + aliases are excluded from the scan.",
    )
    args = p.parse_args(argv)

    project_dir = Path(args.project_root) / "moonscripts" / args.book_slug
    known: Set[str] = set()
    if args.exclude_known_from:
        data = json.loads(Path(args.exclude_known_from).read_text("utf-8"))
        for c in data.get("characters", {}).values():
            known.update(c.get("full_name", "").split())
            known.update(c.get("aliases", []))

    report = scan_project(project_dir, known)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
