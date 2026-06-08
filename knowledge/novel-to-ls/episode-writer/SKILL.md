---
name: episode-writer
description: 基于character-architect的角色体系,生成 LS(Lunascripts)格式的完整互动游戏剧本,含选择设计、D20 检定、@butterfly 蝴蝶效应、@gate 路由和钩子工程,并自评迭代至9分以上。当用户需要写互动游戏剧本时触发。
allowed-tools: Read, Write, Edit, WebSearch
---

# Episode Writer — 互动游戏剧本生成 + 自评迭代

基于 `character-architect` 输出的角色体系,**用 LS (Lunascripts) 格式写出完整互动游戏剧本**,然后自评、迭代,直到综合分 ≥ 9.0。

## 前置条件

- `character-architect` 已完成,MC 和全部 LI 的 Character Bible 可用
- **`bible-reviewer` 已审查并给出 PASS 判决**(`bible-review-report.md` 总结论必须是 `PASS`,不接受 CONDITIONAL 或 FAIL)
- 路线对比矩阵已确定
- 配角筛选已完成
- 熟读完整格式规范 [`ls-spec.md`](ls-spec.md)

**如果没有这些输入,先要求用户运行 `/character-architect` → `/bible-reviewer` 闭环,PASS 后再回来。**

## 输出格式：LS (Lunascripts)

**本 skill 输出的剧本必须使用 LS 格式。**

### 语言:全英文(硬性规则)

**剧本里的所有 `CHARACTER:` 对白、`YOU:` 内心独白、`NARRATOR:` 旁白、`@text` 短信内容,一律英文。**

原因:目标受众是北美 18-24 岁女性,游戏交付时直接出英文版本,不是中文 placeholder 再翻译。

允许的例外:
- **MC 的 Spanglish 点缀** — Malia 是 Hispanic,可以 sprinkle Spanish(`chingadera` / `no mames` / `mierda` 之类),但整句结构英文
- **家人场景的西语昵称** — `mija` / `hermanita` 这类 Hispanic 家庭称呼
- **原著里的招牌台词** — "I'm Malia fucking Hernandez" / "Fuck off, Reyes" 原样保留

注释(`//` 开头)和 butterfly 描述(`@butterfly "..."`)**可以用中文**,因为它们不会进游戏画面,只是给 LLM 和开发者读的元数据。

### NARRATOR 里指代 MC 用**大写 YOU**,不用 she / her / hers(硬性规则)

这是"你就是 Malia"这个代入感的贯彻。NARRATOR 不是在讲"一个叫 Malia 的女孩的故事",是在和**你**(玩家)说话 — 所以 NARRATOR 行内所有指代 MC 的人称,**全部用大写 YOU / YOUR / YOURS**,不用 she / her / hers。

其他角色(Vikki / Easton / Mark / Mauricio...)在 NARRATOR 里照常用 he / she / his / her,**只有 MC 特殊**。

| 坏(she/her) | 好(YOU/YOUR) |
|------------|-------------|
| `NARRATOR: She reaches across the console and covers the back of his hand with hers.` | `NARRATOR: YOU reach across the console and cover the back of his hand with YOURS.` |
| `NARRATOR: She bats his hand away on reflex.` | `NARRATOR: YOU bat his hand away on reflex.` |
| `NARRATOR: She flips her phone face-down into her pocket.` | `NARRATOR: YOU flip YOUR phone face-down into YOUR pocket.` |

**为什么要大写**:
1. 视觉上一眼能识别出"这是 MC 代词",和常规 "you" 区分开
2. 和 `YOU:` 对白前缀的语义一致 — 两处 YOU 都指"玩家作为 MC"
3. 避免和 narrator 里偶尔出现的 generic "you"(如引语)混淆

**附带效果**:这条规则还能倒逼修掉大量"NARRATOR 作家腔"(比喻 / 主观读)。因为很多作家腔句子本来是"她如何如何像...一样"的结构,改成第二人称会自动变"YOU 如何如何像...一样",比喻句读起来就出戏,作者会自然想去掉。

**ZH 翻译同样规则** — 中文版 NARRATOR 行里 MC 指代也用**大写英文 YOU / YOUR / YOURS** 嵌入中文句中(例:`NARRATOR: YOU 拍开他的手。`)。把"她"/"她的"留给 MC 之外的女性角色。这条惯例在 ep_1_final.zh.md 里已经定型(L90/183/191/274/363)。

### 硬强制:每集 FINAL 之前必须跑 `check_narrator_pov.py`

光写规则不够 — 上一轮 60 集交付里这两条规则虽然写了,但 agent 还是漏了 ~370 处违规。这一轮起把检查脚本化,**写完 FINAL → 跑 validator → 0 违规才算交付**。

```bash
# 检测全部:NARRATOR 第二人称 + @option label 长度
python3 skills/episode-writer/check_narrator_pov.py \
  lunascripts/<book-slug>/05-episode-writer/scripts --summary-only

# 自动修 NARRATOR 人称(EN+ZH);@option 长度只报告不自动改(创意重写)
python3 skills/episode-writer/check_narrator_pov.py \
  lunascripts/<book-slug>/05-episode-writer/scripts --fix
```

脚本干两件事:
1. **NARRATOR 第二人称**:扫每条 `NARRATOR:` 行,对 `she / her / hers / Selena / 她 / 她的` 做主语消歧(白名单含 Elena/Ximena/Sofia/Camila... 这种已知"非 MC 女性角色"),凡指代 MC 的全部替换为 YOU/YOUR/YOURS。`--fix` 模式会自动改字面 + verb 反变位(`She bats` → `YOU bat`、`She's` → `YOU're`、`She has` → `YOU have`)。
2. **`@option` label 长度**:EN 文件 ≤ 80 chars,ZH 文件 ≤ 60 visible width(东亚字符算 2)。超长不自动改 —— 必须人工把 label 缩成短动作 gist,把完整对白挪进 option block 内的 SELENA: / YOU: 行。

**`--fail-on-violation` 退出码 1**,可挂 CI/pre-commit/episode-writer-reviewer。新加女性角色时往脚本顶端 `OTHER_FEMALE_CHARS` 加进去即可。

### `@option` label 长度 — 不要把整段对白塞进按钮文本

`@option <ID> [brave|safe] "<label>"` 里的 `"<label>"` 是手机 UI 里的按钮。**EN 上限 80 chars,ZH 上限 60 visible width**。超过就读不下去,玩家根本看不到第二个选项是什么。

| 坏(整段对白当 label) | 好(短 gist) |
|---------------------|-------------|
| `@option A brave "Tell him: 'I have been five years old since I was five. Today wasn't a one-off. It was the thousandth one-off.'" {` (111) | `@option A brave "Tell him: 'today wasn't a one-off — it was the thousandth.'" {` (~58) |
| `@option A brave "Out loud, across the table, correct him. 'Lukey. She got into the Iowa Writers' Workshop. That's top of the country. Don't talk about it like it's nothing.'" {` (156) | `@option A brave "Correct him across the table — Iowa Writers' is top of the country." {` (~67) |

**原则**:label = 选项的"动作 gist + 关键短语",不是台词全文。完整台词放进 option block 内部,玩家点进去后通过 SELENA:/YOU: 行自然听到。这样按钮简洁,故事张力反而被保留。

### FINAL 版本不留迭代痕迹

迭代过程中的版本备注(`// v7: all English + identify...`)只写在 v1-vN 里给自己看,**交付 FINAL 之前要全部删掉**。FINAL 里的注释只留"场景用途说明"这类对未来维护者有用的信息,不留"这版相对上版改了什么"。

保留:`// BEAT 2 — In car: Easton's phone call from his father.`(场景用途,有用)
删掉:`// v7: add rhythm break between Mark and Mauricio scenes to fix v6 reviewer complaint.`(迭代痕迹,FINAL 不需要)

核心约定:
- 一个 `.md` 文件 = 一集,文件路径即 `episode_id`(如 `main/bad/001/02.md` → `main/bad/001:02`)
- 整个文件包在 `@episode <branch_key> "<title>" { ... }` 根块内
- 所有视觉指令走「对象-行动」模式:`@<对象> <行动> [参数]`
- 角色呈现 = 静态立绘(独立 PNG),不是骨骼动画
- 素材解耦:脚本只写语义名(`neutral_smirk`),解释器通过 mapping.json 翻译到 URL

### 快速语法速查

```
集定义：@episode main:01 "Butterfly" { ... }
场景：  @bg set <name> [transition]                 → 加载 bg/<name>.png
角色：  @<char> show <look> at <pos>                → 加载 characters/<char>_<look>.png
换立绘：@<char> look <look> [transition]
退场：  @<char> hide [transition]
气泡：  @<char> bubble <type>                       (anger/sweat/heart/question/...)
对话：  CHARACTER: 台词                             (角色名全大写)
对话+立绘糖：CHARACTER [look]: 台词
内心：  YOU: 内心独白
旁白：  NARRATOR: 旁白
手机：  @phone show { @text from/to <char>: ... } / @phone hide
选择：  @choice {
          @option A brave "文本" {
            check { attr: BOLD, dc: 14 }           // 属性 BOLD/SWEET/SMART;dc 为整数(EASY=10/NORMAL=12/HARD=14/CRUCIAL=17)
            @if (check.success) { ... }
            @else { ... }
          }
          @option B safe "文本" { 直接叙事... }
        }
小游戏：@minigame <game_id> <ATTR> "<description>" { @if (rating.S) { ... } @else @if (rating.A) { ... } }
CG：    @cg show <name> [transition] { duration: high content: "..." <body> }
状态：  @affection <char> +N / @xp +N / @san +N
        @signal mark <EVENT_NAME>                 (持久布尔标记,克制使用,必须有 reader)
        @signal int <counter> (=|+|-) <N>         (持久整数计数器,累计型剧情锁)
        @butterfly "这一步玩家做了什么的自然语言描述"
音乐：  @music play <name> / @music crossfade <name> / @music fadeout
音效：  @sfx play <name>
停顿：  @pause for <N>                              (等待玩家点击 N 次后继续)
并发：  &<指令>                                     (紧跟前一条 @,同时执行;仅简单指令,不可用于块)
分支：  @if <condition> { ... } @else { ... }     支持 && || >= <= == !=
路由：  @gate {                                     (必须在 @episode 尾部,和 @ending 二选一)
          @if (A.fail): @next <branch_key>            choice 条件:选项.结果(点号分隔)
          @if (affection.easton >= 5): @next ...     comparison 条件(数值比较)
          @if (FLAG_NAME): @next <branch_key>         flag 条件(signal 布尔)
          @if ("..."): @next <branch_key>             influence 条件(LLM 读 butterfly)
          @else @if (...): @next <branch_key>         elseif 链式
          @else: @next <branch_key>                   兜底
        }
终结：  @ending <type>                              (和 @gate 互斥,每集必须有其一)
          @ending complete                              全剧终(HEA / 大结局)
          @ending to_be_continued                       待续(本季完,下季未出)
          @ending bad_ending                            坏结局终点
注释：  // 行首注释,整行忽略
```

### @butterfly 和 @affection 的作用分工

- **`@affection <char> +N`** = 数值累积,给 `@if affection.<char> >= N { ... }` 这种数值门读
- **`@butterfly "描述"`** = 文本累积,给 `@gate` 里的 `@if ("...")` 这类 influence 条件做 LLM 判定读

character-architect 提供的**关系调性**就映射到 `@butterfly` 的写法风格——真诚路线的 butterfly 写"MC 在家庭危机中陪伴了 Mauricio",调侃路线写"MC 用挑衅化解了 Mauricio 的戒备"。同一个选择的不同选项产生不同 flavor 的 butterfly 记录。

## 核心写作原则

### 原则一：先成为玩家，再成为作家

写每一个场景之前，问自己：**"如果我是玩家，此刻我的手指悬在两个选项上方，我在想什么？"**

玩家想的不是"哪个选项会给我更多信息"，而是"我选了之后，他会怎么看我，我们之间会变成什么"。

### 原则二：选择 = 关系测试，不是剧情解锁

每一个选择的本质是玩家在测试一段关系。选完之后，角色的反应必须出乎意料但事后合理。

### 原则三：角色是变量

玩家控制自己对角色做什么，但控制不了角色是什么。这个不对称是整个互动游戏的核心张力。

### 原则四：每集结尾让玩家多了解一层,同时留一个新问题

**不要把集尾写成"问题解决了,大家可以安心睡了"。** 每集结尾做两件事:
1. 让玩家多了解一层这个角色(比如"原来他 10 岁就喜欢她")
2. 留一个新问题让她想继续玩下一集(比如"他房间传来的那声砸东西,他没事吗?")

切章节的最佳位置:事情已经发生了(高潮过了),但后果还没完全展开(玩家想知道结果怎样)。不要在事情还没发生前就断——那只会让玩家觉得没头没尾。也不要在一个和本集主题无关的突发事件处断——比如正在谈感情突然插入一个无关的打架。

### 原则五：每个场景是一个小过山车

一个好的场景有四个阶段:
1. **上坡** — 给玩家一个悬念(他要说什么?她会怎么反应?)
2. **到顶** — 事情发生了(他告白了 / 她发现真相了 / 他哭了)。这个事必须改变两人之间的某些东西,否则不算"到顶"
3. **下坡** — 事情发生之后的后果(他说完了,她什么反应?其他人知道了吗?)
4. **缓一缓** — 角色消化刚才发生的事,玩家也跟着消化。这段可以短,但不能没有

写每个场景时检查:这四步都有吗?如果某步缺了,场景会感觉"有事情发生但没有感觉"。

### 原则六：冲突一次比一次严峻

如果这集出的事和上一集差不多严重,玩家会觉得"又来了"。每次关系出问题,程度要比上一次更重:
- 第一次:他不接电话(小裂)
- 第二次:他在她面前崩溃(中裂)
- 第三次:十年前的秘密被揭开(大裂)
- 第四次:他彻底关门不让她进(最大裂)

写之前检查:这集出的事,比上一集出的事更严重吗?

### 原则七：角色的过去不要直接讲出来

不要写"他小时候父亲酗酒,所以他害怕亲密关系"这种旁白。用一个细节暗示:
- 他看到啤酒罐会不自觉收紧肩膀
- 她的旧饰品盒里有一条她自己做的蝴蝶手链,她每次翻到都停下来
- 他永远不在别人面前喝酒,但理由不是"不爱喝"

让玩家自己拼出真相,比你说出来有意思得多。

### 原则八：做爱场景的规则

做爱之前两个角色必须都清醒且自愿。如果一方喝醉了或正在创伤崩溃中,不要在这个场景里发生性关系(可以抱着她但不升级)。

亲吻、壁咚、拉手这些是 romance 的正常表现,不需要每次都"先问再碰"。

### 原则九：check 系统的铁律

**属性只有 3 个 — BOLD / SWEET / SMART**

- **BOLD** — 敢做(当众告白、怼人、主动亲、替他挡父亲、闯入他的私人领域)
- **SWEET** — 会哄(温柔陪伴、给空间、记住小事、不解决只陪)
- **SMART** — 看得出(发现谎言、读懂暗示、拼出真相)

**难度用整数 dc(4 档梯度)**

写 `check { attr: BOLD, dc: 14 }` —— `dc` 必须是整数。4 档语义梯度固定:

| symbol | dc | 用途 |
|--------|----|------|
| EASY | 10 | 教学场景 / 情感高潮后的 coast / MC 明显 signature 动作 |
| NORMAL | 12 | 默认档,大多数 check |
| HARD | 14 | 路线中段关键节点,失败有剧情代价 |
| CRUCIAL | 17 | tentpole 级,付费锚点;**每路线 exactly 2 次**;失败走 heartbreak 分支但不是 route collapse;失败后**下一个 beat 必须零 check** |

4 档足够。不要塞 `dc: 11/13/15` 这种中间值。`dc: HARD` 这种 symbolic 写法上游 parser 硬拒。

**E1-E2 不设任何 check**(纯 @choice + butterfly)。E3 开始可以有,但 E3 第一个 check 不能带付费压力。

### 先理清两个概念:`@choice` ≠ `@option` 带不带 check

容易混,先钉清楚:

- **`@choice { }`** = 给玩家选项的**结构块**。这是玩家看到两个按钮要选一个的那一刻。
- **`@option <ID> <brave|safe> "文本" { }`** = 这个 choice 里的每个选项。选项有两种形态:
  - **`safe` option**:不带 `check`,玩家选了直接走选项块内的内容
  - **`brave` option**:带 `check { attr, dc }`,需要骰子检定,body 内用 `@if (check.success) { ... } @else { ... }` 分叉两条结果分支。`check.success`/`check.fail` 是 context-local 条件,只在 brave option body 内合法

**所以不能用"有没有 check"来区分 @choice 的档次** — 有 check 的是 option 里的事,不是 @choice 本身的事。

### 按"后果强度"给 @choice 分档

判断一个 @choice 该不该出现、出现在哪,看**整个 @choice 的后果强度**:

| 档次 | 后果 | check 常见形态 | 该在哪些集出现 |
|------|-----|--------------|--------------|
| **Flavor choice** | 两个 option 都推剧情,都给 butterfly;`@affection` 要么都 0 要么两边同号小量;不分路线,不触发 signal | 两 option 都 safe(不带 check) | 任何集都可以,E1-E2 首选 |
| **Relationship choice** | 两个 option 显著不同的 `@affection` 变化(一正一负 / 不同 LI 加减),可能触发 signal | option 可 safe 可 brave;brave 用 NORMAL/HARD | E3 起的公共段、路线段 |
| **Routing choice** | 决定路线走向,E8 大 gate 的 @if 读它的 `A.fail` / butterfly | 通常 brave + NORMAL/HARD,偶尔 CRUCIAL | E8 末 gate / 路线内分叉点 |
| **Tentpole choice** | 路线核心付费瞬间,`@affection +5` 级 + signal 触发 + CG 场景 | brave + CRUCIAL | 路线中段/后段的 tentpole 集 |

### 教程期(E1-E2)具体规则

**可以有 @choice(1 个),但里面的 option 有硬约束**:

- 每个 option **要么不带 check,要么带 check 但 dc 是 `EASY`**(几乎必过,纯演示"骰子系统长啥样")
- 不能用 HARD / CRUCIAL(玩家还没学会系统就罚他是不道德的)
- 整个 @choice 应该是 **flavor 档**:两个 option 推同一条剧情主轴,差别在 MC voice 的表达(硬壳 vs 软核)不在结果

**样例**(E1 Beat 2,Easton 说 "I can't breathe" 后):

```
@choice {
  @option A safe "Reach for his hand. Say 'I'm here.'" {
    MALIA: I'm here, East.
    @affection easton +1
    @butterfly "MC caught Easton — soft-core voice seeded"
  }
  @option B safe "Break the tension. Joke him out of it." {
    MALIA: Don't get out of my car with that face.
    @affection easton +1
    @butterfly "MC deflected with a joke — armored voice seeded"
  }
}
```

两 option 都 safe、都 `+1`、都推剧情。玩家选的不是"哪个有好处",是"MC 此刻是哪种我"。

**软 @choice 样例**(E1 适用):

```
// 场景:Easton 在车里说 "I can't breathe" 等 MC 回应
@choice {
  @option A "Say 'I'm here'" {
    EASTON: ...thanks, Mal.
    @butterfly "MC chose to catch Easton when he was breaking — soft route voice"
  }
  @option B "Joke it off" {
    MALIA: Don't get out with that face. Jianna'll think I made you cry.
    @butterfly "MC deflected Easton's vulnerability with a joke — armored route voice"
  }
}
```

两个选项都推剧情,都给 `@butterfly`,都不给 `@affection` 差异(或都 +1)。玩家此刻的选择塑造 MC 的 voice flavor(硬壳 vs 软核),为后续 gate 提供 influence 素材。

**每集 @choice 数量(业界惯例对齐)**:

参考:Choices: Stories You Play 每章 1-2 个付费 choice;Episode 每章都有 choice 但**通常 1 个**;VN 是 low-interaction 类型。一集 6-8 分钟,塞 3 个 choice 会让节奏碎。

默认:
- **每集 1 个 @choice 是标配,2 个是 tentpole 集上限**
- E1-E2(教程期):1 个 flavor @choice(option 都 safe 或都 EASY check)
- E3-E5(公共段中后期):1 个 relationship @choice
- E6-E8(软路由段):1 个 routing @choice(每集倾斜不同 LI);E8 末是压轴
- 路线段常规:1 个 relationship 或 routing @choice
- 路线段 tentpole:可 2 个 @choice(含 1 个 CRUCIAL tentpole choice)

**@choice 放在哪一 beat**:
- 放在**情绪拐点**那一 beat — MC 听到某话 / 看到某事,此刻必须表态的那一刻
- 不要放在 beat 开头(玩家还没进入情境)或 beat 结尾(玩家已经在期待下一个场景)
- 一集只有 1 个 choice 时,这个 choice 必须是本集最尖锐的那个情感时刻

**choice 放在哪一 beat**:
- 放在**情绪拐点**那一 beat — MC 听到了某个话/看到了某个事,此刻必须表态的那一刻
- 不要放在 beat 开头(玩家还没进入情境)或 beat 结尾(玩家已经在期待下一个场景)
- 一集只有 1 个 choice 时,这个 choice 必须是本集最尖锐的那个情感时刻

### 11 条绝对不该 check 的场景

遇到以下情况,写成纯 @choice(去掉 brave 标记和 check 块):

1. 调性二次 gate 入口(路线内分叉)— 用 butterfly 累积判定,不是骰子
2. MC 对关系安排的身份接纳(我接受 / 我拒绝某种关系模式)
3. 纯情感姿态二选一(两种都 valid,没有 better/worse)
4. 角色主动来找 MC 的被动戏(他爬窗、他道歉、他告白)
5. 最终结局 flavor 触发(由累积状态决定,不由骰子)
6. 强制付费节点(失败 = bad ending 无其他出路 = 不道德)
7. MC 自我认知选择(我还爱他吗 / 我是这种女孩吗)
8. CRUCIAL 失败后紧接的 1-2 个 recovery beat
9. "立即重试同一场景"的伪装 paywall
10. 教程期(E1-E2)的任何 check
11. LI 路线间难度不对等(某 LI CRUCIAL 多 = 玩家觉得被收割)

### 纯 @choice 示例(无 check)

```
@choice {
  @option A "抱住他不说话" {
    @butterfly "MC 选择陪伴"
    @affection mauricio +2
  }
  @option B "说'你不必一个人扛'" {
    @butterfly "MC 选择言语关怀"
    @affection mauricio +2
  }
}
```

只有"MC 真的需要某种品质才能成功,失败有实际代价"的时刻才用 `brave` + `check`。

---

## 互动游戏剧本 ≠ 小说(8 条关键差别)

Wattpad 的写作规则大多数我们能用,但**我们写的是互动游戏剧本,不是小说**,以下 8 条必须按互动游戏适配:

### 1. 对话是主角,旁白是配角
小说靠旁白讲故事,游戏靠对话和选择。大部分场景里 60-80% 应该是角色对白(`CHARACTER:`)+ MC 内心独白(`YOU:`)+ 偶尔旁白推时间(`NARRATOR:`)。**如果旁白比对话多,八成写错了**。

### 2. 画面是引擎的事,你不用再描述一遍
`@bg set school_hallway` 已经告诉引擎背景是走廊了 — 你不用再写"阳光透过走廊的窗户洒在地面"。`@mauricio look angry` 已经告诉引擎他生气了 — 你不用再写"他皱起眉头"。写出来就是视觉冗余,浪费玩家时间。

### 3. "Show don't tell" 变成 "Trust the visual"
Wattpad 要求作者用文字 show,我们游戏里引擎帮你 show。`NARRATOR:` 只在"引擎没法 show"的场合用 — 比如时间跳过、地点切换、心理层面的时间感。

### 4. "Filter words" 规则有例外
小说里"我听到门关了"被认为是 filter words(隔了一层感知的废话)要删掉。但游戏里 `YOU:` 内心独白就是 MC 的意识流,"我听到 / 我感觉"是惯用语,不是问题。**只有 `NARRATOR:` 旁白里才严格禁止**这种写法(旁白里要写"门砰的关上",不是"她听到门砰的关上")。

### 5. 每集 ≠ 每章
小说一章可能只讲一件完整的事。游戏一集是"玩家 8-10 分钟连续体验",必须有节奏变化(对话 → 场景切 → 选择点 → 反应)。**一集里只发生一件事 = 玩家觉得没进度**。

### 6. 开场不是"第一段",是"前 30 秒"
玩家可能戴着耳机在地铁打开游戏,前 30 秒没抓住她就切走。E1 头 3 个 beat 必须是"截图就能发推"的密度:看到 MC、听到第一句台词、马上明白是什么类型的故事。

### 7. 浪漫第一次见面不是一次写,是多次
小说第一章一次搞定 LI 初印象。游戏 E1-E5 公共段要**分开介绍每个 LI**,每人一场独立戏,每场都得让玩家觉得"这个人我有兴趣继续玩"。

### 8. Wattpad serialized 节奏 ≠ 游戏节奏
Wattpad 一周一章,读者隔 7 天来。游戏是玩家一口气打 3-5 集。**节奏密度必须比 Wattpad 更紧**:每集的情感 peak 之间不要超过 1 个 beat 的缓冲。

---

## 句子层铁律(5 条)

玩家在手机上读,注意力比小说读者更散。以下 5 条让文字更容易"滑进眼睛":

### 1. 段落短,一段一个想法
大段文字会被玩家直接跳过。每段控制在手机屏幕 2-3 行内。

### 2. 句子简单:怎么排比用什么词更重要

**主语和动词靠近**:
- ✓ "Fatima 感觉风穿过头发"
- ✗ "Fatima,一个穿宽松运动服的跑者,感觉风穿过头发"(主谓被一堆形容隔开)

**别塞修饰从句**:
- ✓ "Meredith 那晚几乎没睡。明天是她第一次独自出门。"
- ✗ "从未独自旅行过的 Meredith 那晚几乎没睡。"(关键信息被塞进从句)

**强调名词动词,压制形容词副词**:
- ✓ "小猫狼吞虎咽地吃"
- ✗ "小猫饥饿地吃着食物"(副词"饥饿地"+"着"弱化动作)

### 3. 描述克制 — 只给 1-2 个情感核心细节
别给博物馆清单。一个场景 1-2 个有情感的细节就够,其他让玩家脑补。

### 4. 词要普通,不用 thesaurus 替换
短词优先。"拜谒" 比 "见" 难读,不等于高级,只等于写得累。

### 5. 动作要主动
- **主动语态**:"Callista 扇了黑手党老大一巴掌" > "黑手党老大被 Callista 扇了"
- **具体动作动词,避开 is / was / 感觉**:
  - ✓ "Christabel 蹲在黑暗里等 Bryce"
  - ✗ "Christabel 正在蹲着,她等着 Bryce"
- **"said" 是好词,别换** — 游戏里 `@<char> look <emotion>` 立绘传达角色情绪,台词里 "said" / "说" 足够,不要用"咆哮 / 低语 / 厉声"花式替换

---

## Look 节奏：写每个 `@<char> look` 之前必过的"三问"

立绘切换不是越多越好。每多切一次 look,玩家眼睛就要消化一帧新信息——切多了像 PPT 翻页,切少了像石膏像。**克制是默认**,要切必须有理由。

每次想敲下一行 `@<char> look <token>` 之前,**问自己三个问题**,过不了就别写:

### Q1：这一刻他身体真的做了一个新动作吗?

- ✓ 抬下巴 / 转身 / 手伸出 / 退一步 / 把毯子拉到肩 — 真物理动作,值得切
- ✗ "更深呼吸了一下" / "目光更稳了" / "一瞬呼吸" — 不是动作,是写手的内心戏在他脸上找出口
- 答 **没** → 别切,跳到 Q2

### Q2：他的内心情绪从 A 变到 B 了吗?

- ✓ 防御 → 软化 / 决绝 → 脆弱 / 漠然 → 警觉 — A 和 B 真不一样,值得切
- ✗ 决意 → 还是决意(只是不同的"决意"措辞)/ 沉默 → 还是沉默 — 同一情绪在原地踏步
- 答 **没** → Q1 也没的话,**别切,删掉这条**

### Q3：接下来这段我能不能用 NARRATOR 一句话 + 背景切换替代?

- 机械过场动作(开门/走过去/掏手机/打字)→ 几乎都能压成 `NARRATOR: 他推门进来。` + 一个落点 look,别给每一个分动作切立绘
- 但是 **romance buildup / 关键情感节点不要压** — 这种地方每一帧都是真情绪,不该用旁白盖过去
- 答 **能压** → 用 narrator,不切立绘;答 **不能压** → 才切

### 三问全过 → 切。任一问没过 → 别切。

**这是写作时的克制门槛**,跟 `look_audit.py` 的差别:
- 三问 = **写作前的决策门**,主观判断,产出干净脚本
- look_audit = **写完后的客观审计**,机械抓 dead look / static recycle / show 后冗余等具体反模式

理想流程:写时过三问 → FINAL 前跑 audit 抓漏 → 0 H 档警告才能 FINAL。

### 配套纪律(不参与三问判定,但同等重要)

- **命名要具体**(详见反模式 5):`half_smile_soft` ✓ vs `soft` ✗。三问通过了之后,token 名再过这一关
- **写完做"密度回扫"**:整个 BEAT 写完后从头扫一遍,任何"3 个连续 look 之间没有真情绪推进"的段落,合并成 1 个落点 look + 1 句 narrator
- **listener 反应延迟落点**:对方说话时不要给 listener 频繁换脸——单角色露出规则下没人看得到。让 listener 在自己开口的瞬间一次到位换 look(详见反模式 9)

---

## 开场特殊规则(E1 头 3 个 beat 必须命中)

### E1 至少要做 2 件事(4 选 2)

| 要素 | 是什么 |
|------|------|
| **Protagonist 出场** | 让玩家看到 MC,带一个能截图的 signature 瞬间(一个手势 / 一句话 / 一个表情) |
| **Inciting incident** | 开学第一天 / 被甩了 / 搬新家 / 他出轨了 — "改变原有生活"的事 |
| **MC 的目标浮现** | 她想要什么?不用明说,可以是一个她盯着看的东西 / 一个她避开的人 |
| **Central conflict 暗示** | 她最想要的东西和什么在对抗?(家族期望 / 自身创伤 / 外部压力) |

4 件都出现 = 教科书级开场。

### 浪漫游戏的第一次见面必须做到

E1-E5 公共段,MC 和每个 LI 的"第一次真正互动":

- **两人各有对方需要的东西** — 不是互相 complete,是互相 unlock(比如 MC 需要 Mauricio 的"看见",Mauricio 需要 MC 的"不退")
- **化学反应立即可感** — 一句台词 + 一个动作 + 一个 `@butterfly` 记录就够,不用"三分钟对话铺设"
- **截图就能传播** — 如果玩家不会截图这一刻发给朋友说"你看这谁",这次见面就写弱了

### 必须避开的开场

- ❌ MC 醒来(Wattpad 最忌讳的开场)
- ❌ 花 3 段介绍背景 — 背景用细节透露,不用旁白讲
- ❌ 没有冲突的"平静日常" — 平静是给后面做对比的,不是给开场的

---

## 常见反模式(从实战迭代里捞出来的坑)

这几条都是 reviewer 实际抓到过、改掉就能直接多 0.5-1 分的问题。

### 反模式 1:Plan 抄了原著重磅台词,你 E1 就原样用

举例:Plan 写 Easton 在 E1 对 MC 说 "I'm suffocating"(从原著 Ch3 抄来)。你要是照搬,E1 就把 Easton bible A10 规定的"路线中段第一次破防"这张牌提前打光了。等玩家到 E13 看他说 "I don't want this life" 时就不爆了——因为 E1 他就差不多说过一次了。

**优先级是 bible > plan > 原著**。

- Bible 是角色真源
- Plan 是路线规划(可能抄了原著但没考虑节奏保护)
- 原著只是素材,不是契约

所以碰到 plan 里有"听起来很重"的台词,先翻 bible A10 / A7,看这种情绪是不是路线中段/后段的付费锚点。是的话就**降档**:保留情绪底色,换个弱一点的说法。比如 "I'm suffocating" 降成 "I can't breathe in this",保留 breathe 做钩子关键词,重炮留到中段爆。

### 反模式 2:Setup 集 6 个 beat 同一个节奏公式

"Setup 集" = 没有大选择的铺垫集(E1 开学日之类)。

问题:一集 6 个 beat,如果每个都是"换背景 → 对话 → 暂停 → 再换背景 → 再对话",玩家玩到第 3 个 beat 就猜到接下来的节奏了,开始跳读。

**中间至少塞一个"节奏打断"**:角色突然接到电话 / 被家人 SMS 拉回现实 / 场景切一个短暂的无对话画面(10-15 秒)。不是加笑料,是让玩家的呼吸换一口。

执行上两件事要注意:
- 打断的内容要和主线有**逻辑连接**(比如家里妹妹刚出现过,这时发 SMS 说她闹别扭),不要天降一个无关事件
- 打断要**短**。2 条 SMS + 一句内心独白 = 够了。写成段子就过了

### 反模式 3:三个 LI 同集亮相,戏份不对等

如果一集里三个 LI 都要出场(E1 最典型),每人的戏份长度要大致对等——**每个 LI 的对白+动作行数,互相之间差距不要超过 ±20%**。

比如 Mauricio 这集 15 行,Easton 12-18 行,Mark 12-18 行。

要是写成 Mauricio 15 行、Easton 15 行、Mark 只给 5 行,玩家早期印象就定了"Mark 没啥戏"——后面再给他补戏就晚了,这位玩家可能已经锁死别的 LI 了。

**例外**:某集就是专门主推一个 LI(比如 E4 Mark 家晚餐),其他 LI 本来就不在场,不用平均。这条规则只在"几个 LI 都在同一集亮相"时生效。

### 反模式 4:剧本里写了"坐下 / 坐着",但立绘都是站的

这个项目(和 Episode / Choices / Chapters 等绝大多数手游 VN 一样)**角色立绘只有站立姿态**。没有"坐在课桌前"、"坐在沙发上"、"坐在车里"的专用立绘。

玩家屏幕上看到的永远是**站着的 Mauricio + 站着的 Malia**,配上教室背景图。

**所以剧本里不能写强调"坐"的动作**:
- ❌ `NARRATOR: She sits.` / `she sat down` / `he was seated across from her`
- ❌ `@malia show seated_defiant at center`(不存在这种立绘)
- ✅ `NARRATOR: She stops at her desk.` — 用"走到位置"替代"坐下"
- ✅ `NARRATOR: She leans against the row.` — 站立姿态的 embodiment
- ✅ 或者干脆不描写这个物理 beat,让场景默认承担

**教室、车内、餐厅、客厅这些"本该坐着"的场景**,写作时:
- 场景背景由 `@bg` 承担("教室"这个视觉概念玩家一看就懂)
- 角色互动全部在"站立姿态下"完成,不要描写坐下/起身的过渡动作
- 如果一定要有物理动作描写,选**站立姿态能做的**(靠墙 / 转身 / 手插兜 / 退后一步)

### 反模式 5:Look 名字抽象,美术和下游 agent 读不懂

`@<char> look <name>` 里的 `<name>` 是下游美术 / mapping.json 维护者 / reviewer agent 都要读的语义标签。**名字必须让不认识这个角色的人一眼明白是什么表情/姿态**。

**坏样例(模糊抽象,歧义大)**:
- `look soft` — 软什么?慈母式的软?失神的软?向人伸手的软?美术不知道画哪种
- `look amused` — 全脸大笑?半个嘴角?眉毛挑?
- `look assessing` — 上下打量?眯眼?侧脸看?

**好样例(具体可画)**:
- `look half_smile_soft` — 嘴角半弧 + 眼神温柔
- `look reaching_out_soft` — 身体前倾 + 手伸出
- `look gaze_distant_soft` — 眼神看远方 + 表情柔和
- `look quarter_smile_arrested` — 嘴角动了一半停住(Mauricio 压抑性微笑)
- `look eyebrow_raised_unimpressed` — 单眉挑 + 嘴角下撇

**命名规则**:
1. **不允许单独的抽象情感词**(`soft` / `amused` / `tired` / `defiant`)单独出现 — 至少搭一个身体部位或动作限定词
2. **同一个情感在不同场景 = 不同 look 名**:MC 对 Lily 的"soft"(慈母式)≠ 对 Easton 在车上的"soft"(伸手接住)≠ 走廊末的"soft"(沉思出神)。这是**三个不同立绘**,应该用三个不同 look 名
3. **格式建议**:`<body_part>_<action>_<emotion>` 或 `<emotion>_<qualifier>`,例:`jaw_set_defiant` / `eyes_down_reading` / `half_smile_placated`

**为什么这条重要**:美术做 mapping.json 时看到 `look soft` 会要求 episode-writer 再解释一次;reviewer 读剧本时没法判断"这个 soft 是哪种 soft";下游 agent 拿 look 名生成 prompt 时会歧义。**look 名就是剧本和美术/下游的契约,写模糊就是埋雷**。

### 反模式 6:新角色第一次登场没交代身份,玩家看得一脸懵

一个新角色第一次 `show` 然后开口说话,**玩家不知道这人是谁**(是姐姐?朋友?新同学?前男友?)。立绘能给脸,但给不了关系。

**第一次登场的前 3-5 行内必须快速交代身份**,让玩家明确:**这人和 MC 是什么关系,在这个故事里干什么的。**

交代方式(按自然度排序,挑最合适的用):

| 方法 | 例子 | 适用场合 |
|------|------|---------|
| **内心独白一句话** | `YOU: My sister Vikki. She always picks outfits like she's the older one.` | 最自然,不打断对话 |
| **对话里带出关系词** | `MOM: Vikki! Lilybeth! Breakfast!` / `VIKKI: Coming, Mom.` | 家人场景 |
| **MC 对角色直接称呼** | `MALIA: Easy, little sister.` | 亲密关系 |
| **narrator 一句话** | `NARRATOR: Jianna Miller. Easton's fiancée, technically.` | 戏份关键但 MC 此刻没法独白 |

**反例**(别这么写):
```
@vikki show considering at left
VIKKI: Black slip or red silk?
```
→ 玩家:"Vikki 谁??"

**正例**:
```
@vikki show considering at left
YOU: My sister Vikki. Two years older. Still dresses me.
VIKKI: Black slip or red silk?
```
→ 玩家:"OK 姐姐来挑衣服,懂了"

**什么人物需要这样交代**:所有带名字、会说话的非 MC 角色,第一次出场时。哪怕 bible 里交代过,玩家没读过 bible,对玩家来说全是新人。

**什么人物不需要**:背景路人(走廊路过的同学群体)/ 只露一次的 NPC / 声音/电话里的 V/O 角色(在 narrator 里交代过职责即可)。

### 反模式 7:角色已经在场了,你又 show 一次

LS 里 `@<char> show <look> at <pos>` 是"入场"指令。如果一个角色已经在场景里没 hide,你再 show 一次就是语法歧义——validator 可能报错,引擎行为不确定。

**跨 beat 换场景时**(主角贯穿全集的情况最常见):
- 上一 beat 结尾要么让她 `@<char> hide`,要么保持在场
- 下一 beat 开头如果 hide 了,用 `@<char> show <look> at <pos>`(**必带 `at <pos>`**,不带会 reject);如果没 hide,**不要再 show,用 `@<char> look <new_look>` 或 `@<char> move to <new_pos>`**

简单规则:**show 只用一次(入场)**。之后换表情用 look,换位置用 move,要让她彻底离开用 hide。

### 反模式 8:NARRATOR 里写 MC 自己的 mundane 动作 / 引擎已经 show 的东西 / 作家腔 / MC 共同动作

五条判定规则(写 `NARRATOR:` 之前问自己):

1. **这事 MC 自己会不会想到?** 会 → 改 `YOU:`
   - "他的笑又上来了" → MC 会观察到 → 用 `YOU:`
   - "YOU grip the cup till your knuckles whiten" → MC 不会从外部描述自己手的外观 → NARRATOR OK
2. **引擎能不能通过 `@<char> look` / `@sfx` / `@bg` 直接 show 出来?** 能 → 砍掉,信任引擎
   - `@easton look jaw_tight_angry` 已经 show 他下巴收紧了 → 不要再 NARRATOR "He clenches his jaw"
3. **"她/他做了 X" 里的 X 是不是情境锁死的默认行为?** 是 → 砍掉
   - 上课情境 → 默认她会走到座位,不用说"YOU walk to your seat"
   - 电话场景 → 默认他把手机贴耳朵,不用说"He lifts the phone to his ear"
   - **NARRATOR 只留给"非默认的、有情感信息的动作"**
4. **NARRATOR 里有没有作家腔?** 三个 tell-tale:
   - **比喻 / 明喻**(`as casual as straightening his own collar` / `like it was choreographed` / `smells like freshman panic`)→ 作家在外面指导玩家感受,砍比喻留纯动作
   - **主观读**("straighter than usual" / "one beat longer than they should" / "automatic")→ 这是 **MC 在解读**,改 `YOU:` 让她自己说
   - **形容副词堆叠**("gently" / "carefully" / "with quiet defiance")→ 用具体动作替代("Her fingers hover. Then lower.")
5. **主语包不包含 MC?**(**新增**)包含 → 必须改 `YOU:` 承载
   - 共同动作关键词:`together`、`they`(含 MC)、`we`、`both`、`the two of them`(一个是 MC)
   - 例:❌ `NARRATOR: Together they get him up, half-carry him through the door.` → MC 是 "they" 之一 = 违规
   - 改法 A:拆成两行,MC 部分归 `YOU:`,LI 部分归 `NARRATOR:`
     - `YOU: I hook his arm over my shoulder. On three.` + `NARRATOR: Mauricio lifts from the other side.`
   - 改法 B:整段挪 `YOU:`(最简),把合作动作完全从 MC 的第一人称感受出发
     - `YOU: His father's arm goes over my shoulder. Dead weight.` + `YOU: On three. Through the screen door.`
   - 根原则:**任何 MC 参与的动作都由 MC 的第一人称承担,NARRATOR 只管"MC 视线外"或"MC 看到的他人动作"**

### 反模式 9:写了 `@<char> look X` 但 X 永远不会显示（dead look）

**为什么这是个坑**:引擎是**单角色露出 + 说话者优先**(详见 ls-spec.md §4.2 "单角色露出可见性规则")。屏幕同一时刻只有 1 张脸,谁说话谁露出。当前不说话的角色,你给他改 look **完全不会显示**——但 06 资产管线还是会给这个 look 生成 prompt、可能渲一张图。

**典型 dead look 场景(写手最容易掉的几种)**:

```
@selena look decision_made_chin_forward
SELENA: 你说的十年。你说得对。
@luca look turned_direct                    ← Luca 没说话,turned_direct 永远看不到
SELENA: 我应该先说出来的。
@luca look eyes_wide_still                  ← 这个才是 Luca 第一次"被看见"的脸
LUCA: 七点。
```

`@luca look turned_direct` 是 dead——Luca 不说话不露出,这一行立绘玩家根本看不见。但 06 已经给它派了 prompt,可能还渲了图(实测:60 集里有 137 张这种"渲了但永远看不见"的图,约 $5.5 浪费)。

**写之前的判定流程(每写一条 `@<char> look X` 问自己)**:

1. 紧跟着的下一行,`<char>` 自己是不是会说话(dialogue / `<char>` 是 MC 的 YOU 行)? 是 → look 有效,写
2. 紧跟着是 `NARRATOR:` 或 `@pause`,而且这个 look 之后到 narrator 之间没有别人的 `@<other> look/show`? 是 → look 在 narrator 这一帧露出,写
3. 都不是 → **删掉这个 look,或者挪到 `<char>` 真正说话之前的位置**

**核心心法**:`@look` 改的是某个槽的 url,但屏幕上只显示 1 个槽。你写 look 时心里要算"它会在哪一帧被显示出来"。算不出 → 不要写。

**正反对照**:

❌ 错(luca 没说话期间改他的脸,改了等于没改):
```
@selena look chin_set_quiet
SELENA: 我去见她了。
@luca look one_corner_dropping       ← dead,玩家看不到 luca
SELENA: 她什么都没说。
@luca look gaze_lifting_steady       ← 这个才会被显示,前面那条 dead 的删
LUCA: 那她看你了吗。
```

✅ 对(只在 luca 真正露出前才换他的脸):
```
@selena look chin_set_quiet
SELENA: 我去见她了。
SELENA: 她什么都没说。
@luca look gaze_lifting_steady       ← luca 说话前最后一次 look,这一条会被显示
LUCA: 那她看你了吗。
```

**listener 反应想表达怎么办?** 两种合法手法:

- **延迟落点**:不要在 listener 还没轮到说话前给他换脸。让他在自己开口的瞬间用一个新 look,玩家"切换 → 看到他变化后的脸"自然连成"他听完反应了"
- **留给文字**:`NARRATOR: 他没说话。` 这一行会显示**最近触碰的角色**——如果你前一条是 `@luca look quiet_breath`,那这条 narrator 期间 luca 露出。但要小心:narrator 后面紧跟 `SELENA: ...` 时,luca 又被换下去了

**FINAL 前自查**:跑 `python3 skills/episode-writer/look_audit.py <你的 ep>.zh.md`。**所有 H 档 DEAD_LOOK 警告必须清零**才能 FINAL。这一条比 STATIC_AFTER_STATIC / CONFIRMATION_ONLY 那种主观启发式更硬——dead look 是确定性的"它就是看不到",不是"也许该删"。

**判例**:

```
坏:NARRATOR: Mark reaches over and tucks a wind-blown strand of YOUR hair
       behind YOUR ear — as casual as straightening his own collar.
```
问题:"as casual as straightening his own collar" 是作家比喻,替玩家下结论。

```
好:NARRATOR: Mark reaches over. Tucks a strand of YOUR hair behind YOUR ear.
   @malia look eyes_wide_startled
   MALIA: Thomas.
   YOU: Ten years. His hand knows my hair.
```
修法:砍比喻,保动作,让 MC 的 YOU 独白承担"这动作对我意味什么"的解读。

---

## ⚠️ 地点引用规约 (Layer B 契约)

### 写场景之前必查地点字典

写 `@bg set X` / `@cg show X` 之前:

1. 打开 `lunascripts/<slug>/04-entity-normalizer/locations.json`
2. 找一个 `sub_locations` 里现成的 ID 能复用就复用 —— **复用永远比新增好**
3. 真要新增(现有列表完全装不下),**先**运行:
   ```bash
   python3 _local_tools/add_location_to_04.py \
     --slug <slug> \
     --parent-id <existing_or_new> \
     --sub-id <new_id_snake_case> \
     --description "<人话描述>" \
     [--parent-name "<full name>"  # 仅当 parent 是新的]
   ```
   再写 `@bg set <new_id>`

### 自检清单(写完一集 FINAL 之后)

- [ ] 所有 `@bg set` / `@cg show` 都已检查 04 字典；新增的都已通过
      `add_location_to_04.py` 登记
- [ ] 跑过自审脚本:
      ```bash
      python3 skills/episode-writer/audit_bg_refs.py \
        --slug <slug> --episode <ep_id_final.md>
      ```
      退出码 0(无 TYPO/VARIANT/GENUINELY_NEW)才算交付

### 反模式

- ❌ 写 `@bg set big_bear_lake` 然后等下游报错 → 应该先在 04 登记
- ❌ 写 `@bg set selena_hosue_bedroom`(typo)→ 应该先 grep 04 校对名字
- ❌ 同一栋 `selena_house` 里加 `selena_house_porch_late_dusk` 当独立场景 →
   是 variant,但仍要走 add_location_to_04(每个 variant 是独立渲染产物;
   audit_bg_refs.py 的 LLM 会标 VARIANT 提示用现有 parent_id)

---

## 写完先走一遍:自查清单

每个版本写完后,交给 reviewer 之前,先自己过这一遍:

### 段落 / 句子层
- [ ] 段落都 ≤ 3 行?
- [ ] 句子短而直?没有塞修饰从句?
- [ ] 形容词副词是不是过多?能不能改成具体动词?
- [ ] 被动语态改主动
- [ ] 对话 tag 基本都是 "said"?(情绪靠立绘,不靠动词花式)
- [ ] 同一个词是否在 10 行内出现 3+ 次?换一个
- [ ] 时态一致,没乱跳?

### 情感 / 节奏
- [ ] 情绪是不是靠"她很难过"直接说?改成动作("她把杯子握紧到指节发白")
- [ ] `NARRATOR:` 旁白里有"她听到..."/"她看到..."?改成直接描写那件事(`YOU:` 内心独白里可以保留)
- [ ] Pacing 有起伏?一直高能或一直平 = 问题
- [ ] 集尾钩子两件事做到?(玩家多了解一层 + 留新问题)
- [ ] 这集冲突严重程度超过上一集?没升级 = 问题

### 剧情 / 一致性
- [ ] 和前集有矛盾没?
- [ ] 单一视角没乱跳?(谁在说话)
- [ ] 角色名容易混?首字母相似的尽量改
- [ ] Foreshadow 够暗但又不太露?
- [ ] 重复:同一件事讲了 2+ 次?留一次就够
- [ ] 废话句能不能直接删?

### 对话
- [ ] 对话大声读一遍 — 像真人说话吗?
- [ ] 有没有"说废话撑场面"的句子?砍掉

### LS 语法(项目特有)
- [ ] 每集有 `@gate` 或 `@ending` 其一,没漏
- [ ] `@episode` 和 `@next` 的 branch_key 和 seq 之间用**冒号**分隔(`main/common:01`,不是 `main/common/01`)
- [ ] `&` 并发前缀后面**不带 `@`**(写 `&sfx play phone_buzz`,不是 `&@sfx play ...`)
- [ ] `@<char> show` 必带 `at <pos>`,没漏 pos 参数
- [ ] 同一角色跨 beat 没 hide 就不要再 show,用 `@<char> look` 换表情 / `@<char> move to` 换位置
- [ ] `check { attr: ... }` 只用 BOLD / SWEET / SMART
- [ ] `dc:` 是整数(10/12/14/17 四档中选一)—— `dc: HARD` 等 symbolic 写法上游 parser 硬拒
- [ ] `bubble` 类型只用 anger/sweat/heart/question/exclaim/idea/music(不是任意词)
- [ ] 角色 ID / 场景 ID 和 `04-entity-normalizer/` 输出一致
- [ ] 教程期(E1-E2)没有 check;@option 要么 safe 要么 EASY check
- [ ] 每集 1 个 @choice 标配(tentpole 集上限 2 个)
- [ ] CRUCIAL 失败后下 1-2 个 beat 零 check(冷却期)

### 上游 parser 硬禁止(不改会 lsc validate 报错)
- [ ] **禁止 `@on success/fail`**: brave option 内必须用 `@if (check.success) { ... } @else { ... }` 分叉(`check.success`/`check.fail` 只在 brave option body 内合法)
- [ ] **禁止 `@on S/A/B/C` 在 minigame 内**: 同理改 `@if (rating.S) { ... } @else @if (rating.A) { ... }`(`rating.<grade>` 只在 minigame body 内合法)
- [ ] **禁止裸 `@signal <EVENT>`**: 必须写 kind —— `@signal mark EVENT_NAME`(布尔,SCREAMING_SNAKE_CASE) 或 `@signal int counter +1`(计数,snake_case)
- [ ] **禁止 `@bg set X crossfade`**: 合法 bg transition 仅 `fade/cut/slow/dissolve`。`crossfade` 是 `@music` 的 op 动词,不能用于 bg
- [ ] **禁止 `@if (!FLAG)`**: 上游条件语法没有一元 `!`。需要翻转时改 `@if (FLAG) { ... } @else { ... }`,把原 else 搬到 if、原 if 搬到 else
- [ ] **禁止 `@minigame <id> <ATTR> { ... }` 缺 description**: 第三位必须是英文单句描述,`@minigame puzzle SMART "Solve Priya's riddle box." { ... }`
- [ ] **禁止 `@cg show <name> { ... }` 缺 duration + content**: body 顶部两个字段必填,`duration: low|medium|high`、`content: "英文连续叙述(镜头+情节)"`
- [ ] **禁止 `at <pos>` / `move to <pos>` 用 left/center/right 之外的值**: parser 报 `[INVALID_POSITION]`。常见踩坑——`right_far` / `left_far`(早期 spec 误列,parser 从来不认)、`door` / `window` / `behind` / `near_X`(语义化目标)。舞台只有 3 槽,第三角色塞 left/center/right 任一即可;"走到门口"用 NARRATOR 旁白 + `@<char> hide` 表达,不要走 `move to`
- [ ] **禁止 `@option <ID> brave "..." { ... }` body 内缺 `@check { attr, dc }`**: parser 报 `[BRAVE_NO_CHECK]`。brave 选项**必须**有 check 块,结果分支用 `@if (check.success) { } @else { }`。如果想让玩家无门槛"勇敢一搏"——那就写 `safe`,不是 `brave`
- [ ] **禁止 `@affection / @xp / @san <N>` 中 N 是裸数字**: 必须带符号 `+N` / `-N`(parser 在数值参数位上要 SIGNED_NUMBER token)。`@affection luca 0` 不合法——想表达"不变"就把这行整个删掉,`@affection` 默认无变化

### 交付硬门槛:每集 FINAL 之前必须 `lsc compile` exit 0

光读 spec / 跑 review 都不够 —— spec 偶尔跟 parser 不同步(早期的 `right_far` 就是这种),review agent 也抓不全语法层的硬错。**只有 ls 编译器的判决是真理**。

```bash
PATH=/Users/august/go/bin:$PATH lsc compile <ep>_final.md > /dev/null
```

退出码非 0 = 不能 FINAL,把每条错都修掉再来。**不要无脑绕开**——每个错对应一个固定修法,分清楚:

- `[BRAVE_NO_CHECK] option "X" missing @check`: **先看选项内容**——如果选项有真实赌博性(可能成可能败、败了有具体代价),补 `check { attr, dc }` + `@if (check.success) { ... } @else { ... }` 双分支;如果只是想要"勇敢一搏"的语气但没有失败语义可写,改成 `safe`。**不要为了让 parser 过强行加一个空的 `@if (check.success) { ...原 body... } @else { 抄一遍原 body }`** —— 那是噪声分支,玩家感受不到张力差异。
- `parse error: unknown character action "complete" for "ending"`: **`@ending` 被嵌在 `@if / @else` 块里**——parser 不允许嵌套 ending(它把 `@ending` 误读成 `@<character> <action>`,所以错误信息长得很怪)。修法:把所有嵌套的 `@ending complete` 删掉,在 episode 块尾巴(最外层 `}` 之前)加**一个** episode-level 的 `@ending complete`。如果你确实要"按分支走完全不同的结局类型",那应该拆集走 `@gate { @if (...) @next ep_X @else @next ep_Y }`,每个 ep 自己有 top-level `@ending`。
- `expected SIGNED_NUMBER, got NUMBER`: 数值参数位用了裸 0(常见 `@affection X 0`)——表达"不变"就直接删行,`@affection` 默认无变化。
- `[INVALID_POSITION] ... invalid position "door"`(或别的语义词): `at <pos>` / `move to <pos>` 只接受 `left | center | right`。改对应的方位词,或者删 `move to` 改用 NARRATOR 旁白 + `@<char> hide`。

**为什么单独把这条列成硬门槛**:之前 60 集交付有几十处 `right_far` / `left_far` / 裸 `@affection 0` / brave-无-check / 嵌套 `@ending` 漏网,直到 dramatizer build 时才暴露,反过来再批量返工。预防成本 << 修复成本。

> 提示:`lsc fix <ep>.md --check`(干跑模式)会给出比 `lsc compile` 更精确的"在哪一行"诊断,且把可自动修复的项归类。出错时先用它定位,再用 `lsc compile` 复查终态。

### `@signal mark` vs `@signal int`(用法分野)
- `@signal mark EVENT_NAME` — **持久布尔标记**。克制使用,**必须有 reader**(`@if (NAME)`)。适用于一次性关键剧情点、隐藏剧情前置、成就解锁守卫。名字用 `SCREAMING_SNAKE_CASE`
- `@signal int counter +1` / `@signal int counter = 0` / `@signal int counter -1` — **持久整数计数器**,跨集累积。`@if (counter >= N)` 裸名查询。写入自由,用于"累计型剧情锁"(被拒 N 次、同情行为累计 M 次、N 选 M 触发隐藏分支)。名字用 `snake_case`,不能与引擎保留名(`san/cha/hp/xp`)冲突
- **不要用 mark 堆计数器**:3 个累积 mark 逻辑(`FIRST_TIME / SECOND_TIME / THIRD_TIME`)永远不如 `@signal int count +1` + `@if (count >= 3)` 清晰
- mark 跟 int 共用裸名读取命名空间(AST 统一),但**写入语法完全分开**,命名风格也分开,不会混淆

### 立绘 / Look 命名(项目特有)
- [ ] **没有"sits / sat / seated"等坐下动作**(立绘都是站的)
- [ ] `@<char> look <name>` 里的 name 不是单独的抽象情感词(`soft` / `amused` 独用 = 坏),至少搭配身体部位或动作(`half_smile_soft` / `quarter_smile_amused`)
- [ ] 同一情感在不同场景用不同 look 名(对小孩的 soft ≠ 对恋人的 soft ≠ 沉思的 soft)

### NARRATOR / YOU 视角
- [ ] **NARRATOR 里指代 MC 用大写 YOU / YOUR / YOURS**(不用 she / her / hers)
- [ ] NARRATOR 里没有 MC 自己的 mundane 动作(`YOU sit` / `YOU walk to your seat` — 情境默认,砍)
- [ ] NARRATOR 里没有引擎已经 show 的东西(`He clenches his jaw` 但 look 已是 `jaw_tight` — 砍)
- [ ] **NARRATOR 里没有比喻 / 明喻**("as casual as straightening his own collar" — 作家腔,砍)
- [ ] **NARRATOR 里没有主观读**("straighter than usual" / "automatic" — 这是 MC 在解读,改 `YOU:`)
- [ ] MC 自己会观察/感受的事用 `YOU:`,不是 `NARRATOR:`
- [ ] YOU 和 NARRATOR 比例:YOU 占多(代入感),NARRATOR 只在"引擎 show 不出 + MC 自己不会想"时用

---

## 我们的五类玩家画像(来自 bible A10 / character-architect)

写每个场景时脑子里装着:**这个场景在打哪类玩家的付费点?**

| 玩家类型 | LI trope 对标 | 她想要看什么 |
|---------|-------------|-----------|
| **Enemies to Lovers 粉** | Mauricio | "只有我能打开这面墙" — 他对全世界封闭,对我偶尔裂缝 |
| **Second Chances 粉** | Easton | "他在所有人里选了我" — 即使代价巨大,他最终选我 |
| **Friends to Lovers 粉** | Mark | "他停止了表演" — 他伪装了十年,为我一个人卸下 |
| **Forced Proximity 粉** | — | "被困在一起 → 不得不被真正看穿"(本项目不走) |
| **First Loves 粉** | — | "发现他从一开始就在"(Mauricio 的 E17 有这个味道,次要满足) |

**付费节点 = 每类玩家最想看的那个瞬间**。写 tentpole 场景时想清楚:这是在打哪一类的付费神经?

---

## 版本管理规则(必须遵守)

**每个版本必须保存为独立文件,不允许在原文件上直接修改。**

### 迭代过程中的命名(在 `scripts/` 根目录)

```
scripts/{项目名}-e{N}-v1.md             ← V1 初稿
scripts/{项目名}-e{N}-v2.md             ← V2 第一轮迭代
scripts/episode-review-e{N}-v1.md       ← V1 的 reviewer 报告
scripts/episode-review-e{N}-v2.md       ← V2 的 reviewer 报告
...
```

样例:写 E1 迭代期间,`scripts/` 里全部是 `nribi-e1-v1.md` ... `nribi-e1-v10.md` + `episode-review-e1-v1.md` ... `episode-review-e1-v10.md`。

### 达到 PASS 后归档(硬性):

1. 达到 9.0+ PASS 后,**复制**最终版 v{N} 成 `ep_{N}_final.md`(注意:**最终版命名简化**,不带项目前缀,便于跨项目一致)
2. 把所有迭代痕迹(`{项目名}-e{N}-v*.md` + `episode-review-e{N}-v*.md`)**移动**到子文件夹 `ep_{N}_old_version/`

最终 `scripts/` 目录结构:

```
scripts/
├── ep_1_final.md               ← 交付版
├── ep_1_old_version/           ← 历史痕迹
│   ├── nribi-e1-v1.md
│   ├── ...
│   ├── nribi-e1-v10.md
│   ├── episode-review-e1-v1.md
│   ├── ...
│   └── episode-review-e1-v10.md
├── ep_2_final.md               ← 下一集交付
├── ep_2_old_version/
└── ...
```

好处:
- 交付版一眼看见(根目录只有 `ep_{N}_final.md` 列表)
- 历史痕迹保留但不干扰
- 跨项目一致,迁移/审阅都方便

### 工作流程

1. 用 `Write` 输出 V1 完整剧本 → `{项目名}-e{N}-v1.md`
2. 派 `episode-writer-reviewer` 独立审查 → `episode-review-e{N}-v1.md`
3. 未达 9.0 → 根据 reviewer 清单写 V2 → `{项目名}-e{N}-v2.md`(**用 `Write` 写新文件,不要 Edit 旧的**)
4. 重复直到 PASS
5. **PASS 后归档**:
   - `cp {项目名}-e{N}-v{最终}.md ep_{N}_final.md`
   - `mkdir ep_{N}_old_version`
   - `mv {项目名}-e{N}-v*.md ep_{N}_old_version/`
   - `mv episode-review-e{N}-v*.md ep_{N}_old_version/`

### 禁止行为

- ❌ 用 `Edit` 工具在 V1 文件上直接修改然后称之为 V2
- ❌ 只输出"变更部分"而不输出完整剧本
- ❌ 跳过中间版本只输出最终版
- ❌ PASS 后不归档,让根目录继续堆 v1-v10 文件

## 交给 episode-writer-reviewer 的闭环

**本 skill 不自评**。写完一版后,自己先走一遍上面的"自查清单",然后**调用 `episode-writer-reviewer` skill** 做独立审查。

### 工作流

1. 写完 v1 用 `Write` 保存为 `*-v1.md`
2. 走一遍"自查清单"修明显问题
3. 调用 `episode-writer-reviewer` 审查 v1 → 产出 `episode-review-v1.md` 并给 0-10 总分
4. 读 reviewer 报告:
   - **总分 ≥ 9.0** → 复制一份为 `*-FINAL.md`,交付
   - **总分 < 9.0** → 根据 reviewer 的 suggest_edit 清单写 v2(`Write` 新文件,不 Edit 旧的)
5. 重复 3-4,最多 3 轮
6. 3 轮不过 → 上报用户决策,不硬冲

### 为什么不自评

过往经验:同一个 LLM 写剧本又给它打分,永远虚高。独立 sub-agent 审查能捕捉 3-5 倍更多真实问题。和 bible-reviewer / planner-reviewer 的逻辑完全一致。

## 最终输出清单

reviewer 出 PASS 后,交付以下文件:

1. **完整剧本**(LS `*-FINAL.md`)
2. **素材清单**(所有用到的 `@bg` / `@<char> look` 语义名,按类型分类)
3. **付费节点完整清单**(CRUCIAL check 位置 + 对应 tentpole 场景)
4. **迭代变更日志**(v1 → v2 → v3 改了什么,基于哪条 reviewer 建议)

## 禁止事项

- **不要在原文件上直接改**：每个版本必须是独立的完整文件
- **不要虚高打分**
- **不要使用 Episode 格式**：本 skill 只输出 LS
- **不要让所有 LI 的"被拒绝"场景都是同一种反应**
- **不要写"假选择"**
- **不要在结尾收得太干净**
- **不要超过3轮迭代**
