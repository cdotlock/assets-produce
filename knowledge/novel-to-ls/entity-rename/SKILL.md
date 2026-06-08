---
name: entity-rename
description: 对整本 lunascripts 小说的人物/地点/专有名词改名。三相流程:提候选 → 人工批准 → 机械套用 → sub-agent 审查。前置:04-entity-normalizer 完成。当用户要求版权脱敏、隐喻保持、全本改名,或进入 04.5 阶段时触发。
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Entity-Rename — 小说全本改名

## 这一步在做什么

对 `lunascripts/<book-slug>/` 下所有名字类 token 做系统性替换,保证 6 层 pipeline 产出一致。

六类 token:
1. **结构化 JSON** — `04-entity-normalizer/*.json` key/value/bible_file 改写
2. **LS token** — `@<id>`、`@bg set <id>`、`<ID>:` 大写标签
3. **散文专名** — 自然段中的人名 / 姓 / 全名(支持 CJK 上下文,`re.ASCII`)
4. **裸小写 ID** — flavor codes / 文件名引用里的 `<old_id>`(如 `malia-self-accept`)
5. **文件名** — 02/03 目录下含 ID 的文件名(如 `mc-bible-malia.md` → `mc-bible-selena.md`)
6. **DROP 别名** — rename_map 中 `null` 的 alias(用新 given name 兜底)

## 输入

- `lunascripts/<book-slug>/04-entity-normalizer/{characters,locations,alias_map}.json`(shopping list)
- `lunascripts/<book-slug>/02-character-architect/*.md`(bibles — 散文扫描源)
- `lunascripts/<book-slug>/03-entity-planner/*.md`(plans — 散文扫描源)
- `lunascripts/<book-slug>/05-episode-writer/scripts/*.md`(所有剧集 + arc review)
- `lunascripts/<book-slug>/06-asset-prompt-generator/tasks_output.json`

## 输出

`lunascripts/<book-slug>/04.5-entity-rename/`:
- `rename_candidates.md` — Phase A 人读候选
- `rename_map.json` — Phase B 定稿权威映射(永久台账)
- `apply_report.md` — Phase R 审计报告
- `.backups/<YYYYMMDD-HHMLS>/` — 完整项目备份(可回滚)

`lunascripts/<book-slug>/04-entity-normalizer/`:
- `.rename_applied` — 标记文件(给 entity-normalizer 守卫用)

## Phase A:Propose(主 agent)

### 0. 先问用户 rename **mode**

改名有两种目的,分类标准不同 —— 必须第一步就明确:

| Mode | 目的 | 对外圈角色(无姓 / 外家族)的处理 |
|---|---|---|
| **creative_iteration**(默认) | 优化主角风格、隐喻打磨 | 可 KEEP(外圈角色不影响主线) |
| **copyright_sanitization** | 版权脱敏 / 全本换名 | **全部必改** —— 单名、初始字母、表亲、朋友圈都要新名 |

如果 mode 不明确,先问用户:「改名目的是调角色风格还是版权脱敏?」

### 1. 读 shopping list

1. 读 `04-entity-normalizer/characters.json` + `locations.json` 作为 shopping list。
2. 用脚本扫漏网专名:

```bash
python3 skills/entity-rename/scripts/scan_tokens.py \
  --book-slug <slug> \
  --project-root . \
  --exclude-known-from lunascripts/<slug>/04-entity-normalizer/characters.json
```

### 2. 按 mode 分类

**creative_iteration** 模式:

| 分类 | 处理 |
|---|---|
| **MUST** | 主要角色(MC / LIs / 重要 supporting) — 提 3 个 Wattpad-风候选 |
| **SHOULD** | 可辨识地名(学校、山、海滩) — 2-3 候选 |
| **OPTIONAL** | 隐喻 token(Butterfly / Greeny / Sparrow) — 默认 KEEP,跨文件引用必须一致 |
| **KEEP** | 通用概念(homecoming / prom / lacrosse),外圈角色(单名 / 外血缘 / 初始字母) — 不动 |

**copyright_sanitization** 模式:

| 分类 | 处理 |
|---|---|
| **MUST** | **所有 characters.json 里的 human entity** — 提 3 个候选,包括:主角、家族成员、朋友圈、单名角色、初始字母(JT/MJ 这种也要换新初始字母)、外血缘表亲(要新 given + 新 surname) |
| **SHOULD** | **所有 locations.json 里的 proper-name location** — 学校、住所、餐馆、海滩(含家族冠名 mansion)|
| **OPTIONAL** | 隐喻 token(Butterfly / Greeny / Sparrow) — **可** KEEP(它们描述的是**物**不是**人**,不构成版权风险),但如确定要脱敏也可改 |
| **KEEP** | 通用概念(homecoming / prom / lacrosse / Dad / Papa) |

> **gotcha — 命名碰撞:** 如果新 given name 和某个**其他老角色**的 given name 同名(比如把 Reuben 改成 Samuel,而 Samuel 又是旧父亲的名字),机械上合法(两 old_id 映射不同 new_id),但会造成后续 scan / reviewer 的假阳性。**推荐避免**:给 copyright_sanitization 场景选新名时,额外检查新 given 是否在旧全名集合里。

### 3. 写入 `rename_candidates.md`

落到 `lunascripts/<slug>/04.5-entity-rename/rename_candidates.md`。

#### 3a. 文件顶部必写 Naming Philosophy 段

在第一个角色 block 之前,先写一段 4-6 条 bullet 的 **Naming Philosophy**,明确:
- 整本书保留的文化/地域调性(例:SoCal Latino coastal feel)
- 隐喻 token 的 KEEP / DROP 总策略(例:Butterfly/Greeny KEEP — 描述物不描述人)
- 真实地名 vs 虚构地名的处理边界(例:Big Bear / La Jolla KEEP;虚构学校 REBRAND)
- 2024–2026 Wattpad register 目标(punchier it-girl / it-boy,not classic)

这段是全本候选的"宪法",下游用户挑选时用它对齐,reviewer 也用它审。

#### 3b. 每个候选的理由必须覆盖 5 个维度

每个候选的理由 **必须**明确回应下面 5 点(短句即可,可在一行内合并,但不能整条略过):

1. **性格调性(archetype)** — 新名是否配得上角色原型?(冷感 bad boy / golden boy / 观察型艺术家 / 粘人 sunshine ...)
2. **族裔/地域(culture)** — 新名是否保留原族裔 + 地域感?(SoCal Latino / East-Coast WASP / 意大利裔 ...)
3. **Romance trope 匹配** — 名字是否撑得起该 LI 的 trope?(Enemies-to-Lovers 需硬感 / Forced Proximity 需贵族感 / Second Chances 需柔艺术感 / Friends-to-Lovers 需近人感 ...)
4. **意象/昵称延续(metaphor chain)** — 原昵称(Butterfly / Greeny / Lukey)和视觉锚点(绿眼睛 / 画家 / 摩托车)在新名里是否仍然 work?或通过 alias_mapping 单独保留?
5. **时代感(register)** — 2024–2026 Wattpad it-girl / it-boy 质感,不是 2010 年的老名

> 某条维度不适用时(例如隐喻 token `Butterfly` 本身没有族裔意义),明写 `culture: N/A — 指物不指人` 并给一句原因。**不许整条空着。**

#### 3c. 格式

```markdown
### <Old Name> (<Role>, <Trope>) — <MUST/SHOULD>
Current: <Old Full Name>
Archetype: <一行白话 — 例:"冷感外硬内忠的 bad boy,Hispanic 裔,摩托 + Impala 意象">
Candidates:
  [ ] A. <候选 A>
        <理由 — 覆盖 5 维度,pipe 分隔或自然叙述均可>
  [ ] B. <候选 B>
        <理由>
  [ ] C. <候选 C>
        <理由>
  [ ] custom: ______
Alias mapping(填 new alias / KEEP / DROP):
  - <alias> → _____
Metaphor: <跨文件链路描述 — 若 preserve_metaphor>
Notes: <说明>
```

**示例(Mauricio 的候选 A,pipe 风格):**

```markdown
  [x] A. Diego Matteo Navarro
        archetype: 短促硬音的 Latino bad-boy 名,冷感 + 忠诚底色 |
        culture: SoCal Latino 保留,Navarro 有边缘感但不 mafia-coded |
        trope: Enemies-to-Lovers 需硬音节,Diego/Matteo 都够硬 |
        metaphor: N/A — Mauricio 无 name-bound 意象(Impala/pendant 是 prop 不是 name) |
        register: Diego 是 2024–2026 Wattpad bad-boy 经典之选
```

### 4. 停止,等用户批准

告诉用户:"rename_candidates.md 已写入 `<path>`。请 review,勾选候选 + 填 alias mapping。完成后说'可以了/apply',我再进 Phase B 验证 + Phase C 应用。"

## Phase B:Human Gate + 守卫验证

1. 读用户定稿的 `rename_candidates.md`
2. 解析勾选结果,写严格 JSON schema 到 `rename_map.json`(schema 见下文)
3. 跑守卫:

```bash
python3 skills/entity-rename/scripts/validate_map_schema.py \
  --book-slug <slug> \
  --map lunascripts/<slug>/04.5-entity-rename/rename_map.json \
  --project-root .
```

退出 0 = pass(仅硬检查);否则报错停止,修 rename_map 再跑。

**硬检查(raise ValidationError,exit 1):**
- 碰撞:无两 old_id 指向同一 new_id
- 覆盖度:`alias_map.json` 中所有 alias 必须在 rename_map 显式表态
- 孤儿:rename_map 里 old_id 真实存在于 normalizer

**软检查(打印 `[WARN]`,不阻塞 exit 0):**
- 隐喻提示:`preserve_metaphor: true` 的角色出现 DROP alias 时打印一条提示
  —— 该图案在真实 book 中合法(保留 metaphor 主载体别名、DROP 无语义的姓氏别名),
  最终由 `rename-reviewer` sub-agent 做语义审

### rename_map.json Schema

```json
{
  "schema_version": "1.0",
  "book_slug": "<slug>",
  "approved_at": "YYYY-MM-DD",
  "approved_by": "<email>",
  "decisions_doc": "rename_candidates.md",
  "characters": {
    "<old_id>": {
      "new_id": "<new_id>",
      "new_full_name": "<New Full Name>",
      "alias_mapping": {
        "<old_alias>": "<new_alias>|null"
      },
      "preserve_metaphor": true|false
    }
  },
  "locations": {
    "<old_id>": {
      "new_id": "<new_id>",
      "new_full_name": "<New Full Name>",
      "sub_location_ids": { "<old_sub>": "<new_sub>" },
      "alias_mapping": { "<old_alias>": "<new_alias>|null" }
    }
  },
  "free_tokens": { "<token>": "<replacement>|null" }
}
```

**字段语义:**
- `alias_mapping.<old>: null` = DROP,用该角色 new_full_name 首 token 兜底(e.g. "Heart" → "Nova")
- `alias_mapping.<old>: "<old>"` = KEEP(同值,保留原别名)
- `alias_mapping.<old>: "<new>"` = RENAME
- `free_tokens.<token>: null` = 删除(替换为空)
- `preserve_metaphor: true` = 当该角色的 metaphor 链需要跨 alias 保留时置 true;
  校验器会在发现 DROP alias 时打印 `[WARN] metaphor hint: ...` 作为提示(非阻塞),
  最终由 `rename-reviewer` sub-agent 做语义审

## Phase C:Apply

1. Dry-run 预览:

```bash
python3 skills/entity-rename/scripts/apply_rename.py \
  --book-slug <slug> \
  --map lunascripts/<slug>/04.5-entity-rename/rename_map.json \
  --project-root . \
  --dry-run
```

向用户展示:
- `total_pairs` 总替换数
- `files[]` 每文件预计替换条数
- `high_risk_patterns[]` 长度 ≤3 字符的 pattern(短昵称风险)

2. 用户确认后 apply:

```bash
python3 skills/entity-rename/scripts/apply_rename.py \
  --book-slug <slug> \
  --map lunascripts/<slug>/04.5-entity-rename/rename_map.json \
  --project-root .
```

退出 0 = 成功。落地物:
- 所有文件就地覆写
- `.backups/<ts>/` 完整项目备份
- `04-entity-normalizer/.rename_applied` 标记

## Phase R:Review(硬检查 + 语义检查)

1. 硬检查:

```bash
python3 skills/entity-rename/scripts/validate_rename.py \
  --book-slug <slug> \
  --map lunascripts/<slug>/04.5-entity-rename/rename_map.json \
  --project-root .
```

退出 0 = pass(硬检查通过)。

**硬检查(raise ResidualFound,exit 1):**
- 残留 grep:`02-character-architect`~`06-asset-prompt-generator` 范围内无 old_id /
  old_alias / free_token。Phase 01 原著和 book-root 文档不扫(rename 本就不碰)

**软检查(打印 `[WARN]`,不阻塞 exit 0):**
- LS 完整性:`@<id>` / `@bg set <id>` 必须解析到已知实体。与 backup 做 diff,
  仅报 rename 引入的新问题(pre-existing 的 normalizer 缺口由上游修)
- 死别名:新 alias_map 中未在 02-06 corpus 出现的 alias

2. 语义检查:并发 dispatch 4 个 `rename-reviewer` sub-agent,scope 分别为:
   - `scope=normalizer-json`:检查 04 JSON 全新名 + alias 无残留
   - `scope=bibles-plans`:检查 02/03 散文 + 关系称呼 + 隐喻
   - `scope=scripts`:检查 05 LS token + speaker 对齐 + 对白散文
   - `scope=asset-prompts`:检查 06 prompt 文本 + 隐喻解释

3. 汇总 4 个 sub-agent 输出到 `apply_report.md`(含硬检查结果 + 4 个 scope 的 checklist + overall PASS/WARN/FAIL)。

## 回滚

```bash
TS=<latest-timestamp-from-.backups>
cp -rf lunascripts/<slug>/04.5-entity-rename/.backups/$TS/* lunascripts/<slug>/
rm lunascripts/<slug>/04-entity-normalizer/.rename_applied
```

## 未来集数处理

- **不涉及新角色:** writer 读 04(已新名),零干预。
- **引入新角色:** 重跑 04-entity-normalizer 扩展 characters.json → rename_map 追加新条目 → Phase C 增量跑(幂等模式自动处理)。

## 禁止事项

- **不要跳过 Phase B 的人工 gate** — 候选名必须用户看过
- **不要改 `asset-img/`** — 图像资产由用户手动重渲
- **不要把 rename_map 存 04 目录** — 永远在 04.5
- **不要忘备份** — `apply_to_project` 自动做,但手改时也要
- **不要改下游 SKILL.md**(05 episode-writer / 06 asset-prompt-generator)— 它们读 04 是契约

## Pitfalls & Lessons(真实 book 发现的坑)

记录本 skill 在 `no-rules-in-bad-ideas` book 上的全流程发现,给未来用户避坑。

### 1. `\b` 边界在两种场景下**全部挂**,必须用 `(?<![A-Za-z])...(?![A-Za-z])`

两种真实 book 失效场景:

(a) **中英混排** — `知道Malia存在` 里,`道` 和 `M` 在 Python 默认 regex 下
都是 `\w`(CJK 按 Unicode letter 算),所以 `\bMalia\b` 不匹配。解决第一步:
加 `re.ASCII` flag 让 CJK 变成非 `\w`。

(b) **下划线 / 连字符资产 token** — `theme_malia_morning`、
`malia-self-accept` 里,`_` 是 `\w`,`\bmalia\b` 还是不匹配(即使加了
re.ASCII)。解决第二步:改用**严格字母边界** `(?<![A-Za-z])x(?![A-Za-z])`,
这样 `_` / `-` / 数字 / CJK / 标点**全部**算边界,只有字母连续算
word-continue。英语词 `malice` 里的 `alice` 仍然被保护(`l` 是字母)。

`scripts/apply_rename.py` 里已经全局定义 `_BL` / `_BR` 常量,
替代所有 `\b`。validate_rename 同样用这对边界。

### 1b. 名字的**小写变体** pair 必须 emit

姓氏 / 别名 / free_token 原来只 emit Title case pair(比如 `\bHernandez\b`
→ `\bCortez\b`)。但资产 token 形如 `theme_hernandez_home_warm` 用小写,
Title case pair 匹配不到。解决:`surname`、`alias`、`free_token` 的 pair
生成时自动附带一条 lowercase twin(`\bhernandez\b` → `\bcortez\b`)。
给 free_tokens 配 `"Morhills": "Westbluff"` 时,引擎自动派发
`morhills` → `westbluff` 用于 `theme_morhills_halls`。

### 1c. 06 JSON 的**嵌套 dict keys** 要递归 rename

`06/tasks_output.json` 在多个层次用 char_id 做 dict key:
`series_character_prompts.alice`、`ep_character_sprites.ep1.alice`、
`sprite_id_mapping.alice_neutral`。原来的 `_apply_to_prompts_json` 只特判
`series_character_prompts` 顶层;现在递归扫每一层 dict 的 key,只要匹配
old_id(完全相等 **或** 以 `old_id_` 开头)就 rename。

### 2. copyright_sanitization 模式必须 **mode 先行**

本 skill 早期版本默认 `creative_iteration` 语义 —— "家族树外 KEEP"、
"单名 KEEP"、"初始字母 KEEP"。做版权脱敏时这套直接漏掉 7-10 个
角色(Christian Vazquez / Elias Hall / Maddie / Tyler / Leilani / JT / 姐妹
given name)。**Phase A 第 0 步必须先问 mode**,分类表跟着 mode 切换。

### 3. sub_location **desc 值**也要文本转换

`locations.json` 里 `"sub_locations": { "alice_house_bedroom": "Alice's bedroom" }`
—— 代码早期只 rename 了 KEY 没处理 VALUE,"Alice's bedroom" 变成 renamed book
里的陈年 Easter egg。**规则**:JSON 的**所有用户可读字符串 leaf** 都要过
`apply_to_text`,不只是 JSON 路径。

### 4. bible 文件名 + `bible_file` 字段要**双改**

`mc-bible-malia.md` → 既要在磁盘上 rename,也要同步更新
`characters.json.<char>.bible_file` 值,否则下游按 `bible_file` 找文件会 404。
`_rename_pipeline_files` 用 `apply_to_text` 对 basename 跑一遍完成这件事。

### 5. 裸小写 `<old_id>` 也要替换(不只是 `@<id>`)

Bible / plans 里常见 flavor codes 形如 `malia-self-accept` / `malia-still-running`
(ending 分支标签)和文件名引用如 `see mc-bible-malia.md`。早期只有 `@malia`
(LS token)和 `MALIA`(speaker label)被 rename,裸 `malia` 漏过。**规则**:
char entry 生成一条 `id_lower` pair(`\b<old_id>\b` → `<new_id>`),word boundary
自动保护英语词(`malice` 里的 `alice` 不会误伤)。

### 6. 命名碰撞 gotcha(reuben → samuel,而 samuel 是另一老角色)

`samuel` 既是旧父亲 old_id,又是 reuben 的 new_id。机械上合法
(两 old_id 映射**不同** new_id,`_check_id_collisions` 不触发),但深度 grep
扫描时 "Samuel" 会被当作 old_token 报出来 —— 其实那是 reuben 的新名。
**建议**:Phase A 选候选时,避免把新 given 取为其它角色的旧 given。
schema 检查不强制阻止,但 rename-reviewer sub-agent 应该指出。

### 7. 05-episode-writer/scripts/ 的 glob 必须 `*.md`,不是 `ep_*_final.md`

真实 book 在 `scripts/` 下有 `arc-review-prescriptions.md`、
`arc-review-prescriptions-r2.md` 等迭代笔记,和剧集文件同目录。glob 窄了这些
会漏扫,里面的角色名还是旧名。现已修复为 `rglob("*.md")`。

### 8. check_residual 的 scope 只扫 rename-owned 目录(02-06)

Phase 01 原著引用(`01-novel-evaluator/*.md`)、book-root 文档
(`README.md` / `signal_checklist.md`)**不碰** —— rename 本就不应改原著引文。
`_BACKUP_SUBDIRS` 定义了 rename owns 的 5 个子目录,validator 跟这个走。

### 9. `preserve_metaphor` 是软提示不是硬 guard

原设计:`preserve_metaphor=true` 时禁止任何 DROP alias。真实案例(Malia:
Butterfly KEEP + Greeny KEEP + Myers DROP)需要同时保留 metaphor 主载体
**并** drop 无语义的姓氏别名。硬 guard 太严格,现在降级成
`collect_metaphor_warnings` —— 打印 `[WARN] metaphor hint: ...` 给 reviewer
看,不阻塞 apply。

### 10. `check_ls_integrity` 要 diff 备份

Pre-existing LS 数据缺口(`@jared` 在 rename 前就没在 characters.json 登记)
不是 rename 的锅。check_ls_integrity 会从最近一次 `.backups/<ts>/` 里读
baseline,只报告 rename **新引入**的问题 —— 老缺口由 entity-normalizer
修,不由 entity-rename 背。

### 11. 资产 token 命名约定影响 rename 覆盖

Asset token 习惯用 `<verb>_<name-like>_<context>` 结构
(`theme_malia_morning`、`theme_hernandez_home_warm`、`theme_morhills_halls`)。
rename 要同时覆盖:(a) 人物 given / surname 的 lowercase、(b) free_tokens
的 lowercase、(c) 嵌套 JSON dict key。漏任一层都会留 "chapter 名 + 旧名"
的混合 token,玩家看不到但 asset 渲染走 OSS mapping 时会 404。

### 12. Phase A 候选理由必须硬性覆盖 5 维度(不能只靠 LLM taste)

早期 Phase A 只要求 "3 候选 + 一行理由",具体考虑什么维度留给 LLM 自由发挥。
用强 LLM + 完整 bible 上下文时,它会自动考虑性格调性、族裔连贯、trope
匹配、意象延续、时代感 —— 生成的候选质量不错。

**风险**:换一个弱 LLM、bible 被截断、或者 context 被压缩时,这些维度可能
悄悄掉几条,用户选完发现 Mauricio 变成 "Ethan"(轻飘飘不 bad boy)或者
Malia 变成 "Emily"(族裔丢了),已经写进 rename_map 才察觉。

**修复**:Phase A 4b 硬性要求每个候选理由必须覆盖 5 个维度(archetype /
culture / trope / metaphor / register),N/A 也要明写原因,不许整条空着。
加 Naming Philosophy 顶部段做全本宪法,和示例 candidate 对齐格式。把"软
taste"硬化成"必答题",弱 LLM 也会被逼着想完整。
