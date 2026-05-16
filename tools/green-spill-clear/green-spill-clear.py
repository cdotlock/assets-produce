#!/usr/bin/env python3
"""green-spill-clear.py -- clear chromakey green-spill leak pixels from RGBA PNGs.

Atomic tool: takes ONE explicit input file and writes ONE explicit output
file. The original backend batch script mutated files in-place using a
comma-separated --paths list and a ThreadPoolExecutor. All of that batch
coupling is removed here. The faithful thing carried over is the per-file
algorithm core: detect pixels that are opaque AND green-leaning
(g > r+DELTA, g > b+DELTA, r+g+b >= BRIGHT_SUM) and zero their alpha.

Faithful algorithm (preserved verbatim from the backend clear_one()):
    arr = np.array(Image.open(src).convert("RGBA")).copy()  -- if not RGBA, skip
    leak = (g > r+delta) & (g > b+delta) & (a > 0) & (r+g+b >= bright_sum)
    arr[leak, :] = 0  -- zero all channels of leak pixels
    Image.fromarray(arr, "RGBA").save(dst, "PNG")

Migrated 2026-05-16 from moonshort-backend/generate-upscale-matting/green_spill_clear.py.
Backend batch (--paths, --workers, ThreadPoolExecutor) removed entirely.

Usage (JSON entry, preferred):
  python3 green-spill-clear.py --input fixtures/green-spill-clear-mock.json
  cat fixtures/green-spill-clear-mock.json | python3 green-spill-clear.py --input -

Usage (explicit single-file CLI, back-compat):
  python3 green-spill-clear.py --input in.png --output out.png [--delta 5]
                               [--bright-sum 400] [--overwrite]
"""
from __future__ import annotations

import argparse
import pathlib
import sys


# ---------------------------------------------------------------------------
# Default parameters (faithfully preserved from the original backend).
# ---------------------------------------------------------------------------
DEFAULT_DELTA = 5        # g > r+DELTA and g > b+DELTA to qualify as leak
DEFAULT_BRIGHT_SUM = 400  # min R+G+B sum — excludes dark green clothing


# ---- Faithful shared algorithm core ----------------------------------------

def _clear_green_spill(
    src: pathlib.Path,
    dst: pathlib.Path,
    delta: int = DEFAULT_DELTA,
    bright_sum: int = DEFAULT_BRIGHT_SUM,
    overwrite: bool = False,
) -> None:
    """Clear bright green-leaning pixels (chromakey leak), preserving dark green.

    Faithful port of backend clear_one() per-file algorithm:
      - loads src as RGBA
      - if not RGBA, writes src unchanged to dst (idempotent skip)
      - applies leak mask: g > r+delta AND g > b+delta AND a>0 AND r+g+b>=bright_sum
      - zeroes RGBA of every matching pixel
      - saves result to dst as PNG

    Raises on any I/O / decode / encode error (no silent fallback).
    Creates dst parent dir if needed.
    Raises FileExistsError if dst exists and overwrite=False.
    """
    import numpy as np
    from PIL import Image

    if dst.exists() and not overwrite:
        raise FileExistsError(f"output_path already exists (overwrite=false): {dst}")

    dst.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(src) as im:
        if im.mode != "RGBA":
            # not RGBA: copy src to dst unchanged (idempotent skip like backend)
            im.convert("RGBA").save(dst, "PNG")
            return
        arr = np.array(im).copy()

    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)
    a = arr[:, :, 3]

    leak = (
        (g > r + delta)
        & (g > b + delta)
        & (a > 0)
        & (r + g + b >= bright_sum)  # exclude dark green clothing
    )
    arr[leak, 0] = 0
    arr[leak, 1] = 0
    arr[leak, 2] = 0
    arr[leak, 3] = 0

    Image.fromarray(arr, "RGBA").save(dst, "PNG")


# ---- Shared helpers ---------------------------------------------------------

def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _write_placeholder_rgba_png(out_path: pathlib.Path) -> None:
    """Write a tiny deterministic valid 1x1 fully-transparent RGBA PNG.

    Stdlib-only (struct + zlib) -- no numpy or Pillow needed.
    This is exactly matting's approach, since both tools output PNG.
    """
    import struct, zlib

    def _chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = _chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
    idat = _chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00\x00", 9))
    iend = _chunk(b"IEND", b"")
    out_path.write_bytes(sig + ihdr + idat + iend)


# ---- Explicit single-file CLI (back-compat, no backend coupling) ------------

def main() -> int:
    """Explicit single-file CLI -- one input PNG -> one output PNG.

    Faithful per-file algorithm via the shared _clear_green_spill helper.
    No batch loop, no directory walking, no --paths / --workers / REPO_ROOT.
    Trigger by passing both --input and --output (without --mock / --json).
    """
    ap = argparse.ArgumentParser(prog="green-spill-clear")
    ap.add_argument("--input", required=True, help="source RGBA PNG path")
    ap.add_argument("--output", required=True, help="output PNG path")
    ap.add_argument("--delta", type=int, default=DEFAULT_DELTA,
                    help="greenness threshold: g > r+DELTA and g > b+DELTA")
    ap.add_argument("--bright-sum", type=int, default=DEFAULT_BRIGHT_SUM,
                    help="min R+G+B sum to count as leak; excludes dark green clothing")
    ap.add_argument("--overwrite", action="store_true",
                    help="overwrite output if it already exists")
    args = ap.parse_args()

    src = pathlib.Path(args.input).expanduser().resolve()
    dst = pathlib.Path(args.output).expanduser().resolve()

    if not src.is_file():
        print(f"ERROR: input is not a file: {src}", file=sys.stderr)
        return 2

    try:
        _clear_green_spill(src, dst, args.delta, args.bright_sum, args.overwrite)
    except FileExistsError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    except Exception as e:  # noqa: BLE001 -- surface any decode/encode failure
        print(f"ERROR: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
        return 1

    print(f"done: {dst}")
    return 0


# ---- JSON entry (Phase 13 atomic-tool pattern) ------------------------------

def _run_json_main(argv: list[str] | None = None) -> int:
    """JSON entry -- single-image green-spill clear.

    Input shape:
        {
            "input_path":  "/abs/in.png",
            "output_path": "/abs/out.png",
            "delta":       5     (optional, default 5)
            "bright_sum":  400   (optional, default 400)
            "overwrite":   bool  (optional, default false)
            "mock":        bool  (optional)
        }

    Output (stdout):
        {
            "output": {"path": "..."},
            "meta": {
                "delta":       int,
                "bright_sum":  int,
                "latency_ms":  int,
                "atomic_tool": "green-spill-clear",
                "mock":        bool
            }
        }

    Errors: stderr {"error":{"code","message"}} + nonzero exit.
    Exit codes:
        0  success
        2  INVALID_INPUT  (bad/missing input fields, output exists with overwrite=false,
                           unwritable output directory)
        4  ATOMIC_TOOL_FAILED  (numpy/Pillow processing error)
        1  INTERNAL  (unexpected exception)
    """
    import argparse as _argparse
    import json as _json
    import time as _time

    ap = _argparse.ArgumentParser(prog="green-spill-clear.py", add_help=True)
    ap.add_argument("--input", help="Path to JSON input file. '-' or omitted means stdin.")
    ap.add_argument("--mock", action="store_true",
                    help="Skip real processing; write a 1x1 RGBA placeholder PNG at output_path.")
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

    # HAZARD 2: guard numeric coercion -> INVALID_INPUT/exit 2 (not INTERNAL/exit 1)
    try:
        delta = int(payload.get("delta", DEFAULT_DELTA))
        bright_sum = int(payload.get("bright_sum", DEFAULT_BRIGHT_SUM))
    except (TypeError, ValueError):
        _emit_error("INVALID_INPUT", "delta and bright_sum must be integers")
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
        _write_placeholder_rgba_png(dst)
    else:
        try:
            # overwrite=True: the JSON entry already enforced the
            # output-exists / overwrite policy above; the algorithm itself
            # should not re-check.
            _clear_green_spill(src, dst, delta, bright_sum, overwrite=True)
        except Exception as e:  # noqa: BLE001 -- atomic tool boundary
            _emit_error("ATOMIC_TOOL_FAILED", f"{type(e).__name__}: {e}")
            return 4

    latency_ms = int((_time.monotonic() - started) * 1000)

    print(_json.dumps({
        "output": {"path": str(dst)},
        "meta": {
            "delta": delta,
            "bright_sum": bright_sum,
            "latency_ms": latency_ms,
            "atomic_tool": "green-spill-clear",
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
        except BaseException as e:  # noqa: BLE001 -- last-resort error envelope
            _emit_error("INTERNAL", f"{type(e).__name__}: {e}")
            sys.exit(1)
    sys.exit(main())
