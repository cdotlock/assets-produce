#!/usr/bin/env python3
"""
sync_to_oss.py — push final/*.webp to OSS under nrbi/<rel>.webp.

Reads lunascripts/<slug>/assets/final/{series,ep_sprites}/*.webp and uploads
to bucket OSS_BUCKET (mobai-file) with these key conventions:

    final/series/character_*.webp                → SKIP (reference-only, not in script)
    final/series/scene_<bg>.webp (no _grid)      → nrbi/bg/<bg>.webp
    final/series/scene_<bg>_grid.webp            → SKIP (intermediate, not delivered)
    final/ep_sprites/<sprite>.webp               → nrbi/characters/<sprite>.webp

Mirrors scripts/seed-new-no-rules-in-bad-ideas.ts asset upload contract,
but works directly off the flat post-2026-05-08 final/ layout (sprites
lumped at ep_sprites/, scenes mixed in series/).

Idempotent: HEAD-checks each key before upload — re-runs are cheap, only
new files get pushed. Failed uploads are logged but don't abort the batch.

Usage:
    python3 sync_to_oss.py --book-slug new-no-rules-in-bad-ideas
    python3 sync_to_oss.py --book-slug new-no-rules-in-bad-ideas --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import oss2

OSS_PREFIX = "nrbi"
BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent


@dataclass(frozen=True)
class UploadTask:
    local_path: pathlib.Path
    oss_key: str
    content_type: str = "image/webp"


@dataclass(frozen=True)
class OssAuditResult:
    stale: frozenset
    missing: frozenset
    plan_complete: bool


def audit_oss_against_plan(
    plan: dict,
    oss_keys: "set[str] | frozenset[str]",
    *,
    prefix: str = "nrbi",
) -> "OssAuditResult":
    """Diff OSS object set against plan; return (stale, missing, complete).

    stale  = OSS keys whose stem is not referenced by plan (audit candidates,
             not auto-deleted by this tool).
    missing = expected OSS keys (one per planned scene/sprite) that aren't
              actually on OSS — indicates the upload step failed.
    plan_complete = bool(missing == empty-set).
    """
    planned_scenes: set = set()
    planned_sprites: set = set()
    for task in plan.get("scene_tasks") or []:
        for scene in task.get("scenes") or []:
            sid = scene.get("scene_id")
            if sid:
                planned_scenes.add(sid)
    for ep_sprites in (plan.get("ep_character_sprites") or {}).values():
        for char_sprites in ep_sprites.values():
            for sprite in char_sprites.get("sprites") or []:
                cid = sprite.get("canonical_id") or sprite.get("sprite_id")
                if cid:
                    planned_sprites.add(cid)
    for v in plan.get("scene_variants") or []:
        vid = v.get("variant_id")
        if vid:
            planned_scenes.add(vid)  # variants live alongside scenes in nrbi/bg/

    expected = (
        {f"{prefix}/bg/{s}.webp" for s in planned_scenes} |
        {f"{prefix}/characters/{s}.webp" for s in planned_sprites}
    )
    missing = expected - set(oss_keys)

    stale: set = set()
    for k in oss_keys:
        if not (k.startswith(f"{prefix}/bg/") or k.startswith(f"{prefix}/characters/")):
            continue
        if k not in expected:
            stale.add(k)

    return OssAuditResult(
        stale=frozenset(stale),
        missing=frozenset(missing),
        plan_complete=not missing,
    )


def _load_env(env_path: pathlib.Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not env_path.exists():
        return env
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def build_tasks(final_root: pathlib.Path, groups: "set[str] | None" = None) -> list[UploadTask]:
    """Walk final/* and produce OSS upload tasks.

    Layout (post 2026-05-13 reorg):
        final/ep_sprites/<sid>.webp     → nrbi/sprite/<sid>.webp     (runtime sprite)
        final/anchor/<id>.webp          → nrbi/anchor/<id>.webp      (outfit anchor)
        final/character/<id>.webp       → nrbi/character/<id>.webp   (character card)
        final/series/scene_<bg>.webp    → nrbi/bg/<bg>.webp          (legacy scene path)

    Pre-2026-05-13 the sprite prefix was `nrbi/characters/`. The reorg renames
    it to `nrbi/sprite/` and splits the mixed `nrbi/characters/` directory into
    three semantically-distinct prefixes.

    `groups` (optional) restricts to a subset, e.g. {"sprite", "anchor"}.
    """
    valid_groups = {"sprite", "anchor", "character", "scene"}
    if groups is None:
        groups = valid_groups
    else:
        unknown = groups - valid_groups
        if unknown:
            raise ValueError(f"unknown groups: {unknown}; valid: {valid_groups}")

    tasks: list[UploadTask] = []

    # scene (from legacy series/scene_*.webp layout)
    if "scene" in groups:
        series_dir = final_root / "series"
        if series_dir.exists():
            for f in sorted(series_dir.glob("*.webp")):
                stem = f.stem
                if stem.startswith("character_") or stem.endswith("_grid"):
                    continue
                if stem.startswith("scene_"):
                    bg = stem[len("scene_"):]
                    tasks.append(UploadTask(
                        local_path=f,
                        oss_key=f"{OSS_PREFIX}/bg/{bg}.webp",
                    ))

    # sprite — runtime portrait, was nrbi/characters/ before reorg.
    if "sprite" in groups:
        sprites_dir = final_root / "ep_sprites"
        if sprites_dir.exists():
            sprite_paths = list(sprites_dir.glob("*.webp")) + list(sprites_dir.glob("*/*.webp"))
            for f in sorted(set(sprite_paths)):
                tasks.append(UploadTask(
                    local_path=f,
                    oss_key=f"{OSS_PREFIX}/sprite/{f.name}",
                ))

    # anchor — outfit anchor PNG (1 per (char, outfit_id)), reference for renderer.
    if "anchor" in groups:
        anchor_dir = final_root / "anchor"
        if anchor_dir.exists():
            for f in sorted(anchor_dir.glob("*.webp")):
                tasks.append(UploadTask(
                    local_path=f,
                    oss_key=f"{OSS_PREFIX}/anchor/{f.name}",
                ))

    # character — full-body character card (1 per character).
    if "character" in groups:
        character_dir = final_root / "character"
        if character_dir.exists():
            for f in sorted(character_dir.glob("*.webp")):
                tasks.append(UploadTask(
                    local_path=f,
                    oss_key=f"{OSS_PREFIX}/character/{f.name}",
                ))

    return tasks


def _upload_one(bucket: oss2.Bucket, task: UploadTask, force: bool) -> str:
    """Returns 'uploaded' | 'skipped' | 'failed:<err>'."""
    if not force:
        try:
            bucket.head_object(task.oss_key)
            return "skipped"
        except oss2.exceptions.NoSuchKey:
            pass
        except oss2.exceptions.OssError as e:
            if e.status != 404:
                return f"failed:head:{e.code}"

    try:
        with task.local_path.open("rb") as fh:
            bucket.put_object(
                task.oss_key,
                fh,
                headers={
                    "Content-Type": task.content_type,
                    "x-oss-object-acl": "public-read",
                    "Cache-Control": "public, max-age=31536000",
                },
            )
        return "uploaded"
    except Exception as e:
        return f"failed:put:{type(e).__name__}:{e}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--book-slug", default="new-no-rules-in-bad-ideas")
    ap.add_argument("--env-file",
                    default=str(BACKEND_ROOT / ".env"),
                    help="Path to .env with OSS_* keys")
    ap.add_argument("--dry-run", action="store_true",
                    help="List planned uploads without pushing")
    ap.add_argument("--force", action="store_true",
                    help="Skip HEAD check, re-upload all")
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--strict", action="store_true",
                    help="After upload, audit OSS vs the plan and emit oss_audit.json. "
                         "Exits 1 if stale keys exist or plan is incomplete.")
    ap.add_argument("--groups", default="sprite,anchor,character,scene",
                    help="comma list of groups to upload. "
                         "Choices: sprite | anchor | character | scene. "
                         "Default: all four.")
    ap.add_argument("--plan-file", type=pathlib.Path, default=None,
                    help="Path to dedup_tasks_output.json (or render_todo.json) "
                         "for --strict audit. Defaults to "
                         "lunascripts/<slug>/dedup_tasks_output.json.")
    args = ap.parse_args()

    env_path = pathlib.Path(args.env_file)
    env = _load_env(env_path)
    for k in ("OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET", "OSS_BUCKET", "OSS_ENDPOINT"):
        if k not in env:
            return _exit(f"missing {k} in {env_path}")
    bucket_name = env["OSS_BUCKET"]
    endpoint = env["OSS_ENDPOINT"]

    book_dir = BACKEND_ROOT / "lunascripts" / args.book_slug
    final_root = book_dir / "assets" / "final"
    if not final_root.is_dir():
        return _exit(
            f"final/ not found: {final_root}\n"
            "Hint: the book-slug-aware CLI is a lunaverse-backend relic — this\n"
            "      file lives in assets-produce/tools/oss-sync/ now, where the\n"
            "      lunascripts/<slug>/ layout does not exist. Use the JSON\n"
            "      entry instead: --input <path-to-json> with {source_dir,\n"
            "      oss_prefix, dry_run?}."
        )

    groups = {g.strip() for g in args.groups.split(",") if g.strip()}
    try:
        tasks = build_tasks(final_root, groups=groups)
    except ValueError as e:
        return _exit(str(e))
    print(f"[sync_to_oss] book={args.book_slug}", flush=True)
    print(f"  final={final_root}", flush=True)
    print(f"  bucket={bucket_name}  endpoint={endpoint}", flush=True)
    print(f"  groups={sorted(groups)}", flush=True)
    print(f"  tasks={len(tasks)}  dry_run={args.dry_run}  force={args.force}", flush=True)

    if not tasks:
        print("  no upload tasks (final/ empty?)", flush=True)
        return 0

    if args.dry_run:
        for t in tasks[:20]:
            print(f"  [DRY] {t.local_path.name}  →  {t.oss_key}", flush=True)
        if len(tasks) > 20:
            print(f"  ... and {len(tasks) - 20} more", flush=True)
        return 0

    auth = oss2.Auth(env["OSS_ACCESS_KEY_ID"], env["OSS_ACCESS_KEY_SECRET"])
    bucket = oss2.Bucket(auth, endpoint, bucket_name)

    counts: dict[str, int] = {"uploaded": 0, "skipped": 0, "failed": 0}
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        fut_to_task = {pool.submit(_upload_one, bucket, t, args.force): t for t in tasks}
        for i, fut in enumerate(as_completed(fut_to_task), start=1):
            t = fut_to_task[fut]
            res = fut.result()
            tag = res.split(":", 1)[0]
            counts[tag] = counts.get(tag, 0) + 1
            if tag == "failed":
                failures.append(f"{t.oss_key}: {res}")
                print(f"  ✗ {t.oss_key}: {res}", flush=True)
            elif i % 50 == 0:
                print(f"  ... progress: {i}/{len(tasks)} "
                      f"(↑{counts['uploaded']} ↻{counts['skipped']} ✗{counts['failed']})",
                      flush=True)

    print(f"\n[sync_to_oss] done  ↑{counts['uploaded']}  "
          f"↻{counts['skipped']}  ✗{counts['failed']}", flush=True)
    if failures:
        print("  first failures:", flush=True)
        for f in failures[:10]:
            print(f"    {f}", flush=True)
        return 1

    if args.strict:
        slug_root = BACKEND_ROOT / "lunascripts" / args.book_slug
        plan_path = args.plan_file or (slug_root / "dedup_tasks_output.json")
        if not plan_path.exists():
            print(f"✗ --strict: plan file not found: {plan_path}", file=sys.stderr)
            return 1
        plan = json.loads(plan_path.read_text())
        # List all keys under nrbi/{bg,characters}/ on bucket
        oss_keys: set = set()
        for sub in ("bg", "characters"):
            for obj in oss2.ObjectIteratorV2(bucket, prefix=f"{OSS_PREFIX}/{sub}/"):
                oss_keys.add(obj.key)
        audit = audit_oss_against_plan(plan, oss_keys, prefix=OSS_PREFIX)
        audit_path = plan_path.parent / "oss_audit.json"
        audit_path.parent.mkdir(parents=True, exist_ok=True)
        import datetime as _dt
        audit_path.write_text(json.dumps({
            "audited_at": _dt.datetime.utcnow().isoformat() + "Z",
            "plan_complete": audit.plan_complete,
            "missing_keys": sorted(audit.missing),
            "stale_keys": sorted(audit.stale),
        }, indent=2))
        print(f"[sync --strict] OSS keys: {len(oss_keys)}, "
              f"stale: {len(audit.stale)}, missing: {len(audit.missing)} → {audit_path}",
              flush=True)
        if audit.stale or not audit.plan_complete:
            return 1

    return 0


def _exit(msg: str) -> int:
    print(f"[sync_to_oss] error: {msg}", file=sys.stderr)
    return 1


# ---------- generic JSON entry (Phase 9) ------------------------------------
#
# The legacy `main()` above is tightly coupled to the lunaverse-backend
# `lunascripts/<slug>/assets/final/` layout. The JSON entry below offers a
# generic "scan source_dir → upload to oss_prefix" flow that any caller
# (atomic tools are still discouraged here per design § 11; this is for
# operator scripts) can drive without knowing the legacy directory layout.

def _emit_error(code: str, message: str) -> None:
    import json as _json
    print(_json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _glob_files(source_dir: pathlib.Path,
                include_glob: "str | None",
                exclude_glob: "str | None") -> list[pathlib.Path]:
    pattern = include_glob if include_glob else "**/*"
    candidates = [p for p in source_dir.glob(pattern) if p.is_file()]
    if exclude_glob:
        excluded = {p for p in source_dir.glob(exclude_glob) if p.is_file()}
        candidates = [p for p in candidates if p not in excluded]
    return sorted(candidates)


def _run_json_main(argv: "list[str] | None" = None) -> int:
    """JSON entry — generic source_dir → oss_prefix uploader.

    Input shape:
        {
            "source_dir": "/abs/path/to/dir",
            "oss_prefix": "nrbi/",
            "include_glob": "**/*.webp" (optional),
            "exclude_glob": "**/*.tmp"  (optional),
            "dry_run": true|false (default false),
            "force": true|false (default false; HEAD check skipped if true)
        }

    Output (stdout): {"uploaded":[{local,key,etag}], "skipped":[{local,key,reason}], "errors":[...]}
    Errors: stderr `{"error":{"code","message"}}` + nonzero exit.
    """
    import argparse as _argparse
    import json as _json
    import os as _os
    import time as _time

    ap = _argparse.ArgumentParser(prog="sync.py", add_help=True)
    ap.add_argument("--input", help="Path to JSON input. '-' means stdin.")
    ap.add_argument("--json", action="store_true",
                    help="Force JSON entry (default heuristic uses --input presence).")
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

    source_dir = payload.get("source_dir")
    oss_prefix = payload.get("oss_prefix")
    if not source_dir or not oss_prefix:
        _emit_error("INVALID_INPUT", "input.source_dir and input.oss_prefix are required")
        return 2

    src = pathlib.Path(source_dir).expanduser().resolve()
    if not src.is_dir():
        _emit_error("INVALID_INPUT", f"source_dir is not a directory: {src}")
        return 2

    include_glob = payload.get("include_glob")
    exclude_glob = payload.get("exclude_glob")
    dry_run = bool(payload.get("dry_run", False))
    force = bool(payload.get("force", False))

    files = _glob_files(src, include_glob, exclude_glob)

    uploaded: list[dict[str, str]] = []
    skipped: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    if dry_run:
        # Build the plan without touching OSS at all.
        for p in files:
            rel = p.relative_to(src).as_posix()
            key = f"{oss_prefix.rstrip('/')}/{rel}"
            skipped.append({"local": str(p), "key": key, "reason": "dry_run"})
        print(_json.dumps({"uploaded": uploaded, "skipped": skipped, "errors": errors}))
        return 0

    # Real upload — needs OSS creds.
    missing = [k for k in ("OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET", "OSS_BUCKET", "OSS_ENDPOINT")
               if not _os.environ.get(k)]
    if missing:
        _emit_error("INVALID_INPUT", f"missing OSS env: {missing}")
        return 2

    bucket = oss2.Bucket(  # noqa: F821 — top-level import handles oss2
        oss2.Auth(_os.environ["OSS_ACCESS_KEY_ID"], _os.environ["OSS_ACCESS_KEY_SECRET"]),
        _os.environ["OSS_ENDPOINT"],
        _os.environ["OSS_BUCKET"],
    )
    started = _time.monotonic()
    for p in files:
        rel = p.relative_to(src).as_posix()
        key = f"{oss_prefix.rstrip('/')}/{rel}"
        try:
            if not force and bucket.object_exists(key):
                skipped.append({"local": str(p), "key": key, "reason": "remote_exists"})
                continue
            res = bucket.put_object_from_file(key, str(p))
            uploaded.append({"local": str(p), "key": key, "etag": res.etag or ""})
        except Exception as e:  # noqa: BLE001 — return errors in JSON envelope
            errors.append({"local": str(p), "key": key, "message": f"{type(e).__name__}: {e}"})

    duration_ms = int((_time.monotonic() - started) * 1000)
    print(_json.dumps({
        "uploaded": uploaded,
        "skipped": skipped,
        "errors": errors,
        "meta": {"duration_ms": duration_ms, "total": len(files)},
    }))
    return 0 if not errors else 1


def _looks_like_json_entry(argv: list[str]) -> bool:
    return any(a in ("--input", "--json") for a in argv)


if __name__ == "__main__":
    import sys as _sys
    if _looks_like_json_entry(_sys.argv[1:]):
        raise SystemExit(_run_json_main())
    raise SystemExit(main())
