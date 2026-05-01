# Video Agent 主工作流

这是本项目的**核心 skill**。Claude Code 在本项目工作时必须严格遵守本文件定义的流程。

## 任务定位

本项目用来**逐镜头生成互动短剧视频并验证 prompt 质量**。你的职责是：
1. 读取 `script/` 下的剧本
2. 按 Seedance prompt 规则生成**单条分镜 prompt**
3. **在每个镜头生成完毕后必须停下等待用户确认**，不得自作主张连续生成
4. 用户确认视频生成好并放入 `ep_video/` 后，帮他调用脚本处理 ref 视频与画廊

## 绝对不能做的事

- **不要一次性生成多条镜头的 prompt**。一次只做一条，等用户反馈后再做下一条。
- **不要假设用户已经把视频生成好**。你不是 Seedance，你只是写 prompt；视频要用户自己去即梦生成后放回 `ep_video/` 下。
- **不要在没看到 `ep_video/shot_x.mp4` 文件真实存在前，就调用 gen_ref_video.py**。必须先 ls/verify 文件存在。
- **不要跳过用户确认环节**，哪怕用户在上一轮说了"继续"也要对每一条新镜头重新确认。

## 生成单条镜头的标准流程（SOP）

### Step 1：读脚本并确定本轮要做哪条镜头

用户会明确告诉你："生成 shot_1"、"继续 shot_2"、"做 ep1 的 1a"。

- 读取 `script/` 下对应的剧本文件
- 读取 `ep_video/` 看已有哪些 shot，确定本轮 shot_id
- **shot_id 命名必须严格按 SHOT_ID_POLICY.md 规则**

### Step 2：识别本镜头对应的情绪弧范围

按外层 Seedance skill 的 E-11 情绪弧优先原则：
- 一个镜头 = 一个情绪弧
- 不要为了对齐平台 15s 上限而拆断情绪弧（除非确实装不下）
- 识别本镜头起止剧情点（如"画外音独白到手停顿"、"James 闯入到关门 Sylvia 失落"）

### Step 3：决定引用哪些素材

**3.0 先做场景人物清点（避免"凭空蹦出人"）**

重读剧本该段文字，列出所有**此刻在这个物理空间里**的人物（不只是有台词或动作的）。常见遗漏：旁观者、已入场但沉默的角色、被主角看见/跟踪的对象、画外音源头人物。

清点结果决定：
- 所有在场人物都要在 `assets.images` 里有立绘
- 关键场景描述里每人至少占一句（哪怕"在中远景静态存在"）
- 禁令不要无端写"画面中不得出现其他人物"——必须基于清点事实

清点规则详见下文"常见失败模式防御清单" 第 1 条。

**3.1 按外层 skill 的 A 段 Definition 规则（5 种情况）**：

| 情况 | mode | 引用什么 |
|---|---|---|
| 全剧首帧 | 多参考 | `portrait_and_scene/` 下的场景空镜 + 人物立绘 |
| 同场景延续（无新角色） | 多参考（延长意图） | `gen_ref_video/shot_前_ref.mp4` 作为 @视频1 + 必要的立绘补充 |
| 同场景 + 新人物登场 | 多参考 | 上一 shot 的 ref + 新人物立绘 |
| 跨场景衔接 | 多参考 | 上场景末 ref + 新场景空镜 + 人物立绘 |
| 分支/关键锚点 | 首尾帧 | 预先生成的首帧锚图（可选尾帧）+ 立绘 |

素材文件必须真实存在。用 `ls portrait_and_scene/` 和 `ls gen_ref_video/` 核对路径，**不要编造文件名**。

### Step 4：生成 prompt 并写入 `ep_video/shot_{id}.md`

`.md` 文件格式**必须严格遵守**以下结构（build_gallery.py 依赖这个格式解析）：

```markdown
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

以下人物均为原创动漫角色（非真实人物），版权所有 ©️ [COMPANY_NAME]。...

（完整 prompt 正文，按外层 skill 的 B/C/D/E/F/G 段规则撰写）
```

注意：
- frontmatter 里的 `assets.images/videos` **路径必须相对于项目根目录**（如 `portrait_and_scene/xxx.png`），不要写绝对路径
- `duration/mode/scene/emotion_arc` 都是字符串，不要用引号包起来（简化解析）
- 如果本镜头没有引用视频（全剧首帧），`videos:` 留空列表
- prompt 正文就是要**直接粘贴到即梦**的那段，不要夹杂注释

### Step 5：停下等待用户确认

prompt 写完后，用以下格式给用户交接：

```
shot_{id} 的 prompt 已写入：ep_video/shot_{id}.md

请你：
1. 打开 ep_video/shot_{id}.md，复制 --- 分隔线之后的正文粘贴到即梦
2. 即梦入口：{多参考/首尾帧}
3. 需上传素材：
   - @图1: portrait_and_scene/xxx.png
   - @图2: portrait_and_scene/yyy.png
   - @视频1: gen_ref_video/shot_前_ref.mp4（如有）
4. duration 填 {X}s，9:16 竖屏
5. 生成完后把视频下载回来放到 ep_video/shot_{id}.mp4

完成后告诉我"shot_{id} 已生成"或"shot_{id} 有问题，重生"，我再继续下一步。
```

**写完这段后必须停下，不得自作主张去跑后续脚本。**

### Step 6：用户确认视频生成好后的后处理

当用户回复"shot_{id} 已生成"（或使用 `gen_ep_video.py` 自动生成完毕）时，执行：

1. **验证文件真实存在**：`ls ep_video/shot_{id}.mp4`，如果不存在就直接告诉用户并停止
2. **末帧 PNG 自动抽取**：`gen_ep_video.py` 已在下载完成后自动抽末帧到 `gen_end_frame/shot_{id}_end.png`，下条 shot 可直接引用（见第 5 条 SOP）。若是手工放入 `ep_video/` 的视频（不走 `gen_ep_video.py`），需手工补跑抽帧：
   ```python3
   import imageio_ffmpeg, subprocess
   ff = imageio_ffmpeg.get_ffmpeg_exe()
   subprocess.run([ff, "-y", "-sseof", "-0.1", "-i",
                   "ep_video/shot_X.mp4", "-frames:v", "1", "-q:v", "2",
                   "gen_end_frame/shot_X_end.png"])
   ```
3. **裁剪 ref 视频（已废弃，保留做审计）**：`python3 gen_ref_video.py --shot shot_{id}`。本项目改为首尾帧模式后，`gen_ref_video/` 下的末 5s 视频**不再被下游 shot 作为 @视频1 输入**，但脚本仍跑作为视频留档，也方便人工拖时间线参考。
4. **更新画廊**：`python3 build_gallery.py`
5. **汇报**：
   ```
   shot_{id} 后处理完成：
   - 首帧锚图已抽到 gen_end_frame/shot_{id}_end.png（下条 shot 用 @图1 引用）
   - 末 5s ref 已裁剪到 gen_ref_video/shot_{id}_ref.mp4（审计留档，不再被下游引用）
   - 画廊已更新 gen_video_gallery.html（共 N 条 shot）
   可以浏览器打开 gen_video_gallery.html 查看，或告诉我"做下一个 shot"继续。
   ```

**到此必须再次停下**，等用户说"做下一个"或"继续 shot_{next_id}"才开始 Step 1。

### Step 7：如果用户说"重生"或"需要调整"

- 不要自动重写。先询问具体问题（字幕/孕肚/景别/动作等哪类退化）
- 根据反馈调整 prompt 的对应部分（加禁止项 / 调整景别锁 / 改语速标注等）
- 新版 prompt 覆盖写入 `ep_video/shot_{id}.md`
- 重新走 Step 5 交接给用户

## 常见失败模式防御清单（血泪教训）

本项目实际跑 EP1 过程中踩到的 5 类稳定失败模式。每次写 shot prompt 前按清单过一遍，命中任一条说明 prompt 需要调整。重生前也先对照清单定位根因，不要盲目重跑。

### 1. 场景人物清点（避免"人物凭空出现在下一条 shot"）

**问题**：Shot N 只拍主角 A 的情绪戏，但剧本里 B/C 同一场景同时在场（哪怕沉默）；shot N prompt 把 B/C 排除（甚至写进禁令），shot N+1 把镜头切到 B/C 时观众感觉"他们凭空蹦出来"。

**防御**：
- 写 prompt 前，**重读剧本该段场景描述的每一句**，列出此刻物理空间内的所有人物。
- 所有在场人物都要在 `assets.images` 里有立绘、在 prompt 正文描述里占一句（哪怕只写"在中远景静态存在、姿态不动"）。
- **禁令"画面中不得出现其它人物"必须基于清点事实**：没清点不要下这条。

**实例**：EP1 shot_5 v2 我只画 Sylvia 一人，但剧本原文"Sylvia 走到一排石碑后…三米外，James 单膝跪在新坟旁"——James+Kennedy 本就在场。shot_6a 切到他们时观众觉得"凭空出现"。修法：shot_5 v3 前景 Sylvia + 中远景 James+Kennedy，三人同框一次建立完整空间关系。

### 2. 不虚构参考视频里没有的建筑/道具

**问题**：Prompt 描述"画面左侧有一扇门"/"岛台上有一串车钥匙"，但 @视频1 末帧画面里这个位置根本没有这些元素；模型被迫把原有背景（橱柜/墙面）替换成 prompt 描述的结构，破坏跨 shot 空间一致性。

**防御**：
- 涉及画面内建筑/道具的 shot，写 prompt 前**真看一眼 @视频1 末帧**（直接打开 `ep_video/shot_*.mp4` 最后一帧截图）。
- 参考视频里没有的建筑元素（门/窗/走廊/楼梯）一律**做成画外**：画外推门声、画外脚步、人物从画面边缘进出。
- 必须在画面内出现的道具（钥匙/手机/烟灰缸），让它**首次出现时在手里**，不要声称"一开始就已经在 X 位置"。

**实例**：
- EP1 shot_3 v1——我让 James 从"画面左侧厨房门"进入，但 shot_2 末帧画面左侧是连续橱柜。模型把橱柜替换成门。修法：改成"画外推门声 + James 从画面左缘之外走入"，画面中全程无门。
- EP1 shot_4——我原本写"岛台右前方一串银色车钥匙静置（与 @视频1 末帧同位置同形态）"，但 shot_3 岛台上根本没钥匙。修法：钥匙"首次出现在 Sylvia 手里"（她从画面下缘外取回），不声称岛台上原本有。

### 3. 同一角色的 @图N 引用只在首次登场写一次

**问题**：一条 shot 里给同一角色反复写 `@图1 角色名 + 身份描述`（每次动作/台词前都 @图1），模型把每次 @图1 视作"再注入一个该立绘角色实例"，结果画面同时出现多个同样的人。

**防御**：
- 角色**首次登场**那一句写 `@图N 角色名（full identity description）` 一次，身份特征（服装/孕肚/配饰/体型）只在此处描述。
- 之后所有动作/台词描述**只写裸角色名**（不 @图N、不重复身份描述）。
- 关键场景 ① 正文里每个角色的 `@图N` 引用次数应 ≤ 1-2 次。
- 开头补一句**人物唯一性铁律**：`画面中 X 始终仅为一人、Y 始终仅为一人…严禁角色分身 / 复制 / 同时出现在画面不同位置 / 走动时原位残留旧实例`。
- 禁止清单加入对应反向禁令。

**实例**：EP1 shot_3 v1——我写了 8 次 `@图1 James`，画面出现 3 个 James 同框。修法：只在进场那一句写 `James（以 @图1 为唯一立绘参考，三十岁左右男性、深色羊绒大衣半敞…）`，其余都裸写 James。

### 4. 避免连续距离变化动作（远→近或近→远的"走来/走去"）

**问题**：Prompt 让人物从画面深处走到前景（或反之），模型无法稳定渲染身形比例的连续变化；常见失败：人物瞬间已在终点、身形中途跳帧、脚步节奏反物理、或者站着不动。

**防御**：
- 优先用 **"首帧即最终构图 + 10s 内微动情绪戏"** 结构：人物一开始就在目标位置，只做风吹发丝/呼吸/手指收紧/眉头微蹙等细节变化。
- 如果剧情必须包含"走入/走出"，**拆成两条 shot**（shot_Xa = 走入/过渡，shot_Xb = 静态观察或对白）。
- 单条 shot 里的"走"动作限制在**同一景别同一深度水平面**（比如走两步横穿画面左半区），不做深度方向的身形缩放。

**实例**：EP1 shot_5 v1——让 Sylvia 从背景深处走到前景 → 模型直接把她放在中景不动，看起来像"瞬移"。修法：首帧即"已在石碑后站定"，10s 全程静态微动情绪戏。

### 5. ARK 真人检测全面拦截视频输入（强制走首尾帧模式）

**问题**：ARK 对 `@视频1` 视频输入跑 `InputVideoSensitiveContentDetected.PrivacyInformation` 真人检测。本项目实测结论：**任何视频作为输入都会被拒**——无论风格多卡通、无论是否刚生成、无论多少 shot 之前生成；强化视觉风格 prompt 也无效。图片输入不受影响。

**防御（强制 SOP，从 shot_2 开始的所有 shot 都走这套）**：

1. **`mode: 首尾帧`**、`videos: []` 保持为空。严禁再用 `@视频1`。
2. **首帧锚图来源 = 自动抽帧**：`gen_ep_video.py` 每生成完一条 shot 后自动 ffmpeg 抽末帧 PNG 到 `gen_end_frame/{shot_id}_end.png`（见脚本 `extract_last_frame()` 函数）。下条 shot 在 frontmatter 里直接引用这个路径。
3. **frontmatter 第一张图**必须是前一条 shot 的末帧锚图：
   ```yaml
   assets:
     images:
       - gen_end_frame/{前一 shot_id}_end.png   # → @图1 首帧锚图
       - portrait_and_scene/[新人物立绘].png     # → @图2（如有新角色登场）
       - portrait_and_scene/[已在场人物立绘].png # → @图3
     videos: []
   ```
4. **prompt 开头句固定**：`@图1 作为首帧。`（外层 skill B-1 情况二-B/三-A 格式）
5. **关键场景 ① 第一个动词必须是渐变动词**（缓 / 微 / 渐 / 轻 / 慢）承接首帧姿势，严禁"冲向 / 猛推 / 跃起 / 瞬间 / 骤然"等剧烈起手（E-5-2 第 6 条）。
6. **视觉风格硬约束段落**必须紧跟 B-0 模板写入 prompt 前 300 字内——至少保证**输出**画面风格卡通化一致，减少未来策略变化的风险。模板（复制粘贴到每条新 shot）：
   ```
   视觉风格硬约束（non-photorealistic stylization lock）：全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading 而非渐变光影，非写实渲染 non-photorealistic rendering，无景深虚化 no depth-of-field blur，无真实皮肤质感 no realistic skin texture，无真实发丝高光 no realistic hair highlights，简化五官 simplified cartoon facial features（眼睛为动漫大眼平涂、鼻梁为简化线条、嘴唇为卡通简笔），画面整体为 Korean webtoon illustration style 而非 3D CG 或写实绘画；所有人物脸部必须呈现明显动漫化简笔特征、严禁出现摄影质感/写实渲染/3D 渲染/真人相片外观。
   ```

**本条废弃的旧做法（切勿再用）**：
- ❌ `gen_ref_video.py` 裁剪末 5s ref 视频作为 `@视频1` → 视频输入全拒
- ❌ 情况二-A「多参考（延长意图）」、情况二-C「上段末 5s @视频1」、情况三-B「上场景末 5s @视频1」→ 全部改为"首尾帧 + 首帧锚图 + 人物立绘多参考"
- ❌ `ep_video/shot_X.mp4.url` sidecar URL 不再被下游引用（仅保留做审计）

**一次性过滤器规避清单**（写 prompt / 发请求前过一遍）：
- [ ] `videos: []` 为空
- [ ] `mode: 首尾帧`
- [ ] `assets.images[0]` 指向 `gen_end_frame/{前一 shot_id}_end.png`
- [ ] prompt 开头句为 `@图1 作为首帧。`
- [ ] 关键场景 ① 第一动词为渐变动词
- [ ] 视觉风格硬约束段落在前 300 字内

**实例**：EP1 shot_5 v3 / v4 / shot_6a v1 / v2 被 ARK 作为下游视频输入时全部被拒；改用首尾帧模式 + 抽帧 PNG 锚图 + 立绘多参考后，shot_6a v2、shot_6b 一次过。

### 6. 音频安全过滤的随机触发与处置

**问题**：ARK `generate_audio=true` 时有概率触发 `OutputAudioSensitiveContentDetected`（输出音频被内容安全过滤拦下），即使 prompt 里完全没有敏感内容。同一条 prompt 两次跑结果不稳定（一次过一次挂，触发概率不可预测）。

**决策树（默认优先使用音频，不要预防性关闭）**：

```
第 1 次尝试 → 默认开音频（无论是否有对白、画外音、独白）
    ├── 成功 → 保留音频版本，done
    └── 失败 OutputAudioSensitiveContentDetected
        ↓
第 2 次尝试 → 保持音频，简化音效层（只留配乐 + 1-2 个必要动作音、删掉所有细分拟声）
    ├── 成功 → done
    └── 失败
        ↓
第 3 次尝试 → `--no-audio` 降级生成静音版，在剪辑阶段用作配乐底
```

**核心原则**：
- **默认开音频，不预防性关闭**。即使无对白，Seedance 仍会生成环境音 + 配乐，对情绪张力贡献大。连续多条静音 shot 会让整集节奏断裂。
- **触发是概率事件**，不是 prompt 内容决定。不要用"这 shot 有暴力/情感元素所以肯定触发"这类预判关音频。
- **专业制作流派**：另一种合理路径是**整片统一用 --no-audio 生成**、后期统一叠加作曲家谱的 BGM + 专业音效设计。比 Seedance 生成的 ambient 可控性和一致性都强。本项目支持两种路径，按制作规模选择：
  - 小规模 / 原型演示：用 Seedance 音频，省时间
  - 正式发行 / 一致性要求高：统一静音生成，后期配乐

**针对本项目已存在的混合音频状态**：shot_4 / 5 / 6a / 7 是无音的（我早期过度保守关了音频），shot_1-3 / 6b 是有音的。**后期剪辑阶段统一叠加 BGM + 环境音设计会解决这个不连贯**，无需重刷。

**历史错误记录（避免重复）**：
- ❌ "无对白 shot 默认加 `--no-audio`" 是错的——Seedance 的环境音 + 配乐生成是独立通道，无对白也能加分
- ❌ "音频安全过滤看起来像内容触发"是错的——实测是随机触发，同 prompt 两次跑结果不同

### 清单执行时机

| 时机 | 检查哪几条 |
|---|---|
| 写 shot prompt 时 | 1、2、3、4、5 逐条过（第 5 条含"首尾帧模式 + 首帧锚图引用 + 渐变起手动词 + 视觉风格硬约束"整套强制 SOP） |
| 选 `gen_ep_video.py` 参数 | 6（决定 `--no-audio`） |
| 重生 / 调整 prompt 时 | 1-6 全部对照，先定位根因再动手 |
| 看到生成结果有明显问题时 | 逆推触发了哪一条，再改 prompt |

每踩一个新坑就回来补一条，保持清单演进。

## 外层规则的优先级

本项目复用用户桌面已存在的完整 Seedance skill：
`/Users/listrawberry/Desktop/System Prompt 即梦 Seedance 2.0 互动剧本视频化专家.md`

撰写 prompt 正文时必须遵守该文件所有段落（A 定义规则、B 开头句、C 正文结构、D 运镜规范、E-1/2/3/4/5/6/7/8/9/10/11/12 安全与稳定规则、F 音效、G 台词守护、H 呼吸空间、I duration、J 引号转义、J JSON 字段）。本 WORKFLOW.md **只定义项目内的流程和文件约定**，不覆盖外层 prompt 规则。

若本 WORKFLOW.md 与外层 skill 存在冲突：
- 关于 prompt 内容 → 以外层 skill 为准
- 关于文件命名 / 目录结构 / 停下等确认 / 调用哪个脚本 → 以本 WORKFLOW.md 为准

## 脚本调用速查

| 目的 | 命令 |
|---|---|
| 裁剪单条 ref | `python3 gen_ref_video.py --shot shot_1` |
| 裁剪所有未处理 ref | `python3 gen_ref_video.py` |
| 强制覆盖重裁 | `python3 gen_ref_video.py --shot shot_1 --force` |
| 改变裁剪时长 | `python3 gen_ref_video.py --shot shot_1 --duration 3` |
| 更新画廊 | `python3 build_gallery.py` |

## 调试检查点

如果生成出问题，优先检查：

1. `ep_video/shot_{id}.md` 的 frontmatter 是否格式正确（`---` 成对、字段缩进、列表以 `-` 开头）
2. `assets.images/videos` 里的路径文件是否真实存在
3. shot_id 是否递增正确（别出现 shot_2 但没有 shot_1 的情况）
4. gen_ref_video.py 报错最常见原因：视频时长 < 截取时长；解决：加 `--duration 3` 或更短

## 典型会话示例

```
用户：帮我生成 ep1 的 shot_1
↓
Claude Code：
  [Read script/ep1.txt]
  [Ls portrait_and_scene/]
  [Write ep_video/shot_1.md]
  → "shot_1 prompt 已写入，请在即梦生成后告诉我..."
  [停]
↓
用户：shot_1 已生成
↓
Claude Code：
  [Ls ep_video/shot_1.mp4  → 确认存在]
  [Bash python3 gen_ref_video.py --shot shot_1]
  [Bash python3 build_gallery.py]
  → "后处理完成，告诉我'做下一个'继续"
  [停]
↓
用户：做下一个
↓
Claude Code：[进入 Step 1 做 shot_2]
```
