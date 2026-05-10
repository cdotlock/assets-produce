---
name: video-episode-generation
description: 当用户要求生成、检查或修改视频镜头 prompt 时使用
---

# 视频剧集生产 Skill

逐镜头生成互动短剧视频 prompt，通过 `scripts/bin/videoctl` 调用内部网关生成视频。主控模型负责质量把关和 videoctl 调用，Worker sub-agent 负责写 prompt，Reviewer sub-agent 独立冷读检查。

---

## ⛔ 绝对禁止（五大反模式）

**1. 跳过读 references 凭印象写参考图**
→ 每步有强制加载文件（见绑定表），不读就不写。角色立绘映射必须从 `references/character-dna.md` 查表，不能凭记忆编文件名。

**2. 视频生成 120s 就判超时**
→ 视频生成极限等待 1200s（20 分钟）。轮询间隔 30s，满 1200s 才允许判定失败。

**3. 跳过 URL 验证直接说"上传成功"**
→ 生成前必须执行 `scripts/bin/videoctl validate <prompt.md>`，逐 URL 看 Content-Type 和 Size 报告。任一失败 = 阻断生成。

**4. 不读权威模板凭印象写九段式**
→ 九段式**格式**必须从 `references/authority-prompt-template.md` 读取对照（仅参考格式，路径以本文路径约定为准）。九段：①风格声明 ②人物唯一性 ③@图说明 ④叙事总纲 ⑤时间轴 ⑥分镜 ⑦音效 ⑧禁止 ⑨素材清单。

**5. 用模糊语言代替验证**
→ 见「禁用语言」章节。每个结论必须有可验证的证据。

---

## 禁用语言（Red Flag）

| 禁用 | 替换为 |
|---|---|
| "应该完成了" | "已用 X 命令验证，输出为 Y" |
| "可能存在" | "已 grep/ls 确认，结果为 Z" |
| "完成了" | "产物 X 存在于路径 Y，内容含 Z" |
| "等会再检查" | 立刻检查 |
| "我记得是…" | "已 Read 文件确认为…" |

---

## 路径约定

所有路径相对项目根目录。`{作品}` = `works/{novel_id}/`（如 `works/silver-moon-manor/`）。

| 用途 | 路径 |
|---|---|
| 剧本 | `{作品}/scripts/ep_{N}.json` |
| 素材（立绘+场景图） | `{作品}/assets/` |
| 参考帧（按集） | `{作品}/ref-frames/{EP}/` |
| Prompt 输出 | `{作品}/episodes/ep_{N}/shots/shot_{id}/prompt.md` |
| 视频输出（本地复盘，不提交） | `{作品}/episodes/ep_{N}/videos/` |
| 末帧/空间帧 | `{作品}/episodes/ep_{N}/end-frames/` |
| 动态计划 | `{作品}/PLAN.md` |
| 归档 | `archive/{novel_id}/` |

Git 提交/推送时，必须提交生成的 prompt `.md` 文件和记录远端产物的 URL 文本文件；不要提交图片或视频文件（如 `.png`、`.jpg`、`.jpeg`、`.mp4`、`.mov`）。

**OSS URL 硬规则**：真正调用视频生成前，所有本地图片/视频素材必须先通过 `/api/external/video/oss/upload` 上传到 OSS，`prompt.md` frontmatter 中的 `assets.images` / `assets.videos` / `previous_*_url` 必须是可访问的 OSS URL。本地路径只允许作为上传前草稿；生成前必须改成 OSS URL，或至少有同名 `.url` sidecar 可被脚本解析。

## videoctl 执行入口（P0）

视频任务统一使用项目根目录的 Go CLI。`scripts/bin/videoctl` 是**唯一视频任务执行入口**：上传、验证、payload、提交、下载、抽帧都走它。不要再调用旧 Python 脚本；不要手写 `curl` / `requests.post` 直接打内部网关。

任何本轮第一次使用 videoctl 前，必须先 Read `scripts/videoctl/AGENT_REFERENCE.md`。这份文档是 Agent 使用 CLI 的权威参考，包含命令选择、标准生成链路、run 目录解读和失败处理方式。

若 `scripts/bin/videoctl` 不存在，先执行：

```bash
make build
```

可用命令：
- 上传本地素材并写 `.url`：`scripts/bin/videoctl upload <file...>`
- 验证 prompt 内 OSS URL：`scripts/bin/videoctl validate <prompt.md>`
- 构建网关 payload：`scripts/bin/videoctl payload <prompt.md>`
- 提交并等待生成：`scripts/bin/videoctl submit <prompt.md> --wait`
- 单镜完整生成入口：`scripts/bin/videoctl run-shot <prompt.md> --download --extract-end-frame`

videoctl 上传本地素材时调用 `/api/external/video/oss/upload` 并写 `.url` sidecar；提交生成时调用 `/api/external/video/generate`。

videoctl 的状态产物会写入 `{shot_dir}/runs/{timestamp}/`，包括 `request.json`、`submit-response.json`、`result.json` / `error.json`、`state.json`、`video.url`。Agent 汇报生成结果时必须引用这些文件路径或命令输出摘要。

---

## 步骤-加载绑定表

到某一步时必须 Read 对应文件，不是"觉得需要才读"，而是"到这步就一定读"。

| 步骤 | 必须 Read 的文件 |
|---|---|
| 初始化（接到任务） | 本文件（SKILL.md）|
| Step 1 读剧本 | `{作品}/scripts/ep_{N}.json` |
| Step 2 情绪三行 | `references/authority-prompt-template.md` |
| Step 3 素材决策 | `references/character-dna.md`、`references/seedance-lessons.md` |
| Step 4 导演三问 | `references/director-playbook.md` |
| Step 5 写 prompt | `references/shot-id-policy.md`、`references/memory.md` |
| Step 5.5 Review | `references/review-checklist.md`（Reviewer sub-agent 读） |
| 遇到问题时 | `references/deep-analysis.md`、`references/problems-log.md` |

---

## Sub-agent 编排

### Worker sub-agent（写 prompt）
- 每个 shot 一个 Worker，负责 Step 1-5
- **禁止调用视频生成 API**
- **禁止跳过任何 Step 的强制 Read**
- 产出：`prompt.md` 写入对应 shots 目录

### Reviewer sub-agent（独立检查）
- 全新 agent，**不读主控对话历史**，冷读文件独立检查
- 必读文件见绑定表 Step 5.5
- 按 `references/review-checklist.md` 的 Group 1-7 逐条打 ✅/❌
- 全部 ✅ 才 pass；有 ❌ 则标注具体问题

### 主控模型
- 审核 Worker 产出 + Reviewer 结果
- 用户确认后才调用 `scripts/bin/videoctl submit <prompt.md> --wait` 或 `scripts/bin/videoctl run-shot <prompt.md> ...`（除非钟文鼎特批模式）
- 视频生成调用是**主控独占权限**，sub-agent 不可调用
- 轮询、等待上限 1200s、run 目录落盘由 videoctl 负责；主控只读取命令输出和 run 产物

---

## Gate 规则

### 默认交互模式（interactive）
Worker 完成 prompt → Reviewer pass → 主控审核 → **停下等用户确认** → 用户说"可以生成了" → `scripts/bin/videoctl validate <prompt.md>` 通过 → `scripts/bin/videoctl submit <prompt.md> --wait` 生成

### 钟文鼎特批危险超速生成模式
仅当用户**明确说出"开启钟文鼎特批危险超速生成模式"**时启用。跳过用户确认，**不跳过 URL 验证**。

### Pipeline 模式
用户在会话开头声明。连续跑完整集，统一交付人审。仍不跳过 URL 验证。每个 shot 使用 `scripts/bin/videoctl submit <prompt.md> --wait`；需要本地复盘和末帧时使用 `scripts/bin/videoctl run-shot <prompt.md> --download --extract-end-frame`。

### 用户手改 prompt.md 时
检测到 diff → 自我反思"用户为什么改" → 追加反思到 `references/memory.md` → 下个 Worker 加入反思上下文

---

## PLAN.md 规则

读完工作流后才创建 PLAN.md，放在 `{作品}/PLAN.md`。格式极简：

```markdown
# EP{N} · {novel_id}

- [ ] shot_{id} {一句话描述叙事任务}
  - 产物: {作品}/episodes/ep_{N}/shots/shot_{id}/prompt.md
  - 验证: 九段完整, videoctl validate 全 pass, 用户确认
- [ ] shot_{id} ...
```

完成一步打勾一步。出问题在该行后追加一句话（不嵌套、不写日志）。

---

## memory.md 更新规则

`references/memory.md` 是跨会话生产经验记忆。更新时机：
- 用户手改 prompt → 记录"什么改了、为什么"
- 生成失败 → 记录失败原因和解法
- 发现新的 API 行为 → 记录
- 消融实验发现差异 → 记录

不记录：临时调试信息、单次对话上下文、代码实现细节。

---

## archive 规则

`works/{novel_id}/` 是活跃工作区；作品明确完成、用户确认不再继续生产时，可以归档到 `archive/{novel_id}/`，让 `works/` 保持给下一个活跃作品使用。

归档前必须确认：
- prompt `.md` 和 `.url` sidecar 已保留
- 图片/视频本体不作为新增 git 内容提交
- `PLAN.md`、metadata、剧本 JSON、最终 prompt 路径完整

不要在作品未完成、用户未确认时主动归档。

---

## 生产工作流 SOP

### 任务定位

本项目用来**逐镜头生成互动短剧视频并验证 prompt 质量**。职责：
1. 读取剧本
2. 按 Seedance prompt 规则生成**单条分镜 prompt**
3. **interactive 模式下每个镜头生成完毕后必须停下等待用户确认**；pipeline 模式下连续跑完整集后批量人审
4. 视频生成统一通过内部网关 `https://agent.mob-ai.cn/api/external/video/generate`；用户确认视频后帮他抽帧

### 运行模式

| 模式 | 何时使用 | 流程行为 |
|---|---|---|
| `interactive` | 单镜调试、新剧本首镜、品质回归测试 | 每条 shot 生成 prompt 后停下等用户确认；用户确认后再做下一条 |
| `pipeline` | 量产模式、批量补镜、整集回炉 | 连续跑完整集所有 shot，统一交付后人审；跳过 Step 6 单条交接 |

默认 `interactive`，由用户在会话开头声明切换。

### 绝对不能做的事

- **不要假设用户已经把视频生成好**。视频必须来自内部网关生成结果。
- **不要在没看到视频文件真实存在前，就调用后处理脚本**。必须先 ls/verify 文件存在。
- **interactive 模式下不要跳过用户确认环节**，哪怕用户在上一轮说了"继续"也要对每一条新镜头重新确认。

---

### Step 1：读完整剧本（P0 硬规则 · 禁止跳过）

**强制 Read**: `{作品}/scripts/ep_{N}.json`

**写任何 shot prompt 前，第一件事就是 Read 对应的完整剧本**。

**禁止**仅依赖用户在对话里贴的剧本片段、上一轮的记忆、或猜测剧情走向。剧本 JSON 是唯一权威源。

读完后做：
- 在 `pre_choice_script` 里**定位本镜对白的精确位置**
- 读出**本镜之前**发生什么（上一镜结尾人物状态）
- 读出**本镜之后**发生什么（下一镜从什么状态开始 / 整集情绪爆破点在哪）

> **🔒 VERIFY**：能说出本镜在剧本 JSON 中的精确段落位置，否则回去重读。

---

### Step 2：写出本镜情绪定位三行（自动推导，不让用户写）

**强制 Read**: `references/authority-prompt-template.md`

把 Step 1 读到的内容压缩成 frontmatter 的三行：

```yaml
shot_function: |
  本镜在整集情绪弧里要完成的叙事任务（一句话，禁用"引信/爆破/起点"等抽象标签词）
prev_shot_recap: |
  上一镜结尾人物状态（一句话）
next_shot_setup: |
  下一镜从什么状态开始 / 真正的情绪爆破点在哪（一句话）
```

**任一行写不出，说明剧本还没读懂——回 Step 1 重读，不准动笔写正文。**

这三行是**防止误读情绪的铁律**——v3→v5.1 翻车的根因就是跳过了这一步（详见失败模式 #7）。

> **🔒 VERIFY**：三行都已写出且内容具体（不是抽象标签词）。

---

### Step 3：决定引用哪些素材

**强制 Read**: `references/character-dna.md`、`references/seedance-lessons.md`

**3.0 先做场景人物清点（避免"凭空蹦出人"）**

重读剧本该段文字，列出所有**此刻在这个物理空间里**的人物（不只是有台词或动作的）。常见遗漏：旁观者、已入场但沉默的角色、被主角看见/跟踪的对象、画外音源头人物。

清点结果决定：
- 所有在场人物都要在 `assets.images` 里有立绘（按 `references/character-dna.md` 的"立绘文件映射"表选）
- 关键场景描述里每人至少占一句
- 禁令"画面中不得出现其它人物"必须基于清点事实

清点规则详见失败模式第 1 条。

**3.1 三层 reference 架构（量产标准）**：

| 参考层 | 来源 | 解决什么 |
|---|---|---|
| **空间层** | 场景首镜用 `{作品}/assets/scene_*_panorama.png`；续镜用 `{prev_shot_id}_spatial.png` | 房间结构、人物站位、说话朝向 |
| **时间承接** | `{作品}/episodes/ep_{N}/end-frames/{prev_shot_id}_end.png`（前一 shot 末帧） | 交接瞬间的姿态 / 表情 |
| **角色 DNA** | 立绘（按 `references/character-dna.md` 映射） | 服装、发型、身材、孕肚、配饰 |

`assets.images` 推荐顺序：空间层 → 时间承接 → 角色立绘。素材文件必须真实存在，用 `ls` 核对，不要编造文件名。

**角色参考写法硬规则**：
- prompt 正文里只写**主参考约束句**，不要把服装、外貌、身材、孕肚、配饰逐项枚举出来。
- 推荐句式：`@图N Sylvia 角色主参考（画面中 Sylvia 的外貌、五官、发型、服装、身材、孕肚与配饰全部严格以 @图N 为准，禁止偏离；不得添加参考图外的服装或配件）。`
- 禁止句式：`@图N Sylvia 角色 DNA：二十多岁女性，深色针织长袖上衣，深灰色宽腿长裤…`
- `scripts/ep_X.json::character_outfits` 只用于**选对立绘 / 自检参考图是否匹配剧情**，不要整段抄进 prompt。

**空间参考帧说明**：末帧常为特写，无法反映全局站位。写 `shot_N` 前，如果是续镜且场景复杂度 L3/L4，空间层应读取上一镜已经产出的 `{prev_shot_id}_spatial.png`；如果上一镜还没有空间帧，必须先从上一镜视频中抽候选并选出能看到"所有人物 + 场景全貌 + 说话朝向"的全景/中远景帧，存为 `{prev_shot_id}_spatial.png` 后再写当前 prompt。当前 `shot_N` 生成并后处理后，才产出 `{shot_id}_spatial.png`，供下一镜使用。写 prompt 前 agent 必须打开空间帧看图确认站位，不得凭记忆推测（详见 `references/seedance-lessons.md` #12）。

**3.2 场景空间地图段落（场景首镜必填、续镜照抄）**

**问题背景**：只引用 `@图1 panorama` 不够——模型可能自由添加 panorama 没明示的元素（书柜、装饰），续镜的人物入场路径、障碍物绕行也无法从静态全景图推导。

**SOP**：

1. **场景首镜**必须在 prompt ③段（@图N 说明 + 空间关系）写出**空间地图段落**，把画面 9 宫格里每个分区有什么物体显式写出。例：
   ```
   场景空间地图（以画面 9 宫格定位）：
   - 画面左上 1/3：窗（白色窗帘半掩）
   - 画面正中：书桌（深木色，桌面靠右堆三本书、靠左压一封信）
   - 画面正下：办公椅（深棕皮面，椅背朝镜头）
   - 画面右下 1/3：门（木门，半开，门把手朝向镜头）
   - 画面左下 1/3：地板（深色木地板，无装饰）
   ```
2. **续镜（同一场景）必须照抄空间地图段落**——不能只写"参见 @图1"。模型每次"自由发挥"会让门/书柜/桌子位置漂移。
3. **末帧背景与 panorama 冲突时优先 panorama**——续镜的空间布局以 panorama 描述为准，不以前一镜可能漂移的末帧为准。
4. **空间地图坐标会被入场路径/障碍物绕行段落引用**（见 director-playbook.md #12）——两者必须用同一坐标系（9 宫格分区）。

**翻车案例**：EP5 shot_5 v1 未写空间地图，shot_4b 末帧出现 panorama 没有的书柜，shot_5 入场时门位置漂移到画面左侧（panorama 中门在画面右下）。v2 加入空间地图段落 + 续镜照抄后修复。

**3.3 模式选择（按镜头复杂度）**：

| 复杂度 | 触发条件 | 推荐 mode |
|---|---|---|
| L1 单人静态独白 | 1 人 + ≤8s + 无走位 | 单首帧 |
| L2 双人对白 | 2 人 + ≤10s + 站位不变 | 单首帧 + 三层 reference |
| L3 走位/三人/12s+ | 任一命中 | 首尾帧双锚 |
| L4 突发动作链 | 推门/闯入/打斗 | 末帧承接 + 上一镜 15 秒尾段 + 高质量生成配置 |

> **🔒 VERIFY**：所有素材已上传 OSS，`assets.images/videos` 中已填 OSS URL（非本地路径占位）；执行 `videoctl validate` 不允许出现 0 URL 假通过。

---

### Step 4：导演决策三问（写 prompt 前最后 sanity check）

**强制 Read**: `references/director-playbook.md`

不要跨多文件查表。三问能不能用一句话答清楚？

1. **本镜情绪目标？** 一个主导情绪词（不是抽象标签，是"压着的警觉" / "决定要跟" / "崩溃见证背叛"这类具体句）
2. **这个情绪用什么镜头语言？** 景别 + 角度 + 运动 + 主灯（如果场景图已锁就引用场景图）三件
3. **角色用什么物理动作外化情绪？** 至少 1 个 ≥5cm 的具体身体动作（禁止只写"悲伤地" / "愤怒地"裸抽象词）

三问答得出 → Step 5 基本是机械填空。三问卡壳 → 回 Step 1-2 重读剧本对齐情绪定位。

> **🔒 VERIFY**：三问都能用一句话答出，且情绪目标是具体句而非抽象标签。

---

### Step 5：生成 prompt 并写入

**强制 Read**: `references/shot-id-policy.md`、`references/memory.md`

`.md` 文件格式必须严格遵守以下结构：

```markdown
---
shot_id: shot_1
duration: 12s
mode: 单首帧 + 三层 reference
scene: 银月领地豪宅厨房
shot_function: 本镜要完成的叙事任务（来自 Step 2，禁用抽象标签词）
prev_shot_recap: 上一镜结尾人物状态
next_shot_setup: 下一镜从什么状态开始 / 整集情绪爆破点在哪
emotion_arc: 本镜情绪走向简述
assets:
  images:
    - https://oss-url/scene_kitchen_panorama.png
    - https://oss-url/prev_shot_end.png
    - https://oss-url/Sylvia人物立绘.jpg
  videos:
    - https://oss-url/{prev_shot_id}.mp4
previous_video_url: https://.../{prev_shot_id}.mp4
previous_frame_url: https://.../{prev_shot_id}_end.jpg
continuation_tail_seconds: 15
---

（九段式 prompt 正文，严格按 references/authority-prompt-template.md 结构撰写）
```

**九段式结构**（必须按此顺序，对照 `references/authority-prompt-template.md` 的实例）：

1. **① 版权 + 风格声明** — 赛璐璐/cel-shaded/禁写实渲染/9:16竖屏/无字幕声明，必须在前 300 字内
2. **② 人物唯一性铁律** — 每个在场角色写"始终仅为一人，严禁角色分身/复制"
3. **③ @图N 说明 + 空间关系** — 每张参考图的用途 + 场景站位
4. **④ 核心叙事总纲** — 人物空间关系 + 镜头轴线
5. **⑤ 关键场景时间轴（故事线）** — 情绪弧概述
6. **⑥ 关键场景分镜** — 逐秒描述 + 最后 2s 三重静止
7. **⑦ 音效层** — 环境音/动作音/对白/配乐
8. **⑧ 禁止事项** — 所有不允许的内容
9. **⑨ 素材上传清单** — @图N 与文件的对应关系

**注意**：
- `assets.images/videos` 中必须是 **OSS URL**（可被 API 直接访问），不能是本地路径；本地文件先用 `videoctl upload` 上传
- `shot_2+` 必须准备上一镜视频 URL；请求内部网关时放入 `sourceVideoUrls`
- 多参考图：`sourceImageUrl` 传主参考图（空间/首帧），`referenceImageUrls` 传其余所有参考图（末帧锚图、角色立绘等）
- prompt 正文是要直接交给内部网关的，不要夹杂注释

> **🔒 VERIFY**：九段式都在 prompt.md 里（①-⑨），且执行 `scripts/bin/videoctl validate <prompt.md>` 全部通过。

---

### Step 5.5：写完后 Prompt Review（独立 Reviewer sub-agent 执行）

**执行方式**：主控启动一个**全新 sub-agent** 执行本步骤。Reviewer 不读主控对话历史，冷读文件独立检查——避免写 prompt 的 agent 对自身盲区产生确认偏误。

**Reviewer 必须 Read 的文件**：
- 待检查的 `prompt.md`
- `{作品}/scripts/ep_{N}.json`（剧情真相源，用于核查情绪定位和人物清点）
- `references/seedance-lessons.md`（能力边界、TTS 语气、表情规则）
- `references/director-playbook.md`（镜头角度、景别规则）
- `references/review-checklist.md`（Group 1-7 检查项，共 27 条）

**Reviewer 输出格式**：每条打 ✅ / ❌，❌ 注明具体问题所在。**全部 ✅ 后主控才进入 Step 6**；有 ❌ 则主控修改 prompt 后重跑 review。

Review 检查项详见 `references/review-checklist.md`，覆盖：
- Group 1：Reference 完整性（立绘/场景/站位）
- Group 2：空间连贯性（站位/朝向/轴线）
- Group 3：剧情理解
- Group 4：人物心理
- Group 5：情绪强度校准
- Group 6：镜头语言匹配
- Group 7：技术合规（防拦截）

> **🔒 VERIFY**：Reviewer 输出全部 ✅，且 Reviewer 确认读取了所有必读文件。

---

### Step 6：交付（按运行模式分流）

**interactive 模式**：写完 prompt 后停下等用户：

```
shot_{id} 的 prompt 已写入：{路径}

review 结果：全部 ✅（或列出修改项）
URL 验证：全部通过（附 videoctl validate 输出摘要）

等待您确认后生成视频。
```

**写完这段必须停下，不得自作主张去调用视频生成。**

**pipeline 模式**：跳过单条交接，连续调用 `scripts/bin/videoctl submit <prompt.md> --wait`；`shot_2+` 必须把上一镜视频 URL 放入 `sourceVideoUrls`。整集跑完才汇报。

---

### Step 7：用户确认后的生成与后处理

用户确认可以生成后执行：

1. **确认 CLI 可用**：若 `scripts/bin/videoctl` 不存在，执行 `make build`
2. **验证素材 URL**：`scripts/bin/videoctl validate <prompt.md>`
   - **跨日续镜额外检查**：如果 `previous_video_url` 指向昨日（或更早）生成的视频，OSS 预签名 URL 可能已过期（24h 失效，详见 seedance-lessons.md #18）。validate 会失败；此时去掉 frontmatter 的 `previous_video_url` + `assets.videos`，仅靠 `previous_frame_url` 承接末帧 PNG，再重跑 validate
3. **提交并等待生成**：`scripts/bin/videoctl submit <prompt.md> --wait`
4. **读取结果**：从输出或 `{shot_dir}/runs/{timestamp}/video.url` 取得视频 URL；若失败，读取 `error.json` 并停止
5. **下载视频并写 URL sidecar**：`scripts/bin/videoctl download <video_url> --out {作品}/episodes/ep_{N}/videos/{shot_id}.mp4`
6. **末帧 PNG 抽取**：`scripts/bin/videoctl extract-end-frame {作品}/episodes/ep_{N}/videos/{shot_id}.mp4 {作品}/episodes/ep_{N}/end-frames/{shot_id}_end.png`
7. **空间参考帧筛选**（L3/L4 场景强制；L1/L2 若末帧为特写也触发）：
   - 每 2 秒提取一帧作为候选：`scripts/bin/videoctl extract-candidates {作品}/episodes/ep_{N}/videos/{shot_id}.mp4 {作品}/episodes/ep_{N}/end-frames/ --shot-id {shot_id}`
   - 逐一 Read 候选帧图片，按优先级选最优帧：所有人物可见 > 景别最宽 > 能看清站位和朝向
   - 最优帧存为 `{shot_id}_spatial.png`：`scripts/bin/videoctl select-spatial-frame <chosen_candidate.png> {作品}/episodes/ep_{N}/end-frames/{shot_id}_spatial.png`
   - 若所有候选帧都是特写/人物不全，提示下一镜退回使用 panorama
8. **汇报**run 目录、视频 URL sidecar、末帧和空间帧路径

interactive 模式后处理后必须再次停下。pipeline 模式直接进下一条。

---

### Step 8：如果用户说"重生"或"需要调整"

**先按错误类型分流，不要无差别"自动改 prompt"**——错误类型决定第一反应。

| 错误类型 | 第一反应 | 不要做 |
|---|---|---|
| `OutputVideoSensitiveContentDetected.PolicyViolation` | **同 prompt 重跑 1-2 次**（概率事件，详见 seedance-lessons.md #17）；连续 3 次都拦截才考虑改 prompt | 第一次拦截就改 prompt |
| `OutputAudioSensitiveContentDetected` | 改 ⑦段音效层 + ⑧段禁动作拟声（见 seedance-lessons.md #16）；3 次仍拦截走 `--no-audio` 静音版 | 改对白文字（音频生成层与文字几乎无关） |
| `InvalidParameter / resource download failed` | 检查 OSS URL 是否过期（见 seedance-lessons.md #18） | 改 prompt |
| 透视失真（俯视退化为正俯航拍） | 应用 seedance-lessons.md #14 的几何参数化写法 | 重复抽象俯角词 |
| 伴随物消失（椅子/桌子/文件凭空没了） | 应用 seedance-lessons.md #15 的⑥段持续锁定 + ⑧段防御 | 只在⑧段加禁（缺⑥段持续锁定无效） |
| 入场穿模（人物穿过障碍物） | 应用 director-playbook.md #12 写"路径"+ 绕行 | 只描述"绕过" |
| 情绪渲染走偏（哭/平静/警觉） | **优先检查"失败模式 #7 情绪定位错误"**——重读剧本验证 shot_function 是否写错；不是写错则按 seedance-lessons.md #2 反向校准 | 凭印象加情绪形容词 |
| 角色分身 / 多个同一人 | 检查 @图N 是否被多次引用（见失败模式 #3） | 加禁令但不删 @图N |
| 其他画面问题 | 询问用户具体问题（孕肚/景别/动作哪类退化），针对性调整 | 整段重写 |

**所有路径共同的 SOP**：

- 不要自动重写。先确认错误类型 + 用户具体反馈
- 新版 prompt **不覆盖旧版**，写入 `shot_{id}_v{N}.md`（保留版本对比，详见 shot-id-policy.md）
- 失败镜的视频文件保留为 `shot_{id}_v{N}_{症状描述}.mp4`（如 `shot_4b_v1_chair_disappeared.mp4`），便于后续看到"哪种 prompt 写法对应哪种翻车"
- **架构验证只改一个变量**（参考 problems-log.md 问题 4）——不要同时改模型版本 + 参考图数量 + prompt 文字

---

## 常见失败模式防御清单（血泪教训）

每次写 shot prompt 前按清单过一遍。

### 1. 场景人物清点（避免"人物凭空出现"）

**问题**：Shot N 只拍主角 A 的情绪戏，但剧本里 B/C 同一场景同时在场（哪怕沉默）；shot N+1 切到 B/C 时观众觉得"凭空蹦出来"。

**防御**：
- 写 prompt 前重读剧本该段每一句，列出此刻物理空间内所有人物
- 在场人物都在 `assets.images` 有立绘、prompt 描述里至少占一句
- "画面中不得出现其它人物"禁令必须基于清点事实

**实例**：EP1 shot_5 v2 只画 Sylvia，但剧本"Sylvia 走到一排石碑后…三米外，James 单膝跪在新坟旁"——三人本就在场。修法：v3 前景 Sylvia + 中远景 James+Kennedy 同框建立空间。

### 2. 不虚构参考视频里没有的建筑/道具

**问题**：Prompt 描述"画面左侧有门"，但 reference 末帧根本没门；模型把原有背景替换成 prompt 描述的结构，破坏跨 shot 一致性。

**防御**：
- 涉及画面内建筑/道具的 shot，写 prompt 前真看一眼末帧 PNG
- reference 里没有的建筑（门/窗/楼梯）一律做成画外（画外推门声 + 人物从画面边缘进出）
- 必须出现的道具（钥匙/手机），让它**首次出现时在手里**

**实例**：EP1 shot_3 v1 让 James 从"画面左侧厨房门"进入，但 shot_2 末帧左侧是连续橱柜——模型把橱柜替换成门。修法：改成画外推门声 + James 从画面左缘外走入。

### 3. 同一角色的 @图N 引用只在首次登场写一次

**问题**：一条 shot 反复写 `@图1 角色名 + 身份描述`，模型把每次 @图1 视作"再注入一个该立绘实例"，画面同时出现多个同样的人。

**防御**：
- 角色**首次登场**那一句只写 `@图N 角色名（主参考约束句）` 一次：用 @图N 锁外貌/服装/身材等类别，不逐项枚举具体衣着和外貌
- 之后所有动作/台词描述只写裸角色名（不 @图N、不重复身份）
- 关键场景里 `@图N` 引用次数 ≤ 1-2 次
- 开头补"人物唯一性铁律"：`画面中 X 始终仅为一人、严禁角色分身/复制/同时出现在画面不同位置`

**实例**：shot_3 v1 写 8 次 `@图1 James`→画面 3 个 James 同框。修法：进场写一次主参考约束句，其余裸写 James。

### 4. 避免连续距离变化动作（远→近或近→远的"走来/走去"）

**问题**：Prompt 让人物从画面深处走到前景，模型无法稳定渲染身形比例的连续变化——常见瞬移、跳帧、节奏反物理。

**防御**：
- 优先 **"首帧即最终构图 + 10s 内微动情绪戏"**：人物一开始就在目标位置，只做风吹发丝/呼吸/手指收紧等细节
- 必须包含"走入/走出"则**拆成两条 shot**（走入过渡 + 静态对白）
- 单条 shot 的"走"限制在同一景别同一深度水平面（横穿画面左半区，不做深度缩放）

**实例**：shot_5 v1 让 Sylvia 从背景走到前景→模型把她直接放中景，"瞬移"。修法：首帧即"已在石碑后站定"，10s 全程静态微动。

### 5. 连续镜头必须通过 videoctl 传上一镜 15 秒尾段

**问题**：只用末帧图片会丢失上一镜的动作惯性、镜头运动和动态质感；直接绕过 `scripts/bin/videoctl` 会绕过 URL 验证、run 目录落盘、错误记录和重复提交防护。

**防御（强制 SOP，从 shot_2 开始所有 shot）**：

1. 视频生成只走 `scripts/bin/videoctl submit <prompt.md> --wait`；内部网关 URL 是 CLI 实现细节，Agent 不手写 HTTP 请求。
2. `shot_2+` 请求必须传：
   - `sourceVideoUrls`: 上一镜视频 URL 数组
   - `referenceImageUrls`: 场景图、上一镜末帧图、角色图等多参考图 URL 数组
3. **frontmatter 第一张图**通常是空间地图，第二张是前一 shot 末帧锚图：
   ```yaml
   assets:
     images:
       - https://.../scene_*_panorama.png          # 空间地图
       - https://.../{前一shot_id}_end.png          # 时间承接锚图
       - https://.../[人物立绘].png                  # 角色 DNA
     videos:
       - https://.../{前一shot_id}.mp4                # 来源记录；请求时传 URL
   previous_video_url: https://.../{前一shot_id}.mp4
   previous_frame_url: https://.../{前一shot_id}_end.jpg
   continuation_tail_seconds: 15
   ```
4. 生成前执行 `scripts/bin/videoctl validate <prompt.md>`，通过后执行 `scripts/bin/videoctl submit <prompt.md> --wait`。
5. **关键场景 ① 第一个动词必须是渐变动词**（缓 / 微 / 渐 / 轻 / 慢）承接首帧姿势，严禁"冲向 / 猛推 / 跃起 / 瞬间 / 骤然"剧烈起手。
6. **视觉风格硬约束段落**必须紧跟写入 prompt 前 300 字：
   ```
   全画面严格采用赛璐璞平涂风格 cel-shaded flat anime illustration，
   明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，
   非写实渲染，简化五官，Korean webtoon illustration style；
   严禁摄影质感/写实渲染/3D 渲染/真人相片外观。
   ```

**发请求前过一遍**：
- [ ] 只调用内部网关
- [ ] `shot_2+` 有 `sourceVideoUrls`
- [ ] 多参考图 URL 放入 `referenceImageUrls`
- [ ] `assets.images` 包含末帧 PNG 锚图
- [ ] 关键场景 ① 第一动词为渐变动词
- [ ] 视觉风格硬约束段落在前 300 字内

### 6. 音频安全过滤的随机触发与处置

**问题**：音频生成可能触发安全过滤。同 prompt 两次跑结果也可能不稳定。

**决策树（默认开音频，不预防性关闭）**：

```
第 1 次 → 默认开音频（无论是否有对白）
    ├── 成功 → done
    └── 失败 OutputAudioSensitiveContentDetected
        ↓
第 2 次 → 保持音频，简化音效层（只留配乐 + 1-2 个必要动作音）
    ├── 成功 → done
    └── 失败
        ↓
第 3 次 → 降级生成静音版，剪辑阶段叠加 BGM
```

**TTS 英文敏感词扫描**（写完对白先过一遍，避免浪费一次生成）：
- ❌ `mine`（landmine 同音）
- ❌ `shot` / `gun` / `kill` / `weapon` / `dead`
- ❌ `drug` / `pill` / `blood`
- 角色名碰巧是英文实词（Hunter / Storm 之类）也要警惕

**核心原则**：
- 默认开音频，不预防性关闭。环境音 + 配乐对情绪张力贡献大
- 触发是概率事件，不是 prompt 内容决定
- 正式发行可整片统一静音视频，后期再配乐

### 7. 情绪定位错误（v3→v5.1 教训）

**问题**：把"引信镜头"误读为"爆破镜头"——情绪推满。
对白 `"Don't wait up."` 在不同剧情上下文里意义完全不同：
- 单看像永别 → 推情绪到崩溃
- 知道下一场是墓地目击出轨 → 妻子起疑+决心要跟（**正解**）

**根因**：Claude 没有 Read 剧本全文，只用对话碎片上下文推情绪。

**防御（强制 SOP）**：
- 写 prompt **第一件事**就是 Read 完整剧本
- frontmatter 必须有 `shot_function` / `prev_shot_recap` / `next_shot_setup` 三行（自己读出，不让用户写）
- 任一行写不出 → 说明剧本没读懂 → 回去重读
- **本镜的情绪解读取决于下一镜发生什么，不取决于本镜对白本身**——这是反直觉但绝对的原则

**实例**：EP1 shot_1b v3/v4/v5/v5.1 全部写成"Sylvia 含泪颤抖崩溃"。读完 `ep_1.json` 发现下一场是墓地目击 James 与 Kennedy 拥抱——本镜应是"压着的警觉+决心要跟"，崩溃在下一场。v6 修正后即对。

### 8. 对话多镜越轴 / 跳切（180度 / 30度法则）

**问题**：对话场景连续拆多镜时，摄像机越过两角色连线（轴线），角色左右空间关系反转——观众感知角色"瞬间换位"。连续切镜若角度偏移 <30 度，出现跳切感。互动剧情的选择支接续处是最高风险点。

**180度法则**：同一对话场景所有 shot，摄像机必须始终在两角色连线的同一侧。过肩反打是合法跨镜——因为摄像机跟随角色视线方向，不破坏空间感。

**30度法则**：同一主体的相邻两个 shot，镜头角度至少偏移 30 度。同时变更景别（中景→特写）可掩盖轻微偏移不足。

**防御**：
- 对话多镜拆分（Step 2）时，先画出"轴线"，标注所有 shot 摄像机在轴线的哪一侧
- 分支剧情选择支前后 shot 必须保持轴线一致（互动剧情越轴最隐蔽）
- 连续切镜优先同时改变景别 + 角度，双变更比单变更安全

### 清单执行时机

| 时机 | 检查哪几条 |
|---|---|
| 写 shot prompt 时 | 1, 2, 3, 4, 5, **7**, **8** 逐条过 |
| 发内部网关请求 | 5, 6（确认连续性参数和音频策略） |
| 重生 / 调整时 | 1-8 全部对照，**先查 7（情绪定位是否读错）**再查其他 |
| 看到生成结果有问题 | 逆推触发了哪一条，再改 prompt |

每踩新坑就回来补一条，保持清单演进。

---

## 外层 Seedance 规则

撰写 prompt 正文遵守 Seedance 2.0 通用规则——含九段式结构、口型同步、duration、JSON 字段等。本 SOP 只定义项目内流程和文件约定，不覆盖通用 Seedance 规则。

项目内参考文件：
- `references/character-dna.md`：角色服装锁 + 立绘文件映射表
- `references/director-playbook.md`：8 个高频戏剧情境的镜头序列查表（按需查、不强制）
- `references/authority-prompt-template.md`：五镜完整九段式实例（格式权威参考）

---

## videoctl 调用速查

| 目的 | 方法 |
|---|---|
| 生成首镜/续镜 | `scripts/bin/videoctl submit <prompt.md> --wait` |
| 单镜生成+下载+末帧 | `scripts/bin/videoctl run-shot <prompt.md> --download --extract-end-frame` |
| 上传素材 | `scripts/bin/videoctl upload <file...>` |
| 构建 payload | `scripts/bin/videoctl payload <prompt.md>` |
| 验证 URL | `scripts/bin/videoctl validate <prompt.md> --timeout 300` |
| 下载视频 | `scripts/bin/videoctl download <video_url> --out <shot.mp4>` |
| 抽末帧 | `scripts/bin/videoctl extract-end-frame <shot.mp4> <shot_end.png>` |

内部网关端点仍是 `https://agent.mob-ai.cn/api/external/video/generate`，但这是 videoctl 的实现细节。Agent 不手写 HTTP 请求。

**超时规则**：videoctl 默认轮询间隔 30s，等待上限 1200s（20 分钟）。满 1200s 才允许判定超时。

---

## 调试检查点

生成出问题优先检查：

1. prompt.md frontmatter 格式正确（`---` 成对、缩进、列表）
2. `assets.images` URL 全部可访问（Content-Type 正确、Content-Length > 0）
3. `shot_function` / `prev_shot_recap` / `next_shot_setup` 三行写没写、写得对不对
4. 是否漏了空间地图 / 末帧承接 / 角色立绘三层 reference 中的某一层
5. 九段式是否完整（对照 `references/authority-prompt-template.md`）
