---
name: entity-normalizer
description: 基于 character-architect 的 bible 和 entity-planner 的 plan,把所有角色和场景归一化成 episode-writer 和 asset-prompt-generator 可以直接用的标准 ID。输出角色 ID 表(含别名映射)和场景 ID 表(建筑级→房间级)。前置条件:bible PASS + plan PASS。当需要为 episode-writer 准备统一的实体索引时触发。
allowed-tools: Read, Write, Grep, Glob
---

# Entity Normalizer — 把角色和场景变成剧本能用的标准 ID

## 这一步在做什么

episode-writer 写剧本时会写 `@mauricio show neutral_smirk at left` 和 `@bg set school_hallway fade`。这里的 `mauricio` 和 `school_hallway` 就是 entity ID。

本 SKILL 的工作:
1. 从 bible 和 plan 里收集所有出现过的角色和场景
2. 给每个角色一个唯一的、小写的、无空格的 ID(episode-writer 和 asset-prompt-generator 都用这个 ID)
3. 给每个场景/地点一个唯一的 ID,按"大场景 → 房间"两层组织
4. 列出每个角色/场景在原著里的别名,这样 episode-writer 写的时候知道"Reyes house = mauricio_house"

## 与 entity-rename 的协作(重要)

若 `lunascripts/<book-slug>/04-entity-normalizer/.rename_applied` 存在,说明本目录已被 `entity-rename` 覆写为新名。

**此情况下:**
- 重跑本 skill 会**重置 rename**(变回原著名字)
- 必须用户显式加 `--force` 或说"重跑 04 并接受 rename 重置"
- 否则 refuse to run,打印:"04 has been renamed via entity-rename. Re-running will reset to original names. Add --force if intended."

### 何时需要重跑 04

- 新增 ep_N 引入新角色,需要扩展 `characters.json`
- bible 修改,需重建规范化

**这两种情况都必须重跑完 04 后再跑一次 04.5 Phase C 增量模式**,否则新写集数会带原名。

## 输入

1. **Bible 包**:`lunascripts/{book-slug}/02-character-architect/`(MC bible + LI bibles + supporting-cast)
2. **Plan 包**:`lunascripts/{book-slug}/03-entity-planner/`(00-structure + 01-common + route files)
3. **小说全文**(可选,用于补充 bible 和 plan 里没提到的别名和场景细节)

**不要从头通读小说提取角色。** 角色在 bible 里已经定好了。小说只用于查别名("这个角色在原著里还被叫过什么")。

## 第一步:从 bible 提取角色清单

读 MC bible + 每个 LI bible + supporting-cast,提取:

- 每个角色的全名(如 `Mauricio Miguel Reyes`)
- 每个角色在 bible 里提到的昵称/别名(如 `Myers`、`Butterfly`)
- 每个角色的关系身份(如"MC 的父亲"、"Mauricio 的弟弟")

给每个角色分配一个 **LS entity ID**:
- 全小写,无空格,用下划线分隔
- 主角用名(如 `malia`)
- LI 用名(如 `mauricio`、`easton`、`mark`)
- 配角用"关系_名"(如 `samuel`、`enrique`、`josie`、`khloe`)
- 同名冲突用姓区分(如 `mr_thomas`、`mrs_king`)

## 第二步:从 plan 提取场景清单

读 01-common + 各 route 文件,提取所有"场景 beat"里提到的地点:
- 学校走廊、课堂、食堂、停车场
- 各个角色的家(Malia 家客厅、Mauricio 家阁楼、Mark 家书房...)
- 特殊场景(Big Bear 木屋、La Jolla 海边、Morhills Elites Club...)

按**两层结构**组织:
- **大场景**(建筑/区域级):如 `school`、`malia_house`、`mauricio_house`
- **子场景**(房间/具体位置级):如 `school_hallway`、`school_cafeteria`、`malia_house_bedroom`

给每个场景分配 **LS bg ID**:
- 全小写,下划线分隔
- 格式:`{大场景}_{子场景}`(如 `mauricio_house_attic`、`school_parking_lot`)
- episode-writer 写 `@bg set mauricio_house_attic fade` 时用的就是这个 ID

## 第三步:从小说补充别名(可选)

如果需要更完整的别名列表,Grep 小说目录查:
- 角色还被叫过什么(比如 Malia 在某章被叫 "Hernandez",在某章被叫 "that Hernandez girl")
- 场景还被怎么描述过(比如 "Reyes house" = `mauricio_house`,"the lake" = `big_bear_lake`)

**别名筛选规则**:
- 保留:名字变体(Malia → Mal)、独特绰号(Butterfly、Greeny)、特定身份称呼(Mrs. King)
- 不保留:通用爱称(baby, sweetheart)、通用代词(她、他)
- 每个角色最多 5 个别名

## 输出

输出到 `lunascripts/{book-slug}/04-entity-normalizer/`:

### `characters.json`

```json
{
  "characters": {
    "malia": {
      "full_name": "Malia Sarai Hernandez",
      "role": "MC",
      "aliases": ["Mal", "Hernandez", "Butterfly", "Myers", "Greeny"],
      "bible_file": "mc-bible-malia.md"
    },
    "mauricio": {
      "full_name": "Mauricio Miguel Reyes",
      "role": "LI",
      "aliases": ["Reyes"],
      "bible_file": "li-bible-01-mauricio.md"
    },
    "easton": {
      "full_name": "Easton Edwin King",
      "role": "LI",
      "aliases": ["East", "King"],
      "bible_file": "li-bible-02-easton.md"
    }
  }
}
```

说明:
- `"malia"` 这个 key 就是 LS 里的 entity ID,episode-writer 写 `@malia show worried at left` 用的就是它
- `aliases` 是给 episode-writer 和 asset-prompt-generator 的参考——"原著里这个角色还被叫什么"
- `bible_file` 方便下游 skill 回查

### `locations.json`

```json
{
  "locations": {
    "school": {
      "full_name": "Morhills Academy",
      "sub_locations": {
        "school_hallway": "School hallway",
        "school_cafeteria": "School cafeteria",
        "school_gym": "School gymnasium",
        "school_parking_lot": "School parking lot",
        "school_ap_classroom": "AP English classroom"
      },
      "aliases": ["Morhills High", "the academy"]
    },
    "malia_house": {
      "full_name": "Hernandez family home",
      "sub_locations": {
        "malia_house_living_room": "Living room",
        "malia_house_kitchen": "Kitchen",
        "malia_house_bedroom": "Malia's bedroom",
        "malia_house_porch": "Front porch"
      },
      "aliases": ["Hernandez home", "her house"]
    },
    "mauricio_house": {
      "full_name": "Reyes family home",
      "sub_locations": {
        "mauricio_house_bedroom": "Mauricio's bedroom",
        "mauricio_house_attic": "Attic (grandpa's memorabilia)",
        "mauricio_house_garage": "Garage (Impala + motorcycle)"
      },
      "aliases": ["Reyes house", "next door"]
    }
  }
}
```

说明:
- sub_locations 的 key(如 `mauricio_house_attic`)就是 episode-writer 写 `@bg set mauricio_house_attic` 时用的 ID
- asset-prompt-generator 用同一个 ID 生成对应的背景图提示词

### `alias_map.json`

一个扁平的"别名 → 标准 ID"映射表,给 episode-writer 快速查:

```json
{
  "character_aliases": {
    "Mal": "malia",
    "Hernandez": "malia",
    "Butterfly": "malia",
    "Myers": "malia",
    "Greeny": "malia",
    "Reyes": "mauricio",
    "East": "easton",
    "King": "easton",
    "Thomas": "mark"
  },
  "location_aliases": {
    "Hernandez home": "malia_house",
    "Reyes house": "mauricio_house",
    "Morhills High": "school",
    "the academy": "school",
    "next door": "mauricio_house"
  }
}
```

## 与下游的衔接

- **episode-writer** 写 `@mauricio show <look> at <pos>` — `mauricio` 来自 characters.json 的 key
- **episode-writer** 写 `@bg set mauricio_house_attic` — `mauricio_house_attic` 来自 locations.json 的 sub_location key
- **asset-prompt-generator** 为每个 character entity ID 生成立绘提示词,为每个 location entity ID 生成背景图提示词
- **LS 解释器** 用 mapping.json 把 entity ID 翻译成 OSS URL

## 禁止事项

- **不要虚构别名**:只用 bible 里出现的 + 小说里 Grep 到的
- **不要从头通读小说**:角色在 bible 里已经定好了,场景在 plan 里已经列好了,小说只补充别名
- **不要留背景板角色**:只保留 bible 和 plan 里有名字的角色(supporting-cast 里列的人)
- **不要 ID 冲突**:两个角色不能共用一个 entity ID;两个场景不能共用一个 bg ID
- **不要用中文做 ID**:`entity ID` 必须是英文小写下划线,因为 LS 语法只认英文 token
- **检测到 `.rename_applied` 时不要默认重跑**:先警告用户,让其确认是否覆盖 rename
- **不要手改 `alias_map.json`**:它是派生产物,改了 canonical 要跑 regen(见下)

## 验证与 alias_map 派生

`alias_map.json` 是 **派生产物**,不要手维护。权威来源永远是 `characters.json` / `locations.json` 里各 entry 的 `aliases` 数组。手改 alias_map 会漂移(真实书 `no-rules-in-bad-ideas` 就攒出 `Mrs. Ashby` / `MJ` 指向 canonical `aliases: []` 的孤儿键)。

### `scripts/regenerate_alias_map.py`

改完 `characters.json` 或 `locations.json` 后跑:

```bash
python3 skills/entity-normalizer/scripts/regenerate_alias_map.py \
  --book-slug <slug> --project-root . [--dry-run] [--no-validate]
```

- 默认:重建 alias_map.json(按 key 字母序),再跑 validate_normalizer 确认一致
- `--dry-run`:只打印新旧对比,不写盘
- 两个 canonical entry 共享同一个 alias → 硬失败,不静默覆盖

### `scripts/validate_normalizer.py`

交给 04.5 / 05 之前的最后一道闸。硬守:

1. 三个 JSON 的 schema 形状
2. `role` 枚举 + 条件字段(MC/LI 要 `bible_file`;supporting/minor 要 `relation`)
3. sub_location key 以 `{parent_id}_` 开头,且全局唯一
4. MC/LI 的 `bible_file` 在 `02-character-architect/` 下真实存在
5. alias_map 与 canonical aliases 双向一致

```bash
python3 skills/entity-normalizer/scripts/validate_normalizer.py \
  --book-slug <slug> --project-root .
# [OK] entity-normalizer validation passed
```

失败时退出码 1,`[FAIL] <原因>` 写 stderr。
