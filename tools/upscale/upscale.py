#!/usr/bin/env python3
"""
upscale.py — Real-ESRGAN x4 → resize ÷2 in-place.

Reads moonscripts/<slug>/assets/gen-upscale/{series,scene,ep_sprites/<ep>}/<id>.png
and writes <id>_upscaled.png next to it (same dir, suffix added).

Net effect: 1× source → 2× upscaled (~5 MB PNG @ 1882×3344) sitting in the
same folder as the original. The original raw PNG is kept — re-renders from
phase 1 should always overwrite the 1× file, then this script re-emits the
_upscaled.png companion.

Skips files that already end in _upscaled.png on input scan.

Usage:
  python3 generate-upscale-matting/upscale.py [--book-slug …] [--only series,scene,ep1] [--overwrite]
"""
from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
import tempfile
import time

from PIL import Image

# This script lives under <backend>/generate-upscale-matting/.
BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BOOK_SLUG = "no-rules-in-bad-ideas"

REALESRGAN_BIN = pathlib.Path.home() / "bin" / "realesrgan" / "realesrgan-ncnn-vulkan"
REALESRGAN_MODELS = pathlib.Path.home() / "bin" / "realesrgan" / "models"
# 2026-05-08: switched from realesrgan-x4plus (~155s/img on Apple Silicon, 60h+ for
# 1509 sprites — unworkable) to realesrgan-x4plus-anime (~38s/img, ~16h overnight
# for full sprite set). Visual fit: YA Impasto digital painting reads close enough
# to anime that the anime-tuned model produces clean line/edge upscales without
# over-sharpening the painted areas.
MODEL_NAME = "realesrgan-x4plus-anime"
JOB_THREADS = "1:4:4"  # default 1:2:2 → 1:4:4 ~14% faster on Apple Silicon
SCALE_DIVISOR = 2  # 4× upscale, then halve → net 2× source

GROUPS = {
    "series": "series",
    "scene":  "scene",
    # 2026-05-08: render-with-style.py:81 writes flat ep_sprites/<id>.png
    # (n2m post-flatten), no ep1/ subfolder. Match the flat layout.
    "ep1":    "ep_sprites",
}


def upscale_one(src: pathlib.Path, dst: pathlib.Path, overwrite: bool) -> tuple[str, str, float]:
    """Returns (status, detail, elapsed_s). status ∈ {ok, skip, fail}.

    2026-05-09: skip-if-exists now also compares mtime — if src is newer than
    dst, treat dst as stale and re-upscale. Prevents the operational footgun
    where re-rendering 1× without --overwrite leaves a stale _upscaled (root
    cause of NRBI 2026-05-08 weston/mariana/remi face misalignment, where
    the 18:27 batch re-rendered character 1× but pinned the old 03:09
    _upscaled because the existence check alone said "skip")."""
    if dst.exists() and not overwrite:
        try:
            if src.stat().st_mtime <= dst.stat().st_mtime:
                return ("skip", str(dst.name), 0.0)
            # else: src is newer → fall through and re-upscale (auto-staleness)
        except OSError:
            # If stat fails for either side, fall back to legacy skip behaviour.
            return ("skip", str(dst.name), 0.0)

    t0 = time.time()
    with tempfile.TemporaryDirectory() as td:
        tmp_x4 = pathlib.Path(td) / "x4.png"
        proc = subprocess.run(
            [
                str(REALESRGAN_BIN),
                "-i", str(src),
                "-o", str(tmp_x4),
                "-m", str(REALESRGAN_MODELS),
                "-n", MODEL_NAME,
                "-s", "4",
                "-j", JOB_THREADS,
            ],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0 or not tmp_x4.exists():
            return ("fail", f"realesrgan exit={proc.returncode}: {proc.stderr.strip()[:200]}", time.time() - t0)

        try:
            im = Image.open(tmp_x4)
            w, h = im.size
            out = im.resize((w // SCALE_DIVISOR, h // SCALE_DIVISOR), Image.LANCZOS)
            dst.parent.mkdir(parents=True, exist_ok=True)
            # Lossless PNG (cutout downstream needs RGB). PIL default compression
            # is much smaller than ncnn's raw output (~5 MB vs ~35 MB for 2×).
            out.save(dst, "PNG", optimize=True)
        except Exception as e:
            return ("fail", f"resize/save: {type(e).__name__}: {e}", time.time() - t0)

    return ("ok", f"{out.size[0]}×{out.size[1]} {dst.stat().st_size//1024} KB", time.time() - t0)


def collect_jobs(src_root: pathlib.Path, only: set[str] | None) -> list[tuple[str, pathlib.Path, pathlib.Path]]:
    jobs: list[tuple[str, pathlib.Path, pathlib.Path]] = []
    for group_id, subdir in GROUPS.items():
        if only and group_id not in only:
            continue
        src_dir = src_root / subdir
        if not src_dir.is_dir():
            continue
        for src in sorted(src_dir.glob("*.png")):
            # skip the upscaled output files themselves
            if src.stem.endswith("_upscaled"):
                continue
            dst = src.with_name(f"{src.stem}_upscaled.png")
            jobs.append((group_id, src, dst))
    return jobs


def main() -> int:
    ap = argparse.ArgumentParser(prog="upscale")
    ap.add_argument("--book-slug", default=DEFAULT_BOOK_SLUG, help="moonscripts/<slug>/ folder name")
    ap.add_argument("--only", help=f"comma list of groups: {','.join(GROUPS)}")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()

    if not REALESRGAN_BIN.exists():
        sys.exit(f"realesrgan binary missing: {REALESRGAN_BIN}")
    if not REALESRGAN_MODELS.is_dir():
        sys.exit(f"realesrgan models dir missing: {REALESRGAN_MODELS}")

    book_dir = BACKEND_ROOT / "moonscripts" / args.book_slug
    if not book_dir.is_dir():
        sys.exit(f"book dir not found: {book_dir}")
    src_root = book_dir / "assets" / "gen-upscale"
    if not src_root.is_dir():
        sys.exit(f"assets/gen-upscale not found: {src_root}  (run render-with-style.py first)")

    only = set(s.strip() for s in args.only.split(",")) if args.only else None
    jobs = collect_jobs(src_root, only)
    if not jobs:
        print("no jobs (check --only filter and src dirs)")
        return 1

    print(f"[upscale] {len(jobs)} images")
    print(f"  root: {src_root}")
    print(f"  pipeline: {MODEL_NAME} x4 → ÷{SCALE_DIVISOR} → PNG (in-place, '_upscaled' suffix)")
    print(f"  overwrite={args.overwrite}")
    print()

    counts = {"ok": 0, "skip": 0, "fail": 0}
    total_t = 0.0
    for i, (group, src, dst) in enumerate(jobs, 1):
        status, detail, elapsed = upscale_one(src, dst, args.overwrite)
        counts[status] += 1
        total_t += elapsed
        tag = {"ok": "✓", "skip": "·", "fail": "✗"}[status]
        avg = total_t / max(1, counts["ok"])
        eta = avg * (len(jobs) - i)
        print(f"  [{i:>2}/{len(jobs)}] {tag} {group}/{src.name}: {detail}  ({elapsed:.1f}s, eta {eta:.0f}s)")

    print()
    print(f"Done. ok={counts['ok']} skip={counts['skip']} fail={counts['fail']}  total {total_t:.0f}s")
    return 0 if counts["fail"] == 0 else 1


# ---------- generic JSON entry (Phase 9) ------------------------------------
#
# The legacy main() is tightly coupled to the moonshort-backend
# moonscripts/<slug>/assets/gen-upscale/ layout. The JSON entry below is
# single-file in / single-file out, which is what the cg-render-style
# atomic-tool boundary expects.

def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _write_placeholder_png(out_path: pathlib.Path) -> None:
    """Drop a tiny valid PNG so atomic-tool wrappers can finish in mock mode."""
    png_bytes = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b550000000a4944415478"
        "9c63680000008200016ed24fec0000000049454e44ae426082"
    )
    out_path.write_bytes(png_bytes)


def _run_json_main(argv: "list[str] | None" = None) -> int:
    """JSON entry — single-image upscale.

    Input shape:
        {
            "input_path": "/abs/in.png",
            "output_path": "/abs/out_upscaled.png",
            "scale": 2 | 4,
            "model": "realesrgan-x4plus-anime" (optional),
            "overwrite": bool (optional, default false),
            "mock": bool (optional)
        }

    Output (stdout): {"output":{"path": "..."}, "meta": {"scale":int, "latency_ms":int, "model": str, "mock": bool}}
    Errors: stderr `{"error":{"code","message"}}` + nonzero exit.
    """
    import argparse as _argparse
    import json as _json
    import time as _time

    ap = _argparse.ArgumentParser(prog="upscale.py", add_help=True)
    ap.add_argument("--input", help="Path to JSON input. '-' means stdin.")
    ap.add_argument("--mock", action="store_true",
                    help="Skip realesrgan; write a 1x1 placeholder PNG at output_path.")
    ap.add_argument("--json", action="store_true", help="Force JSON entry.")
    args = ap.parse_args(argv)

    if args.input is None or args.input == "-":
        raw = sys.stdin.read()
    else:
        with open(args.input, "r", encoding="utf-8") as fh:
            raw = fh.read()
    try:
        payload = _json.loads(raw)
    except _json.JSONDecodeError as e:
        _emit_error("INVALID_INPUT", f"input is not valid JSON: {e}")
        return 2

    input_path = payload.get("input_path")
    output_path = payload.get("output_path")
    if not input_path or not output_path:
        _emit_error("INVALID_INPUT", "input.input_path and input.output_path are required")
        return 2

    src = pathlib.Path(input_path).expanduser().resolve()
    dst = pathlib.Path(output_path).expanduser().resolve()
    overwrite = bool(payload.get("overwrite", False))
    mock = args.mock or bool(payload.get("mock", False))
    scale = int(payload.get("scale", 2))
    if scale not in (2, 4):
        _emit_error("INVALID_INPUT", f"scale must be 2 or 4, got {scale}")
        return 2
    model = payload.get("model") or MODEL_NAME

    if not mock and not src.is_file():
        _emit_error("INVALID_INPUT", f"input_path is not a file: {src}")
        return 2
    if dst.exists() and not overwrite:
        _emit_error("INVALID_INPUT", f"output_path already exists (overwrite=false): {dst}")
        return 2

    dst.parent.mkdir(parents=True, exist_ok=True)
    started = _time.monotonic()
    if mock:
        _write_placeholder_png(dst)
    else:
        if not REALESRGAN_BIN.exists():
            _emit_error("ATOMIC_TOOL_FAILED", f"realesrgan binary missing: {REALESRGAN_BIN}")
            return 4
        try:
            status, detail, _elapsed = upscale_one(src, dst, overwrite)
            if status == "fail":
                _emit_error("ATOMIC_TOOL_FAILED", detail)
                return 4
            if status == "skip" and not dst.exists():
                _emit_error("INTERNAL", "upscale_one returned skip but produced no file")
                return 1
        except Exception as e:  # noqa: BLE001 — atomic tool boundary
            _emit_error("INTERNAL", str(e))
            return 1
    latency_ms = int((_time.monotonic() - started) * 1000)

    print(_json.dumps({
        "output": {"path": str(dst)},
        "meta": {
            "scale": scale,
            "model": model,
            "latency_ms": latency_ms,
            "atomic_tool": "upscale-image",
            "mock": mock,
        },
    }))
    return 0


def _looks_like_json_entry(argv: list[str]) -> bool:
    return any(a in ("--input", "--mock", "--json") for a in argv)


if __name__ == "__main__":
    if _looks_like_json_entry(sys.argv[1:]):
        sys.exit(_run_json_main())
    sys.exit(main())
