# 视频分镜生成系统

互动短剧的逐镜头视频 prompt 生成管线。用 Claude Code 打开本项目，说"生成 EP2"即可开始。

## 目录结构

```
video-agent-claude-wangbo/
├── agent-skills/video-episode-generation/   # Skill 包（agent 的工作流入口）
│   ├── SKILL.md                             # 唯一入口（内嵌完整 SOP）
│   ├── references/                          # 按步骤强制加载的参考文档
│   │   ├── authority-prompt-template.md     # 九段式 prompt 格式参考（五镜实例，仅参考格式）
│   │   ├── character-dna.md                 # 角色服装锁 + 立绘映射
│   │   ├── seedance-lessons.md              # Seedance 生成经验
│   │   ├── director-playbook.md             # 镜头语言速查
│   │   ├── shot-id-policy.md                # Shot 命名规则
│   │   ├── review-checklist.md              # 独立审核 27 项检查（7 组）
│   │   ├── deep-analysis.md                 # 深度问题分析
│   │   ├── problems-log.md                  # 历史问题日志
│   │   └── memory.md                        # 跨会话生产经验记忆
├── scripts/videoctl/                        # Go CLI 入口（视频任务唯一执行入口）
├── internal/                                # videoctl 内部模块
│
├── works/                                   # 活跃工作区
│   └── silver-moon-manor/                   # 作品：银月庄园
│       ├── PLAN.md                          # 动态生产计划（打勾式）
│       ├── assets/                          # 人物立绘 + 场景图
│       ├── scripts/                         # 剧本 JSON（ep_1~ep_20）
│       ├── ref-frames/                      # 参考帧（按集分目录）
│       └── episodes/ep_{N}/shots/           # 各镜头 prompt
│
├── archive/                                 # 完成作品归档（待用）
└── .env.example                             # 环境变量模板
```

## 使用方式

### 环境配置

```bash
cp .env.example .env
# 填入 AGENT_API_KEY（找 Rydia 内部分发）
make build
```

### Claude Code CLI

本仓库提供 `scripts/claude-mob` 包装脚本，用于把 Claude Code 指向 Mob-AI Anthropic 兼容网关。脚本默认使用 `https://ai.mob-ai.cn`、`claude-opus-4-6:free` 和 `CLAUDE_CODE_EFFORT_LEVEL=max`，但不会在仓库里保存 token。

```bash
mkdir -p .claude
cat > .claude/mob-ai.env <<'EOF'
ANTHROPIC_AUTH_TOKEN=<token>
EOF

scripts/claude-mob
```

`.claude/` 已被 `.gitignore` 忽略；不要把真实 token 写进可提交文件。

### 生成视频 prompt

在 Claude Code 中说：
- "生成 EP2 的 shot_1" — 生成单个镜头
- "生成 EP2" — 生成整集所有镜头
- "开启钟文鼎特批危险超速生成模式" — 跳过用户确认（仅限特殊场景）

### 默认流程（interactive 模式）

1. Agent 读剧本 → 分析情绪 → 写九段式 prompt
2. 独立 Reviewer 冷读审核 27 项检查
3. **主控 Agent 审核后停下等你确认**（你可以直接打开 .md 手改 prompt）
4. 你说"可以生成了" → Agent 验证 URL → 调用 Seedance 生成

**安全机制**：默认情况下，每个镜头的视频生成必须经过用户确认。Agent 检测到你手动修改了 prompt.md 时，会自我反思并将经验写入 memory.md。只有用户明确说出"开启钟文鼎特批危险超速生成模式"，Agent 才会在不等待确认的情况下自行调用视频生成（URL 验证仍然强制执行）。

### 脚本

Go CLI 是视频任务的唯一脚本入口。源码入口在 `scripts/videoctl/`，本地编译产物放在 `scripts/bin/videoctl`。Agent 使用前应先读 `scripts/videoctl/AGENT_REFERENCE.md`。

```bash
# 编译
make build

# 上传本地素材到 OSS，并在旁边写 <file>.url
scripts/bin/videoctl upload <file...>

# 验证 prompt 中所有 URL 可达且内容类型正确
scripts/bin/videoctl validate <prompt.md>

# 从 prompt.md 构建 API payload（调试用）
scripts/bin/videoctl payload <prompt.md>

# 生成 dry-run request.json，不调用网关
scripts/bin/videoctl submit <prompt.md> --dry-run --run-dir <run_dir>

# 提交并等待生成完成（默认最多 1200 秒，30 秒轮询）
scripts/bin/videoctl submit <prompt.md> --wait

# 下载视频 URL 并写 .url sidecar
scripts/bin/videoctl download <video_url> --out <shot.mp4>

# 抽末帧和空间候选帧
scripts/bin/videoctl extract-end-frame <shot.mp4> <shot_end.png>
scripts/bin/videoctl extract-candidates <shot.mp4> <end_frames_dir> --shot-id <shot_id>
scripts/bin/videoctl select-spatial-frame <chosen_candidate.png> <shot_spatial.png>
```

## API

视频生成统一通过 `scripts/bin/videoctl submit <prompt.md> --wait` 进入外部分发生成接口：

```
POST https://agent.mob-ai.cn/api/external/video/generate
Authorization: Bearer $AGENT_API_KEY
```

`AGENT_API_KEY` 仍由 `.env` 提供；网关端点由 CLI 封装，不要手写 HTTP 请求绕过 CLI。

视频生成最长等待 20 分钟（1200 秒），不要提前判定超时。

视频生成前，所有本地图片/视频素材都必须先通过 `/api/external/video/oss/upload` 上传到 OSS。`prompt.md` frontmatter 里的 `assets.images`、`assets.videos`、`previous_video_url`、`previous_frame_url` 应该是 OSS URL；本地路径只适合作为上传前草稿，不应进入正式生成 payload。

`videoctl payload` 是视频生成 payload 构建器：它只负责从 `prompt.md` 生成 `/api/external/video/generate` 的 JSON，不会发请求。它会拒绝没有 OSS URL 或 `.url` sidecar 的本地素材，避免视频生成时漏传参考图/参考视频。

## 注意事项

- **不要手动创建 PLAN.md**，Agent 读完工作流后会自动创建
- **memory.md** 是跨会话积累的，Agent 会在发现问题时自动更新
- 作品完成后可以把 `works/{novel_id}/` 归档到 `archive/{novel_id}/`，然后在 `works/` 下继续做下一个活跃作品
