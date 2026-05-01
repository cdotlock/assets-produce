#!/usr/bin/env python3
"""
gen_ref_video.py — 裁剪 ep_video/ 下生成视频的最后 5 秒，输出到 gen_ref_video/

用法：
    python3 gen_ref_video.py                 # 处理 ep_video/ 下所有尚未处理的 shot
    python3 gen_ref_video.py --shot shot_1   # 只处理指定 shot
    python3 gen_ref_video.py --force         # 强制重新生成所有 ref（覆盖已存在的）
    python3 gen_ref_video.py --duration 3    # 改变截取时长（默认 5 秒）

产物：
    gen_ref_video/shot_x_ref.mp4

依赖：
    imageio-ffmpeg（内置 ffmpeg 二进制，无需系统安装）
    安装：pip3 install imageio-ffmpeg
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    import imageio_ffmpeg
except ImportError:
    print("ERROR: 缺少 imageio-ffmpeg 依赖。请先运行：")
    print("    pip3 install imageio-ffmpeg")
    sys.exit(1)


PROJECT_ROOT = Path(__file__).resolve().parent
EP_VIDEO_DIR = PROJECT_ROOT / "ep_video"
REF_VIDEO_DIR = PROJECT_ROOT / "gen_ref_video"


def get_video_duration(video_path: Path, ffmpeg: str) -> float:
    """用 ffmpeg -i 读取视频总时长（秒）。"""
    result = subprocess.run(
        [ffmpeg, "-i", str(video_path)],
        capture_output=True, text=True,
    )
    # ffmpeg 把信息打到 stderr
    m = re.search(r"Duration:\s+(\d+):(\d+):([\d.]+)", result.stderr)
    if not m:
        raise ValueError(f"无法从 ffmpeg 输出解析 {video_path} 的时长")
    h, mn, s = m.groups()
    return int(h) * 3600 + int(mn) * 60 + float(s)


def extract_last_seconds(input_video: Path, output_video: Path, duration: float, ffmpeg: str):
    """截取视频的最后 N 秒。"""
    total = get_video_duration(input_video, ffmpeg)
    if total <= duration:
        print(f"  [提示] 源视频仅 {total:.2f}s ≤ {duration}s，整段复制")
        start = 0.0
        clip_duration = total
    else:
        start = total - duration
        clip_duration = duration

    # 注意：-ss 放在 -i 之前是快速 seek（关键帧跳转，可能不精确）；
    # 放在 -i 之后是慢速精确 seek。裁剪 ref 视频要求首帧精准，用精确模式。
    cmd = [
        ffmpeg, "-y",
        "-i", str(input_video),
        "-ss", f"{start:.3f}",
        "-t", f"{clip_duration:.3f}",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-preset", "fast",
        "-movflags", "+faststart",
        str(output_video),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [错误] ffmpeg 裁剪失败：\n{result.stderr[-500:]}")
        raise RuntimeError(f"ffmpeg failed on {input_video}")


def process_shot(shot_id: str, duration: float, force: bool, ffmpeg: str) -> bool:
    """处理单条 shot。返回 True 表示实际做了工作，False 表示跳过。"""
    input_p = EP_VIDEO_DIR / f"{shot_id}.mp4"
    output_p = REF_VIDEO_DIR / f"{shot_id}_ref.mp4"

    if not input_p.exists():
        print(f"[跳过] {shot_id}: 未找到 {input_p}")
        return False

    if output_p.exists() and not force:
        print(f"[跳过] {shot_id}: 已存在 {output_p.name}（加 --force 可覆盖）")
        return False

    print(f"[处理] {shot_id}: {input_p.name} → {output_p.name}")
    extract_last_seconds(input_p, output_p, duration, ffmpeg)
    print(f"       完成 ({output_p.stat().st_size / 1024:.1f} KB)")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--shot", help="只处理指定 shot（如 shot_1）；留空则处理全部")
    parser.add_argument("--duration", type=float, default=5.0, help="截取末尾时长秒数（默认 5.0）")
    parser.add_argument("--force", action="store_true", help="覆盖已存在的 ref 视频")
    args = parser.parse_args()

    REF_VIDEO_DIR.mkdir(exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    if args.shot:
        process_shot(args.shot, args.duration, args.force, ffmpeg)
        return

    # 处理全部
    shots = sorted(p.stem for p in EP_VIDEO_DIR.glob("shot_*.mp4"))
    if not shots:
        print(f"[提示] {EP_VIDEO_DIR} 下没有 shot_*.mp4 文件")
        return

    processed = 0
    for shot_id in shots:
        if process_shot(shot_id, args.duration, args.force, ffmpeg):
            processed += 1
    print(f"\n完成：扫描 {len(shots)} 条，实际处理 {processed} 条")


if __name__ == "__main__":
    main()
