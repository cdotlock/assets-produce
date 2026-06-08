#!/usr/bin/env python3
"""look_audit.py — heuristic-only "should I cut this @<char> look?" lint pass.

Runs the 2-question rule (Q1=new body action, Q2=A→B emotion) on a written
.md episode and flags look directives that look LIKE Q1=no AND Q2=no based on
local context. Cheap regex heuristics, NOT an LLM. False positives are the
point — you eyeball the report and decide. Output is a sorted table with
confidence H/M/L + reason; nothing is auto-edited.

Heuristics fired (all are CUT-candidate flags):
  H  REDUNDANT_AFTER_SHOW   look fires <=2 non-dialogue lines after show
  H  STATIC_RECYCLE         same static-class token reused for same char,
                            no body action / new emotion in between
  M  CONFIRMATION_ONLY      only "Yeah." / "Yes." / "Of course." style
                            dialogue follows before next look
  M  STATIC_AFTER_STATIC    static-class look after another static-class
                            look, no narrator action between
  L  ECHO_PAIR              two look directives for same char with <=1
                            non-speaking line between (often the second
                            wins; first can drop)

Usage:
    python3 skills/episode-writer/look_audit.py <episode.md>
    python3 skills/episode-writer/look_audit.py <episode.md> --json
    python3 skills/episode-writer/look_audit.py <episode.md> --html out.html
    python3 skills/episode-writer/look_audit.py --html-dir reports/ <ep1.md> <ep2.md> ...
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
from dataclasses import dataclass, field

LOOK_RE = re.compile(r"^@(?P<char>[a-z_]+)\s+(?P<verb>look|show)\s+(?P<token>\S+)")
DIALOGUE_RE = re.compile(r"^([A-Z][A-Z_ ]*?)(?:\s*\[[^\]]+\])?:\s*(.*)$")
NARRATOR_RE = re.compile(r"^(NARRATOR|YOU)\s*:")

# tokens that describe "holding still / breathing / steady gaze" — the
# micro-expression class. recycling these is the most common over-write.
STATIC_PATTERNS = [
    r"breath", r"steady", r"quiet", r"calm", r"still",
    r"chin_steady", r"gaze_steady", r"one_blink",
]
STATIC_RE = re.compile("|".join(STATIC_PATTERNS))

CONFIRMATION_LINES = {
    "yeah", "yeah.", "yes", "yes.", "no.", "of course.", "of course",
    "mm.", "mhm.", "ok.", "okay.", "right.", "sure.",
}

# MC for this novel — used to resolve YOU lines to the visible character.
# YOU's internal monologue makes the MC visible, not the most-recent-touched
# slot. The audit should match the engine's activeSpeaker logic in
# lunaverse-backend/app/(player)/play/[sessionId]/page.tsx.
MC_CHAR = "selena"

# verbs that can appear on a `@<char> ...` directive
LOOK_VERB_RE = re.compile(
    r"^@(?P<char>[a-z_]+)\s+(?P<verb>look|show|hide|move|bubble)\b"
    r"(?:\s+(?P<arg>\S+))?"
)
PAUSE_RE = re.compile(r"^@pause\b")


@dataclass
class LookHit:
    line: int
    char: str
    token: str
    confidence: str   # H / M / L
    reason: str
    raw: str


@dataclass
class CharState:
    last_look_line: int = -1
    last_look_token: str = ""
    last_show_line: int = -1
    intervening_speech_lines: int = 0
    intervening_action_lines: int = 0   # narrator + non-static = body cue
    confirmation_only: bool = True


def is_static(tok: str) -> bool:
    return bool(STATIC_RE.search(tok))


def classify_dialogue(text: str) -> bool:
    """Return True if line is a 'confirmation only' dialogue (no emotion shift)."""
    stripped = text.strip().lower()
    return stripped in CONFIRMATION_LINES


def classify_line(s: str) -> tuple[str, str | None, str | None]:
    """Classify a line for dead-look analysis.

    Returns (kind, char, token). kind ∈ {dialogue, you, narrator, pause,
    look, show, hide, move, bubble, other}.
    """
    m = LOOK_VERB_RE.match(s)
    if m:
        return (m.group("verb"), m.group("char"), m.group("arg"))
    if PAUSE_RE.match(s):
        return ("pause", None, None)
    if NARRATOR_RE.match(s):
        speaker = s.split(":", 1)[0].strip()
        if speaker == "YOU":
            return ("you", MC_CHAR, None)
        return ("narrator", None, None)
    d = DIALOGUE_RE.match(s)
    if d:
        sp = d.group(1).strip().lower().replace(" ", "_")
        return ("dialogue", sp, None)
    return ("other", None, None)


def find_dead_looks(lines: list[str]) -> list[tuple[int, str, str]]:
    """Return [(line_idx, char, token), ...] for `@<char> look` directives that
    will never be displayed under the engine's single-visible-slot rule.

    A look is "alive" if, between this directive and the next directive that
    overrides this slot (`@<char> look/show/hide`), there exists at least one
    rendered line where <char> is the active speaker:
      - dialogue line where speaker == <char>
      - YOU line where <char> is the MC
      - narrator/pause line where <char> is the most-recent-touched slot
    """
    classified = [classify_line(ln.strip()) for ln in lines]
    dead: list[tuple[int, str, str]] = []

    for i, (kind, ch, tok) in enumerate(classified):
        if kind != "look" or not ch or not tok:
            continue
        last_touched = ch  # this look just touched ch's slot
        alive = False
        for j in range(i + 1, len(classified)):
            jkind, jch, _ = classified[j]
            if jkind == "dialogue":
                if jch == ch:
                    alive = True
                    break
                # someone else speaks → ch invisible during their dialogue
            elif jkind == "you":
                if jch == ch:  # MC == ch
                    alive = True
                    break
            elif jkind in ("narrator", "pause"):
                if last_touched == ch:
                    alive = True
                    break
            elif jkind == "look":
                if jch == ch:
                    break  # overwritten without ever being shown
                last_touched = jch  # type: ignore[assignment]
            elif jkind == "show":
                if jch == ch:
                    break  # show resets this char
                last_touched = jch  # type: ignore[assignment]
            elif jkind == "hide":
                if jch == ch:
                    break  # ch leaves before being seen
        if not alive:
            dead.append((i + 1, ch, tok))
    return dead


def audit(path: pathlib.Path) -> list[LookHit]:
    lines = path.read_text().splitlines()
    state: dict[str, CharState] = {}
    hits: list[LookHit] = []

    # === DEAD_LOOK pass (highest priority — engine-level invisible) ===
    dead_lines: dict[int, tuple[str, str]] = {}
    for line_idx, ch, tok in find_dead_looks(lines):
        dead_lines[line_idx] = (ch, tok)
        hits.append(LookHit(
            line=line_idx, char=ch, token=tok,
            confidence="H",
            reason=(f"DEAD_LOOK: 该 @{ch} look 永远不会显示——"
                    f"在它和下一次 {ch} look/hide 之间，"
                    f"{ch} 既没说话也不是 narrator 期间的最近触碰槽"),
            raw=f"@{ch} look {tok}",
        ))

    for idx, raw in enumerate(lines, start=1):
        s = raw.strip()
        m = LOOK_RE.match(s)
        if m:
            char = m.group("char")
            verb = m.group("verb")
            tok = m.group("token")
            cs = state.setdefault(char, CharState())

            if verb == "show":
                cs.last_show_line = idx
                cs.last_look_line = idx
                cs.last_look_token = tok
                cs.intervening_speech_lines = 0
                cs.intervening_action_lines = 0
                cs.confirmation_only = True
                continue

            # verb == "look"
            # Skip secondary heuristics if this line is already DEAD_LOOK —
            # one strong reason is enough; avoid noise.
            if idx in dead_lines:
                cs.last_look_line = idx
                cs.last_look_token = tok
                cs.intervening_speech_lines = 0
                cs.intervening_action_lines = 0
                cs.confirmation_only = True
                continue

            reasons: list[tuple[str, str, str]] = []   # (conf, code, msg)

            # H — REDUNDANT_AFTER_SHOW
            if cs.last_show_line > 0 and (idx - cs.last_show_line) <= 4:
                if cs.intervening_action_lines == 0:
                    reasons.append((
                        "H", "REDUNDANT_AFTER_SHOW",
                        f"刚 show 完 {idx - cs.last_show_line} 行就切；"
                        f"立绘还在入场 pose 上",
                    ))

            # H — STATIC_RECYCLE: same token already on screen
            if tok == cs.last_look_token and cs.last_look_line > 0:
                reasons.append((
                    "H", "STATIC_RECYCLE",
                    f"同一 token 在 L{cs.last_look_line} 已经用过",
                ))

            # M — STATIC_AFTER_STATIC
            elif (
                is_static(tok)
                and is_static(cs.last_look_token)
                and cs.intervening_action_lines == 0
            ):
                reasons.append((
                    "M", "STATIC_AFTER_STATIC",
                    f"静态 '{tok}' 接静态 '{cs.last_look_token}'，"
                    f"中间没有身体动作",
                ))

            # M — CONFIRMATION_ONLY
            if (
                is_static(tok)
                and cs.confirmation_only
                and cs.intervening_speech_lines > 0
                and cs.intervening_action_lines == 0
            ):
                reasons.append((
                    "M", "CONFIRMATION_ONLY",
                    "前面只有 Yeah/Yes 类确认对白，没情绪推进",
                ))

            # L — ECHO_PAIR
            if (
                cs.last_look_line > 0
                and (idx - cs.last_look_line) <= 3
                and cs.intervening_speech_lines == 0
                and cs.intervening_action_lines == 0
            ):
                reasons.append((
                    "L", "ECHO_PAIR",
                    f"上一个 look 在 L{cs.last_look_line}，中间什么都没发生",
                ))

            if reasons:
                # take strongest
                conf_order = {"H": 3, "M": 2, "L": 1}
                conf, code, msg = max(reasons, key=lambda r: conf_order[r[0]])
                hits.append(LookHit(
                    line=idx, char=char, token=tok,
                    confidence=conf, reason=f"{code}: {msg}", raw=s,
                ))

            # update state
            cs.last_look_line = idx
            cs.last_look_token = tok
            cs.intervening_speech_lines = 0
            cs.intervening_action_lines = 0
            cs.confirmation_only = True
            continue

        # not a look/show line. update intervening counts for every char.
        d = DIALOGUE_RE.match(s)
        is_narrator = bool(NARRATOR_RE.match(s))

        if is_narrator and s:
            # narrator descriptions of body action — break static chain
            for cs in state.values():
                cs.intervening_action_lines += 1
                cs.confirmation_only = False
        elif d:
            speaker = d.group(1).strip().lower().replace(" ", "_")
            text = d.group(2)
            cs = state.get(speaker)
            if cs is not None:
                cs.intervening_speech_lines += 1
                if not classify_dialogue(text):
                    cs.confirmation_only = False
            # listening characters: speech adds tension but no body action
            for other_char, other_cs in state.items():
                if other_char != speaker:
                    other_cs.intervening_speech_lines += 1
                    # not setting confirmation_only=False for listeners

    return hits


def render_table(hits: list[LookHit], path: pathlib.Path) -> str:
    if not hits:
        return f"{path.name}: 0 cut candidates flagged.\n"
    out: list[str] = []
    out.append(f"\n{path.name}: {len(hits)} cut-candidate look(s) flagged\n")
    out.append(f"  ({sum(1 for h in hits if h.confidence == 'H')} H / "
               f"{sum(1 for h in hits if h.confidence == 'M')} M / "
               f"{sum(1 for h in hits if h.confidence == 'L')} L)\n\n")
    out.append(f"  {'Line':>5}  {'Conf':4}  {'Char':10}  {'Token':35}  Reason\n")
    out.append(f"  {'-'*5}  {'-'*4}  {'-'*10}  {'-'*35}  {'-'*40}\n")
    for h in hits:
        out.append(
            f"  {h.line:>5}  {h.confidence:4}  {h.char:10}  "
            f"{h.token[:35]:35}  {h.reason}\n"
        )
    out.append("\n")
    return "".join(out)


OSS_BASE_URL = "https://mobai-file.oss-cn-shanghai.aliyuncs.com/nrbi/"


def load_asset_index(project_root: pathlib.Path) -> dict[str, str]:
    """Build {char_token: rel_path} from all mapping_per_ep + episodes-zh mappings.

    First occurrence wins (canonical_id consistency means duplicates are fine).
    Key format: "<char>__<look_token>" to keep simple JSON-friendly keys.
    """
    index: dict[str, str] = {}
    candidates = [
        project_root
        / "lunascripts/no-rules-in-bad-ideas/06-asset-prompt-generator"
        / "_workspace/mapping_per_ep",
        project_root
        / "lunascripts/no-rules-in-bad-ideas/ls-build/episodes-zh",
    ]
    for d in candidates:
        if not d.exists():
            continue
        for jf in sorted(d.glob("*.json")):
            try:
                data = json.loads(jf.read_text())
            except (json.JSONDecodeError, OSError):
                continue
            chars = data.get("assets", {}).get("characters", {})
            for char, looks in chars.items():
                if not isinstance(looks, dict):
                    continue
                for tok, rel in looks.items():
                    key = f"{char}__{tok}"
                    if key not in index and isinstance(rel, str):
                        index[key] = rel
    return index


HTML_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Look 审计 — {fname}</title>
<style>
  :root {{
    --bg: #0f1115; --fg: #d4d4d4; --dim: #6a7280;
    --gut: #1a1d24; --line-hover: #1c1f27;
    --h: #ef4444; --m: #f59e0b; --l: #3b82f6; --kept: #34d399;
    --tok: #a78bfa; --char: #60a5fa; --kw: #f472b6;
    --dlg: #e5e7eb; --narr: #9ca3af;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; background: var(--bg); color: var(--fg);
    font: 13px/1.5 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
  }}
  header {{
    position: sticky; top: 0; z-index: 10;
    background: #161922; border-bottom: 1px solid #262a36;
    padding: 14px 22px;
  }}
  h1 {{ margin: 0 0 8px; font-size: 16px; font-weight: 600; }}
  .stats {{ color: var(--dim); font-size: 12px; }}
  .stats b {{ color: var(--fg); font-weight: 500; }}
  .pill {{ display: inline-block; padding: 1px 8px; margin-right: 6px;
           border-radius: 999px; font-size: 11px; }}
  .pill.h {{ background: rgba(239, 68, 68, 0.18); color: #fca5a5; }}
  .pill.m {{ background: rgba(245, 158, 11, 0.18); color: #fcd34d; }}
  .pill.l {{ background: rgba(59, 130, 246, 0.18); color: #93c5fd; }}
  .filters {{ margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }}
  .filters span {{ color: var(--dim); font-size: 11px; margin-right: 4px; }}
  .filters button {{
    background: transparent; color: #4b5363; border: 1px solid #2a2f3d;
    padding: 5px 14px; border-radius: 6px; cursor: pointer;
    font: inherit; font-size: 12px; font-weight: 500;
    transition: all 0.12s ease;
  }}
  .filters button:hover {{ background: #1c1f27; color: #9ca3af; }}
  .filters button.on {{ color: #fff; }}
  .filters button.on[data-toggle="hide-h"] {{
    background: var(--h); border-color: var(--h);
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
  }}
  .filters button.on[data-toggle="hide-m"] {{
    background: var(--m); border-color: var(--m); color: #1a1d24;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25);
  }}
  .filters button.on[data-toggle="hide-l"] {{
    background: var(--l); border-color: var(--l);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  }}
  .filters button.on[data-toggle="hide-kept"] {{
    background: var(--kept); border-color: var(--kept); color: #0f1115;
    box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.25);
  }}
  main {{ padding: 8px 0 60px; }}
  body.has-sprite main {{ margin-right: 360px; }}
  /* sprite preview side panel */
  aside#sprite {{
    position: fixed; top: 0; right: 0; width: 360px; height: 100vh;
    background: #161922; border-left: 1px solid #262a36;
    display: none; flex-direction: column;
    z-index: 20;
  }}
  body.has-sprite aside#sprite {{ display: flex; }}
  #sprite header.sp-head {{
    position: static; padding: 12px 16px; background: #1a1d24;
    border-bottom: 1px solid #262a36;
  }}
  #sprite .sp-title {{
    font-size: 12px; color: var(--dim); margin-bottom: 4px;
  }}
  #sprite .sp-tok {{
    font-size: 13px; color: var(--tok); word-break: break-all;
  }}
  #sprite .sp-char {{ color: var(--char); }}
  #sprite .sp-close {{
    position: absolute; top: 10px; right: 10px;
    width: 24px; height: 24px; line-height: 22px; text-align: center;
    background: transparent; color: var(--dim); border: 1px solid #2a2f3d;
    border-radius: 4px; cursor: pointer; font-size: 14px;
  }}
  #sprite .sp-close:hover {{ color: #fff; background: #2a2f3d; }}
  #sprite .sp-img-wrap {{
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 16px;
    background:
      linear-gradient(45deg, #1a1d24 25%, transparent 25%),
      linear-gradient(-45deg, #1a1d24 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #1a1d24 75%),
      linear-gradient(-45deg, transparent 75%, #1a1d24 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    background-color: #0f1115;
    overflow: auto;
  }}
  #sprite img {{
    max-width: 100%; max-height: 100%; object-fit: contain;
  }}
  #sprite .sp-status {{
    color: var(--dim); font-size: 12px; text-align: center;
    padding: 24px;
  }}
  #sprite .sp-status.err {{ color: #fca5a5; }}
  #sprite .sp-meta {{
    padding: 10px 16px; font-size: 11px; color: var(--dim);
    background: #1a1d24; border-top: 1px solid #262a36;
    word-break: break-all;
  }}
  #sprite .sp-meta a {{ color: #60a5fa; text-decoration: none; }}
  #sprite .sp-meta a:hover {{ text-decoration: underline; }}
  /* clickable rows */
  .row.has-asset {{ cursor: pointer; }}
  .row.has-asset:hover .code::after {{
    content: " 🖼"; color: var(--dim); font-size: 11px;
  }}
  .row.active {{ background: #1f2a3a !important; }}
  .row.active .code {{ color: #fff; }}
  .row {{
    display: grid; grid-template-columns: 60px 1fr; padding: 0;
    border-left: 3px solid transparent;
  }}
  .row:hover {{ background: var(--line-hover); }}
  .ln {{
    padding: 2px 12px 2px 18px; text-align: right; color: var(--dim);
    background: var(--gut); user-select: none;
  }}
  .code {{ padding: 2px 22px 2px 14px; white-space: pre-wrap; word-break: break-word; }}
  .reason {{
    color: var(--dim); font-style: italic; margin-left: 14px;
    padding: 1px 8px; border-radius: 4px; font-size: 12px;
  }}
  .row.flag-h {{ border-left-color: var(--h); background: rgba(239, 68, 68, 0.04); }}
  .row.flag-m {{ border-left-color: var(--m); background: rgba(245, 158, 11, 0.04); }}
  .row.flag-l {{ border-left-color: var(--l); background: rgba(59, 130, 246, 0.04); }}
  .row.flag-h .reason {{ background: rgba(239, 68, 68, 0.12); color: #fca5a5; }}
  .row.flag-m .reason {{ background: rgba(245, 158, 11, 0.12); color: #fcd34d; }}
  .row.flag-l .reason {{ background: rgba(59, 130, 246, 0.12); color: #93c5fd; }}
  .row.look-kept .code::before {{ content: "✓ "; color: var(--kept); }}
  .row.flag-h .code::before {{ content: "⚠ "; color: var(--h); }}
  .row.flag-m .code::before {{ content: "⚠ "; color: var(--m); }}
  .row.flag-l .code::before {{ content: "⚠ "; color: var(--l); }}
  .at {{ color: var(--kw); }}
  .char {{ color: var(--char); }}
  .verb {{ color: var(--kw); }}
  .tok {{ color: var(--tok); }}
  .speaker {{ color: var(--char); font-weight: 600; }}
  .narr {{ color: var(--narr); font-style: italic; }}
  .comment {{ color: #4b5363; }}
  /* filter visibility */
  body.hide-h .row.flag-h {{ border-left-color: transparent; background: transparent; }}
  body.hide-h .row.flag-h .reason {{ display: none; }}
  body.hide-h .row.flag-h .code::before {{ content: ""; }}
  body.hide-m .row.flag-m {{ border-left-color: transparent; background: transparent; }}
  body.hide-m .row.flag-m .reason {{ display: none; }}
  body.hide-m .row.flag-m .code::before {{ content: ""; }}
  body.hide-l .row.flag-l {{ border-left-color: transparent; background: transparent; }}
  body.hide-l .row.flag-l .reason {{ display: none; }}
  body.hide-l .row.flag-l .code::before {{ content: ""; }}
  body.hide-kept .row.look-kept .code::before {{ content: ""; }}
</style>
</head>
<body>
<header>
  <h1>Look 审计 · {fname}</h1>
  <div class="stats">
    共 <b>{total_looks}</b> 个 look/show 指令 ·
    <span class="pill h">高 {h_count}</span>
    <span class="pill m">中 {m_count}</span>
    <span class="pill l">低 {l_count}</span>
    建议删 <b>{flagged}</b> 个（{pct}%）
  </div>
  <div class="filters">
    <span>显示：</span>
    <button data-toggle="hide-h" class="on">高 置信度</button>
    <button data-toggle="hide-m" class="on">中 置信度</button>
    <button data-toggle="hide-l" class="on">低 置信度</button>
    <button data-toggle="hide-kept" class="on">✓ 保留</button>
  </div>
</header>
<main>
{rows}
</main>
<aside id="sprite">
  <header class="sp-head">
    <div class="sp-title">立绘预览</div>
    <div><span class="sp-char" id="sp-char"></span> · <span class="sp-tok" id="sp-tok"></span></div>
    <button class="sp-close" id="sp-close" title="关闭">×</button>
  </header>
  <div class="sp-img-wrap" id="sp-wrap">
    <div class="sp-status" id="sp-status">点击左侧 look / show 行查看立绘</div>
  </div>
  <div class="sp-meta" id="sp-meta"></div>
</aside>
<script>
  const ASSET_INDEX = {asset_index_json};
  const OSS_BASE = {oss_base_json};

  document.querySelectorAll('.filters button').forEach(b => {{
    b.addEventListener('click', () => {{
      const cls = b.dataset.toggle;
      b.classList.toggle('on');
      document.body.classList.toggle(cls);
    }});
  }});

  const wrap = document.getElementById('sp-wrap');
  const statusEl = document.getElementById('sp-status');
  const charEl = document.getElementById('sp-char');
  const tokEl = document.getElementById('sp-tok');
  const metaEl = document.getElementById('sp-meta');
  let activeRow = null;

  function showSprite(row) {{
    if (activeRow === row) {{
      // toggle off
      closeSprite();
      return;
    }}
    if (activeRow) activeRow.classList.remove('active');
    activeRow = row;
    row.classList.add('active');
    document.body.classList.add('has-sprite');

    const ch = row.dataset.char;
    const tok = row.dataset.tok;
    charEl.textContent = ch;
    tokEl.textContent = tok;

    const key = ch + '__' + tok;
    const rel = ASSET_INDEX[key];
    wrap.innerHTML = '';
    if (!rel) {{
      const s = document.createElement('div');
      s.className = 'sp-status err';
      s.textContent = '未在 mapping 索引找到该 (char, token) 对';
      wrap.appendChild(s);
      metaEl.innerHTML = '<i>无 OSS 路径</i>';
      return;
    }}
    const url = OSS_BASE + rel;
    const img = document.createElement('img');
    img.alt = key;
    img.onerror = () => {{
      wrap.innerHTML = '';
      const s = document.createElement('div');
      s.className = 'sp-status err';
      s.textContent = 'OSS 加载失败（可能尚未上传 / URL 不对）';
      wrap.appendChild(s);
    }};
    img.src = url;
    wrap.appendChild(img);
    metaEl.innerHTML = '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
  }}

  function closeSprite() {{
    if (activeRow) activeRow.classList.remove('active');
    activeRow = null;
    document.body.classList.remove('has-sprite');
  }}

  document.querySelectorAll('.row.has-asset').forEach(r => {{
    r.addEventListener('click', () => showSprite(r));
  }});
  document.getElementById('sp-close').addEventListener('click', closeSprite);
  document.addEventListener('keydown', (e) => {{
    if (e.key === 'Escape') closeSprite();
  }});
</script>
</body>
</html>
"""


def html_escape(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))


def colorize_line(raw: str) -> str:
    """Return HTML for a code line with light syntax coloring."""
    s = html_escape(raw)
    m = LOOK_RE.match(raw.strip())
    if m:
        # @char verb token  → color
        return re.sub(
            r"^(\s*)@([a-z_]+)\s+(look|show)\s+(\S+)(.*)$",
            (r'\1<span class="at">@</span>'
             r'<span class="char">\2</span> '
             r'<span class="verb">\3</span> '
             r'<span class="tok">\4</span>\5'),
            s,
        )
    if NARRATOR_RE.match(raw.strip()):
        return f'<span class="narr">{s}</span>'
    d = DIALOGUE_RE.match(raw.strip())
    if d:
        return re.sub(
            r"^(\s*)([A-Z][A-Z_ ]*?)(\s*\[[^\]]+\])?(:.*)$",
            r'\1<span class="speaker">\2</span>\3\4',
            s,
        )
    if raw.strip().startswith("//"):
        return f'<span class="comment">{s}</span>'
    return s


def render_html(
    path: pathlib.Path,
    hits: list[LookHit],
    asset_index: dict[str, str],
) -> str:
    raw_lines = path.read_text().splitlines()
    hit_by_line = {h.line: h for h in hits}

    total_looks = sum(1 for ln in raw_lines if LOOK_RE.match(ln.strip()))
    h_count = sum(1 for h in hits if h.confidence == "H")
    m_count = sum(1 for h in hits if h.confidence == "M")
    l_count = sum(1 for h in hits if h.confidence == "L")
    flagged = len(hits)
    pct = round(100 * flagged / total_looks) if total_looks else 0

    # only emit asset_index entries actually used by this episode → smaller HTML
    used_keys: set[str] = set()
    for ln in raw_lines:
        m = LOOK_RE.match(ln.strip())
        if m:
            used_keys.add(f"{m.group('char')}__{m.group('token')}")
    sub_index = {k: asset_index[k] for k in used_keys if k in asset_index}

    rows: list[str] = []
    for idx, raw in enumerate(raw_lines, start=1):
        hit = hit_by_line.get(idx)
        m = LOOK_RE.match(raw.strip())
        is_look = bool(m)
        cls = ["row"]
        reason_html = ""
        attrs = ""
        if hit:
            cls.append(f"flag-{hit.confidence.lower()}")
            reason_html = f'<span class="reason">{html_escape(hit.reason)}</span>'
        elif is_look:
            cls.append("look-kept")
        if m:
            cls.append("has-asset")
            attrs = (f' data-char="{html_escape(m.group("char"))}"'
                     f' data-tok="{html_escape(m.group("token"))}"')
        rows.append(
            f'<div class="{" ".join(cls)}"{attrs}>'
            f'<div class="ln">{idx}</div>'
            f'<div class="code">{colorize_line(raw)}{reason_html}</div>'
            f"</div>"
        )

    return HTML_TEMPLATE.format(
        fname=html_escape(path.name),
        total_looks=total_looks,
        h_count=h_count, m_count=m_count, l_count=l_count,
        flagged=flagged, pct=pct,
        rows="\n".join(rows),
        asset_index_json=json.dumps(sub_index, ensure_ascii=False),
        oss_base_json=json.dumps(OSS_BASE_URL),
    )


def compute_coverage(path: pathlib.Path, asset_index: dict[str, str]) -> tuple[int, int]:
    """Return (looks_total, looks_with_asset) for one episode."""
    total = 0
    found = 0
    for line in path.read_text().splitlines():
        m = LOOK_RE.match(line.strip())
        if not m:
            continue
        total += 1
        if f"{m.group('char')}__{m.group('token')}" in asset_index:
            found += 1
    return total, found


def write_html_report(
    path: pathlib.Path,
    out: pathlib.Path,
    asset_index: dict[str, str],
) -> dict:
    hits = audit(path)
    total, found = compute_coverage(path, asset_index)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_html(path, hits, asset_index), encoding="utf-8")
    return {
        "file": path.name, "out": str(out),
        "flagged": len(hits),
        "h": sum(1 for h in hits if h.confidence == "H"),
        "m": sum(1 for h in hits if h.confidence == "M"),
        "l": sum(1 for h in hits if h.confidence == "L"),
        "looks_total": total,
        "looks_with_asset": found,
        "coverage_pct": round(100 * found / total) if total else 0,
    }


INDEX_TEMPLATE = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Look 审计 · 总览</title>
<style>
  body {{ font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC",
          "Microsoft YaHei", sans-serif;
          background: #0f1115; color: #d4d4d4; margin: 0; padding: 30px; }}
  h1 {{ font-size: 18px; margin: 0 0 16px; }}
  .lede {{ color: #6a7280; font-size: 12px; margin-bottom: 20px; line-height: 1.6; max-width: 720px; }}
  .lede b {{ color: #d4d4d4; }}
  table {{ border-collapse: collapse; width: 100%; max-width: 820px; }}
  th, td {{ text-align: left; padding: 8px 12px; border-bottom: 1px solid #262a36; }}
  th {{ color: #6a7280; font-weight: 500; font-size: 12px; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  a {{ color: #60a5fa; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  .h {{ color: #fca5a5; }} .m {{ color: #fcd34d; }} .l {{ color: #93c5fd; }}
  .cov {{ color: #34d399; }}
  .skip-block {{ margin-top: 28px; padding-top: 18px; border-top: 1px dashed #2a2f3d; }}
  .skip-block h2 {{ font-size: 13px; color: #6a7280; font-weight: 500;
                    margin: 0 0 8px; }}
  .skip-list {{ font-size: 12px; color: #6a7280; line-height: 1.8; }}
  .skip-list code {{ background: #1a1d24; padding: 1px 6px; border-radius: 3px;
                     color: #9ca3af; }}
</style></head>
<body>
<h1>Look 审计 · 共 {n} 集</h1>
<div class="lede">
  点集名进入详情。<b>高 / 中 / 低</b>是建议删除的置信度——高 = 几乎肯定该删，低 = 仅供参考。<br>
  <b>覆盖</b>列 = 该集 look 有多少能从 OSS 找到立绘；低于 {min_cov}% 的集已隐藏（避免示例里大量"未找到"）。
</div>
<table>
<thead><tr><th>集</th><th class="num">总 look</th>
<th class="num cov">覆盖</th><th class="num">建议删</th>
<th class="num h">高</th><th class="num m">中</th><th class="num l">低</th></tr></thead>
<tbody>
{rows}
</tbody>
</table>
{skipped_block}
</body></html>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*", help="episode .md file(s)")
    ap.add_argument("--json", action="store_true", help="output JSON instead of table")
    ap.add_argument("--html", help="write single-episode HTML report to this path")
    ap.add_argument("--html-dir", help="write batch HTML reports + index.html to this dir")
    ap.add_argument("--min-conf", choices=["L", "M", "H"], default="L",
                    help="filter by minimum confidence (default L = show all)")
    ap.add_argument("--min-coverage", type=int, default=90,
                    help="batch HTML: hide episodes with asset coverage < N%% "
                         "(default 90; set 0 to include all)")
    args = ap.parse_args()

    if not args.paths:
        sys.stderr.write("error: at least one episode .md path required\n")
        return 1

    project_root = pathlib.Path(__file__).resolve().parents[2]
    asset_index = load_asset_index(project_root)
    sys.stderr.write(f"  loaded {len(asset_index)} (char, token) → asset entries\n")

    if args.html_dir:
        out_dir = pathlib.Path(args.html_dir).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        included: list[dict] = []
        skipped: list[dict] = []
        for p in args.paths:
            path = pathlib.Path(p).resolve()
            if not path.exists():
                sys.stderr.write(f"  skip (not found): {p}\n")
                continue
            total, found = compute_coverage(path, asset_index)
            cov = round(100 * found / total) if total else 0
            if cov < args.min_coverage:
                skipped.append({
                    "file": path.name, "looks_total": total,
                    "looks_with_asset": found, "coverage_pct": cov,
                })
                sys.stderr.write(
                    f"  skip (coverage {cov}% < {args.min_coverage}%): {path.name}\n"
                )
                continue
            html_path = out_dir / (path.stem + ".html")
            summary = write_html_report(path, html_path, asset_index)
            included.append(summary)
            sys.stderr.write(
                f"  wrote {html_path.name}  (cov {cov}%)\n"
            )

        # sort: highest coverage first, then most flagged
        included.sort(key=lambda s: (-s["coverage_pct"], -s["flagged"]))

        rows = "\n".join(
            f'<tr><td><a href="{s["file"].rsplit(".", 1)[0]}.html">{s["file"]}</a></td>'
            f'<td class="num">{s["looks_total"]}</td>'
            f'<td class="num cov">{s["coverage_pct"]}%</td>'
            f'<td class="num">{s["flagged"]}</td>'
            f'<td class="num h">{s["h"]}</td>'
            f'<td class="num m">{s["m"]}</td>'
            f'<td class="num l">{s["l"]}</td></tr>'
            for s in included
        )

        if skipped:
            skipped.sort(key=lambda s: -s["coverage_pct"])
            items = "".join(
                f'<div><code>{s["file"]}</code> '
                f'· 覆盖 {s["coverage_pct"]}% '
                f'({s["looks_with_asset"]}/{s["looks_total"]})</div>'
                for s in skipped
            )
            skipped_block = (
                f'<div class="skip-block">'
                f'<h2>已隐藏 {len(skipped)} 集（覆盖 &lt; {args.min_coverage}%）</h2>'
                f'<div class="skip-list">{items}</div>'
                f'</div>'
            )
        else:
            skipped_block = ""

        idx_path = out_dir / "index.html"
        idx_path.write_text(
            INDEX_TEMPLATE.format(
                n=len(included), rows=rows,
                min_cov=args.min_coverage,
                skipped_block=skipped_block,
            ),
            encoding="utf-8",
        )
        sys.stderr.write(f"\nopen file://{idx_path}\n")
        return 0

    if args.html:
        path = pathlib.Path(args.paths[0]).resolve()
        if not path.exists():
            sys.stderr.write(f"file not found: {path}\n")
            return 1
        out = pathlib.Path(args.html).resolve()
        write_html_report(path, out, asset_index)
        sys.stderr.write(f"open file://{out}\n")
        return 0

    path = pathlib.Path(args.paths[0]).resolve()
    if not path.exists():
        sys.stderr.write(f"file not found: {path}\n")
        return 1

    hits = audit(path)
    order = {"H": 3, "M": 2, "L": 1}
    hits = [h for h in hits if order[h.confidence] >= order[args.min_conf]]
    hits.sort(key=lambda h: (-order[h.confidence], h.line))

    if args.json:
        print(json.dumps(
            [h.__dict__ for h in hits], ensure_ascii=False, indent=2,
        ))
    else:
        sys.stdout.write(render_table(hits, path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
