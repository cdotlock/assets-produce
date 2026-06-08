#!/usr/bin/env python3
"""hybrid-to-webp.py — encode a MODNet-hybrid chromakey PNG to delivery WebP.

Atomic tool: takes ONE explicit input file and writes ONE explicit output
file. The original backend batch script discovered files by walking
repo-relative directory trees keyed off a per-title slug; all of that
coupling is intentionally removed here. There is no portable legacy batch
CLI worth preserving for this tool; the only faithful thing carried over is
the encode behavior.

Faithful encode behavior (preserved verbatim from the backend):
    Image.open(src).convert("RGBA").save(dst, "WEBP", quality=<q>, method=<m>)
  with backend defaults quality=90, method=6, plus skip-if-WebP-newer-than-PNG
  unless --overwrite.

Why a dedicated encoder (vs running to-final.py):
  to-final.py runs a "last-gate" inline unspill before WebP encode that
  blindly clamps G := max(R,B) on every alpha>0 pixel. That re-applies the
  exact over-correction the MODNet hybrid was designed to avoid (it would
  destroy dark olive / dark green fabric color). Hybrid output's RGB is
  already cleaned by edge_decontaminate, so we skip the extra inline unspill
  — do NOT re-apply G := max(R,B) here.

Migrated 2026-05-16 from the lunaverse-backend generate-upscale-matting
helper. Backend path-walking / per-title-slug / batch logic removed entirely.

Usage (JSON entry, preferred):
  python3 hybrid-to-webp.py --input fixtures/hybrid-to-webp-mock.json
  cat fixtures/hybrid-to-webp-mock.json | python3 hybrid-to-webp.py --input -

Usage (explicit single-file CLI, back-compat):
  python3 hybrid-to-webp.py --input in.png --output out.webp [--quality 90]
                            [--method 6] [--overwrite]
"""
from __future__ import annotations

import argparse
import pathlib
import sys


# ---------------------------------------------------------------------------
# Default encoding parameters (faithfully preserved from the original backend).
# ---------------------------------------------------------------------------
DEFAULT_QUALITY = 90
DEFAULT_METHOD = 6  # WebP encoder method (0=fast, 6=best/slowest)


# ─── Faithful shared encode ──────────────────────────────────────────────────

def _encode_webp(
    src: pathlib.Path,
    dst: pathlib.Path,
    quality: int = DEFAULT_QUALITY,
    method: int = DEFAULT_METHOD,
    overwrite: bool = False,
) -> bool:
    """Faithful PNG→WebP encode shared by both entries (DRY).

    Mirrors the backend's exact per-file behavior:
      - skip if WebP exists and is newer than the source PNG, unless overwrite
      - else Image.open(src).convert("RGBA").save(dst, "WEBP", quality, method)

    Returns True if a file was (re-)encoded, False if it was skipped.
    Raises on any I/O / decode / encode error (no silent fallback).
    """
    from PIL import Image

    if (not overwrite and dst.exists() and src.exists()
            and dst.stat().st_mtime > src.stat().st_mtime):
        return False

    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert("RGBA")
    im.save(dst, "WEBP", quality=quality, method=method)
    return True


# ─── Shared helpers ──────────────────────────────────────────────────────────

def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _write_mock_webp(out_path: pathlib.Path) -> None:
    """Write a tiny valid 1×1 RGBA WebP using Pillow.

    Intentionally differs from tools/matting's stdlib-only placeholder PNG:
    matting's mock must run with no torch AND no Pillow (plain python3), so it
    uses a hand-crafted PNG byte string. This tool's sole runtime dependency IS
    Pillow (no heavy ML stack), so a Pillow-free WebP generator/validator is
    impractical — there is no standard-library WebP encoder. Using Pillow here
    is correct and expected. The mandatory C1 property is preserved: the mock
    test MUST load the produced artifact with Pillow and assert it is a valid
    image (round-trip), not merely that the file exists.
    """
    from PIL import Image
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    img.save(out_path, "WEBP", quality=DEFAULT_QUALITY, method=DEFAULT_METHOD)


# ─── Explicit single-file CLI (back-compat, no backend coupling) ─────────────

def main() -> int:
    """Explicit single-file CLI — one input PNG → one output WebP.

    Faithful encode via the shared `_encode_webp` helper. No batch loop, no
    directory walking, no per-title-slug / repo-root path logic (all removed
    in the Phase-13 migration). Trigger by passing both --input and --output
    (without --mock / --json).
    """
    ap = argparse.ArgumentParser(prog="hybrid-to-webp")
    ap.add_argument("--input", required=True, help="source PNG path")
    ap.add_argument("--output", required=True, help="output WebP path")
    ap.add_argument("--quality", type=int, default=DEFAULT_QUALITY)
    ap.add_argument("--method", type=int, default=DEFAULT_METHOD,
                    help="WebP encoder method (0=fast, 6=best/slowest)")
    ap.add_argument("--overwrite", action="store_true",
                    help="re-encode even if WebP exists and is newer than PNG")
    args = ap.parse_args()

    src = pathlib.Path(args.input).expanduser().resolve()
    dst = pathlib.Path(args.output).expanduser().resolve()

    if not src.is_file():
        print(f"ERROR: input is not a file: {src}", file=sys.stderr)
        return 2

    try:
        encoded = _encode_webp(src, dst, args.quality, args.method, args.overwrite)
    except Exception as e:  # noqa: BLE001 — surface any decode/encode failure
        print(f"✗ {dst}: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
        return 1

    if encoded:
        print(f"✓ {dst}: {dst.stat().st_size // 1024} KB")
    else:
        print(f"· {dst}: skipped (newer than source; use --overwrite)")
    return 0


# ─── JSON entry (Phase 13 atomic-tool pattern) ───────────────────────────────

def _run_json_main(argv: list[str] | None = None) -> int:
    """JSON entry — single-file PNG→WebP encode.

    Input shape:
        {
            "input_path":  "/abs/in.png",
            "output_path": "/abs/out.webp",
            "quality":     90    (optional, default 90)
            "method":      6     (optional, default 6)
            "overwrite":   bool  (optional, default false)
            "mock":        bool  (optional)
        }

    Output (stdout):
        {
            "output": {"path": "..."},
            "meta": {
                "quality":     int,
                "method":      int,
                "latency_ms":  int,
                "atomic_tool": "hybrid-to-webp",
                "mock":        bool
            }
        }

    Errors: stderr `{"error":{"code","message"}}` + nonzero exit.
    Exit codes:
        0  success
        2  INVALID_INPUT  (bad/missing input fields, output exists with overwrite=false,
                           unwritable output directory)
        4  ATOMIC_TOOL_FAILED  (Pillow encode error)
        1  INTERNAL  (unexpected exception)
    """
    import argparse as _argparse
    import json as _json
    import time as _time

    ap = _argparse.ArgumentParser(prog="hybrid-to-webp.py", add_help=True)
    ap.add_argument("--input", help="Path to JSON input file. '-' or omitted means stdin.")
    ap.add_argument("--mock", action="store_true",
                    help="Skip real encode; write a 1×1 RGBA WebP at output_path.")
    ap.add_argument("--json", action="store_true", help="Force JSON entry (no-op, for dispatch).")
    args = ap.parse_args(argv)

    if args.input is None or args.input == "-":
        raw = sys.stdin.read()
    else:
        try:
            with open(args.input, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as e:
            _emit_error("INVALID_INPUT", f"cannot read input file: {e}")
            return 2
        except UnicodeDecodeError:
            _emit_error("INVALID_INPUT", "input file is not valid UTF-8 JSON")
            return 2

    try:
        payload = _json.loads(raw)
    except _json.JSONDecodeError as e:
        _emit_error("INVALID_INPUT", f"input is not valid JSON: {e}")
        return 2

    if not isinstance(payload, dict):
        _emit_error("INVALID_INPUT", f"input JSON must be an object, got {type(payload).__name__}")
        return 2

    input_path = payload.get("input_path")
    output_path = payload.get("output_path")
    if not input_path or not output_path:
        _emit_error("INVALID_INPUT", "input.input_path and input.output_path are required")
        return 2
    if not isinstance(input_path, str) or not isinstance(output_path, str):
        _emit_error("INVALID_INPUT", "input_path and output_path must be strings")
        return 2

    try:
        quality = int(payload.get("quality", DEFAULT_QUALITY))
        method = int(payload.get("method", DEFAULT_METHOD))
    except (TypeError, ValueError):
        _emit_error("INVALID_INPUT", "quality and method must be integers")
        return 2
    overwrite = bool(payload.get("overwrite", False))
    mock = args.mock or bool(payload.get("mock", False))

    src = pathlib.Path(input_path).expanduser().resolve()
    dst = pathlib.Path(output_path).expanduser().resolve()

    if not mock and not src.is_file():
        _emit_error("INVALID_INPUT", f"input_path is not a file: {src}")
        return 2
    if dst.exists() and not overwrite:
        _emit_error("INVALID_INPUT", f"output_path already exists (overwrite=false): {dst}")
        return 2

    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        _emit_error("INVALID_INPUT", f"cannot create output directory {dst.parent}: {e}")
        return 2

    started = _time.monotonic()

    if mock:
        _write_mock_webp(dst)
    else:
        try:
            # overwrite=True: the JSON entry already enforced the
            # output-exists / overwrite policy above; the encode itself
            # should not re-skip on the mtime check.
            _encode_webp(src, dst, quality, method, overwrite=True)
        except Exception as e:  # noqa: BLE001 — atomic tool boundary
            _emit_error("ATOMIC_TOOL_FAILED", f"{type(e).__name__}: {e}")
            return 4

    latency_ms = int((_time.monotonic() - started) * 1000)

    print(_json.dumps({
        "output": {"path": str(dst)},
        "meta": {
            "quality": quality,
            "method": method,
            "latency_ms": latency_ms,
            "atomic_tool": "hybrid-to-webp",
            "mock": mock,
        },
    }))
    return 0


def _looks_like_json_entry(argv: list[str]) -> bool:
    """JSON/atomic entry when --mock/--json present, OR --input given without
    an explicit --output (the explicit CLI requires both --input and --output).
    """
    if any(a in ("--mock", "--json") for a in argv):
        return True
    has_input = "--input" in argv
    has_output = "--output" in argv
    return has_input and not has_output


if __name__ == "__main__":
    if _looks_like_json_entry(sys.argv[1:]):
        try:
            sys.exit(_run_json_main())
        except SystemExit:
            raise
        except BaseException as e:  # noqa: BLE001 — last-resort error envelope
            _emit_error("INTERNAL", f"{type(e).__name__}: {e}")
            sys.exit(1)
    sys.exit(main())
