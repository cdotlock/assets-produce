# skills/episode-writer/tests/test_audit_bg_refs.py
"""Tests for audit_bg_refs — Layer B LLM classifier."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

import audit_bg_refs as A


# ───────── pure helpers ─────────

def test_extract_bg_refs_finds_all_bg_set_directives(tmp_path):
    p = tmp_path / "ep_1_final.md"
    p.write_text("""
@episode main:01 "Test" {
@bg set school_hallway
NARRATOR: text.
@bg set selena_house_bedroom fade
@cg show big_kiss { content: "..." }
@bg set school_hallway   # second time, dedup
}
""")
    refs = A.extract_bg_refs(p)
    assert refs == {
        ("school_hallway", "@bg"),
        ("selena_house_bedroom", "@bg"),
        ("big_kiss", "@cg"),
    }


def test_extract_bg_refs_ignores_commented_lines(tmp_path):
    p = tmp_path / "ep.md"
    p.write_text("""
// @bg set commented_out
@bg set real_bg
""")
    refs = A.extract_bg_refs(p)
    assert refs == {("real_bg", "@bg")}


def test_classify_known_returns_known_for_existing_subs():
    locations = {"school_hallway", "selena_house_bedroom"}
    assert A.classify_known("school_hallway", locations) == "KNOWN"
    assert A.classify_known("school_hallway ", locations) == "KNOWN"
    assert A.classify_known("SCHOOL_HALLWAY", locations) == "KNOWN"
    assert A.classify_known("mars_colony", locations) is None


# ───────── LLM classifier (mocked) ─────────

def test_classify_via_llm_typo_branch():
    fake_llm = MagicMock(return_value=json.dumps({
        "classification": "TYPO",
        "suggested_canonical": "selena_house_bedroom",
        "reason": "missing 'u' in 'house'",
    }))
    res = A.classify_via_llm(
        ref_id="selena_hosue_bedroom",
        canonical_set={"selena_house_bedroom", "school_hallway"},
        llm_fn=fake_llm,
    )
    assert res.classification == "TYPO"
    assert res.suggested_canonical == "selena_house_bedroom"
    assert "missing 'u'" in res.reason


def test_classify_via_llm_variant_branch():
    fake_llm = MagicMock(return_value=json.dumps({
        "classification": "VARIANT",
        "suggested_canonical": "selena_house_porch",
        "reason": "dusk-time variant of porch",
    }))
    res = A.classify_via_llm(
        ref_id="selena_house_porch_late_dusk",
        canonical_set={"selena_house_porch"},
        llm_fn=fake_llm,
    )
    assert res.classification == "VARIANT"
    assert res.suggested_canonical == "selena_house_porch"


def test_classify_via_llm_genuinely_new_branch():
    fake_llm = MagicMock(return_value=json.dumps({
        "classification": "GENUINELY_NEW",
        "suggested_canonical": None,
        "reason": "not in dictionary",
    }))
    res = A.classify_via_llm(
        ref_id="mars_colony",
        canonical_set={"school_hallway"},
        llm_fn=fake_llm,
    )
    assert res.classification == "GENUINELY_NEW"
    assert res.suggested_canonical is None


def test_classify_via_llm_handles_dirty_json_with_extra_text():
    """Real LLMs sometimes prefix with markdown — strip and parse."""
    fake_llm = MagicMock(return_value="""Sure, here's the JSON:
```json
{"classification": "TYPO", "suggested_canonical": "school_hallway", "reason": "extra h"}
```""")
    res = A.classify_via_llm(
        ref_id="school_hhallway",
        canonical_set={"school_hallway"},
        llm_fn=fake_llm,
    )
    assert res.classification == "TYPO"


# ───────── audit() top-level ─────────

def test_audit_passes_when_all_refs_are_known(tmp_path):
    ep = tmp_path / "ep_1_final.md"
    ep.write_text("@bg set school_hallway\n")
    locs = {"school_hallway"}
    fake_llm = MagicMock()
    report = A.audit(episode_path=ep, locations=locs, llm_fn=fake_llm)
    assert report.ok is True
    assert report.findings == []
    fake_llm.assert_not_called()


def test_audit_hard_fails_on_typo_with_suggested_canonical(tmp_path):
    ep = tmp_path / "ep_1_final.md"
    ep.write_text("@bg set selena_hosue_bedroom\n")
    locs = {"selena_house_bedroom"}
    fake_llm = MagicMock(return_value=json.dumps({
        "classification": "TYPO",
        "suggested_canonical": "selena_house_bedroom",
        "reason": "typo",
    }))
    report = A.audit(episode_path=ep, locations=locs, llm_fn=fake_llm)
    assert report.ok is False
    assert len(report.findings) == 1
    f = report.findings[0]
    assert f.classification == "TYPO"
    assert f.ref_id == "selena_hosue_bedroom"
    assert f.suggested_canonical == "selena_house_bedroom"


def test_audit_hard_fails_on_variant_with_parent_hint(tmp_path):
    ep = tmp_path / "ep.md"
    ep.write_text("@bg set selena_house_porch_late_dusk\n")
    locs = {"selena_house_porch"}
    fake_llm = MagicMock(return_value=json.dumps({
        "classification": "VARIANT",
        "suggested_canonical": "selena_house_porch",
        "reason": "dusk variant",
    }))
    report = A.audit(episode_path=ep, locations=locs, llm_fn=fake_llm)
    assert report.ok is False
    assert report.findings[0].classification == "VARIANT"


def test_audit_hard_fails_on_genuinely_new(tmp_path):
    ep = tmp_path / "ep.md"
    ep.write_text("@bg set mars_colony\n")
    locs = {"school_hallway"}
    fake_llm = MagicMock(return_value=json.dumps({
        "classification": "GENUINELY_NEW",
        "suggested_canonical": None,
        "reason": "not in 04",
    }))
    report = A.audit(episode_path=ep, locations=locs, llm_fn=fake_llm)
    assert report.ok is False
    assert report.findings[0].classification == "GENUINELY_NEW"
