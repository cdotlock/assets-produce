# Shot ID 命名与素材引用规则

## 1. Shot ID 命名

所有生成的视频必须按以下规则命名，否则 `gen_ref_video.py` 和 `build_gallery.py` 会识别不到或排序错乱。

### 基础命名

```
shot_{n}              公共主线剧情，n 从 1 开始递增
shot_{n}a / shot_{n}b 同一叙事段拆分（台词/动作太多单条装不下时）
shot_{n}-{m}          分支剧情，n 为父节点序号，m 为分支编号
shot_{n}-{m}{letter}  分支剧情内部再拆分
```

### 示例

| shot_id | 含义 |
|---|---|
| `shot_1` | 第 1 个镜头（通常是全剧首镜） |
| `shot_2` | 第 2 个镜头 |
| `shot_3a` / `shot_3b` | 第 3 段剧情拆成两个子镜头（情绪弧太长） |
| `shot_5-1` | 从第 5 个镜头分出的第 1 个分支 |
| `shot_5-2` / `shot_5-3` | 同上，第 2/第 3 个分支 |
| `shot_5-2a` / `shot_5-2b` | 第 5-2 分支内又拆分 |

### 严禁

- 跳号（出现 shot_3 但没有 shot_1/shot_2）
- 重复（同一 id 被两次生成而不加 a/b 区分）
- 中文/空格/特殊字符
- 分支混用其他分隔符（必须用 `-`，不能用 `_`）

## 2. 素材引用约定

### 素材来源目录

| 目录 | 存放内容 | 文件名约定 |
|---|---|---|
| `portrait_and_scene/` | 场景空镜图、人物立绘、首尾帧锚图 | 自由命名，建议语义化（如 `kitchen_empty.png` / `Sylvia_portrait.png`） |
| `gen_ref_video/` | 前序 shot 的末 5s（由 gen_ref_video.py 生成） | 严格遵守 `shot_{id}_ref.mp4` |
| `script/` | 剧本文本 | 自由命名（如 `ep1.txt` / `ep1.json`） |

### prompt 里 @引用 到 frontmatter 路径的对应关系

prompt 正文里的 `@图1 / @图2 / @视频1` 是**写给即梦**的，是**在即梦平台里人工上传素材**时的顺序标签。  
frontmatter 的 `assets.images / assets.videos` 是**写给本项目的画廊系统**的，是**文件系统里实际的文件路径**。

两者必须**严格按顺序对应**：

```yaml
assets:
  images:
    - portrait_and_scene/kitchen_empty.png      # 对应 prompt 里的 @图1
    - portrait_and_scene/Sylvia_portrait.png    # 对应 prompt 里的 @图2
    - portrait_and_scene/James_portrait.png     # 对应 prompt 里的 @图3
  videos:
    - gen_ref_video/shot_1_ref.mp4              # 对应 prompt 里的 @视频1
```

prompt 正文里写：
```
@图1 是 [银月领地豪宅厨房空镜]，@图2 是 [Sylvia立绘]，@图3 是 [James立绘]。
@视频1 是 [银月领地豪宅厨房] 场景里 shot_1 分镜的完整视频。
```

**顺序错位会导致即梦生成时素材挂错**。agent 写 frontmatter 时必须逐一核对。

## 3. 跨场景/跨分支的 ref 视频选择

情况二-A（同场景延续）：  
`@视频1 = gen_ref_video/shot_前一条_ref.mp4`

情况三-B（跨场景衔接）：  
`@视频1 = gen_ref_video/shot_上场景最后一条_ref.mp4`（ref 只有末 5s，这是故意的：跨场景只需要动作轨迹参考，不需要完整场景）

分支首镜（情况三-A，首尾帧模式）：  
不引用 ref 视频，只引用预先生成的**首帧锚图**（放在 `portrait_and_scene/` 下，命名建议 `shot_5-2_first_frame.png`）

## 4. 特殊情况：首尾帧模式的素材声明

首尾帧模式走**首尾帧**入口而非多参考，frontmatter 示例：

```yaml
shot_id: shot_5-2
duration: 7s
mode: 首尾帧
scene: 银月领地豪宅客厅
emotion_arc: 分支首镜
assets:
  images:
    - portrait_and_scene/shot_5-2_first_frame.png   # 首帧锚图
    - portrait_and_scene/shot_5-2_last_frame.png    # 尾帧锚图（可选）
    - portrait_and_scene/Avery_portrait.png         # 人物立绘
  videos: []
```

prompt 正文开头必须是 `@图1 作为首帧，@图2 作为尾帧。` 或仅 `@图1 作为首帧。`

## 5. 文件命名建议（portrait_and_scene/）

为了画廊和 agent 调用时清晰，建议按以下前缀命名素材：

| 前缀 | 用途 | 示例 |
|---|---|---|
| `scene_` | 场景空镜 | `scene_kitchen.png` / `scene_cemetery.png` |
| `char_` 或角色英文名 | 人物立绘 | `char_Sylvia.png` / `Sylvia_portrait.png` |
| `anchor_` 或 `shot_X_` | 首尾帧锚图 | `anchor_kitchen_Sylvia_stunned.png` / `shot_5-2_first_frame.png` |

这是建议不是强制——只要 frontmatter 里的路径和真实文件名一致即可。
