#!/usr/bin/env python3
"""rgb-unspill.py -- Nuke-style G-channel decontamination (RGB unspill) on RGBA images.

After cutout + green_spill_clear, edge-band pixels (alpha < 255 from feather
gaussian blur) and some interior bounce-light pixels still hold green-polluted
RGB.  Their alpha was kept correctly, but their RGB was never decontaminated,
so when composited onto a non-green background the edge looks green.

Fix (industry-standard chromakey unspill): for every alpha > 0 pixel where
G > max(R, B), clamp G to max(R, B).  Only the G channel changes; alpha is
untouched, so the silhouette is identical.  Idempotent (re-running on a clean
file does nothing because no pixel will have G > max(R, B)).

This complements green_spill_clear.py -- that one ZEROS alpha for opaque
green-leaning pixels brighter than bright_sum (designed to keep dark green
clothing).  rgb_unspill never zeroes alpha and never changes the silhouette;
it only desaturates the green tint.  Safe on green clothing (those pixels stay
green, just less so).

Behavior (faithful per-file port of backend rgb_unspill.py unspill_one()):
the source is read and coerced to RGBA, then on every pixel with alpha > 0
where G exceeds both R and B the G channel is clamped down to max(R, B).
Alpha and R/B are never modified, so the silhouette is unchanged. Output
format follows the dst extension: `.png` -> PNG, `.webp` -> WebP q90 m4.

Migrated 2026-05-16 from lunaverse-backend/generate-upscale-matting/rgb_unspill.py.
Backend batch (--root, --paths, --workers, --dry-run, ThreadPoolExecutor,
directory walk, REPO_ROOT) removed entirely; atomic tool operates on a single
explicit input_path -> output_path pair.

Usage (JSON entry, preferred):
  python3 rgb-unspill.py --input fixtures/rgb-unspill-mock.json
  cat fixtures/rgb-unspill-mock.json | python3 rgb-unspill.py --input -

Usage (explicit single-file CLI, back-compat):
  python3 rgb-unspill.py --input in.png --output out.png [--overwrite]
"""
from __future__ import annotations

import argparse
import pathlib
import sys

# ---------------------------------------------------------------------------
# Supported output formats (resolved from output_path extension).
# ---------------------------------------------------------------------------
_SUPPORTED_EXTENSIONS = {".png", ".webp"}


# ---- Faithful shared algorithm core ----------------------------------------

def _unspill(
    src: pathlib.Path,
    dst: pathlib.Path,
    overwrite: bool = False,
) -> None:
    """Apply Nuke-style G-channel RGB unspill: for every alpha>0 pixel where
    G > max(R, B), clamp G to max(R, B).

    Faithful per-file port of backend unspill_one() algorithm:
      - Reads src as RGBA (PIL already opens RGBA webp/png natively)
      - Computes mask = (alpha > 0) & (G > max(R, B))
      - Sets G to max(R, B) for every masked pixel (.astype(int) preserved
        for the arithmetic; .astype(np.uint8) for the write-back, matching
        the backend exactly)
      - Saves dst with format resolved from dst.suffix:
          .webp -> WEBP quality=90 method=4  (backend save kwargs preserved)
          .png  -> PNG
      - Does NOT skip non-RGBA images: if src is not RGBA we raise
        (atomic contract; backend's skip_not_rgba is a batch concern, not
        an algorithm concern)

    Raises FileExistsError if dst exists and overwrite=False.
    Raises ValueError for unsupported output extension (caller maps to
    INVALID_INPUT exit 2).
    Creates dst parent dir if needed.
    """
    import numpy as np
    from PIL import Image

    suffix = dst.suffix.lower()
    if suffix not in _SUPPORTED_EXTENSIONS:
        raise ValueError(f"unsupported output extension: {suffix!r} (must be .png or .webp)")

    if dst.exists() and not overwrite:
        raise FileExistsError(f"output_path already exists (overwrite=false): {dst}")

    dst.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(src) as im:
        arr = np.array(im.convert("RGBA")).copy()

    a = arr[..., 3]
    r = arr[..., 0].astype(int)
    g = arr[..., 1].astype(int)
    b = arr[..., 2].astype(int)
    max_rb = np.maximum(r, b)
    mask = (a > 0) & (g > max_rb)
    # Write-back: .astype(np.uint8) matches backend exactly (round-trip safe).
    arr[..., 1][mask] = max_rb[mask].astype(np.uint8)

    out_img = Image.fromarray(arr, "RGBA")
    if suffix == ".webp":
        # Backend save kwargs preserved verbatim (quality=90, method=4).
        out_img.save(dst, "WEBP", quality=90, method=4)
    else:
        out_img.save(dst, "PNG")


# ---- Shared helpers ---------------------------------------------------------

def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _write_placeholder_rgba_png(out_path: pathlib.Path) -> None:
    """Write a tiny deterministic valid 1x1 fully-transparent RGBA PNG.

    Stdlib-only (struct + zlib) -- no numpy or Pillow needed.
    Copied from tools/matting and tools/green-spill-clear (_write_placeholder_rgba_png).
    Used by mock mode when output extension is .png.
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


def _write_placeholder_rgba_webp(out_path: pathlib.Path) -> None:
    """Write a tiny valid 1x1 RGBA placeholder WebP using Pillow.

    Stdlib has no WebP encoder so Pillow is required here.
    Precedent: tools/hybrid-to-webp uses the same approach for its WebP mock.
    """
    from PIL import Image
    img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    # Lossless 1x1 to keep it deterministic and minimal.
    img.save(out_path, "WEBP", lossless=True)


# ---- Explicit single-file CLI (back-compat, no backend coupling) ------------

def main() -> int:
    """Explicit single-file CLI -- one input -> one output.

    Faithful per-file algorithm via the shared _unspill helper.
    No batch loop, no directory walking, no --root/--paths/--workers/--dry-run.
    Trigger by passing both --input and --output (without --mock / --json).
    """
    ap = argparse.ArgumentParser(prog="rgb-unspill")
    ap.add_argument("--input", required=True, help="source RGBA PNG or WEBP path")
    ap.add_argument("--output", required=True, help="output path (.png or .webp)")
    ap.add_argument("--overwrite", action="store_true",
                    help="overwrite output if it already exists")
    args = ap.parse_args()

    src = pathlib.Path(args.input).expanduser().resolve()
    dst = pathlib.Path(args.output).expanduser().resolve()

    if not src.is_file():
        print(f"ERROR: input is not a file: {src}", file=sys.stderr)
        return 2

    suffix = dst.suffix.lower()
    if suffix not in _SUPPORTED_EXTENSIONS:
        print(f"ERROR: unsupported output extension: {suffix!r} (must be .png or .webp)",
              file=sys.stderr)
        return 2

    try:
        _unspill(src, dst, args.overwrite)
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
    """JSON entry -- single-image RGB unspill.

    Input shape:
        {
            "input_path":  "/abs/in.png",         required
            "output_path": "/abs/out.png",         required (.png or .webp)
            "overwrite":   bool                    (optional, default false)
            "mock":        bool                    (optional)
        }

    Note: this algorithm has NO tunable numeric parameters (no delta, no
    bright_sum equivalents).  The unspill condition (G > max(R,B) for alpha>0
    pixels) uses no external thresholds -- Hazard 2 is N/A.

    Output (stdout):
        {
            "output": {"path": "..."},
            "meta": {
                "format":      "png" | "webp",
                "latency_ms":  int,
                "atomic_tool": "rgb-unspill",
                "mock":        bool
            }
        }

    Errors: stderr {"error":{"code","message"}} + nonzero exit.
    Exit codes:
        0  success
        2  INVALID_INPUT  (bad/missing input fields, unsupported output
                           extension, output exists with overwrite=false,
                           unwritable output directory)
        4  ATOMIC_TOOL_FAILED  (numpy/Pillow processing error)
        1  INTERNAL  (unexpected exception)
    """
    import argparse as _argparse
    import json as _json
    import time as _time

    ap = _argparse.ArgumentParser(prog="rgb-unspill.py", add_help=True)
    ap.add_argument("--input", help="Path to JSON input file. '-' or omitted means stdin.")
    ap.add_argument("--mock", action="store_true",
                    help="Skip real processing; write a 1x1 RGBA placeholder at output_path.")
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

    # Note: rgb-unspill has NO numeric payload parameters (the algorithm uses
    # no external thresholds).  Hazard 2 (numeric coercion guard) is N/A.

    overwrite = bool(payload.get("overwrite", False))
    mock = args.mock or bool(payload.get("mock", False))

    src = pathlib.Path(input_path).expanduser().resolve()
    dst = pathlib.Path(output_path).expanduser().resolve()

    # Validate output extension early (before any I/O).
    suffix = dst.suffix.lower()
    if suffix not in _SUPPORTED_EXTENSIONS:
        _emit_error("INVALID_INPUT",
                    f"unsupported output extension: {suffix!r} (must be .png or .webp)")
        return 2

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
    fmt = suffix.lstrip(".")  # "png" or "webp"

    if mock:
        # Mock bypasses reading the real input (works with a nonexistent input_path).
        # .png -> stdlib struct+zlib (no deps); .webp -> Pillow (no stdlib WebP encoder).
        if suffix == ".png":
            _write_placeholder_rgba_png(dst)
        else:
            # .webp: Pillow required (same pattern as tools/hybrid-to-webp mock).
            _write_placeholder_rgba_webp(dst)
    else:
        try:
            # overwrite=True: policy already enforced above by the JSON entry.
            _unspill(src, dst, overwrite=True)
        except Exception as e:  # noqa: BLE001 -- atomic tool boundary
            _emit_error("ATOMIC_TOOL_FAILED", f"{type(e).__name__}: {e}")
            return 4

    latency_ms = int((_time.monotonic() - started) * 1000)

    print(_json.dumps({
        "output": {"path": str(dst)},
        "meta": {
            "format": fmt,
            "latency_ms": latency_ms,
            "atomic_tool": "rgb-unspill",
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
