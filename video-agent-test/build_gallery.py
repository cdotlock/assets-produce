#!/usr/bin/env python3
"""
build_gallery.py — 扫描 ep_video/ 生成/更新 gen_video_gallery.html

读取：
    ep_video/shot_*.mp4       — 生成好的视频
    ep_video/shot_*.md        — 该视频的提示词与素材引用（agent 在生成 prompt 时写入）
    gen_ref_video/shot_*_ref.mp4 — 该视频的末 5s（供下一镜头引用）
    portrait_and_scene/*.*    — 素材原图

产物：
    gen_video_gallery.html    — 画廊页面（直接用浏览器打开）

shot_*.md 文件需遵循以下 YAML frontmatter 约定：
    ---
    shot_id: shot_1
    duration: 12s
    mode: 多参考
    scene: 银月领地豪宅厨房
    emotion_arc: 独白平静
    assets:
      images:
        - portrait_and_scene/kitchen_empty.png
        - portrait_and_scene/Sylvia_portrait.png
      videos:
        - gen_ref_video/shot_0_ref.mp4
    ---
    (正文：完整 prompt)
"""

import html
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
EP_VIDEO_DIR = PROJECT_ROOT / "ep_video"
EP_PROMPT_DIR = PROJECT_ROOT / "ep_video_prompt"
REF_VIDEO_DIR = PROJECT_ROOT / "gen_ref_video"
ASSET_DIR = PROJECT_ROOT / "portrait_and_scene"
OUTPUT_HTML = PROJECT_ROOT / "gen_video_gallery.html"

# prompt 文件查找顺序：优先新目录 ep_video_prompt/，回落到 ep_video/（兼容旧约定）
PROMPT_DIRS = [EP_PROMPT_DIR, EP_VIDEO_DIR]


def find_prompt_md(shot_id: str) -> "Path | None":
    for d in PROMPT_DIRS:
        p = d / f"{shot_id}.md"
        if p.exists():
            return p
    return None


def parse_frontmatter(md_path: "Path | None") -> dict:
    """极简 YAML frontmatter 解析器。只支持本项目约定的字段，不做全 YAML 兼容。"""
    if not md_path or not md_path.exists():
        return {}
    text = md_path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if not m:
        return {"_prompt_body": text.strip()}
    meta_text, body = m.group(1), m.group(2).strip()

    meta = {"_prompt_body": body, "assets": {"images": [], "videos": []}}
    current_list_key = None
    for line in meta_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        # 列表项
        m_li = re.match(r"^\s*-\s+(.+)$", line)
        if m_li and current_list_key:
            meta["assets"][current_list_key].append(m_li.group(1).strip())
            continue
        # 键（容忍任意缩进，支持 assets: / images: / videos: 等嵌套子键）
        m_kv = re.match(r"^\s*(\w+):\s*(.*)$", line)
        if m_kv:
            key, val = m_kv.group(1), m_kv.group(2).strip()
            if key == "assets":
                current_list_key = None
            elif key in ("images", "videos"):
                current_list_key = key
            elif val:
                meta[key] = val
                current_list_key = None
            else:
                current_list_key = None
    return meta


def shot_sort_key(shot_id: str):
    """把 shot_1 / shot_1a / shot_5-2 等排序稳妥。"""
    m = re.match(r"shot_(\d+)([a-z]?)(?:-(\d+))?", shot_id)
    if not m:
        return (9999, "", 0, shot_id)
    n = int(m.group(1))
    letter = m.group(2) or ""
    branch = int(m.group(3)) if m.group(3) else 0
    return (n, letter, branch, shot_id)


def collect_shots():
    """扫描 ep_video 下所有 shot_*.mp4，返回按顺序排列的列表。"""
    shots = []
    for mp4 in EP_VIDEO_DIR.glob("shot_*.mp4"):
        shot_id = mp4.stem
        md_path = find_prompt_md(shot_id)
        ref_path = REF_VIDEO_DIR / f"{shot_id}_ref.mp4"
        meta = parse_frontmatter(md_path) if md_path else {}
        shots.append({
            "id": shot_id,
            "video": mp4.relative_to(PROJECT_ROOT).as_posix(),
            "ref": ref_path.relative_to(PROJECT_ROOT).as_posix() if ref_path.exists() else None,
            "md": md_path.relative_to(PROJECT_ROOT).as_posix() if md_path else None,
            "meta": meta,
        })
    shots.sort(key=lambda s: shot_sort_key(s["id"]))
    return shots


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>Video Agent Gallery</title>
<style>
  body {{
    background: #0e0f12;
    color: #e5e5e5;
    font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif;
    margin: 0;
    padding: 24px;
  }}
  h1 {{ font-size: 20px; margin: 0 0 16px; font-weight: 500; }}
  .meta-bar {{
    color: #888; font-size: 13px; margin-bottom: 24px;
  }}
  .shot {{
    border: 1px solid #2a2b2f;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 16px;
  }}
  .shot-header {{
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: 10px;
    border-bottom: 1px solid #2a2b2f;
    margin-bottom: 4px;
  }}
  .shot-id {{ font-size: 16px; font-weight: 600; color: #fff; }}
  .shot-tags span {{
    background: #222428; color: #c7c9cc; padding: 2px 8px; border-radius: 4px;
    font-size: 11px; margin-left: 6px;
  }}
  .video-col video {{
    width: 100%; border-radius: 6px; background: #000;
  }}
  .ref-sub {{ margin-top: 10px; }}
  .ref-sub .label {{
    color: #888; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;
  }}
  .ref-sub video {{ width: 100%; border-radius: 4px; background: #000; opacity: 0.85; }}
  .info-col {{ min-width: 0; }}
  .section {{ margin-bottom: 14px; }}
  .section-label {{
    color: #9aa0a6; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 6px;
  }}
  .asset-grid {{
    display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }}
  .asset-grid img {{
    width: 100%; aspect-ratio: 1; object-fit: cover;
    border: 1px solid #2a2b2f; border-radius: 4px;
  }}
  .asset-grid video {{
    width: 100%; aspect-ratio: 1; object-fit: cover;
    border: 1px solid #2a2b2f; border-radius: 4px;
  }}
  .prompt-box {{
    background: #17181c;
    padding: 12px;
    border-radius: 6px;
    font-family: "SF Mono", Monaco, Menlo, monospace;
    font-size: 12px;
    line-height: 1.55;
    color: #d0d3d8;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 320px;
    overflow-y: auto;
  }}
  .empty {{
    color: #666; font-style: italic; padding: 40px; text-align: center;
    border: 1px dashed #2a2b2f; border-radius: 8px;
  }}
  .copy-btn {{
    background: #2a2b2f; border: none; color: #c7c9cc; font-size: 11px;
    padding: 3px 8px; border-radius: 3px; cursor: pointer; margin-left: 8px;
  }}
  .copy-btn:hover {{ background: #3a3b3f; color: #fff; }}
</style>
</head>
<body>
<h1>Video Agent · 生成画廊</h1>
<div class="meta-bar">共 {shot_count} 条 shot · 更新于 {timestamp}</div>

{shots_html}

<script>
function copyPrompt(btn) {{
  const box = btn.nextElementSibling;
  navigator.clipboard.writeText(box.textContent).then(() => {{
    const old = btn.textContent;
    btn.textContent = "已复制";
    setTimeout(() => {{ btn.textContent = old; }}, 1200);
  }});
}}
</script>
</body>
</html>
"""


SHOT_TEMPLATE = """
<div class="shot" id="{shot_id}">
  <div class="shot-header">
    <div class="shot-id">{shot_id} <span style="color:#888;font-weight:400;">— {scene}</span></div>
    <div class="shot-tags">{tags_html}</div>
  </div>

  <div class="video-col">
    <video src="{video_path}" controls preload="metadata"></video>
    {ref_block}
  </div>

  <div class="info-col">
    <div class="section">
      <div class="section-label">引用的参考图（@图N）</div>
      <div class="asset-grid">{images_html}</div>
    </div>
    <div class="section">
      <div class="section-label">引用的参考视频（@视频N）</div>
      <div class="asset-grid">{videos_html}</div>
    </div>
    <div class="section">
      <div class="section-label">视频提示词 <button class="copy-btn" onclick="copyPrompt(this)">复制</button></div>
      <div class="prompt-box">{prompt_body}</div>
    </div>
  </div>
</div>
"""


def render_asset_item(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext in {".mp4", ".mov", ".webm"}:
        return f'<video src="{html.escape(path)}" muted preload="metadata" controls></video>'
    return f'<img src="{html.escape(path)}" alt="{html.escape(path)}">'


def render_shot(shot: dict) -> str:
    meta = shot["meta"]
    tags = []
    for key in ("duration", "mode", "emotion_arc"):
        if meta.get(key):
            tags.append(f'<span>{html.escape(meta[key])}</span>')
    tags_html = "".join(tags)

    assets = meta.get("assets", {}) or {}
    images_html = "".join(render_asset_item(p) for p in assets.get("images", [])) or '<div style="color:#555;font-size:11px;">无</div>'
    videos_html = "".join(render_asset_item(p) for p in assets.get("videos", [])) or '<div style="color:#555;font-size:11px;">无</div>'

    ref_block = ""
    if shot["ref"]:
        ref_block = f'''
    <div class="ref-sub">
      <div class="label">本视频的末 5s（ref，供下一镜头引用）</div>
      <video src="{html.escape(shot["ref"])}" muted preload="metadata" controls></video>
    </div>'''

    return SHOT_TEMPLATE.format(
        shot_id=html.escape(shot["id"]),
        scene=html.escape(meta.get("scene", "")),
        tags_html=tags_html,
        video_path=html.escape(shot["video"]),
        ref_block=ref_block,
        images_html=images_html,
        videos_html=videos_html,
        prompt_body=html.escape(meta.get("_prompt_body", "（未找到对应的 shot_*.md 提示词文件）")),
    )


def main():
    from datetime import datetime

    shots = collect_shots()
    if not shots:
        shots_html = '<div class="empty">ep_video/ 下还没有任何 shot_*.mp4。生成第一个镜头后再运行本脚本。</div>'
    else:
        shots_html = "\n".join(render_shot(s) for s in shots)

    html_out = HTML_TEMPLATE.format(
        shot_count=len(shots),
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
        shots_html=shots_html,
    )
    OUTPUT_HTML.write_text(html_out, encoding="utf-8")
    print(f"[完成] 已更新 {OUTPUT_HTML.relative_to(PROJECT_ROOT)}（{len(shots)} 条 shot）")


if __name__ == "__main__":
    main()
