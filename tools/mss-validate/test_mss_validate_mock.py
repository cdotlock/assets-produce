"""
Hermetic tests for mss_validate.py — MUST pass on plain python3 with NO external packages.

Run:  python3 -m pytest tools/mss-validate/test_mss_validate_mock.py -v
      (or:  cd tools/mss-validate && python3 -m pytest test_mss_validate_mock.py -v)
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
BRIDGE = TOOL_DIR / "mss_validate.py"
MANIFEST = TOOL_DIR / "FROZEN_MANIFEST.sha256"


def _load_module():
    spec = importlib.util.spec_from_file_location("mss_validate", BRIDGE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(stdin: str, args: list | None = None, extra_env: dict | None = None) -> subprocess.CompletedProcess:
    argv = args if args is not None else ["--input", "-"]
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        [sys.executable, str(BRIDGE), *argv],
        input=stdin,
        capture_output=True,
        text=True,
        env=env,
    )


# ---------------------------------------------------------------------------
# Test 8 — module imports cleanly (sanity)
# ---------------------------------------------------------------------------

def test_module_imports_cleanly():
    mod = _load_module()
    for fn in ("_emit_error", "_run_json_main", "_recompute_manifest", "_build_cache_bin"):
        assert hasattr(mod, fn), f"module missing expected symbol: {fn}"


# ---------------------------------------------------------------------------
# Test 1 — --mock normal input -> PASS verdict, exit 0
# ---------------------------------------------------------------------------

def test_mock_normal_returns_pass():
    payload = json.dumps({"script_path": "/tmp/episode.md", "mock": True})
    p = _run(payload)
    assert p.returncode == 0, f"expected exit 0, got {p.returncode}; stderr={p.stderr!r}"
    assert p.stdout.strip() != "", "stdout must not be empty"
    out = json.loads(p.stdout)
    assert out["verdict"] == "PASS"
    assert out["errors"] == []
    assert out["meta"]["atomic_tool"] == "mss-validate"
    assert out["meta"]["mock"] is True


# ---------------------------------------------------------------------------
# Test 2 — --mock with __MSS_MOCK_FAIL__ sentinel -> FAIL verdict, exit 0
# ---------------------------------------------------------------------------

def test_mock_sentinel_content_returns_fail():
    payload = json.dumps({"content": "__MSS_MOCK_FAIL__", "mock": True})
    p = _run(payload)
    assert p.returncode == 0, f"expected exit 0 (FAIL is a verdict, not an error), stderr={p.stderr!r}"
    out = json.loads(p.stdout)
    assert out["verdict"] == "FAIL"
    assert len(out["errors"]) > 0, "errors list must be non-empty for FAIL verdict"
    assert "raw" in out
    assert out["meta"]["mock"] is True


def test_mock_sentinel_in_script_path_returns_fail():
    payload = json.dumps({"script_path": "/tmp/__MSS_MOCK_FAIL__", "mock": True})
    p = _run(payload)
    assert p.returncode == 0
    out = json.loads(p.stdout)
    assert out["verdict"] == "FAIL"
    assert len(out["errors"]) > 0


def test_mock_flag_cli_arg_with_sentinel():
    """--mock flag on CLI plus sentinel in content -> FAIL, exit 0."""
    payload = json.dumps({"content": "some __MSS_MOCK_FAIL__ text"})
    p = _run(payload, args=["--mock", "--input", "-"])
    assert p.returncode == 0
    out = json.loads(p.stdout)
    assert out["verdict"] == "FAIL"


# ---------------------------------------------------------------------------
# Test 3 — drift tamper via env override -> ATOMIC_TOOL_FAILED, exit 4
# ---------------------------------------------------------------------------

def test_drift_guard_fires_on_tampered_expected_manifest(tmp_path):
    """Prove the drift guard fires WITHOUT touching the real vendored tree.

    We point the bridge at a tampered manifest via an env override, so the
    committed-side differs from the real tree. The real moonshort-script/**
    and FROZEN_MANIFEST.sha256 are NEVER modified.
    """
    # Build a tampered version of the manifest (flip first char of first sha)
    real_text = MANIFEST.read_text()
    first_line, rest = real_text.split("\n", 1)
    sha_part, path_part = first_line.split("  ", 1)
    flipped_sha = ("0" if sha_part[0] != "0" else "1") + sha_part[1:]
    tampered = f"{flipped_sha}  {path_part}\n{rest}"
    tampered_path = tmp_path / "TAMPERED.sha256"
    tampered_path.write_text(tampered)

    payload = json.dumps({"content": "some script"})
    p = _run(payload, extra_env={"_MSS_VALIDATE_MANIFEST_OVERRIDE": str(tampered_path)})

    assert p.returncode != 0, f"drift must cause non-zero exit; got {p.returncode}; stdout={p.stdout!r}"
    assert p.stdout.strip() == "", f"stdout must be empty on drift; got: {p.stdout!r}"
    err = json.loads(p.stderr)
    assert err["error"]["code"] == "ATOMIC_TOOL_FAILED"
    assert "drift" in err["error"]["message"].lower()

    # Verify the real committed tree and manifest are byte-unchanged
    mod = _load_module()
    mod._recompute_manifest.cache_clear()
    real_recomputed = mod._recompute_manifest()
    assert real_recomputed == MANIFEST.read_text(), "real vendored tree must still match committed manifest"


# ---------------------------------------------------------------------------
# Test 4 — malformed stdin -> exit 2, INVALID_INPUT envelope
# ---------------------------------------------------------------------------

def test_malformed_json_stdin_returns_invalid_input():
    p = _run("not json{")
    assert p.returncode == 2, f"expected exit 2, got {p.returncode}"
    assert p.stdout.strip() == "", f"stdout must be empty; got: {p.stdout!r}"
    err = json.loads(p.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"


# ---------------------------------------------------------------------------
# Test 5 — non-object JSON -> exit 2 + INVALID_INPUT
# ---------------------------------------------------------------------------

def test_non_object_json_returns_invalid_input():
    for body in ("42", '"hello"', "[1, 2]", "null"):
        p = _run(body)
        assert p.returncode == 2, f"body={body!r} expected exit 2, got {p.returncode}"
        assert p.stdout.strip() == "", f"stdout must be empty for body={body!r}"
        err = json.loads(p.stderr)
        assert err["error"]["code"] == "INVALID_INPUT", f"body={body!r}"


# ---------------------------------------------------------------------------
# Test 6 — non-mock, non-existent script_path -> operational error (not a verdict)
# ---------------------------------------------------------------------------

def test_nonexistent_script_path_returns_operational_error():
    payload = json.dumps({"script_path": "/tmp/__nonexistent_path_99999__.md"})
    p = _run(payload)
    # Must be non-zero
    assert p.returncode != 0, f"expected non-zero exit; got {p.returncode}; stdout={p.stdout!r}"
    assert p.stdout.strip() == "", f"stdout must be empty; got: {p.stdout!r}"
    err = json.loads(p.stderr)
    assert "error" in err, "stderr must contain error envelope"
    # Must NOT produce a verdict
    assert "verdict" not in str(p.stdout)


# ---------------------------------------------------------------------------
# Test 7 — dryRun:true -> echoes input, exit 0, no verdict key
# ---------------------------------------------------------------------------

def test_dryrun_echoes_input_no_verdict():
    payload_dict = {"script_path": "/tmp/test.md", "dryRun": True}
    p = _run(json.dumps(payload_dict))
    assert p.returncode == 0, f"dryRun must exit 0; stderr={p.stderr!r}"
    out = json.loads(p.stdout)
    assert out.get("dryRun") is True
    assert "verdict" not in out
    assert out["input"]["script_path"] == "/tmp/test.md"


# ---------------------------------------------------------------------------
# Additional: neither script_path nor content -> exit 2, INVALID_INPUT
# ---------------------------------------------------------------------------

def test_missing_input_fields_returns_invalid_input():
    payload = json.dumps({"mock": True})  # no script_path, no content
    p = _run(payload)
    assert p.returncode == 2
    assert p.stdout.strip() == ""
    err = json.loads(p.stderr)
    assert err["error"]["code"] == "INVALID_INPUT"
