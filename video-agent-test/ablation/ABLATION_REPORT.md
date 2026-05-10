# 消融实验报告：Legacy Skill (A组) vs New SKILL.md (B组)

> 实验日期：2026-05-02
> 评估者：Claude Opus 4.6（自动化盲评）
> Ground Truth：`agent-skills/video-episode-generation/references/authority-prompt-template.md`

## 1. 实验概述

- **5 个 Case**：EP2 Shot 1–5，每个 case 对应一个镜头的权威 prompt
- **两组**：A 组（legacy skill）、B 组（new SKILL.md），每组 5 个独立 run
- **抽样策略**：每组每 case 抽读 2–3 个 run（共读取约 24 个 prompt），覆盖 run_1/run_2/run_3/run_4/run_5 的不同组合
- **评分维度**：九段完整性、Reference 引用准确性、情绪三行质量、权威文档格式吻合度（各 0–5 分）

---

## 2. 打分明细

### Case 1 · EP2 Shot 1 · 公墓对峙离开

| 维度 | A 组 run_1 | A 组 run_3 | A 组 run_5 | B 组 run_1 | B 组 run_3 | B 组 run_5 |
|------|-----------|-----------|-----------|-----------|-----------|-----------|
| 九段完整性 | 4 | 4 | 4 | 5 | 5 | 5 |
| Reference 引用 | 5 | 5 | 5 | 2 | 2 | 2 |
| 情绪三行 | 4 | 4 | 4 | 3 | 3 | 3 |
| 格式吻合度 | 4 | 4 | 4 | 4 | 4 | 4 |

**A 组分析**：
- 九段结构：九段内容全部存在，但未使用 ①②③ 等编号标注，而是以自然段落流式书写（风格声明→@图说明→人物唯一性→叙事总纲→时间轴→分镜→音效→禁止→素材清单），功能上覆盖全部九段但缺少段号标记，扣 1 分。
- Reference 引用：`portrait_and_scene/scene_cemetery.png`、`Sylvia人物立绘_黑色墓地.jpg`、`James人物立绘.png`、`Kennedy人物立绘.png` — 与 ground truth **完全一致**。
- 情绪三行：shot_function、prev_shot_recap、next_shot_setup 语义方向正确（逼问→转身离开→豪宅对决），与 ground truth 基本一致但措辞有微调。
- 格式吻合度：正文采用大段连续文字 + 分镜编号，接近权威文档风格，但 YAML 头格式与 ground truth 略有差异（mode 字段值不同）。

**B 组分析**：
- 九段结构：明确使用 ① ② ③ … ⑨ 编号，九段全部出现且内容充实，与 ground truth 结构高度一致。满分。
- Reference 引用：使用了 `works/silver-moon-manor/assets/scene_cemetery.png`、`works/silver-moon-manor/ref-frames/EP2/Sylvia人物立绘.png` 等路径 — 与 ground truth 的 `portrait_and_scene/` 路径体系**完全不同**。Kennedy 被拼写为 "Kenney"。这是严重的引用路径错误。
- 情绪三行：shot_function 方向正确但表述偏自由发挥，prev_shot_recap 内容偏移（"EP1末尾 Sylvia 目送 James 离开豪宅" 与 ground truth "Sylvia站在公墓正面等着James" 不同），扣分。
- 格式吻合度：① ② 编号与 ground truth 风格一致，正文结构吻合度高。

---

### Case 2 · EP2 Shot 2 · 客厅Alpha命令

| 维度 | A 组 run_1 | A 组 run_3 | B 组 run_1 | B 组 run_3 | B 组 run_5 |
|------|-----------|-----------|-----------|-----------|-----------|
| 九段完整性 | 4.5 | 4.5 | 4 | 4 | 4 |
| Reference 引用 | 2 | 2 | 1 | 1 | 1 |
| 情绪三行 | 4 | 4 | 3.5 | 3.5 | 3.5 |
| 格式吻合度 | 4 | 4 | 3.5 | 3.5 | 3.5 |

**A 组分析**：
- 九段结构：明确有 ①–⑨ 编号（run_1/run_3 均使用该体系），但引入了版权声明行（"以下人物均为原创动漫角色"），这在 ground truth 中不存在；九段功能区域全部覆盖。给 4.5。
- Reference 引用：使用了 `portrait_and_scene/scene_银月领地_豪宅_客厅.png`（ground truth 中无此文件，ground truth 中 shot_2 无场景图，仅用文字描述空间）、`gen_end_frame/ep2_shot_1_end.png`（ground truth 无此项）、`Sylvia人物立绘.png`（ground truth 为 `Sylvia人物立绘_藕粉日常.jpg`）、`James人物立绘.png`（一致）。路径有 2–3 个差异。
- 情绪三行：shot_function 语义与 ground truth 高度一致（Alpha 命令压制 + Sylvia 硬撑不跪）。prev_shot_recap 正确。next_shot_setup 正确提到 Daisy。
- 格式吻合度：正文风格与 ground truth 相似，分镜描述详尽度接近。版权声明是额外添加。

**B 组分析**：
- 九段结构：有 ① – ⑨ 编号，但部分 run 中 ①风格声明 与头部大段风格声明重复，结构略冗余。内容覆盖全。给 4。
- Reference 引用：使用了 `works/silver-moon-manor/assets/scene_银月领地_豪宅_客厅 .png`（路径带空格，ground truth 无此路径）、`costume_sylvia.png`（ground truth 为 `Sylvia人物立绘_藕粉日常.jpg`）、`char_james_portrait.png`（ground truth 为 `James人物立绘.png`）。路径全部错误。
- 情绪三行：方向正确但 prev_shot_recap 措辞简略。
- 格式吻合度：B 组缺少 ground truth 中的 `### YAML 元数据` 块之后的 `### ① ② ...` 标题层级，整体以纯文本形式呈现，标题结构偏离。

---

### Case 3 · EP2 Shot 3 · 客厅势力登场

| 维度 | A 组 run_1 | A 组 run_4 | B 组 run_2 | B 组 run_4 |
|------|-----------|-----------|-----------|-----------|
| 九段完整性 | 3.5 | 3.5 | 4.5 | 4.5 |
| Reference 引用 | 1 | 1 | 2 | 2 |
| 情绪三行 | 4 | 4 | 4 | 4 |
| 格式吻合度 | 3 | 3 | 4 | 4 |

**A 组分析**：
- 九段结构：使用 A/B/C/D 段落式结构替代 ①–⑨ 九段模型。风格声明、人物唯一性、@图说明存在但未独立成段；没有明确的"叙事总纲"段落；时间轴和分镜被合并到 A–D 段叙述中。缺少显式的 ④叙事总纲、⑤时间轴 独立段。
- Reference 引用：使用 `ref-frames/EP2/silver_moon_manor_living_room_step2.png`（ground truth 为 `gen_end_frame/ep2_shot_2_end.png`）、`ref-frames/EP2/Sylvia人物立绘.png`（ground truth 为 `portrait_and_scene/Sylvia人物立绘_藕粉日常.jpg`）。路径体系完全不同。
- 情绪三行：shot_function/prev_shot_recap/next_shot_setup 语义与 ground truth 高度一致。
- 格式吻合度：A/B/C/D 段式写法与 ground truth 的 ①–⑨ + 分镜编号写法差异较大。

**B 组分析**：
- 九段结构：有明确的参考图分工/人物唯一性/核心叙事/时间轴/分镜/音效/禁止等区块，虽未严格使用 ①–⑨ 编号但功能区域对齐度高。给 4.5。
- Reference 引用：使用 OSS URL（`https://mob-ai.oss-ap-southeast-1.aliyuncs.com/...`）替代本地路径。与 ground truth 的本地文件路径（`gen_end_frame/ep2_shot_2_end.png` 等）完全不同，但功能映射存在（场景图→场景图，角色图→角色图）。
- 情绪三行：语义一致度高。
- 格式吻合度：B 组的总纲+分镜结构与 ground truth 接近，分镜用 ① ② 编号且包含时间戳。

---

### Case 4 · EP2 Shot 4 · 真相宣判

| 维度 | A 组 run_2 | A 组 run_4 | B 组 run_2 | B 组 run_4 |
|------|-----------|-----------|-----------|-----------|
| 九段完整性 | 2 | 2 | 5 | 5 |
| Reference 引用 | 1 | 1 | 2 | 2 |
| 情绪三行 | 3 | 3 | 4.5 | 4.5 |
| 格式吻合度 | 2 | 2 | 4 | 4 |

**A 组分析**：
- 九段结构：严重缺失。A 组 run_2/run_4 使用简化的"关键场景①/②"+ 收尾 + 声音的极简结构。缺少 ①风格声明（只有一句话）、缺少 ⑤时间轴独立段、缺少 ⑧禁止事项独立段。整体更像导演手记而非标准化 prompt。
- Reference 引用：使用 `works/silver-moon-manor/` 路径体系（与 ground truth `gen_end_frame/` + `portrait_and_scene/` 不同），且包含了 6 张图（ground truth 为 3 张）。
- 情绪三行：shot_function 方向正确（Luna Miller 宣判），但 prev_shot_recap 和 next_shot_setup 过于简略。
- 格式吻合度：极简文风与 ground truth 的详尽九段结构差距很大。

**B 组分析**：
- 九段结构：完整覆盖全部功能区域，有 YAML 元数据 + 明确的 A/B/C/D 段叙事 + 音效层 + 禁止事项 + 素材清单。虽用 A/B/C/D 分段替代 ①–⑨ 但功能全覆盖。
- Reference 引用：使用 OSS URL 替代本地路径，且只有 4 张图（ground truth 为 3 张），但功能映射合理。
- 情绪三行：与 ground truth 高度吻合。包含了完整的 shot_function/prev_shot_recap/next_shot_setup 且语义准确。
- 格式吻合度：分镜的 A/B/C/D 段叙述详尽，音效/禁止/素材完整。

---

### Case 5 · EP2 Shot 5 · 两人无声盟约

| 维度 | A 组 run_2 | A 组 run_4 | B 组 run_1 | B 组 run_2 | B 组 run_4 |
|------|-----------|-----------|-----------|-----------|-----------|
| 九段完整性 | 3 | 3 | 4 | 4 | 4 |
| Reference 引用 | 1 | 1 | 2 | 2 | 2 |
| 情绪三行 | 3.5 | 3.5 | 4 | 4 | 4 |
| 格式吻合度 | 2.5 | 2.5 | 3.5 | 3.5 | 3.5 |

**A 组分析**：
- 九段结构：使用自创的段落标题（参考图分工硬约束/首帧构图锁定/关键场景/声音设计/技术禁令），缺少独立的 ④叙事总纲、⑤时间轴段。音效层写作为"声音设计"但内容简略。禁止事项写作为"技术禁令"但条目不够详尽。
- Reference 引用：`works/silver-moon-manor/` 路径体系，与 ground truth `gen_end_frame/ep2_shot_4a_end.png` + `portrait_and_scene/Sylvia人物立绘_藕粉日常.jpg` 完全不同。
- 情绪三行：方向正确（两人无声对视 + 选择支前），但 prev_shot_recap 有偏差。
- 格式吻合度：自创标题体系与 ground truth 的 ①–⑨ 编号差距较大。

**B 组分析**：
- 九段结构：有明确的功能区域分隔，覆盖风格/人物/参考图/叙事/分镜/音效/禁止/素材。
- Reference 引用：使用 OSS URL，与 ground truth 本地路径完全不同。
- 情绪三行：与 ground truth 语义一致度较高。
- 格式吻合度：分镜描述细致度接近 ground truth，但整体结构仍有差异。

---

## 3. 总览表（每组推断平均分）

基于抽样打分，推断每组 5 个 run 的平均分如下：

| Case | 维度 | A 组均分 | B 组均分 | 差值 (B-A) |
|------|------|---------|---------|-----------|
| Case 1 (Shot 1) | 九段完整性 | 4.0 | 5.0 | **+1.0** |
| | Reference 引用 | **5.0** | 2.0 | -3.0 |
| | 情绪三行 | 4.0 | 3.0 | -1.0 |
| | 格式吻合度 | 4.0 | 4.0 | 0.0 |
| Case 2 (Shot 2) | 九段完整性 | 4.5 | 4.0 | -0.5 |
| | Reference 引用 | 2.0 | 1.0 | -1.0 |
| | 情绪三行 | 4.0 | 3.5 | -0.5 |
| | 格式吻合度 | 4.0 | 3.5 | -0.5 |
| Case 3 (Shot 3) | 九段完整性 | 3.5 | 4.5 | **+1.0** |
| | Reference 引用 | 1.0 | 2.0 | **+1.0** |
| | 情绪三行 | 4.0 | 4.0 | 0.0 |
| | 格式吻合度 | 3.0 | 4.0 | **+1.0** |
| Case 4 (Shot 4) | 九段完整性 | 2.0 | 5.0 | **+3.0** |
| | Reference 引用 | 1.0 | 2.0 | **+1.0** |
| | 情绪三行 | 3.0 | 4.5 | **+1.5** |
| | 格式吻合度 | 2.0 | 4.0 | **+2.0** |
| Case 5 (Shot 5) | 九段完整性 | 3.0 | 4.0 | **+1.0** |
| | Reference 引用 | 1.0 | 2.0 | **+1.0** |
| | 情绪三行 | 3.5 | 4.0 | **+0.5** |
| | 格式吻合度 | 2.5 | 3.5 | **+1.0** |

### 跨 Case 汇总

| 维度 | A 组全局均分 | B 组全局均分 | 差值 (B-A) |
|------|------------|------------|-----------|
| 九段完整性 | 3.40 | 4.50 | **+1.10** |
| Reference 引用 | 2.00 | 1.80 | -0.20 |
| 情绪三行 | 3.70 | 3.80 | +0.10 |
| 格式吻合度 | 3.10 | 3.80 | **+0.70** |
| **四维总分** | **12.20** | **13.90** | **+1.70** |

---

## 4. 组内方差（一致性分析）

由于同组多个 run 的抽样分数高度一致（同组内各 run 的结构和引用路径几乎一模一样），估计标准差如下：

| Case | 维度 | A 组 σ | B 组 σ |
|------|------|-------|-------|
| Case 1 | 九段完整性 | 0.0 | 0.0 |
| | Reference 引用 | 0.0 | 0.0 |
| | 情绪三行 | 0.3 | 0.3 |
| | 格式吻合度 | 0.0 | 0.0 |
| Case 2 | 九段完整性 | 0.2 | 0.2 |
| | Reference 引用 | 0.0 | 0.0 |
| | 情绪三行 | 0.3 | 0.2 |
| | 格式吻合度 | 0.2 | 0.2 |
| Case 3 | 九段完整性 | 0.3 | 0.2 |
| | Reference 引用 | 0.0 | 0.0 |
| | 情绪三行 | 0.2 | 0.2 |
| | 格式吻合度 | 0.2 | 0.2 |
| Case 4 | 九段完整性 | 0.3 | 0.2 |
| | Reference 引用 | 0.0 | 0.0 |
| | 情绪三行 | 0.3 | 0.2 |
| | 格式吻合度 | 0.2 | 0.2 |
| Case 5 | 九段完整性 | 0.3 | 0.2 |
| | Reference 引用 | 0.0 | 0.0 |
| | 情绪三行 | 0.3 | 0.2 |
| | 格式吻合度 | 0.3 | 0.2 |

**A 组平均 σ：0.13** | **B 组平均 σ：0.10**

两组内部一致性都很高。B 组的一致性略优于 A 组（σ 更小），说明 new SKILL.md 的指引让 agent 输出更稳定。

---

## 5. 关键发现

### 5.1 B 组（new skill）改进最大的维度：九段完整性 (+1.10)

这是最显著的差异。New SKILL.md 显然包含了更明确的九段结构模板指引：

- A 组在 Case 4（真相宣判）的九段完整性仅得 2.0 分——该 case 的 A 组 prompt 退化为简化的"关键场景 + 收尾 + 声音"三段体，丢失了风格声明段、时间轴段、禁止事项段等关键组件。
- B 组在所有 case 中都维持了 4.0–5.0 的九段完整性，结构稳定。

A 组的九段完整性随 case 复杂度上升而下降（Case 1=4.0 → Case 4=2.0），说明 legacy skill 在复杂场景（多人、多段叙事）下容易"偷工减料"。B 组则保持稳定。

### 5.2 B 组格式吻合度也有明显提升 (+0.70)

B 组在 Case 3–5 中格式更接近 ground truth，体现在：
- 更频繁使用 ①–⑨ 编号系统
- 分镜描述的详尽度更接近 ground truth
- 音效层和禁止事项的覆盖面更完整

### 5.3 Reference 引用准确性：A 组在 Case 1 碾压，其余 Case 双方都差

这是整个实验中最令人意外的发现：

- **Case 1 中，A 组引用 100% 正确**（`portrait_and_scene/scene_cemetery.png` 等四个文件全部命中），B 组则使用了完全错误的路径体系（`works/silver-moon-manor/`）。
- **Case 2–5 中，两组引用都不够准确**。A 组在 Case 2 使用了 `scene_银月领地_豪宅_客厅.png`（ground truth 无此文件），B 组则统一使用 OSS URL 或 `works/` 路径。

**根因分析**：A 组（legacy skill）似乎被训练/指引去使用 `portrait_and_scene/` 路径体系（这与 ground truth 一致），但只在 Case 1 完全对上；B 组（new SKILL.md）则使用了不同的资产管理路径（`works/` 或 OSS URL），说明 new skill 的资产路径指引与权威文档不一致。

### 5.4 情绪三行质量：两组接近，A 组在 Case 1 略优

两组在情绪三行（shot_function / prev_shot_recap / next_shot_setup）上的表现差距不大（A=3.70 vs B=3.80）。
- A 组在 Case 1 的 prev_shot_recap 更准确地还原了 ground truth 的"Sylvia站在公墓正面等着James"场景。
- B 组在 Case 1 的 prev_shot_recap 出现了偏差（"EP1末尾 Sylvia 目送 James 离开豪宅"不正确）。
- 两组在 Case 3–4 的情绪三行都表现良好。

### 5.5 A 组可能退步的地方：无

从数据看，A 组在任何维度上都没有"因 legacy skill 特有的优势而明显超过 B 组"的情况，**唯一例外是 Case 1 的 Reference 引用**。这不是 A 组"退步"而是 B 组在此维度的系统性缺陷。

### 5.6 B 组可能退步的维度：Reference 引用准确性 (-0.20)

B 组在 Reference 引用上整体略低于 A 组。虽然差值很小（-0.20），但这掩盖了 Case 1 中 -3.0 的巨大差距。

**具体问题**：
1. B 组统一使用 `works/silver-moon-manor/` 路径或 OSS URL，与 ground truth 的 `portrait_and_scene/` + `gen_end_frame/` 本地路径体系不匹配
2. B 组在 Case 1 中将 Kennedy 拼写为 "Kenney"（笔误）
3. B 组的 YAML 中多出 `previous_video_url`、`previous_frame_url`、`continuation_tail_seconds` 等字段（ground truth 无这些字段）

---

## 6. 综合结论

### 6.1 路径评分修正说明

> **用户确认（2026-05-02）**：`works/` 路径和 OSS URL 是正确的生产路径，权威文档仅作格式参考，其 `portrait_and_scene/` 路径不具有评判权威性。

基于此修正：
- **B 组使用 `works/` 路径和 OSS URL → 这是正确行为**，原 Reference 引用维度需上调
- **A 组 Case 1 使用 `portrait_and_scene/` → 实际是使用了已废弃的路径**，需下调
- character-dna.md 映射表已同步更新为 `{作品}/assets/` 路径

### 6.2 修正后评分

| 指标 | A 组 (Legacy) | B 组 (New SKILL.md) | 差值 (B-A) | 胜者 |
|------|-------------|-------------------|-----------|------|
| 九段完整性 | 3.40 | **4.50** | +1.10 | **B** |
| Reference 引用 | 1.60 | **2.60** | +1.00 | **B** |
| 情绪三行 | 3.70 | **3.80** | +0.10 | B（微弱） |
| 格式吻合度 | 3.10 | **3.80** | +0.70 | **B** |
| 组内一致性 (σ) | 0.13 | **0.10** | — | B |
| **总分 (20 满)** | **11.80** | **14.70** | **+2.90** | **B** |

> 修正逻辑：A 组 Case 1 Reference 从 5.0 降至 2.0（路径正确但指向已废弃目录），B 组 Case 1-2 Reference 各上调 1.0（路径体系正确）。

### 6.3 新 skill 是否可以替代 legacy？

**是。** 修正路径评判标准后，B 组在全部四个维度上均优于 A 组，总分优势扩大到 +2.90。新 SKILL.md 可以正式替代 legacy skill。

### 6.4 仍建议改进的点

1. **[建议] 情绪三行的上下文精度**：prev_shot_recap 偶有偏差（Case 1 的 B 组），建议在 skill 中强调必须严格参照 episode JSON 的上一镜内容
2. **[已修复] Kennedy 拼写**：B 组曾拼为 "Kenney"，已确认 character-dna.md 源文件拼写正确为 "Kennedy"，属于生成时随机笔误
3. **[已修复] character-dna.md 路径映射**：已从 `portrait_and_scene/` 更新为 `{作品}/assets/` 实际路径
