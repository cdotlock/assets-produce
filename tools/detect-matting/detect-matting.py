#!/usr/bin/env python3
"""detect-matting.py -- Inspect RGBA PNG alpha channels for chromakey matting failures.

Reads a single RGBA PNG and flags structural alpha-channel failure modes:
  * interior holes (clothing / body punched through)
  * central body band heavily transparent (dark sleeves chromakeyed away)

Algorithm rationale:
  Naive `binary_fill_holes(alpha >= 240)` over-counts the gap between two
  legs as an internal hole, false-flagging stand-pose sprites. We close
  narrow gaps via `binary_closing` with disk=20 BEFORE filling holes, then
  count only pixels enclosed by the silhouette AFTER closing. disk=20 is
  the empirical sweet spot for 1882x3344 sprites.

This tool is a JUDGEMENT tool: it does NOT produce an image. It emits a
PASS/FAIL JSON report. Accordingly, a FAIL verdict is NOT a tool error --
judging succeeded and exit 0 is returned.

CLI-ONLY: this tool is intentionally NOT registered as an atomic tool and
has no TypeScript shell in agent/packages/opencode/src/tool/asset/. It is
invoked directly from the shell or by operator scripts.

Faithful port of moonshort-backend/generate-upscale-matting/detect_matting_failures.py.
Backend batch (--root, --only, dir-walk, collect_targets) removed entirely;
atomic tool operates on a single explicit input PNG -> single JSON report.

HEAVY-IMPORT RULE: numpy, PIL, and scipy are imported LAZILY inside the
algorithm helper function, NOT at module top. Combined with
`from __future__ import annotations`, the module imports and `--mock` runs
with NO heavy stack installed.

Usage (JSON entry, preferred):
  python3 detect-matting.py --input fixtures/detect-matting-mock.json
  cat fixtures/detect-matting-mock.json | python3 detect-matting.py --input -

Usage (explicit single-file CLI, back-compat):
  python3 detect-matting.py \\
    --input in.png \\
    --output report.json \\
    [--threshold-holes 5.0] \\
    [--threshold-body-gap 400000]
"""
from __future__ import annotations

import argparse
import pathlib
import sys


# ---------------------------------------------------------------------------
# Default parameters (faithfully preserved from the original backend).
# Thresholds tuned for 1882x3344 (post-upscale delivery resolution).
# ---------------------------------------------------------------------------
DEFAULT_THRESHOLD_HOLES_PCT = 5.0
DEFAULT_THRESHOLD_BODY_GAP_PX = 400_000
CLOSING_DISK_RADIUS = 20
BODY_BAND_Y_LO = 0.30
BODY_BAND_Y_HI = 0.95
BODY_BAND_X_LO = 0.30
BODY_BAND_X_HI = 0.70


# ---- Faithful shared algorithm core ----------------------------------------

def _disk_structure(radius: int) -> "np.ndarray":
    """Return a circular boolean structuring element of the given radius."""
    import numpy as np  # noqa: PLC0415 -- lazy import
    yy, xx = np.ogrid[-radius:radius + 1, -radius:radius + 1]
    return (yy * yy + xx * xx <= radius * radius)


def compute_failure_metrics(path: pathlib.Path) -> "dict[str, float]":
    """Compute holes_pct + body_gap_px for a single RGBA PNG.
    Non-RGBA inputs short-circuit to zeros. Empty-solid inputs similarly."""
    import numpy as np  # noqa: PLC0415 -- lazy import
    from PIL import Image  # noqa: PLC0415 -- lazy import
    from scipy import ndimage  # noqa: PLC0415 -- lazy import

    with Image.open(path) as im:
        if im.mode != "RGBA":
            return {"holes_pct": 0.0, "body_gap_px": 0}
        alpha = np.asarray(im.split()[-1])
    H, W = alpha.shape
    solid = alpha >= 240
    solid_count = int(solid.sum())
    if solid_count == 0:
        return {"holes_pct": 0.0, "body_gap_px": int((alpha < 10).sum())}
    structure = _disk_structure(CLOSING_DISK_RADIUS)
    closed = ndimage.binary_closing(solid, structure=structure)
    filled = ndimage.binary_fill_holes(closed)
    holes = int((filled & ~closed).sum())
    holes_pct = 100.0 * holes / solid_count
    y_lo = int(H * BODY_BAND_Y_LO)
    y_hi = int(H * BODY_BAND_Y_HI)
    x_lo = int(W * BODY_BAND_X_LO)
    x_hi = int(W * BODY_BAND_X_HI)
    body_band = alpha[y_lo:y_hi, x_lo:x_hi]
    body_gap_px = int((body_band < 10).sum())
    return {"holes_pct": float(holes_pct), "body_gap_px": body_gap_px}


def verdict_for(metrics: "dict[str, float]", holes: float, body_gap: int) -> str:
    """Apply thresholds. Returns 'PASS' or 'FAIL'."""
    if metrics.get("holes_pct", 0.0) > holes:
        return "FAIL"
    if metrics.get("body_gap_px", 0) > body_gap:
        return "FAIL"
    return "PASS"


def _judge_one(
    input_path: pathlib.Path,
    output_path: pathlib.Path,
    threshold_holes: float,
    threshold_body_gap: int,
) -> dict:
    """Run the detection algorithm on a single RGBA PNG and return the report dict.

    Shared helper called by BOTH the CLI main() and _run_json_main().
    Does NOT write any file; that is the caller's responsibility.
    """
    metrics = compute_failure_metrics(input_path)
    v = verdict_for(metrics, threshold_holes, threshold_body_gap)
    return {
        "verdict": v,
        "holes_pct": round(float(metrics.get("holes_pct", 0.0)), 4),
        "body_gap_px": int(metrics.get("body_gap_px", 0)),
        "threshold_holes": threshold_holes,
        "threshold_body_gap": threshold_body_gap,
        "input": str(input_path),
    }


# ---- Shared helpers ---------------------------------------------------------

def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


# ---- Explicit single-file CLI (back-compat, no backend coupling) ------------

def main() -> int:
    """Explicit single-file CLI -- one input PNG -> one JSON report.

    Faithful per-file algorithm via the shared _judge_one helper.
    No batch loop, no directory walking, no --root/--only/--out-defaulting.
    Trigger by passing both --input (png) and --output (json).
    """
    ap = argparse.ArgumentParser(prog="detect-matting")
    ap.add_argument("--input", required=True, help="source RGBA PNG path")
    ap.add_argument("--output", required=True, help="output JSON report path")
    ap.add_argument(
        "--threshold-holes", type=float, default=DEFAULT_THRESHOLD_HOLES_PCT,
        help="holes_pct threshold above which a FAIL verdict is issued"
    )
    ap.add_argument(
        "--threshold-body-gap", type=int, default=DEFAULT_THRESHOLD_BODY_GAP_PX,
        help="body_gap_px threshold above which a FAIL verdict is issued"
    )
    args = ap.parse_args()

    src = pathlib.Path(args.input).expanduser().resolve()
    dst = pathlib.Path(args.output).expanduser().resolve()

    if not src.is_file():
        print(f"ERROR: input is not a file: {src}", file=sys.stderr)
        return 2

    try:
        report = _judge_one(src, dst, args.threshold_holes, args.threshold_body_gap)
    except Exception as e:  # noqa: BLE001 -- surface any decode/algorithm failure
        print(f"ERROR: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
        return 4

    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        import json
        dst.write_text(json.dumps(report, indent=2), encoding="utf-8")
    except OSError as e:
        print(f"ERROR: cannot write report: {e}", file=sys.stderr)
        return 2

    print(f"done: {dst}")
    return 0


# ---- JSON entry (Phase 13 atomic-tool pattern) ------------------------------

def _run_json_main(argv: "list[str] | None" = None) -> int:
    """JSON entry -- single-image detect-matting.

    Input shape:
        {
            "input":               "/abs/path/to/in.png",   required
            "output":              "/abs/path/to/report.json", required
            "threshold_holes":     5.0     (optional, default 5.0)
            "threshold_body_gap":  400000  (optional, default 400000)
        }

    Output (stdout):
        {
            "output": {"path": "..."},
            "meta": {
                "atomic_tool":       "detect-matting",
                "mock":              bool,
                "verdict":           "PASS" | "FAIL",
                "holes_pct":         float,
                "body_gap_px":       int,
                "threshold_holes":   float,
                "threshold_body_gap": int
            }
        }

    Errors: stderr {"error":{"code","message"}} + nonzero exit.
    Exit codes:
        0  success (NOTE: a FAIL verdict is NOT an error — exit 0 with verdict "FAIL")
        2  INVALID_INPUT  (bad/missing input fields, non-numeric thresholds,
                           unwritable output dir)
        4  ATOMIC_TOOL_FAILED  (numpy/PIL/scipy processing error)
        1  INTERNAL  (unexpected exception)
    """
    import argparse as _argparse
    import json as _json

    ap = _argparse.ArgumentParser(prog="detect-matting.py", add_help=True)
    ap.add_argument("--input", help="Path to JSON input file. '-' or omitted means stdin.")
    ap.add_argument("--mock", action="store_true",
                    help="Skip real processing; write a deterministic PASS report.")
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

    input_val = payload.get("input")
    output_val = payload.get("output")
    if not input_val or not isinstance(input_val, str):
        _emit_error("INVALID_INPUT", "input.input and input.output are required string fields")
        return 2
    if not output_val or not isinstance(output_val, str):
        _emit_error("INVALID_INPUT", "input.input and input.output are required string fields")
        return 2

    # HAZARD-2: guard numeric coercion -> INVALID_INPUT/exit 2 (not INTERNAL/exit 1)
    try:
        th_holes = float(payload.get("threshold_holes", DEFAULT_THRESHOLD_HOLES_PCT))
        th_body = int(payload.get("threshold_body_gap", DEFAULT_THRESHOLD_BODY_GAP_PX))
    except (TypeError, ValueError):
        _emit_error("INVALID_INPUT", "threshold_holes must be a number; threshold_body_gap must be an integer")
        return 2

    mock = args.mock or bool(payload.get("mock", False))

    src = pathlib.Path(input_val).expanduser().resolve()
    dst = pathlib.Path(output_val).expanduser().resolve()

    if not mock and not src.is_file():
        _emit_error("INVALID_INPUT", f"input is not a file: {src}")
        return 2

    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        _emit_error("INVALID_INPUT", f"cannot create output directory {dst.parent}: {e}")
        return 2

    if mock:
        # Deterministic mock report: PASS, zeros -- no numpy/PIL/scipy needed.
        report = {
            "verdict": "PASS",
            "holes_pct": 0.0,
            "body_gap_px": 0,
            "threshold_holes": th_holes,
            "threshold_body_gap": th_body,
            "input": input_val,
        }
    else:
        try:
            report = _judge_one(src, dst, th_holes, th_body)
        except Exception as e:  # noqa: BLE001 -- atomic tool boundary
            _emit_error("ATOMIC_TOOL_FAILED", f"{type(e).__name__}: {e}")
            return 4

    try:
        dst.write_text(_json.dumps(report, indent=2), encoding="utf-8")
    except OSError as e:
        _emit_error("INVALID_INPUT", f"cannot write report to {dst}: {e}")
        return 2

    print(_json.dumps({
        "output": {"path": str(dst)},
        "meta": {
            "atomic_tool": "detect-matting",
            "mock": mock,
            "verdict": report["verdict"],
            "holes_pct": report["holes_pct"],
            "body_gap_px": report["body_gap_px"],
            "threshold_holes": report["threshold_holes"],
            "threshold_body_gap": report["threshold_body_gap"],
        },
    }))
    return 0


def _looks_like_json_entry(argv: "list[str]") -> bool:
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
