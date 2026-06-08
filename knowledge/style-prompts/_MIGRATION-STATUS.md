# style-prompts 迁移 — 状态(已完成,自维护)

> 一句话:做 novels-to-lunascript 最终 demo(书 no-rules-in-bad-ideas)实际用的**那一整套
> prompt**,已完整、无损迁进本目录,本项目自维护,不再依赖远程 MCP / wangbo / n2m。

## 结论先行

- **真源 = lunaverse-backend `styles` 表的 YA_Impasto 家族 4 行**,不是 style-prompts MCP 的
  korean-manga-style。MCP/korean-manga 只是 06 阶段的 appearance 脚手架,渲染期被
  `styles` 表 + `normalize_prompt_for_style` 覆盖,**决定成图的是 YA_Impasto**。
- 装配链(三段)已逐段查清并冻结,详见同目录 `_PIPELINE-MANIFEST.md`。

## 已冻结的真源(`source-of-record/`,全部 verbatim,sha256)

| 文件 | sha256 | 来源 |
|---|---|---|
| `styles.json` | `e8ef5442fe356866e4ccd54b672c56b4f7b508c73c40a8fa04312cf937bcf6f6` | lunaverse-backend `generate-upscale-matting/_style_cache/styles.json`(渲染期主风格 cache,4 行 YA_Impasto*+update_character) |
| `nrbi-anchor_tasks.json` | `0a4dc8d767700e4412f81c0ccd3ed0f1c1e0aa2f784edcd9b27418fe45bdc739` | n2m `lunascripts/no-rules-in-bad-ideas/02.5-outfit-anchor/anchor_tasks.json`(73 条 NRBI 实际 anchor prompt 全集) |
| `anchor_spec.py` | `e21e8200b26e5f75928d7bb7a308cb912d1128c3f69f11d11684261371df07f5` | n2m `skills/outfit-anchor-renderer/anchor_spec.py`(02.5 anchor prompt 模板) |
| `green_screen.py` | `126e792936920609dfbaa79318c454abfb7a32e348d0a3bc9917983c4b196e60` | n2m `skills/asset-prompt-generator/green_screen.py`(06 阶段绿幕后缀) |
| `render-with-style.py` | `35f55d9be989f208edf8ff59fb9fc95ba79bcfb6f680a1379ca2846272b53e06` | lunaverse-backend `generate-upscale-matting/render-with-style.py`(渲染期硬编码强化/改写层) |

`_PIPELINE-MANIFEST.md` = 装配清单(每段 prompt 在哪、render-with-style.py 硬编码块 file:line、
按资产类型的拼装顺序、4 条已知问题/分歧)。

`appearance-feeder-mcp-korean-manga/` = 之前从 style-prompts MCP 导出的 korean-manga-style
8 条 prompt + history(raw+parsed 双份)。**降级保留**:只是 06 阶段 appearance 文字的上游
喂料,不是最终风格。保留它做 provenance / 排查对照,不要当真源用。

## 关键事实(查证过程,留痕)

1. style-prompts MCP `broti.mob-ai.cn` 与 `style-config.mob-ai.cn` 实测同后端、字节一致
   (旧 `/tmp/mcp_cmp.py` 比对:list_styles / get_prompt 双 sha256 相同)。
2. `style_config` Postgres 有两张不相干的表:
   - `style_prompts` / `style_prompts_history` —— MCP 暴露的,仅 korean-manga-style 8 条,
     n2m prompt-gen 中间产物(= 本目录 `appearance-feeder-*`)。
   - **`styles` —— 生产 renderer `render-with-style.py` 真正读的**,YA_Impasto 家族。
3. 本机无 SSH/PG 凭据(env + keyring 皆 False)→ 无法直连 live `style_config` PG 核对。
   `_style_cache/styles.json` 是 production 的本地权威 cache(有 cache 即跳 SSH+PG),
   4 行 = 生产查询 `SELECT DISTINCT ON(category) ... WHERE category IN (4 类) ORDER BY
   category, created_at DESC` 的结果,与生产实际成图一致;**但未证实 == live 表当前值**
   (可能另有其它 family / history 行,无法在本机核对)。

## 剩余事项(均不阻塞「自维护」已达成)

1. **commit 范围 —— 待用户明确**(目前**什么都没 commit**):
   - assets-produce:新增 `knowledge/style-prompts/`(本目录)。
   - n2m:仅 3 个改名文档(`mcp-setup/CLIENT-SETUP.md` / `README.md` / `SKILLS-GUIDE.md`,
     `broti.mob-ai.cn`→`style-config.mob-ai.cn` 共 9 处)。**不碰**并发 session 改的
     `CLAUDE.md` 和那个 `.html`;历史文档 `docs/.../phase-6-handoff.md` 故意保留 broti。
   - 推不推 origin:assets-produce 本项目 push 已预授权;n2m 是否 push 待用户定。
2. **key rotation(外部,wangbo 侧)**:排查期 `claude mcp get` 把 style-prompts 的
   Bearer 打进过对话记录(泄露)。B 方案落地后该 key 对本项目已无意义,但仍建议 wangbo
   侧 rotate。`~/.claude.json` 里的 style-prompts→broti MCP 注册可在确认后整条移除。
3. **(可选,需凭据)**核 live `style_config` PG `styles` 表是否仅此 4 行 / 有无其它
   family,确认 cache == live。本机做不了,留给有 SSH/PG 的环境。
4. **临时脚本清理**:`/tmp/mcp_cmp.py`、`/tmp/mcp_export.py` 可删(已无用)。

## 这次迁移没做的事(范围声明)

- **没有**把 prompt 接进 assets-produce 的 skill / 渲染代码(那是后续「B1 改造」的活,
  本次只做「无损搬运 + 装配清单」,即把 demo 用的那套 prompt 完整迁过来自持有)。
- **没有** commit / push 任何东西。
- **没有**改 lunaverse-backend 任何文件(只读取 + 复制冻结)。
