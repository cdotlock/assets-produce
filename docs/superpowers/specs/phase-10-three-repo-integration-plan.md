# Phase 10 — 三方接通 Plan

> Spec ref: [§ 10 Phase 10](2026-04-29-assets-produce-spec.md#phase-10--三方接通--110) / [§ 15 row 1.10](2026-04-29-assets-produce-spec.md#15-修订记录)
> Design doc: [2026-05-14-three-repo-asset-integration-design.md](2026-05-14-three-repo-asset-integration-design.md) § 11 Phase 10
> Date: 2026-05-14
> 前置依赖：Phase 8 完成（4 个对外操作可调）；Phase 9 完成（CG / OSS-sync / upscale 已迁到 assets-produce）

## 0. Decision Table

| Item | Decision | Reason |
|---|---|---|
| 三仓接通范围 | novels-to-moonscript：只调 lookup；moonshort-backend：4 个操作全用 | 设计 §6 / §7 |
| 共享 library | 不引入；三仓 client 各自实现 | 设计 §2.2 非目标第 2 条 / §11 Phase 10 "不做" 第 4 条 |
| moonshort-backend 改动面 | 仅 `agent-forge-client.ts` real branch + 新 `assets-produce-http.ts`；不动 `assets-remix-service.ts` 接口 | 设计 §7.1 / §7.2 |
| Feature flag | 沿用现有 `ASSETS_REMIX_MODE`（`stub` / `real`）；新增 real mode 不强制默认开启 | 设计 §11 Phase 10 "不做" 第 1 条 |
| Backend repo push | 必须 backend 维护方明确 ack 才 push（global CLAUDE.md 跨仓 push 规则） | 用户全局规则 |
| novels-to-moonscript MSS schema | `asset_ref` 加可选字段 `id` / `name` / `kind`，向后兼容；旧 MSS 仍合法 | 设计 §6.2 |
| novels-to-moonscript lookup 触发 | 默认 off；CLI flag `--resolve-assets` on | 设计 §6.2 / §11 Phase 10 范围 |
| Token 持有 | 三仓各自一份 token 在自己 `.env`；assets-produce 内 `.env` 配置映射 | 设计 §5.5 / §11 Phase 10 范围 |
| Ops doc | 新增 `docs/ops/three-repo-token-flow.md`：token 怎么发 / 怎么 rotate | 设计 §11 Phase 10 范围 |
| E2E | 用户本机手动一条 e2e 走通；不入 CI | 设计 §11 Phase 10 acceptance #4 / "不做" 第 5 条 |
| 失败重试 | assets-produce 内不自动重试；backend 用既有 BullMQ；novels-to-moonscript 仅 warn 不重试 | 设计 §9.2 |

## 1. Deliverables

### 1.1 assets-produce 内改动

#### 1.1.1 Token allowlist 实配

Phase 8 留的 `agent/packages/opencode/src/config/asset-service.ts` token → project_id 映射，在本 phase 改成真实 project_id：

- `ASSETS_API_TOKEN_NOVELS_TO_MOONSCRIPT` → 允许 `novel_*` 前缀 project_id（或具体 allowlist）
- `ASSETS_API_TOKEN_MOONSHORT_BACKEND` → 允许 `novel_*` 前缀 project_id（小说 → episode → asset 链路；与上同范围）
- `ASSETS_API_TOKEN_DEV` → 全部允许

具体 project_id 命名约定由本 phase 收口（建议：`<source>_<slug>`，如 `novel_silver_moon_manor`）。

#### 1.1.2 Ops 文档

新增 `docs/ops/three-repo-token-flow.md`：

- 三个 token 的发放、rotate、紧急吊销流程
- assets-produce server 部署位置（dev / staging / prod 各 base url）
- 三仓 `.env.example` 对照表
- 故障排查：401 / 403 / 网络错的常见原因

#### 1.1.3 README

`README.md` 顶层增补一节 "对外 Asset 服务（三仓接入）"：

- 简要说明 4 个操作 + base url 占位
- 指向 Phase 10 ops doc 与 OpenAPI spec

#### 1.1.4 .env.example

无需新加 token 条目（Phase 8 已写）。本 phase 在 token 旁的注释里填入 Phase 10 落地的 project_id allowlist 示例。

#### 1.1.5 单元/集成测试补充

- AssetService catalogSince 在多 project_id 隔离下的 query 正确性
- HTTP route auth 中间件在 "token 跨 project 越权" 场景的 403

### 1.2 novels-to-moonscript 内改动

#### 1.2.1 新增 `src/clients/assets_produce_client.py`

- 单文件 Python HTTP client
- 类 `AssetsProduceClient`：
  - 构造：`base_url` + `token`（从 env 注入）
  - 方法：`lookup(project_id, queries)` → `list[AssetLookupResult]`
- 不实现 `create` / `status` / `catalog_since`（小说生成阶段不主动触发生产）
- 网络层：`requests` + retry/backoff（指数退避 3 次）
- 错误：
  - 401 / 403 抛 `AssetsProduceAuthError`
  - 4xx 抛 `AssetsProduceBadRequest`
  - 5xx / 超时 / 网络错抛 `AssetsProduceUnavailable`
- Type hints + docstring

#### 1.2.2 MSS schema 调整

- `asset_ref` 节点 schema 增加可选字段：
  - `id` (string, optional)
  - `name` (string, optional)
  - `kind` (string, optional, enum: `character_portrait` / `scene_bg` / `cg` / `cover` / `shot_image` / `shot_video`)
- 旧 MSS（不带这些字段）仍合法
- schema validator（Pydantic / json-schema / 现有方案）同步

#### 1.2.3 asset_ref 写出器

- 在 MSS 生成过程中，每个 asset_ref 节点：
  - 填 `kind`（按上下文推断；如已有用户标注则用用户的）
  - 填 `name`（稳定可读的名字，如 "Sylvia 立绘"）
  - 不填 `id`（id 是 assets-produce 内部生成的 Asset.id，下游 lookup 拿）

#### 1.2.4 MSS 验证器 `--resolve-assets` flag

- 现有 mss-verify CLI 加 flag `--resolve-assets`
- on：
  - 把所有 `asset_ref` 收集；按 `kind + key`（或 `name`）调 lookup
  - 命中：把 `url` 字段填回（不覆盖已有非空 url）
  - 未命中：print warn + 留空（不 fail）
  - 写出新 MSS（保留输入 MSS；输出到 `<input>.resolved.json`）
- 默认 off：行为不变

#### 1.2.5 配置

- `.env.example` 新增（block 标 `# Phase 10 — assets-produce integration`）：
  - `ASSETS_PRODUCE_BASE_URL=http://localhost:8001`（dev 默认）
  - `ASSETS_PRODUCE_TOKEN=changeme`

#### 1.2.6 README 接入说明

- novels-to-moonscript README 新增一节 "下游 assets-produce 接入"：
  - 写明 `ASSETS_PRODUCE_*` 配置
  - 写明 `mss-verify --resolve-assets` 示例
  - 写明"小说生成阶段不主动触发 asset 生产；asset 生产由 backend remix 时触发"

#### 1.2.7 单元测试

`tests/clients/test_assets_produce_client.py`：

- happy path（mock HTTP server 返回 lookup results）
- 401 → AssetsProduceAuthError
- 403 → AssetsProduceAuthError
- 404 单 query → result.asset = null
- 网络错 → AssetsProduceUnavailable
- retry/backoff 在 5xx 下生效；3 次后仍 fail → unavailable

### 1.3 moonshort-backend 内改动

设计 §7：**最小改动**；不是用户维护。

#### 1.3.1 新增 `app/upstream/assets-produce-http.ts`

- 单文件 TS HTTP client
- 导出函数（与 `agent-forge-client.ts` 接口同形）：
  - `createAsset(input): Promise<{ job_id, status, key, version }>`
  - `pollAsset(job_id): Promise<{ status, result?, error? }>`
  - `lookupAssets(queries): Promise<AssetLookupResult[]>`
  - `catalogSince(opts): Promise<CatalogPage>` （preserved for future use；本 phase 不调）
- 网络层：fetch + AbortSignal timeout；重试由调用方（BullMQ outbox）决定
- 错误：
  - 401 / 403 → `AssetsProduceAuthError`
  - 4xx → `AssetsProduceBadRequest`
  - 5xx / 超时 → `AssetsProduceUnavailable`

#### 1.3.2 修改 `app/upstream/agent-forge-client.ts`

变更内容：

- 文件顶 docstring 标 "agent-forge 已废弃；real mode 现连接 assets-produce"
- `real` 分支：
  - 删除 `throw new AgentForgeUnavailableError(...)`
  - dispatch 到 `assets-produce-http.ts`：
    - `lookupAssets` → `assetsProduceHttp.lookupAssets`
    - `createAsset` → `assetsProduceHttp.createAsset`
    - `pollAsset` → `assetsProduceHttp.pollAsset`
- 错误透传：`AssetsProduceAuthError` / `BadRequest` / `Unavailable` 映射到现有 service 层期待的错误类（如有），否则直接抛
- `stub` 分支保留不动
- mode 选择仍由 `ASSETS_REMIX_MODE=stub|real` env 控制

#### 1.3.3 不动 `app/services/assets-remix-service.ts` 接口

- 设计 §7.1：仅可选在 `pollAssetsRemix` 失败分支增加 `error_code` 透传（如果 `AssetsProduceHttp` 返回新的 error_code，现有 service 已有 fallback path）
- 如果 service 本身已经接 `agent-forge-client.ts` 的现有错误形态正确，本 phase **不改 service**

#### 1.3.4 配置

- `.env.example` 新增（block 标 `# Phase 10 — assets-produce integration`）：
  - `ASSETS_PRODUCE_BASE_URL=http://localhost:8001`
  - `ASSETS_PRODUCE_TOKEN=changeme`
- 保留现有 `ASSETS_REMIX_MODE`；注释里说明 `real` 现在连 assets-produce

#### 1.3.5 README 切换说明

- backend README 新增 "ASSETS_REMIX_MODE=real 切到 assets-produce" 一节：
  - 配置 env
  - 验证：触发一次 remix → 看 BullMQ outbox 调通 assets-produce
  - 回退：`ASSETS_REMIX_MODE=stub`

#### 1.3.6 单元测试

`tests/upstream/assets-produce-http.test.ts`：

- mock fetch；4 个方法 happy path
- 401 / 403 / 4xx / 5xx / 超时 错误分支
- payload 形态对齐 assets-produce OpenAPI spec（可用 spec 生成的 type 校验）

## 2. Execution Steps

### Step 1 — Baseline Capture（三仓）

预期输出：

- assets-produce：确认 Phase 8 + Phase 9 acceptance 全过；`agent serve` 起 server 拿到本地 base url
- novels-to-moonscript：`git status` 干净；现有测试全过
- moonshort-backend：`git status` 干净；现有测试全过；记录 `agent-forge-client.ts` 当前内容；记录 `ASSETS_REMIX_MODE` 在仓内的引用点
- 三仓的 OSS bucket / 凭据是否 alignment（assets-produce 写、其他读）

测试：

- assets-produce: `bun --cwd=agent run test`
- novels-to-moonscript: 项目实际 test 入口（pytest / npm test / etc.）
- moonshort-backend: 项目实际 test 入口
- `curl http://localhost:8001/api/v1/assets/lookup -H "Authorization: Bearer $ASSETS_API_TOKEN_DEV" -d '{"project_id":"...","queries":[]}'` 返回合理空 results

### Step 2 — assets-produce token allowlist 实配 + ops doc

预期输出：

- `agent/packages/opencode/src/config/asset-service.ts` token 映射改成真实 project_id 规则
- `docs/ops/three-repo-token-flow.md` 落盘
- `README.md` 顶层增补 "对外 Asset 服务" 节
- `.env.example` token 注释里写入 project_id allowlist 示例

测试：

- `bun --cwd=agent run typecheck` 全过
- `bun --cwd=agent run test` 全过（auth 中间件测试覆盖 "token 跨 project 越权 → 403"）
- `cat docs/ops/three-repo-token-flow.md | head -20` 内容合理
- `grep "对外 Asset 服务" README.md`

### Step 3 — novels-to-moonscript client 实现

预期输出：

- `src/clients/assets_produce_client.py` 落盘
- 错误类型定义清晰
- retry/backoff 实现
- type hints + docstring

测试：

- `tests/clients/test_assets_produce_client.py` 覆盖 happy + 错误矩阵
- `pytest tests/clients/` 全过
- 项目原有测试不破坏

### Step 4 — novels-to-moonscript MSS schema 调整 + asset_ref 写出器

预期输出：

- MSS schema 中 `asset_ref` 加可选 `id` / `name` / `kind`
- schema validator 同步
- asset_ref 写出器在生成过程中填 `kind` 与 `name`
- 旧 MSS（不带新字段）仍合法（schema test 验证）

测试：

- schema validation：新 MSS + 旧 MSS 都通过
- asset_ref 生成器单元测试：给定上下文 → 期望的 `kind` / `name`
- 现有 MSS 生成 e2e 测试全过

### Step 5 — novels-to-moonscript `mss-verify --resolve-assets` flag

预期输出：

- CLI 加 flag；on 时调 lookup 填 url；off 时行为不变
- 输入 MSS 保留；输出到 `<input>.resolved.json`
- 未命中 query 仅 warn

测试：

- CLI 单元测试：flag on + mock client 返回部分命中 → 输出 MSS 部分 url 被填
- flag off → 输出 MSS 与输入相同
- 未命中的 asset_ref → stderr warn + 仍写出（不 fail）

### Step 6 — novels-to-moonscript 配置 + README

预期输出：

- `.env.example` 加 2 个变量
- README 加 "下游 assets-produce 接入" 节
- 旧的占位 asset_ref 写出（如有）标 deprecated 但不删

测试：

- `grep ASSETS_PRODUCE .env.example | wc -l` ≥ 2
- `grep "下游 assets-produce 接入" README.md`

### Step 7 — moonshort-backend `assets-produce-http.ts` 实现

预期输出：

- `app/upstream/assets-produce-http.ts` 落盘
- 4 个方法 + 错误类型
- 不依赖共享 lib；自包含

测试：

- `tests/upstream/assets-produce-http.test.ts` 覆盖 happy + 错误矩阵
- backend 项目原有 typecheck / test 全过

### Step 8 — moonshort-backend `agent-forge-client.ts` real branch 改造

预期输出：

- 文件顶部 docstring 更新
- `real` 分支 throw 改为 dispatch 到 `assets-produce-http.ts`
- 错误透传清晰
- `stub` 分支不变
- `ASSETS_REMIX_MODE` 切换仍生效

测试：

- 单元测试：
  - `ASSETS_REMIX_MODE=stub` → 走旧 stub 路径
  - `ASSETS_REMIX_MODE=real` + mock assets-produce-http → 4 个方法 happy 走通
  - `real` mode + http 抛 AuthError → service 收到合理 error
- backend 仓现有 `tests/upstream/` 套件全过

### Step 9 — moonshort-backend 配置 + README

预期输出：

- `.env.example` 加 2 个 `ASSETS_PRODUCE_*` 变量
- README 加 "ASSETS_REMIX_MODE=real 切换说明"
- 现有 `ASSETS_REMIX_MODE` 注释里说明 real 现在连 assets-produce

测试：

- `grep ASSETS_PRODUCE .env.example | wc -l` ≥ 2

### Step 10 — 一条本地 e2e

预期输出：

- 在本机起：
  - assets-produce `agent serve`（dev token）
  - moonshort-backend dev 模式 + `ASSETS_REMIX_MODE=real` + 指向本地 assets-produce
  - novels-to-moonscript 跑一个 fixture 小说 → 生成 MSS（含 asset_ref）→ mss-verify --resolve-assets
- 流程：
  1. 用户在 backend 触发一次 remix（按 backend 现有触发方式：API call 或 fixture trigger）
  2. backend outbox → agent-forge-client.real → assets-produce.create
  3. assets-produce mini agent loop（stub atomic tool；不调真实 ZENMUX / nanobanana）跑完
  4. backend poll → succeeded + url
  5. backend 写 RemixAsset.url
  6. 用 novels-to-moonscript mss-verify --resolve-assets 拉回相同 key → url 拿到

记录：

- 三仓各自的命令、env、日志摘要
- 关键 Langfuse trace 链接
- 任何 fail-fast 改动（如果发现 bug，要在本 phase 修完）

测试：

- 手动 e2e 跑通；产出 `docs/superpowers/specs/phase-10-e2e-log.md` 记录步骤与命令
- 写明本机环境（Node / Bun / Python 版本）

### Step 11 — Backend 维护方 ack 与 push

预期输出：

- 三仓本地 commit 都就位
- assets-produce：commit + push（remote 是 cdotlock，需要用户 ack；执行入口处问一次）
- novels-to-moonscript：commit + push（remote 应在用户 namespace；无需额外 ack；如不在，同样需问）
- moonshort-backend：commit 已就位；push **必须** backend 维护方明确同意后再推

具体操作：

1. 列 backend 仓内修改清单（含 Phase 9 Step 9 的 DEPRECATED 注释 + 本 phase 的 client 改造）
2. 准备一份提交给 backend 维护方的 commit 摘要
3. 用户对接 backend 维护方拿 ack
4. ack 到手后 push

测试：

- 三仓 `git log --oneline main..HEAD` 看每个 commit 单一变更面
- 三仓各自的 typecheck / test / build 都过

### Step 12 — Acceptance 自检 + Verification

预期输出：

- 跑所有 Phase 10 验收项
- 写 `phase-10-three-repo-integration-verification.md`
- 把 e2e log 引用进去

测试：

- 见 §5 Acceptance Checklist

## 3. Risks

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| backend 维护方拒绝 client 改造 | 低 | 中 | 改动隔离在 client 文件；feature flag 默认 stub；改动单独 PR；接受拒绝就停在 stub mode |
| backend 仓 push 政策（require PR / required reviews） | 中 | 低 | 不强行 push；提交 PR 走流程；本 phase 接受"client 改完但 backend 仓未合并"作为软完成 |
| novels-to-moonscript 与 assets-produce key 命名不一致导致 lookup 大量 miss | 中 | 中 | Step 4 起 key 命名约定文档（`docs/ops/three-repo-token-flow.md` 同处写）；两侧测试用同套 fixture key |
| dev 环境 base url 漂移（本地 / staging） | 中 | 低 | 三仓 `.env.example` 默认 `localhost:8001`；ops doc 明确各环境 base url |
| Langfuse trace 量爆增 | 低 | 低 | Langfuse 项目 free tier 内观察；超量切自托管或抽样 |
| MSS 旧文件被新 schema 拒绝 | 中 | 中 | 新字段一律 optional；新增 schema 测试用旧 fixture 校验 |
| backend `assets-remix-service.ts` 隐式依赖旧 throw 行为 | 中 | 中 | Step 7-8 跑 backend 现有 service 套件；任何 fail 都在 client 层补偿，service 层不动 |

## 4. Out-of-Scope（本 phase 不做）

- backend `ASSETS_REMIX_MODE` 默认开 `real`（由 backend 维护方决定）
- 改 backend BullMQ / outbox / 任何 service-level 逻辑
- 删 backend `generate-upscale-matting/`
- 引入共享 npm / pip 包（三仓 client 各自实现，避免 supply chain）
- CI 接 E2E 套件
- assets-produce 多进程 worker / 高可用 / SLA
- 计量 / 计费 / 多租户 / 配额

## 5. Acceptance Checklist（对齐 master spec §10 Phase 10）

- [ ] assets-produce Phase 8 + 9 + 10 全部 unit / integration 测试 全过
- [ ] novels-to-moonscript `assets_produce_client.py` 单元覆盖 happy / 404 / 401 / 403 / 网络错
- [ ] moonshort-backend `assets-produce-http.ts` 单元覆盖 4 个操作 + 错误矩阵
- [ ] backend `agent-forge-client.ts` real branch 测试覆盖 `ASSETS_REMIX_MODE` 切换
- [ ] 用户本机一条 e2e 走通：MSS 生成 → backend remix → assets-produce real → 拿到 url → 小程序看到图
- [ ] `docs/ops/three-repo-token-flow.md` 落盘且 ≥ 40 行
- [ ] assets-produce 跑一周观察（用户人工 verify）：mini agent loop step / token 在 budget 内
- [ ] `phase-10-three-repo-integration-verification.md` 完成
- [ ] assets-produce 所有 atomic commit 已 push 到 origin/main（remote = cdotlock，需用户 ack）
- [ ] novels-to-moonscript 所有 atomic commit 已 push（按用户 namespace 规则）
- [ ] moonshort-backend 所有 atomic commit 已就位；push 须 backend 维护方明确 ack 后执行
