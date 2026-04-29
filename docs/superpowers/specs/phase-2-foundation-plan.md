# Phase 2 — Foundation Plan

> 对应:[spec § 10 Phase 2](2026-04-29-assets-produce-spec.md#phase-2--foundation) / [spec § 4 Entity](2026-04-29-assets-produce-spec.md#4-业务核心-entitydrizzle6-张表) / [spec § 8 Provider](2026-04-29-assets-produce-spec.md#8-provider-配置)
> 起始 commit:`68437d9`(Phase 1 终点)
> 预计:1-2 个工作日,12-18 个 atomic commits
> 执行人:Claude Opus 4.7 (1M) + cdotlock

---

## 0. 目标与范围

### 0.1 目标(spec § 10 Phase 2)

业务基座可用 —— DB / OSS / Langfuse / LLM 全部接通。完成本 phase 后:`agent run` 能跑 Claude 主脑 + DeepSeek fallback;`agent oss` 三件套能上下传文件;脚本能从 Langfuse 拉 prompt;6 张业务表落地;prompt cache 验证命中。

### 0.2 在范围内

- **DB**:drizzle schema 6 张业务表(`User` / `Project`(业务版)/ `Asset` / `Skill` / `StylePreset` / `Task`),migration 落盘,DB 路径 env 化(原 opencode 硬编码 `/home/thdxr/...`)
- **OSS**:ali-oss 客户端封装为 Effect Service,CLI `agent oss put/get/list`
- **Langfuse**:SDK 封装为 Effect Service,`getPrompt(name, label?)` 接口,smoke test 拉一条
- **LLM**:Claude(主)+ DeepSeek(fallback)接通。Claude 的 prompt cache 已在 opencode/src/provider/transform.ts 内置(`cacheControl: { type: "ephemeral" }`)—— 本 phase 只验证它实际命中
- **`agent model`**:已存在 `agent models [provider]` 列表命令;切换模型走 `agent run --model <id>` 现成 flag。无需新写命令(spec § 10 字面"`agent model` 命令切换"实施为 `--model` flag)
- **`.env.example`**:所有 Phase 2 凭据 / 路径 / 端点字段,完整 + 注释。`.env` 实际值不入 git。
- **业务 service 骨架**(精简版,不写流水线):每个 entity 一个 Effect Service,基础 CRUD(create / get / list / update / delete),返回 Effect

### 0.3 不在范围内

- atomic tools(Phase 3)
- skill 系统的完整加载/调用(Phase 4 完整实施;本 phase 只建 skill 表 metadata + Langfuse fetch 接口)
- WebUI(Phase 5)
- 业务流水线 service / 跨 entity 编排(违反 spec § 12 红线)
- 用户实际密码 hash 选型(Phase 5 auth pass 时定 bcrypt vs argon2;本 phase `password_hash` 字段先按 TEXT 存,不写 hash 工具)
- 数据迁移工具(legacy → new)—— spec § 14 明示 "prod 数据迁移由用户独自处置"
- HTTP API endpoints(routes/business/*)—— Phase 3 / 5 视需要补
- DB Postgres 化(opencode 默认 SQLite,Phase 2 沿用,详见 § 0.4 决策表)

### 0.4 决策预设(执行时如发现假设错误才停下)

| 议题 | 决策 | 理由 |
|---|---|---|
| **DB 选型** | SQLite(沿用 opencode 默认)| opencode session/message 表已是 SQLite + drizzle;混 PG + SQLite 增加运维复杂度。Day 0 单租户,SQLite 写并发够用。Phase X 真有压力再迁 PG 走 § 15 修订 |
| **DB 路径** | env `AGENT_DB_PATH`,默认走 `Global.Path.data + "/agent.db"`(opencode 已用 `Global.Path.data` 处理 marker file 见 src/index.ts:118) | env 化是 spec § 10 隐含要求(原写死 `/home/thdxr/...` 不可移植) |
| **业务表 namespace 防碰撞** | 业务表全部放 `agent/packages/opencode/src/business/<entity>/` 下,DB 表名加 `business_` 前缀 | opencode 已有自己的 `project/` 模块 + `ProjectTable`,重名冲突。前缀避免 |
| **Asset 版本链** | `parent_id` 链 + `is_current` 布尔(spec § 4 草图)+ `version` 整数自增 | 简单 LWW;无需复杂 DAG |
| **Task 父子链** | `parent_task_id` 自引 NULLABLE | spec § 4 提到"子 agent" |
| **Skill 系统** | 仅建 metadata 表 + Langfuse fetch 接口测通 | Phase 4 完整实施;本 phase 不写 skill loader / tool 注入 |
| **password_hash 字段** | TEXT,Phase 2 不写 hash 工具(留 NULL 或 placeholder) | Phase 5 auth pass 时一并实施 bcrypt / argon2 |
| **ali-oss vs S3 抽象** | 直接用 ali-oss SDK,**不**抽象通用 OSS 接口 | spec § 14 明示 "不商业化",Day 0 只阿里云。YAGNI 原则。Phase X 真要切换走 § 15 |
| **Langfuse SDK 选型** | npm 包 `langfuse`(官方 JS SDK)| 唯一选择 |
| **Langfuse 凭据** | env `LANGFUSE_HOST` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`,凭据从全局 env 注入(项目 CLAUDE.md 明示) | spec § 8.3 |
| **DeepSeek provider** | 用 `@ai-sdk/openai-compatible`(已留),通过 opencode 的 provider 配置注册 | DeepSeek 是 OAI 兼容 API,无需新依赖 |
| **prompt cache 验证** | 跑 `agent run "say hi"` 两次(同 session 复用 prefix),log 解析 `usage.cacheReadInputTokens > 0` | opencode/src/provider/transform.ts:260 已写好 cacheControl,只需触发 |
| **Service 骨架 Effect 风格** | `Context.Service`(同 opencode 现有),`defaultLayer` 走 SQLite | 一致风格 |
| **migration 工具** | drizzle-kit `generate`(opencode 自带),手动 `migrate` 触发 —— 直接复用 opencode 的 JsonMigration runner | src/index.ts 已有 migration runner,仅需扩展捕捉新 schema |
| **CLI `agent oss` 子命令** | 单文件 `cli/cmd/oss.ts`,yargs 子命令树 put / get / list | 跟 opencode 现有 mcp / agent / session 命令一致 |
| **SkillService 加载 langfuse** | Phase 2 留接口,Phase 4 才注入 system prompt | spec § 5.2 明示"加载时机:agent 启动时只拉 enabled skill 的 name + description" — Phase 4 实施 |

### 0.5 关键路径预图

```
Phase 2 开始 (HEAD = 68437d9)
  ├─ Step 1  写 plan + commit + push
  ├─ Step 2  DB 路径 env 化(改 drizzle.config.ts + db.bun.ts + db.node.ts)
  ├─ Step 3  6 张业务表 schema(`*.sql.ts` × 6 + 在 storage/schema.ts re-export)
  ├─ Step 4  drizzle generate migration + 手动 SQL review + 注册到 opencode 的 migration runner
  ├─ Step 5  smoke migration:跑 `agent --help` 触发 startup,验证 6 张表创建
  ├─ Step 6  ali-oss 依赖 + OSS Effect Service(`oss/oss.ts`)
  ├─ Step 7  CLI `agent oss <verb>` 三件套
  ├─ Step 8  langfuse 依赖 + Langfuse Effect Service(`langfuse/langfuse.ts`)+ smoke prompt fetch
  ├─ Step 9  DeepSeek provider 注册(opencode provider 配置)+ Claude API key check
  ├─ Step 10 prompt cache 命中验证(跑 `agent run` 两次,log 解析 cacheReadInputTokens)
  ├─ Step 11 业务 service 骨架(6 个 service,基础 CRUD)
  ├─ Step 12 `.env.example` 完整化
  ├─ Step 13 跑全量验收(7 项)
  ├─ Step 14 写 verification report
  ├─ Step 15 跑 superpowers:code-reviewer
  └─ Step 16 push + 通知用户 /compact
```

---

## 1. Pre-Step:Inventory & Anchor

### 1.1 现状 baseline

| 检查 | 命令 | 用途 |
|---|---|---|
| 当前 HEAD | `git log -1 --oneline` | 起点 = `68437d9` |
| `agent/packages/opencode/migration/` | `ls` | 看上游迁移文件,新迁移命名格式跟随上游(`YYYYMMDDhhmmss_<slug>`) |
| `agent/packages/opencode/drizzle.config.ts` | `cat` | 改 url(env 化) |
| `agent/packages/opencode/src/storage/{db.bun.ts,db.node.ts,db.ts,schema.ts}` | 读 | 知 db 入口怎么加载 |
| 已用的 cache control 代码 | `grep -n cacheControl agent/packages/opencode/src/provider/transform.ts` | 验证 prompt cache 已就绪 |
| 已注册 BUNDLED_PROVIDERS | `grep -A 10 BUNDLED_PROVIDERS agent/packages/opencode/src/provider/provider.ts` | 知 anthropic / openai-compatible / openai / google / github-copilot 五项已留 |
| Langfuse 凭据 | `env \| grep LANGFUSE` | 全局 env 已就绪(项目 CLAUDE.md 注) |

### 1.2 待新增依赖(opencode/package.json `dependencies`)

| 包 | 用途 |
|---|---|
| `ali-oss` | OSS Service |
| `langfuse` | Langfuse Service |

并验证 deps 仍精简(不引入 desktop / TUI / 多 provider)。

### 1.3 待新增源文件清单

```
agent/packages/opencode/src/business/
  user/
    user.sql.ts          # drizzle 表定义
    user.ts              # Effect Service(CRUD 骨架)
  project/
    project.sql.ts       # 业务 Project 表(避开 opencode 自己的 ProjectTable,加 business_ 前缀)
    project.ts
  asset/
    asset.sql.ts
    asset.ts
  skill/
    skill.sql.ts
    skill.ts             # 仅 metadata CRUD;Phase 4 才接 Langfuse 加载
  style-preset/
    style-preset.sql.ts
    style-preset.ts
  task/
    task.sql.ts
    task.ts

agent/packages/opencode/src/oss/
  oss.ts                 # Effect Service 包装 ali-oss

agent/packages/opencode/src/langfuse/
  langfuse.ts            # Effect Service 包装 langfuse SDK

agent/packages/opencode/src/cli/cmd/
  oss.ts                 # CLI subcommand:put / get / list

agent/packages/opencode/migration/
  20260429nnnnnn_phase2_business_schema/
    migration.sql        # drizzle generate 产物 + 人工 review
    snapshot.json        # drizzle 自动维护

.env.example             # 根目录,完整字段
```

### 1.4 待修改源文件

```
agent/packages/opencode/drizzle.config.ts   # url env 化
agent/packages/opencode/src/storage/schema.ts # re-export 6 张新表
agent/packages/opencode/src/storage/db.bun.ts # 读 AGENT_DB_PATH
agent/packages/opencode/src/storage/db.node.ts
agent/packages/opencode/src/index.ts        # 注册 OssCommand
agent/packages/opencode/src/provider/...    # DeepSeek 注册(实施时定文件)
agent/packages/opencode/package.json        # +ali-oss +langfuse
```

---

## 2. 步骤拆解

> 每步:**Action / 预计输出 / 自检 / 风险**。一步一 commit,失败可回滚。

### Step 1:写 phase-2 plan + commit + push

- **Action**:本文件落盘 + commit `docs(phase-2): add foundation plan` + push
- **预计输出**:HEAD 前进 1
- **自检**:`git log -1 --oneline`、`git status` 干净
- **风险**:零

### Step 2:DB 路径 env 化(`drizzle.config.ts` + `db.{bun,node}.ts`)

- **Action**:
  - `drizzle.config.ts`:`dbCredentials.url` 用 `process.env.AGENT_DB_PATH ?? Global.Path.data + "/agent.db"`(简化:落 `process.cwd()` + `.agent/agent.db` 当 fallback,因为 drizzle-kit 跑在工具时刻不便引用 opencode 模块)
  - `db.bun.ts` / `db.node.ts`:运行时 DB 打开路径同样读 `AGENT_DB_PATH`,fallback 走 `Global.Path.data`(`@opencode-ai/core/global`)
- **预计输出**:相关文件更新,无功能行为改变
- **自检**:
  - `bun --cwd packages/opencode typecheck` 退出 0
  - `bun run --cwd packages/opencode --conditions=browser src/index.ts --help` 跑通(说明 DB 还能 open)
- **风险**:`Global.Path.data` 在 drizzle-kit CLI(不走 bun runtime)拿不到 → fallback 走相对路径
- **commit**:`refactor(agent/storage): make DB path env-driven via AGENT_DB_PATH`

### Step 3:6 张业务表 schema 文件(`src/business/<entity>/<entity>.sql.ts`)

- **Action**:每个 entity 写 drizzle SQLite 表定义。详细字段如下:

#### 3.1 `business/user/user.sql.ts` — `business_user` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | ulid `usr_*` |
| `username` | TEXT UNIQUE NOT NULL | login id |
| `password_hash` | TEXT NULLABLE | Phase 5 实施 |
| `role` | TEXT NOT NULL | "admin" / "creator" |
| `created_at` | INTEGER NOT NULL | unix ms |
| `updated_at` | INTEGER NOT NULL | unix ms |

#### 3.2 `business/project/project.sql.ts` — `business_project` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | ulid `prj_*` |
| `type` | TEXT NOT NULL | "novel" / "manga" / "ad" / "preset_set" / "other" |
| `title` | TEXT NOT NULL | |
| `description` | TEXT NULLABLE | |
| `owner_id` | TEXT NOT NULL → `business_user.id` | |
| `metadata` | TEXT NULLABLE | JSON-encoded;type-specific |
| `created_at` | INTEGER NOT NULL | |
| `updated_at` | INTEGER NOT NULL | |

#### 3.3 `business/asset/asset.sql.ts` — `business_asset` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | ulid `ast_*` |
| `project_id` | TEXT NOT NULL → `business_project.id` | |
| `parent_id` | TEXT NULLABLE → `business_asset.id` | 版本链 |
| `type` | TEXT NOT NULL | "image" / "video" / "audio" / "script" / "metadata" |
| `key` | TEXT NOT NULL | 项目内逻辑 key,如 "character.alice" |
| `title` | TEXT NULLABLE | |
| `url` | TEXT NULLABLE | OSS URL |
| `data` | TEXT NULLABLE | JSON;metadata 或 text content |
| `prompt` | TEXT NULLABLE | 生成 prompt |
| `ref_urls` | TEXT NULLABLE | JSON array;参考资源 URL |
| `version` | INTEGER NOT NULL DEFAULT 1 | |
| `is_current` | INTEGER NOT NULL DEFAULT 1 | bool 0/1 |
| `created_at` | INTEGER NOT NULL | |
| 索引 | (project_id, key, version) UNIQUE | |
| 索引 | (project_id, key) where is_current=1 | 快速找当前版 |

#### 3.4 `business/skill/skill.sql.ts` — `business_skill` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | ulid `skl_*` |
| `name` | TEXT UNIQUE NOT NULL | snake_case |
| `description` | TEXT NOT NULL | system prompt 索引用 |
| `langfuse_prompt_key` | TEXT NOT NULL | e.g. `skill_<name>` |
| `langfuse_label` | TEXT NOT NULL DEFAULT "production" | |
| `scope` | TEXT NOT NULL DEFAULT "system" | "system" / "creator" |
| `enabled` | INTEGER NOT NULL DEFAULT 1 | bool 0/1 |
| `attachments` | TEXT NULLABLE | JSON array;OSS URL list |
| `created_at` | INTEGER NOT NULL | |
| `updated_at` | INTEGER NOT NULL | |

#### 3.5 `business/style-preset/style-preset.sql.ts` — `business_style_preset` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | ulid `sty_*` |
| `name` | TEXT NOT NULL | |
| `type` | TEXT NOT NULL | "character" / "scene" / "overall" |
| `data` | TEXT NOT NULL | JSON;结构化风格字段 |
| `owner_id` | TEXT NULLABLE → `business_user.id` | NULL = 全局 |
| `created_at` | INTEGER NOT NULL | |
| `updated_at` | INTEGER NOT NULL | |
| 索引 | (type) | |
| 索引 | (owner_id) | |

#### 3.6 `business/task/task.sql.ts` — `business_task` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | ulid `tsk_*` |
| `type` | TEXT NOT NULL | task 类型,如 "generate-image" |
| `status` | TEXT NOT NULL DEFAULT "pending" | "pending" / "running" / "succeeded" / "failed" / "canceled" |
| `project_id` | TEXT NULLABLE → `business_project.id` | |
| `parent_task_id` | TEXT NULLABLE → `business_task.id` | sub-agent 链 |
| `input` | TEXT NULLABLE | JSON 输入 |
| `output` | TEXT NULLABLE | JSON 输出 |
| `error` | TEXT NULLABLE | |
| `progress` | REAL NULLABLE | 0..1 |
| `started_at` | INTEGER NULLABLE | |
| `completed_at` | INTEGER NULLABLE | |
| `created_at` | INTEGER NOT NULL | |
| `updated_at` | INTEGER NOT NULL | |
| 索引 | (status) | |
| 索引 | (project_id, created_at) | |

- **预计输出**:6 个 `*.sql.ts` 文件 + 在 `agent/packages/opencode/src/storage/schema.ts` 加 6 个 re-export
- **自检**:
  - 6 个 `.sql.ts` 都 `import { sqliteTable } from "drizzle-orm/sqlite-core"` 风格,跟 opencode 现有 `account.sql.ts` 一致
  - `bun --cwd packages/opencode typecheck` 退出 0
- **风险**:跟 opencode 现有 ProjectTable 命名冲突 → 用 `BusinessProjectTable` 类型名 + `business_project` DB 名
- **commit**:`feat(agent/business): add 6 drizzle business tables (User/Project/Asset/Skill/StylePreset/Task)`

### Step 4:drizzle generate migration + 注册到 migration runner

- **Action**:
  - `cd agent/packages/opencode && bun drizzle-kit generate --name phase2_business_schema`
  - 检查生成的 `migration/<timestamp>_phase2_business_schema/migration.sql` 是 6 个 CREATE TABLE + 索引,无 DROP / ALTER
  - 检查 `migration/snapshot.json` 入 git
  - 检查 opencode src/index.ts 内的 `JsonMigration.run` —— 它读 `migration/` 自动跑;如果通过该机制吃新迁移,无需更多代码;否则补
- **预计输出**:`migration/<ts>_phase2_business_schema/` 目录新增
- **自检**:
  - migration.sql 内容用 `head` 看,确认是预期 SQL
  - typecheck 仍 0
- **风险**:opencode 的 migration runner 期望特定路径或 schema → 提前读 `JsonMigration.run` 确认
- **commit**:`feat(agent/migration): add phase2 business schema migration`

### Step 5:smoke migration —— 跑 `agent --help` 触发 DB 创建,验证 6 张表

- **Action**:
  - 删一遍本地 dev DB(`rm -rf $AGENT_DB_PATH 或默认路径下的 agent.db`)
  - `bun run --cwd packages/opencode --conditions=browser src/index.ts --help` —— opencode 启动会自动 migrate(src/index.ts:118-153)
  - 用 SQLite CLI 检查表存在:`sqlite3 $AGENT_DB_PATH ".tables" | grep business_`
  - 应见 `business_user`、`business_project`、`business_asset`、`business_skill`、`business_style_preset`、`business_task` 全 6 张
- **预计输出**:6 张业务表存在
- **自检**:`.tables` 输出 + `.schema business_user` 字段对得上 § 3.1
- **风险**:opencode migration runner 不识别我们的新迁移 → fallback 直接调 drizzle-kit `migrate` 命令
- **commit**:不必专 commit(测试性步骤)

### Step 6:ali-oss 依赖 + OSS Effect Service(`src/oss/oss.ts`)

- **Action**:
  - `cd agent && bun add --cwd packages/opencode ali-oss`
  - 写 `src/oss/oss.ts`:
    - `Context.Service` 模式
    - 接口:`put(key: string, body: Buffer | string): Effect<{ url: string }>`、`get(key: string): Effect<Buffer>`、`list(prefix?: string): Effect<{ keys: string[] }>`、`delete(key: string)`
    - `defaultLayer` 从 env 读 `OSS_REGION` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET` / `OSS_ENDPOINT`,bind ali-oss client
    - 错误以 `OSSError` 类(`@opencode-ai/core/util/error` 的 `NamedError`)抛出
- **预计输出**:`oss/oss.ts` 新建,`package.json` deps + lockfile 更新
- **自检**:
  - typecheck 0
  - 单测可选:写 1 个 mock-driven 单测(stub ali-oss client),验证 `put` Effect 调用 client.put
- **风险**:ali-oss SDK 在 Bun 下 readme 说支持,但 native ali-oss 的 axios 依赖可能需 polyfill — 真有问题改 npm `@aws-sdk/client-s3` + S3-compatible 模式跑 OSS,记入风险
- **commit**:`feat(agent/oss): add ali-oss Effect Service wrapper`

### Step 7:CLI `agent oss <verb>` 三件套(`src/cli/cmd/oss.ts`)

- **Action**:
  - 写 `cli/cmd/oss.ts`:yargs subcommand
    - `agent oss put <local> <key>` —— 上传本地文件
    - `agent oss get <key> <local>` —— 下载到本地
    - `agent oss list [prefix]` —— 列 keys
  - `OssCommand` export
  - 在 `src/index.ts` 注册 `.command(OssCommand)`
- **预计输出**:新 cli command 文件 + index.ts 一行 import + 一行 `.command()`
- **自检**:
  - `bun run ... src/index.ts --help` 输出包含 `agent oss     manage Aliyun OSS objects`(或类似 describe)
  - `bun run ... src/index.ts oss --help` 显示三个 subcommand
- **风险**:OSS env 缺时 friendly error message
- **commit**:`feat(agent/cli): add agent oss put/get/list commands`

### Step 8:langfuse 依赖 + Langfuse Effect Service + smoke fetch

- **Action**:
  - `bun add --cwd packages/opencode langfuse`
  - 写 `src/langfuse/langfuse.ts`:
    - `Context.Service`
    - 接口:`getPrompt(name: string, opts?: { label?: string }): Effect<{ name: string; version: number; label: string; body: string }>`
    - `defaultLayer` env:`LANGFUSE_HOST`(default `https://prompt.mobai-game.com`)/ `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
  - smoke 命令:`bun run --cwd packages/opencode --conditions=browser src/langfuse/langfuse.ts --smoke <prompt-name>` 或单测
- **预计输出**:`langfuse/langfuse.ts` 新建 + smoke 验证拿到一个 prompt
- **自检**:
  - typecheck 0
  - 实跑 fetch 一个 Langfuse 现存 prompt(项目 CLAUDE.md 注:project=`assets-produce`)—— 如该 project 还没 prompt,先在 Langfuse Web UI 手 create 一条测试 prompt(如 `test_phase2_smoke`)
- **风险**:全局 env 没注入 Langfuse 凭据 → 提示用户 `source ~/.envrc`
- **commit**:`feat(agent/langfuse): add Langfuse Effect Service + smoke prompt fetch`

### Step 9:DeepSeek provider 注册 + Claude API key check

- **Action**:
  - DeepSeek 走 `@ai-sdk/openai-compatible`,opencode 配置文件需注册 `deepseek` provider
  - 实施手段:opencode 用 `~/.config/opencode/auth.json` + `models.json` 来配置 provider —— 我们提供示例 config 或 CLI auto-init
  - 推荐做法:写 `agent/packages/opencode/specs/...`(不,specs/ 砍了)。直接更新 `.env.example` + 写一段 README 在 verification report 说明用户怎么 `agent providers add deepseek` 来配
  - Claude API key:确认 env `ANTHROPIC_API_KEY` 接通,opencode `provider.ts` 已读
- **预计输出**:provider 配置文档化(放 `.env.example` 注释 + verification report)
- **自检**:
  - `bun run ... src/index.ts providers` 命令列出 anthropic + deepseek(若 env 已设)
  - `bun run ... src/index.ts run "say hi"` 用 anthropic 默认跑通(需 ANTHROPIC_API_KEY)
  - `bun run ... src/index.ts run "say hi" --model deepseek/deepseek-chat`(或类似)跑通
- **风险**:opencode provider 配置非纯 env-driven —— 需写 auth.json 或 models.json。**这是 phase 2 最大不确定**,详见 § 4 R3。如果 `agent providers add` CLI 不存在,先 manual 配 auth.json 走通验收,Phase 6 再 polish
- **commit**:`feat(agent/provider): wire up DeepSeek + verify Claude pathway`

### Step 10:prompt cache 命中验证

- **Action**:
  - 跑 `bun run ... src/index.ts run "say hi"` 第一次 —— log 解析输出的 usage 字段(opencode 应 log `cacheCreationInputTokens` / `cacheReadInputTokens`)
  - 跑第 2 次同样 prompt —— 第 2 次 `cacheReadInputTokens > 0` 才算命中
  - 看 opencode 怎么 log cache:`grep cacheRead agent/packages/opencode/src/session/`,可能要稍微露点 metric
- **预计输出**:log 显示第 2 次有 cache read tokens
- **自检**:实测 stdout 或 logfile,grep `cacheRead`
- **风险**:opencode 默认不 log cache 数字 → 临时加一个 console.log 在 transform.ts 的 usage 处理,或读 langfuse trace(若 opencode 已上 OTel)
- **commit**:不必专 commit(若改了 log,记入 verification 报告;若纯验证,不 commit)

### Step 11:业务 service 骨架(6 个,基础 CRUD)

- **Action**:每个 entity 写一个 `<entity>.ts`:
  - `Context.Service` 模式
  - 接口:`create(input)`、`get(id)`、`list(filters?)`、`update(id, patch)`、`delete(id)` —— 全返回 Effect
  - `defaultLayer` 用 drizzle 客户端(`Database.Client()` 已在 opencode src/storage/db.ts 有 helper)
  - 实现用 drizzle 的 `db.insert()` / `db.select()` / `db.update()` / `db.delete()`
- **预计输出**:6 个 `<entity>.ts` 文件
- **自检**:
  - typecheck 0
  - 写 1-2 个 sanity 单测(每个 service create + get 跑通)
- **风险**:Effect 学习曲线 —— 套用 opencode 现有 `account/account.ts` 作模板,改字段即可
- **commit**:`feat(agent/business): add CRUD service skeletons for 6 entities`

### Step 12:`.env.example` 完整化

- **Action**:在仓库根写 `.env.example`,字段如下(分组 + 注释):
  ```
  # ----- 服务端口 -----
  AGENT_PORT=8001

  # ----- 存储路径 -----
  # AGENT_DB_PATH=  # 默认 ~/.local/share/agent/agent.db (XDG-style)

  # ----- Anthropic (Claude 主脑) -----
  ANTHROPIC_API_KEY=sk-ant-xxx

  # ----- DeepSeek (fallback / 国产合规) -----
  DEEPSEEK_API_KEY=sk-xxx
  DEEPSEEK_BASE_URL=https://api.deepseek.com

  # ----- Langfuse (skill body / prompt 管理) -----
  LANGFUSE_HOST=https://prompt.mobai-game.com
  LANGFUSE_PUBLIC_KEY=pk-lf-xxx
  LANGFUSE_SECRET_KEY=sk-lf-xxx

  # ----- 阿里云 OSS -----
  OSS_REGION=cn-shanghai
  OSS_ACCESS_KEY_ID=
  OSS_ACCESS_KEY_SECRET=
  OSS_BUCKET=
  OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com
  ```
  - **注意**:实际 `.env`(在用户机器上)由用户填入真实值,不入 git。验证 `.env` 跟 `.env.example` 字段一致(spec § 10 验收)
- **预计输出**:`.env.example` 落盘
- **自检**:`diff <(grep -oE '^[A-Z_]+' .env.example | sort) <(grep -oE '^[A-Z_]+' .env | sort)` —— 字段差集应为空(允许 .env 多 dev-only 字段)
- **风险**:零(纯文档)
- **commit**:`docs(env): add complete .env.example for Phase 2 foundation`

### Step 13:全量验收(spec § 10 Phase 2 七项)

依次跑 7 个验收命令(详 § 3 表),记每条实际输出。

### Step 14:写 verification report

`docs/superpowers/specs/phase-2-foundation-verification.md`,逐条对验收项打勾,记下偏差。结构跟 phase-1 verification 一致。

### Step 15:跑 `superpowers:code-reviewer`

dispatch code-reviewer subagent reviewing Phase 2 commits 全集 vs plan + spec。SHOULD FIX 修。

### Step 16:push 到 origin/main + 通知用户 `/compact`

`git push origin main`,然后告诉用户 "Phase 2 完成,请 /compact 后说『继续』"

---

## 3. 验收对照(spec § 10 Phase 2 — 7 项)

| # | 验收项 | 验证命令 / 方法 | 预计通过条件 |
|---|---|---|---|
| 1 | `agent run "say hi"` 用 Claude 跑通 | `cd agent && bun run --cwd packages/opencode --conditions=browser src/index.ts run "say hi"` | 输出 LLM 回复(不报 missing API key)|
| 2 | `agent run --model deepseek...` 跑通 | 同上 + `--model deepseek/deepseek-chat`(具体 model id 实施时定) | 输出 DeepSeek 回复 |
| 3 | `agent oss put foo.txt` / `get` / `list` 跑通 | 三条命令依次跑 | put 返回 OSS URL;list 见 key;get 文件内容一致 |
| 4 | 内部测试脚本能从 Langfuse 拉到一个测试 prompt | smoke script(Step 8) | 输出 prompt body |
| 5 | `pnpm db:migrate` 跑通,6 张表存在(spec 字面 pnpm,实施按 § 0.4 改 bun) | drizzle-kit migrate 或 opencode startup migrate | sqlite3 `.tables` 看到 6 张 `business_*` 表 |
| 6 | `.env.example` 跟 `.env` 字段一致 | `diff` 命令(详 Step 12) | 空 diff(field-level) |
| 7 | prompt cache 在 Claude 调用时确实命中(log 验证) | Step 10 双跑 + log 解析 | 第 2 次跑有 `cacheReadInputTokens > 0` |

**全 7 项过 = 验收通过。**

---

## 4. 风险注册

| 风险 | 触发场景 | 影响 | 缓解 |
|---|---|---|---|
| **R1**:Drizzle SQLite 迁移与 opencode 自带 JsonMigration runner 接口不匹配 | Step 5 跑 startup 时某种 schema mismatch | 6 张表没创建 | 直接调 drizzle-kit `migrate` 命令绕过,记入 verification 偏差 |
| **R2**:ali-oss SDK 在 Bun 下不稳(axios 等 polyfill 问题) | Step 6 / 7 实测 OSS 调用 | OSS 验收过不了 | fallback 用 `@aws-sdk/client-s3` + S3 兼容模式;若仍失败,改 fetch 直调 OSS REST,记入风险 |
| **R3**:opencode provider 配置非纯 env-driven,DeepSeek 注册需写 auth.json/models.json | Step 9 实测 `agent run --model deepseek` | DeepSeek fallback 不通 | 实施时翻 opencode 现有 account/auth 流程,manual 写一份配置 + verification 文档化;复杂的话申明"DeepSeek 走 OpenAI compatible endpoint manual 配置",Phase 6 polish CLI |
| **R4**:Langfuse smoke fetch 没有现存 prompt 拉 | Step 8 实测 | smoke 失败 | 在 Langfuse Web UI 手建一条 `test_phase2_smoke` prompt 即可。验收 4 描述要支持这一步骤 |
| **R5**:prompt cache 第 2 次仍 miss(prefix 不一致 / cache control 丢) | Step 10 验证 | 验收 7 失败 | 先 `grep cacheCreation` 看到底 log 啥;实测每次 input tokens;若依然 miss,补 verbose log + 找 root cause |
| **R6**:6 张表中某个字段类型选错(SQLite 没 BOOLEAN / JSON 类型) | Step 4 typecheck | drizzle 报类型不匹配 | 用 `integer({ mode: "boolean" })`、`text({ mode: "json" })` 模式;drizzle SQLite 已封装 |
| **R7**:`Global.Path.data` 在 drizzle-kit 运行时不可用 | Step 2 改 drizzle.config.ts 后 `bun drizzle-kit generate` 报 import error | migration 生成卡住 | drizzle.config.ts 用 fallback path(`process.cwd() + "/.agent/agent.db"`),只在 runtime 用 `Global.Path.data` |
| **R8**:Langfuse SDK 在 Bun 下要求 Node async_hooks | Step 8 实跑报错 | smoke 失败 | langfuse npm 有 node + edge 双入口;按 condition 选 node 模式;若不行,改 `fetch` 直接调 langfuse REST API |
| **R9**:Effect Service 写法错 → 运行时 `Service.use` 找不到 implementation | Step 11 单测 | service 用不起来 | 套用 `agent/packages/opencode/src/account/account.ts` 当模板,改字段即可 |
| **R10**:DB 路径 env `AGENT_DB_PATH` 未设时 fallback 跑到 opencode 自己的 `Global.Path.data + "/opencode.db"` 撞库 | Step 2 / Step 5 | 数据混进 opencode 库 | fallback 路径改 `Global.Path.data + "/agent.db"`(不撞 `opencode.db`);或新建子目录 |

---

## 5. 后续 phase 待办挂起

(Phase 2 不做,但执行中可能撞到的事)

- atomic tools(Phase 3)
- skill 系统的完整加载(Phase 4):skill body 拉取 → system prompt 注入 → `skill <name>` tool
- WebUI(Phase 5)+ HTTP API endpoints(Phase 5 / 3 视需要)
- 用户密码 hash 工具(Phase 5 auth pass)
- DB → PostgreSQL 迁移(Phase X 视需要,走 § 15)
- legacy 数据迁移(spec § 14 不做)
- Phase 6 命名/cleanup pass(npm 包名 `@opencode-ai/*` → `@assets-produce/*` 等)

---

## 6. 与 spec / 红线的对照(防偏离自检)

- ✅ 不写硬编码视频流水线 service —— 只写 entity-level CRUD service skeleton,无 `*-orchestration` / `*-coordination` / `*-workflow-service` 嫌疑
- ✅ 不让 skill body 散落 markdown —— skill 表存 langfuse_prompt_key,正文一律 Langfuse 拉
- ✅ 不在 WebUI 实现独立业务逻辑 —— Phase 2 不动 web/
- ✅ 不混淆 creator / developer profile —— Phase 2 不动 permission(留 Phase 5)
- ✅ 在没写 phase plan 前不直接动代码 —— 本文落盘后才 Step 2 起执行
- ✅ phase 之间不跳过 /compact / verification —— Step 13-16 覆盖

如执行时撞到 spec § 15 修订点,按 § 11.3 流程更新 spec § 15 后才继续。

---

## 7. 命名 / 路径速查(给执行步骤随时翻)

- **业务 namespace**:`agent/packages/opencode/src/business/<entity>/`
- **业务 DB 表名前缀**:`business_*`
- **类型名前缀(避撞)**:`Business<Entity>Table` for opencode 已占的名字(只 Project 一个)
- **migration 命名**:`<YYYYMMDDHHMMSS>_phase2_<slug>`
- **env 命名**:`AGENT_*`(我们的)、`OSS_*`、`LANGFUSE_*`、`ANTHROPIC_API_KEY`、`DEEPSEEK_*`
- **CLI 命令**:kebab-case(`oss put` / `oss get` / `oss list`)
- **service 文件**:`<entity>.ts`,导出 `<Entity>` namespace 含 `Service`、`defaultLayer`
- **schema 文件**:`<entity>.sql.ts`,导出 `<Entity>Table`(或 `Business<Entity>Table`)
