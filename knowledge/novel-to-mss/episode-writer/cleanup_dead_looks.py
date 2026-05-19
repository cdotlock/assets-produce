#!/usr/bin/env python3
"""cleanup_dead_looks.py — strip every DEAD_LOOK directive from episode files.

Uses the same `find_dead_looks` heuristic as `look_audit.py` (single-visible-
slot + speaker-priority engine model). For each `@<char> look <token>` line
that the engine would never display, deletes:
  - the directive line itself
  - one adjacent blank line (the one immediately following, falling back to
    the one immediately preceding) — keeps paragraph spacing tidy

Re-running `look_audit.py` after a clean pass should report 0 DEAD_LOOK.

Usage:
    python3 skills/episode-writer/cleanup_dead_looks.py <ep1.md> <ep2.md> ...
    python3 skills/episode-writer/cleanup_dead_looks.py --dry-run <ep.md>
"""
from __future__ import annotations

import argparse
import pathlib
import sys

from look_audit import find_dead_looks


def cleanup_one(path: pathlib.Path, dry_run: bool = False) -> int:
    """Strip DEAD_LOOK directives from `path`. Returns count removed."""
    lines = path.read_text().splitlines()
    dead = find_dead_looks(lines)
    if not dead:
        return 0

    # collect indices to delete (1-based line numbers from find_dead_looks)
    delete_idx: set[int] = set()
    for line_idx, _ch, _tok in dead:
        i = line_idx - 1   # 0-based
        delete_idx.add(i)
        # also remove an adjacent blank line so we don't leave a double-blank
        if i + 1 < len(lines) and lines[i + 1].strip() == "":
            delete_idx.add(i + 1)
        elif i - 1 >= 0 and lines[i - 1].strip() == "":
            delete_idx.add(i - 1)

    new_lines = [ln for k, ln in enumerate(lines) if k not in delete_idx]
    new_text = "\n".join(new_lines)
    if path.read_text().endswith("\n"):
        new_text += "\n"

    if dry_run:
        sys.stderr.write(f"  [dry] {path.name}: would remove {len(dead)} dead look(s)\n")
    else:
        path.write_text(new_text, encoding="utf-8")
        sys.stderr.write(f"  cleaned {path.name}: -{len(dead)} dead look(s)\n")
    return len(dead)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", help="episode .md file(s)")
    ap.add_argument("--dry-run", action="store_true",
                    help="report only, don't modify")
    args = ap.parse_args()

    total = 0
    files_touched = 0
    for p in args.paths:
        path = pathlib.Path(p).resolve()
        if not path.exists():
            sys.stderr.write(f"  skip (not found): {p}\n")
            continue
        n = cleanup_one(path, dry_run=args.dry_run)
        total += n
        if n > 0:
            files_touched += 1

    label = "would remove" if args.dry_run else "removed"
    sys.stderr.write(
        f"\n{label} {total} dead-look directive(s) "
        f"across {files_touched} file(s)\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
