# Phase 11 — 音频生产（music / sfx）Plan

> Spec ref: [§ 10 Phase 11](2026-04-29-assets-produce-spec.md#phase-11--音频生产music--sfx-112) / [§ 15 row 1.12](2026-04-29-assets-produce-spec.md#15-修订记录)
> Design doc: [2026-05-15-audio-and-asset-parity-design.md](2026-05-15-audio-and-asset-parity-design.md) § 4
> Date: 2026-05-15
> 前置依赖：Phase 8 完成（AssetService / atomic tool 注册框架 / intent-to-skill / asset-service API 就位）；Phase 2 OSS 服务（`agent/packages/opencode/src/oss/oss.ts`）就位。**不依赖 Phase 12**（音频工具内联复用 Phase 2 OSS 服务，不经 oss-put）。

## 0. Decision Table

| Item | Decision | Reason |
|---|---|---|
| 范围 | 两个原子工具：`generate-sfx-elevenlabs`（ElevenLabs）+ `generate-music-suno`（Suno）| 设计 §4.1；音效仅移植 n2m 现成合成调用，音乐无现成生成器→新建薄壳 |
| 工具样板 | 严格复刻 `agent/packages/opencode/src/tool/asset/generate-video-seedance.ts` + `.txt` | 设计 §3「严格对等」；Effect + Schema + `never` 错误通道 |
| 音频 → OSS | 工具内部**内联复用** Phase 2 OSS 服务（`src/oss/oss.ts`）上传、返回永久 OSS https URL | 设计 §4.2；Suno/ElevenLabs 返回字节/临时链非 OSS；这让 Phase 11 不依赖 Phase 12 |
| Suno 调用 | 直连 Suno HTTPS API（非 FC 端点）；带 `dryRun` / `--mock` 确定性路径 | 设计 §4.1；FC 端点是图像/视频专用 |
| ElevenLabs 抽离边界 | 只移植 novels-to-moonscript 的「声效合成 HTTP 调用」；**不**带其归类/语义映射 | 设计 §2.2 / §9.2；禁 import n2m |
| AssetKind 扩展 | `types.ts` 的 `AssetKind` union + `ASSET_KINDS` 元组追加 `"music"` `"sfx"` | 设计 §4.3；asset-service `z.enum(ASSET_KINDS)` 自动收口，API 层零改 |
| AssetType | 不改类型；music/sfx 经 `defaultAssetTypeForKind()` → 已有的 `"audio"` | 设计 §3；`AssetType` union 已含 audio |
| skill body | `knowledge/asset-generation/` 新增 `music-spec.md` / `sfx-spec.md`（6 段式）| 设计 §4.3；本地自包含，不上 Langfuse |
| placeholderGenerator | **不碰**；经 REST API 仍返回 stub（与视频现状一致）| 设计 §2.2 选项 B（用户 2026-05-15 锁定）|
| 真实上游调用 | 测试一律 mock 上游 HTTP + mock OSS；dev key 手动 verify 不入测试套件 | 设计 §8；沿用 Phase 8/9 惯例 |
| 实现顺序 | sfx（有 n2m 现成参考，先打通 wrapper 模式）→ music（新建，复用同模式）| 降风险：先移植已验证的，再新建 |

## 1. Deliverables

### 1.1 调研产物（执行前置，落 `docs/superpowers/specs/phase-11-survey.md`）

- novels-to-moonscript 内 ElevenLabs 声效合成调用实际位置 / 函数 / 入参 / env（grep 现场清单），明确「只移植合成 HTTP 调用、不拖归类」的抽离边界
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
- 同 §1.2 形状，复用 §1.2 建立的 wrapper 模式
- 输入 schema：`prompt`、`duration_seconds`（上限）、可选 `style` / `instrumental` flag、`dryRun`
- 内部：直连 Suno HTTPS API（若 Suno 异步则工具内封装 job poll + 超时）→ 拿音频 → 内联调 Phase 2 OSS 服务上传 → 返回 OSS URL
- `dryRun` / `--mock`：确定性占位

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
- novels-to-moonscript ElevenLabs 声效合成调用实际文件 / 函数 / 入参 / env 清单 + 抽离边界
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

### Step 4 — `generate-music-suno` 原子工具（TDD）

预期输出：

- `generate-music-suno.ts` + `.txt` 落盘，复用 Step 2 wrapper 模式
- Suno 异步 job poll（如适用）在工具内封装 + 超时折叠
- 内联调 Phase 2 OSS 服务、返回 OSS URL

测试：

- 单元：mock Suno HTTP（含 poll）+ mock OSS → 返回 OSS URL 形状
- schema 测试：非法 prompt / duration 越界 / 缺参
- `dryRun` 确定性占位
- 错误折叠：Suno 鉴权失败 / 5xx / poll 超时 → 折进结果不抛
- `bun --cwd=agent run typecheck` 全过

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

- `agent` 会话加载 `music-spec` → LLM 调 `generate-music-suno` → 真实 Suno → 真实 OSS URL（dev key）
- 同 `sfx-spec` → `generate-sfx-elevenlabs` → 真实 OSS URL
- REST API `create {kind:music|sfx}` 校验通过、返回 stub（符合非目标，记入 verification）

测试：

- 本机：`agent run`（session）跑 `music-spec` / `sfx-spec` 各出 1 个可访问 OSS URL
- `curl -X POST /api/v1/assets/create {kind:"music"}` → 200 + stub url（kind 校验通过）
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
| Suno 商用授权（音乐随 App 发终端用户）| 中 | 高 | 假设用户用带商用权 Suno 付费计划；记 ops 开放项；Step 1 确认 endpoint/鉴权；非设计阻塞 |
| Suno API 异步 / 限流 / 可能需第三方网关 | 中 | 中 | Step 1 调研确认；工具内封装 job poll + 超时折叠为错误；endpoint 走 env 不硬编码 |
| 从 n2m 抽 ElevenLabs 误拖归类耦合 | 中 | 中 | 抽离边界在 Step 1 写死（只移植合成 HTTP 调用）；禁 import n2m；grep 全调用面 |
| 音频二进制体积 / content-type / 时长 | 中 | 中 | 输入 schema 卡时长上限；OSS 上传显式设 content-type；超限折叠为错误 |
| 经 REST API 仍 stub 被误判「没做完」| 中 | 低 | §2.2 非目标 + Decision Table 写死；验收按 CLI/Session 出真活 + API 校验通过判定 |
| `ASSET_KINDS` 元组追加破坏既有快照/索引 | 低 | 低 | 追加到元组末尾；跑全量 test 确认无快照漂移 |

## 4. Out-of-Scope（本 phase 不做）

- 碰 `placeholderGenerator` / asset-service 注入的 `deps.generator`（经 REST API 仍 stub，与视频一致）
- 接真编排循环（Phase 8 旧债，另起独立项目）
- 迁 n2m 聚类 / 归类 / 语义映射；改 novels-to-moonscript 本身
- Phase 12 的 `oss-put`（音频工具内联调 OSS 服务，不依赖 Phase 12）
- 引入共享 npm/pip 包；要求 CI E2E

## 5. Acceptance Checklist（对齐 master spec §10 Phase 11）

- [ ] `generate-music-suno` / `generate-sfx-elevenlabs` 在 `agent tools list` 出现，`agent tools show` 输出 schema 完整
- [ ] 单元 / schema / 错误矩阵 ≥ 80% 行覆盖；mock 上游 + mock OSS
- [ ] CLI/Session 跑 `music-spec` / `sfx-spec` 出真实 OSS URL（dev key）
- [ ] REST API `create {kind:"music"|"sfx"}` 校验通过、返回 stub（符合非目标）
- [ ] `AssetKind` / `ASSET_KINDS` / `DEFAULT_KIND_SKILL_MAP` / `defaultAssetTypeForKind` 四处收口一致
- [ ] `bun --cwd=agent run typecheck` / `bun --cwd=agent run test` 全过；`bun --cwd=web run typecheck` / `bun --cwd=web run build` 全过
- [ ] `knowledge/asset-generation/music-spec.md` / `sfx-spec.md` 各 ≥ 30 行
- [ ] `phase-11-audio-production-verification.md` 完成
- [ ] 所有 atomic commit push 到 origin/main
