"""Layer B of CG pipeline — render one .webp per cg_task and upload to OSS.

Consumes tasks_output.cg_tasks[] (produced by skills/asset-prompt-generator/cg_collector.py
in novels-to-moonscript). Calls helpers from render-with-style.py to actually generate
images. Uploads to nrbi/cg/<name>.webp.

Phase 3 (video) is a render_mode dispatch — placeholder raises NotImplementedError.

See docs/superpowers/specs/2026-05-13-cg-pipeline-design.md §6.
"""
from __future__ import annotations

import functools
import pathlib


def _book_oss_prefix(slug: str) -> str:
    """Map a book slug to its OSS key prefix.

    Matches the convention in novels-to-moonscript/dramatizer/build.py.
    """
    return {
        "no-rules-in-bad-ideas": "nrbi/",
        "new-no-rules-in-bad-ideas": "nrbi/",
    }.get(slug, f"{slug}/")


def select_aspect_for_panel_count(n: int) -> str:
    """Map panel count → image aspect ratio string.

    All CGs are 9:16 — MoonShort renders full-bleed on portrait mobile screens,
    so a 1:1 single-panel or 1:2 two-panel wastes vertical real estate (top/
    bottom letterboxing). Keep the function for forward-compat / per-count
    tuning, but for now panel count only changes the in-image layout (set by
    the prompt's _LAYOUT_DIRECTIVE), not the canvas aspect.
    """
    return "9:16"


def cg_local_path(slug: str, cg_name: str, assets_root: str) -> pathlib.Path:
    return pathlib.Path(assets_root) / slug / "cg" / f"{cg_name}.webp"


def cg_oss_key(slug: str, cg_name: str, extension: str = "webp") -> str:
    """OSS key convention: <oss_prefix_for_slug>cg/<name>.<ext>."""
    prefix = _book_oss_prefix(slug)
    ext = extension.lstrip(".")
    return f"{prefix}cg/{cg_name}.{ext}"


@functools.lru_cache(maxsize=1)
def _import_render_with_style():
    """Load `render-with-style.py` as a module despite its hyphenated filename.

    Returned module exposes `render_with_retry`, `render_image`, `fetch_url`,
    `kc`, `ZENMUX_BASE_URL`, `genai`, `gt`, `_CURRENT_STYLE_FAMILY`.

    Cached: subsequent calls reuse the already-loaded module.
    """
    import importlib.util
    path = pathlib.Path(__file__).parent / "render-with-style.py"
    if not path.is_file():
        raise FileNotFoundError(f"render-with-style.py not found at {path}")
    spec = importlib.util.spec_from_file_location("rws", str(path))
    if spec is None or spec.loader is None:
        raise ImportError("could not build importlib spec for render-with-style.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def render_cg_task(task: dict, *, slug: str, assets_root: str,
                   overwrite: bool = False) -> pathlib.Path:
    """Render one cg_task to a local .webp file via render-with-style helpers.

    Returns the local file path. Raises:
        NotImplementedError if render_mode == "video" (Phase 3, agent-forge territory)
        ValueError on unknown render_mode
        RuntimeError if rendering fails or output file isn't produced
    """
    mode = task.get("render_mode")
    if mode == "video":
        raise NotImplementedError(
            "render_mode='video' (P3) is reserved for agent-forge. "
            "Today only render_mode='image' (P1/P2) is implemented."
        )
    if mode != "image":
        raise ValueError(f"unknown render_mode: {mode!r}")

    cg_name = task["cg_name"]
    out_path = cg_local_path(slug, cg_name, assets_root)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rws = _import_render_with_style()
    # Multi-ref support: prefer the explicit list field (style + character
    # anchors), fall back to the legacy single-URL field. Order is meaningful
    # — prompts reference them as "图 1, 图 2, ..." in declaration order, so
    # the first entry should always be the style anchor.
    ref_urls = task.get("reference_image_urls")
    if not ref_urls:
        ref_urls = [task["reference_image_url"]]
    refs = [rws.fetch_url(u) for u in ref_urls]  # [(bytes, mime_type), ...]

    client = rws.genai.Client(
        api_key=rws.kc("ZENMUX_API_KEY"),
        vertexai=True,
        http_options=rws.gt.HttpOptions(
            api_version="v1", base_url=rws.ZENMUX_BASE_URL
        ),
    )

    status, detail = rws.render_with_retry(
        client,
        task["model"],
        task["prompt"],
        refs,
        out_path,
        overwrite,
        None,  # category=None — CG has no aspect-check in _EXPECTED_ASPECT_BY_CATEGORY
    )

    if status not in ("ok", "skip"):
        raise RuntimeError(
            f"render-with-style failed for {cg_name!r}: status={status} detail={detail}"
        )
    if not out_path.exists():
        raise RuntimeError(
            f"render-with-style returned status={status} but didn't write {out_path}"
        )
    return out_path


def upload_cg_to_oss(
    *,
    local_path: pathlib.Path,
    slug: str,
    cg_name: str,
    bucket,
    skip_if_remote_exists: bool = True,
) -> str:
    """Upload local cg .webp/.mp4 to OSS at the conventional key.

    Returns the OSS key.
    """
    extension = local_path.suffix.lstrip(".")
    key = cg_oss_key(slug, cg_name, extension=extension)
    if skip_if_remote_exists and bucket.object_exists(key):
        return key
    bucket.put_object_from_file(key, str(local_path))
    return key


def _run_cli(argv=None) -> int:
    """Layer B CLI: read tasks_output.cg_tasks, render each, upload each."""
    import argparse
    import json
    import os

    p = argparse.ArgumentParser(
        description="Render each cg_task and upload to OSS (Layer B of CG pipeline).",
    )
    p.add_argument("--tasks-output", required=True, type=pathlib.Path,
                   help="path to tasks_output.json")
    p.add_argument("--slug", required=True,
                   help="book slug, e.g. 'no-rules-in-bad-ideas'")
    p.add_argument("--assets-root", required=True, type=pathlib.Path,
                   help="local assets dir root, files written to <root>/<slug>/cg/")
    p.add_argument("--only", default=None,
                   help="comma-separated cg_name list to render (else all)")
    p.add_argument("--skip-upload", action="store_true",
                   help="render locally but don't push to OSS")
    p.add_argument("--dry-run", action="store_true",
                   help="print what would render but don't call the model")
    p.add_argument("--overwrite", action="store_true",
                   help="overwrite already-rendered local files + already-uploaded OSS keys")
    p.add_argument("--env-file",
                   default=str(pathlib.Path(__file__).resolve().parent.parent / ".env"),
                   help="path to .env file with OSS_* + ZENMUX_API_KEY (default: backend/.env)")
    args = p.parse_args(argv)

    # Load .env (matches render-with-style.py main() behavior) so ZENMUX_API_KEY
    # and OSS_* credentials are visible to kc() inside render-with-style.
    env_path = pathlib.Path(args.env_file)
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

    tasks_doc = json.loads(args.tasks_output.read_text())
    all_tasks = tasks_doc.get("cg_tasks", [])
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        all_tasks = [t for t in all_tasks if t["cg_name"] in wanted]

    if not all_tasks:
        print(
            f"no cg_tasks to render (input={args.tasks_output}, "
            f"--only={args.only})"
        )
        return 0

    print(
        f"rendering {len(all_tasks)} cg_tasks "
        f"(dry_run={args.dry_run}, skip_upload={args.skip_upload})..."
    )

    bucket = None
    if not args.skip_upload and not args.dry_run:
        try:
            import oss2  # type: ignore[import-not-found]
        except ImportError:
            print("WARN: oss2 not installed; uploads disabled.")
            args.skip_upload = True
        else:
            ak = os.environ.get("OSS_ACCESS_KEY_ID")
            sk = os.environ.get("OSS_ACCESS_KEY_SECRET")
            endpoint = os.environ.get("OSS_ENDPOINT")
            bucket_name = os.environ.get("OSS_BUCKET")
            if not all([ak, sk, endpoint, bucket_name]):
                print("WARN: OSS credentials missing; uploads disabled.")
                args.skip_upload = True
            else:
                bucket = oss2.Bucket(oss2.Auth(ak, sk), endpoint, bucket_name)

    n_ok, n_fail = 0, 0
    for t in all_tasks:
        cg_name = t["cg_name"]
        print(f"  [{cg_name}] panels={t['panel_count']} mode={t['render_mode']}")
        if args.dry_run:
            n_ok += 1
            continue
        try:
            local_path = render_cg_task(
                t,
                slug=args.slug,
                assets_root=str(args.assets_root),
                overwrite=args.overwrite,
            )
            if bucket is not None:
                key = upload_cg_to_oss(
                    local_path=local_path,
                    slug=args.slug,
                    cg_name=cg_name,
                    bucket=bucket,
                    skip_if_remote_exists=not args.overwrite,
                )
                print(f"    uploaded → {key}")
            n_ok += 1
        except Exception as e:  # noqa: BLE001 — driver swallows per-task error
            print(f"    FAILED: {e}")
            n_fail += 1

    print(f"\ndone: {n_ok} OK, {n_fail} failed")
    return 0 if n_fail == 0 else 1


def _run_json_main(argv=None) -> int:
    """JSON entry — single-task render driven by `--input <path>` or stdin.

    Input shape:
        {
            "task": {"cg_name": "...", "render_mode": "image",
                     "model": "...", "prompt": "...",
                     "reference_image_urls": ["https://..."], "panel_count": 1},
            "slug": str,
            "assets_root": str (default: $PWD/_assets),
            "overwrite": bool (default false),
            "mock": bool (default false; --mock also flips it on)
        }

    Output (stdout, JSON only — logs go to stderr):
        {"outputs": [{"path": "...", "kind": "image"}],
         "meta": {"model": "...", "latency_ms": int,
                  "atomic_tool": "cg-render", "mock": bool}}

    Errors: non-zero exit + stderr JSON
        {"error": {"code": "...", "message": "..."}}.
    """
    import argparse as _argparse
    import json as _json
    import os as _os
    import sys as _sys
    import time as _time

    p = _argparse.ArgumentParser(prog="render.py", add_help=True)
    p.add_argument("--input", help="Path to JSON input. '-' means stdin.")
    p.add_argument(
        "--mock",
        action="store_true",
        help="Skip real ZENMUX call; write a 1x1 placeholder PNG so the wrapper round-trips.",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Force JSON entry even if the legacy --slug etc. flags would normally route to the CLI.",
    )
    args = p.parse_args(argv)

    if args.input is None or args.input == "-":
        raw = _sys.stdin.read()
    else:
        with open(args.input, "r", encoding="utf-8") as fh:
            raw = fh.read()
    try:
        payload = _json.loads(raw)
    except _json.JSONDecodeError as e:
        _emit_error("INVALID_INPUT", f"input is not valid JSON: {e}")
        return 2

    task = payload.get("task")
    if not isinstance(task, dict) or "cg_name" not in task:
        _emit_error("INVALID_INPUT", "input.task is required and must contain cg_name")
        return 2

    slug = payload.get("slug") or task.get("slug")
    if not slug:
        _emit_error("INVALID_INPUT", "input.slug is required")
        return 2

    assets_root = payload.get("assets_root") or _os.environ.get(
        "ASSETS_ROOT",
        str(pathlib.Path.cwd() / "_assets"),
    )
    overwrite = bool(payload.get("overwrite", False))
    mock = args.mock or bool(payload.get("mock", False))
    model = task.get("model") or "gemini-3.1-flash-image-preview"

    started = _time.monotonic()
    cg_name = task["cg_name"]
    if mock:
        out_path = cg_local_path(slug, cg_name, assets_root)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        _write_placeholder_png(out_path)
    else:
        try:
            out_path = render_cg_task(
                task,
                slug=slug,
                assets_root=assets_root,
                overwrite=overwrite,
            )
        except NotImplementedError as e:
            _emit_error("NOT_IMPLEMENTED", str(e))
            return 5
        except (ValueError, KeyError) as e:
            _emit_error("INVALID_INPUT", str(e))
            return 2
        except RuntimeError as e:
            _emit_error("ATOMIC_TOOL_FAILED", str(e))
            return 4
        except Exception as e:  # noqa: BLE001 — atomic tool boundary
            _emit_error("INTERNAL", str(e))
            return 1
    latency_ms = int((_time.monotonic() - started) * 1000)

    print(
        _json.dumps(
            {
                "outputs": [{"path": str(out_path), "kind": "image"}],
                "meta": {
                    "model": model,
                    "latency_ms": latency_ms,
                    "atomic_tool": "cg-render",
                    "mock": mock,
                },
            }
        )
    )
    return 0


def _emit_error(code: str, message: str) -> None:
    """Write a `{error:{code,message}}` envelope to stderr."""
    import json as _json
    import sys as _sys
    print(_json.dumps({"error": {"code": code, "message": message}}), file=_sys.stderr)


def _write_placeholder_png(out_path: pathlib.Path) -> None:
    """Write a 1x1 grey PNG so atomic-tool wrappers can OSS-PUT in mock mode.

    Pillow is only needed in real (non-mock) flows. To keep mock mode dep-free
    we write the canonical 1x1 grey PNG bytes by hand — the file is a valid
    PNG that any image library can read.
    """
    png_bytes = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b550000000a4944415478"
        "9c63680000008200016ed24fec0000000049454e44ae426082"
    )
    out_path.write_bytes(png_bytes)


def _looks_like_json_entry(argv) -> bool:
    """Heuristic dispatcher between JSON entry and legacy bulk CLI."""
    return any(a in ("--input", "--mock", "--json") for a in argv)


if __name__ == "__main__":
    import sys as _sys
    if _looks_like_json_entry(_sys.argv[1:]):
        _sys.exit(_run_json_main())
    _sys.exit(_run_cli())
