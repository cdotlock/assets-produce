"""Tests for scan_tokens.py."""
from __future__ import annotations

import json

from scan_tokens import scan_project


def test_scan_excludes_known(mini_project):
    chars = json.loads(
        (mini_project / "04-entity-normalizer" / "characters.json").read_text("utf-8")
    )
    known: set = set()
    for c in chars["characters"].values():
        known.update(c["full_name"].split())
        known.update(c.get("aliases", []))
    report = scan_project(mini_project, known_tokens=known)
    assert "unknown_tokens" in report
    assert isinstance(report["unknown_tokens"], dict)
