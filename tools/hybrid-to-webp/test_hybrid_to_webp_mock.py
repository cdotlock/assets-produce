#!/usr/bin/env python3
"""Hermetic contract test for tools/hybrid-to-webp/hybrid-to-webp.py --mock entry.

This suite MUST run with Pillow installed (the tool's sole runtime dep).
Unlike tools/matting, mock mode for hybrid-to-webp uses Pillow to write a
valid 1×1 WebP because Pillow is the only runtime dep (no heavy ML stack),
so a Pillow-free WebP generator is impractical.

The key invariant is unchanged: the mock test MUST load the produced artifact
with Pillow and assert it is a valid image (round-trip), not merely that the
file exists (the C1 regression guard).

Run:  python3 -m pytest tools/hybrid-to-webp/test_hybrid_to_webp_mock.py -q
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image

TOOL = Path(__file__).resolve().parent / "hybrid-to-webp.py"


def _run(args: list[str], stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(TOOL), *args],
        input=stdin,
        capture_output=True,
        text=True,
    )


def _assert_valid_webp(path: Path) -> None:
    """Re-open the produced file with Pillow and assert it is a valid WebP image.

    Round-trip assertion: mandatory (guards against the corrupt-placeholder-PNG
    regression found in Phase 13 review — a file can exist and have size > 0
    but still be an invalid / truncated image artifact).
    """
    assert path.is_file(), f"output file not created: {path}"
    raw = path.read_bytes()
    assert len(raw) > 0, "output WebP is empty"

    img = Image.open(path)
    # Pillow's WebP loader is lazy — call load() to force full decode.
    img.load()
    assert img.size[0] >= 1, f"unexpected image width: {img.size}"
    assert img.size[1] >= 1, f"unexpected image height: {img.size}"
    assert img.format == "WEBP", f"expected WEBP format, got {img.format!r}"


@pytest.fixture()
def smoke_dir(tmp_path: Path) -> Path:
    d = tmp_path / "smoke"
    d.mkdir()
    return d


def test_mock_file_input(smoke_dir: Path) -> None:
    out = smoke_dir / "out.webp"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "quality": 90,
        "method": 6,
        "overwrite": True,
        "mock": True,
    }
    fixture = smoke_dir / "input.json"
    fixture.write_text(json.dumps(payload))

    proc = _run(["--mock", "--input", str(fixture)])
    assert proc.returncode == 0, f"stderr={proc.stderr!r}\nstdout={proc.stdout!r}"

    doc = json.loads(proc.stdout)
    assert doc["meta"]["atomic_tool"] == "hybrid-to-webp"
    assert doc["meta"]["mock"] is True
    assert "path" in doc["output"]

    _assert_valid_webp(Path(doc["output"]["path"]))


def test_mock_stdin_input(smoke_dir: Path) -> None:
    out = smoke_dir / "out_stdin.webp"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "quality": 90,
        "method": 6,
        "overwrite": True,
        "mock": True,
    }

    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 0, f"stderr={proc.stderr!r}\nstdout={proc.stdout!r}"

    doc = json.loads(proc.stdout)
    assert doc["meta"]["atomic_tool"] == "hybrid-to-webp"
    assert doc["meta"]["mock"] is True

    _assert_valid_webp(Path(doc["output"]["path"]))


def test_mock_meta_echoes_encoding_params(smoke_dir: Path) -> None:
    """Meta block must echo back the encoding params used."""
    out = smoke_dir / "out_meta.webp"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "quality": 80,
        "method": 4,
        "overwrite": True,
        "mock": True,
    }
    proc = _run(["--mock", "--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 0, f"stderr={proc.stderr!r}"
    doc = json.loads(proc.stdout)
    assert doc["meta"]["quality"] == 80
    assert doc["meta"]["method"] == 4
    _assert_valid_webp(Path(doc["output"]["path"]))


def test_negative_non_dict_payload() -> None:
    proc = _run(["--input", "-"], stdin="[]")
    assert proc.returncode == 2
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert "object" in err["error"]["message"]
    assert proc.stdout.strip() == ""


def test_negative_missing_input_path(smoke_dir: Path) -> None:
    proc = _run(
        ["--input", "-"],
        stdin=json.dumps({"output_path": str(smoke_dir / "x.webp"), "mock": True}),
    )
    assert proc.returncode == 2
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


def test_negative_unwritable_output_dir(smoke_dir: Path) -> None:
    # A path whose parent is an existing *file* → mkdir(parents=True) raises
    # NotADirectoryError (an OSError subclass) → INVALID_INPUT + exit 2.
    blocker = smoke_dir / "blocker"
    blocker.write_text("not a dir")
    out = blocker / "nested" / "out.webp"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "mock": True,
        "overwrite": True,
    }
    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 2, f"stdout={proc.stdout} stderr={proc.stderr}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""
