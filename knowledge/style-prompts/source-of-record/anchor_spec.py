#!/usr/bin/env python3
"""Build anchor_tasks.json from a book's locked canonical wardrobes.

Output schema (compatible with asset-renderer's tasks_output.json structure;
embedded under top-level key `outfit_anchors`):

    {
      "outfit_anchors": [
        {
          "sprite_id": "anchor_selena_casual",
          "char_id": "selena",
          "outfit_id": "casual",
          "prompt": "...",
          "model": "nano-banana-pro",
          "reference_image_source": "dynamic_series_portrait"
        },
        ...
      ]
    }
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

sys.path.insert(0, str(
    pathlib.Path(__file__).resolve().parents[1] / "asset-prompt-generator"
))
sys.path.insert(0, str(
    pathlib.Path(__file__).resolve().parents[1] / "wardrobe-consolidator"
))
from canonical_wardrobe import load_bible_wardrobe  # noqa: E402
from frontmatter import is_locked, parse_frontmatter  # noqa: E402


ANCHOR_PROMPT_TEMPLATE = """\
Korean manhwa illustration, full-body character portrait, neutral standing
pose. Single character on solid chroma green background (#00B140), no shadow
on background.

CHARACTER LOCK (face + body — must match reference):
{char_visual_summary}

OUTFIT (verbatim, do not paraphrase):
{outfit_text}

POSE LOCK (all four dimensions must be neutral):
- face: 面无表情 (neutral expression)
- gaze: 看向镜头 (looking at camera)
- body: 身体直立,正面朝镜头 (upright, facing camera)
- hands: 双手垂落体侧 (hands relaxed at sides)

FRAMING: 9:16 vertical canvas, character occupies center 60% of frame, head
6% from top, feet 4% from bottom. Clean ink outlines, flat color fills, no
photorealism, no 3D rendering, no text labels.

CONTRACT: This image is a wardrobe anchor — downstream sprites will reference
it for visual consistency of the outfit details. Render the outfit fabric,
fit, color saturation, and accessory placement crisply.
"""


def anchor_id(char_id: str, outfit_id: str) -> str:
    """Stable identifier for an anchor PNG."""
    return f"anchor_{char_id}_{outfit_id}"


def build_anchor_prompt(
    *,
    char_id: str,
    outfit_text: str,
    char_visual_summary: str,
) -> str:
    return ANCHOR_PROMPT_TEMPLATE.format(
        char_visual_summary=char_visual_summary.strip() or "(see reference)",
        outfit_text=outfit_text.strip(),
    )


def build_anchor_tasks(
    declared: dict[str, list[tuple[str, str]]],
    char_visuals: dict[str, str],
) -> list[dict]:
    """Return list of anchor task dicts, one per (char, outfit_id)."""
    tasks: list[dict] = []
    for char_id, rows in sorted(declared.items()):
        if char_id not in char_visuals:
            continue
        for outfit_id, outfit_text in rows:
            tasks.append({
                "sprite_id": anchor_id(char_id, outfit_id),
                "char_id": char_id,
                "outfit_id": outfit_id,
                "outfit_text": outfit_text,
                "prompt": build_anchor_prompt(
                    char_id=char_id,
                    outfit_text=outfit_text,
                    char_visual_summary=char_visuals[char_id],
                ),
                "model": "nano-banana-pro",
                "reference_image_source": "dynamic_series_portrait",
            })
    return tasks


def extract_visual_summary_from_bible(bible_md: str) -> str:
    """Pull the first '外形:' line from a bible, capped at 300 chars.

    Falls back to the first 300 chars after the title if no explicit signal.
    """
    m = re.search(r"外形[:：]\s*([^\n]+(?:\n[^#\n]+)*)", bible_md)
    if m:
        return m.group(1).strip()[:300]
    return bible_md[:300]


SUPPORTING_PLACEHOLDER = "(see reference character_card image — face/body must match)"


def collect_supporting_cast_visuals(supporting_md: str) -> dict[str, str]:
    """Parse '## Canonical Wardrobe — Supporting Cast' for '### <char>' headers.

    Each supporting char gets a placeholder visual summary; the real identity
    comes from the dynamic_series_portrait reference image at render time.
    """
    section = re.search(
        r"##\s+Canonical Wardrobe.*?Supporting Cast.*?\n(.+?)(?=\n##\s[^#]|\Z)",
        supporting_md,
        re.DOTALL,
    )
    if not section:
        return {}
    chars: dict[str, str] = {}
    for line in section.group(1).splitlines():
        m = re.match(r"^###\s+([a-z][a-z0-9_]*)\s*$", line)
        if m:
            chars[m.group(1)] = SUPPORTING_PLACEHOLDER
    return chars


def cmd_build(args, project_root: pathlib.Path) -> int:
    bible_dir = project_root / f"lunascripts/{args.book}/02-character-architect"

    # Lock validation: every bible must be locked
    unlocked: list[str] = []
    char_visuals: dict[str, str] = {}
    supporting_path = bible_dir / "supporting-cast-filter.md"
    for bible_file in sorted(bible_dir.glob("*.md")):
        text = bible_file.read_text()
        fm, body = parse_frontmatter(text)
        char = fm.get("char")
        if char:
            if not is_locked(fm, body):
                unlocked.append(bible_file.name)
                continue
            char_visuals[char] = extract_visual_summary_from_bible(body)
            continue
        # Supporting-cast file: file_kind == 'supporting-cast'
        if fm.get("file_kind") == "supporting-cast":
            if not is_locked(fm, body):
                unlocked.append(bible_file.name)
                continue
            for sc_char, summary in collect_supporting_cast_visuals(body).items():
                # Don't overwrite a richer main-bible summary
                char_visuals.setdefault(sc_char, summary)

    if unlocked:
        sys.stderr.write(
            "REFUSED: the following bibles are not locked (run 5.5 first):\n"
        )
        for name in unlocked:
            sys.stderr.write(f"  - {name}\n")
        return 1

    wardrobe = load_bible_wardrobe(project_root, args.book)
    declared: dict[str, list[tuple[str, str]]] = {}
    for entry in wardrobe:
        declared.setdefault(entry.char, []).append((entry.id, entry.text))

    tasks = build_anchor_tasks(declared, char_visuals)

    out_dir = project_root / f"lunascripts/{args.book}/02.5-outfit-anchor"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "anchor_tasks.json"
    out_path.write_text(json.dumps({"outfit_anchors": tasks}, ensure_ascii=False, indent=2))

    sys.stderr.write(f"  -> {out_path.relative_to(project_root)}\n")
    sys.stderr.write(f"  {len(tasks)} anchor task(s) for {len(char_visuals)} char(s)\n")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--book", required=True)
    args = ap.parse_args()
    project_root = pathlib.Path(__file__).resolve().parents[2]
    return cmd_build(args, project_root)


if __name__ == "__main__":
    raise SystemExit(main())
