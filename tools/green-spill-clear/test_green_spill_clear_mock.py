#!/usr/bin/env python3
"""Hermetic contract test for tools/green-spill-clear/green-spill-clear.py --mock entry.

This suite MUST run on plain python3 with NO numpy / Pillow installed for the
--mock path (mock writes a stdlib-only 1x1 RGBA PNG). Pillow is used in the
optional round-trip assertion path only.

Run:  python3 -m pytest tools/green-spill-clear/test_green_spill_clear_mock.py -q
"""
from __future__ import annotations

import json
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parent / "green-spill-clear.py"


def _run(args: list[str], stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(TOOL), *args],
        input=stdin,
        capture_output=True,
        text=True,
    )


def _assert_valid_1x1_rgba_png(path: Path) -> None:
    """Re-open the produced PNG and assert it is a valid 1x1 RGBA image.

    Pillow path (preferred): Image.open(...).convert("RGBA") must not raise
    and dimensions/mode must match. Pillow-free fallback: parse PNG chunks,
    verify every stored CRC and that the IDAT zlib stream inflates.

    Mandatory round-trip assertion (guards against the corrupt-placeholder-PNG
    regression found in Phase 13 review).
    """
    assert path.is_file(), f"output file not created: {path}"
    raw = path.read_bytes()
    assert len(raw) > 0, "output PNG is empty"

    try:
        from PIL import Image  # noqa: F401
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
    out = smoke_dir / "out.png"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "delta": 5,
        "bright_sum": 400,
        "overwrite": True,
        "mock": True,
    }
    fixture = smoke_dir / "input.json"
    fixture.write_text(json.dumps(payload))

    proc = _run(["--mock", "--input", str(fixture)])
    assert proc.returncode == 0, f"stderr={proc.stderr}"

    doc = json.loads(proc.stdout)
    assert doc["meta"]["atomic_tool"] == "green-spill-clear"
    assert doc["meta"]["mock"] is True
    assert "path" in doc["output"]

    _assert_valid_1x1_rgba_png(Path(doc["output"]["path"]))


def test_mock_stdin_input(smoke_dir: Path) -> None:
    out = smoke_dir / "out_stdin.png"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "delta": 5,
        "bright_sum": 400,
        "overwrite": True,
        "mock": True,
    }

    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 0, f"stderr={proc.stderr}"

    doc = json.loads(proc.stdout)
    assert doc["meta"]["atomic_tool"] == "green-spill-clear"
    assert doc["meta"]["mock"] is True

    _assert_valid_1x1_rgba_png(Path(doc["output"]["path"]))


def test_mock_meta_echoes_params(smoke_dir: Path) -> None:
    """Meta block must echo back the delta/bright_sum params used."""
    out = smoke_dir / "out_meta.png"
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(out),
        "delta": 8,
        "bright_sum": 350,
        "overwrite": True,
        "mock": True,
    }
    proc = _run(["--mock", "--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 0, f"stderr={proc.stderr!r}"
    doc = json.loads(proc.stdout)
    assert doc["meta"]["delta"] == 8
    assert doc["meta"]["bright_sum"] == 350
    _assert_valid_1x1_rgba_png(Path(doc["output"]["path"]))


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
        stdin=json.dumps({"output_path": str(smoke_dir / "x.png"), "mock": True}),
    )
    assert proc.returncode == 2
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


def test_negative_non_integer_delta(smoke_dir: Path) -> None:
    """A non-int-coercible delta is a bad input field -> INVALID_INPUT exit 2."""
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(smoke_dir / "out.png"),
        "delta": "oops",
        "mock": True,
        "overwrite": True,
    }
    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 2, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


def test_negative_non_integer_bright_sum(smoke_dir: Path) -> None:
    """A non-int-coercible bright_sum is a bad input field -> INVALID_INPUT exit 2."""
    payload = {
        "input_path": str(smoke_dir / "in.png"),
        "output_path": str(smoke_dir / "out.png"),
        "bright_sum": "bad",
        "mock": True,
        "overwrite": True,
    }
    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 2, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


def test_negative_unwritable_output_dir(smoke_dir: Path) -> None:
    # A path whose parent is an existing *file* -> mkdir(parents=True) raises
    # NotADirectoryError (an OSError subclass) -> INVALID_INPUT + exit 2.
    blocker = smoke_dir / "blocker"
    blocker.write_text("not a dir")
    out = blocker / "nested" / "out.png"
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


def test_explicit_cli_input_output(smoke_dir: Path) -> None:
    """The explicit single-file CLI (--input/--output) processes one file."""
    # Step 1: produce a valid source RGBA PNG via the mock JSON path.
    src = smoke_dir / "src.png"
    seed_payload = {
        "input_path": str(smoke_dir / "unused.png"),
        "output_path": str(src),
        "mock": True,
        "overwrite": True,
    }
    seed = _run(["--input", "-"], stdin=json.dumps(seed_payload))
    assert seed.returncode == 0, f"seed stderr={seed.stderr!r}"
    _assert_valid_1x1_rgba_png(src)

    # Step 2: explicit CLI processes src -> dst.
    dst = smoke_dir / "explicit_out.png"
    proc = _run(
        ["--input", str(src), "--output", str(dst), "--delta", "5", "--bright-sum", "400"]
    )
    assert proc.returncode == 0, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    assert dst.exists(), "explicit CLI did not write output"
    _assert_valid_1x1_rgba_png(dst)


def test_explicit_cli_missing_input_file(smoke_dir: Path) -> None:
    """Explicit CLI with a non-existent --input -> exit 2, no output written."""
    dst = smoke_dir / "never.png"
    proc = _run(
        ["--input", str(smoke_dir / "does_not_exist.png"), "--output", str(dst)]
    )
    assert proc.returncode == 2, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    assert "ERROR" in proc.stderr
    assert not dst.exists()


# ---------------------------------------------------------------------------
# Negative: non-string input_path  (must be INVALID_INPUT/exit 2, not the
# TypeError-driven INTERNAL/exit 1 from pathlib.Path(<non-str>))
# ---------------------------------------------------------------------------

def test_negative_non_string_input_path(smoke_dir: Path) -> None:
    """A non-string input_path -> INVALID_INPUT exit 2.  output_path is a
    valid string so the required-field falsy check passes; the isinstance
    guard is what must reject this (Path(123) would otherwise raise TypeError)."""
    payload = {"input_path": 123, "output_path": str(smoke_dir / "out.png")}
    proc = _run(["--input", "-"], stdin=json.dumps(payload))
    assert proc.returncode == 2, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""


# ---------------------------------------------------------------------------
# Negative: binary (non-UTF-8) file as the JSON payload  (must be
# INVALID_INPUT/exit 2, not INTERNAL/exit 1 -- UnicodeDecodeError is a
# ValueError and escapes the `except OSError` around the input-file read)
# ---------------------------------------------------------------------------

def test_negative_binary_input_file(smoke_dir: Path) -> None:
    """A binary file passed as --input <path> -> INVALID_INPUT exit 2."""
    binp = smoke_dir / "binary.bin"
    binp.write_bytes(b"\x89PNG\r\n\x1a\n\xff\xd8\xff\x00\x01\x02")
    proc = _run(["--input", str(binp)])
    assert proc.returncode == 2, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
    err = json.loads(proc.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
    assert proc.stdout.strip() == ""
