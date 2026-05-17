#!/usr/bin/env python3
"""hole-fill.py -- Inpaint interior body-leak holes in chromakey RGBA images.

After cutout + chromakey, green pixels on the model body create see-through
holes where the alpha was zeroed. This tool detects interior alpha=0 components
(NOT touching the image border) whose size falls in [min_size, max_size) and
inpaints them using cv2 TELEA.

Algorithm (faithful port of moonshort-backend/generate-upscale-matting/hole_fill.py):
  1. Load RGBA PNG.
  2. Build binary mask: alpha==0 AND interior (not border-connected) AND
     size in [min_size, max_size).
  3. Optionally dilate the mask 1-2 px (avoids hairline dark-green-bounce
     pixels around the hole edge).
  4. Inpaint RGB via cv2.inpaint(TELEA, inpaintRadius=3) over BGR view.
  5. Set alpha to 255 over the inpainted region.

Size band logic (tuned for 1882x3344 delivery resolution):
  size <  min_size (default 200) : noise, ignore
  min_size <= size < max_size (8000) : real body leak -- TELEA inpaint to fill
  size >= max_size (8000) : legitimate negative space -- keep transparent

Idempotent: re-running on a hole-free RGBA is a no-op.

HEAVY-IMPORT RULE: cv2, scipy/ndimage, and numpy are imported LAZILY inside
the algorithm helper function, NOT at module top. Combined with
`from __future__ import annotations`, the module imports and `--mock` runs
with NO cv2/scipy/numpy installed.

Migrated 2026-05-16 from moonshort-backend/generate-upscale-matting/hole_fill.py.
Backend batch (--paths, comma-split, in-place mutation) removed entirely; atomic
tool operates on a single explicit input_path -> output_path pair.

Usage (JSON entry, preferred):
  python3 hole-fill.py --input fixtures/hole-fill-mock.json
  cat fixtures/hole-fill-mock.json | python3 hole-fill.py --input -

Usage (explicit single-file CLI, back-compat):
  python3 hole-fill.py --input in.png --output out.png \\
    [--dilate N] [--min-size N] [--max-size N] [--overwrite]
"""
from __future__ import annotations

import argparse
import pathlib
import sys


# ---------------------------------------------------------------------------
# Default parameters (faithfully preserved from the original backend).
# Thresholds tuned for 1882x3344 (post-upscale delivery resolution).
# ---------------------------------------------------------------------------
DEFAULT_DILATE = 2
DEFAULT_MIN_SIZE = 200
DEFAULT_MAX_SIZE = 8000


# ---- Faithful shared algorithm core ----------------------------------------

def _fill_holes(
    src: pathlib.Path,
    dst: pathlib.Path,
    dilate: int = DEFAULT_DILATE,
    min_size: int = DEFAULT_MIN_SIZE,
    max_size: int = DEFAULT_MAX_SIZE,
    overwrite: bool = False,
) -> None:
    """Inpaint interior body-leak holes in a chromakey RGBA PNG.

    Faithful port of the backend per-file algorithm (hole_fill.py fill_one()
    + find_interior_hole_mask()):
      - Loads src as RGBA (PIL open + convert)
      - Computes interior alpha=0 components via scipy.ndimage.label
      - Skips border-touching components (legitimate transparent BG)
      - Skips components < min_size (noise) and >= max_size (legitimate negspace)
      - Optionally dilates the inpaint mask by dilate pixels (cv2 MORPH_ELLIPSE
        kernel; clips back inside the character region to avoid growing into BG)
      - Inpaints BGR view via cv2.inpaint(TELEA, inpaintRadius=3)
      - Composites: where mask>0 -> filled RGB + alpha=255; else keep original
      - Saves dst as PNG

    cv2, scipy.ndimage, and numpy are imported LAZILY (inside this function)
    so the module and --mock mode run with NO heavy stack installed.

    Raises FileExistsError if dst exists and overwrite=False.
    Raises on any I/O / decode / encode error (no silent fallback).
    Creates dst parent dir if needed.
    """
    import cv2  # noqa: PLC0415 -- lazy import (heavy dep)
    import numpy as np  # noqa: PLC0415 -- lazy import
    from PIL import Image  # noqa: PLC0415 -- lazy import
    from scipy import ndimage  # noqa: PLC0415 -- lazy import

    if dst.exists() and not overwrite:
        raise FileExistsError(f"output_path already exists (overwrite=false): {dst}")

    dst.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(src) as im:
        if im.mode != "RGBA":
            im = im.convert("RGBA")
        arr = np.asarray(im).copy()

    a = arr[..., 3]

    # --- Find interior hole mask (faithful port of find_interior_hole_mask) ---
    transparent = a == 0
    labels, n = ndimage.label(transparent)

    if n == 0:
        # No transparent components -> save unchanged
        Image.fromarray(arr, "RGBA").save(dst, "PNG")
        return

    # Border-touching components = legitimate transparent BG; leave them.
    border_labels: set[int] = set()
    for edge in (labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]):
        border_labels.update(int(x) for x in np.unique(edge) if x != 0)

    sizes = ndimage.sum_labels(transparent, labels, range(1, n + 1))
    keep = np.zeros_like(a, dtype=bool)
    for label_id in range(1, n + 1):
        if label_id in border_labels:
            continue
        sz = int(sizes[label_id - 1])
        if sz < min_size:
            continue
        if sz >= max_size:
            # Legitimate negative space (akimbo triangle, between-legs gap).
            # Keep transparent -- do NOT add to inpaint mask.
            continue
        keep |= labels == label_id

    mask = keep.astype(np.uint8) * 255

    # --- Optional dilation (faithful to backend) ---
    if dilate > 0 and mask.any():
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (2 * dilate + 1, 2 * dilate + 1)
        )
        mask = cv2.dilate(mask, kernel, iterations=1)
        # Clip dilation back inside the character region (don't grow into legit BG).
        not_bg = (a > 0) | keep
        mask = mask * not_bg.astype(np.uint8)

    hole_pixels = int((mask > 0).sum())
    if hole_pixels == 0:
        # Nothing to inpaint -> save unchanged
        Image.fromarray(arr, "RGBA").save(dst, "PNG")
        return

    # --- Inpaint RGB via cv2 TELEA (faithful to backend fill_one) ---
    bgr = cv2.cvtColor(arr[..., :3], cv2.COLOR_RGB2BGR)
    # inpaintRadius=3 px is the backend's chosen value (sweet spot comment preserved).
    bgr_filled = cv2.inpaint(bgr, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    rgb_filled = cv2.cvtColor(bgr_filled, cv2.COLOR_BGR2RGB)

    # --- Compose: where mask>0 -> use filled RGB and alpha=255 ---
    new_alpha = np.where(mask > 0, 255, a).astype(np.uint8)
    new_rgb = np.where(mask[..., None] > 0, rgb_filled, arr[..., :3])
    out = np.dstack([new_rgb, new_alpha]).astype(np.uint8)

    Image.fromarray(out, "RGBA").save(dst, "PNG")


# ---- Shared helpers ---------------------------------------------------------

def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _write_placeholder_rgba_png(out_path: pathlib.Path) -> None:
    """Write a tiny deterministic valid 1x1 fully-transparent RGBA PNG.

    Stdlib-only (struct + zlib) -- no numpy, Pillow, cv2, or scipy needed.
    Copied from tools/rgb-unspill and tools/green-spill-clear.
    Used by mock mode (output extension .png only).
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

    Faithful per-file algorithm via the shared _fill_holes helper.
    No batch loop, no directory walking, no --paths/--root/--workers/--dry-run.
    Trigger by passing both --input and --output (without --mock / --json).
    """
    ap = argparse.ArgumentParser(prog="hole-fill")
    ap.add_argument("--input", required=True, help="source RGBA PNG path")
    ap.add_argument("--output", required=True, help="output PNG path")
    ap.add_argument("--dilate", type=int, default=DEFAULT_DILATE,
                    help="dilation radius in pixels (0 disables dilation)")
    ap.add_argument("--min-size", type=int, default=DEFAULT_MIN_SIZE,
                    help="ignore interior alpha=0 components smaller than this (noise floor)")
    ap.add_argument("--max-size", type=int, default=DEFAULT_MAX_SIZE,
                    help=(
                        "preserve interior alpha=0 components >= this size as legitimate "
                        "negative space (akimbo triangle, between-legs gap, etc.)"
                    ))
    ap.add_argument("--overwrite", action="store_true",
                    help="overwrite output if it already exists")
    args = ap.parse_args()

    src = pathlib.Path(args.input).expanduser().resolve()
    dst = pathlib.Path(args.output).expanduser().resolve()

    if not src.is_file():
        print(f"ERROR: input is not a file: {src}", file=sys.stderr)
        return 2

    try:
        _fill_holes(src, dst, args.dilate, args.min_size, args.max_size, args.overwrite)
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
    """JSON entry -- single-image hole-fill.

    Input shape:
        {
            "input_path":  "/abs/in.png",         required
            "output_path": "/abs/out.png",         required (PNG)
            "dilate":      2      (optional, default 2)
            "min_size":    200    (optional, default 200)
            "max_size":    8000   (optional, default 8000)
            "overwrite":   bool   (optional, default false)
            "mock":        bool   (optional)
        }

    Output (stdout):
        {
            "output": {"path": "..."},
            "meta": {
                "dilate":      int,
                "min_size":    int,
                "max_size":    int,
                "latency_ms":  int,
                "atomic_tool": "hole-fill",
                "mock":        bool
            }
        }

    Errors: stderr {"error":{"code","message"}} + nonzero exit.
    Exit codes:
        0  success
        2  INVALID_INPUT  (bad/missing input fields, non-integer numeric params,
                           output exists with overwrite=false, unwritable output dir)
        4  ATOMIC_TOOL_FAILED  (cv2/scipy/Pillow processing error)
        1  INTERNAL  (unexpected exception)
    """
    import argparse as _argparse
    import json as _json
    import time as _time

    ap = _argparse.ArgumentParser(prog="hole-fill.py", add_help=True)
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

    # HAZARD 2: guard numeric coercion -> INVALID_INPUT/exit 2 (not INTERNAL/exit 1)
    try:
        dilate = int(payload.get("dilate", DEFAULT_DILATE))
        min_size = int(payload.get("min_size", DEFAULT_MIN_SIZE))
        max_size = int(payload.get("max_size", DEFAULT_MAX_SIZE))
    except (TypeError, ValueError):
        _emit_error("INVALID_INPUT", "dilate, min_size and max_size must be integers")
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
        # Mock bypasses reading the real input (works with a nonexistent input_path).
        # Output is always PNG for this tool; stdlib struct+zlib (no deps).
        _write_placeholder_rgba_png(dst)
    else:
        try:
            # overwrite=True: policy already enforced above by the JSON entry.
            _fill_holes(src, dst, dilate, min_size, max_size, overwrite=True)
        except Exception as e:  # noqa: BLE001 -- atomic tool boundary
            _emit_error("ATOMIC_TOOL_FAILED", f"{type(e).__name__}: {e}")
            return 4

    latency_ms = int((_time.monotonic() - started) * 1000)

    print(_json.dumps({
        "output": {"path": str(dst)},
        "meta": {
            "dilate": dilate,
            "min_size": min_size,
            "max_size": max_size,
            "latency_ms": latency_ms,
            "atomic_tool": "hole-fill",
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
