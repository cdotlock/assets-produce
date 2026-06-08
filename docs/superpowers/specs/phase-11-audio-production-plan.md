# Phase 11 — 音频生产（music / sfx）Plan

> Spec ref: [§ 10 Phase 11](2026-04-29-assets-produce-spec.md#phase-11--音频生产music--sfx-112-113) / [§ 15 row 1.12 / 1.13](2026-04-29-assets-produce-spec.md#15-修订记录)
> Design doc: [2026-05-15-audio-and-asset-parity-design.md](2026-05-15-audio-and-asset-parity-design.md) § 4（含 § 4.0 修订 1.13）
> Survey: [phase-11-survey.md](phase-11-survey.md)（Step 1 产出，已落定 OSS 接口 / n2m 抽离边界 / Suno 无官方 API）
> Date: 2026-05-15
> **修订 1.13（执行时落定）**：Suno 无官方一方 API → `generate-sfx-elevenlabs` 完整真实实现；`generate-music-suno` 仅结构对等脚手架 + 确定性占位（`metadata.placeholder=true`，无真实上游 HTTP / 不真传 OSS），真实 Suno 网关接入延后为开放项。下文凡 music 工具"直连 Suno / 返回 OSS URL"按此降级为占位。
> 前置依赖：Phase 8 完成（AssetService / atomic tool 注册框架 / intent-to-skill / asset-service API 就位）；Phase 2 OSS 服务（`agent/packages/opencode/src/oss/oss.ts`，`put(key,body)→PutResult.url`，content-type 由 key 后缀推断）就位。**不依赖 Phase 12**（SFX 工具内联复用 Phase 2 OSS 服务，不经 oss-put；music 占位不真传 OSS）。

## 0. Decision Table

| Item | Decision | Reason |
|---|---|---|
| 范围 | `generate-sfx-elevenlabs`（**完整真实**，移植 n2m 合成调用）+ `generate-music-suno`（**结构对等脚手架 + 确定性占位**，无真实上游）| §15 行 1.13；Suno 无官方 API，用户决定音乐先留占位 |
| 工具样板 | 严格复刻 `agent/packages/opencode/src/tool/asset/generate-video-seedance.ts` + `.txt` | 设计 §3「严格对等」；Effect + Schema + `never` 错误通道 |
| 音频 → OSS | 工具内部**内联复用** Phase 2 OSS 服务（`src/oss/oss.ts`）上传、返回永久 OSS https URL | 设计 §4.2；Suno/ElevenLabs 返回字节/临时链非 OSS；这让 Phase 11 不依赖 Phase 12 |
| Suno 调用 | **不调任何 Suno API**；music 工具生成路径恒返回确定性占位（`metadata.placeholder=true` + 固定说明，无 HTTP、不传 OSS）| §15 行 1.13；Suno 无官方 API，网关待用户后续选定 |
| Suno 网关选定 | 本 phase **不选**；真实接入作开放项延后，待用户决定后走新 §15 修订 | §15 行 1.13 用户决策"后面再说" |
| SFX 抽离来源（survey 落定）| n2m `skills/sfx-normalizer/elevenlabs_generator.py::ElevenLabsGenerator.generate()` L139–167（`POST /v1/sound-generation`，`xi-api-key`，同步 mp3 字节）| phase-11-survey.md Block B |
| OSS 上传（survey 落定）| `OSS.Service` 的 `put(key,body)→PutResult.url`；content-type 由 key 后缀 `.mp3` 推断（无 content-type 入参）；`yield* OSS.Service` + `OSS.defaultLayer` | phase-11-survey.md Block A |
| 测试命令（survey 落定）| `PATH=$HOME/.bun/bin:$PATH bun --cwd=agent/packages/opencode run test`（根 `agent` test 脚本被 guard 成 exit 1）| phase-11-survey.md Baseline |
| ElevenLabs 抽离边界 | 只移植 novels-to-lunascript 的「声效合成 HTTP 调用」；**不**带其归类/语义映射 | 设计 §2.2 / §9.2；禁 import n2m |
| AssetKind 扩展 | `types.ts` 的 `AssetKind` union + `ASSET_KINDS` 元组追加 `"music"` `"sfx"` | 设计 §4.3；asset-service `z.enum(ASSET_KINDS)` 自动收口，API 层零改 |
| AssetType | 不改类型；music/sfx 经 `defaultAssetTypeForKind()` → 已有的 `"audio"` | 设计 §3；`AssetType` union 已含 audio |
| skill body | `knowledge/asset-generation/` 新增 `music-spec.md` / `sfx-spec.md`（6 段式）| 设计 §4.3；本地自包含，不上 Langfuse |
| placeholderGenerator | **不碰**；经 REST API 仍返回 stub（与视频现状一致）| 设计 §2.2 选项 B（用户 2026-05-15 锁定）|
| 真实上游调用 | 测试一律 mock 上游 HTTP + mock OSS；dev key 手动 verify 不入测试套件 | 设计 §8；沿用 Phase 8/9 惯例 |
| 实现顺序 | sfx（有 n2m 现成参考，先打通 wrapper 模式）→ music（新建，复用同模式）| 降风险：先移植已验证的，再新建 |

## 1. Deliverables

### 1.1 调研产物（执行前置，落 `docs/superpowers/specs/phase-11-survey.md`）

- novels-to-lunascript 内 ElevenLabs 声效合成调用实际位置 / 函数 / 入参 / env（grep 现场清单），明确「只移植合成 HTTP 调用、不拖归类」的抽离边界
- Suno 官方 API 实际 endpoint / 鉴权形态 / 返回结构（同步字节 vs 临时 URL vs 异步 job poll）
- Phase 2 OSS 服务（`src/oss/oss.ts`）对外 Effect 接口签名（上传方法名、content-type 入参、返回 URL 形态）

### 1.2 `generate-sfx-elevenlabs` 原子工具

- `agent/packages/opencode/src/tool/asset/generate-sfx-elevenlabs.ts`
- `agent/packages/opencode/src/tool/asset/generate-sfx-elevenlabs.txt`（LLM 描述 sidecar，照 `generate-video-seedance.txt` 体例）
- 形状照 seedance：`Tool.define` + `Effect.gen` + Schema 输入校验 + `never` 错误通道（错误折进结果 `{ title, output, metadata:{ error:true } }`，不抛）
- 输入 schema 卡边界：`prompt`（文本，长度上限）、`duration_seconds`（上限，设计 §9.3）、可选 `seed`、`dryRun`
- 内部：调 ElevenLabs 声效 API（仅合成调用，移植自 n2m）→ 拿音频字节 → 内联调 Phase 2 OSS 服务上传（显式设 content-type）→ 返回裸 OSS https URL
- `dryRun` / `--mock`：不调上游、不调真实 OSS，返回确定性占位 URL

### 1.3 `generate-music-suno` 原子工具

- `agent/packages/opencode/src/tool/asset/generate-music-suno.ts`
- `agent/packages/opencode/src/tool/asset/generate-music-suno.txt`
- 同 §1.2 **形状**（Effect + Schema + `never` 通道 + `.txt` sidecar），结构对等脚手架完整
- 输入 schema：`prompt`、`duration_seconds`（上限）、可选 `style` / `instrumental` flag、`dryRun`（schema 卡边界与 SFX 同标准，保证结构对等）
- 内部（**1.13 占位**）：**不调任何 Suno API、不传 OSS**；恒返回确定性结果 `{ title, output:"<固定说明：music generation pending Suno gateway selection — spec §15 row 1.13>", metadata:{ placeholder:true } }`
- 不引入"伪装真实"的假音频/假 OSS URL（YAGNI）；占位即占位，明确可识别
- 真实 Suno 网关接入为开放项，待用户选定网关后走新 §15 修订补真实路径（届时复用 §1.2 wrapper 模式 + Phase 2 OSS）

### 1.4 工具注册

- `agent/packages/opencode/src/tool/registry.ts`：两个工具各 3 处静态注册（import / `Effect.all` 内 `Tool.init` / `builtin[]` push），照现有 seedance/skill 注册体例
- `agent tools list` 出现 `generate-sfx-elevenlabs` / `generate-music-suno`；`agent tools show <name>` 输出完整 schema

### 1.5 AssetKind / 自动收口（四处一致）

- `agent/packages/opencode/src/business/asset-service/types.ts`：`AssetKind` union 追加 `"music"` `"sfx"`；`ASSET_KINDS` 元组同步追加（追加到**末尾**，避免影响既有索引/快照顺序）
- `agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`：`DEFAULT_KIND_SKILL_MAP` 加 `music → music-spec`、`sfx → sfx-spec`（每 kind 必须有条目，否则确定性兜底路径断）
- `agent/packages/opencode/src/business/asset-service/run-asset-generation.ts`：`defaultAssetTypeForKind()` 把 `music` / `sfx` 映到 `"audio"`

### 1.6 skill body

- `knowledge/asset-generation/music-spec.md`（6 段式：Intent / Atomic tools / Inputs / Output / Failure / Boundary）
- `knowledge/asset-generation/sfx-spec.md`（同）
- `knowledge/asset-generation/README.md` 补一行：Phase 11 后 music/sfx 已挂 atomic tool

### 1.7 配置 / 文档

- `.env.example` 新增 block `# Phase 11 — Audio Production`：`SUNO_API_KEY` / `SUNO_BASE_URL` / `ELEVENLABS_API_KEY` / `ELEVENLABS_BASE_URL`（仅代码实际读取的）
- `SKILL.md`「可用素材生产工具」节补 `generate-sfx-elevenlabs` / `generate-music-suno`
- `ERRORS.md` 补音频工具错误码（上游 5xx / 鉴权失败 / 内容过滤 / 时长越界）

## 2. Execution Steps

### Step 1 — Baseline & 调研现场清单

预期输出：

- `git status` 干净起点；`bun --cwd=agent run typecheck` / `bun --cwd=agent run test` 全过基线记录
- novels-to-lunascript ElevenLabs 声效合成调用实际文件 / 函数 / 入参 / env 清单 + 抽离边界
- Suno API endpoint / 鉴权 / 返回结构确认（官方文档或 dev 试调）
- `src/oss/oss.ts` 对外接口签名记录
- 落 `docs/superpowers/specs/phase-11-survey.md`

测试：

- `bun --cwd=agent run typecheck` 全过
- `bun --cwd=agent run test` 全过
- 在 n2m 仓 `grep -rn "elevenlabs\|sound.generation\|sfx" --include=*.py --include=*.ts` 定位合成调用
- `phase-11-survey.md` 存在且含三块清单

### Step 2 — `generate-sfx-elevenlabs` 原子工具（TDD）

预期输出：

- `generate-sfx-elevenlabs.ts` + `.txt` 落盘，形状对齐 seedance 模板
- 输入 schema 卡边界（prompt 长度 / duration 上限 / dryRun）
- 内联调 Phase 2 OSS 服务上传、返回 OSS URL
- 错误折进结果（`never` 通道，不抛）

测试：

- 单元：mock ElevenLabs HTTP + mock OSS → 断言返回 OSS https URL 形状
- schema 测试：空/超长 prompt、duration 越界、缺参 → schema 拒绝
- `dryRun` 路径：确定性占位 URL，不触发 HTTP/OSS
- 错误折叠：上游 401 / 5xx → 不抛、`metadata.error=true`、`output` 含 error 文案
- `bun --cwd=agent run typecheck` 全过

### Step 3 — `generate-sfx-elevenlabs` 注册 + AssetKind `sfx`

预期输出：

- `registry.ts` 3 处注册 sfx 工具
- `types.ts` `AssetKind` + `ASSET_KINDS` 追加 `"sfx"`
- `intent-to-skill.ts` `DEFAULT_KIND_SKILL_MAP` 加 `sfx → sfx-spec`
- `run-asset-generation.ts` `defaultAssetTypeForKind` `sfx → audio`

测试：

- `agent tools list | grep generate-sfx-elevenlabs`
- `agent tools show generate-sfx-elevenlabs --json | jq '.input'` schema 完整
- 单元：`intent-to-skill` kind=sfx → 选 `sfx-spec`
- 单元：asset-service `create {kind:"sfx"}` `z.enum` 校验通过（返回 stub，符合非目标）
- `bun --cwd=agent run test` 全过

### Step 4 — `generate-music-suno` 原子工具（结构对等脚手架 + 确定性占位，TDD）

预期输出：

- `generate-music-suno.ts` + `.txt` 落盘，形状对齐 seedance / SFX（Effect + Schema + `never` 通道）
- 输入 schema 与 §1.3 一致（prompt / duration_seconds / style? / instrumental? / dryRun），卡边界标准与 SFX 同
- 生成路径**恒返回确定性占位**：`metadata.placeholder=true` + 固定说明文案，**无任何 Suno HTTP、不调 OSS**

测试：

- 单元：调用 → 断言返回 `metadata.placeholder===true` 且 `output` 含固定说明文案，且**未发起任何 HTTP / 未调用 OSS**（注入式断言无副作用）
- schema 测试：非法 prompt / duration 越界 / 缺参 → schema 拒绝（结构对等校验）
- `dryRun` 路径：与默认路径一致的确定性占位（无副作用）
- 确定性：同输入多次调用输出稳定一致
- `PATH=$HOME/.bun/bin:$PATH bun --cwd=agent run typecheck` 全过

### Step 5 — `generate-music-suno` 注册 + AssetKind `music`

预期输出：

- `registry.ts` 3 处注册 music 工具
- `types.ts` `AssetKind` + `ASSET_KINDS` 追加 `"music"`
- `intent-to-skill.ts` 加 `music → music-spec`
- `run-asset-generation.ts` `defaultAssetTypeForKind` `music → audio`

测试：

- `agent tools list | grep generate-music-suno`
- `agent tools show generate-music-suno` schema 完整
- 单元：`intent-to-skill` kind=music → `music-spec`
- 单元：asset-service `create {kind:"music"}` 校验通过返回 stub
- `bun --cwd=agent run test` 全过

### Step 6 — skill body

预期输出：

- `music-spec.md` / `sfx-spec.md` 6 段式各 ≥ 30 行有内容
- `README.md` 补 Phase 11 状态行

测试：

- `wc -l knowledge/asset-generation/music-spec.md knowledge/asset-generation/sfx-spec.md` 各 ≥ 30
- `intent-to-skill` mock LLM 能识别两个新 skill name
- markdown lint 无破损

### Step 7 — 配置与文档

预期输出：`.env.example` block / `SKILL.md` / `ERRORS.md` 更新

测试：

- `grep -c "Phase 11 — Audio" .env.example` ≥ 1
- `grep -c "generate-music-suno" SKILL.md` ≥ 1
- `grep -c "generate-sfx-elevenlabs" SKILL.md` ≥ 1

### Step 8 — CLI/Session e2e（用户本机一条，dev key）

预期输出：

- `agent` 会话加载 `sfx-spec` → LLM 调 `generate-sfx-elevenlabs` → 真实 ElevenLabs（dev key，若用户已配）→ 真实 OSS URL
- `agent` 会话加载 `music-spec` → LLM 调 `generate-music-suno` → **确定性占位**（`metadata.placeholder=true`，符合 §15 行 1.13，不算缺陷）
- REST API `create {kind:music|sfx}` 校验通过、返回 stub（符合非目标，记入 verification）

测试：

- 本机：`agent run`（session）跑 `sfx-spec` 出 1 个可访问 OSS URL（需 `ELEVENLABS_API_KEY`；无 key 则记为延后 + 跑 mock 路径）
- 本机：`agent run`（session）跑 `music-spec` → 断言返回占位（`metadata.placeholder=true`）
- `curl -X POST /api/v1/assets/create {kind:"music"}` / `{kind:"sfx"}` → 200 + stub url（kind 校验通过）
- 沿用 Phase 10 惯例：CI 不要求 e2e

### Step 9 — Acceptance 自检 + verification

预期输出：

- 跑全部 Phase 11 验收项（§5）
- 写 `phase-11-audio-production-verification.md` 逐条打勾或解释偏差

测试：见 §5 Acceptance Checklist

### Step 10 — Commit / Push

预期输出（atomic commit 切分）：

1. `generate-sfx-elevenlabs` 工具 + `.txt`
2. sfx 注册 + AssetKind / intent / type 收口
3. `generate-music-suno` 工具 + `.txt`
4. music 注册 + AssetKind / intent / type 收口
5. `music-spec.md` / `sfx-spec.md` skill body + README
6. `.env.example` + `SKILL.md` + `ERRORS.md`
7. verification report

测试：

- `git log --oneline main..HEAD` 每 commit 单一变更面
- 各 commit `typecheck` / `test` 不破坏
- `git push origin main`（remote cdotlock；assets-produce 已预授权，无需每次问）

## 3. Risks

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Suno 无官方 API（survey 已落定）| 已发生 | 中 | 用户决策（§15 行 1.13）：music 留确定性占位，不选网关；真实接入延后为开放项，不阻塞本 phase |
| music 占位被误判"没做完" | 中 | 低 | §15 行 1.13 + 本 plan + verification 写死占位为有意决策；验收按"占位确定性 + 结构对等完整"判定 |
| 后续接真实 Suno 时脚手架不匹配 | 低 | 中 | 占位工具 schema/形状与 SFX 严格对等，留好 §1.3 wrapper 接入点；真实路径走新 §15 修订增量补 |
| Suno 商用授权未确认 | 中 | 低 | 用户选"按 ops 风险推进"；记 spec §13 / verification 开放项；商用发布前由用户敲定（非技术阻塞）|
| 从 n2m 抽 ElevenLabs 误拖归类耦合 | 中 | 中 | 抽离边界在 Step 1 写死（只移植合成 HTTP 调用）；禁 import n2m；grep 全调用面 |
| 音频二进制体积 / content-type / 时长 | 中 | 中 | 输入 schema 卡时长上限；OSS 上传显式设 content-type；超限折叠为错误 |
| 经 REST API 仍 stub 被误判「没做完」| 中 | 低 | §2.2 非目标 + Decision Table 写死；验收按 CLI/Session 出真活 + API 校验通过判定 |
| `ASSET_KINDS` 元组追加破坏既有快照/索引 | 低 | 低 | 追加到元组末尾；跑全量 test 确认无快照漂移 |

## 4. Out-of-Scope（本 phase 不做）

- 碰 `placeholderGenerator` / asset-service 注入的 `deps.generator`（经 REST API 仍 stub，与视频一致）
- **选定 / 接入任何 Suno 第三方网关**（§15 行 1.13；music 留确定性占位，真实接入延后为开放项，待用户后续决定走新 §15 修订）
- 接真编排循环（Phase 8 旧债，另起独立项目）
- 迁 n2m 聚类 / 归类 / 语义映射；改 novels-to-lunascript 本身
- Phase 12 的 `oss-put`（音频工具内联调 OSS 服务，不依赖 Phase 12）
- 引入共享 npm/pip 包；要求 CI E2E

## 5. Acceptance Checklist（对齐 master spec §10 Phase 11）

- [ ] `generate-sfx-elevenlabs` / `generate-music-suno` 在 `agent tools list` 出现，`agent tools show` 输出 schema 完整（结构对等）
- [ ] SFX 单元 / schema / 错误矩阵 ≥ 80% 行覆盖（mock ElevenLabs + mock OSS）；music 占位确定性 + 无副作用测试
- [ ] CLI/Session 跑 `sfx-spec` 出真实 OSS URL（dev key；无 key 记延后 + mock 路径）；跑 `music-spec` 返回确定性占位 `metadata.placeholder=true`（符合 §15 行 1.13，不算缺陷）
- [ ] REST API `create {kind:"music"|"sfx"}` 校验通过、返回 stub（符合非目标）
- [ ] `AssetKind` / `ASSET_KINDS` / `DEFAULT_KIND_SKILL_MAP` / `defaultAssetTypeForKind` 四处 `music`+`sfx` 收口一致
- [ ] `PATH=$HOME/.bun/bin:$PATH bun --cwd=agent run typecheck` / `bun --cwd=agent/packages/opencode run test` 全过；`bun --cwd=web run typecheck` / `bun --cwd=web run build` 全过
- [ ] `knowledge/asset-generation/sfx-spec.md` ≥ 30 行；`music-spec.md` ≥ 30 行且明确标注占位态 + §15 行 1.13
- [ ] `phase-11-audio-production-verification.md` 完成（music 占位 + Suno 接入开放项明确记录）
- [ ] 所有 atomic commit push 到 origin/main
