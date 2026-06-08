#!/usr/bin/env python3
"""cutout.py -- HSV chromakey green-screen removal producing an RGBA cutout.

Converts a flat-green-background character / sprite PNG to a transparent RGBA
PNG via:
  1. HSV thresholding on the green region            -> binary green mask
  2. Optional gaussian feather on the alpha edge     -> soft 1-2 px boundary

Why chromakey instead of an ML matting model (rembg / BiRefNet / RMBG):
HSV keying on a flat known background is faster, deterministic, has no model
dependency, and gives sharper edges than U2Net-class segmentation. Reference:
https://www.philschmid.de/generate-stickers (Google DevRel sticker pipeline).

RGBA-aware: when the input is already RGBA, the new alpha is min(new, old),
so re-running on a previously-cut PNG never resurrects the green screen even
if the hue/sat thresholds change.

Faithful per-file algorithm ported from the backend chromakey_rgba():
  - rgb = img.convert("RGB"); hsv = rgb.convert("HSV")
  - PIL HSV is H,S,V each [0,255]; H remapped to degrees [0,360)
  - green = (h_deg >= hue_low) & (h_deg <= hue_high)
            & (s >= sat_min) & (v >= val_min)
  - alpha = np.where(green, 0, 255).astype(np.uint8)
  - if input was RGBA: alpha = np.minimum(alpha, old_alpha)
  - if feather > 0: alpha = GaussianBlur(radius=feather) on the L-mode alpha
  - rgba = np.dstack([arr_rgb, alpha]) -> RGBA PNG

HSV thresholds (backend defaults, tuned for #00FF00 with model rendering drift):
  hue_low  default 80.0   (degrees -- true-green window, away from yellow/cyan)
  hue_high default 160.0  (degrees)
  sat_min  default 0.30   (0..1 -- excludes desaturated character edges)
  val_min  default 0.25   (0..1 -- excludes dark green shadow on character)
  feather  default 0.8    (gaussian blur radius in px; 0 disables)

All five are FLOAT in the backend (PIL HSV remapped to degrees [0,360) and
sat/val normalised to [0,1]; feather is a float blur radius). They are ported
faithfully as floats. They were `CHROMAKEY_*` deployment env vars in the
backend; here they are explicit JSON params -- the atomic contract is explicit
input, NOT environment-derived config (same normalisation principle as
tools/matting's env->explicit migration). os.environ is NOT read.

HEAVY-IMPORT RULE: numpy and Pillow are imported LAZILY inside the algorithm
helper function, NOT at module top. Combined with
`from __future__ import annotations`, the module imports and `--mock` runs with
NO numpy/Pillow installed (mock writes a stdlib-only 1x1 RGBA PNG). The backend
cutout.py uses NO cv2/OpenCV -- numpy + Pillow only.

Migrated 2026-05-17 from lunaverse-backend/generate-upscale-matting/cutout.py.
Backend batch (--root book-slug tree walk, --only ids, --workers pool,
--force, --backup-to, ThreadPoolExecutor, REPO_ROOT) removed entirely; atomic
tool operates on a single explicit input_path -> output_path pair.

Usage (JSON entry, preferred):
  python3 cutout.py --input fixtures/cutout-mock.json
  cat fixtures/cutout-mock.json | python3 cutout.py --input -

Usage (explicit single-file CLI, back-compat):
  python3 cutout.py --input in.png --output out.png \\
    [--hue-low N] [--hue-high N] [--sat-min N] [--val-min N] [--feather N] \\
    [--overwrite]
"""
from __future__ import annotations

import argparse
import pathlib
import sys


# ---------------------------------------------------------------------------
# Default parameters (faithfully preserved from the original backend).
# Backend read these from CHROMAKEY_* env vars with these float defaults;
# the atomic tool takes them as explicit JSON/CLI params with the SAME values.
# Tuned for #00FF00 with model rendering drift.
# ---------------------------------------------------------------------------
DEFAULT_HUE_LOW: float = 80.0
DEFAULT_HUE_HIGH: float = 160.0
DEFAULT_SAT_MIN: float = 0.30
DEFAULT_VAL_MIN: float = 0.25
DEFAULT_FEATHER: float = 0.8


# ---- Faithful shared algorithm core ----------------------------------------

def _cutout(
    src: pathlib.Path,
    dst: pathlib.Path,
    hue_low: float = DEFAULT_HUE_LOW,
    hue_high: float = DEFAULT_HUE_HIGH,
    sat_min: float = DEFAULT_SAT_MIN,
    val_min: float = DEFAULT_VAL_MIN,
    feather: float = DEFAULT_FEATHER,
    overwrite: bool = False,
) -> None:
    """Apply HSV chromakey: green pixels -> alpha 0, otherwise opaque.

    Faithful per-file port of the backend chromakey_rgba() algorithm:
      - Opens src; if mode == "RGBA", captures the old alpha channel (uint8)
      - rgb = img.convert("RGB"); hsv = rgb.convert("HSV")
      - h_deg = hsv[...,0] * (360/255); s = hsv[...,1]/255; v = hsv[...,2]/255
        (float32, exactly as the backend)
      - green = (h_deg >= hue_low) & (h_deg <= hue_high)
                & (s >= sat_min) & (v >= val_min)
      - alpha = np.where(green, 0, 255).astype(np.uint8)
      - if input was RGBA: alpha = np.minimum(alpha, old_alpha)
        (re-running on a previously-cut PNG cannot resurrect the green screen)
      - if feather > 0: alpha = GaussianBlur(radius=feather) over the L-mode
        alpha image (np.asarray back to uint8)
      - rgba = np.dstack([arr_rgb, alpha]); save dst as PNG

    numpy and Pillow are imported LAZILY (inside this function) so the module
    and --mock mode run with NO heavy stack installed. The backend uses NO
    cv2/OpenCV; this is numpy + Pillow only.

    Raises FileExistsError if dst exists and overwrite=False.
    Raises on any I/O / decode / encode error (no silent fallback).
    Creates dst parent dir if needed.
    """
    import numpy as np  # noqa: PLC0415 -- lazy import (heavy dep)
    from PIL import Image, ImageFilter  # noqa: PLC0415 -- lazy import

    if dst.exists() and not overwrite:
        raise FileExistsError(f"output_path already exists (overwrite=false): {dst}")

    dst.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(src) as img:
        has_old_alpha = img.mode == "RGBA"
        old_alpha: "np.ndarray | None" = None
        if has_old_alpha:
            old_alpha = np.asarray(img.getchannel("A"), dtype=np.uint8)

        rgb = img.convert("RGB")
        hsv = rgb.convert("HSV")
        arr_rgb = np.asarray(rgb)
        arr_hsv = np.asarray(hsv)

    # PIL HSV: H, S, V each [0, 255]; remap H to degrees [0, 360).
    h_deg = arr_hsv[..., 0].astype(np.float32) * (360.0 / 255.0)
    s = arr_hsv[..., 1].astype(np.float32) / 255.0
    v = arr_hsv[..., 2].astype(np.float32) / 255.0

    green = (
        (h_deg >= hue_low) & (h_deg <= hue_high) & (s >= sat_min) & (v >= val_min)
    )
    alpha = np.where(green, 0, 255).astype(np.uint8)

    if has_old_alpha and old_alpha is not None:
        alpha = np.minimum(alpha, old_alpha)

    if feather > 0:
        alpha_img = Image.fromarray(alpha, "L").filter(
            ImageFilter.GaussianBlur(radius=feather)
        )
        alpha = np.asarray(alpha_img)

    rgba = np.dstack([arr_rgb, alpha])
    Image.fromarray(rgba, "RGBA").save(dst, "PNG")


# ---- Shared helpers ---------------------------------------------------------

def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _write_placeholder_rgba_png(out_path: pathlib.Path) -> None:
    """Write a tiny deterministic valid 1x1 fully-transparent RGBA PNG.

    Stdlib-only (struct + zlib) -- no numpy or Pillow needed.
    Copied from tools/hole-fill / tools/rgb-unspill / tools/green-spill-clear.
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

    Faithful per-file algorithm via the shared _cutout helper.
    No batch loop, no directory walking, no
    --root/--only/--workers/--force/--backup-to.
    Trigger by passing both --input and --output (without --mock / --json).
    """
    ap = argparse.ArgumentParser(prog="cutout")
    ap.add_argument("--input", required=True, help="source PNG path (RGB or RGBA)")
    ap.add_argument("--output", required=True, help="output RGBA PNG path")
    ap.add_argument("--hue-low", type=float, default=DEFAULT_HUE_LOW,
                    help="green-mask hue lower bound in degrees (default 80.0)")
    ap.add_argument("--hue-high", type=float, default=DEFAULT_HUE_HIGH,
                    help="green-mask hue upper bound in degrees (default 160.0)")
    ap.add_argument("--sat-min", type=float, default=DEFAULT_SAT_MIN,
                    help="green-mask minimum saturation 0..1 (default 0.30)")
    ap.add_argument("--val-min", type=float, default=DEFAULT_VAL_MIN,
                    help="green-mask minimum value 0..1 (default 0.25)")
    ap.add_argument("--feather", type=float, default=DEFAULT_FEATHER,
                    help="gaussian blur radius in px on the alpha edge; 0 disables (default 0.8)")
    ap.add_argument("--overwrite", action="store_true",
                    help="overwrite output if it already exists")
    args = ap.parse_args()

    src = pathlib.Path(args.input).expanduser().resolve()
    dst = pathlib.Path(args.output).expanduser().resolve()

    if not src.is_file():
        print(f"ERROR: input is not a file: {src}", file=sys.stderr)
        return 2

    try:
        _cutout(
            src, dst,
            args.hue_low, args.hue_high, args.sat_min, args.val_min,
            args.feather, args.overwrite,
        )
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
    """JSON entry -- single-image HSV chromakey cutout.

    Input shape:
        {
            "input_path":  "/abs/in.png",          required
            "output_path": "/abs/out.png",          required (PNG, RGBA)
            "hue_low":     80.0    (optional, default 80.0,  degrees)
            "hue_high":    160.0   (optional, default 160.0, degrees)
            "sat_min":     0.30    (optional, default 0.30,  0..1)
            "val_min":     0.25    (optional, default 0.25,  0..1)
            "feather":     0.8     (optional, default 0.8,   px blur radius)
            "overwrite":   bool    (optional, default false)
            "mock":        bool    (optional)
        }

    The five HSV params were CHROMAKEY_* env vars in the backend; here they
    are explicit JSON fields (os.environ is NOT consulted) -- same env->explicit
    normalisation as tools/matting.

    Output (stdout):
        {
            "output": {"path": "..."},
            "meta": {
                "hue_low":     float,
                "hue_high":    float,
                "sat_min":     float,
                "val_min":     float,
                "feather":     float,
                "latency_ms":  int,
                "atomic_tool": "cutout",
                "mock":        bool
            }
        }

    Errors: stderr {"error":{"code","message"}} + nonzero exit.
    Exit codes:
        0  success
        2  INVALID_INPUT  (bad/missing input fields, non-numeric HSV params,
                           output exists with overwrite=false, unwritable
                           output dir)
        4  ATOMIC_TOOL_FAILED  (numpy/Pillow processing error)
        1  INTERNAL  (unexpected exception)
    """
    import argparse as _argparse
    import json as _json
    import time as _time

    ap = _argparse.ArgumentParser(prog="cutout.py", add_help=True)
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

    # HAZARD 2: guard numeric coercion -> INVALID_INPUT/exit 2 (not INTERNAL/1).
    # All five are FLOAT in the backend (hue in degrees, sat/val in 0..1,
    # feather a float blur radius).
    try:
        hue_low = float(payload.get("hue_low", DEFAULT_HUE_LOW))
        hue_high = float(payload.get("hue_high", DEFAULT_HUE_HIGH))
        sat_min = float(payload.get("sat_min", DEFAULT_SAT_MIN))
        val_min = float(payload.get("val_min", DEFAULT_VAL_MIN))
        feather = float(payload.get("feather", DEFAULT_FEATHER))
    except (TypeError, ValueError):
        _emit_error(
            "INVALID_INPUT",
            "hue_low, hue_high, sat_min, val_min, feather must be numbers",
        )
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
            _cutout(
                src, dst,
                hue_low, hue_high, sat_min, val_min, feather,
                overwrite=True,
            )
        except Exception as e:  # noqa: BLE001 -- atomic tool boundary
            _emit_error("ATOMIC_TOOL_FAILED", f"{type(e).__name__}: {e}")
            return 4

    latency_ms = int((_time.monotonic() - started) * 1000)

    print(_json.dumps({
        "output": {"path": str(dst)},
        "meta": {
            "hue_low": hue_low,
            "hue_high": hue_high,
            "sat_min": sat_min,
            "val_min": val_min,
            "feather": feather,
            "latency_ms": latency_ms,
            "atomic_tool": "cutout",
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
