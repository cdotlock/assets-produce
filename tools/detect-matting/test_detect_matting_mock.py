#!/usr/bin/env python3
"""Hermetic contract test for tools/detect-matting/detect-matting.py --mock entry.

This suite MUST run on plain python3 with NO numpy/PIL/scipy installed for the
--mock path (mock writes a deterministic report JSON using stdlib only).

Run:  python3 -m pytest tools/detect-matting/test_detect_matting_mock.py -q
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parent / "detect-matting.py"


def _run(args: list[str], stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(TOOL), *args],
        input=stdin,
        capture_output=True,
        text=True,
    )


def _assert_valid_report(path: Path) -> dict:
    """Open the report JSON at path and assert it has the correct schema.

    Returns the parsed dict for further assertions.

    Mandatory round-trip assertion: the output file must exist, be valid JSON,
    and contain the required verdict + metric keys.
    """
    assert path.is_file(), f"report file not created: {path}"
    raw = path.read_text(encoding="utf-8")
    assert raw.strip(), "report file is empty"
    doc = json.loads(raw)

    assert "verdict" in doc, "report missing 'verdict'"
    assert doc["verdict"] in {"PASS", "FAIL"}, f"unexpected verdict: {doc['verdict']!r}"
    assert isinstance(doc.get("holes_pct"), (int, float)), (
        f"holes_pct must be a number, got {doc.get('holes_pct')!r}"
    )
    assert isinstance(doc.get("body_gap_px"), int), (
        f"body_gap_px must be an int, got {doc.get('body_gap_px')!r}"
    )
    assert "threshold_holes" in doc, "report missing 'threshold_holes'"
    assert "threshold_body_gap" in doc, "report missing 'threshold_body_gap'"
    assert "input" in doc, "report missing 'input'"
    return doc


@pytest.fixture()
def smoke_dir(tmp_path: Path) -> Path:
    d = tmp_path / "smoke"
    d.mkdir()
    return d


# ---------------------------------------------------------------------------
# Mock file-entry
# ---------------------------------------------------------------------------

def test_mock_file_input(smoke_dir: Path) -> None:
    out = smoke_dir / "report.json"
    payload = {
        "input": str(smoke_dir / "in.png"),
        "output": str(out),
        "threshold_holes": 5.0,
        "threshold_body_gap": 400000,
    }
    fixture = smoke_dir / "input.json"
    fixture.write_text(json.dumps(payload))

    proc = _run(["--mock", "--input", str(fixture)])
    assert proc.returncode == 0, f"stderr={proc.stderr}"

    doc = json.loads(proc.stdout)
    assert doc["meta"]["atomic_tool"] == "detect-matting"
    assert doc["meta"]["mock"] is True
    assert "path" in doc["output"]

    _assert_valid_report(Path(doc["output"]["path"]))


# ---------------------------------------------------------------------------
# Mock stdin-entry
# ---------------------------------------------------------------------------

def test_mock_stdin_input(smoke_dir: Path) -> None:
    out = smoke_dir / "report_stdin.json"
    payload = {
        "input": str(smoke_dir / "in.png"),
        "output": str(out),
        "mock": True,
    }

    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 0, f"stderr={proc.stderr}"

    doc = json.loads(proc.stdout)
    assert doc["meta"]["atomic_tool"] == "detect-matting"
    assert doc["meta"]["mock"] is True

    _assert_valid_report(Path(doc["output"]["path"]))


# ---------------------------------------------------------------------------
# Round-trip: report content matches mock deterministic values
# ---------------------------------------------------------------------------

def test_mock_deterministic_report_values(smoke_dir: Path) -> None:
    """Mock report must be deterministic: PASS, holes_pct=0.0, body_gap_px=0."""
    out = smoke_dir / "report_det.json"
    payload = {
        "input": "__mock__",
        "output": str(out),
    }
    proc = _run(["--mock", "--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 0, f"stderr={proc.stderr!r}"

    doc = json.loads(proc.stdout)
    report = _assert_valid_report(Path(doc["output"]["path"]))
    assert report["verdict"] == "PASS"
    assert report["holes_pct"] == 0.0
    assert report["body_gap_px"] == 0
    assert report["threshold_holes"] == 5.0
    assert report["threshold_body_gap"] == 400000


# ---------------------------------------------------------------------------
# Meta echoes verdict + metrics in the envelope
# ---------------------------------------------------------------------------

def test_mock_meta_echoes_metrics(smoke_dir: Path) -> None:
    """Meta block must echo verdict, holes_pct, body_gap_px, and threshold keys."""
    out = smoke_dir / "report_meta.json"
    payload = {
        "input": "__mock__",
        "output": str(out),
        "threshold_holes": 3.5,
        "threshold_body_gap": 200000,
    }
    proc = _run(["--mock", "--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 0, f"stderr={proc.stderr!r}"
    doc = json.loads(proc.stdout)
    meta = doc["meta"]
    assert "verdict" in meta
    assert "holes_pct" in meta
    assert "body_gap_px" in meta
    assert "threshold_holes" in meta
    assert "threshold_body_gap" in meta
    _assert_valid_report(Path(doc["output"]["path"]))


# ---------------------------------------------------------------------------
# Explicit single-file CLI (--input/--output as PNG paths)
# ---------------------------------------------------------------------------

def test_explicit_cli_missing_input_file(smoke_dir: Path) -> None:
    """Explicit CLI with a non-existent --input -> exit 2."""
    out_report = smoke_dir / "never.json"
    proc = _run(
        ["--input", str(smoke_dir / "does_not_exist.png"),
         "--output", str(out_report)]
    )
    assert proc.returncode == 2, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    assert not out_report.exists()


# ---------------------------------------------------------------------------
# Negative: non-dict payload
# ---------------------------------------------------------------------------

def test_negative_non_dict_payload() -> None:
    proc = _run(["--input", "-"], stdin="[]")
    assert proc.returncode == 2
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


# ---------------------------------------------------------------------------
# Negative: missing required field 'input'
# ---------------------------------------------------------------------------

def test_negative_missing_input_field(smoke_dir: Path) -> None:
    proc = _run(
        ["--input", "-"],
        stdin=json.dumps({"output": str(smoke_dir / "r.json")}),
    )
    assert proc.returncode == 2
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


# ---------------------------------------------------------------------------
# Negative: missing required field 'output'
# ---------------------------------------------------------------------------

def test_negative_missing_output_field(smoke_dir: Path) -> None:
    proc = _run(
        ["--input", "-"],
        stdin=json.dumps({"input": str(smoke_dir / "in.png")}),
    )
    assert proc.returncode == 2
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


# ---------------------------------------------------------------------------
# Negative: non-numeric threshold_holes (HAZARD-2)
# ---------------------------------------------------------------------------

def test_negative_non_numeric_threshold_holes(smoke_dir: Path) -> None:
    """A non-float-coercible threshold_holes -> INVALID_INPUT exit 2."""
    payload = {
        "input": str(smoke_dir / "in.png"),
        "output": str(smoke_dir / "r.json"),
        "threshold_holes": "oops",
    }
    proc = _run(["--mock", "--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 2, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


# ---------------------------------------------------------------------------
# Negative: non-numeric threshold_body_gap (HAZARD-2)
# ---------------------------------------------------------------------------

def test_negative_non_numeric_threshold_body_gap(smoke_dir: Path) -> None:
    """A non-int-coercible threshold_body_gap -> INVALID_INPUT exit 2."""
    payload = {
        "input": str(smoke_dir / "in.png"),
        "output": str(smoke_dir / "r.json"),
        "threshold_body_gap": "not-a-number",
    }
    proc = _run(["--mock", "--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 2, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


# ---------------------------------------------------------------------------
# Negative: unwritable / nonexistent output directory
# ---------------------------------------------------------------------------

def test_negative_unwritable_output_dir(smoke_dir: Path) -> None:
    # A path whose parent is an existing *file* -> mkdir(parents=True) raises
    # NotADirectoryError (an OSError subclass) -> INVALID_INPUT + exit 2.
    blocker = smoke_dir / "blocker"
    blocker.write_text("not a dir")
    out = blocker / "nested" / "report.json"
    payload = {
        "input": str(smoke_dir / "in.png"),
        "output": str(out),
    }
    proc = _run(["--mock", "--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 2, f"stdout={proc.stdout} stderr={proc.stderr}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""
