#!/usr/bin/env python3
"""hybrid-to-webp.py — convert MODNet-hybrid chromakey PNG to delivery WebP.

Atomic tool: takes ONE explicit input file and writes ONE explicit output file.
No directory walking, no book-slug logic, no REPO_ROOT — those belonged to the
original batch script and are intentionally removed here.

Why a dedicated tool (vs running to-final.py):
  to-final.py runs a "last-gate" _inline_unspill before WebP encode that
  blindly clamps G := max(R,B) on every alpha>0 pixel. That re-applies the
  exact over-correction the MODNet hybrid was designed to avoid (it would
  destroy dark olive / dark green fabric color). Hybrid output's RGB is
  already cleaned by edge_decontaminate, so we skip the extra unspill.

Migrated 2026-05-16 from
moonshort-backend/generate-upscale-matting/_local_tools/hybrid_to_webp.py.
Path-walking / batch logic removed. JSON contract aligned with Phase-13 pattern.

Usage (JSON entry, preferred):
  python3 hybrid-to-webp.py --input fixtures/hybrid-to-webp-mock.json
  cat fixtures/hybrid-to-webp-mock.json | python3 hybrid-to-webp.py --input -

Legacy CLI (batch, back-compat):
  python3 hybrid-to-webp.py --book-slug <slug> [--overwrite] [--quality 90] ...
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time


# ---------------------------------------------------------------------------
# Default encoding parameters (faithfully preserved from the original backend).
# ---------------------------------------------------------------------------
DEFAULT_QUALITY = 90
DEFAULT_METHOD = 6  # WebP encoder method (0=fast, 6=best/slowest)


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


# ─── Legacy batch CLI (back-compat) ──────────────────────────────────────────

def main() -> int:
    """Original batch CLI — directory-walking, book-slug-based.

    Preserved for back-compat with scripts that invoked hybrid_to_webp.py
    directly with --book-slug. This path is NOT used by the atomic-tool JSON
    entry. Note: REPO_ROOT and the directory-walking logic live only in this
    function; the JSON entry has neither.
    """
    REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]  # assets-produce root (not backend)

    ap = argparse.ArgumentParser(prog="hybrid-to-webp")
    ap.add_argument("--book-slug", required=True)
    ap.add_argument("--overwrite", action="store_true",
                    help="re-encode even if WebP exists and is newer than PNG")
    ap.add_argument("--only", default="",
                    help="comma list of sprite_ids to process")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--quality", type=int, default=DEFAULT_QUALITY)
    ap.add_argument("--method", type=int, default=DEFAULT_METHOD,
                    help="WebP encoder method (0=fast, 6=best/slowest)")
    args = ap.parse_args()

    from PIL import Image

    base = REPO_ROOT / "moonscripts" / args.book_slug / "assets"
    src_dir = base / "asset-img-chromakey" / "ep_sprites"
    dst_dir = base / "final" / "ep_sprites"

    if not src_dir.is_dir():
        print(f"ERROR: src missing: {src_dir}", file=sys.stderr)
        return 2
    dst_dir.mkdir(parents=True, exist_ok=True)

    if args.only:
        only_set = {x.strip() for x in args.only.split(",") if x.strip()}
        srcs = sorted(p for p in src_dir.iterdir()
                      if p.is_file() and p.suffix == ".png" and p.stem in only_set)
    else:
        srcs = sorted(p for p in src_dir.iterdir()
                      if p.is_file() and p.suffix == ".png")
    if args.limit:
        srcs = srcs[:args.limit]

    print(f"[hybrid-to-webp] book={args.book_slug}", flush=True)
    print(f"  src: {src_dir}", flush=True)
    print(f"  dst: {dst_dir}", flush=True)
    print(f"  pngs: {len(srcs)}  overwrite={args.overwrite}  q={args.quality} method={args.method}",
          flush=True)

    counts = {"ok": 0, "skip": 0, "err": 0}
    t0 = time.time()
    for i, src in enumerate(srcs, 1):
        dst = dst_dir / f"{src.stem}.webp"
        if (not args.overwrite and dst.exists()
                and dst.stat().st_mtime > src.stat().st_mtime):
            counts["skip"] += 1
            continue
        try:
            im = Image.open(src).convert("RGBA")
            im.save(dst, "WEBP", quality=args.quality, method=args.method)
            counts["ok"] += 1
        except Exception as e:
            counts["err"] += 1
            print(f"  ERR {src.stem}: {type(e).__name__}: {e}", flush=True)

        if i <= 3 or i % 100 == 0 or i == len(srcs):
            rate = i / (time.time() - t0)
            eta_s = (len(srcs) - i) / rate if rate else 0
            print(f"  [{i:>4}/{len(srcs)}] ok={counts['ok']} skip={counts['skip']} "
                  f"err={counts['err']}  rate={rate:.1f}/s  eta={eta_s:.0f}s",
                  flush=True)

    elapsed = time.time() - t0
    print(f"\n[hybrid-to-webp] done in {elapsed:.1f}s — "
          f"ok={counts['ok']} skip={counts['skip']} err={counts['err']}", flush=True)
    return 0 if counts["err"] == 0 else 1


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

    quality = int(payload.get("quality", DEFAULT_QUALITY))
    method = int(payload.get("method", DEFAULT_METHOD))
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
            from PIL import Image
            im = Image.open(src).convert("RGBA")
            im.save(dst, "WEBP", quality=quality, method=method)
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
    return any(a in ("--input", "--mock", "--json") for a in argv)


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
