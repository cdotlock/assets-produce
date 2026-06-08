---
name: bible-reviewer
description: 对 character-architect 产出的 Character Bible 包做深度审查。强制通过 Agent tool spawn 独立 sub-agent 执行,用新鲜视角做 Evidence Trail 全扫(不是抽样)+ 跨 LI 分化 + 决策日志合规。输出 bible-review-report.md 并给出 PASS / CONDITIONAL / FAIL 判决。前置条件:character-architect 已完成。当用户需要验证 Character Bible 质量、判断是否能进入 entity-normalizer / episode-writer 时触发。
allowed-tools: Read, Write, Grep, Glob, Bash(wc:*, cat:*, ls:*, head:*, tail:*), Task
---

# Bible Reviewer — Character Bible 深度审查

## 核心原则:cross-review,不是 self-review

**执行此 skill 必须通过 Agent tool spawn 一个 general-purpose 独立 sub-agent 来做审查。主 agent 不亲自审。**

原因:同一个 LLM 写 bible 又审 bible 有严重的自我保护偏差。哪怕强制 Grep 验证,对自己的创作也容易"网开一面"。实测:同一次流程里,主 agent 自审遗漏的盲点,独立 sub-agent 能抓出 3-5 个以上。

**主 agent 的唯一职责**:组装一个清晰的 prompt,把下面"审查协议"和"输入文件清单"交给 sub-agent,然后把 sub-agent 返回的 report 保存成 `bible-review-report.md`。

---

## bible 质量验证的思想

bible 的质量**由能被验证的证据决定**,不由 bible 自己声称的质量决定。

character-architect 写 bible 时,每个从原著推导的字段都带了 `> Evidence:` 行。sub-agent 的工作:
- 抽查若干条 evidence 去原著 Grep 验证
- 命中率不够 → FAIL(有幻觉)
- 命中率够了 → 继续做跨 LI / 跨场景 / 决策合规的 5 项深度检查

没通过的 bible **禁止**进入下游 skill。

---

## 输入

1. **bible 包路径**:`lunascripts/{book-slug}/02-character-architect/`
   - 必须包含:`li-selection-decision.md`、`mc-bible-*.md`、至少 2 份 `li-bible-*.md`、`supporting-cast-filter.md`
2. **原著目录**:`novels/{book-slug}/`
3. **原著阅读日志**(强烈推荐):`lunascripts/{book-slug}/01-novel-evaluator/reading-log.md`——用于快速定位 Ch 引用的文件

## 执行步骤(主 agent 的全部职责)

1. 先用 `Glob` 粗略确认输入完整性(仅 Step 1 主 agent 自己做,其他步骤都委托 sub-agent):

   - [ ] `li-selection-decision.md` 存在
   - [ ] `mc-bible-*.md` 至少 1 份
   - [ ] `li-bible-*.md` ≥ 2 份
   - [ ] `supporting-cast-filter.md` 存在
   - 任一缺失 → 不必 spawn sub-agent,直接生成 FAIL 报告给用户

2. 用 `Task` 工具 spawn `general-purpose` sub-agent,prompt 必须包含:
   - bible 包路径 + 原著目录 + 阅读日志的完整路径
   - 下面的"Sub-Agent 审查协议"全文(步骤 2-6)
   - 输出格式规范(`bible-review-report.md` 模板)
   - 要求 sub-agent 把 report 写到 `{book-slug}/02-character-architect/bible-review-report.md`
   - 明确要求 sub-agent **对每个 FAIL / CONDITIONAL 条目标注**:
     - 所在文件名 + 段落/字段编号
     - 错误内容的原样引用
     - 基于原著 Grep 结果的建议修正(供 character-architect 用 Edit 直接改)

3. sub-agent 返回后,主 agent 只做:读 report → 把最终判决(PASS/CONDITIONAL/FAIL)汇报给用户 → 转交给 character-architect 进入闭环

**主 agent 不做的事**:不亲自 Grep 原著、不亲自打分、不对 sub-agent 的结论做"复审"或"平衡"。让它独立判。

---

# Sub-Agent 审查协议(主 agent 喂给 Task 的 prompt 主体)

Sub-agent 按以下 5 步做审查,产出一份 `bible-review-report.md`。

### Step 1 — Evidence Trail 全扫(反幻觉核心机制)

**不抽样。全扫。** 过去用抽样版本(每轮只查 K=15% 左右),每轮都能发现 10-15 条新错误——因为随机抽样永远抽不完,老错误一直漏网。改成全扫后:一轮查出全部错误 → character-architect 一次修完 → 第二轮快速复核 → 收敛。总成本反而更低。

#### 1.1 枚举所有 Evidence 条目

在每个 bible 文件里 Grep `^> Evidence:` 开头的行,以及 B 层表格里每一个带章节引用的单元格。每条 Evidence 行 / 表格单元解析成若干 claim:
- 章节引用(如 `Ch25`, `Ch34 Part One`, `Ch35 Bonus`)
- 引语(如 `"I love you"`、`"Thanks. You didn't tell anyone, right?"`)
- 具体事件描述("Mauricio 在 MC 怀里哭"、"Enrique 看到 MC 戴手链")

给每个 claim 编号,形成 claim 池。典型 bible 包有 150–250 条 claim,必须全部扫完。

#### 1.2 全量 Grep 验证

对**每一条** claim:

**引语类 claim**:
- 用 `Grep` 在 `novels/{book-slug}/` 目录里搜这条引语(去掉标点用关键词段搜,避免标点不一致误判)
- 搜到 → 进一步验证命中的文件和 bible 声称的 Ch 一致(reading-log.md 可查章节-文件映射)
- 搜到但章节不对 → **该条标 ⚠ 章节错位**(不是幻觉,是引用错误,需要修)
- 完全搜不到 → **该条标 ❌ 幻觉**(除非 bible 里标了 `[fictional expansion]` 或 `⚠ 待验证`)

**章节 + 事件描述类 claim**(如 `Ch27(Mauricio 在 MC 怀里哭)`):
- 打开 reading-log.md 找到 Ch27 对应的文件
- Read 该文件相关段落,验证事件是否真如 bible 描述
  - 事件对 → ✅
  - 事件方向反了(例:bible 说"他抱着她"但原文是"她抱着他")→ ⚠ 方向错(需改)
  - 事件完全不存在 → ❌ 幻觉
- 事件在别的章节 → ⚠ 章节错位

**章节号格式类 claim**(如 `Ch20 Part Two`):
- 用 Glob 确认"Bad Idea Twenty Part Two"类文件是否真的存在
- 不存在 → ⚠ 格式错(原著该章没分 Part)

#### 1.3 汇总

- `总 claim 数 N` / `✅ 数` / `⚠ 数(分章节错位/方向错/格式错)` / `❌ 幻觉数` / `[fictional expansion] 合法数`
- 全扫命中率 = ✅ / (N − [fictional expansion] 合法数)

#### 1.4 判定

- ❌ 幻觉数 = 0 且全扫命中率 ≥ 95% → Step 1 **PASS**
- ❌ 幻觉数 = 0 但有 ⚠ 修正项 → Step 1 **CONDITIONAL**(全扫命中率实际做分子时不计 ⚠)
- ❌ 幻觉数 > 0 → Step 1 **FAIL**

**把所有 ⚠ 和 ❌ 的 claim 全部列出来,按 P0(幻觉)/ P1(章节错位)/ P2(方向错 / 格式错 / 引语略有出入)分级**,供下游 character-architect 一次性 Edit 修完。

---

### Step 2 — LI 数量决策日志审查

打开 `li-selection-decision.md`,检查:

**检查 A**:是否对每个候选都列了"在哪一步通过或失败"?
- 没列完整 → FAIL
- 列了但有含糊("我觉得不合适"没说明理由)→ CONDITIONAL

**检查 B**:通过的 LI 数量是否在 `[2, 4]` 区间?
- 不在区间 → FAIL(不满足 SKILL 的 cap 规则)

**检查 C**:romance trope gap 是否明确标注了"为什么不补"?
- 没标 → CONDITIONAL
- 标了但理由薄弱("忘了考虑")→ FAIL
- 标了且理由实在("原著是纯双男主,强加会破坏完整性")→ PASS

**检查 D**:新增 LI(如果有)是否明确标注了"原著不存在,新增理由为..."?
- 有新增但没标 → FAIL

### Step 3 — B 层四字段深度检查

对每个 LI bible 跑以下 4 个子检查:

#### 4.1 B1 好感度规则专属性

- 取当前 LI 的 B1 规则列表(例 8 条)
- 对每条规则,问:**如果把相同的行为 trigger 换到另一个 LI 身上,权重会一样吗?**
- 如果有 ≥ 3 条规则在 2 个不同 LI 身上效果相同 → **该 LI FAIL**,说明他没有专属特征
- 全部专属 → PASS

#### 4.2 B2 回调事件完整性

对每个 `@signal <FLAG>` 条目:
- [ ] 有明确的触发条件?
- [ ] 列了至少 1 个后续回调位置?
- [ ] 列了"不触发则如何退化"?

任一缺失 → 该 LI CONDITIONAL。

#### 4.3 B3 调性可区分性

- 取该 LI 的 2-3 种调性
- 每种调性至少 3 个 butterfly 样例?(数量检查)
- **盲分测试**:把所有调性的 butterfly 样例随机打乱,自己是否能 100% 归回原调性?
  - 能 → PASS
  - 不能(有交叉混淆)→ 该 LI FAIL on 调性分化

---

### Step 4 — 跨 LI 同场景分化测试

**核心目的**:如果剧本里写了一个对所有 LI 共用的场景(如"派对"、"期末考"、"毕业典礼"),每个 LI 对 MC 的反应应该明显不同。如果两个 LI 在 50% 以上共用场景里反应相似,说明人设没区分开。

#### 5.1 识别共用场景

从配角筛选表和 supporting-cast 文件中识别"所有 LI 都会出现"的场景(一般 3-5 个:如"开学日"、"派对"、"毕业"、"冬假")。

#### 5.2 模拟反应

对每个共用场景,用 bible 中的 A1/A2/A6 字段推演每个 LI 在该场景对 MC 做同样动作时的反应。例如:"MC 在派对上和另一个男生跳舞",每个 LI 怎么反应?

#### 5.3 分化评分

- 任意两个 LI 的反应是否有质的不同(不是表层不同,是 emotional logic 不同)?
- 两个 LI 在 ≥ 50% 共用场景里反应相似 → **FAIL**
- 任一对 LI 分化度不够 → CONDITIONAL

---

### Step 5 — MC Voice 一致性检查

**核心目的**:MC 在不同 LI 路线里声音(幽默感、价值观、核心恐惧)应该保持一致。只有她对不同 LI 的反应/需求不同,不是她这个人在变。

- 读每个 LI bible 的 A5(与 MC 的化学反应)
- MC 的核心人格描述在不同 LI bible 里是否一致?
- 出现"MC 在 LI-1 面前是 A 型人格,在 LI-2 面前是 B 型人格"的矛盾 → **FAIL**

---

## 输出格式:`bible-review-report.md`

```markdown
# Bible Review Report — {book-slug}

## 产物路径
- 审查目标:`lunascripts/{book-slug}/02-character-architect/`
- 文件清单: (Glob 结果)

## Step 1 Evidence Trail 抽查
- 全部 Evidence claim 数:N
- 抽查数量 K:__
- 命中数:__ (__ %)
- 判定:[PASS/FAIL]

### 抽查明细
| # | LI | Claim | 原文 Grep 结果 | 判定 |
|---|----|-------|---------------|------|
| 1 | Mauricio | Ch25(蝴蝶手链)"I love how you're still wearing this" | 在 file xxx Ch25 内命中 | PASS |
| 2 | ... |
| ... |

## Step 2 LI 数量决策日志审查
- 检查 A 候选逐项:[PASS/CONDITIONAL/FAIL]
- 检查 B LI 数量区间:[PASS/FAIL]
- 检查 C 画像 gap:[PASS/CONDITIONAL/FAIL]
- 检查 D 新增 LI 标注:[PASS/N-A/FAIL]

## Step 3 B 层深度检查(按 LI 列)

### LI-1: Mauricio
- B1 好感度专属性:[PASS/FAIL] (如 FAIL:列出不专属的规则)
- B2 回调事件完整性:[PASS/CONDITIONAL/FAIL]
- B3 调性可区分性:[PASS/FAIL] (如 FAIL:列出混淆的 butterfly 对)

### LI-2: ...

## Step 4 跨 LI 同场景分化
- 共用场景列表:__
- 分化评估矩阵:(LI vs LI 配对列分化度)
- 判定:[PASS/CONDITIONAL/FAIL]

## Step 5 MC Voice 一致性
- 判定:[PASS/FAIL]

---

## 总结论

[PASS / CONDITIONAL / FAIL]

### 如 PASS
可以交付给 entity-normalizer / episode-writer。

### 如 CONDITIONAL / FAIL
列出必须修改的条目。**每条必须包含下列 4 字段**(供 character-architect 直接 Edit):
- `file`:哪个 bible 文件
- `field`:哪个 A/B 字段或段落
- `problem`:原错误内容(直接引用)
- `suggest_edit`:基于原著 Grep 结果的建议修正

示例:
```
- file: li-bible-01-mauricio.md
  field: B2 HELPED_MAURICIO_DAD 回调
  problem: "Ch6 他提起道谢 'Thanks. You didn't tell anyone, right?'"
  suggest_edit: "Ch6 Mauricio 实际说 'Just drop it. I don't want to hear about this again' —— 相反的反应。信任建立推迟到 Ch23 Mauricio 主动开放家庭"
```
```

---

## 判决规则汇总

| Step | FAIL 处理 |
|------|-----------|
| Step 1 Evidence 全扫:❌ 幻觉数 > 0 | 整体 FAIL(严重幻觉) |
| Step 1 Evidence 全扫:有 ⚠ 修正项但无 ❌ | CONDITIONAL,整体判决降为 CONDITIONAL |
| Step 2 决策日志 | FAIL 项就整体 FAIL,CONDITIONAL 项可通过但必须补 |
| Step 3 B 层 | 任一 LI 任一子项 FAIL → 整体 FAIL |
| Step 4 跨 LI 分化 | FAIL → 整体 FAIL |
| Step 5 MC 一致性 | FAIL → 整体 FAIL |

**任一步 FAIL → 整体 FAIL**。CONDITIONAL 项可以通过,但必须在报告里明确标注需补救的点。

---

## 禁止事项

- **不要凭感觉给 PASS**:每一步都必须留下可验证的证据
- **不要抽样**:Step 1 是全扫,不是抽样。抽样会让老错误一直漏网,迫使循环轮数增加
- **不要跳 Step 1(Evidence 全扫)**:这是对抗 LLM 幻觉的第一道门
- **不要把"审查者自己觉得不合理"当作 FAIL 依据**:你是在查 bible 是否满足明确规则,不是在做文学评论
- **不要修改 bible 本身**:bible-reviewer 只输出报告,修改回给 character-architect
