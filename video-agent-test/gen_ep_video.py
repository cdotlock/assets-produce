#!/usr/bin/env python3
"""
gen_ep_video.py — 调用 BytePlus ARK Seedance 2.0 Fast API 生成单条 shot 视频

读取 ep_video_prompt/shot_X.md 的 frontmatter + 正文，
按 frontmatter.assets 里列出的顺序把素材（本地文件 base64 或 http(s) URL）
打包成 Seedance content 数组，POST 任务，轮询直到完成，
把生成的视频下载到 ep_video/shot_X.mp4。

用法：
    export ARK_API_KEY=cdc63cd0-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    python3 gen_ep_video.py --shot shot_1
    python3 gen_ep_video.py --shot shot_1 --dry-run     # 只打印 payload，不发送
    python3 gen_ep_video.py --shot shot_1 --duration 13 # 覆盖 frontmatter 的 duration
    python3 gen_ep_video.py --shot shot_1 --ratio 16:9  # 默认 9:16 竖屏
    python3 gen_ep_video.py --shot shot_1 --no-audio    # generate_audio=false

frontmatter 约定（ep_video_prompt/shot_X.md 开头）：
    ---
    shot_id: shot_1
    duration: 13s
    mode: 多参考
    scene: ...
    emotion_arc: ...
    assets:
      images:
        - portrait_and_scene/scene_kitchen.png     # → @图1
        - portrait_and_scene/Sylvia人物立绘.png    # → @图2
      videos:
        - gen_ref_video/shot_前_ref.mp4            # → @视频1
      audios:                                      # 可选
        - portrait_and_scene/bgm.mp3               # → @音频1
    ---
    [prompt 正文…]

assets 里的条目可以是相对项目根目录的本地路径（会被 base64 成 data URL），
也可以是 http(s):// 开头的远端 URL（原样透传给 Seedance）。
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API_ENDPOINT = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
MODEL_ID = "dreamina-seedance-2-0-fast-260128"
POLL_INTERVAL_SEC = 10
POLL_TIMEOUT_SEC = 30 * 60  # 30 分钟
MIME_FALLBACK = {
    "image": "image/png",
    "video": "video/mp4",
    "audio": "audio/mpeg",
}
CONTENT_KEY = {"image": "image_url", "video": "video_url", "audio": "audio_url"}


# ---------- utilities ----------

def die(msg, code=1):
    print(f"[gen_ep_video] ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def info(msg):
    print(f"[gen_ep_video] {msg}")


def get_api_key(cli_key):
    key = cli_key or os.environ.get("ARK_API_KEY")
    if not key:
        die("No API key. Set ARK_API_KEY env var or pass --api-key")
    return key.strip()


# ---------- frontmatter parser (minimal, no PyYAML dep) ----------

def parse_frontmatter(md_path: Path):
    """Return (fm_dict, body_str). Supports the known structure only."""
    if not md_path.exists():
        die(f"Prompt file not found: {md_path}")
    text = md_path.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)$", text, re.DOTALL)
    if not m:
        die(f"Frontmatter (--- ... ---) missing or malformed in {md_path}")
    fm_text, body = m.group(1), m.group(2).strip()

    fm = {"assets": {"images": [], "videos": [], "audios": []}}
    mode = "top"          # "top" | "assets" | "assets.<sub>"
    for raw in fm_text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        stripped = raw.strip()
        indent = len(raw) - len(raw.lstrip(" "))

        # list item under assets.<sub>
        if mode.startswith("assets.") and stripped.startswith("- "):
            sub = mode.split(".", 1)[1]
            fm["assets"].setdefault(sub, []).append(stripped[2:].strip())
            continue

        # "assets:" block open
        if indent == 0 and re.match(r"^assets\s*:\s*$", stripped):
            mode = "assets"
            continue

        # sub-key inside assets (e.g. "  images:")
        if mode in ("assets", "assets.images", "assets.videos", "assets.audios") and indent == 2 \
                and re.match(r"^[a-zA-Z_]+\s*:\s*$", stripped):
            sub = stripped.split(":", 1)[0].strip()
            mode = f"assets.{sub}"
            fm["assets"].setdefault(sub, [])
            continue

        # a "  images: []" inline-empty form
        if mode.startswith("assets") and indent == 2 \
                and re.match(r"^[a-zA-Z_]+\s*:\s*\[\s*\]\s*$", stripped):
            sub = stripped.split(":", 1)[0].strip()
            fm["assets"].setdefault(sub, [])
            mode = "assets"
            continue

        # top-level simple key: value
        m2 = re.match(r"^([a-zA-Z_][\w-]*)\s*:\s*(.*)$", stripped)
        if indent == 0 and m2:
            fm[m2.group(1)] = m2.group(2).strip()
            mode = "top"
            continue
        # else: ignore unknown lines silently

    return fm, body


def duration_seconds(fm, override=None):
    if override is not None:
        return int(override)
    raw = str(fm.get("duration", "")).strip()
    m = re.match(r"^(\d+)", raw)
    if not m:
        die(f"Cannot parse duration from frontmatter: '{raw}'")
    return int(m.group(1))


# ---------- content packaging ----------

def to_content_entry(ref: str, kind: str, project_root: Path):
    """Build one Seedance content item for a remote URL or a local path.

    对于本地视频路径，优先查找同目录下的 `<path>.url` sidecar 小文件；
    若存在则直接用里面的 http URL（ARK reference_video 只接受 web URL，不收 base64）。
    """
    if re.match(r"^https?://", ref, re.IGNORECASE):
        url = ref
    else:
        p = Path(ref)
        if not p.is_absolute():
            p = project_root / p

        # .url sidecar 优先（对 video 尤其关键；image/audio 也允许）
        sidecar = p.with_suffix(p.suffix + ".url")
        if sidecar.exists():
            sidecar_url = sidecar.read_text(encoding="utf-8").strip()
            if sidecar_url.startswith("http"):
                url = sidecar_url
            else:
                die(f"Sidecar {sidecar} does not contain a valid http URL")
        else:
            if kind == "video":
                die(
                    f"Video reference '{ref}' has no .url sidecar and ARK API "
                    f"rejects base64 videos. Either pass an http(s):// URL in "
                    f"frontmatter, or create {sidecar} containing the TOS URL."
                )
            if not p.exists():
                die(f"Asset missing on disk: {p}")
            mime, _ = mimetypes.guess_type(str(p))
            mime = mime or MIME_FALLBACK[kind]
            data = base64.b64encode(p.read_bytes()).decode("ascii")
            url = f"data:{mime};base64,{data}"

    k = CONTENT_KEY[kind]
    return {
        "type": k,
        k: {"url": url},
        "role": f"reference_{kind}",
    }


def build_payload(fm, body, duration, ratio, generate_audio, watermark, project_root):
    content = [{"type": "text", "text": body}]
    for img in fm["assets"].get("images", []) or []:
        content.append(to_content_entry(img, "image", project_root))
    for vid in fm["assets"].get("videos", []) or []:
        content.append(to_content_entry(vid, "video", project_root))
    for aud in fm["assets"].get("audios", []) or []:
        content.append(to_content_entry(aud, "audio", project_root))
    return {
        "model": MODEL_ID,
        "content": content,
        "generate_audio": bool(generate_audio),
        "ratio": ratio,
        "duration": int(duration),
        "watermark": bool(watermark),
    }


def redact_payload_for_print(payload):
    """Replace base64 data URLs with size summary so dry-run stays readable."""
    red = json.loads(json.dumps(payload))
    for item in red.get("content", []):
        for k in ("image_url", "video_url", "audio_url"):
            if k in item and isinstance(item[k].get("url"), str):
                u = item[k]["url"]
                if u.startswith("data:"):
                    header, _, rest = u.partition(",")
                    item[k]["url"] = f"{header},<base64 {len(rest)} chars>"
    return red


# ---------- HTTP ----------

def http_json(method, url, api_key, body=None, timeout=120):
    headers = {"Authorization": f"Bearer {api_key}"}
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", errors="replace")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        die(f"HTTP {e.code} from {method} {url}\n{err_body}")
    except urllib.error.URLError as e:
        die(f"Network error contacting {url}: {e}")


def create_task(api_key, payload):
    _, resp = http_json("POST", API_ENDPOINT, api_key, body=payload)
    # ARK 常见返回形态：{"id": "..."} 或 {"task_id": "..."} 或 {"data": {"id": "..."}}
    task_id = (
        resp.get("id")
        or resp.get("task_id")
        or (resp.get("data") or {}).get("id")
        or (resp.get("data") or {}).get("task_id")
    )
    if not task_id:
        die(f"No task id in response: {resp}")
    return task_id, resp


_TERMINAL_OK = {"succeeded", "success", "completed", "done", "finished"}
_TERMINAL_FAIL = {"failed", "error", "cancelled", "canceled", "timeout"}


def poll_task(api_key, task_id):
    url = f"{API_ENDPOINT}/{task_id}"
    start = time.time()
    while True:
        _, r = http_json("GET", url, api_key)
        status = (
            r.get("status")
            or r.get("task_status")
            or (r.get("data") or {}).get("status")
            or ""
        ).lower()
        info(f"poll task={task_id} status={status or 'unknown'}")
        if status in _TERMINAL_OK:
            return r
        if status in _TERMINAL_FAIL:
            die(f"Task failed. Full response:\n{json.dumps(r, ensure_ascii=False, indent=2)}")
        if time.time() - start > POLL_TIMEOUT_SEC:
            die(f"Polling timed out after {POLL_TIMEOUT_SEC}s. Last response:\n{r}")
        time.sleep(POLL_INTERVAL_SEC)


def extract_video_url(task_resp):
    """Try several response shapes to find the generated video URL."""
    candidates = [task_resp, task_resp.get("content") or {}, task_resp.get("data") or {}]
    for node in candidates:
        if not isinstance(node, dict):
            continue
        for key in ("video_url", "content_url", "url", "result_url", "output_url"):
            v = node.get(key)
            if isinstance(v, str) and v.startswith("http"):
                return v
        # sometimes nested {"content": {"video_url": "..."}}
        inner = node.get("content") or {}
        if isinstance(inner, dict):
            for key in ("video_url", "url", "content_url"):
                v = inner.get(key)
                if isinstance(v, str) and v.startswith("http"):
                    return v
    die(f"No video URL found in task response:\n{json.dumps(task_resp, ensure_ascii=False, indent=2)}")


def download(url, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    info(f"download {url} → {dest}")
    # urlretrieve is fine for short videos; stream would be overkill here
    urllib.request.urlretrieve(url, dest)


def extract_last_frame(video_path: Path, out_path: Path):
    """Extract the last frame of video_path as PNG at out_path.

    ARK 的真人检测会拦截所有视频输入（InputVideoSensitiveContentDetected），
    但放行图片输入。本函数配合下游 shot 的"首尾帧模式 + 首帧锚图"工作流：
    生成完 shot_N.mp4 后立刻抽末帧 PNG，下条 shot 在 frontmatter 里用
    `gen_end_frame/shot_N_end.png` 作为 @图1 首帧锚图。

    使用 imageio-ffmpeg 自带的二进制，无需系统安装 ffmpeg。
    """
    try:
        import imageio_ffmpeg  # type: ignore
    except ImportError:
        info("SKIP end-frame extraction: imageio-ffmpeg not installed "
             "(pip3 install imageio-ffmpeg)")
        return
    import subprocess
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # -sseof -0.1 = seek 0.1s before end, then -frames:v 1 = grab one frame
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-sseof", "-0.1", "-i", str(video_path),
        "-frames:v", "1", "-q:v", "2", str(out_path),
    ]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode == 0 and out_path.exists():
        size_kb = out_path.stat().st_size // 1024
        info(f"end-frame → {out_path} ({size_kb} KB)")
    else:
        info(f"end-frame extraction failed (rc={r.returncode}): "
             f"{r.stderr.decode(errors='replace')[-200:]}")


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(
        description="Generate a shot video via Seedance 2.0 Fast API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("--shot", required=True, help="shot id, e.g. shot_1 or shot_3a")
    ap.add_argument("--prompt-dir", default="ep_video_prompt",
                    help="directory containing shot_X.md (default: ep_video_prompt)")
    ap.add_argument("--out-dir", default="ep_video",
                    help="where to save the generated mp4 (default: ep_video)")
    ap.add_argument("--ratio", default="9:16",
                    help="aspect ratio passed to API (default: 9:16)")
    ap.add_argument("--duration", type=int,
                    help="override duration in seconds (else read from frontmatter)")
    ap.add_argument("--no-audio", action="store_true",
                    help="set generate_audio=false (default true)")
    ap.add_argument("--watermark", action="store_true",
                    help="enable watermark in output (default: no watermark)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the payload with base64 redacted, do not call API")
    ap.add_argument("--api-key", help="Bearer token (else read ARK_API_KEY env var)")
    args = ap.parse_args()

    project_root = Path(__file__).resolve().parent
    md_path = project_root / args.prompt_dir / f"{args.shot}.md"
    fm, body = parse_frontmatter(md_path)
    duration = duration_seconds(fm, override=args.duration)

    payload = build_payload(
        fm=fm,
        body=body,
        duration=duration,
        ratio=args.ratio,
        generate_audio=not args.no_audio,
        watermark=args.watermark,
        project_root=project_root,
    )

    info(f"shot={args.shot} duration={duration}s ratio={args.ratio} "
         f"images={len(fm['assets'].get('images', []))} "
         f"videos={len(fm['assets'].get('videos', []))} "
         f"audios={len(fm['assets'].get('audios', []))}")

    if args.dry_run:
        print(json.dumps(redact_payload_for_print(payload), ensure_ascii=False, indent=2))
        return

    api_key = get_api_key(args.api_key)
    info("creating task ...")
    task_id, create_resp = create_task(api_key, payload)
    info(f"task created: id={task_id}")
    task_resp = poll_task(api_key, task_id)
    video_url = extract_video_url(task_resp)
    dest = project_root / args.out_dir / f"{args.shot}.mp4"
    download(video_url, dest)
    # 1) 把源 URL 写到 sidecar（兼容早期"视频输入"工作流；ARK 真人检测全面拦截视频
    #    输入后本字段不再被下游 shot 使用，但保留做为链路审计信息）
    sidecar = dest.with_suffix(dest.suffix + ".url")
    sidecar.write_text(video_url, encoding="utf-8")
    # 2) 抽末帧 PNG 到 gen_end_frame/{shot_id}_end.png，供下一条 shot 走
    #    "首尾帧模式 + 首帧锚图"工作流引用（详见 skills/WORKFLOW.md 第 6 条）
    end_frame_path = project_root / "gen_end_frame" / f"{args.shot}_end.png"
    extract_last_frame(dest, end_frame_path)
    info(f"done → {dest.relative_to(project_root)} "
         f"(url sidecar: {sidecar.name}, end-frame: {end_frame_path.relative_to(project_root)})")


if __name__ == "__main__":
    main()
