# Phase 8 — Asset Service 对外 API Plan

> Spec ref: [§ 10 Phase 8](2026-04-29-assets-produce-spec.md#phase-8--asset-service-对外-api--110) / [§ 15 row 1.10](2026-04-29-assets-produce-spec.md#15-修订记录)
> Design doc: [2026-05-14-three-repo-asset-integration-design.md](2026-05-14-three-repo-asset-integration-design.md)
> Date: 2026-05-14

## 0. Decision Table

| Item | Decision | Reason |
|---|---|---|
| Scope boundary | 本 phase 只立 assets-produce 内的对外 API；不接外部仓 | Phase 10 才接外部，先让 API 自洽 |
| Entity 新增 | 仅 `AssetJob`（一张表） | Asset 表 Phase 2 已就位；job 是新概念，独立成表更清晰 |
| Asset 表改动 | 可加 nullable `name` 字段；`kind` 枚举可能补 `cg` / `cover` / `cover_image` | 设计 §4.3 lookup-by-name 与 §11 Phase 8 用例需要 |
| Job 后台执行载体 | 复用 opencode session/runtime；不引入新 worker 框架 | 设计 §5.3 已定；避免引新依赖 |
| Mini agent loop 失控护栏 | step budget + token budget 配置兜底；超限 fail job | 设计 §13 风险 #1 缓解 |
| HTTP 框架 | 复用 opencode 已有 hono server | Phase 5/6 已落地，不另起 |
| MCP server | 在 opencode 已有 MCP server skeleton 上挂 4 tool | 设计 §5.6；不重写 MCP |
| Auth | Bearer token + token → project_id allowlist（config） | 设计 §5.5 |
| Skill body 上线 | 5 份 skill body 草稿写到 `knowledge/asset-generation/`；**不**上传 Langfuse | 设计 §11 / master spec § 2 原则 4 |
| Atomic tool 调用 | 测试一律用 stub atomic tool；不调真实图/视频生成 | 设计 §11 Phase 8 "不做" 第 1 条 |
| OpenAPI 导出 | 自动生成，落盘 `docs/api/openapi.yaml` | 设计 §11 Phase 8 acceptance #4 |
| Callback URL | payload 字段保留但忽略实现 | 设计 §11 Phase 8 "不做" 第 3 条 |

## 1. Deliverables

### 1.1 DB / Entity

- 新增 drizzle migration：建 `AssetJob` 表
  - PK `id` (text, ulid)
  - `project_id` (text, not null)
  - `client_request_id` (text, nullable, unique with project_id)
  - `intent` (jsonb / json text, not null) —— 原始 AssetCreateInput
  - `status` (text enum: `queued` / `running` / `succeeded` / `failed` / `cancelled`)
  - `asset_id` (text, nullable, FK → Asset.id)
  - `error_code` (text, nullable)
  - `error_message` (text, nullable)
  - `langfuse_trace_id` (text, nullable)
  - `step_count` (int, default 0)
  - `token_usage` (int, default 0)
  - `created_at` / `updated_at` (timestamp)
  - 索引：`(project_id, client_request_id)` unique；`(project_id, created_at)` 普通；`status` 普通
- 可能补 Asset 表字段：
  - `name` (text, nullable) —— lookup-by-name 目标
  - 扩 `kind` 枚举：补 `cg`、`cover`（如已有则跳过）
- migration 文件命名遵循已有约定（Phase 2 命名风格）

### 1.2 AssetService 主类

- 文件：`agent/packages/opencode/src/business/asset-service/asset-service.ts`
- 对内 API（不暴露到 HTTP / MCP）：
  - `createJob(input: AssetCreateInput): Promise<AssetJob>` — 同步快返；dedupe 通过 `client_request_id`
  - `getJob(jobId: string): Promise<AssetJobView>` — 读单条；包含 `result` 视图（succeeded 时）或 `error`（failed 时）
  - `lookup(queries: AssetLookupQuery[]): Promise<AssetLookupResult[]>` — 每 query 独立成功/失败
  - `catalogSince(opts: { projectId, cursor?, limit }): Promise<CatalogPage>` — 按 (updated_at, id) cursor 分页
- 后台 worker 起步：`createJob` 写入 db 后通过 in-process 调度（promise + queue + 单 worker，复用 opencode runtime）拉起 `runAssetGeneration`
- 不引入新 db；复用 opencode 已选 drizzle adapter

### 1.3 Mini Agent Loop

- 文件：`agent/packages/opencode/src/business/asset-service/run-asset-generation.ts`
- 入参：`AssetJob`
- 流程语义（设计 §5.3 复述）：
  1. 读 AssetJob.intent → AssetIntent
  2. `intent-to-skill.ts` 选 skill body（一次 LLM 调用：让模型读 intent 选 skill）
  3. 在 opencode session 里以选中 skill 启动 agent loop
  4. agent loop 工具集 = atomic tools（image/video/concat/crop）+ oss put + 读取 ref URL 能力
  5. 终态：写 Asset 行 + 写回 AssetJob.status / asset_id / langfuse_trace_id / step_count / token_usage
- Budget 兜底：
  - `MAX_STEPS_PER_JOB`（默认 30，可配置）
  - `MAX_TOKENS_PER_JOB`（默认 200k，可配置）
  - 超限：fail job，error_code = `BUDGET_EXCEEDED`
- 失败语义：mini loop 抛任何 error → fail job，error_code 见错误码矩阵
- intent-to-skill 选择失败（LLM 拿不到合理 skill）→ fail job，error_code = `NO_MATCHING_SKILL`

### 1.4 Intent-to-Skill 模块

- 文件：`agent/packages/opencode/src/business/asset-service/intent-to-skill.ts`
- 入参：AssetIntent（含 kind / spec_md / constraints / preferences.skill_hint）
- 输出：skill name（字符串，匹配 `knowledge/asset-generation/` 下文件名）
- 实现要点：
  - 优先用 `preferences.skill_hint`（若存在且合法）
  - 否则 LLM prompt：把 kind + spec_md 摘要喂给模型 + 候选 skill 列表（短描述），让模型返回 skill name
  - prompt 模板（本地 markdown，不上 Langfuse）：`agent/packages/opencode/src/business/asset-service/prompts/intent-to-skill.md`
- LLM provider：复用 opencode 已配置主脑（Claude 优先；DeepSeek fallback）

### 1.5 Catalog 模块

- 文件：`agent/packages/opencode/src/business/asset-service/catalog.ts`
- 实现 `lookup` 与 `catalogSince`
- lookup：
  - key-based：精确匹配 `(project_id, key, version=current)`；带 version 时匹配 exact version
  - name-based：精确匹配 → fuzzy substring fallback；name 列上做 ILIKE
  - 每条 query 独立 SELECT；空匹配返回 `asset: null, match_reason: "no_match"`
- catalogSince：
  - cursor 编码 = `updated_at_iso + "/" + asset_id`（base64 可选）
  - 解码 + WHERE `(updated_at, id) > (cursor_ts, cursor_id)`
  - LIMIT + 1 探测 `has_more`；返回 `next_cursor`

### 1.6 HTTP Routes

四条路由全部挂到现有 hono server，路径前缀 `/api/v1/assets`：

- `POST /api/v1/assets/create` → `assets-create.route.ts`
- `GET  /api/v1/assets/jobs/:job_id` → `assets-status.route.ts`
- `POST /api/v1/assets/lookup` → `assets-lookup.route.ts`
- `GET  /api/v1/assets/catalog` → `assets-catalog.route.ts`

每条路由：

- 走统一 Bearer 中间件（设计 §5.5）
- 入参用 zod 校验；错误返回设计 §9.1 错误码
- 出参 schema 用 zod 同时驱动 OpenAPI 自动导出

### 1.7 MCP Tools

复用 opencode 已有 MCP server 框架，新增 4 个 tool：

- `assets.create`
- `assets.status`
- `assets.lookup`
- `assets.catalog_since`

每个 tool 本质是对 AssetService 同名方法的薄封装（不绕 HTTP；进程内直调），返回结构与 REST 同形。

### 1.8 Auth 中间件

- 文件：`agent/packages/opencode/src/business/asset-service/auth.ts`
- 读 `.env`：`ASSETS_API_TOKEN_NOVELS_TO_LUNASCRIPT` / `ASSETS_API_TOKEN_LUNAVERSE_BACKEND` / `ASSETS_API_TOKEN_DEV`
- 启动时构建 `token → { caller_id, allowed_project_ids[] }` 映射；映射写在 config（`agent/packages/opencode/src/config/asset-service.ts`），dev token 可访问所有项目，另两个写死 allowlist（暂用 placeholder project_id，可在 `.env.example` 注释里说明 Phase 10 时替换）
- 中间件：
  - 缺 `Authorization` → 401 `UNAUTHENTICATED`
  - token 不在表 → 401 `UNAUTHENTICATED`
  - token 不允许访问该 project → 403 `FORBIDDEN_PROJECT`
  - 通过 → 把 caller_id 挂到 hono context

### 1.9 Skill Body 草稿

`knowledge/asset-generation/` 下新增 5 份 markdown：

- `character-portrait-spec.md`
- `scene-bg-spec.md`
- `cg-render-spec.md`（Phase 9 会让它引用新 atomic tools；本 phase 仅占位 + 通用流程描述）
- `cover-spec.md`
- `shot-image-from-ls.md`

每份 ≥ 30 行有内容（描述输入 / 期望输出 / 候选 atomic tools / 失败处理）。**不**上传 Langfuse；本 phase 测试用本地 fixture skill 加载器。

### 1.10 OpenAPI 导出

- 文件：`docs/api/openapi.yaml`
- 自动生成（基于 zod schema 用 `@asteasolutions/zod-to-openapi` 或同类工具；如 opencode 已有方案则复用）
- 文件签入 git；后续每次 schema 改动都重新生成

### 1.11 配置 / 文档

- `.env.example` 新增条目（block 标 `# Phase 8 — Asset Service 对外 API`）：
  - `ASSETS_API_TOKEN_NOVELS_TO_LUNASCRIPT=changeme`
  - `ASSETS_API_TOKEN_LUNAVERSE_BACKEND=changeme`
  - `ASSETS_API_TOKEN_DEV=changeme`
  - `ASSETS_SERVICE_MAX_STEPS_PER_JOB=30`
  - `ASSETS_SERVICE_MAX_TOKENS_PER_JOB=200000`
- `SKILL.md` 顶层加一节 "对外 Asset API"，指向 `docs/api/openapi.yaml` 和 Phase 10 接入示例
- `ERRORS.md` 加 §（"asset service 错误码"）映射 §9.1 矩阵
- `knowledge/asset-generation/README.md` 写"草稿态、待 Langfuse 上线"

## 2. Execution Steps

### Step 1 — Baseline Capture

预期输出：

- 记录 `git status` 干净起点
- 记录当前 `bun --cwd=agent run typecheck`、`bun --cwd=agent run test`、`bun --cwd=web run typecheck`、`bun --cwd=web run build` 全过状态
- 记录 hono server 在 `agent serve` 启动后默认监听端口与已挂载路由清单

测试：

- `bun --cwd=agent run typecheck` 全过
- `bun --cwd=agent run test` 全过
- `bun --cwd=web run typecheck` 全过
- `bun --cwd=web run build` 全过
- `agent serve --help`

### Step 2 — DB Migration & Asset Entity 调整

预期输出：

- 新 drizzle migration 建 `AssetJob`
- Asset 表增加 nullable `name` 字段（如不存在）
- Asset 表 `kind` 枚举补 `cg` / `cover`（如不存在）
- 本地 sqlite 与 远端 postgres 两种 driver 都能 migrate up & down 跑通

测试：

- `bun --cwd=agent run db:migrate`（或等价命令）up & down
- 检查 schema：sqlite `.schema AssetJob` / postgres `\d "AssetJob"` 列匹配
- 现有所有 unit / integration test 仍全过

### Step 3 — AssetService 核心实现

预期输出：

- `asset-service.ts`、`asset-job.sql.ts`、`asset-job.repo.ts`、`catalog.ts`、`intent-to-skill.ts`、`run-asset-generation.ts` 全部落盘
- 主要类型 export：`AssetCreateInput` / `AssetJobView` / `AssetLookupQuery` / `AssetLookupResult` / `CatalogPage`
- mini agent loop 跑 stub atomic tool 路径（注入式：测试时传入 stub generator 而非真实 atomic tool）

测试：

- 单元：
  - createJob dedupe（同 client_request_id 返回同一 job）
  - createJob 写入正确 status=queued
  - getJob 不存在 → throws NOT_FOUND
  - lookup key 命中 / 命中 version / name 命中 / 无匹配
  - catalogSince 第一页 / 翻页 / has_more=false
  - intent-to-skill：preferences.skill_hint 命中走捷径；走 LLM 路径用 mock LLM 校验 prompt 形态
  - run-asset-generation：stub atomic tool 成功路径 → 写 Asset + AssetJob.succeeded
  - budget 兜底：步数超限 → fail BUDGET_EXCEEDED
- 单元覆盖目标 ≥ 80%（在 `bun --cwd=agent run test:coverage` 或等价工具下确认）

### Step 4 — HTTP Routes 与 Auth 中间件

预期输出：

- 4 个路由文件落盘
- 路由挂到现有 hono server
- Bearer auth 中间件落盘并接到 4 个路由前
- zod schema 同时驱动校验与 OpenAPI 生成
- 错误响应统一形态 `{ error: { code, message } }`

测试：

- 单元（hono testClient）：
  - 401 缺 Authorization
  - 401 token 不对
  - 403 token 不允许该 project
  - 400 入参不合法（每个端点至少 1 条）
  - 404 job_id / asset 不存在
  - 200 happy path（4 个端点各 1 条）
- 集成（in-memory sqlite + stub atomic tool）：
  - create → 状态 queued → poll → succeeded → lookup 拿到 url
  - catalog 跨页翻完

### Step 5 — MCP Tools 挂载

预期输出：

- 4 个 MCP tool 实现（直调 AssetService）
- 注册到现有 MCP server
- MCP tool schema 与 REST 输入输出一致

测试：

- 启 `agent serve`（MCP 模式）→ MCP client (e.g. mcp-inspector 或脚本) 列出 4 tool
- 各 tool 跑一次 stub 路径，返回正确 JSON
- 单元：tool handler 直接调用 AssetService 不绕 HTTP（避免双重 auth 校验）

### Step 6 — Skill Body 草稿与 Knowledge Pack

预期输出：

- 5 份 markdown 落盘 `knowledge/asset-generation/`
- 每份 ≥ 30 行；内容含：
  - 该 skill 的 intent 范围（什么类型 asset 用它）
  - 候选 atomic tools 列表
  - 经典输入 / 期望输出形态
  - 失败处理（content filter / spec 不可行）
  - 与其它 skill 的边界
- `knowledge/asset-generation/README.md` 标"草稿态、Phase 10 后视需求 sync 到 Langfuse"

测试：

- `wc -l knowledge/asset-generation/*.md` 每份 ≥ 30
- intent-to-skill LLM mock 测试能识别 5 份 skill name
- markdown 无破损（用 remark-cli 或等价 lint 工具）

### Step 7 — OpenAPI 自动导出

预期输出：

- `docs/api/openapi.yaml` 生成脚本（`bun --cwd=agent run openapi:generate` 或等价）
- 生成产物签入 git
- CI 校验生成产物与最新 schema 一致（添加 `bun --cwd=agent run openapi:check` 步骤；如 CI 还没接 phase 6 后再补，至少本地脚本能跑）

测试：

- `openapi-cli validate docs/api/openapi.yaml`（或 `redocly lint`）
- 跑生成脚本后 `git diff` 为空（保证签入产物即最新）

### Step 8 — 配置与文档

预期输出：

- `.env.example` 新增 5 个变量 + block 注释
- `SKILL.md` 新增 "对外 Asset API" 节
- `ERRORS.md` 新增 "Asset Service 错误码" 节
- `knowledge/asset-generation/README.md` 落盘

测试：

- `grep ASSETS_API_TOKEN .env.example | wc -l` ≥ 3
- `grep -c "对外 Asset API" SKILL.md` ≥ 1
- `grep -c "Asset Service" ERRORS.md` ≥ 1

### Step 9 — Langfuse Trace 验证

预期输出：

- 跑一次 stub job（用 dev token + 本地 stub atomic tool）跑完
- AssetJob.langfuse_trace_id 非空
- Langfuse UI（`https://prompt.mobai-game.com`）可定位到该 trace，包含：root span `asset_job_<id>`、intent-to-skill LLM span、stub atomic tool span（≥1）

测试：

- 本机跑：`agent serve` → `curl -X POST /api/v1/assets/create` → 拿到 job_id → poll
- 用户手动开 Langfuse UI 截图 1 条 trace 作为 verification 附件（人工 verify）

### Step 10 — Acceptance 自检

预期输出：

- 把所有 Phase 8 验收项跑一遍：
  1. typecheck / test 全过
  2. `agent serve` + 4 端点 curl 全通（stub）
  3. coverage ≥ 80%
  4. OpenAPI validate 过
  5. MCP tools listable
  6. 5 skill body 各 ≥ 30 行
  7. Langfuse trace 可见
- 写 `phase-8-asset-service-api-verification.md`：逐条对验收项打勾或解释偏差

测试：

- 重跑：`bun --cwd=agent run typecheck && bun --cwd=agent run test && bun --cwd=agent run build`
- 重跑：`bun --cwd=web run typecheck && bun --cwd=web run build`
- `openapi-cli validate docs/api/openapi.yaml`
- E2E curl 序列（脚本：`scripts/e2e/phase-8-smoke.sh` 可选）

### Step 11 — Commit / Push

预期输出：

- 多个 atomic commit，按文件群划分：
  1. db migration + Asset/AssetJob entity
  2. asset-service 核心模块（service + repo + intent-to-skill + run-asset-generation + catalog + auth）
  3. http routes
  4. mcp tools
  5. skill body 草稿 + knowledge README
  6. openapi 导出脚本 + 产物
  7. config / docs / .env.example
  8. verification report
- 每个 commit 单独 push（项目 CLAUDE.md "push 频繁"）

测试：

- `git log --oneline main..HEAD` 看每个 commit 单一变更面
- `git push origin main`（remote 是 cdotlock，按 Phase 7 同样需向用户征得 push 同意 —— 本 phase 执行入口处问一次）

## 3. Risks

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| in-process worker 在 dev 环境与 prod 行为不一致（多进程时 job 串扰） | 中 | 中 | 把 worker 调度集中在一处；env 标识"单进程 only"；多进程留 Phase 11+ |
| Asset 表加 `name` 字段触发现有 unique 约束冲突 | 低 | 低 | nullable 字段；不加 unique；migration 先跑 dev 验证 |
| intent-to-skill LLM 选错 skill 把整个 loop 拐错 | 中 | 中 | 测试用 mock LLM 锁定选择；prod 用 Langfuse 监控 skill 选择分布 |
| budget 兜底误杀正常长任务 | 中 | 低 | 默认值偏宽（30 步 / 200k tokens）；env 可调；fail 时 error_code 明确，调用方易识别 |
| MCP tool 与 REST 行为漂移 | 中 | 中 | 共享 AssetService 后端；schema 同源；测试覆盖两个入口同一场景 |
| OpenAPI 生成器 zod 兼容性 | 低 | 低 | 提前用 phase 6 已有 zod 版本验证；如不兼容退一档手写最小 spec |

## 4. Out-of-Scope（本 phase 不做）

- 调用真实图片 / 视频 / CG 生成（一律 stub）
- 接 novels-to-lunascript 或 lunaverse-backend（Phase 10）
- 把 5 份 skill body 上传 Langfuse（按用户明确指令再做）
- callback_url 字段的真实回调（payload 接受但忽略）
- 计量 / 计费 / 多租户 / 配额
- 跨进程 worker / 高可用 / 重试策略

## 5. Acceptance Checklist（对齐 master spec §10 Phase 8）

- [ ] `bun --cwd=agent run typecheck` 全过
- [ ] `bun --cwd=agent run test` 全过
- [ ] `bun --cwd=web run typecheck` / `bun --cwd=web run build` 全过
- [ ] `agent serve` 启动后 4 个 REST 端点 curl 全通（stub atomic tool）
- [ ] AssetService unit + integration coverage ≥ 80%
- [ ] HTTP route handler 覆盖错误码矩阵（401 / 403 / 400 / 404 / 200）
- [ ] `docs/api/openapi.yaml` 存在且 `openapi-cli validate` 过
- [ ] `agent serve` 后 MCP client 能列出 `assets.create` / `assets.status` / `assets.lookup` / `assets.catalog_since`
- [ ] `knowledge/asset-generation/` 下 5 份 skill body 草稿，每份 ≥ 30 行
- [ ] 一次 stub job 跑完，Langfuse UI 可见 trace（人工 verify）
- [ ] `phase-8-asset-service-api-verification.md` 完成
- [ ] 所有 atomic commit 已 push 到 origin/main
