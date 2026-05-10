# Shot ID 命名与素材引用规则

内部网关调用、后处理脚本和画廊都依赖本规则做识别和排序——违反会导致文件错乱或连续性参数错误。

## 1. shot_id 命名

```
shot_{n}              公共主线剧情，n 从 1 开始递增
shot_{n}a / shot_{n}b 同一叙事段拆分（台词/动作太多单条装不下时）
shot_{n}-{m}          分支剧情，n 为父节点序号，m 为分支编号
shot_{n}-{m}{letter}  分支剧情内部再拆分
shot_{n}_v{N}         同一镜头的迭代版本（v2/v3/v4...）保留对比
```

### 示例

| shot_id | 含义 |
|---|---|
| `shot_1` | 第 1 个镜头 |
| `shot_3a` / `shot_3b` | 第 3 段拆成两个子镜头（情绪弧太长） |
| `shot_5-1` / `shot_5-2` | 从 shot_5 分出的 2 个分支 |
| `shot_5-2a` / `shot_5-2b` | shot_5-2 分支内再拆 |
| `shot_1b_v6` | shot_1b 的第 6 版迭代（保留 v1-v5 做 A/B 对比） |

### 严禁

- 跳号（出现 shot_3 但没有 shot_1/shot_2）
- 重复（同一 id 被两次生成而不加 a/b 区分）
- 中文/空格/特殊字符
- 分支混用其他分隔符（必须用 `-`，不能用 `_`）

## 2. 素材引用：@图N ↔ assets.images 顺序铁律

prompt 正文里的 `@图1 / @图2 / @图3` 是**写给 Seedance 的**——是 reference image 的顺序索引。
frontmatter 的 `assets.images` 是**写给本项目脚本和内部网关的**——正式生成时必须是 OSS URL，不能是本地文件路径。

本地图片/视频只允许作为上传前草稿。真正调用前必须先执行 `scripts/bin/videoctl upload` 上传，并把 frontmatter 改成 OSS URL，或保留同名 `.url` sidecar 让脚本解析。`videoctl payload` 会拒绝没有 OSS URL 的素材，防止漏传参考图。

**两者必须严格按顺序对应**：

```yaml
assets:
  images:
    - https://.../scene_kitchen_panorama.png            # → @图1
    - https://.../shot_2_end.png                        # → @图2
    - https://.../Sylvia人物立绘_藕粉日常.jpg             # → @图3
  videos:
    - https://.../shot_2.mp4                            # 请求网关时传 sourceVideoUrls
```

prompt 正文里写：
```
@图1 空间地图（厨房三墙全景），@图2 时间承接（shot_2 末帧），@图3 Sylvia 角色 DNA。
```

**顺序错位会导致 Seedance 把场景图当立绘用、把立绘当末帧锚用**，画面全崩。写 frontmatter 时必须逐一核对路径与 @图N 索引。

## 3. 时间承接：末帧锚图 + 上一镜视频

所有跨 shot 时间承接都走内部网关。`shot_2+` 必须同时提供上一镜末帧锚图和上一镜视频 URL；请求字段分别放入 `referenceImageUrls` 和 `sourceVideoUrls`。多参考图：`sourceImageUrl` 传主图，`referenceImageUrls` 传其余。

**所有字段都必须是 OSS URL**。本地 `works/.../*.png`、`works/.../*.mp4` 等路径不能直接进入生成 payload。

### 标准流程

1. 前一 shot 生成完毕后，抽末帧到 `{作品}/episodes/ep_{N}/end-frames/{shot_id}_end.png`，并保留上一镜视频 URL。
2. 当前 shot 在 frontmatter 记录：

```yaml
assets:
  images:
    - https://.../scene_X_panorama.png              # 空间地图
    - https://.../{prev_shot_id}_end.png            # ← 时间承接锚图
    - https://.../{角色}人物立绘_*.jpg               # 角色 DNA
  videos:
    - https://.../{prev_shot_id}.mp4
previous_video_url: https://.../{prev_shot_id}.mp4
previous_frame_url: https://.../{prev_shot_id}_end.jpg
```

3. 请求内部网关时传 `sourceImageUrl`（主参考图）、`referenceImageUrls`（其余参考图数组）、`sourceVideoUrls`。
4. prompt 关键场景 ① 第一个动词必须是渐变动词（缓/微/渐/轻/慢）承接首帧姿势。

### 特殊情况：首尾帧双锚（仅复杂走位戏）

12s+ 多角色走位戏 / 站位强约束 + 动态变化都要的镜头，可以走首尾帧双锚（详见 SEEDANCE_LESSONS #5 三层 reference 之外的补充模式）：

```yaml
mode: 首尾帧双锚
first_frame: https://.../anchor_X_first.jpg            # 不进 assets.images
last_frame: https://.../anchor_X_last.jpg              # 不进 assets.images
assets:
  images: []
  videos: []
```

注意：首尾帧模式下具体可混用字段以内部网关能力为准；不再绕过内部网关调用底层服务。

## 4. 文件命名规范（项目实际使用）

| 用途 | 目录 | 命名格式 | 实际示例 |
|---|---|---|---|
| 场景全景图（21:9 三墙） | `{作品}/assets/` | `scene_{location}_panorama.png` | `scene_kitchen_panorama.png` |
| 角色立绘（按 character-dna.md 映射） | `{作品}/assets/` | 见 character-dna.md 立绘文件映射 | `costume_sylvia.png` / `char_james_portrait.png` |
| 末帧锚图（自动生成·时间承接） | `{作品}/episodes/ep_{N}/end-frames/` | `{shot_id}_end.png` | `shot_2_end.png` |
| 空间参考帧（人工选取·站位/朝向） | `{作品}/episodes/ep_{N}/end-frames/` | `{shot_id}_spatial.png` | `shot_2_spatial.png` |
| 首尾帧双锚手动锚图 | `{作品}/ref-frames/ep_{N}/` | `anchor_{shot_id}_{first/last}.jpg` | `anchor_shot_10-3_first.jpg` |

**末帧 vs 空间参考帧的分工**：两者都放在 `{作品}/episodes/ep_{N}/end-frames/`，用途不同——`_end.png` 锁交接姿态，`_spatial.png` 锁场景布局和人物站位朝向（L3/L4 场景必须两张都有）。

剧本：`{作品}/scripts/ep_{N}.json`（必读，详见 SKILL.md Step 1 + seedance-lessons.md #4）。
