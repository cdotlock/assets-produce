#!/usr/bin/env python3
"""
mss-validate — frozen-subprocess bridge for the canonical MSS validator.

Wraps the sha256-pinned Go binary from moonshort-script@b36a407 (vendored under
tools/mss-validate/moonshort-script/).  Never reimplements validation logic;
always delegates to the upstream binary (design D6 / spec §8.2).

Input (JSON object on stdin via --input -):
  script_path : str  — absolute path to the .mss / .md file to validate
  content     : str  — raw MSS text (written to a tempfile, mutually exclusive with script_path)
  mock        : bool — use canned responses; skip all Go/subprocess/network work
  dryRun      : bool — echo input and exit 0 without doing any work

Output contract (stdout = result JSON; stderr = operational-error envelope only):
  PASS verdict  → {"verdict":"PASS","errors":[],"meta":{...}}                 exit 0
  FAIL verdict  → {"verdict":"FAIL","errors":[...lines...],"raw":"...","meta":{...}} exit 0
  Operational failure → stderr {"error":{"code":"...","message":"..."}}       exit non-zero

Exit codes:
  0 — success (PASS or FAIL verdict both count as success — judgement succeeded)
  1 — INTERNAL (unexpected exception)
  2 — INVALID_INPUT (bad JSON, wrong shape, missing fields, file not found/unreadable)
  4 — ATOMIC_TOOL_FAILED (drift detected, go unavailable, build failed, spawn failed)

Mock sentinel:
  If content contains the literal string __MSS_MOCK_FAIL__ OR script_path ends with
  __MSS_MOCK_FAIL__, the mock branch returns a canned FAIL verdict.  Otherwise it
  returns a canned PASS verdict.  Mock mode skips all heavy work (no Go, no subprocess,
  no vendored-tree access).  Safe in CI with no Go toolchain.

Drift guard:
  Before any build/validate work, the bridge recomputes a sha256 manifest over
  tools/mss-validate/moonshort-script/** (sorted by path, LC_ALL=C bytewise) and
  compares it byte-for-byte with the committed FROZEN_MANIFEST.sha256.  Drift causes
  an immediate ATOMIC_TOOL_FAILED exit without proceeding to build or validate.

Build-once cache:
  The Go binary is compiled on first use and cached at
  $TMPDIR/assets-produce-mss-validate/<manifest_sha>/mss.  Subsequent calls reuse
  the cached binary (no rebuild if the manifest sha matches the cached path).
"""
from __future__ import annotations

import argparse
import functools
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
VENDOR_DIR = TOOL_DIR / "moonshort-script"
MANIFEST_PATH = TOOL_DIR / "FROZEN_MANIFEST.sha256"


@functools.lru_cache(maxsize=1)
def _recompute_manifest() -> str:
    """Recompute the sha256 manifest over moonshort-script/** and return it as text.

    Algorithm must reproduce the committed FROZEN_MANIFEST.sha256 byte-for-byte:
      - enumerate every regular file under tools/mss-validate/moonshort-script/
      - sha256 each file's bytes
      - format each line as: "<64-hex-sha256>  <relpath-from-tools/mss-validate/>"
        (two spaces; relpath is POSIX-style, starting with moonshort-script/)
      - sort lines by the path field (bytewise, equivalent to LC_ALL=C sort)
      - join with "\n", append trailing "\n"
    """
    lines: list[str] = []
    for f in VENDOR_DIR.rglob("*"):
        if f.is_file():
            rel = f.relative_to(TOOL_DIR).as_posix()
            sha = hashlib.sha256(f.read_bytes()).hexdigest()
            lines.append(f"{sha}  {rel}")
    lines.sort(key=lambda line: line.split("  ", 1)[1])
    return "\n".join(lines) + "\n"


def _check_drift() -> str | None:
    """Return an error message if the vendored tree has drifted; None if clean."""
    try:
        committed = MANIFEST_PATH.read_text()
    except OSError as e:
        return f"cannot read manifest: {e}"
    recomputed = _recompute_manifest()
    if recomputed != committed:
        return (
            "drift detected: vendored tree does not match FROZEN_MANIFEST.sha256. "
            "Re-vendor from moonshort-script@b36a407 and regenerate the manifest."
        )
    return None


@functools.lru_cache(maxsize=1)
def _build_cache_bin() -> Path:
    """Build the mss binary (once) and return its path.

    Cache key is the sha256 of the committed manifest file, so a re-vendor that
    updates the manifest automatically triggers a rebuild.

    Raises RuntimeError on go unavailability or build failure.
    """
    # Re-assert drift here too: this fn is lru_cached + reused by
    # _validate_with_binary; never build from a poisoned tree even if a caller
    # skipped the pre-check. _recompute_manifest is lru_cached so this is free.
    drift_err = _check_drift()
    if drift_err:
        raise RuntimeError(drift_err)

    manifest_sha = hashlib.sha256(MANIFEST_PATH.read_bytes()).hexdigest()
    cache_dir = Path(tempfile.gettempdir()) / "assets-produce-mss-validate" / manifest_sha
    cache_dir.mkdir(parents=True, exist_ok=True)
    bin_path = cache_dir / "mss"

    if bin_path.exists():
        return bin_path

    # Find go
    go_exe = os.environ.get("GO_BINARY", "go")
    try:
        ver = subprocess.run(
            [go_exe, "version"],
            capture_output=True, text=True, timeout=10,
        )
        if ver.returncode != 0:
            raise RuntimeError(f"go version check failed: {ver.stderr.strip()}")
    except FileNotFoundError:
        raise RuntimeError(
            "go binary not found. Install Go >= 1.23.4 to use mss-validate in non-mock mode."
        )

    result = subprocess.run(
        [go_exe, "build", "-o", str(bin_path), "./cmd/mss"],
        cwd=str(VENDOR_DIR),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"go build failed (exit {result.returncode}):\n{result.stderr.strip()}"
        )
    return bin_path


def _validate_with_binary(target: Path) -> tuple[str, list[str], str]:
    """Run `mss validate <target>` and translate to (verdict, errors, raw).

    verdict is "PASS" or "FAIL".  errors is a list of non-empty diagnostic lines.
    raw is the combined stdout+stderr text from the subprocess.
    Raises RuntimeError on spawn failure (distinct from a FAIL verdict).
    """
    bin_path = _build_cache_bin()
    try:
        proc = subprocess.run(
            [str(bin_path), "validate", str(target)],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        raise RuntimeError(f"mss subprocess failed: {e}") from e

    # raw preserves natural stdout-then-stderr order for the caller's record.
    raw = (proc.stdout or "") + (proc.stderr or "")

    if proc.returncode == 0:
        return "PASS", [], raw

    # FAIL: errors deliberately leads with stderr (diagnostics first), since
    # validate writes its plain-text diagnostic to stderr.
    all_lines = (proc.stderr + "\n" + proc.stdout).splitlines()
    errors = [line.strip() for line in all_lines if line.strip()]
    return "FAIL", errors, raw


def _emit_error(code: str, message: str) -> None:
    print(json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def _run_json_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mss-validate")
    parser.add_argument("--input", default="-")
    parser.add_argument("--mock", action="store_true")
    args = parser.parse_args(argv)

    if args.input in ("-", None):
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
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        _emit_error("INVALID_INPUT", f"invalid JSON: {e}")
        return 2

    if not isinstance(payload, dict):
        _emit_error("INVALID_INPUT", f"input JSON must be an object, got {type(payload).__name__}")
        return 2

    mock = args.mock or bool(payload.get("mock", False))

    if payload.get("dryRun"):
        print(json.dumps({
            "dryRun": True,
            "tool": "mss-validate",
            "input": payload,
        }, ensure_ascii=False))
        return 0

    script_path: str | None = payload.get("script_path")
    content: str | None = payload.get("content")

    if not script_path and not content:
        _emit_error("INVALID_INPUT", "input must contain 'script_path' or 'content'")
        return 2

    # -------------------------------------------------------------------------
    # Mock branch — hermetic, no Go/subprocess/vendored-tree access
    # -------------------------------------------------------------------------
    if mock:
        is_fail = (
            (content is not None and "__MSS_MOCK_FAIL__" in content)
            or (script_path is not None and script_path.endswith("__MSS_MOCK_FAIL__"))
        )
        if is_fail:
            result = {
                "verdict": "FAIL",
                "errors": ["mock: injected failure"],
                "raw": "mock: injected failure\n",
                "meta": {"atomic_tool": "mss-validate", "mock": True},
            }
        else:
            result = {
                "verdict": "PASS",
                "errors": [],
                "meta": {"atomic_tool": "mss-validate", "mock": True},
            }
        print(json.dumps(result, ensure_ascii=False))
        return 0

    # -------------------------------------------------------------------------
    # Non-mock branch
    # -------------------------------------------------------------------------
    # 1. Drift guard (must happen before any build or validate)
    try:
        drift_err = _check_drift()
    except Exception as e:
        _emit_error("ATOMIC_TOOL_FAILED", f"manifest check error: {e}")
        return 4
    if drift_err:
        _emit_error("ATOMIC_TOOL_FAILED", drift_err)
        return 4

    # 2. Resolve target file
    tmp_file: Path | None = None
    try:
        if content is not None:
            fd, tmp_name = tempfile.mkstemp(suffix=".md", prefix="mss_validate_")
            os.close(fd)
            tmp_file = Path(tmp_name)
            tmp_file.write_text(content, encoding="utf-8")
            target = tmp_file
        else:
            target = Path(script_path)  # type: ignore[arg-type]
            if not target.exists():
                _emit_error("INVALID_INPUT", f"script_path does not exist: {target}")
                return 2
            if not target.is_file():
                _emit_error("INVALID_INPUT", f"script_path is not a regular file: {target}")
                return 2
            if not os.access(target, os.R_OK):
                _emit_error("INVALID_INPUT", f"script_path is not readable: {target}")
                return 2

        # 3. Build binary (cached)
        try:
            _ = _build_cache_bin()
        except RuntimeError as e:
            _emit_error("ATOMIC_TOOL_FAILED", str(e))
            return 4

        # 4 + 5. Run and translate
        try:
            verdict, errors, raw = _validate_with_binary(target)
        except RuntimeError as e:
            _emit_error("ATOMIC_TOOL_FAILED", str(e))
            return 4

    finally:
        if tmp_file is not None:
            tmp_file.unlink(missing_ok=True)

    if verdict == "PASS":
        result = {
            "verdict": "PASS",
            "errors": [],
            "meta": {"atomic_tool": "mss-validate", "mock": False},
        }
    else:
        result = {
            "verdict": "FAIL",
            "errors": errors,
            "raw": raw,
            "meta": {"atomic_tool": "mss-validate", "mock": False},
        }

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(_run_json_main())
    except SystemExit:
        raise
    except BaseException as e:  # last-resort INTERNAL envelope
        _emit_error("INTERNAL", f"{type(e).__name__}: {e}")
        raise SystemExit(1)
