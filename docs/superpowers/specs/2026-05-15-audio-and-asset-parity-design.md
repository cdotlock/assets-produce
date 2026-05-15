# Audio Production + Asset Tool Parity Design

**Version**: 1.0
**Date**: 2026-05-15
**Status**: Approved (brainstorming, 用户 2026-05-15 同意)
**Audience**: 后续执行 Phase 11 / 12 / 13 的 Claude Code session
**Master spec**: [`2026-04-29-assets-produce-spec.md`](2026-04-29-assets-produce-spec.md) § 15 行 1.12
**Repos in scope**:
- `cdotlock/assets-produce`（本仓库，opencode fork；用户维护）
- `cdotlock/novels-to-moonscript`（MSS 剧本生成；用户维护 —— 仅作为 SFX 合成代码的**来源**，本设计不改它）

---

## 1. 背景

### 1.1 现状（事实层，已用代码核实）

**已具备的"视频对等模板"**（Phase 3 + 4 + 8 落地）：

- 原子工具样板：`agent/packages/opencode/src/tool/asset/generate-video-seedance.ts` —— Effect + Schema，同名 `.txt` 持 LLM 描述，`never` 错误通道（错误折进结果不抛），经 `fc-client.ts` 调端点，输出裸 OSS https URL。
- 工具注册：`agent/packages/opencode/src/tool/registry.ts` 每个工具 3 处静态注册（import / `Tool.init` / `builtin[]`）。
- skill body：`knowledge/asset-generation/`（6 段式约定）+ `intent-to-skill.ts` 的 `DEFAULT_KIND_SKILL_MAP`。
- 对外 API：`business/asset-service/` 的 `/api/v1/assets/*`，kind 枚举在 `types.ts` 的 `AssetKind` + `ASSET_KINDS` 元组，`z.enum(ASSET_KINDS)` 自动收口。

**两条 skill 执行路径，状态不同（命门，已核实）**：

| 路径 | 入口 | 真 agent loop | skill 真驱动原子工具 | 现状 |
|---|---|---|---|---|
| CLI / Session | `agent` CLI / opencode Session | 是（opencode 本体） | 是（Phase 4 验证：`novel-to-video` skill → 原子工具 → 3 个真实 OSS URL） | 能跑通 |
| asset-service REST API | `POST /api/v1/assets/create`（Phase 8；三仓集成实际调用） | 否 | 否 | stub（`wire.ts` 的 `placeholderGenerator` 返回 `https://stub.assets.local/...`） |

`placeholderGenerator` 注释原文写明 "Real generator (Phase 9+) replaces it" —— Phase 9/10 均未接，此债从 Phase 8 拖至今。**视频本身经 REST API 也是 stub**。

### 1.2 缺口

- **音频**：assets-produce 无任何音频生产能力（`AssetKind` 仅 6 个视觉类型；`tool/` 下无音频工具）。音效真生成器在 `novels-to-moonscript`（ElevenLabs 声效 API，生产级带测试，但与其 MoonScript 归类管线耦合）；音乐无生成器（n2m 仅做名字归类 + 替换人工 mp3 的 URL）。
- **CG 渲染 / upscale**（Phase 9 已迁 `tools/`，已是原子工具）：输出**本地文件路径**，非 OSS URL（`cg-render.ts:218 output: localPath`），与视频工具的 OSS URL 输出不对等。
- **单文件 oss-put 原子工具**：不存在（`registry.ts` 搜 `oss` 无原子工具）。OSS 仅做到 Phase 2 的服务层 + CLI 层（`cli/cmd/oss.ts`），未到原子工具层。
- **图片处理大套**（matting/MODNet、cutout、hole_fill、spill、格式转 webp，10+ 文件，重 torch/MODNet 依赖）：仍在 `moonshort-backend/generate-upscale-matting/`，未迁。

---

## 2. 目标与非目标

### 2.1 目标

把"音乐 / 音效 / CG 渲染-OSS-图片处理"全部做到与视频严格对等：原子工具 + `.txt` 描述 + `registry.ts` 注册 + `agent tools` CLI 自动可见 + `knowledge/asset-generation/` skill body + `AssetKind` 枚举 + asset-service API 自动收口。拆 3 个 phase（11→12→13），各走完整 spec→plan→执行→验收。

### 2.2 非目标（硬约束，验收按此判定，避免误判"没做完"）

- **不碰** `placeholderGenerator` / asset-service 注入的 `deps.generator`。新能力经 CLI/Session 能真跑（如 Phase 4 视频），经 REST API 返回 stub —— **与视频现状完全一致**。
- **不做**真编排循环（把真 agent-loop 接进 asset-service）—— 这是 Phase 8 旧债，明确另起独立项目，不在 11/12/13 范围。
- **不迁** n2m 的聚类 / 归类 / 语义映射 —— 留在 n2m；assets-produce 只做"素材生产"。
- **不改** `novels-to-moonscript`：仅把其 ElevenLabs **合成调用**作为参考移植进 assets-produce，不改 n2m 本身。
- 不引入共享 npm/pip 包；不要求 CI E2E（用户本机一条 e2e 即验收，沿用 Phase 10 惯例）。

---

## 3. 总体打法

三个 phase 全部严格复刻 §1.1 的视频对等模板，逐文件对应。无宏观方案分叉（用户已定"严格对等" + 选项 B）。`AssetType` union 已含 `"audio"`，音频 kind 走 `defaultAssetTypeForKind() → "audio"`，不改类型。

---

## 4. Phase 11 — 音频生产（详细）

### 4.1 新增 2 个原子工具

| 工具 id | 文件 | 调用 | 输出 |
|---|---|---|---|
| `generate-music-suno` | `tool/asset/generate-music-suno.ts` + `generate-music-suno.txt` | Suno API（直连 HTTPS，非 FC 端点；带 `dryRun` / `--mock` 确定性路径） | OSS https URL |
| `generate-sfx-elevenlabs` | `tool/asset/generate-sfx-elevenlabs.ts` + `generate-sfx-elevenlabs.txt` | ElevenLabs 声效 API（仅移植 n2m 的合成调用，不带其归类逻辑） | OSS https URL |

形状完全照 `generate-video-seedance.ts`：Effect + Schema，`never` 错误通道，错误折进结果（`Effect.catch` → `{ title, output: "... error: ...", metadata:{error:true} }`），输入 schema 卡边界（prompt 长度、时长上限、`dryRun`）。

### 4.2 关键正确性点 —— Phase 11 不依赖 Phase 12

Suno / ElevenLabs 返回音频字节或临时链接，**不是 OSS URL**。视频 FC 工具能返回 OSS URL 是因为 FC 端点自己传了 OSS。两个音频工具**内部直接复用 Phase 2 已有的 OSS Effect 服务**（`cli/cmd/oss.ts` 同款服务）上传音频、返回永久 OSS URL。因此 Phase 11 **不**需要 Phase 12 的 `oss-put` 原子工具（那个是给输出本地路径的 Python 工具用的；TS 音频工具内联调 OSS 服务即可）。这保证 Phase 11 完全独立、顺序 11→12→13 成立。

### 4.3 碰的文件（逐一对应视频模板）

- `business/asset-service/types.ts` —— `AssetKind` union 加 `"music"` `"sfx"`；`ASSET_KINDS` 元组同步追加（asset-service `z.enum(ASSET_KINDS)` 自动收口，API 层零改动）
- `business/asset-service/intent-to-skill.ts` —— `DEFAULT_KIND_SKILL_MAP` 加 `music` / `sfx` 两条（每个 kind 必须有条目，否则确定性兜底路径断）
- `business/asset-service/run-asset-generation.ts` —— `defaultAssetTypeForKind()` 把 `music`/`sfx` 映到 `"audio"`（`AssetType` 已含 `audio`）
- `tool/registry.ts` —— 两个工具各 3 处静态注册（import / `Tool.init` / `builtin[]`）
- `knowledge/asset-generation/` —— 新增 `music-spec.md`、`sfx-spec.md`（6 段式约定：Intent / Atomic tools / Inputs / Output / Failure / Boundary）

### 4.4 测试（80% 线 + 照 seedance 测试模式）

- 每工具单测：mock Suno / ElevenLabs HTTP + mock OSS 服务，断言返回 OSS URL 形状
- schema 校验测试（非法 prompt / 超时长 / 缺参）
- `dryRun` / `--mock` 路径确定性输出测试
- `intent-to-skill` 新 kind（music/sfx）映射测试
- asset-service API `z.enum(ASSET_KINDS)` 收口测试（create 接受 music/sfx）
- 错误折叠测试（上游 5xx / 鉴权失败不抛、折进结果）

---

## 5. Phase 12 — URL 对等 + oss-put（勾勒，进入时展开为 plan）

- 新增单文件 `oss-put` 原子工具 `tool/asset/oss-put.ts` + `.txt`：薄壳复用 Phase 2 OSS 服务，输入本地路径 → 输出 OSS URL。
- `cg-render` / `upscale-image` 从"输出本地路径"补成"输出 OSS URL"：在其 **skill body** 里串一步 `oss-put`（skill 编排，不在工具里硬接，守 §2 原子能力原则）。
- 补 `upscale-image` 专属 skill body（Phase 9 仅补了 `cg-render-spec.md`）。
- `oss-sync`（批量目录上传）维持现状，**不**注册为原子工具（LLM 不应决定批量上传，沿用 Phase 9 决策）。
- 不新增 AssetKind（cg 已有；upscale 是后处理，不单独成 kind）。

## 6. Phase 13 — 图片处理大套迁移（勾勒，进入时展开为 plan）

- `moonshort-backend/generate-upscale-matting/` 那套（matting/MODNet、cutout、hole_fill、green_spill/rgb_unspill、detect_matting_failures、hybrid_to_webp 等）→ Phase 9 式 Python 原子工具（`tools/<name>/` + JSON I/O 约定 + `--mock` + `python-runner.ts` 桥）。
- 能产视觉产物的注册为原子工具，输出经 Phase 12 的 `oss-put` 拿 URL。
- backend 对应文件加 DEPRECATED 注释（不删，删交 backend 维护方；沿用 Phase 9 惯例，跨 namespace push 需 backend 维护方 ack）。
- 重 ML 依赖（torch/MODNet）、每工具独立 venv、mock 模式为重点风险，进入 Phase 13 时按本章展开。

---

## 7. 数据流走一遍（Phase 11 音乐为例）

1. **CLI/Session 路径（真出活）**：`agent` 会话加载 `music-spec` skill body → LLM 决定调 `generate-music-suno`，传 prompt/时长 → 工具调 Suno → 拿音频 → 内联调 Phase 2 OSS 服务上传 → 返回 OSS URL → skill 收尾。等价 Phase 4 视频已验证路径。
2. **REST API 路径（stub，与视频一致）**：`POST /api/v1/assets/create {kind:"music"}` → `intentToSkill()` 正确挑出 `music-spec` → `placeholderGenerator` 忽略它，返回 `https://stub.assets.local/<key>.mp3`。**符合 §2.2 非目标，验收按此判定为通过**。

---

## 8. 测试策略（总）

- 单元 / schema / 错误矩阵：每个新原子工具，mock 上游 + mock OSS，≥ 80% 行覆盖。
- 集成：asset-service `create` 接受新 kind；`intent-to-skill` 新 kind 映射。
- e2e（用户本机一条，沿用 Phase 10 惯例）：CLI/Session 跑 `music-spec` / `sfx-spec` 出真实 OSS URL（dev key）；REST API 返回 stub 且 kind 校验通过。
- 不要求 CI E2E。

---

## 9. 风险（写入主 spec § 13 对应条目）

1. **Suno 商用授权**：音乐随 App 发终端用户，硬条件。假设 = 用户使用带商用权的 Suno 付费计划；官方 API 成熟度 / 限流 / 可能需第三方网关 —— 记为 ops 开放项，非设计阻塞，plan 阶段需确认实际 endpoint/鉴权形态。
2. **从 n2m 抽 ElevenLabs**：只移植合成调用，**不**拖其与 MoonScript 管线耦合的归类逻辑；抽离边界在 Phase 11 plan 写死，禁止引入 n2m 依赖。
3. **音频二进制**：体积 / OSS content-type / 时长上限 —— 工具入参 schema 卡边界，OSS 上传显式设 content-type。
4. **严格非目标重申**：经 REST API 仍 stub，与视频一致；不补真循环。验收标准按此写，CLI/Session 出真活即达标，API stub 不算缺陷。
5. **Phase 13 重 ML 依赖**：torch/MODNet 体积与 venv 隔离，mock 模式必须可在无 GPU/无模型权重环境跑通（沿用 Phase 9 mock 约定）。

---

## 10. 主 spec 修订计划（动代码前先做，CLAUDE.md 红线 + § 11.3）

- `2026-04-29-assets-produce-spec.md` § 15 追加修订行 **1.12**（说明新增 Phase 11/12/13、范围、不违反 § 2 原子能力+skill 编排原则、明确非目标）。
- § 10 在 Phase 10 之后新增 **Phase 11 / 12 / 13** 三章（目标 / 范围 / 不做 / 验收），各加 `⚠ 1.12` 标记并引用本设计文档。
- 本文档为三 phase 的详细设计源；writing-plans 据此产 `phase-11-audio-production-plan.md` / `phase-12-*-plan.md` / `phase-13-*-plan.md`，按 11→12→13 执行，各自 verification（与 8/9/10 同流程）。
