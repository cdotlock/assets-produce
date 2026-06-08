---
name: character-architect
description: 基于通过评估的小说,重建 MC 和全部攻略角色的完整 Character Bible。每个 LI Bible 含两层:(A) 角色设计层(人设/伤痛/秘密/romance trope) (B) LS 互动机制层(@affection 好感度规则 / @signal 可回调事件 / @butterfly 关系调性 / @gate 路线分叉条件)。前置条件:novel-evaluator 输出 GO 或 CONDITIONAL。当用户需要为一部小说构建互动游戏角色体系时触发。
allowed-tools: Read, Write, Edit, Grep, Glob, WebSearch
---

# Character Architect — 角色体系重建

基于通过 `novel-evaluator` 评估的小说，**重建 MC + 全部 LI 的完整 Character Bible**，完成配角筛选，输出路线对比矩阵。

## 前置条件

- `novel-evaluator` 评估结果为 **GO** 或 **CONDITIONAL**(用户已确认继续)
- 已有小说全文或 Bible 可供参考
- 已识别 Wattpad trope 和可攻略角色候选人
- 已通读 [`../episode-writer/ls-spec.md`](../episode-writer/ls-spec.md) 第 4.7 节(状态变更),掌握 3 个状态指令的分工(character-architect 阶段不直接产出 @gate,那是后续 entity-planner 的活):
  - `@affection <char> +N` — 关系整体温度(数值累积)
  - `@signal <FLAG>` — 具体事件是否发生过(布尔记忆)
  - `@butterfly "..."` — 关系是"怎么"建立的(文本记录,给 LLM 在 influence gate 判定用)

## 核心原则

**把原著当"素材"，不要当"剧本"。**

原著只能给你：
- 世界观设定
- 大致的情感走向
- 主角的核心气质

**所有角色人设都需要重新建构。** 尤其是男二及以下。原著里的"薄"不是问题——你的工作是把它变厚。

**思维方式："这些原材料，我能榨出什么？"**

像改编策划师一样思考：
- 这个角色在原著里的关系可以改吗？（血亲→收养/寄住）
- 这个世界观能容纳什么样的新角色？
- 原著里的配角有没有潜力升级为攻略对象？
- 有没有"坏男孩追妻火葬场"的戏剧张力可以挖掘？

### 纪律:Bible 是 spec,不是 fiction

写 bible 时,你会感到"叙事补位"的冲动——想把含糊的细节脑补成一个合理的、戏剧化的版本。**这个冲动是 bible 里绝大多数幻觉的根源**:伪造台词、改写角色动机、编造伤痛细节、时间线漂移——这些都是同一个根因的不同表现。

铁律:**任何从原著推导的断言,如果你记不清具体是什么,必须标 ⚠ 待验证 或 [fictional expansion] —— 绝不能编造一个合理的版本冒充原著。**

两种合法标记:
- `⚠ 待验证` = 你觉得原著应该有这个细节,但拿不准确切内容。episode-writer 会注意这个点,bible-reviewer 也会重点查
- `[fictional expansion]` = 你明确知道原著没写,你在合理扩展(如 Easton "小时候想当兽医")。这是 acceptable 的,只要你老实标出来

**编造 ≠ 扩展**。编造是你假装"原著就这么说的",扩展是你明确说"这是我补的"。Bible 允许后者,禁止前者。

### 纪律:章节号与引文必须 Grep-verified,不许凭记忆

你的"记忆"不是原著。LLM 记错章节号、把角色 A 的台词记成角色 B 的、把 Ch35 Part Two 记成 Ch35 Part One——这些错误 **每次都会发生**,如果你不主动 grep 验证。这不是"小心一点就好"的问题,是你必须改变写作流程的问题。

**写作流程的硬性要求**:每写一条 `> Evidence: ChN(XXX)` 之前,**必须先用 Grep 工具查 ChN 的章节文件**,确认 XXX 描述的事件/台词在文本里真的出现。没 grep 通过就不许写这条 Evidence。

具体怎么做:
- 写"Ch27 Mauricio 在 MC 怀里哭":grep `ChN 文件` 找 "crying" / "wrapped my arms around him" → 验证是谁抱谁、是不是 Ch27
- 写 `"Nice shirt, greeny"`:grep 该字符串所在章节 → 确认是谁说的、是不是这个 ChN
- 写"Ch43 Enrique 看到手链":grep Ch43 文件找 "bracelet" → 如果 Ch43 没这个词,找到真正的章节再写(大概率是 Ch34 Part One)

**允许的偷懒**:只有当你在同一次对话里**刚刚读过**这一章的完整原文(比如读了 `Ch5.txt`),才可以跳过 grep 直接引用——但必须是"刚读过",不是"一小时前读过"。

**章节命名统一**:
- `ChN`(单纯数字)= 该章是单章(如 Ch27)
- `ChN Part One` / `ChN Part Two` = 该章确实被原著切成两个 Part(如 Ch34 / Ch35)
- `ChN Bonus`(大写 B)= Bonus Chapter
- 写任何一种之前,用 Glob/Read 确认文件名真的对得上。别凭印象写 "Ch20 Part Two"——如果它不存在,这就是幻觉

**根因**:过去的 bible 在 review 阶段每次被抓出 10-15 条引文错误,**全部可以在写的时候用一次 Grep 避免**。Grep 一次的成本远低于事后改一次 + 重跑一次 reviewer。把 Grep 当成写 Evidence 的"保存键"。

## 角色设计和 Wattpad GMCS 框架的关系

Wattpad 教的 GMCS(Goals / Motivation / Conflict / Stakes)在我们的 bible 模板里已经覆盖了,只是叫不同的名字:

| Wattpad GMCS | 我们的 bible 字段 | 说明 |
|---------|---------------|------|
| **Goal**(角色想要什么) | A4 欲望 | 他想要的那个东西 |
| **Motivation**(为什么想要) | A3 核心伤痛 | 伤痛驱动欲望 |
| **Conflict**(什么挡着他) | A9 路线核心张力 | 一句话说清楚阻碍是什么 |
| **Stakes**(搞不定会怎样) | A8 被拒绝时的反应 | 失败的代价是什么样 |

写 bible 时不需要单独写 GMCS,但可以用它来自查:如果填完 A3/A4/A8/A9 之后用 GMCS 串不起来(比如"他的 goal 和他的 pain 之间没有因果关系"),说明某个字段写偏了。

## 第一步：MC 设计

MC 是玩家的代入载体。她必须有鲜明性格但不能太强势——玩家需要能"成为她"。

### MC 设计模板

```markdown
## MC: [名字]

### 表层性格
（玩家和周围人第一眼看到的她）

### 内层秘密
（她在保护什么？她为什么保持距离/建墙/不信任？）
→ 这个秘密最好与父母/过去的经历有关
→ 它定义了她对所有 LI 的初始防线

### 核心恐惧
（她最怕什么发生？这个恐惧驱动她的选择逻辑）

### 代入感校准检查
- [ ] 她的幽默方式是否太特殊？（太文学腔 = 代入失败）
- [ ] 她的内心独白是否像一个真实的18-24岁女性？
- [ ] 不同性格的玩家都能在她身上找到共鸣吗？
- [ ] 她有没有"说了一句自己都没想好的话"的混乱时刻？
```

### MC 代入感标准

**好的MC声音**：
- "他听起来完全一样。三年了他听起来完全一样。这才是最糟的部分。"
- "is the pasta actually good or just the intention"（说出去才意识到自己在暗示什么）

**不好的MC声音**：
- "他并非残忍。他只是和我疏远，方式就像水与你不在的地方疏远。"（太文学）
- 每一段内心独白都精确、克制、有哲理（太成熟，不像真人）

## 第二步：LI（攻略角色）设计

### LI 数量决策规则(必须严格执行)

**不要凭感觉决定 LI 数量。** 按以下 5 步规则推导,结果是多少就是多少。决策过程必须在最终输出里留下"决策日志"。

#### Step 1 — 枚举 mandatory LI

原著给了**明确 romance plot line** 的角色(指有独立的情感发展弧线、MC 对他有明确的情感反应、作者在后记/副标题里确认过他是 LI)。这些角色**强制**作为 LI,无论后续条件如何。

#### Step 2 — 枚举 candidate LI(三项闸门)

每个候选必须同时满足:
- **闸门 a**:原著给了独立人格(不是道具/功能型配角)
- **闸门 b**:原著给了 MC 和他的独立相处戏(不止群戏 background)
- **闸门 c**:原著有明确的 foreshadow / subtle tension / 作者 hint 铺陈

三项同时满足才进入 Step 3。任一失败直接 pass。

#### Step 3 — 路线独立性测试

对每个通过闸门的 candidate:
- **Q1**:升他为 LI 会拆掉原著哪些现成关系?
  - 拆得起(他不是另一对固定 CP 的一半) → 通过
  - 拆不起(他和另一个配角已经是明确 CP,例如已在一起) → 不通过
- **Q2**:他的现有素材 + 合理扩展能撑 15+ 集的路线展开吗?
  - 能 → 通过
  - 不能(只有零散 2-3 场戏,深度不够) → 不通过

#### Step 4 — romance trope gap 诊断(不是硬指标)

统计已通过的 LI 覆盖了 5 类romance trope中的几类。
- 如果 ≥ 3 类:OK
- 如果 < 3 类:**yellow flag**,不强制补,但必须明确写"为什么不补"(例:原著是纯双男主三角恋,强加 LI 会破坏作品完整性)

**绝不为了凑画像而新增 LI**。romance trope跟着小说走,不是反过来。

#### Step 5 — Cap 规则

- 最小 2,最大 4
- 如果 mandatory + 通过测试的 candidate > 4:砍掉 foreshadow 最弱的几个
- 如果 < 2(罕见):从世界观新增,且必须明确标注"新增角色,原著不存在"

#### 决策日志(强制写进最终 bible 包)

写一份 `li-selection-decision.md`,列:
- 所有候选 + 每个在哪一步通过或失败 + 一句话理由
- 最终 LI 数量 + 每个 LI 的来源类型(mandatory / candidate 通过 / 世界观新增)
- romance trope gap 分析(哪些画像没覆盖,理由)

### 角色来源决策(对通过上面规则的每个 LI 二级分类)

| 来源类型 | 何时使用 | 注意事项 |
|---------|---------|---------|
| 原著直接使用 | 角色已有"表层≠内层"结构 | 仍需补全触发点和专属秘密 |
| 原著改编使用 | 角色有潜力但需修改关系/背景 | 如:血亲→收养;性侵→情感背叛 |
| 从世界观新增 | Step 5 触发时用 | 必须自然地住在这个世界里 |
| 隐藏路线升级 | 原著配角戏少但有神秘感 | 适合做付费解锁的隐藏攻略 |

### 每个 LI 的 Character Bible 模板

对每个攻略角色,**必须填完 A 层 + B 层的全部字段**,不能留空。
A 层是角色设计(谁),B 层是 LS 互动机制(episode-writer 怎么用 @affection / @signal / @butterfly / @gate 实现这个角色)。

**Evidence Trail 要求(铁律)**:

A 层和 B 层的**每个**有内容的字段都必须在末尾加一行 `> Evidence:` 注释,列出支撑该断言的章节号或引语。格式:

```
> Evidence: Ch3(帮扶父亲场景)/ Ch6(他道谢场景)/ "Thanks. You didn't tell anyone, right?" (Ch6)
```

这一行是给下游 `bible-reviewer` skill 做 Grep 抽查用的。没有 Evidence 行的字段会被 reviewer 判作幻觉,bible 整体 FAIL。

**例外**:纯设计字段(如 A11 商业优先级、B1/B2 表格的"理由"列)可以不写 evidence;但一切**从原著推导**的字段必须有 evidence。

```markdown
## LI [编号]: [名字]([原型标签]路线)

---

## A. 角色设计层

### A1. 表层人设
(外形简述 + 第一印象 + 社交中的表现)

### A2. 行为模式
(他惯用的处理方式:冷漠/控制/玩笑/沉默/阳光)

### A3. 核心伤痛
(藏在表层下的创伤或恐惧 — 必须具体,不是"他有过不好的经历")

### A4. 欲望与禁忌
(他真正想要但不允许自己拥有的东西)

### A5. 与 MC 的化学反应
(为什么偏偏是她能触碰到他?他们之间的初始摩擦是什么?)

### A6. 专属触发点
→ 靠近触发:____
→ 后退触发:____

### A7. 专属秘密
(只有走他路线才会揭露的核心信息 — 这是他路线的付费锚点)

### A8. 被拒绝时的反应
(MC 让他离开时,他怎么走?说什么?必须与其他 LI 完全不同)

### A9. 路线核心张力(一句话)
"____"

### A10. 对应romance trope
(Enemies to Lovers / Second Chances / Friends to Lovers / Forced Proximity / First Loves / 自定义)
如"自定义",简述玩家视角的核心体感。

### A11. 商业优先级
(高/中/低 — 基于受众基数和付费意愿)

---

## B. LS 互动机制设计层

这三个字段决定 episode-writer 写剧本时怎么用 LS 的状态指令。三个字段各司其职,**不要用 @affection 去判"某件事发生过没",那是 @signal 的活**。

> **注意**:Bible 只写 B1/B2/B3 三层。路线分叉的 `@gate` 具体 condition 写什么、分多少条路线、放在哪一集,这是后续 entity-planner 根据整体剧情规划来决定的,**不在 bible 里定**。Bible 在 B3 提供调性池作为素材,planner 选用。

### B1. 好感度规则(`@affection <li> +/- N`)

列 **5-8 条该 LI 专属**的好感度变化规则。同一个 MC 行为在不同 LI 身上应该产生不同权重——这正是差异化的核心。

| 行为 | `@affection {li} +/- N` | 理由 |
|------|------------------------|------|
| (例)MC 真诚问他家庭情况 | +2 | 他极度封闭,真心关心比任何讨好都值钱 |
| (例)MC 同情式地帮他 | -1 | 他讨厌被怜悯 |
| ... | ... | ... |

### B2. 可回调事件清单(`@signal <FLAG>`)

列 **3-5 个一次性事件**,这些是**剧情记忆**而不是关系温度计。只有这件事真的发生过,后续特定台词/场景才会解锁。

触发场景和回调都按 **game beat** 描述(描述戏剧节点,不绑原著章节号),由后续 episode-writer 决定放在哪一集。"原著锚点"列只是改编原型位置参考。

| FLAG(大写下划线) | 触发场景(game beat) | 后续回调(game beat) | 不触发则如何退化 | 原著锚点 |
|-----------------|---------------------|---------------------|-----------------|---------|
| (例)HELPED_DRUNK_DAD | 父亲酗酒首次暴露时,玩家选"帮他扶父亲进门"而非"留在门廊" | 当场他关门前轻声"Thanks" / 路线中段他主动说更多家庭事 | 回调场景替换为他直接做作业,不提那晚 | 触发:原著 ChN;回调:原著 ChM |
| ... | ... | ... | ... | ... |

**铁律**:
- 好感度阈值(`@if affection.li >= N`)回答"关系多近了?"
- Flag 判定(`@if FLAG_NAME`)回答"那件事发生过没?"
- **不要混用**。判具体事件一定用 `@signal` + `@if FLAG`。
- **触发描述不绑原著章节号**。写"Mauricio 父亲酗酒暴露的场景"而不是"Ch3 选..."。原著章节号放到"原著锚点"列作为参考。

### B3. 候选关系调性池(`@butterfly "..."` 写法分档)

列这个 LI **适合走的候选关系调性**(通常 2-3 种),每种给 **3+ 个 butterfly 描述样例**。

这是给下游 entity-planner 的素材池 — planner 会根据总集数和路线规划从池里挑 1-3 种真正实施(可能全用,也可能合并,也可能舍弃其中一种)。**bible 在这一层不决定路线最终怎么分叉**,只提供 flavor 选项。episode-writer 到时候按 planner 选定的调性写 butterfly。

**调性 1:[名字,如"真诚支持型"]**
- "(样例 1)"
- "(样例 2)"
- "(样例 3)"

**调性 2:[名字,如"banter Friends to Lovers"]**
- "(样例 1)"
- "(样例 2)"
- "(样例 3)"

**调性 flavor 的可区分性测试**:同一个 @choice 场景,不同选项对应不同调性的 butterfly 吗?调性之间的 butterfly 写法够不够让 LLM 一眼分得出?

```

### 五种 LI 原型参考（不必照搬，但每个 LI 应能归入一类）

| 原型 | 核心吸引力 | 受众类型 | Episode 对标 | 商业价值 |
|------|-----------|---------|-------------|---------|
| Enemies to Lovers | 他对世界封闭但对MC有裂缝 | Enemies to Lovers | 《The Bad Boy's Girl》 | 最高 |
| Second Chances | 完美外表下的真实迷茫 | Second Chances | 《Quarterback》 | 高 |
| Friends to Lovers | 停止表演的瞬间 | Friends to Lovers | 《Mr. Popular》 | 高 |
| Forced Proximity | 被人真正看穿 | Forced Proximity | 小众精品 | 中（口碑最高） |
| First Loves | 发现他一直都在 | First Loves | 《The Kissing Booth》 | 中（留存最高） |

### 与 bible-reviewer 的闭环协议

Character bible 的质量保证 = **character-architect 生产 + bible-reviewer 审查**的闭环,不是单边生产。

**工作流**:
1. character-architect 生成首版 bible 包,落地到 `lunascripts/{book-slug}/02-character-architect/`
2. 主动调用 `bible-reviewer` skill 审查当前包
3. 读 bible-reviewer 返回的 `bible-review-report.md`:
   - **PASS** → 交付下游(entity-normalizer / episode-writer)
   - **CONDITIONAL** 或 **FAIL** → 按 report 里每条问题的"修正建议",用 **Edit 工具直接修对应字段**(不要重写整个文件),修完后重新调 bible-reviewer
4. 循环至多 3 轮。3 轮仍不 PASS → 报告给用户决策,不要硬冲

**修正原则**:bible-reviewer 的 report 必须精确到"哪个文件/哪个字段/原错误内容/建议修正内容"。character-architect 用 Edit 一个一个改,不做无关改动。

**禁止**:
- 不要用 Write 重写整个 bible 文件(token 浪费)
- 不要忽视 CONDITIONAL 项以为不严重(CONDITIONAL 意味着有问题只是不致命,下游 skill 依然会被污染)
- 不要绕过 bible-reviewer 直接交付 episode-writer(违反闭环协议,下游会拒收)

## 第三步：配角筛选

### 筛选矩阵

对原著中每个非 LI 角色，做以下分类：

| 决策 | 标准 | 示例 |
|------|------|------|
| **保留** | 能与 MC 产生直接情感摩擦的；代表不同价值观的 | 闺蜜、主要反派 |
| **合并** | 功能重叠的配角；同类型角色 | 多个闺蜜合并为1个 |
| **删除** | 纯推剧情的工具人；只出现一次的信息传递者 | 传话角色、背景板 |

### 最优配角结构

互动游戏的配角不需要多，但每个都要有功能：

```
1个闺蜜/搭档 — MC 的情感出口，帮助玩家表达困惑
1个反派或竞争者 — 制造外部压力
2-3个攻略对象 — 性格必须有显著差异
其余全部砍掉或合并
```

## 第四步：路线对比矩阵

完成所有角色设计后，输出路线对比表：

```markdown
## 路线对比矩阵

| 维度 | LI-1 [名] | LI-2 [名] | LI-3 [名] | (LI-4...) |
|------|----------|----------|----------|-----------|
| 原型 | Enemies to Lovers | Second Chances | Banter | ... |
| 玩家心理 | "他为什么对我不同" | "他在所有人里选了我" | "我们是同类" | ... |
| 核心张力(A9) | (一句话) | (一句话) | (一句话) | ... |
| 被拒绝反应(A8) | (关键行为) | (关键行为) | (关键行为) | ... |
| 付费价值点 | (最值钱的那个时刻) | ... | ... | ... |
| romance trope(A10) | Enemies to Lovers | Second Chances | Friends to Lovers | ... |
| 好感度涨得最快的行为(B1) | 真诚关心家庭 | 记住他说过的话 | 接住他的挑衅 | ... |
| 关键 @signal 数量(B2) | 4 个 | 3 个 | 3 个 | ... |
| 可能的调性分支数(B3) | 2 种(真诚 / banter) | 1 种(专属型) | 2 种(挑衅 / 真心) | ... |
| 商业优先级(A11) | 高 | 高 | 中 | ... |
| 付费节点密度 | 前期密集 | 均匀 | 前期密集 | ... |
```

## 第五步：整体自检

最终输出前，回答以下问题：

1. **如果玩家是 Tyler 路线（冷漠型）的忠实粉丝，她在 E1-4 能否被足够吸引？**
2. **如果玩家是 Lucas 路线（First Loves）的潜在受众，她在前几集有足够的"回头看才发现"的细节吗？**
3. **五条路线提供的情感体验是否真的不同？** 如果去掉名字和外貌描写，玩家能分辨出是谁的路线吗？
4. **MC 的声音是否在所有路线里保持一致？** 她不应该在 Tyler 面前变成一个人、在 Alec 面前变成另一个人。

## 输出清单

所有产物落在 `lunascripts/{book-slug}/02-character-architect/`:

1. `li-selection-decision.md` — LI 数量决策日志(5 步规则的执行记录)
2. `mc-bible-{mc-name}.md` — MC Character Bible(A+B 双层,带 Evidence Trail) **+ Canonical Wardrobe 节**
3. `li-bible-01-{name}.md` — 每个 LI 的完整 Bible(A+B 双层,带 Evidence Trail) **+ Canonical Wardrobe 节**
4. `li-bible-02-{name}.md`
5. `li-bible-03-{name}.md` (如有)
6. `li-bible-04-{name}.md` (如有)
7. `supporting-cast-filter.md` — 配角筛选 + 路线对比矩阵 + 给 episode-writer 的交接备注 **+ Canonical Wardrobe — Supporting Cast 节(配角分子节)**

## Canonical Wardrobe（必填，下游 contract）

**每个 main bible 末尾必须有一节 `## Canonical Wardrobe (rendering contract)`**，是一张 markdown 表格，列出该角色全本会穿的所有衣服。这是下游 06-asset-prompt-generator 渲染立绘时唯一允许的 outfit 文本来源 —— **没有这节，sprite 渲染会跨集碎片化、dedup 失效、render 多花 N 倍钱**。

格式（必须严格遵守，下游用 markdown table 解析）：

````markdown
## Canonical Wardrobe (rendering contract)

> **Locked identifiers — sprite render contract.** `asset-prompt-generator` reads this table; the `outfit` field of every sprite prompt MUST pick a row from here (by `text`).

> **Stability rule:** the `text` column is byte-stable across episodes. Don't paraphrase. Don't tweak colors per scene.

| id | text | when |
|---|---|---|
| `casual_default` | 黑色 hoodie,深蓝 Levi's 直筒牛仔裤,白色 Nike Air Force 1,Bellamy 金表 | default 日常 |
| `jil_sander_sweater` | 黑色羊绒 Jil Sander 圆领套头毛衣,深炭灰色 Acne Studios 修身长裤,黑色 Common Projects 低帮皮鞋 | 课堂 / 室内 |
| `gallery_formal` | 黑色西装外套,画廊开幕正装,Bellamy 家族金表 | ep22 画廊开幕 |
| `formal_gala` | Tom Ford 黑色三件套西装,白衬衫,Bellamy 金表 | 父亲 / 正式晚宴 |
````

**填写规则：**

| 字段 | 规则 |
|---|---|
| `id` | snake_case, ASCII only, ≤24 char, stable across 重跑 |
| `text` | 逐字渲染描述（中文为主，品牌名英文），**不带句号**，包含品牌锚点+具体单品 |
| `when` | 叙事场合提示（"default 日常" / "ep14 派对" / "晚宴" / "课堂") |

**条数指引：**

- main char(MC + LI):**≤5 条** outfit slot 强制限制。多于 5 条说明 wardrobe 超资源预算，必须 dedup。允许例外：视觉独特的穿搭（如 bathrobe/business_suit/formal_evening）在设计上确实无法折叠时可破例
- 配角:**≤2 条** outfit slot，放在 `supporting-cast-filter.md` 的 `## Canonical Wardrobe — Supporting Cast` 大节下,以 `### {char_name}` 分子节,每子节一张表;同样允许案例豁免

**行业基准(VN / interactive fiction):**
- Choices/Pixelberry:每 LI 3-5 套
- Lovestruck/Voltage:3-4 套
- Mystic Messenger:2-3 套
- 4-7 是 sweet spot —— 给玩家足够换装新鲜感,但不会让 sprite 库爆炸

**类 A vs 类 B 决策(把每件候选装归一类后再写入表):**

| | 类 A — 必须独立成 row | 类 B — 合并到一行 `casual` |
|---|---|---|
| 工作制服 | waitress_uniform / nurse_uniform / construction_tee / basketball_uniform / business_suit / cooking_apron | — |
| 睡衣 | sleepwear | — |
| 仪式装 | formal_gala / red_silk_dress / wedding / funeral_black / formal_evening | — |
| signature 戏服 | 剧情专门强调的(高领毛衣遮吻痕、那条绿裙、ep1 出场穿的招牌套装) | — |
| 半裸 / 特殊状态 | shirtless_jeans / 浴袍 | — |
| 一般 T 恤+裤子 | — | tee / polo / hoodie / 卫衣 / clean_shirt 各种变体 |
| 一般 outerwear | — | jacket / 夹克 / leather (除非剧情有锚点) |
| Athletic / beach / preppy 这类气质标签 | — | athletic_casual / beach_casual / preppy 等 |

**为什么类 B 都合到一个 `casual` row:**渲染出来的 9:16 立绘里,"polo+卡其"和"tee+牛仔裤"的视觉差异远小于"polo+卡其"和"婚纱"的差异。玩家只关心"他换了一身"还是"他还是那身",不关心"polo 还是 tee"。把类 B 全合一,LLM 在 06 阶段没有 paraphrase 空间,跨集自动 byte-stable。

**`casual` row 的 text 怎么写:**挑该角色最具识别度的一套日常装(他的"signature look"),用品牌锚点+具体单品写完整 —— 这件衣服会在剧本里出现 5-10+ 集,值得详细描述。例:
- selena casual = `深绿色 Brandy Melville V 领长袖 tee,深蓝高腰水洗 Levi's mom jeans,白色 Nike Air Force 1`
- weston casual = `灰色 UA 运动 hoodie 拉链打开露白 tee,黑篮球短裤,白 Nike Air Max,黑运动表`(athletic identity 锁住)
- diego casual = `黑色 hoodie,黑色牛仔裤,银色耳钉,十字项链,手指戒指`(saint-and-sinner 配饰)

**何时新增装：**

- ✅ 真正不同的衣服(streetwear ↔ formal ↔ sleepwear ↔ uniform ↔ gala) —— 类 A
- ✅ 剧情驱动的关键换装(ep12 红裙、ep16 服务员制服) —— 类 A
- ❌ 颜色变化、印花变化、加配饰 —— 这些是同一 canonical 的视觉变体，不是新装
- ❌ 类 B 的同义词(tee_sweatpants / polo_khakis / athletic_casual / beach_casual / clean_shirt 这种)—— 全部进 `casual`,**不要**另起 id
- ❌ "想画面新鲜一点" —— 视觉变化由 expression_pose 和 background 提供，不是细节服装词

**典型踩坑(this skill 自己的复盘):**
1. 早期 wardrobe 没沉淀进 bible 时,下游 06 阶段每集让 LLM 自由发挥,结果同一件"日常便装"在不同集被写成 23 种不同字符串(全部 selena 私服 ep10/14/18/22 都是不一样的写法),跨集不能合并 → render 多花 50%+ 的钱。Phase D 以后必须先有 bible canonical_wardrobe 才进 06 阶段。
2. wardrobe 写得**过于丰富**也是坑:nrbi 第一版给 selena 列了 14 行(每件类 B 都另起 id `brandy_melville_tee` / `crop_top_jeans` / `knit_sweater_jeans` / `silk_shirt_formal` / `vintage_cotton_tee` ...),跑完 06 出 1793 张 sprite,后期不得不补 `outfit_fold.py` 把 7 行类 B 合到一个 `casual`,降到 1492。**正解是源头就只写 MC/LI ≤5 行，supporting ≤2 行**;`outfit_fold.py`(见 06 章节)是 fallback 用在不得已时,不是主线。

#### Layered Variants(不算 cap 名额)

如果某个 beat 需要 base outfit + 一件**临时外披**(hoodie / coat / robe / 校队夹克 / blazer …),**不要新开一个 outfit slot**。在 main bible 里 `## Canonical Wardrobe` 表后面加一个 `## Layered Variants (do not count against outfit cap)` 子节,用同样的 `| id | text | when |` 表格写 variant 行,id 用 `<base>_<overlay>` 形式(`red_silk_dress_hoodie` / `sleepwear_robe` / `casual_coat` / `casual_letter_jacket` …)。

**为什么单独区分:**
- variant 复用 base 的人物身份/姿态,只是叠加一层外披,不是真正的换装
- 渲染上 variant 仍然会出 anchor PNG + sprite PNG(LS 里 look_name 用 `<base>_hooded` / `_robed` / `_coated` / `_jacket` 后缀会自动路由到 variant),所以 variant 行**仍然是 canonical**,不是注释
- 但语义上它们是同一个 outfit identity 的临时叠层,占 cap 名额不公平 → 单独成节,parser (`canonical_wardrobe.py`) 用 `is_layered_variant=True` 打标,`as_base_outfits()` 在做 cap counting 时过滤掉它们

**举例(selena bible):**
```markdown
## Canonical Wardrobe (rendering contract)
| id | text | when |
| `casual` | 深绿色 Brandy Melville V 领长袖 tee... | default |
| `red_silk_dress` | 红色丝绸连衣裙,六英寸高跟靴 | ep12 派对 |
| `sleepwear` | 米白色丝绸睡衣套装 | 卧室 |
| ...

## Layered Variants (do not count against outfit cap)

> Base outfit + 一件临时外披(hoodie/coat/robe)。复用 base 身份,只多一层。

| id | text | when |
| `red_silk_dress_hoodie` | 红色丝绸连衣裙外罩灰色 hoodie | ep12 BEAT-1 |
| `sleepwear_robe` | 米白丝绸睡衣套浴袍 | 卧室开门 |
| `casual_hood_up` | casual + 帽子戴起 | 雨天/低落 |
| `casual_coat` | casual 外罩米色大衣 | 冬季室外 |
```

**LS look_name 约定:**
- base look: `@selena look red_silk_dress_partyA` → 渲到 `casual` 锚点的 sprite
- variant look: `@selena look red_silk_dress_hooded` / `_robed` / `_coated` / `_jacket` → 06 pose clustering 把它聚类到 variant outfit_id,渲到 variant 锚点的 sprite

**不要自己生成 review 报告。** review 是下游 bible-reviewer skill 的职责。

### Lock & frontmatter（下游 contract，5.5 阶段自动写入）

`## Canonical Wardrobe` 表通过 5.5-wardrobe-consolidator 锁定后，bible md 顶部会自动加 YAML frontmatter：

```yaml
---
char: selena
wardrobe_locked: true
wardrobe_locked_at: '2026-MM-DD'
wardrobe_lock_hash: <sha256-of-wardrobe-section>
---
# Bible Title
... rest of bible body ...
```

- **02 author 不要手写这段** —— 5.5 的 `--apply` 自动写入
- 改 `## Canonical Wardrobe` 表后 lock hash 自动失效 → 06 启动时拒绝跑 → 必须重跑 5.5 apply 才解锁
- supporting cast bible 一个文件多个 char 共用一个 frontmatter，hash 覆盖整个 wardrobe section
- 没有 frontmatter 的 bible 等同 unlocked，下游 02.5 + 06 拒绝运行

**为什么有 lock：** `## Canonical Wardrobe` 是 02.5-outfit-anchor-renderer 的输入；anchor PNG 一旦渲好，bible 那行 text 就被钉死成图像契约。如果作者悄悄改 text 而不重渲 anchor，sprite 还引用旧 anchor 但 LLM 看到新 text，描述和视觉对不上。lock + hash 强制"改 text → 重 5.5 → 重渲 anchor"的完整流程。

## 下一步

产物生成后,调用 bible-reviewer skill 启动闭环审查流程。详见上方"与 bible-reviewer 的闭环协议"。

## 禁止事项

- **不要凭感觉定 LI 数量**:必须走完五步规则并留下决策日志
- **不要让两个 LI 有相同的"被拒绝反应"**:这是人设差异化的核心
- **不要把男二写成"压缩版男主"**:他应该是"不同哲学的对立面"
- **不要忽略原著的改编可能性**:血亲可以改成收养,性侵可以改成背叛
- **不要为了凑画像而新增 LI**:romance trope跟着小说走,不是反过来
- **不要漏 Evidence Trail**:每个从原著推导的字段都必须有 `> Evidence:` 行,否则 bible-reviewer 会 FAIL
- **不要在这个阶段写剧本台词**:这是角色设计阶段,不是剧本写作阶段
