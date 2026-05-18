# NRBI 最终 demo —— 素材 prompt 完整装配清单

> 这是「做 novels-to-moonscript 最终 demo（书：no-rules-in-bad-ideas）时实际用的那一整套
> prompt」的完整、无损、自持有副本。`source-of-record/` 内全部 verbatim 冻结,sha256 见
> `_MIGRATION-STATUS.md`。本清单说明每段 prompt 在哪、按什么顺序拼成最终打到图像模型的 prompt。

## 真源清单(source-of-record/,全部 verbatim)

| 文件 | 来源仓 | 是什么 |
|---|---|---|
| `styles.json` (4 行) | moonshort-backend `generate-upscale-matting/_style_cache/styles.json` | **渲染期主风格**。`style_config` PG `styles` 表的本地权威 cache。4 行:`YA_Impasto_character` / `YA_Impasto_scene` / `YA_Impasto_grid` / `update_character`,列 id,name,category,model(image-gpt),prompt,reference_urls,created_at |
| `nrbi-anchor_tasks.json` (73 条) | n2m `moonscripts/no-rules-in-bad-ideas/02.5-outfit-anchor/anchor_tasks.json` | **NRBI demo 实际 anchor prompt 全集**。每条 = sprite_id/char_id/outfit_id/outfit_text/prompt/model/reference_image_source |
| `anchor_spec.py` | n2m `skills/outfit-anchor-renderer/anchor_spec.py` | 02.5 阶段从锁定 bible.canonical_wardrobe 生成上面 anchor_tasks 用的**硬编码 prompt 模板**(CHARACTER LOCK / OUTFIT verbatim / POSE LOCK / FRAMING / CONTRACT,绿幕 #00B140) |
| `green_screen.py` | n2m `skills/asset-prompt-generator/green_screen.py` | 06 阶段给 character/sprite prompt 追加的 `GREEN_SCREEN_SUFFIX`(`[BACKGROUND CONTRACT — chromakey green]` 四条,#00FF00) |
| `render-with-style.py` | moonshort-backend `generate-upscale-matting/render-with-style.py` | **渲染期硬编码强化/改写层**(详见下表 file:line) |

`appearance-feeder-mcp-korean-manga/` = 之前查错表的 MCP `style_prompts`/korean-manga-style 8 条导出。
**不是最终风格**,降级保留:它是 06 阶段产出 tasks_output.json `appearance` 文字的上游喂料,
渲染期被 `styles` 表 YA_Impasto + 下面的 normalize 覆盖掉。

## render-with-style.py 里的硬编码 prompt 块(file:line)

| 块 | 行 | 作用 |
|---|---|---|
| `extract_appearance` / `_APPEARANCE_RE` | 150, 260-267 | 从 06 烤进 tasks_output 的 korean-manga prompt 里只抽 appearance,丢弃韩漫外壳 |
| `build_sprite_text` 硬约束块 + `_OUTFIT_RE` | 274-293 | EP sprite:着装改“完全保持图1”,追加【硬约束/Hard Constraints】4 条(解剖/绿幕#00FF00/像素级一致/冲突以图1为准) |
| `_ANCHOR_HEADER` | 308-312 | anchor 绑 ref 时前置“图1是 series 立绘 reference…” |
| `_ANCHOR_CHROMAKEY` | 314-327 | anchor 追加 [CHROMAKEY GREEN BACKGROUND CONTRACT] 4 条(#00FF00 + 半透明面料一律实色) |
| `_clean_character_lock` / `clean_anchor_prompt` | 330-353 | 剥 CHARACTER LOCK 性格/衣橱杂项 + hex #00B140→#00FF00 + 追加上面 chromakey |
| `rebuild_grid_prompt` | 356-380 | 抽 06 grid 的 grid_size+grid_cells,重填 `YA_Impasto_grid` 模板,丢韩漫头 |
| `_SCENE_SQUARE_TEMPLATE` / `build_scene_square_prompt` | 393-408 | Layer C 场景方图内联模板(YA Impasto 词汇) |
| `clean_sprite_prompt` | 417-423 | sprite hex #00B140→#00FF00、RGB 0,177,64→0,255,0 |
| `normalize_prompt_for_style` | 592-625 | **全 prompt 渲染期改写**:韩漫画风→现代YA图像小说风格 等中/英 vocab 替换(仅 YA_Impasto 分支) |

## 最终 prompt 按资产类型的装配顺序

渲染入口 `render_image()` 对所有 prompt 先过 `normalize_prompt_for_style`(L636)。

- **character series** (L771): `render_prompt(YA_Impasto_character, extract_appearance(orig))` → normalize
- **EP sprite** (L1143-1148): `clean_sprite_prompt(sprite.prompt)` 或 `build_sprite_text(orig_prompt)` → normalize
- **anchor / "outfit anchor"** (L838-857): 输入 `nrbi-anchor_tasks.json` 的 prompt → `clean_anchor_prompt`(+ `_ANCHOR_HEADER` 若绑 ref)；该 category 无 styles 行,复用 character_series 风格
- **scene grid** (L954): `rebuild_grid_prompt(grid.prompt, YA_Impasto_grid)`
- **scene square** (L1016): `build_scene_square_prompt(sub_location)`
- **scene series** (L1050): `render_prompt(YA_Impasto_scene, scene_text)` → normalize
- **EP character illustration**: `update_character` 行(“严格维持图1…{{prompt}}”)

## 自维护要知道的已知问题/分歧

1. **绿幕 hex 不统一**:06/anchor 上游用 `#00B140`;render-with-style.py 渲染期改写成 `#00FF00`
   (clean_anchor_prompt L352 / clean_sprite_prompt L422);n2m green_screen.py 与 cutout.py / Layer A 都用 `#00FF00`。
   迁移后若自渲染,需统一到 #00FF00(否则下游抠图阈值漂移)。
2. **风格双轨**:tasks_output.json 烤的是 korean-manga(韩漫画风),渲染期被 `styles` 表 YA_Impasto
   + normalize_prompt_for_style 覆盖。**决定成图的是 YA_Impasto**;MCP/korean-manga 仅 appearance 脚手架。
3. **styles.json 是 cache**:可能 != live `style_config` PG 当前值;本机无 SSH/PG 凭据无法核对。
   4 行 = production 查询 `DISTINCT ON(category)` 取 4 个 category 最新各一,与生产实际一致。
4. anchor 的 `model` / `reference_image_source` 等列在 json 内,迁移后自渲染需照此路由。
