# assets-produce ↔ Moonshort IDE 工作区契约

> 设计文档（非 phase plan）。2026-05-18。
> 背景：Moonshort IDE（同事做的 VS Code 套壳，将来由本人一并维护）通过打开一个本地工作区文件夹消费 assets-produce 产物。本文件定死「assets-produce 这边要保证什么，IDE 才能正确认素材」。其余（IDE 本身、Notion、跨机器）不在 assets-produce 职责内。

---

## 1. 一句话结论

配合 IDE 需要的能力，assets-produce 大部分已经有了（REST API Phase 8、oss-put Phase 12、素材编排 Phase 14）。**唯一必须保证的是「工作区契约」对得上 IDE。** 契约 = 下面 4 条。

---

## 2. 工作区结构（依据 `feature_parade` demo 实测）

```
<workspace>/
├── .claude/                 # agent 作用域配置
├── assets/                  # 素材字节，按 kind 分子目录（决策 B）
│   ├── characters/<name>/<look>.<ext>     # 角色：name × 表情
│   ├── backgrounds/<name>.<ext>
│   ├── cg/<name>.<ext>
│   ├── music/<name>.<ext>
│   └── sfx/<name>.<ext>
├── mapping.json             # 唯一契约：name+kind → 位置
├── <script>.md              # MSS 剧本
├── <script>_output.json     # MSS 编译产物
└── README.md
```

`cover` / `shot_image` / `shot_video`（视频管线 kind）当前 VN 工作区用不到，**用到再加目录，不预建空目录**。

## 3. `mapping.json` 契约（命脉）

IDE 与 MSS 解释器只认 `mapping.json`，不靠扫文件夹。基线 schema（与 MSS wiki `concepts/mss-format` 的 `assets.characters` 一致）：

```jsonc
{
  "assets": {
    "characters": { "malia": { "worried": { "kind": "character_portrait", "loc": "assets/characters/malia/worried.png" } } },
    "backgrounds": { "cafeteria": { "kind": "scene_bg", "loc": "assets/backgrounds/cafeteria.png" } },
    "cg":          { "window_stare": { "kind": "cg", "loc": "oss://bucket/cg/window_stare.mp4" } },
    "music":       { "tense_strings": { "kind": "music", "loc": "assets/music/tense_strings.mp3" } },
    "sfx":         { "door_slam": { "kind": "sfx", "loc": "assets/sfx/door_slam.mp3" } }
  }
}
```

> ⚠ 精确字段名与嵌套以 **IDE 实际解析代码为准**（两端都归本人维护，落地前用 IDE 的 mapping 读取器校一遍再定稿）。本文件锁定的是**结构原则**，不是字段拼写。

## 4. 四条硬规则

1. **`mapping.json` 是唯一契约**：schema 定清楚、生成正确。文件夹只是字节放哪。
2. **`assets/` 按 kind 分子目录（决策 B）**：给「用户手动上传素材」一个一眼就懂的入口。
3. **任何新素材自动登记进 `mapping.json`**：agent 生成的、用户丢进 `characters/` 的，都必须自动写一条 mapping 条目。**这条是 make-or-break。** 漏了 = 文件在、IDE/MSS 看不见、编译期静默跳过或渲染期 404、整段戏丢失且不报错（MSS wiki 有真实 bug 史：`MRS. KING:` / `@mama_reyes` 类条目失配）。
4. **取素材一律走 mapping 解析，`loc` 可本地路径可 OSS URL**：禁止写死「永远读 `./assets/*`」。守住此条 → 本地/远程同一套逻辑，未来上云零返工。

## 5. 明确不在 assets-produce 职责内（放心砍）

- 跨机器 / CLI Gateway：现在不碰；REST/gateway 能力已在代码，真要远程再启用。
- Notion 同步：是 IDE 侧 pipeline gate 的钩子（自动推、只读镜像），不是 assets-produce 的事。
- IDE 本体：独立项目。

## 6. 落地校验 checklist

- [ ] 跑一遍 pipeline，确认每个生成素材都进了 `mapping.json`
- [ ] 手动往 `assets/characters/<x>/` 丢一张图，确认被自动登记
- [ ] 用 IDE 实际 mapping 读取器校 schema 字段
- [ ] 抽一条 `loc` 改成 OSS URL，确认解析层照样能取到（验证规则 4）
- [ ] MSS `@<char>` / `@bg` / `@music` / `@sfx` 引用全部能从 mapping 解析（零 orphan）

## 7. 关联与后续

- 关联：[三仓集成设计](2026-05-14-three-repo-asset-integration-design.md)、[audio/asset parity](2026-05-15-audio-and-asset-parity-design.md)、主 spec § 15。
- 后续：本设计未被主 spec 覆盖，应在主 spec § 15 修订记录加一条引用；并按团队规则 `wiki_ingest` 入 mob-wiki（`concepts/` 下，先 `git pull ~/mob-wiki`）。
