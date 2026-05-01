# Video Agent Test

互动短剧视频逐镜头生成测试管线。用 Claude Code + 即梦 Seedance 2.0 协作跑通"剧本 → prompt → 视频 → 画廊"的完整流程。

## 初次使用

### 1. 安装依赖

本项目用 Python 3 的 `imageio-ffmpeg`（内置 ffmpeg 二进制，不需要系统安装 ffmpeg）：

```bash
pip3 install imageio-ffmpeg
```

### 2. 打开 Claude Code 并切换到本项目

```bash
cd ~/Desktop/video-agent-test
claude
```

Claude Code 会自动读取 `CLAUDE.md`，了解项目工作流。

### 3. 准备素材

- 把剧本文件放到 `script/`（txt/md/json 都可）
- 把人物立绘、场景空镜放到 `portrait_and_scene/`

素材命名建议（非强制）：
```
portrait_and_scene/
├── scene_kitchen.png      # 厨房空镜
├── scene_cemetery.png     # 公墓空镜
├── Sylvia_portrait.png    # 主角立绘
├── James_portrait.png
└── Kennedy_portrait.png
```

### 4. 开始生成

跟 Claude Code 说：

> 生成 ep1 的 shot_1

Claude 会：
1. 读 `script/` 下的剧本
2. 按 Seedance skill 规则写出 shot_1 的 prompt
3. 保存到 `ep_video/shot_1.md`
4. 告诉你去哪个入口、上传哪些素材、粘贴 prompt、duration 填多少
5. **停下等你反馈**

你去即梦生成，把视频下载回来命名为 `shot_1.mp4` 放到 `ep_video/`，告诉 Claude：

> shot_1 已生成

Claude 会：
1. 核实文件存在
2. 运行 `gen_ref_video.py` 裁剪末 5s 到 `gen_ref_video/shot_1_ref.mp4`
3. 运行 `build_gallery.py` 更新画廊
4. 停下等你说"继续 shot_2"

### 5. 查看画廊

浏览器打开 `gen_video_gallery.html`（双击即可）。每条 shot 一行，显示：
- 生成好的视频
- 末 5s 的 ref 视频（供下一镜头引用）
- 引用的所有参考图/参考视频（缩略图）
- 完整 prompt（可一键复制）

每生成一条画廊就自动刷新一次。

## 目录说明

| 目录 | 谁写入 | 内容 |
|---|---|---|
| `script/` | 你 | 剧本文件（任意格式） |
| `portrait_and_scene/` | 你 | 人物立绘、场景空镜、首尾帧锚图 |
| `ep_video/` | 你（放 mp4）+ Claude（写 md） | `shot_x.mp4` 是你放的生成好的视频；`shot_x.md` 是 Claude 写的 prompt |
| `gen_ref_video/` | gen_ref_video.py 自动 | 每个视频的末 5s，命名 `shot_x_ref.mp4` |
| `skills/` | 已内置 | agent 的工作流和命名规则 |

## 脚本调用

所有脚本都可独立运行（Claude 会在正确时机调用，你也可以手动跑）：

```bash
# 裁剪单条
python3 gen_ref_video.py --shot shot_1

# 裁剪所有未处理的
python3 gen_ref_video.py

# 强制覆盖
python3 gen_ref_video.py --shot shot_1 --force

# 改裁剪时长
python3 gen_ref_video.py --shot shot_1 --duration 3

# 更新画廊
python3 build_gallery.py
```

## Shot ID 命名

- 主线递增：`shot_1 / shot_2 / shot_3 ...`
- 同段拆分（台词太长）：`shot_3a / shot_3b`
- 分支剧情：`shot_5-1 / shot_5-2 / shot_5-3`

完整规则见 `skills/SHOT_ID_POLICY.md`。

## Prompt 规则

写 prompt 时 Claude 会遵守桌面那份完整的 Seedance skill：

```
~/Desktop/System Prompt 即梦 Seedance 2.0 互动剧本视频化专家.md
```

里面定义了：
- A 段 Definition：5 种衔接情况
- B 段 Prompt 开头句式
- E-1 零字幕四层防御
- E-6 英语对白口型同步格式
- E-7 禁止清单模板
- E-8 景别硬锁（推到目标景别后停止）
- E-9 收尾三重静止
- E-10 面部朝向反向约束
- E-11 情绪弧优先拆分
- E-12 钩子密度
- G 段 台词守护拆分

如果该文件不在 `~/Desktop/` 或移动了位置，请修改本项目 `CLAUDE.md` 里的引用路径。

## 排错

### 画廊空白或缺信息
检查 `ep_video/shot_X.md` 是否有正确的 frontmatter（开头三道 `---` 分隔符）。

### gen_ref_video.py 报错
视频时长不足 5s。加 `--duration 3` 或 `--duration 2`。

### 即梦生成的视频有字幕浮现
说明 E-1 零字幕约束没写进 prompt 头部。让 Claude 重写 prompt，确保前 200 字有"全程无字幕、无 subtitle、无 caption..."。

### 镜头推过头 / 收尾不静止
上一轮测试反馈的通病。Claude 应按 E-8 景别硬锁 + E-9 收尾三重静止写 prompt。如果仍失败，说明规则优先级还需调整。

## 设计原则

1. **一次一条**：agent 严格逐镜头生成，不批量，杜绝"写了一堆 prompt 但没一条能用"
2. **文件 >  对话**：prompt 必须落盘到 `.md` 文件，不放在聊天对话里，方便用户复制和回溯
3. **参考可追溯**：每个 shot 的 frontmatter 明确记录引用的素材，画廊能一眼看到"这条视频是用了哪些素材生成的"
4. **脚本自动化繁琐步骤**：裁剪 / 画廊生成交给脚本，agent 只负责思考和写 prompt
