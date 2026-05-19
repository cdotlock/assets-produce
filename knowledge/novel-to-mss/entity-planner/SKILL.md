---
name: entity-planner
description: 基于 character-architect 产出并通过 bible-reviewer 的 Character Bible,给整部互动游戏剧本做集数规划。决定总集数、公共段和每条 LI 独占段怎么分配、玩家在第几集锁定路线、每集要发生什么、要触发哪些 @signal / @affection 变化、butterfly 积累成什么 flavor。主 agent 做全局决策 + 写公共段和软路由段,然后并发 spawn N 个 sub-agent 各自写一条 LI 独占段。前置条件:bible-reviewer 已对 bible 出 PASS。当用户说"开始做剧集规划"或需要进入 episode-writer 之前的最后一步时触发。
allowed-tools: Read, Write, Edit, Grep, Glob, Task
---

# Entity Planner — 整部剧本的集数规划

这一步的工作不是写剧本台词,是写**每一集在整部剧里的位置、任务、要触发什么状态变化**。episode-writer 拿到这份 plan,就知道每集要写什么,不会一集把三条路线的高潮都挥霍光。

## 前置条件

- character-architect 输出完整,所有 bible 在 `moonscripts/{book-slug}/02-character-architect/` 下
- bible-reviewer 对 bible 出 **PASS** 判决(不接受 CONDITIONAL 或 FAIL)
- 用户已告知目标**总集数**(15-30 之间为常见)
- 已通读 [`../episode-writer/mss-spec.md`](../episode-writer/mss-spec.md) 了解 @signal / @affection / @butterfly / @gate 怎么工作

## 核心设计思路

互动游戏不是直播电视剧。玩家在第 5 集做的一个选择,可能要到第 18 集才看到回报;玩家和 A 路线走得近还是和 B 路线走得近,是从第 6 集开始慢慢累积出来的。这些跨集的伏笔、回报、累积过程,没人规划 episode-writer 写到第 8 集就会懵。

所以这一步做的事:
1. **把总集数分成 4 段**:大家都看的开头 → 玩家开始偏心的中段 → 玩家锁定一个 LI 后的独占段 → 收尾
2. **决定玩家在哪一集锁死路线**
3. **把 bible 里列的 @signal 事件分配到具体的集**(谁在第几集埋,第几集回调)
4. **给每条 LI 路线挑调性**(bible B3 给了调性池,planner 挑 1-3 种做)
5. **给每条 LI 路线标出恋爱四阶段落在哪几集**(见下)
6. **先想好每条路线最让人激动的 3-5 个场景,再填过渡**(见下)
7. **每集写一个骨架级的 outline**(这集要发生什么、有哪些关键选择、状态变化预期)

### 恋爱四阶段(每条 LI 路线必须走完)

不管产品怎么切集、怎么分段,走某条 LI 路线的玩家在情感上都要经历完整的四步:

1. **相遇** — 两人第一次真正互动,产生化学反应(可以是讨厌也可以是心动)
2. **慢慢爱上** — 通过共处、了解对方的秘密和伤痛,感情加深
3. **出事了,退回原点** — 某件事让关系崩裂,两人退回起点甚至更远
4. **克服障碍,在一起** — 两人各自改变,突破障碍,选择对方

每条路线写 plan 时,必须在文件开头标注"四阶段分别落在哪几集"。这是给 episode-writer 的情感指南——让他知道"E15 应该是关系最甜的时刻"还是"E15 应该是关系崩裂的时刻"。

**注意**:四阶段和产品的四段切分(公共/软路由/独占/收尾)是两个不同的东西。产品四段管集数分配,恋爱四阶段管感情怎么走。

### 先想好最让人激动的场景,再填过渡

写 plan 的方法:**不要从 E9 开始一集一集线性想**。先列出这条路线里"玩家一定会截图发社交媒体的 3-5 个场景",把它们排好顺序,确保间隔合理(不要挤一起也不要隔太远),然后再用过渡戏把它们连起来。

### 冲突一次比一次严峻

每次关系出问题,严重程度不能和上次一样。玩家需要感觉"这次真的不一样了"。如果这集的危机和上一次差不多严重,要么调集顺序,要么加码。

### 做爱场景的规则

做爱之前两个角色必须都清醒且自愿。这是唯一的硬性规则。亲吻、壁咚、拉手这些是 romance 的正常戏剧表现,不需要每次都"先问再碰"。

### 结局规则

每条 LI 路线至少有一条路径是两人确定在一起的(happy ending)。但不是所有变体都必须在一起——有些调性组合天然走向分开或 bittersweet,这是玩家选择的结果,是互动游戏的价值。

## 工作架构:主 agent + 并发 sub-agent

```
主 agent 做:
  ├─ Step 1 全局决策:总集数怎么分、分叉放第几集、调性怎么挑
  ├─ Step 2 写公共段 + 软路由段(所有玩家都看的部分)
  └─ Step 3 spawn N 个 sub-agent 并发写每条 LI 的独占段
               (N = LI 数量,通常 3)
  └─ Step 4 汇总 sub-agent 输出,写成完整 plan 包
```

## Step 1 — 全局决策(主 agent 自己做)

读完所有 bible + 用户给的总集数,先做这些决策并写成一份 `00-structure-decision.md`。

### 属性系统(全项目硬规则)

**玩家有且只有 3 个属性**:

- **BOLD** — 敢做(当众告白、怼人、主动亲他、替他挡父亲、闯进他的私人领域)
- **SWEET** — 会哄(温柔陪伴、给对方空间不追问、记住他说过的小事、不解决只陪在那里)
- **SMART** — 看得出(发现谎言、读懂暗示、拼出真相、察觉异常)

**不要自己发明新属性。** 如果某个 @choice 不属于这三个任何一个,说明它不该是 check。

### check 难度档位(字符串,非数字)

写 `check { attr: BOLD, dc: HARD }`,不写 `dc: 14`。数字由下游 numeric system 运行时根据剧集进度、累积值、玩家历史动态决定,**plan 层和写作层永远不碰数字**。

4 档及各自使用场景:

| 档位 | 何时用 | Stakes | 失败代价 |
|------|--------|--------|---------|
| **EASY** | 教学系统 / 情感高潮后的 coast 缓冲 / MC 明显 signature 动作 | 低 | 小窘迫,关系基本不变 |
| **NORMAL** | 日常关系互动的默认档;想要真实不确定感但不需要付费压力时 | 中 | 一次小挫折,影响可控 |
| **HARD** | 路线中段 tension / MC 走出舒适区 / 关系据结果会明显变化 | 高 | 明显剧情代价,关系倒退半步 |
| **CRUCIAL** | tentpole 级时刻,付费锚点 | 极高 | 重大情感代价,走 heartbreak 分支但不是 route collapse |

### 每路线理想分布(14 集 LI 独占段)

| 档位 | 数量 | 占比 |
|------|------|------|
| EASY | 2-4 | ~10-15% |
| NORMAL | 7-10 | ~50% |
| HARD | 3-5 | ~25% |
| CRUCIAL | **exactly 2** | ~10% |
| **总 check** | 14-21 | — |
| **纯 @choice(无 check)** | 占所有 @choice 的 60-80% | — |

**新增 check 要"藏在剧情里"**:如果要提高 check 数量,扩的应该是 EASY / NORMAL(顺着对话自然出现的小考验),不是 HARD / CRUCIAL。玩家不应该感知到 check 频率暴增,只应该感知到"游戏有更多决定点"。

### CRUCIAL 配额(硬约束,锁死)

- **每条 LI 路线 exactly 2 次 CRUCIAL**(不是 1-2 浮动)。各 LI 必须完全对等,否则玩家会觉得某个 LI 是"premium 收割"
- CRUCIAL 必须满足 5 个条件全部成立:
  1. 在 tentpole 场景(00-structure-decision 列出的那些)
  2. 玩家已累积路线 60% 的重要 beats(按剧情进度,不是按集数硬卡)
  3. 失败走 heartbreak 分支,不是 route collapse
  4. MC 主动尝试,不是被动接受
  5. 剧情让 stakes 可感,玩家真的在乎输赢
- CRUCIAL 失败之后的下一个 beat 必须是**零 check 的冷却**(玩家刚经历情感峰值,需要消化)

### 关系早期 check 禁区

- **E1-E2 不设任何 check**(纯 @choice + butterfly,让玩家熟悉机制和建立情感投入)
- **E3 开始才能有 check**,且 E3 第一个 check 应该是 EASY 或 NORMAL(不能一上来就压力)
- E4+ 正常分布

### 14 条反 check 模式(绝对不该设 check 的场景)

**A. 什么场景不该 check(7 条)**

1. **调性二次 gate 入口**(如 E14 的 unmasking vs brother-to-man)— 应由前面累积 butterfly 决定,不是单骰一次
2. **MC 对关系安排的身份接纳**(如"我接受他不变"、refuse caretaker)— 不是技能测试,是角色陈述
3. **纯情感姿态二选一**(两种都 valid,没有 better/worse)— check 会暗示"标准答案"
4. **角色主动来找 MC 的被动戏**(他爬窗、他道歉、他告白)— MC 是反应方,不是行动方
5. **最终结局 flavor 触发**(E22 变体)— 由累积 signal 和 butterfly 逻辑决定
6. **强制付费节点**(失败 = bad ending,唯一出路是掏 50g)— 不道德,玩家会给差评
7. **MC 自我认知选择**("我还爱他吗"/"我是这种女孩吗")— 角色授权陈述,不是技能

**B. check 周围的时序和语境(4 条)**

8. **CRUCIAL 失败后的 recovery 场景**(紧跟着的那 1-2 个 beat 必须零 check,让玩家喘气)
9. **"立即重试"伪装 paywall**(失败后紧跟着"再试一次"= 强迫付费)
10. **tutorial check 附带付费提示**(E1-E2 根本没 check,E3 首 check 即使失败也不要立刻弹付费)
11. **LI 路线难度不对等**(某 LI 多 CRUCIAL 会被玩家认为是"收割款")

**C. CRUCIAL 特殊规则(3 条新增)**

12. **CRUCIAL 失败必须是真 heartbreak,不能是 success 的 80% 同构版本**。"affection 差 2 分 / 延后一集 / 他也懂了但没 land"这类软 fail 就是把 CRUCIAL 降格为 HARD。真 heartbreak = 剧情实质走偏(走 bittersweet / 角色说出刺痛的话 / 本来该有的 ritual 没建立起来)、玩家感知到"我错过了什么"、且无法通过下一集轻松补回
13. **CRUCIAL 不能消耗在路线前 30% beats 累积之前**(配合 60% 规则:60% 是理想,30% 是绝对下限)。路线第 1 个 tentpole = 25%,就算那个 tentpole 再强也不能设 CRUCIAL — 玩家在 25% 累积时情感投入不足以 justify 50g 付费
14. **落选 LI 在当前路线里的 final exit 戏只应一次**(不是 check 规则,是 cross-LI cameo 规则)。给落选 LI 一次收尾告别就够,重复 2 次及以上会让当前路线 pacing 被旁枝拖累(典型错误:Mauricio 在 Mark 路线 E11 + E13 双重告别)

### 该 check 的场景(正面清单)

- **MC 主动公开表态**(当众承认、当众亲、当众替他挡) → BOLD
- **MC 识破对方隐藏**(听到威胁、发现说谎、看穿伪装) → SMART
- **MC 在他推开时不退**(他关门她还站在门口) → BOLD
- **MC 准确读到对方真正需要的**(给空间而不是逼问、记住他提过的小事) → SWEET
- **Tentpole 情感峰值,失败走真 heartbreak 分支**(见 #12) → HARD 或 CRUCIAL

### 1.1 集数切分(四段)

按下面这个比例分配,除非有特殊理由:

| 段 | 占比 | 角色 |
|----|------|------|
| 公共段 | 20-25% | 所有玩家都看这部分,介绍三个 LI,埋早期 @signal seed |
| 软路由段 | 10-15% | 玩家开始偏向某个 LI,每个选择让一条关系升温 |
| LI 独占段 | 50-60% | 玩家锁定一条线后专属的那几集,均分给 N 条路线 |
| 收尾段 | 5-10% | 每条路线有自己 flavor 的最后 1-3 集 |

**为什么是这个比例**:公共段太短玩家不认识所有 LI,太长大家没耐心等;独占段是路线主体,占比必须够。

### 1.2 锁定路线的那一集放在哪

玩家锁定 LI 路线靠一个大 `@gate`,通常放在公共段+软路由段结束的位置。举例:25 集,公共段 5 集 + 软路由段 3 集 = 第 8 集结尾那个 @gate 决定接下来走哪条路线。

### 1.3 给每条 LI 挑调性

bible 的 B3 列了每个 LI 的候选调性池(比如 Mauricio 有 healing / banter / possession 三种候选)。planner 这一步决定:

- 真的都做,还是合并、或舍弃?
- 如果路线里再做一次调性分叉(二次软 gate),分叉放在路线第几集?
- 每条调性对应的 butterfly flavor 要求在哪几集必须产出?

写进决策文档里,后续 sub-agent 写 LI 独占段时照做。

**经验值**:每条 LI 路线里通常做 1 种主调性,或 2 种在路线中段分叉;3 种调性全做对写作量要求太高,除非用户愿意多加篇幅。

### 1.4 @signal 分配到具体集

把所有 bible 的 B2 @signal 清单拿来,每个 flag 决定:
- 触发场景放在第几集?
- 回调 beat 放在第几集?
- 如果不触发,替代的场景在第几集怎么安排?

这是一张大账本,写成 table。

### 1.5 MC 结局 gate 位置

MC 自己有两种结局 flavor(`malia-self-accept` / `malia-still-running`),它和 LI 路线正交,需要单独一个 @gate。通常放在倒数第 2-3 集。决定用不用两种,还是合并。

### 1.6 结局终结标记(每集必须有 @gate 或 @ending)

MSS 规范要求每集要么有 `@gate` 继续路由,要么有 `@ending` 终结。写 plan 时每个"终点集"必须明确它是哪种终点:

| 终点类型 | 用 | 对应 plan 里的集 |
|---------|-----|---------------|
| HEA 大结局(两人 happy ending) | `@ending complete` | E22 HEA 变体 |
| Bad ending(玩家没选对,或有意走暗线) | `@ending bad_ending` | 独立 bad-ending 文件 |
| 本季完但有续(for seasonal games) | `@ending to_be_continued` | 最后一集(如果做续集) |

**Plan 里每条 route 的终点集必须标注**"这集是 `@ending complete`"或"这集路由到 bad-ending 文件(那个文件用 `@ending bad_ending`)"。否则 episode-writer 不知道怎么收尾。

### 1.7 决策输出 `00-structure-decision.md`

模板:

```markdown
# 剧集结构决策 — {book-slug}

## 总集数
25 集

## 四段切分
| 段 | 集数 | 起止集 | 作用 |
|----|------|--------|------|
| 公共段 | 5 | E1-E5 | ... |
| 软路由段 | 3 | E6-E8 | ... |
| LI 独占段 | 15 | E9-E23 | 每 LI 5 集 |
| 收尾段 | 2 | E24-E25 | ... |

## 路线分叉位置
- 大 @gate 锁 LI 路线:E8 末尾
- MC 结局 @gate:E23 末尾

## 各 LI 路线调性选择
### Mauricio
- 从 bible B3 候选池(healing / banter / possession)中选:healing + possession 两种
- 路线内二次 gate 位置:E12 末尾
- 舍弃 banter 的理由:...

### Easton
...

### Mark
...

## @signal 分配总账
| FLAG | 触发集 | 回调集 | 涉及路线 |
|------|--------|--------|---------|
| HELPED_MAURICIO_DAD | E2 | E7 + E14 | 公共段触发,Mauricio 路线回调 |
| ...|

## 风险备注
(这里写规划时发现的 tradeoff 或 bible 里没解决的地方)
```

## Step 2 — 写公共段 + 软路由段(主 agent 自己做)

决策定好后,主 agent 自己写前两段的 plan。**这部分不能分派给 sub-agent**,因为:
- 公共段要照顾所有 LI 的存在感,需要全局视野
- 软路由段的每个选择都要同时影响多条 LI,跨 LI 的平衡只能主 agent 自己掌控

### 每集的 plan 要写什么

每集一个小块,包含这几个字段(示例):

```markdown
## E2 — 第一次见醉酒的父亲

### 场景 beat(game-level)
- 开场:MC 回家路过 Mauricio 家,撞见他在门口扶醉酒父亲
- 中段:MC 选择要不要上前帮忙(核心 @choice)
- 结尾:Mauricio 独自回屋,MC 听到房间里砸东西的声音

### 关键 @choice
- 选 A:上前帮忙扶父亲进门 → 触发 `HELPED_MAURICIO_DAD` + `@affection mauricio +2`
- 选 B:装没看见,快速离开 → 不触发,仅内心独白 butterfly "MC 选择了不插手别人的家事"

### 这集要积累的 butterfly flavor
- healing 方向:"MC 在 Mauricio 最不想被看见的时刻没有转身离开"
- banter 方向:(本集不建议做 banter flavor,此时两人还没熟到能 banter)
- possession 方向:(本集太早,跳过)

### 这集给其他 LI 的戏份
- Easton:电话骚扰 MC 3 分钟,埋 King 家高压线(不强,避免公共段偏 Easton)
- Mark:零戏,保持神秘(Mark 路线上升期在后面)

### 集尾钩子
"理解深一层":Mauricio 原来有酗酒父亲
"新增不确定":那声砸东西,他没事吧?
```

### 文件:`01-common.md`

所有公共段 + 软路由段的每集 plan 放在同一份文件里,按集顺序排。

## Step 3 — 并发 spawn sub-agent 写 LI 独占段

决策出来 + 公共段+软路由段写完后,主 agent 用 Task 工具并发 spawn **N 个 general-purpose sub-agent**(N = LI 数量)。每个 sub-agent 专注一条 LI 路线。

### 每个 sub-agent 拿到的材料

- `00-structure-decision.md`(全局决策,知道自己这条路线有几集、调性怎么选、放在哪些集)
- `01-common.md`(知道公共段埋了什么 seed,哪些要在自己路线里回调)
- 对应 LI 的 bible(人设 + @signal 池 + @affection 规则 + B3 调性池)
- MC bible(了解 MC 的核心人格和 MC 自己的两种结局 flavor)

### sub-agent 的任务

写自己这条路线的独占段 plan:
- 每集一块,字段和公共段一样(场景 beat / @choice / butterfly flavor / 其他 LI 戏份(这部分要写明"本路线下 Easton/Mark 在这里只是 cameo"这种)/ 集尾钩子)
- 加一段"和这条路线对应的收尾",因为收尾每条 flavor 不同,由该 sub-agent 一起写
- 严格遵守 Step 1 决策:集数、调性、@signal 分配到这条路线的部分

### 输出文件

- `02-route-{li1_name}.md`(sub-agent 1)
- `03-route-{li2_name}.md`(sub-agent 2)
- `04-route-{li3_name}.md`(sub-agent 3)

### 并发执行要求

**必须真正并发,不能串行**。在一个消息里同时发 N 个 Task 工具调用,不要等第一个回来再发第二个。

## Step 4 — 汇总和交付

所有 sub-agent 回来后,主 agent:

1. Read 所有 sub-agent 产出的 `02-route-*.md` 文件,扫一眼格式是否一致、有没有明显遗漏
2. 把 Step 1-3 的所有产物清单写在一份 `README.md` 里(作为整个 plan 包的索引)
3. 告诉用户 plan 包生成完了,下一步调 `planner-reviewer` 做独立审查

**主 agent 不做**:
- 不改 sub-agent 的输出(如果有问题让 reviewer 发现)
- 不做 review(那是 planner-reviewer 的活,保证独立性)
- 不合并 LI 独占段到一个大文件(分开的好处:后续修某条路线不影响其他)

## 输出清单

所有文件落在 `moonscripts/{book-slug}/03-entity-planner/`:

```
03-entity-planner/
├── README.md                          plan 包索引 + 总览
├── 00-structure-decision.md           主 agent 全局决策
├── 01-common.md                       公共段 + 软路由段每集 plan
├── 02-route-{li1}.md                  LI1 独占段 + LI1 flavor 收尾
├── 03-route-{li2}.md                  LI2 独占段 + LI2 flavor 收尾
└── 04-route-{li3}.md                  LI3 独占段 + LI3 flavor 收尾
```

## 与 planner-reviewer 的闭环

和 bible-reviewer 一样是循环 review + edit 直到 PASS:

1. entity-planner 产出 plan 包
2. 主动调 `planner-reviewer` 做独立审查
3. 读 `planner-review-report.md` 判决:
   - **PASS** → 交付下游(entity-normalizer / episode-writer)
   - **CONDITIONAL 或 FAIL** → 按 report 里的问题清单,用 **Edit 工具修对应文件的对应段落**(不要重写整个 plan),修完重新调 planner-reviewer
4. 循环至多 3 轮。3 轮仍不 PASS → 报告给用户,不硬冲

**修正原则**:planner-reviewer 的 report 精确到"哪个文件/哪段 plan/原问题/建议修正"。主 agent 逐条 Edit,不扩大范围。

## 禁止事项

- **不要在 Step 1 之前就开始写集 plan**:集数切分和分叉位置必须先定,否则 sub-agent 跑起来全是猜
- **不要让 sub-agent 碰公共段**:公共段 要跨 LI 平衡,只能主 agent 写
- **不要让 sub-agent 之间互相看对方的产出**:每个 sub-agent 只能知道自己这条路线和共享的公共段/决策文档,保持认知隔离
- **不要把台词写进 plan**:plan 是骨架不是剧本。每集 plan 的"场景 beat"是描述"发生什么",不是"角色说什么"。台词是下游 episode-writer 的活
- **不要在 plan 阶段决定素材提示词**:那是最后 asset-prompt-generator 的活
- **不要跳过 bible 的 @signal**:bible B2 列了一堆可回调事件,每个都必须在 plan 里明确"在第几集触发 or 舍弃并说明理由",不能就这么忘了
