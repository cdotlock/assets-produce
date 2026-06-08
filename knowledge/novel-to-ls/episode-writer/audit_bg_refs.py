#!/usr/bin/env python3
"""audit_bg_refs.py — Layer B: audit @bg/@cg references against 04/locations.json.

For every `@bg set X` / `@cg show X` in an episode FINAL markdown, verify X
is a known sub_location in 04/locations.json. For unknown X, ask Haiku-4.5
(via Zenmux, same client as llm_clothing_audit) to classify into:

    TYPO            — typo of an existing sub_location
                      → suggest the correct ID
    VARIANT         — same parent location with time/lighting variant
                      → suggest add_location_to_04 with --parent-id matching
                        the existing parent
    GENUINELY_NEW   — brand-new location not in 04
                      → suggest add_location_to_04 with new parent_id

ALL three classes hard-fail (exit 1) — TYPO needs renaming the script,
VARIANT/GENUINELY_NEW need registering the location in 04 and re-running 06.

Usage:
    python3 skills/episode-writer/audit_bg_refs.py \\
      --slug new-no-rules-in-bad-ideas \\
      --episode lunascripts/<slug>/05-episode-writer/scripts/ep_1_final.md

    # All EN episodes:
    python3 skills/episode-writer/audit_bg_refs.py --slug <slug>
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

# Reuse the existing OpenAI-compatible LLM client from llm_clothing_audit.py.
# That module was migrated 2026-05-09 from zenmux → mob-ai; we inherit the
# same defaults and key resolution.
SKILL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL_ROOT / "asset-prompt-generator"))
from llm_clothing_audit import (  # type: ignore  # noqa: E402
    DEFAULT_TEMPERATURE,
    call_zenmux,
    resolve_api_key,
)

# mob-ai has no haiku tier; closest cheap option is the :free sonnet variant.
# Override via AUDIT_BG_MODEL env var if needed.
DEFAULT_MODEL = os.environ.get("AUDIT_BG_MODEL", "claude-sonnet-4-6:free")
DEFAULT_BASE_URL = (
    os.environ.get("LLM_BASE_URL")
    or os.environ.get("MOB_AI_BASE_URL")
    or os.environ.get("ZENMUX_BASE_URL")
    or "https://ai.mob-ai.cn/v1"
)

BG_RE = re.compile(r"^\s*@bg\s+set\s+(\S+)", re.MULTILINE)
CG_RE = re.compile(r"^\s*@cg\s+show\s+(\S+)", re.MULTILINE)
COMMENT_LINE_RE = re.compile(r"^\s*//")


# ───────── data classes ─────────

@dataclass
class Finding:
    ref_id: str
    ref_kind: str  # "@bg" | "@cg"
    classification: str  # "TYPO" | "VARIANT" | "GENUINELY_NEW"
    suggested_canonical: str | None
    reason: str


@dataclass
class AuditReport:
    findings: list[Finding] = field(default_factory=list)
    refs_total: int = 0
    refs_known: int = 0

    @property
    def ok(self) -> bool:
        return not self.findings


# ───────── pure helpers ─────────

def extract_bg_refs(episode_path: Path) -> set[tuple[str, str]]:
    """Extract {(ref_id, kind)} from an episode markdown.

    kind ∈ {"@bg", "@cg"}. Skips lines that are markdown comments (// ...).
    """
    out: set[tuple[str, str]] = set()
    for raw in episode_path.read_text().splitlines():
        if COMMENT_LINE_RE.match(raw):
            continue
        for m in BG_RE.finditer(raw):
            out.add((m.group(1).strip(), "@bg"))
        for m in CG_RE.finditer(raw):
            out.add((m.group(1).strip(), "@cg"))
    return out


def classify_known(ref_id: str, canonical_set: set[str]) -> str | None:
    """Return 'KNOWN' if ref_id (case-insensitive, trimmed) ∈ canonical_set."""
    norm = ref_id.strip().lower()
    norm_set = {c.strip().lower() for c in canonical_set}
    return "KNOWN" if norm in norm_set else None


# ───────── LLM classifier ─────────

CLASSIFY_SYS_PROMPT = """You classify novel-script bg/cg references against a known location dictionary.

Output STRICT JSON: {"classification": "TYPO|VARIANT|GENUINELY_NEW",
                    "suggested_canonical": "<sub_location_id_or_null>",
                    "reason": "<one short sentence>"}

Definitions:
- TYPO: ref is a typo of EXACTLY ONE entry in the dictionary (e.g. selena_hosue → selena_house).
- VARIANT: ref is the same physical location as one in the dictionary, differing by time/light/weather (e.g. selena_house_porch_late_dusk vs selena_house_porch). suggested_canonical = the parent dictionary entry ID.
- GENUINELY_NEW: ref is a location concept absent from the dictionary entirely. suggested_canonical = null.

If ambiguous between TYPO and VARIANT, pick VARIANT.
Output ONLY JSON. No markdown fences. No prose before/after."""


def _strip_json_fence(text: str) -> str:
    """LLMs sometimes wrap in ```json ... ```. Strip it."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    i = text.find("{")
    j = text.rfind("}")
    if i >= 0 and j > i:
        text = text[i : j + 1]
    return text


def classify_via_llm(
    *,
    ref_id: str,
    canonical_set: set[str],
    llm_fn: Callable[[str, str], str],
) -> Finding:
    """Ask LLM to classify a single unknown ref. llm_fn(system, user) → response str.

    Returns a Finding (classification ∈ TYPO/VARIANT/GENUINELY_NEW).
    """
    sorted_set = sorted(canonical_set)
    user = (
        f"Known sub_locations: {sorted_set}\n"
        f"Unknown ref: {ref_id!r}\n"
        f"Classify."
    )
    raw = llm_fn(CLASSIFY_SYS_PROMPT, user)
    cleaned = _strip_json_fence(raw)
    try:
        d = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"LLM returned non-JSON for ref {ref_id!r}: {raw[:200]}"
        ) from e

    cls = d.get("classification")
    if cls not in {"TYPO", "VARIANT", "GENUINELY_NEW"}:
        raise RuntimeError(f"LLM returned bad classification for {ref_id!r}: {d}")

    return Finding(
        ref_id=ref_id,
        ref_kind="",  # caller fills in
        classification=cls,
        suggested_canonical=d.get("suggested_canonical"),
        reason=d.get("reason", ""),
    )


def _make_zenmux_llm_fn(api_key: str, model: str) -> Callable[[str, str], str]:
    """Build a closure over zenmux client config that takes (sys, user) → response."""
    def _call(system: str, user: str) -> str:
        return call_zenmux(
            api_key=api_key,
            base_url=DEFAULT_BASE_URL,
            model=model,
            system_prompt=system,
            user_prompt=user,
            temperature=DEFAULT_TEMPERATURE,
        )
    return _call


# ───────── audit top-level ─────────

def audit(
    *,
    episode_path: Path,
    locations: set[str],
    llm_fn: Callable[[str, str], str],
) -> AuditReport:
    """Audit one episode markdown against known sub_location set."""
    refs = extract_bg_refs(episode_path)
    report = AuditReport(refs_total=len(refs))

    for ref_id, kind in sorted(refs):
        if classify_known(ref_id, locations) == "KNOWN":
            report.refs_known += 1
            continue
        finding = classify_via_llm(
            ref_id=ref_id, canonical_set=locations, llm_fn=llm_fn,
        )
        finding.ref_kind = kind
        report.findings.append(finding)

    return report


# ───────── CLI ─────────

def _load_zenmux_env() -> str:
    """Load LLM API key from lunaverse-backend/.env or local .env.

    Function name retained for backwards-compat with existing callers, but
    semantics now match the project priority:
    LLM_API_KEY > MOB_AI_API_KEY > ZENMUX_API_KEY.
    """
    keys = ("LLM_API_KEY", "MOB_AI_API_KEY", "ZENMUX_API_KEY")
    candidates = [
        Path(os.environ.get("HOME", "/")) / "MobAI/lunaverse-backend/.env",
        Path(".env"),
    ]
    found: dict[str, str] = {}
    for envp in candidates:
        if not envp.exists():
            continue
        for raw in envp.read_text().splitlines():
            for k in keys:
                prefix = f"{k}="
                if raw.startswith(prefix) and k not in found:
                    found[k] = raw.split("=", 1)[1].strip().strip('"').strip("'")
    for k in keys:
        if found.get(k):
            return found[k]
        if os.environ.get(k):
            return os.environ[k]
    raise RuntimeError(
        "No LLM API key found. Set one of LLM_API_KEY, MOB_AI_API_KEY, "
        "ZENMUX_API_KEY in env or lunaverse-backend/.env"
    )


def _format_report_md(reports: dict[str, AuditReport]) -> str:
    lines = ["# Layer B audit_bg_refs report\n"]
    total_findings = sum(len(r.findings) for r in reports.values())
    lines.append(f"- episodes audited: {len(reports)}")
    lines.append(f"- total refs: {sum(r.refs_total for r in reports.values())}")
    lines.append(f"- known: {sum(r.refs_known for r in reports.values())}")
    lines.append(f"- findings (must fix): {total_findings}\n")
    if total_findings == 0:
        lines.append("✅ All references resolved against 04/locations.json.")
        return "\n".join(lines)
    for ep, r in sorted(reports.items()):
        if not r.findings:
            continue
        lines.append(f"\n## {ep}\n")
        for f in r.findings:
            lines.append(f"- **{f.classification}** `{f.ref_kind} {f.ref_id}` — {f.reason}")
            if f.classification == "TYPO":
                lines.append(f"  - 改成: `{f.suggested_canonical}`")
            elif f.classification == "VARIANT":
                lines.append(
                    f"  - 注册成 parent `{f.suggested_canonical}` 的子变体:\n"
                    f"    ```\n"
                    f"    python3 _local_tools/add_location_to_04.py \\\n"
                    f"      --slug <slug> --parent-id {f.suggested_canonical} \\\n"
                    f"      --sub-id {f.ref_id} --description \"<描述>\"\n"
                    f"    ```"
                )
            else:  # GENUINELY_NEW
                lines.append(
                    f"  - 新场景,需要选 parent_id:\n"
                    f"    ```\n"
                    f"    python3 _local_tools/add_location_to_04.py \\\n"
                    f"      --slug <slug> --parent-id <pick_parent> [--parent-name \"...\"] \\\n"
                    f"      --sub-id {f.ref_id} --description \"<描述>\"\n"
                    f"    ```"
                )
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--slug", required=True)
    ap.add_argument("--episode", type=Path,
                    help="Single episode file. If omitted, audits all "
                         "ep_*_final.md under 05-episode-writer/scripts/")
    ap.add_argument("--root", type=Path, default=Path("lunascripts"))
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--report-out", type=Path,
                    help="Where to write audit_report.md. Default: under "
                         "05-episode-writer/audit_report.md")
    args = ap.parse_args()

    book = args.root / args.slug
    locs_path = book / "04-entity-normalizer" / "locations.json"
    if not locs_path.is_file():
        print(f"✗ {locs_path} not found", file=sys.stderr)
        return 2
    locs_data = json.loads(locs_path.read_text())
    locations: set[str] = set()
    for parent in (locs_data.get("locations") or {}).values():
        locations.update((parent.get("sub_locations") or {}).keys())

    if args.episode:
        episodes = [args.episode]
    else:
        scripts_dir = book / "05-episode-writer" / "scripts"
        episodes = sorted(scripts_dir.glob("ep_*_final.md"))
        episodes = [e for e in episodes if not e.name.endswith(".zh.md")]

    api_key = _load_zenmux_env()
    llm_fn = _make_zenmux_llm_fn(api_key, args.model)

    reports: dict[str, AuditReport] = {}
    for ep in episodes:
        print(f"[audit_bg_refs] {ep.name} …", file=sys.stderr)
        reports[ep.name] = audit(
            episode_path=ep, locations=locations, llm_fn=llm_fn,
        )

    out_path = args.report_out or (book / "05-episode-writer" / "audit_report.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(_format_report_md(reports))
    print(f"[audit_bg_refs] report → {out_path}", file=sys.stderr)

    n_findings = sum(len(r.findings) for r in reports.values())
    if n_findings > 0:
        print(f"\n✗ {n_findings} findings — see report", file=sys.stderr)
        return 1
    print("\n✓ all refs resolved", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
