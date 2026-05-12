# videoctl Agent Reference

本文件是 Go `videoctl/bin/videoctl` 的 agent 操作参考。当前项目内的 prompt 工作流规则在
`knowledge/novel-to-video/`；Claude Code skill 源文件在 `claude-skills/novel-to-video/SKILL.md`。

`videoctl` 是视频执行唯一 CLI 入口。不要调用旧 Python 脚本，不要手写 `curl` / `requests.post`
直连内部网关。

## 1. Mental Model

Agent 负责：

1. 读剧本和 references
2. 写 `prompt.md`
3. 做 review
4. 等用户确认
5. 调用 `videoctl`
6. 汇报可验证的命令输出和产物路径

`videoctl` 负责：

1. 解析 `prompt.md`
2. 解析本地路径和 `.url` sidecar
3. 验证媒体 URL
4. 构建网关 payload
5. 提交视频任务
6. 按 30 秒轮询，最多等 1200 秒
7. 写 run 目录产物
8. 下载视频
9. 调 ffmpeg 抽帧

## 2. Build And Availability

在仓库根目录执行：

```bash
test -x videoctl/bin/videoctl || make -C videoctl build
videoctl/bin/videoctl help
```

如果 `videoctl/bin/videoctl` 不存在或不可执行，先运行：

```bash
make -C videoctl build
```

不要用 `go run ./cmd/videoctl ...` 作为日常命令。SKILL 和 README 约定的稳定入口是
`videoctl/bin/videoctl`。

## 3. Command Decision Tree

| 任务 | 使用命令 |
|---|---|
| 上传本地素材并写 `.url` | `videoctl/bin/videoctl upload <file...>` |
| 查看 prompt 会发给网关的 JSON | `videoctl/bin/videoctl payload <prompt.md>` |
| 生成前验证所有素材 URL | `videoctl/bin/videoctl validate <prompt.md> --timeout 300` |
| 只生成 request，不调用网关 | `videoctl/bin/videoctl submit <prompt.md> --dry-run --run-dir <run_dir>` |
| 提交并等待视频结果 | `videoctl/bin/videoctl submit <prompt.md> --wait` |
| 读取 run 状态 | `videoctl/bin/videoctl status <run_dir>` |
| 下载视频 URL | `videoctl/bin/videoctl download <video_url> --out <shot.mp4>` |
| 抽末帧 | `videoctl/bin/videoctl extract-end-frame <shot.mp4> <shot_end.png>` |
| 抽空间候选帧 | `videoctl/bin/videoctl extract-candidates <shot.mp4> <out_dir> --shot-id <shot_id>` |
| 选定空间帧 | `videoctl/bin/videoctl select-spatial-frame <candidate.png> <shot_spatial.png>` |
| 单镜提交、下载、抽末帧 | `videoctl/bin/videoctl run-shot <prompt.md> --download --extract-end-frame` |

## 4. Standard Interactive Flow

用户确认“可以生成了”后，执行以下顺序。

```bash
cd /Users/Clock/moonshort/assets-produce
test -x videoctl/bin/videoctl || make -C videoctl build

PROMPT="video-agent-test/works/<novel_id>/episodes/ep_<N>/shots/<shot_id>/prompt.md"

videoctl/bin/videoctl validate "$PROMPT" --timeout 300
videoctl/bin/videoctl submit "$PROMPT" --wait
```

成功后，从命令输出或最新 run 目录的 `video.url` 读取 URL：

```bash
videoctl/bin/videoctl status "video-agent-test/works/<novel_id>/episodes/ep_<N>/shots/<shot_id>/runs/<timestamp>"
```

然后下载和后处理：

```bash
VIDEO_URL="<video URL from output or video.url>"
VIDEO_OUT="video-agent-test/works/<novel_id>/episodes/ep_<N>/videos/<shot_id>.mp4"
END_FRAME="video-agent-test/works/<novel_id>/episodes/ep_<N>/end-frames/<shot_id>_end.png"
END_DIR="video-agent-test/works/<novel_id>/episodes/ep_<N>/end-frames"

videoctl/bin/videoctl download "$VIDEO_URL" --out "$VIDEO_OUT"
videoctl/bin/videoctl extract-end-frame "$VIDEO_OUT" "$END_FRAME"
videoctl/bin/videoctl extract-candidates "$VIDEO_OUT" "$END_DIR" --shot-id "<shot_id>"
```

读取候选帧后，选择最能看清人物站位和朝向的一张：

```bash
videoctl/bin/videoctl select-spatial-frame "<chosen_candidate.png>" \
  "video-agent-test/works/<novel_id>/episodes/ep_<N>/end-frames/<shot_id>_spatial.png"
```

## 5. One-Shot Flow

如果用户明确希望直接完成单镜生成和基础后处理，可以用：

```bash
videoctl/bin/videoctl run-shot "$PROMPT" --download --extract-end-frame
```

`run-shot` 会提交并等待结果，然后下载视频并抽末帧。空间候选帧和空间帧选择仍建议显式执行，因为 Agent 需要看候选图后判断。

## 6. Run Directory Contract

每次 live submit 会写：

```text
<shot-dir>/runs/<YYYYMMDD-HHMMSS>/
```

常见文件：

| 文件 | 含义 | Agent 应如何使用 |
|---|---|---|
| `request.json` | 实际发给网关的 payload | 失败复盘时检查 |
| `submit-response.json` | 网关提交响应 | 判断网关原始返回 |
| `poll.jsonl` | 每次轮询记录 | 长任务复盘时检查 |
| `result.json` | 成功结果 | 汇报时可引用 |
| `video.url` | 最终视频 URL | 下载和传给下一镜 |
| `error.json` | 失败结果 | 失败时必须读取并摘要 |
| `state.json` | 本地状态 | `status` 命令读取 |

汇报时不要说“应该成功”。应说：

```text
已用 videoctl/bin/videoctl submit ... --wait 生成，run 目录为 ...
video.url 已写入 ...
```

## 7. Media URL Rules

正式生成前，`prompt.md` frontmatter 中的媒体必须是：

1. OSS URL；或
2. 本地路径旁边有同名 `.url` sidecar，sidecar 内容是 OSS URL。

本地路径没有 sidecar 时，`payload` 和 `validate` 会失败。这是正确阻断，不要绕过。

上传本地素材：

```bash
videoctl/bin/videoctl upload video-agent-test/works/<novel_id>/assets/<file.png>
```

上传成功后，会写：

```text
video-agent-test/works/<novel_id>/assets/<file.png>.url
```

## 8. Dry Run And Debugging

生成前排查 payload：

```bash
videoctl/bin/videoctl payload "$PROMPT"
```

写 run 目录但不调用网关：

```bash
videoctl/bin/videoctl submit "$PROMPT" --dry-run --run-dir /tmp/videoctl-dry-run
```

检查：

```bash
python -m json.tool /tmp/videoctl-dry-run/request.json >/dev/null
videoctl/bin/videoctl status /tmp/videoctl-dry-run
```

`payload` 只用于预览和排查。不要把它输出的 JSON 拿去手动 POST。

## 9. Failure Handling

| 现象 | 处理 |
|---|---|
| `videoctl/bin/videoctl` 不存在 | 运行 `make -C videoctl build` |
| `AGENT_API_KEY is required` | 检查 `.env` 或环境变量 |
| 本地素材缺 `.url` | 先 `upload`，或补 sidecar |
| `不是 OSS URL` | 上传到 OSS，或确认 sidecar 内容 |
| URL Content-Type 错误 | 换正确素材 URL |
| submit 失败 | 读 run 目录 `error.json` |
| 已有成功 run 阻止重复提交 | 使用已有 `video.url`，或明确需要重生时加 `--force` |
| ffmpeg 失败 | 确认系统有 ffmpeg，或设置 `FFMPEG=/path/to/ffmpeg` |

## 10. Do Not Do These

- 不要调用旧 Python 脚本。
- 不要手写 `curl` / `requests.post`。
- 不要把 `payload` 输出拿去手动 POST。
- 不要在 `validate` 失败后继续生成。
- 不要 120 秒就判定超时；videoctl 默认最多等待 1200 秒。
- 不要覆盖旧 run 目录。
- 不要把 `.mp4`、`.png`、`.jpg` 等重媒体作为新增 git 内容提交。

## 11. Minimal E2E Smoke Test

不调用真实网关的本地 smoke test：

```bash
tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/assets"
printf '%s\n' 'https://bucket.oss-cn-shanghai.aliyuncs.com/source.png' > "$tmpdir/assets/source.png.url"
cat > "$tmpdir/prompt.md" <<EOF
---
duration: 12s
ratio: 9:16
first_frame: $tmpdir/assets/source.png
assets:
  images: []
  videos: []
---
Prompt body.
EOF

videoctl/bin/videoctl submit "$tmpdir/prompt.md" --dry-run --run-dir "$tmpdir/run" --json
videoctl/bin/videoctl status "$tmpdir/run"
```

成功标准：

- `request.json` 存在且是合法 JSON
- `state.json` 存在且状态是 `dry_run`
- `status` 命令能读取该 run

## 12. Expected Agent Summary

完成生成后，Agent 的汇报应包含：

```text
已执行:
- videoctl/bin/videoctl validate <prompt.md> --timeout 300
- videoctl/bin/videoctl submit <prompt.md> --wait

run 目录: <shot-dir>/runs/<timestamp>/
视频 URL: <...>（已写入 video.url）
本地视频: <...>.mp4
末帧: <...>_end.png
空间帧: <...>_spatial.png（如果已选择）
```

失败时，汇报应包含：

```text
失败命令: ...
run 目录: ...
error.json 摘要: ...
下一步: 上传缺失素材 / 修正 URL / 重试 submit --force / 等
```
