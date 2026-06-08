---
name: episode-writer-reviewer
description: 对 episode-writer 产出的 LS 剧本做独立审查。强制通过 Task 工具 spawn 独立 sub-agent 执行,用新鲜视角检查剧本是否兑现了 bible + plan + Wattpad 写作原则 + LS 语法规则。输出 episode-review-report.md 并给出 0-10 打分。前置条件:episode-writer 已产出一版剧本。当 episode-writer 写完一版剧本需要独立审查时触发。
allowed-tools: Read, Grep, Glob, Write, Task
---

# Episode Writer Reviewer — 剧本独立审查

## 核心原则:不自审,派独立 sub-agent

这个 skill 和 bible-reviewer / planner-reviewer 一样,强制通过 `Task` 工具 spawn 一个 `general-purpose` 独立 sub-agent 来做审查。主 agent 不亲自审。

**为什么**:同一个 LLM 写剧本又打分,有严重的自我保护偏差。哪怕明知扣分标准,对自己写的东西也会下意识"网开一面"。实测:同一次流程里,主 agent 自审遗漏的问题,独立 sub-agent 能抓出 3-5 倍。

**主 agent 的唯一职责**:组装清晰的 prompt 给 sub-agent,包含"审查协议" + 输入文件清单,然后把返回的 review 保存成 `episode-review-{episode_id}.md`。

---

## 输入

1. **剧本文件**:要审查的 LS 文件(通常 `scripts/*-v1.md`)
2. **Bible 包**:`lunascripts/{book-slug}/02-character-architect/`(人设核对)
3. **Plan 包**:`lunascripts/{book-slug}/03-entity-planner/`(场景 beat 核对 + tentpole 清单)
4. **Entity 归一化**:`lunascripts/{book-slug}/04-entity-normalizer/`(角色 ID / 场景 ID 核对)
5. **episode-writer SKILL**(读里面的"自查清单"和"互动游戏≠小说"当扣分依据)
6. **LS 规范**:`skills/episode-writer/ls-spec.md`(语法合规)

## 执行步骤(主 agent)

1. 用 `Glob` 确认所有输入文件存在 — 少一个直接 FAIL
2. **先跑硬性 validator(必须 0 violations 才进入 sub-agent 审查)**:
   ```bash
   python3 skills/episode-writer/check_narrator_pov.py \
     lunascripts/<book-slug>/05-episode-writer/scripts --fail-on-violation
   ```
   exit code 非 0 直接 FAIL,把违规清单贴回去要 episode-writer 修。`--fix` 可以一键修 NARRATOR 第二人称(EN+ZH 都覆盖),但 `option_too_long` 必须人工重写 label。这一步比 sub-agent 审查便宜 100 倍,先过这道门再说。
3. 用 `Task` 工具 spawn `general-purpose` sub-agent,prompt 包含下面的"审查协议"
4. 等 sub-agent 返回,保存到 `episode-review-{episode_id}.md`
5. 主 agent 把总分 + 必修问题清单报给 episode-writer 或用户

**为什么强制 validator 第一步**:0429 反馈实测 — episode-writer 和这个 reviewer 都早就把"NARRATOR 第二人称"写进硬规则了,但 60 集交付里仍漏 ~370 处。LLM 自查在大量重复模式上不可靠;脚本扫一遍是确定性的。这一步上线之后,sub-agent 可以专注审查 plot/character/pacing 这种主观维度。

---

# Sub-Agent 审查协议(主 agent 喂给 Task 的 prompt 主体)

你是 episode `{episode_id}` 的独立 reviewer。不知道其他集子写了什么,不要去看不该看的文件。

你的任务:**模拟一个北美 18-24 岁女性玩家**,打开游戏玩这一集,用新鲜眼光审查这一集的质量。

---

## 读这些文件(仅这些)

- 剧本:`{剧本文件路径}`
- Bible 包:对应 LI 的 bible + MC bible(核对人设)
- Plan:`01-common.md` + 对应路线的 `route-*.md`(核对场景 beat 是否兑现了 plan)
- Entity 归一化:`04-entity-normalizer/*.json`(核对角色 / 场景 ID)
- episode-writer SKILL 的"自查清单"章节(作为扣分依据)
- LS 规范(`ls-spec.md`)

## 6 个审查维度(每个 0-10 打分)

### 维度 1:Bible 忠实度
- 角色说话方式 / 反应模式符合 bible A2 行为模式吗?
- MC 的 signature 台词("I'm Malia fucking Hernandez"、"Fuck this" 等)在合适的地方出现?
- LI 被拒绝的反应是否符合 bible A8?(Mauricio 冷硬走开 / Easton 温柔等 / Mark 优雅撤回 — 三种完全不同)
- 秘密(bible A7)有没有提前泄露?

### 维度 2:Plan 兑现度
- 场景 beat 和 plan 里写的一致吗?关键 @signal / @affection / @butterfly 都有触发吗?
- Tentpole 场景有没有被写成 tentpole 级("截图能发推"的密度)?
- CRUCIAL check 位置符合 plan?fail 分支是真 heartbreak 还是偷工减料?
- 集尾钩子是 plan 里规定的那个悬念吗?

### 维度 3:句子层质量(参照 episode-writer SKILL "句子层铁律")
- **段落长度**:段落都 ≤ 3 行? 大段文字会让玩家跳读
- **句子简洁**:主谓靠近?没塞修饰从句?
- **形容词副词过多**:有没有"饥饿地吃着"这种副词+弱动词?应该改成具体动作动词
- **被动语态**:被动句改主动了吗?
- **Dialogue tag**:默认用 said,没有花式替换("咆哮/厉声/低吼")?情绪靠立绘 `@<char> look`
- **Filter words 滥用**:`NARRATOR:` 旁白里有没有"她听到/她看到"这种隔一层的写法?(`YOU:` 内心独白里可以保留)
- **全英文**:所有 `CHARACTER:` / `YOU:` / `NARRATOR:` / `@text` 是英文(butterfly/注释 可中文)?

### 维度 4:互动游戏体感(参照 episode-writer SKILL "互动游戏≠小说")
- **对话 vs 旁白比例**:对话 + `YOU:` 占大头?`NARRATOR:` 只在引擎 show 不出的时候用
- **视觉冗余**:有没有"他皱起眉头"但 LS 里已经 `@<char> look <angry>` 了?这种双重描述要砍
- **NARRATOR 里 MC 的人称(硬性,跑脚本)**:所有指代 MC 的 pronoun 用**大写 YOU / YOUR / YOURS**,不能用 she / her / hers / Selena(中文同样:`她` / `她的` / Selena 指 MC 时统一用大写 YOU/YOUR)。**审稿前必须先跑 `python3 skills/episode-writer/check_narrator_pov.py <scripts_dir> --summary-only`**,任何 `narrator_mc_ref` 或 `narrator_mc_name` violations = 直接封顶 7 分,reviewer 必须把违规清单贴回去要求修。脚本对 Elena/Ximena/Sofia/Camila/... 这些非 MC 女性角色做了主语消歧白名单,误报极少。
- **NARRATOR vs YOU 视角**:
  - NARRATOR 里有没有 MC 自己的 mundane 动作(`YOU sit` / `YOU walk to your seat`)?情境默认行为要砍
  - MC 自己能观察到 / 会感受到的事,是不是被错放在 NARRATOR 里了?应该改 `YOU:`
- **NARRATOR 作家腔**(**上一轮漏查,新增**):
  - **比喻 / 明喻**("as casual as straightening his own collar" / "smells like freshman panic" / "like it was choreographed")— 作家替玩家下结论,砍
  - **主观读**("straighter than usual" / "automatic" / "one beat longer than they should")— 这是 MC 在解读,应该改 `YOU:`
  - **形容副词堆叠**(3+ 个修饰词描述一个动作)— 用具体动作替代
- **立绘站立规则**:剧本有没有出现"sits / sat / seated / 坐下"?立绘都是站的,这种描述不成立,必须砍
- **新角色登场交代身份**:每个带名字的非 MC 角色第一次 `show` 后 3-5 行内是否明确了"这人和 MC 是什么关系"?漏了就扣分
- **场景节奏**:一集里有明确的 beat 变化(对话 → 场景切 → 选择 → 反应)?还是只在一个场景里原地踏步?
- **开场(如果是 E1)**:前 3 个 beat 是否命中"截图发推"密度?logline 4 要素里出现 ≥ 2 个?
- **没出现 MC 醒来开场**?(大忌)

### 维度 5:选择设计 & check 合规
- **@choice 是真选择还是假选择?**(两个选项结果一样 / 一个明显更对 = 假选择)
- **@choice 和 @option 区分清晰**:
  - `@choice` = 结构块;**每集 1 个标配,tentpole 上限 2 个**
  - `@option` 分 `safe`(无 check)/ `brave`(带 check)
  - E1-E2 教程期:@option 要么 safe 要么 EASY check,不允许 HARD/CRUCIAL
  - **`@option` label 长度(硬性,跑脚本)**:EN ≤ 80 chars,ZH ≤ 60 visible width。`check_narrator_pov.py` 自动检测;违规即按钮文本"把整段台词当 label"是典型错误,reviewer 见到 `option_too_long` 直接打回,要求把对白挪进 option block 内,label 留短动作 gist。
- **选项后果是关系变化还是信息解锁?**关系变化才是真互动游戏的逻辑
- **check 系统合规**:
  - 属性只有 BOLD / SWEET / SMART(无 CHA / WIS)
  - 难度是字符串 EASY / NORMAL / HARD / CRUCIAL(无数字)
  - CRUCIAL 场景失败是真 heartbreak 不是 success-80%
  - CRUCIAL fail 后下 1-2 个 beat 零 check
  - 纯情感姿态 2 选 1 不该有 check
- **一集 `@choice` 数量**:1 个是标配,2 个是 tentpole 上限,≥ 3 个 = 设计过载

### 维度 6:LS 语法合规 & 下游契约

**语法硬错**(逐条核对):
- 每个 `@episode` 根块结构完整
- **每集必须有 `@gate` 或 `@ending` 其一**,不能都没有,也不能都有
- `@episode` / `@next` 里 branch_key 和 seq 用**冒号**分隔(`main/common:01`)
- `&` 并发前缀后面**不带 `@`**(`&sfx play xxx` 不是 `&@sfx play xxx`)
- `@<char> show <look> at <pos>` 必带 `at <pos>`
- 同一角色跨 beat 没 hide 就不要再 show(用 look / move 替代)
- `bubble` 类型只能是 anger/sweat/heart/question/exclaim/idea/music
- 角色 ID 和 `04-entity-normalizer/characters.json` 的 key 一致
- 场景 ID 和 `04-entity-normalizer/locations.json` 的 sub_location key 一致
- `@if (...)` 条件语法合法(choice 用 `A.fail` 不是 `A fail`,其他类型按 ls-spec 5 种)
- `@signal` / `@affection` / `@butterfly` 用法正确

**Look 命名规范**(下游契约):
- **`@<char> look <name>` 的 name 不能是单独抽象情感词**(`soft` / `amused` / `assessing` 独用 = 坏)
- Look 名应该**具体可画**:至少搭身体部位或动作(`half_smile_soft` / `quarter_smile_arrested` / `gaze_down_reading` / `jaw_set_defiant`)
- **同一情感在不同场景用不同 look 名**(MC 对 Lily 的 soft ≠ 对 Easton 车上的 soft ≠ 走廊末的 soft,应该是三个不同 look 名)
- 理由:look 名是剧本给美术 / mapping.json / 下游 agent 的契约,模糊命名 = 埋雷

**打分参考(维度 6)**:
- 任何 1 个 LS 硬错 = 封顶 7
- 任何 3+ 处 look 单词抽象命名 = 封顶 8
- 全部语法 clean + look 名全部具体 + 下游契约完整 = 可给 10

---

## 打分规则 — 0 到 10

每个维度 0-10 整数分:

| 分数 | 含义 |
|------|------|
| 10 | 无可挑剔,玩家会发社交媒体安利 |
| 9 | 非常好,小瑕疵不影响整体。**这是上线门槛** |
| 8 | 不错但有改进空间。上线会有中等玩家差评 |
| 7 | 勉强可用,会掉评分 |
| 6 | 明显问题,必修 |
| ≤ 5 | 严重问题,这块要重写 |

### 打分纪律

- 觉得 9 但说不出为什么 = 实际 7-8
- 整个 review 找不出问题 = 你没认真看,回头再来
- 省 token 打高分 = 下游重写成本翻倍,**诚实打分比粉饰 PASS 更省资源**
- 给 9+ 必须具体说"这集通过 X 做到了 Y 效果"

**维度 < 9 必须附修改建议**,每条格式:
- `file` / `location`(第几行 / 哪个 @choice / 哪段对话) / `current`(原内容引用) / `problem`(具体问题) / `suggest_edit`(具体怎么改,可操作)

### 总分计算

6 个维度算术平均,四舍五入到 1 位小数。

---

## 输出格式

写成 `episode-review-{episode_id}.md`:

```markdown
# Episode Review — {episode_id}

## 总分: X.X/10

**判决**:
- ≥ 9.0 → **PASS**,可交付
- 7.0 - 8.9 → **CONDITIONAL**,必须按修改建议 Edit 后重审
- < 7.0 → **FAIL**,某些维度要重写

## 6 维度打分

| 维度 | 分数 | 简述 |
|------|------|------|
| 1. Bible 忠实度 | X/10 | ... |
| 2. Plan 兑现度 | X/10 | ... |
| 3. 句子层质量 | X/10 | ... |
| 4. 互动游戏体感 | X/10 | ... |
| 5. 选择设计 & check 合规 | X/10 | ... |
| 6. LS 语法合规 | X/10 | ... |

## 修改建议(< 9 维度必附)

按严重度排序:
- **P0**(阻塞上线):语法硬错误 / bible 人设违背 / CRUCIAL fail 偷工减料
- **P1**(严重影响体感):大段旁白 / 假选择 / 句子层多处违规
- **P2**(小问题,修了更好):偶尔形容词堆砌 / 个别 filter words

| ID | 优先级 | location | current | problem | suggest_edit |
|----|-------|---------|---------|---------|--------------|
| ... |

## 亮点(≥ 9 维度)

具体说"X 处通过 Y 方式做到了 Z 效果"。
```

---

## 元规则:发现新反模式时怎么办

Review 过程中如果发现某个写作问题,但它**不符合已有的任何扣分类型**:

1. 先问:这背后有没有**通用反模式**?(适用于任何 romance VN 项目)
2. 如果能抽象成通用规则,建议把它加到 episode-writer SKILL 的"自查清单"或 reviewer 的"打分依据"
3. 如果抽象不出来,只是这一处具体问题,不建议加规则 — 在 `suggest_edit` 里给具体修改建议就够

**目标是让规则清单"活"而不是"炸"**:每条都是可复用的抽象原则,不是 specific case 的累加。

---

## 禁止事项

- **不要凭感觉给 PASS** — 每个维度 ≥ 9 的分数必须有具体理由
- **不要跳过维度** — 6 个维度都要打分
- **不要修改剧本本身** — reviewer 只出报告,修改回给 episode-writer
- **不要读该集以外的其他集剧本** — 保持该集 fresh-eyes 视角
- **不要给没解释的高分** — 高分是说"这里做得好",不是"我懒得挑"
