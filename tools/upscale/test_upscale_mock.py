#!/usr/bin/env python3
"""Hermetic contract test for tools/upscale/upscale.py --mock entry.

This suite MUST run on plain python3 with NO realesrgan binary / torch
installed. It exercises the deterministic mock path and re-opens the
produced PNG to prove it is a genuine, parseable 1×1 RGBA PNG. That
round-trip-load assertion is the gap that let a corrupt placeholder PNG
ship in the Phase-9 migration (the hardcoded hex blob carried an
inconsistent IDAT chunk / wrong CRC, so --mock exited 0 with a success
JSON while writing a file Pillow could not open).

Run:  python3 -m pytest tools/upscale/test_upscale_mock.py -q
"""
from __future__ import annotations

import json
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parent / "upscale.py"


def _run(args: list[str], stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(TOOL), *args],
        input=stdin,
        capture_output=True,
        text=True,
    )


def _assert_valid_1x1_rgba_png(path: Path) -> None:
    """Re-open the produced PNG and assert it is a valid 1×1 RGBA image.

    Pillow path (preferred): Image.open(...).convert("RGBA") must not raise
    and dimensions/mode must match. Pillow-free fallback: parse PNG chunks,
    verify every stored CRC and that the IDAT zlib stream inflates.
    """
    assert path.is_file(), f"output file not created: {path}"
    raw = path.read_bytes()
    assert len(raw) > 0, "output PNG is empty"

    try:
        from PIL import Image  # noqa: F401 — optional; not part of the ML stack
        has_pillow = True
    except ImportError:
        has_pillow = False

    if has_pillow:
        from PIL import Image
        img = Image.open(path).convert("RGBA")
        assert img.size == (1, 1), f"expected size (1, 1), got {img.size}"
        assert img.mode == "RGBA", f"expected mode RGBA, got {img.mode}"
        return

    # Pillow-free: hand-parse PNG chunks.
    assert raw[:8] == b"\x89PNG\r\n\x1a\n", "bad PNG signature"
    pos = 8
    saw_ihdr = False
    saw_idat = False
    idat_payload = b""
    while pos < len(raw):
        (length,) = struct.unpack(">I", raw[pos:pos + 4])
        tag = raw[pos + 4:pos + 8]
        data = raw[pos + 8:pos + 8 + length]
        (stored_crc,) = struct.unpack(">I", raw[pos + 8 + length:pos + 12 + length])
        assert stored_crc == (zlib.crc32(tag + data) & 0xFFFFFFFF), f"CRC mismatch in {tag!r}"
        if tag == b"IHDR":
            saw_ihdr = True
            w, h, bit_depth, color_type = struct.unpack(">IIBB", data[:10])
            assert (w, h) == (1, 1), f"IHDR dims expected (1, 1), got ({w}, {h})"
            assert bit_depth == 8 and color_type == 6, "expected 8-bit RGBA (color type 6)"
        elif tag == b"IDAT":
            saw_idat = True
            idat_payload += data
        pos += 12 + length
    assert saw_ihdr and saw_idat, "missing IHDR or IDAT"
    zlib.decompress(idat_payload)  # raises if the stream is corrupt


@pytest.fixture()
def smoke_dir(tmp_path: Path) -> Path:
    d = tmp_path / "smoke"
    d.mkdir()
    return d


def test_mock_file_input(smoke_dir: Path) -> None:
    out = smoke_dir / "out_upscaled.png"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "scale": 2,
        "model": "realesrgan-x4plus-anime",
        "mock": True,
        "overwrite": True,
    }
    fixture = smoke_dir / "input.json"
    fixture.write_text(json.dumps(payload))

    proc = _run(["--mock", "--input", str(fixture)])
    assert proc.returncode == 0, f"stderr={proc.stderr}"

    doc = json.loads(proc.stdout)
    assert doc["meta"]["atomic_tool"] == "upscale-image"
    assert doc["meta"]["mock"] is True
    assert doc["meta"]["scale"] == 2
    assert "path" in doc["output"]

    _assert_valid_1x1_rgba_png(Path(doc["output"]["path"]))


def test_mock_stdin_input(smoke_dir: Path) -> None:
    out = smoke_dir / "out_stdin_upscaled.png"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "scale": 4,
        "mock": True,
        "overwrite": True,
    }

    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 0, f"stderr={proc.stderr}"

    doc = json.loads(proc.stdout)
    assert doc["meta"]["atomic_tool"] == "upscale-image"
    assert doc["meta"]["mock"] is True
    assert doc["meta"]["scale"] == 4

    _assert_valid_1x1_rgba_png(Path(doc["output"]["path"]))


def test_negative_non_dict_payload() -> None:
    proc = _run(["--input", "-"], stdin="[]")
    assert proc.returncode == 2, f"stdout={proc.stdout} stderr={proc.stderr}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert "object" in err["error"]["message"]
    assert proc.stdout.strip() == ""


def test_negative_missing_required_fields(smoke_dir: Path) -> None:
    proc = _run(["--input", "-"], stdin=json.dumps({"output_path": str(smoke_dir / "x.png"), "mock": True}))
    assert proc.returncode == 2
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


def test_negative_unwritable_output_dir(smoke_dir: Path) -> None:
    # A path whose parent is an existing *file* → mkdir(parents=True) raises
    # NotADirectoryError (an OSError subclass) → INVALID_INPUT + exit 2.
    blocker = smoke_dir / "blocker"
    blocker.write_text("not a dir")
    out = blocker / "nested" / "out_upscaled.png"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "scale": 2,
        "mock": True,
        "overwrite": True,
    }
    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 2, f"stdout={proc.stdout} stderr={proc.stderr}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""
