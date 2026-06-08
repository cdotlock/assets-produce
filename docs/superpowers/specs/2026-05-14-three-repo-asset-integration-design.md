# Three-Repo Asset Integration Design

**Version**: 1.0
**Date**: 2026-05-14
**Status**: Approved (brainstorming, 用户 2026-05-14 同意)
**Audience**: 后续执行 Phase 8 / 9 / 10 的 Claude Code session
**Master spec**: [`2026-04-29-assets-produce-spec.md`](2026-04-29-assets-produce-spec.md) § 15 行 1.10
**Repos in scope**:
- `cdotlock/assets-produce`（本仓库，opencode fork；用户维护）
- `cdotlock/novels-to-lunascript`（LS 剧本生成；用户维护）
- `cdotlock/lunaverse-backend`（小程序后端；**不是用户维护**，最小改动）

---

## 1. 背景

### 1.1 当前三个仓库的状态

**assets-produce**（Phase 7 完成）：

- `agent/` opencode 改造完成，含 atomic tools（generate-image-nanobanana / generate-image-gpt / generate-video-seedance / generate-video-happyhorse / concat-clips / crop-video）、OSS put / get、Asset entity、skill 系统、Langfuse、permission profiles
- `videoctl/` 顶层 Go CLI 已外置，承担视频 prompt → 网关 → 下载 → 抽帧
- `knowledge/novel-to-video/` 本地知识包
- WebUI 在 `web/`，creator profile
- 没有对外提供 asset 生产的 HTTP API；外部 agent 只能直接 `bun ... agent <cmd>` 或读 OSS

**novels-to-lunascript**（用户维护）：

- 把小说切成 LS（Lunascripts）JSON
- 输出含 `asset_ref` 节点（指向角色立绘 / 场景背景 / CG / Cover），目前 `asset_ref.url` 大多是占位或空
- 期待下游能根据 `asset_ref.id` / `asset_ref.name` 查到真实 OSS URL

**lunaverse-backend**（不是用户维护）：

- TypeScript / NestJS-ish，BullMQ outbox + Postgres
- `app/upstream/agent-forge-client.ts`：interface `lookupAssets` / `createAsset` / `pollAsset`，目前两个 mode
  - `stub`：本地 fake，给本地开发跑通
  - `real`：throw `AgentForgeUnavailableError`（agent-forge 已废弃）
- `app/services/assets-remix-service.ts`：消费 outbox 事件，调上面 client 的 `createAsset` / `pollAsset`，把成品写回 RemixAsset 表
- `generate-upscale-matting/`：一坨 Python 工具（cg_render.py、sync_to_oss.py、抠图、upscale），是 CG 生产的"远端遥控"分支，目前与 backend 主链路通过 OSS 协作

### 1.2 三个仓库怎么连起来的（事实层）

三个仓库之间**没有共享 library**，只通过三条窄通道连接：

1. **共享 OSS bucket** — 所有真正的 asset binary（图、视频、CG webp）最终都在同一个阿里云 OSS。每个 repo 都有自己的 OSS client，凭据从 env 注入
2. **LS JSON 契约** — `novels-to-lunascript` 写出的 LS（含 `asset_ref`）就是上游用来"点菜"的菜单；下游（assets-produce / backend）读这份 JSON，照菜单生成
3. **HTTP upstream 客户端** — 当前只有 `lunaverse-backend → agent-forge-client.ts`（throw 在 real mode），没人 → assets-produce

### 1.3 当前问题

| 问题 | 表现 |
|---|---|
| Agent Forge 还在 backend 接口里挂着 | `agent-forge-client.ts` real mode throw |
| assets-produce 没有"对外服务"形态 | 外部进程进不来 |
| LS 的 `asset_ref` 是占位 | 没有"按 name 查 url"的查询面 |
| CG / sync-to-oss 在 backend 仓 | 与小说后端无关的图像生产逻辑塞错地方 |

---

## 2. 目标与非目标

### 2.1 目标

1. assets-produce 对外提供**统一 asset 生产 + 检索面**：novels-to-lunascript 和 lunaverse-backend 不再各自手搓
2. 接口形态**REST + MCP 双层**，agent-native：REST 给传统 HTTP 调用方，MCP 给 LLM agent 直接挂载
3. 接口语义**意图驱动**（intent-based）而非过程化：调用方说"我要给 ep_3/character_a 出一张立绘，参考这堆图"，怎么编排（先 spec → 再生成 → 再抠图）是 assets-produce 内部 mini agent loop 的事
4. lunaverse-backend 改动**收敛在 client 层**：interface 不改，只换 `agent-forge-client.ts` 的 real mode 实现 → HTTP to assets-produce
5. novels-to-lunascript 改动**收敛在写出端**：LS `asset_ref` 增加新字段供下游精准查询，不强制重写整体
6. CG / sync-to-oss / 抠图 / upscale 这种**纯素材生产工具**全部搬到 assets-produce 的 `tools/` 下，lunaverse-backend 不再持有

### 2.2 非目标

- 不改 LS 整体 schema（只在 `asset_ref` 上加可选字段）
- 不引入新的 message broker / event bus（OSS + HTTP poll 已够）
- 不实现"自动重生 / 永远在线"的 daemon —— 调用方在自己侧管 retry
- 不为 lunaverse-backend 写"理想后端"，只让旧 client 接口跑得通
- 不在本设计内规划计费 / 多租户 / 配额
- 不动 Agent Forge legacy 代码（已废弃，自生自灭）

---

## 3. 总体架构

```
                    +---------------------+
                    |  novels-to-lunascript|
                    |  (Python)            |
                    +-----+----------+----+
              LS write   |          | asset.lookup (HTTP)
              (S3/local)  |          |
                          v          v
                     +-----------------+
                     |  OSS bucket     |
                     |  (共享 binary)  |
                     +--^---------^----+
                        |         |
                  write |         | read
                        |         |
+-------------------+   |   +-----+---------------------+
| lunaverse-backend |   |   | assets-produce            |
| (TS, 不维护)      |   |   | (TS, opencode fork)        |
|                   |   |   |                            |
|  agent-forge-     +-->+-->| REST  /api/v1/assets/...   |
|  client.ts        |       | MCP   assets/* tools       |
|  (real mode HTTP) |       |                            |
|                   |       |   AssetService             |
|  assets-remix-    |       |     ↳ mini agent loop      |
|  service.ts       |       |       (LLM + skill +       |
|  (不动接口)        |       |        atomic tools)       |
+-------------------+       |                            |
                            |   Asset table (catalog)    |
                            |   OSS put/get               |
                            +----+-----------------------+
                                 |
                                 v
                            +----------+
                            | Langfuse |
                            +----------+
```

**三条边的契约**：

| 方向 | 通道 | 协议 | 同步/异步 |
|---|---|---|---|
| novels-to-lunascript → assets-produce | `POST /api/v1/assets/lookup` | REST | 同步 |
| lunaverse-backend → assets-produce | `POST /api/v1/assets/create` + `GET /api/v1/assets/jobs/:id` | REST | 异步（poll） |
| 任意 agent → assets-produce | MCP `assets.create` / `assets.lookup` / `assets.status` | MCP | 由 client 决定 |
| 任意 → 任意 | OSS 直接 GET/PUT | S3 protocol | — |

---

## 4. 对外 API（4 个操作）

四个动词，覆盖三个仓库全部用例。

### 4.1 `asset.create`

**意图**："我要一张 / 一组 asset，描述如下，请生成并放到 OSS"

**REST**：`POST /api/v1/assets/create`

**Request**：

```json
{
  "project_id": "novel_silver_moon",
  "asset_intent": {
    "kind": "character_portrait | scene_bg | cg | cover | shot_image | shot_video",
    "key": "ep_3/character_a/portrait",
    "spec_md": "韩漫 2D 画风，全身正面 ...",
    "refs": [
      { "kind": "image", "url": "oss://bucket/refs/aaa.png", "tag": "style" },
      { "kind": "image", "url": "oss://bucket/refs/bbb.png", "tag": "character" }
    ],
    "constraints": {
      "ratio": "9:16",
      "duration_sec": null,
      "background_kind": null
    }
  },
  "preferences": {
    "atomic_tool_hint": "generate-image-nanobanana",
    "skill_hint": "character-portrait-spec"
  },
  "client_request_id": "lunaverse-backend:remix:42",
  "callback_url": null
}
```

**Response**：

```json
{
  "job_id": "asset_job_01HXYZ...",
  "status": "queued",
  "key": "ep_3/character_a/portrait",
  "version": 1
}
```

**语义**：

- `asset_intent` 是**意图**，不是命令；assets-produce 内部根据 kind + skill_hint + constraints 用 mini agent loop 决定调哪个 atomic tool、走哪个 skill
- `preferences.*_hint` 只是提示，agent 可以否决（比如 LLM 判断 nanobanana 不适合就换 gpt）
- `client_request_id` 用来去重 / 防止重复入队
- 同步返回 job_id，**不等生成完成**

### 4.2 `asset.status`

**意图**："轮询那个 job 怎么样了"

**REST**：`GET /api/v1/assets/jobs/:job_id`

**Response**（成功）：

```json
{
  "job_id": "asset_job_01HXYZ...",
  "status": "succeeded",
  "result": {
    "asset_id": "asset_01HXYZ...",
    "key": "ep_3/character_a/portrait",
    "version": 1,
    "kind": "character_portrait",
    "url": "https://oss.../ep_3/character_a/portrait/v1.png",
    "ref_urls": [...],
    "meta": {
      "atomic_tool": "generate-image-nanobanana",
      "skill_used": "character-portrait-spec",
      "langfuse_trace_id": "..."
    }
  }
}
```

**Response**（失败）：

```json
{
  "job_id": "...",
  "status": "failed",
  "error": {
    "code": "GENERATION_REJECTED",
    "message": "..."
  }
}
```

**可能的 status**：`queued` / `running` / `succeeded` / `failed` / `cancelled`

### 4.3 `asset.lookup`

**意图**："这些 key 现在分别是什么 url"

**REST**：`POST /api/v1/assets/lookup`

**Request**：

```json
{
  "project_id": "novel_silver_moon",
  "queries": [
    { "key": "ep_3/character_a/portrait" },
    { "key": "ep_3/scene_cemetery", "version": 2 },
    { "name": "Sylvia 立绘" }
  ]
}
```

**Response**：

```json
{
  "results": [
    {
      "query": { "key": "ep_3/character_a/portrait" },
      "asset": { "asset_id": "...", "key": "...", "version": 3, "url": "...", "kind": "..." }
    },
    {
      "query": { "key": "ep_3/scene_cemetery", "version": 2 },
      "asset": { ... }
    },
    {
      "query": { "name": "Sylvia 立绘" },
      "asset": null,
      "match_reason": "no_match"
    }
  ]
}
```

**语义**：

- key-based lookup 是**精确匹配**（带或不带 version；不带 = 最新 current）
- name-based lookup 是 fuzzy（先精确，找不到走 substring / 同义词；在本设计里走简单 substring，足够 novels-to-lunascript 用）
- 每个 query 独立成功/失败，不整体 fail

### 4.4 `asset.catalog.since`

**意图**："我（lunaverse-backend）想周期性拉 catalog 增量，方便本地 cache"

**REST**：`GET /api/v1/assets/catalog?project_id=...&since=...&limit=200`

**Response**：

```json
{
  "items": [
    { "asset_id": "...", "project_id": "...", "key": "...", "version": 3, "url": "...", "updated_at": "2026-05-14T..." },
    ...
  ],
  "next_cursor": "2026-05-14T12:00:00Z/asset_xxxx"
}
```

**语义**：

- 单向拉取（pull），不推送
- lunaverse-backend 用这个做 incremental sync，把已知 asset 写进自己 db 当 cache
- 不暴露失败的 job / 内部 mini agent loop 细节

---

## 5. assets-produce 内部实现

### 5.1 文件布局

新增（全部在 `agent/packages/opencode/src/business/asset-service/`）：

```
agent/packages/opencode/src/business/asset-service/
├── asset-service.ts            # AssetService 主类（对内）
├── asset-job.sql.ts            # AssetJob entity (新)
├── asset-job.repo.ts
├── run-asset-generation.ts     # mini agent loop（内部编排）
├── intent-to-skill.ts          # AssetIntent → skill 选择
├── catalog.ts                  # asset.lookup / asset.catalog.since 实现
└── http/
    ├── assets-create.route.ts   # POST /api/v1/assets/create
    ├── assets-status.route.ts   # GET  /api/v1/assets/jobs/:id
    ├── assets-lookup.route.ts   # POST /api/v1/assets/lookup
    └── assets-catalog.route.ts  # GET  /api/v1/assets/catalog
```

复用既有（不动接口）：

```
agent/packages/opencode/src/business/asset/asset.sql.ts          # 已有 Asset 表
agent/packages/opencode/src/tool/oss-put.ts                       # 已有
agent/packages/opencode/src/tool/generate-image-nanobanana.ts     # 已有
agent/packages/opencode/src/tool/generate-image-gpt.ts            # 已有
agent/packages/opencode/src/tool/generate-video-seedance.ts       # 已有
agent/packages/opencode/src/skill/...                              # 已有 skill 系统
```

新增 skill body（本地知识包 `knowledge/asset-generation/`）：

```
knowledge/asset-generation/
├── character-portrait-spec.md       # 立绘生成流程
├── scene-bg-spec.md                  # 场景背景生成流程
├── cg-render-spec.md                 # CG 渲染（从 backend 迁来逻辑）
├── cover-spec.md                     # 封面生成
└── shot-image-from-ls.md            # 从 LS asset_ref 出图
```

**红线**：skill body 仍按 master spec § 2 原则 4，Langfuse 是托管面；这里 `knowledge/asset-generation/` 只是本地源。上线前由用户决定何时 `assets-produce skills sync`。

### 5.2 AssetService 主类（对内）

```typescript
// asset-service.ts (草稿；exact types 在 plan 阶段定)
export class AssetService {
  async createJob(input: AssetCreateInput): Promise<AssetJob>;
  async getJob(jobId: string): Promise<AssetJob>;
  async lookup(queries: AssetLookupQuery[]): Promise<AssetLookupResult[]>;
  async catalogSince(cursor: string | null, limit: number): Promise<CatalogPage>;
}
```

**关键约定**：

- `createJob` 是**同步快返**：写一行 `AssetJob` 进 db（status=queued），返回 job_id；后台 worker 起 mini agent loop
- worker 用既有的 opencode session/runtime 跑（不引入新 worker 框架）
- job 失败后**不自动重试**；调用方决定（满足"非目标 §2.2 第 3 条"）

### 5.3 `runAssetGeneration` — Mini Agent Loop（AI-native 核心）

这是整个设计 AI-native 的地方。不写"立绘流水线 service / 场景流水线 service"，而是：

```
1. 读 AssetJob → AssetIntent
2. intent-to-skill 根据 kind + spec_md + constraints 选 skill body
   （这一步是 LLM 调用：让模型读 intent 选 skill）
3. 在 opencode session 里以选中的 skill 启动 agent loop
   - skill body 告诉 agent 怎么思考
   - agent 拥有的工具集 = atomic tools（image/video/concat/crop）+ oss put
   - 没有"立绘 service"，没有"场景 service"
4. agent loop 终态产物：(a) OSS url + (b) AssetJob 状态写回
5. 全过程 Langfuse trace；trace_id 回填 AssetJob.meta.langfuse_trace_id
```

**为什么 AI-native**：

- 不在代码里硬编码"先生成立绘 → 再抠图 → 再 upscale → 再写 OSS"这条链
- 链上每一步由 skill body 描述、由 LLM 在 loop 里决定调哪个 tool
- 新 asset 类型（如 logo 设计、表情包）只需要写一份新 skill body，不需要改 service

**为什么不会失控**：

- atomic tools 是 **system profile** 工具集，每个工具 schema 严格
- skill body 是托管的（Langfuse），有 version control
- 全程 Langfuse trace，可观测
- 调用方拿到的是 **succeeded / failed + url**，不暴露 loop 内部
- mini loop 的 token budget / step budget 由 AssetService 配置兜底（防爆炸）

### 5.4 Asset entity 与 catalog

复用已有 [`asset.sql.ts`](../../agent/packages/opencode/src/business/asset/asset.sql.ts)（unique index `(project_id, key, version)`）。可能新增字段：

- `name`（nullable，作为 lookup-by-name 的目标；不强制）
- `kind`（已有枚举可能要补 `cg` / `cover`）
- `updated_at`（已有则不动）

新增 `AssetJob` entity：

| field | type | 说明 |
|---|---|---|
| id | text PK | `asset_job_xxx` |
| project_id | text | |
| client_request_id | text? | dedupe key |
| intent | jsonb | 原始 AssetCreateInput |
| status | enum | queued/running/succeeded/failed/cancelled |
| asset_id | text? | succeeded 时填 |
| error_code | text? | failed 时填 |
| error_message | text? | failed 时填 |
| langfuse_trace_id | text? | |
| created_at / updated_at | timestamp | |

`asset.catalog.since` 简单实现：

```sql
SELECT * FROM Asset
WHERE project_id = $1 AND updated_at >= $2
ORDER BY updated_at ASC, id ASC
LIMIT $3
```

cursor = `updated_at/id` 拼接。

### 5.5 Auth

- 所有 REST 端点：`Authorization: Bearer <token>`，token 在 `.env` 配置（`ASSETS_API_TOKEN_*`，per-caller）
- 不实现 multi-tenant；token → project_id allowlist（在 config 里写死，3 个 token：novels-to-lunascript / lunaverse-backend / dev）

### 5.6 MCP

把 REST 4 个操作复用为 MCP tools：

- `assets.create`
- `assets.status`
- `assets.lookup`
- `assets.catalog_since`

opencode 已经有 MCP server skeleton（`agent/packages/opencode/src/server/mcp/`，phase 5/6 已搭起）。Phase 8 在那基础上挂 4 个 tool 即可，**不重写 MCP 框架**。

---

## 6. novels-to-lunascript 改动

### 6.1 保留（12 项）

整个 LS 生成核心、`asset_ref` 节点产出、剧本切分、章节规划 —— 一律不动。

### 6.2 修改（5 项）

| 文件 | 改什么 |
|---|---|
| LS schema | `asset_ref` 增加可选字段：`{ "id": "...", "name": "...", "kind": "..." }`（向后兼容） |
| 配置 | `.env.example` 加 `ASSETS_PRODUCE_BASE_URL` / `ASSETS_PRODUCE_TOKEN` |
| asset_ref 写出器 | 给每个 asset_ref 填 `kind` 和稳定的 `name`（如果用户已经填了 name 就用用户的） |
| LS 验证器 | 新增可选 step "asset_ref 解析"：调 assets-produce `asset.lookup`，把 url 填回（默认开关 off，CLI flag on） |
| README | 加"如何配 assets-produce 接入"小节 |

### 6.3 新增（1 项）

```
novels-to-lunascript/
└── src/clients/
    └── assets_produce_client.py    # 单文件 HTTP client；仅实现 lookup
```

不实现 `create`（小说生成阶段不主动 trigger 生产；asset 生成由 backend 在 remix 时 trigger）。

### 6.4 删除

无。

---

## 7. lunaverse-backend 改动

**铁律**：不是用户维护，最小改动。本设计**只改 client，不改 service / outbox / db schema / queue**。

### 7.1 修改（2 项）

| 文件 | 改什么 |
|---|---|
| `app/upstream/agent-forge-client.ts` | `real` mode 不再 throw；实现 HTTP fetch to assets-produce 的 4 个操作；mode 选择仍由 `ASSETS_REMIX_MODE` 控制；增加 `ASSETS_PRODUCE_BASE_URL` / `ASSETS_PRODUCE_TOKEN` env |
| `app/services/assets-remix-service.ts` | **不动逻辑**；仅在 `pollAssetsRemix` 失败分支增加错误 code 透传（如果 client 返回新的 error_code，原 service 已有 fallback path） |

### 7.2 新增（1 项）

| 文件 | 用途 |
|---|---|
| `app/upstream/assets-produce-http.ts`（新）| 真正的 HTTP 调用代码；`agent-forge-client.ts` 在 `real` 分支引用它 |

**改名建议**（不强求；lunaverse-backend 不维护，能不改尽量不改）：

- `agent-forge-client.ts` → 保留文件名（避免大规模 rename + import 修复，影响面失控）
- 在文件顶 docstring 标注："agent-forge 已废弃；real mode 现连接 assets-produce"

### 7.3 删除（一次性，征得 backend 维护方同意后再执行）

| 路径 | 理由 |
|---|---|
| `generate-upscale-matting/cg_render.py` | CG 渲染 → 迁到 assets-produce `tools/cg-render/` |
| `generate-upscale-matting/_local_tools/sync_to_oss.py` | OSS 批量上传 → 迁到 assets-produce `tools/oss-sync/` |
| `generate-upscale-matting/` 其他纯素材工具 | 同上，按目录评估 |

**删除前**：assets-produce 必须先有等价工具且跑通（Phase 9）；删除单独 commit、单独 PR、由 backend 维护方 review。**Phase 9 内不强制删；删除可延期到下一次 backend 例行清理。**

---

## 8. 三个数据流走一遍

### 8.1 场景 A：novels-to-lunascript 写 LS，下游 backend 触发生产

```
1. novels-to-lunascript 跑 → 写出 LS（含 asset_ref，但 url 是占位）
2. 用户把 LS 灌进 lunaverse-backend
3. 用户在小程序点 "Remix Episode 3"
4. backend assets-remix-service 收到 outbox 事件
5. service.processAssetsRemixRequest()
   → agentForgeClient.createAsset({ kind: 'cg', key: 'ep_3/cg_001', spec_md: ..., refs: [...] })
   → (新) HTTP POST assets-produce /api/v1/assets/create
   → 返回 { job_id, status: 'queued' }
   → 写进 RemixAsset 行（jobId）
6. service.pollAssetsRemix(jobId)
   → (新) HTTP GET assets-produce /api/v1/assets/jobs/:id
   → 返回 succeeded + url
   → 写 RemixAsset.url
7. 小程序前端拉 RemixAsset，拿到 url，渲染
```

assets-produce 侧：

```
5'. createAsset 入参 → AssetService.createJob → AssetJob 入库 status=queued
   后台 worker:
     - intent-to-skill: 选 'cg-render-spec' skill
     - 起 opencode session，绑定 atomic tools
     - skill body 描述"先 generate-image-nanobanana 出 base → upscale → 抠图 → oss put"
     - LLM agent loop 跑完 → 拿到 OSS url
     - 写 Asset 行 + AssetJob.status=succeeded + asset_id
6'. getJob 直接读 db
```

### 8.2 场景 B：novels-to-lunascript 验证阶段想填 url

```
1. 用户在 novels-to-lunascript 跑 ls-verify --resolve-assets
2. 脚本拉所有 asset_ref → 收集 keys
3. assets_produce_client.lookup(keys)
   → HTTP POST assets-produce /api/v1/assets/lookup
   → 返回 results
4. 把 url 填回 asset_ref.url（找不到的留空，warn 输出）
5. 写出新 LS
```

### 8.3 场景 C：backend 想本地 cache catalog

```
1. backend 跑 cron: SyncAssetsCatalogJob
2. 读自己 db.last_synced_at
3. HTTP GET assets-produce /api/v1/assets/catalog?since=last_synced_at&limit=200
4. 写本地 AssetCache 表（已有 schema 或新加一张）
5. 更新 last_synced_at
```

本设计**不强制** backend 实现这步；scenario C 是为了"backend 不必每次都打 lookup" 的 future option。Phase 10 只做接口能力，不在 backend 加 cron。

---

## 9. 错误处理 / 日志 / 观测

### 9.1 错误码

assets-produce 对外暴露的 error code（response body `error.code`）：

| code | HTTP | 含义 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | token 不对或缺失 |
| `FORBIDDEN_PROJECT` | 403 | token 没权访问该 project |
| `VALIDATION` | 400 | request body 不合法 |
| `NOT_FOUND` | 404 | job_id / key 不存在 |
| `RATE_LIMITED` | 429 | per-token rate limit |
| `GENERATION_REJECTED` | 200 in job status | mini agent loop 判定无法生成（content filter / spec 不可行） |
| `UPSTREAM_TIMEOUT` | 200 in job status | atomic tool 超时 |
| `INTERNAL` | 500 | 兜底 |

### 9.2 重试

- assets-produce 内部**不**重试 atomic tool 失败（一次性 fail，调用方决定）
- lunaverse-backend 已有 outbox + BullMQ retry，对 `INTERNAL` / `UPSTREAM_TIMEOUT` 走 backend 自己的重试策略
- novels-to-lunascript 的 lookup 失败：脚本侧 print warn + 继续（asset url 留空）

### 9.3 Langfuse

- 每次 `runAssetGeneration` 启动一个 trace，root span 标 `asset_job_<id>`
- 每个 atomic tool 调用都自动是 span（opencode 已经接好 Langfuse instrumentation）
- skill body load / intent-to-skill LLM 调用都进 trace
- AssetJob.meta.langfuse_trace_id 回填供 debug

### 9.4 metrics（轻量，Phase 8 不展开）

- `asset_job.created` / `succeeded` / `failed` 计数（log line 起步，prometheus 留 future）

---

## 10. 测试策略

### 10.1 Unit

- AssetService.createJob / getJob / lookup / catalogSince：跑在 sqlite in-memory，覆盖 happy / dedupe / 不存在 / 边界 cursor
- intent-to-skill：mock LLM，固定输入 → 固定 skill 选择
- HTTP route handlers：用 hono testClient，覆盖 4 个端点 + 错误码矩阵

### 10.2 Integration

- 假 OSS（minio in CI）+ stub atomic tools → 跑完一个 fake job 全链路（create → status → succeeded）
- catalog.since 跨页 cursor 翻完

### 10.3 Contract（最关键）

- assets-produce 暴露一份 OpenAPI spec（自动生成）
- novels-to-lunascript / lunaverse-backend 用 pact-style mock fixture（json 文件）验证 client 调用与 spec 一致

### 10.4 E2E（可选，Phase 10 acceptance 不要求强制）

- 起 assets-produce 真服务（profile=developer，stub atomic tools，real OSS bucket）
- 起 lunaverse-backend fixture，触发一次 remix → 跑通

---

## 11. Phase 划分与验收

新增三个 phase 接在 master spec § 10 之后。

### Phase 8 — Asset Service 对外 API

**目标**：assets-produce 内 AssetService、4 个 REST 操作、MCP tools 跑通，**不接** novels-to-lunascript / lunaverse-backend；纯本仓库自洽。

**范围**：

- 新增 AssetJob entity + repo（drizzle migration）
- 新增 `asset-service/` 目录（asset-service.ts / run-asset-generation.ts / intent-to-skill.ts / catalog.ts / http 路由）
- 复用既有 atomic tools / OSS put / skill 系统 / Langfuse
- 新增 5 个 skill body 草稿到 `knowledge/asset-generation/`（**不**上传 Langfuse；本 phase 在测试中用 fixture skill）
- 加 4 个 MCP tool 挂在已有 MCP server
- `.env.example` 加 `ASSETS_API_TOKEN_NOVELS_TO_LUNASCRIPT` / `..._LUNAVERSE_BACKEND` / `..._DEV`
- OpenAPI spec 自动生成（导出到 `docs/api/openapi.yaml`）
- 单元 + integration test 跑过

**不做**：

- 不调用 real 图片/视频生成（test 用 stub atomic tool）
- 不连两个外部 repo
- 不实现 cron / scheduled sync
- 不实现 callback_url（payload 字段保留但忽略）

**验收**：

1. `bun --cwd=agent run typecheck` 全过；`bun --cwd=agent run test` 全过
2. `agent serve` 起 server，curl 4 个端点全通（用 stub atomic tool）
3. 单元覆盖 ≥ 80%；HTTP route handler 覆盖错误码矩阵
4. OpenAPI spec 在 `docs/api/openapi.yaml`，可用 `openapi-cli validate` 过
5. MCP tools 在 `agent serve` 启动后能被 MCP client 列出
6. 5 份 skill body 草稿存在于 `knowledge/asset-generation/`，每份 ≥ 30 行有内容
7. Langfuse trace 在 stub job 跑完后可见（用户手动验证 1 条即可）
8. phase-8 plan + verification report 齐
9. commit + push 到 main

### Phase 9 — Asset 工具迁移（CG / OSS-sync / upscale）

**目标**：把 lunaverse-backend `generate-upscale-matting/` 中**纯素材生产工具**搬到 assets-produce，使 assets-produce 的 mini agent loop 有完整的"CG 渲染 / 批量 upload / upscale"能力。

**范围**：

- 在 assets-produce 新增 `tools/`（顶层）
  - `tools/cg-render/`：cg_render.py → 改成 Node/Python 都行（推荐 Python + 自带 venv；保持原型）；通过 atomic tool 包装暴露给 agent
  - `tools/oss-sync/`：sync_to_oss.py 迁移；作为离线工具，**不**纳入 atomic tools（不让 agent 直调）
  - `tools/upscale/`：现有 backend 逻辑迁过来；视情况包装为 atomic tool
- 新增 atomic tool（在 opencode 工具表里）：
  - `cg-render`（包 cg_render.py）
  - `upscale-image`（包 upscale 工具）
- Phase 8 已有的 `cg-render-spec.md` skill body 引用新 tool
- lunaverse-backend 内对应文件**保留**（暂不删除；只是 assets-produce 有了等价能力），并在 backend 端 README 加一行 "DEPRECATED: see assets-produce/tools/cg-render"
- 在 OPS doc 加 "如何在 assets-produce 跑 cg-render-spec 出 CG"

**不做**：

- 不实现把 backend `generate-upscale-matting/` 的所有目录都搬（只搬 cg_render / sync_to_oss / upscale 三件）
- 不在本 phase 实际删除 backend 侧旧文件
- 不动 Phase 8 已经稳定的 4 个对外操作

**验收**：

1. assets-produce `tools/cg-render` 能在本机跑通一个 fixture 输入（ZENMUX_API_KEY 用 dev key 或 mock）
2. assets-produce `tools/oss-sync` 能 dry-run 一个 fixture 目录
3. 新 atomic tools 在 `agent tools list` 出现，schema 完整
4. `cg-render-spec.md` skill 拉起 mini agent loop，能跑完 stub CG 生成（不调 real ZENMUX，用 stub）
5. lunaverse-backend 内对应文件加上 deprecated 注释
6. phase-9 plan + verification report 齐
7. commit + push 到 main

### Phase 10 — 三方接通

**目标**：novels-to-lunascript 和 lunaverse-backend 实际接通 assets-produce 对外 API。

**范围**：

- novels-to-lunascript：
  - 新增 `src/clients/assets_produce_client.py`（lookup 实现 + bearer auth + retry/backoff）
  - LS schema `asset_ref` 加可选 id / name / kind 字段；schema validator 同步
  - 新增可选 `ls-verify --resolve-assets` flag，跑 lookup 填 url
  - `.env.example` 加配置
  - 旧的占位写出器：标 deprecated（不删；用户保留兼容性）
- lunaverse-backend：
  - 新增 `app/upstream/assets-produce-http.ts`：实现 4 个操作的 fetch
  - 修改 `app/upstream/agent-forge-client.ts`：real mode 改 dispatch 到 `assets-produce-http.ts`，throw 删除
  - `.env.example` 加 `ASSETS_PRODUCE_BASE_URL` / `ASSETS_PRODUCE_TOKEN` / 仍保留 `ASSETS_REMIX_MODE`
  - 旧的 `assets-remix-service.ts` **接口不动**；只在错误透传上加一行（如有必要）
  - 加一份 README "切换 ASSETS_REMIX_MODE=real 接 assets-produce"
- assets-produce：
  - 注册三个 token（novels-to-lunascript / lunaverse-backend / dev）
  - 部署侧 ops doc 写清 base url / token 怎么发
- E2E（本地手动）：用户在本机跑通三仓 happy path（不入 CI）

**不做**：

- 不强制 backend 一切 remix 流量改 real；只让 real 模式可用
- 不动 backend BullMQ / outbox / 任何 service-level 逻辑
- 不删 backend `generate-upscale-matting/`（留给未来 backend 维护方独立清理）
- 不引入 supply chain / shared package

**验收**：

1. assets-produce 单元 + integration 全过（Phase 8 + 9 + 10 总和）
2. novels-to-lunascript `assets_produce_client.py` 单元测试覆盖 happy / 404 / 401 / 网络错
3. lunaverse-backend `assets-produce-http.ts` 单元测试覆盖 4 个操作 + 错误矩阵
4. 用户本机跑通：LS 生成 → backend remix → 调 assets-produce real → 拿到 url → 小程序看到图（一条 e2e）
5. assets-produce 跑一周观察日志：mini agent loop 没失控（step 数 / token 消耗在配置 budget 内）
6. phase-10 plan + verification report 齐
7. commit + push 到所有 3 个 repo 的 main（backend push 需 backend 维护方同意 —— **手动 ack**）

---

## 12. 实现顺序

```
Phase 8 → Phase 9 → Phase 10
```

理由：

- Phase 8 是基础设施，不接外部，能独立完成 + verify，风险低
- Phase 9 把 backend 重要工具搬过来，让 Phase 10 真接通时 assets-produce 能力完整
- Phase 10 接外部，影响面最大，最后做

**并行机会**：Phase 9 与 Phase 10 的 novels-to-lunascript 改动可以并行（无依赖）。Phase 10 的 lunaverse-backend 改动必须在 Phase 8 完成后开始（要有 real 端点可调）。

---

## 13. 风险与回退

| 风险 | 概率 | 影响 | 缓解 / 回退 |
|---|---|---|---|
| mini agent loop 失控（token 爆 / step 死循环） | 中 | 高 | step budget + token budget 兜底；超限 fail job；Langfuse 监控 |
| lunaverse-backend 维护方拒绝改 client | 低 | 中 | Phase 10 backend 改动单独 PR；用 feature flag `ASSETS_REMIX_MODE=real` 可关；不动则继续走 stub |
| 跨仓 token 管理混乱 | 中 | 中 | token 在 assets-produce `.env` 注册；每仓只持有一份；rotate flow 写进 ops doc |
| OSS bucket 跨仓权限冲突（assets-produce 写、其他读） | 低 | 中 | 在现有 bucket 用 path prefix 隔离（`assets-produce/...`）；权限策略 Phase 8 落实前打开 |

**回退策略**：

- Phase 8 出问题 → 直接 revert，assets-produce 仍是 Phase 7 形态
- Phase 9 出问题 → backend 内旧工具还在（没删），切回旧链路即可
- Phase 10 出问题 → backend `ASSETS_REMIX_MODE` 切回 `stub`；novels-to-lunascript 不调 `--resolve-assets` 即可

---

## 14. 不在本设计范围

- prod 数据迁移
- 计费 / 多租户 / 配额
- 自动重试 / SLA / on-call
- backend `generate-upscale-matting/` 的实际删除（留给 backend 维护方）
- agent-forge legacy 代码清理（自生自灭）
- 把 `knowledge/asset-generation/` skill body 上传 Langfuse（按 master spec 规则，用户明确要求时再做）

---

## 15. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|---|---|---|---|
| 1.0 | 2026-05-14 | 初版（brainstorming 产出，用户 2026-05-14 同意 §1-§7 提案后展开成完整设计） | cdotlock + Claude |

> 后续修订请追加新行；如影响 master spec § 10 phase 章节，同步加 ⚠ 标记 + 引用本表行号。

---

## 附录 A：跨仓文件变更检查清单

### assets-produce（新增 / 修改）

```
agent/packages/opencode/src/business/asset-service/         [Phase 8 新增整目录]
agent/packages/opencode/src/business/asset/asset.sql.ts     [Phase 8 可能加 name/kind 字段]
agent/packages/opencode/src/server/mcp/<...>                [Phase 8 挂 4 个 MCP tool]
agent/packages/opencode/src/cli/cmd/<可选>                  [若加 `agent assets <op>` CLI]
knowledge/asset-generation/                                  [Phase 8 新增 5 份 skill body]
tools/cg-render/                                             [Phase 9 新增]
tools/oss-sync/                                              [Phase 9 新增]
tools/upscale/                                               [Phase 9 新增]
docs/api/openapi.yaml                                        [Phase 8 新增]
docs/ops/three-repo-token-flow.md                            [Phase 10 新增]
.env.example                                                 [Phase 8 + 10 加变量]
docs/superpowers/specs/2026-05-14-three-repo-asset-integration-design.md  [本文]
docs/superpowers/specs/phase-8-asset-service-api-plan.md     [Phase 8 plan]
docs/superpowers/specs/phase-8-...-verification.md           [Phase 8 verif]
docs/superpowers/specs/phase-9-asset-tools-migration-plan.md [Phase 9 plan]
docs/superpowers/specs/phase-9-...-verification.md           [Phase 9 verif]
docs/superpowers/specs/phase-10-three-repo-integration-plan.md  [Phase 10 plan]
docs/superpowers/specs/phase-10-...-verification.md          [Phase 10 verif]
docs/superpowers/specs/2026-04-29-assets-produce-spec.md     [§ 15 + § 10 更新]
```

### novels-to-lunascript（新增 / 修改）

```
src/clients/assets_produce_client.py                         [Phase 10 新增]
src/ls/schema.<py|ts>                                        [Phase 10 改：asset_ref 加可选字段]
src/ls/verifier.<py|ts>                                      [Phase 10 改：加 --resolve-assets]
.env.example                                                  [Phase 10 加 ASSETS_PRODUCE_* 变量]
README.md                                                     [Phase 10 加接入说明]
tests/clients/test_assets_produce_client.py                   [Phase 10 新增]
```

### lunaverse-backend（新增 / 修改 / 不删除）

```
app/upstream/assets-produce-http.ts                          [Phase 10 新增]
app/upstream/agent-forge-client.ts                           [Phase 10 修改 real branch]
.env.example                                                  [Phase 10 加 ASSETS_PRODUCE_* 变量]
app/services/assets-remix-service.ts                         [Phase 10 仅可选加错误码透传；不动接口]
README.md                                                     [Phase 10 加 ASSETS_REMIX_MODE=real 切换说明]
tests/upstream/assets-produce-http.test.ts                   [Phase 10 新增]
generate-upscale-matting/cg_render.py                        [Phase 9 加 DEPRECATED 注释；不删]
generate-upscale-matting/_local_tools/sync_to_oss.py         [Phase 9 加 DEPRECATED 注释；不删]
```

---

## 附录 B：术语速查

| 术语 | 含义 |
|---|---|
| LS | Lunascripts，novels-to-lunascript 写出的剧本 JSON |
| asset_ref | LS JSON 节点，指向一个 asset（key/name 索引 + 可选 url） |
| asset | 实际 asset 行（DB Asset 表），含 key / version / url / kind |
| atomic tool | opencode 工具表里的最小可执行单元，如 `generate-image-nanobanana` |
| skill body | 描述"how to think"的 markdown（在 Langfuse 托管） |
| mini agent loop | assets-produce 内由 LLM + skill body + atomic tools 组成的运行回路 |
| catalog | Asset 表对外的增量视图 |
| RemixAsset | lunaverse-backend 自己的 db 行，记 backend 视角的一个 remix 产物 |
| AssetJob | assets-produce 自己的 db 行，记一次 createJob 调用 |
