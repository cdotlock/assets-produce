---
name: planner-reviewer
description: 对 entity-planner 产出的剧集规划包做独立审查。核心机制:并发 spawn N 个 sub-agent(N = LI 数量),每个 sub-agent 只看公共段 + 自己那条 LI 路线,在自己脑子里组装成"玩家从头到尾只走这条路线"的完整剧,以玩家新鲜眼光审查单条路线的质量。主 agent 收齐 N 份 route review 后,再做跨路线一致性检查(收尾骨架、@signal 含义、集数平衡)。输出 planner-review-report.md 并给出 PASS / CONDITIONAL / FAIL 判决。前置条件:entity-planner 已完成。当用户需要验证 plan 质量、判断是否能进入 episode-writer 时触发。
allowed-tools: Read, Grep, Glob, Write, Task
---

# Planner Reviewer — 剧集规划独立审查

## 核心原则:每条路线独立审,再做一次跨路线审

这个 skill 和 bible-reviewer 一样强制走独立 sub-agent,不自审。但和 bible-reviewer 不一样的是:这里要派**多个** sub-agent,一个 LI 一个,每个只看自己那条路线 + 共享的公共段。

**为什么这么做**:玩家实际体验一部互动剧时只会走一条路线。路线好不好,要以"只看了这条路线"的玩家视角判。如果 sub-agent 能看到所有路线,它会不自觉地用全局眼光平衡评价,失去新鲜玩家视角。

**主 agent 的职责**:
1. 派 sub-agent
2. 收 sub-agent 的 route review
3. 自己做一件 sub-agent 做不了的事:跨路线一致性检查(因为 sub-agent 之间互相看不到)
4. 汇总判决

---

## 输入

1. **plan 包路径**:`moonscripts/{book-slug}/03-entity-planner/`
   - 必须包含:`00-structure-decision.md`、`01-common.md`、至少 2 份 `02+-route-*.md`、`README.md`
2. **Bible 包**(交叉参考用):`moonscripts/{book-slug}/02-character-architect/`
3. **原著目录**(偶尔需要):`novels/{book-slug}/`

## 执行流程(主 agent 做什么)

### Step 1 — 输入完整性检查

用 `Glob` 粗略确认:
- [ ] `00-structure-decision.md` 存在
- [ ] `01-common.md` 存在
- [ ] `02-route-*.md` 或 `03-route-*.md` 等 ≥ 2 份
- [ ] bible 包完整(`li-bible-*.md`、`mc-bible-*.md`)

任一缺失 → 直接生成 FAIL 报告给用户,不必 spawn sub-agent。

### Step 2 — 并发 spawn N 个 route-reviewer sub-agent

一个 LI 一个 sub-agent。**必须真正并发**,在一个消息里同时发 N 个 Task 工具调用。

每个 sub-agent 拿到:
- **只能读这几个文件**:
  - `00-structure-decision.md`(了解整体规划的骨架)
  - `01-common.md`(公共段 + 软路由段,自己这条路线之前玩家看到的戏)
  - **仅自己那条 LI 的** `route-{li}.md`
  - 对应 LI bible(交叉对照人设)
  - MC bible(交叉对照 MC 一致性)
- **不能看**:其他 LI 的 route 文件、bible-review-report、或任何其他 LI 的 bible

**被派去的 sub-agent 的任务文案**(见 Step 3 的 "Sub-Agent 审查协议")。

### Step 3 — Sub-Agent 审查协议(主 agent 派 sub-agent 时喂给 Task 的 prompt 主体)

以下是给 sub-agent 的完整指令,模板化:

```
你是 {li_name} 路线的独立 reviewer。不知道其他 LI 路线写了什么,不要去看不该看的文件。

你的任务:在脑子里组装出一个"玩家从 E1 走到 E{last} 只走 {li_name} 这条路线"的完整剧,以**新鲜玩家视角**审查这条单路线的质量。

---

## 读材料(只读这些)
- {structure-decision 路径}
- {common 路径}
- 你这条路线的 route 文件:{route-file 路径}
- 这条 LI 的 bible:{li-bible 路径}
- MC 的 bible:{mc-bible 路径}

## 组装脑中单路线

把这些片段按集顺序拼起来想:
1. 公共段(E1-EX,所有路线共用,但从你这条路线视角看哪些 beat 和 {li_name} 有关)
2. 软路由段(EX+1-EY,玩家开始偏向 {li_name} 的累积过程)
3. 你这条路线的独占段(EY+1-EZ-2)
4. 收尾段({li_name} flavor 的最后几集)

拼完,你脑子里就有一部从 E1 到 E{last} 的完整剧。

## 审查维度

### 维度 1:剧情连贯性
- 公共段埋的 seed 在这条路线里是否都有接住?
- 人物状态在每两集之间有没有突变(上集还在冷战,下集直接接吻,但中间没有转换逻辑)?
- **恋爱四阶段完整吗?** 路线文件开头有四阶段映射表——从"相遇"到"克服在一起"四步是否都有?有没有跳过"出事退回"直接到 happy ending?(跳了就不真实)

### 维度 2:感情节奏
- 这条路线 LI 的秘密按什么节奏揭示的?节奏合理吗?
- 有没有"一集内太多重磅"或"连续 3 集没什么进展"的问题?
- **冲突是不是一次比一次严峻?** 如果这集的危机和上次差不多严重,玩家会觉得"又来了"。每次出事,严重程度必须升级
- 路线最让人激动的场景(tentpole)是否间隔合理,不挤一起也不隔太远?

### 维度 3:romance trope 满足度
- 这个 LI 是什么 trope(Enemies to Lovers / Second Chances / Friends to Lovers / ...)?
- 喜欢这种 trope 的玩家最想看什么瞬间?这条路线有没有给到?
  - Enemies to Lovers 玩家想看"只有我能打开他的墙"
  - Second Chances 玩家想看"他在所有人里选了我,即使代价巨大"
  - Friends to Lovers 玩家想看"他为我卸下了十年的伪装"
- 这些瞬间集中在哪几集?够不够让玩家愿意为此付费?

### 维度 4:@signal 完整使用
- bible B2 列的 @signal 事件,这条路线里是否每个都被分配了触发集 + 回调集?
- 触发和回调之间的集数间隔合理吗(太近没悬念,太远玩家忘了)?
- 有没有 @signal 触发了但一直没回调的?
- 有没有定义了但不被任何 gate 或 @if 读取的"孤儿 flag"?

### 维度 5:butterfly 调性区分度
- 这条路线挑了哪几种调性?
- 每种调性的 butterfly 写法够不够让 LLM 一眼分出来?
- 到了二次 gate 前,累积的 butterfly 够不够让系统可靠判断走哪种调性?

### 维度 6:集尾钩子
- 每集结尾是否做了两件事:让玩家多了解一层角色 + 留一个新问题?
- 有没有集尾直接"问题解决了、没事了"的?(这是大忌)
- 切章节的位置是否在"事情已经发生但后果没完全展开"的地方?(不要切得太早,也不要突然插入无关事件)

### 维度 7:check 系统合规

硬性规则,违反一条扣 1 分起:

- **属性只能是 BOLD / SWEET / SMART** — 出现 CHA / WIS / NERVE / 其他属性名 = 违规
- **难度必须是字符串 EASY / NORMAL / HARD / CRUCIAL** — 出现数字(如 `dc: 12`、`dc: 15`、`HELL`)= 违规
- **每路线 CRUCIAL check exactly 2 次**(不是 ≤ 2,是 exactly 2)— 少了会让 LI 路线缺少付费锚点;多了或少了都导致 LI 间难度不对等
- **CRUCIAL 失败不能直接走 route collapse** — 必须有 heartbreak 可走的分支
- **CRUCIAL 失败之后的下一个 beat 必须零 check**(让玩家喘气)
- **E1-E2 零 check** — 教程期不能有 check
- **check 总数每路线 14-21** — 太少(< 14)uncertainty cadence 打瞌睡,太多(> 21)玩家感觉被收割
- **14 条反 check 模式**(见 entity-planner SKILL "14 条反 check 模式"章节)— 任何违反都扣分

打分参考:
- 全部合规 + CRUCIAL 放置精准(落在 emotional peak) + 分布合理(EASY/NORMAL 各占规定区间)= 10
- 合规但 CRUCIAL 有一两处放置略早或略晚 = 8-9
- 出现数字 dc / HELL 残留 / CRUCIAL 配额不是 exactly 2 = ≤ 6,必须修
- 出现 14 条反模式之一 = 单项扣 1-2 分

### 发现新反模式时的元规则

Review 过程中如果你觉得某个 check 的设计不合理,但它**不违反已有的 14 条反模式规则**之一:

1. **先问自己**:这背后有没有可以抽象出来的**通用反模式**?
2. **如果能抽象**(适用于任何 romance VN 项目,不只这一次),就建议把它加到反模式清单。格式:"XX 类场景不该 check,因为 YY"
3. **如果抽象不出来**(只是这一处具体问题),不要建议加规则。单点问题在 suggest_edit 里提具体建议就好

**目标是让反模式清单"活"而不是"炸":每条都是可复用的抽象原则,不是 specific case 的累加。**

## 判决 — 0 到 10 打分(不是 PASS/FAIL)

每个维度给 **0-10 的整数分**(不是二元判决)。评分基准:

| 分数 | 含义 |
|------|------|
| 10 | 无可挑剔,即使最挑剔的玩家也找不到问题 |
| 9 | 非常好,有一两个小瑕疵但不影响整体 |
| 8 | 不错,但能看出改进空间。可以上线但会有中等玩家差评 |
| 7 | 勉强可用,有影响质量的问题。上线会掉评分 |
| 6 | 明显有问题,必须修才能上线 |
| ≤ 5 | 严重问题,这块要推倒重来 |

**纪律:你不是质检走过场,你是为百万用户把关**

- 如果你觉得"差不多了给 9 分吧"但说不出具体哪里好,那应该是 7-8 分
- 如果你整个 review 里没找出任何问题,那不是"这 plan 完美",那是"你没认真看"—— 回头再看一遍
- 你为 tokens 成本省下的每一次"差不多 PASS",会在下游 episode-writer 里放大成更多重写成本。**诚实打分比粉饰 PASS 更省资源**
- **9 分的门槛**:玩家真的会愿意在这一集投币,这一集放到 Reddit 上粉丝不会吐槽 pacing 或 plot 漏洞
- 给 9 以上只有一个理由:你能具体说出"这条路线在 X 集通过 Y 方式做到了 Z 效果,这是 bible 原 LI 画像的精准兑现"

**维度总分 < 9 的任何一项必须附修改建议**,每个建议写:
- **file**:问题在哪个文件(通常是 `02-route-{li_name}.md` 或 `01-common.md`)
- **section**:文件里哪一段(第几集、哪个字段)
- **current**:原内容引用
- **problem**:具体问题描述
- **suggest_edit**:具体怎么改(要可 Edit,不要空喊"写得更好")

## 输出

把 review 写成 `moonscripts/{book-slug}/03-entity-planner/route-review-{li_name}.md`。

文件结构:

```markdown
# Route Review — {li_name}

## 路线总分: X/10
(6 个维度的算术平均,四舍五入到小数点后 1 位)

## 6 维度打分
| 维度 | 分数 | 简述(1 行) |
|------|------|----------|
| 1. 剧情连贯性 | X/10 | ... |
| 2. 感情节奏 | X/10 | ... |
| 3. romance trope满足度 | X/10 | ... |
| 4. @signal 完整使用 | X/10 | ... |
| 5. butterfly 调性足够性 | X/10 | ... |
| 6. 集尾钩子 | X/10 | ... |

## 修改建议(< 9 分的维度必有)
每条格式:
- **file** / **section** / **current** / **problem** / **suggest_edit**

## 亮点(≥ 9 分的维度写这里,要具体)
具体说"X 集通过 Y 方式做到了 Z 效果",不要空赞美。
```
```

### Step 4 — 主 agent 做跨路线一致性检查

N 个 sub-agent 回来后,主 agent 自己读**全部** plan 文件 + 全部 route-review-*.md,做这些 sub-agent 做不了的事:

#### 4.1 收尾段骨架一致性

- 每条路线的收尾段(02-route-*.md 里最后几集)**结构骨架** 应该一样,只是 flavor 不同
- 比如:倒数第 2 集都是"情感决战",最后一集都是"毕业/离别",只是每条路线谁在说什么不同
- 如果一条路线收尾是"情感决战 → 离别",另一条是"误会 → 解开 → 蜜月",**骨架不对齐**,episode-writer 没法写收尾骨架的共用素材

#### 4.2 @signal 语义一致性

- 同一个 @signal FLAG 在不同路线里含义必须相同
- 举例:`HELPED_MAURICIO_DAD` 在 Mauricio 路线里是"MC 对家庭表过态",在 Mark 路线里**也得是同一个意思**,不能变成别的
- 检查方法:列出所有 @signal 在每条路线里的触发场景和回调效果,对比有没有跨路线冲突

#### 4.3 集数总和匹配

- 公共段 + 软路由段 + (每条独占段 × N) + 收尾段 = 用户设定的总集数?
- 每条独占段的集数均衡吗?(某条 7 集另一条 3 集 = 严重失衡)

#### 4.4 跨路线的"他 LI cameo"一致性

- 走 Mauricio 路线时,Easton 和 Mark 在前几集是配角,他们是什么样的?
- 走 Easton 路线时,Mauricio 和 Mark 是什么样的?
- 两条路线里对同一个 cameo 角色的描述应该**一致的核心人格**,只是戏份多少不同
- 不能出现"Mauricio 路线里的 Mark 是温柔大哥哥,Easton 路线里的 Mark 变成 party 渣男"

#### 4.5 MC 一致性

- MC 在每条路线里的决策逻辑符合她 bible 的核心人格吗?
- 她对 Mauricio 说"I'm Malia fucking Hernandez",对 Easton 也会说类似的吗?
- 她在一条路线里有"为 LI 牺牲自主"的转向,另一条路线里核心又是"我是独立的女性"——这种矛盾要 flag

### Step 5 — 汇总判决

写 `planner-review-report.md`,结构:

```markdown
# Planner Review Report — {book-slug}

## 总判决
PASS / CONDITIONAL / FAIL

## N 条路线的独立审查汇总
| 路线 | 总判决 | 主要问题数 |
|------|--------|-----------|
| mauricio | ... | ... |
| easton | ... | ... |
| mark | ... | ... |

各路线详细 review 见 `route-review-*.md`,以下只汇总问题清单。

## 跨路线一致性 5 项(主 agent 自检,同 0-10 打分)
| 项 | 分数 | 简述 |
|---|------|------|
| 4.1 收尾骨架对齐 | X/10 | ... |
| 4.2 @signal 语义一致 | X/10 | ... |
| 4.3 集数总和 + 均衡 | X/10 | ... |
| 4.4 跨路线 cameo 一致 | X/10 | ... |
| 4.5 MC 一致 | X/10 | ... |

## 整体 Plan 总分: X/10
= (3 条路线平均分 × 0.6) + (跨路线 5 项平均分 × 0.4)

## 最终判决
- ≥ 9.0 → **PASS**,可交付 entity-normalizer / episode-writer
- 7.0-8.9 → **CONDITIONAL**,必须按本报告修改建议 Edit 后重审
- < 7.0 → **FAIL**,局部 plan 要推倒重写

## 修改建议汇总(按紧迫度排序)
每条格式:**file** / **section** / **current** / **problem** / **suggest_edit**

路线层建议(来自 route-review-*.md,这里汇总):
...

跨路线层建议(主 agent 发现):
...

## 亮点(plan 哪里做得好,后续 iteration 不要动)
具体说"X 路线的 Y 设计抓住了 Z"。
```

---

## 主 agent 的行为边界

**不做**:
- 不亲自 review 每条路线(那是 sub-agent 的活,独立性必须保持)
- 不覆盖 sub-agent 的判决(哪怕觉得它太严或太松)
- 不修改 plan 本身(只出报告,修是 entity-planner 的活)
- 不合并 sub-agent 产出的 route-review-*.md 到一个大文件(留着让 entity-planner 看具体细节)

**做**:
- 完整性检查(Step 1)
- 派 sub-agent(Step 2,并发)
- 等 sub-agent 全部回来
- 跨路线一致性检查(Step 4,sub-agent 没法做的那部分)
- 汇总总判决(Step 5)

---

## 输出文件

```
moonscripts/{book-slug}/03-entity-planner/
├── route-review-{li1}.md       sub-agent 1 独立审
├── route-review-{li2}.md       sub-agent 2 独立审
├── route-review-{li3}.md       sub-agent 3 独立审
└── planner-review-report.md    主 agent 汇总(含跨路线检查)
```

---

## 禁止事项

- **不要让任一 sub-agent 看到其他路线的 route 文件**:认知隔离是这个 skill 的核心设计
- **不要在 sub-agent 出报告前启动跨路线检查**:Step 4 严格等 Step 2 所有 sub-agent 都回来之后
- **不要跳过并发要求**:Step 2 必须一个消息里同时发 N 个 Task 调用,串行 spawn 是错误的
- **不要把"这条路线做得好"当 PASS 依据**:单条路线很好但跨路线有冲突,整体仍是 FAIL
- **不要用 bible-reviewer 的标准审 plan**:bible 审的是人设合理性,plan 审的是剧集节奏和路线结构,两套标准不一样
