# Video Agent Test — 项目指南（Claude Code 打开本项目时的入口）

## 项目目的

**测试互动短剧视频的逐镜头生成管线**。用户提供剧本和素材，你（Claude Code）按 Seedance skill 规则写出单条 prompt，用户去即梦生成视频后放回来，你再帮他做 ref 视频裁剪和画廊更新。

## 最重要的规则（读完这一段再做任何事）

1. **严格按 `skills/WORKFLOW.md` 定义的 SOP 执行**。那里写清楚了每一步做什么、什么时候必须停。
2. **每生成完一个镜头就停下等用户确认**。不要一次做多条。不要自作主张跳到下一条。
3. **prompt 规则遵守外层 skill**：  
   `/Users/listrawberry/Desktop/System Prompt 即梦 Seedance 2.0 互动剧本视频化专家.md`  
   这个文件比本项目的任何说明都更权威。写 prompt 时优先查它。
4. **不要假设文件存在**——做任何操作前先 ls / Read 核对路径。

## 读文件的优先级

按以下顺序消化项目上下文：

1. 本文件（你正在读）
2. `skills/WORKFLOW.md` — 工作流 SOP（**必读**）
3. `skills/SHOT_ID_POLICY.md` — shot 命名与素材引用规则（**必读**）
4. `/Users/listrawberry/Desktop/System Prompt 即梦 Seedance 2.0 互动剧本视频化专家.md` — Seedance prompt 规则（写 prompt 前必读）
5. `README.md` — 用户手册（可略读，主要给用户看）

## 目录结构速查

```
video-agent-test/
├── CLAUDE.md                     # 本文件
├── README.md                     # 给用户的使用手册
├── gen_ref_video.py              # 裁剪末 5s 工具脚本
├── build_gallery.py              # 生成画廊 HTML 工具脚本
├── gen_video_gallery.html        # 画廊页面（浏览器打开）
├── script/                       # 用户放剧本
├── portrait_and_scene/           # 用户放人物立绘/场景空镜/锚图
├── ep_video/                     # 用户放回生成的视频 shot_x.mp4
│                                 # agent 写的 prompt 文件 shot_x.md
├── gen_ref_video/                # 脚本自动生成 shot_x_ref.mp4
└── skills/
    ├── WORKFLOW.md
    └── SHOT_ID_POLICY.md
```

## 典型交互模式

### 用户首次打开项目

用户大概会说："准备好了，帮我生成 ep1 的 shot_1" 或类似的话。

你要：
1. `ls script/` 确认剧本存在
2. `ls portrait_and_scene/` 确认素材存在
3. 按 WORKFLOW.md Step 1-5 做：识别情绪弧 → 决定素材 → 写 prompt → 写 shot_1.md → **停下交接给用户**

### 用户说"shot_X 已生成"

你要：
1. `ls ep_video/shot_X.mp4` 核实
2. `python3 gen_ref_video.py --shot shot_X` 裁剪
3. `python3 build_gallery.py` 更新画廊
4. **停下**等用户说"下一个"

### 用户说"shot_X 有问题要重新生成"

你要：
1. 先问**具体什么问题**（字幕/孕肚/景别/动作/对口型……）
2. 根据反馈调整 prompt 的对应部分，改 `ep_video/shot_X.md`
3. **停下**让用户拿新 prompt 去即梦重生

## 常见错误模式（避免）

| 错误 | 正确做法 |
|---|---|
| 用户说"生成 shot_1" 你直接输出 prompt 在聊天里 | 必须写到 `ep_video/shot_1.md`，然后在聊天里汇报文件已写好 |
| 一次写 shot_1、shot_2、shot_3 的 prompt | 一次只写一条，等用户跑完反馈 |
| 假设即梦已经生成了视频 | 看用户明确说"shot_X 已生成"才处理后续 |
| 编造 portrait_and_scene/ 里的文件名 | 先 `ls portrait_and_scene/` 看实际有哪些文件 |
| 帮用户在 frontmatter 里写不存在的 ref 视频路径 | 先 `ls gen_ref_video/` 看哪些 ref 已经生成了 |
| 跳过 `--- ---` frontmatter 直接写 prompt 正文 | build_gallery.py 依赖 frontmatter 解析，缺了画廊会空 |
| 把 prompt 外层 skill 的规则忘在脑后 | 写 prompt 时先 Read 外层 skill 的 A/B/E-6/E-7/E-8/E-9/E-10/E-11/E-12 段 |

## 调试建议

- 画廊空白 / 缺信息 → 检查 `ep_video/shot_X.md` 的 frontmatter 是否合法
- `gen_ref_video.py` 报错 → 视频时长不够，加 `--duration 3`
- 生成视频有字幕 → 检查 prompt 头部"全程无字幕..."那一段是否出现在最前 200 字内
- 镜头推过头 / 收尾不静止 → 检查是否按 E-8/E-9 规则写了景别硬锁和三重静止

## 记住

你的角色是**互动剧本的 prompt 编剧 + 管线运维**，不是视频生成器。视频生成的工作是用户拿着你的 prompt 去即梦做的。你的稳定性和节奏控制（按一条做一条、严格等确认）比 prompt 写得多花哨更重要。
