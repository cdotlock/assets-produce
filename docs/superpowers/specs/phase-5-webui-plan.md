# Phase 5 — WebUI Workspace Plan

> **Spec ref**: [§ 7 + § 9 + § 10 Phase 5](2026-04-29-assets-produce-spec.md#phase-5--webui-workspace)
> **Date**: 2026-04-30
> **Author**: Claude Opus 4.7 (1M)

---

## 0. 决策表（先决,不待 verification）

| # | 议题 | 决策 | 理由 |
|---|---|---|---|
| 0.1 | 框架 | Next.js 15 App Router + React 19（与 spec § 7.1 对齐） | spec 字面 |
| 0.2 | UI 组件 | shadcn/ui（Tailwind v4 + Radix） | spec 字面 |
| 0.3 | 包管理 | bun + workspace（与 agent 同 monorepo） | 一键 install / dev |
| 0.4 | dev 端口 | 3000（spec 默认） | 已写入 CLAUDE.md |
| 0.5 | agent server 接入 | 走现有 `agent serve` HTTP API；本 phase 不引入新 SDK，写薄 fetch wrapper（`web/src/lib/agent-client.ts`） | 复用 Phase 4 / Phase 3 已有 endpoint；SSE 走原生 EventSource |
| 0.6 | auth 模式 | username/password → 后端发 JWT（HS256，env `JWT_SECRET`），client 存 httpOnly cookie | spec § 9.1；不接 SSO |
| 0.7 | password hash | bcrypt（cost=12）；agent 已有 user 表带 password_hash 字段（Phase 2 已建） | 业内标准 |
| 0.8 | session 持久化 | JWT (12h ttl) + refresh token (30d) httpOnly cookie；存 DB `business_user` 之外加新表 `business_session_token`（id, user_id, token_hash, expires_at, revoked） | 必要：让 admin 能 revoke、防 replay |
| 0.9 | permission profile 注入 | agent server 收到带 JWT 的请求时，通过 middleware 把 `profile=creator`（来自 token）注入 chat session 的 agent metadata；profile 决定 ToolRegistry 暴露哪些 tool | 红线 4 |
| 0.10 | creator 工具白名单 | atomic asset tools(6) + skill tool + read tool + 必要内置（todowrite / glob / webfetch?）；**砍**：bash / edit / write / apply_patch / skill 管理 / config / debug / mcp 管理 | spec § 9.2 |
| 0.11 | profile 实现层 | 通过 opencode 的 `Permission.evaluate` ruleset：每个 profile 一组 deny rules；agent 启动时按 profile 注入 ruleset。`agent serve` 启动新 session 时把 ruleset 写到 session.permissions | spec § 9.2 + § 5.4 红线 4 |
| 0.12 | API auth gate | 所有 `/api/*` 走 JWT middleware（除 `/api/auth/login`）；`/api/skills` 限 admin（Phase 4 MUST-4 升级） | spec § 9.2 + Phase 4 MUST-4 |
| 0.13 | WebUI 首版页面范围 | `/login` + `/`（chat）+ `/skills`（list only）+ `/assets`（list + detail drawer）+ `/projects`（list）。**砍**：注册（admin 走 CLI）、用户管理、cost 分析 | spec § 10 验收 |
| 0.14 | chat 实现 | 直接调 `agent serve` 的 session SSE endpoint；中断按 spec § 5/run-state（已存在 abort signal） | 已有 |
| 0.15 | 资产页 source | 走 Phase 2 `business/asset` table：`asset.list({ project_id?, type?, limit, offset })` + `asset.get(id)` —— 后端加 HTTP 路由 `/api/assets`、`/api/assets/:id` | spec § 7.2 + Phase 2 已建表 |
| 0.16 | 资产 detail UI | 复制 legacy `ResourceDetailDrawer.tsx` 视觉骨架（图、视频、prompt、metadata），用 shadcn Drawer 重写 | spec § 7.2 字面 reference |
| 0.17 | E2E novel → video on web | 创作者登录 → 选项目 → 在 chat 里说 "use novel-to-video skill on this passage..." → 看到 streaming 工具调用 → 拿到 OSS URL → 资产页能看到生成 | spec § 10 验收 #2 |
| 0.18 | server 与 web 部署形态 | 本 phase 都走本地 dev：`bun --cwd agent run dev` (port 8001) + `bun --cwd web run dev` (port 3000)。CORS allow `http://localhost:3000` | dev-only |
| 0.19 | TLS / 反向代理 | 本 phase 不做 | Phase 6 polish |
| 0.20 | i18n | 英文优先；`/skills`、`/assets` 文本 hard-code 中英混排（与 CLI 一致） | 不上 i18n SDK |
| 0.21 | dryRun for `agent users add` | 沿用 SkillCli pattern：dry-run 打印 resolved；non-dry 写 DB | spec § 6.2 |
| 0.22 | 关键依赖锁定 | next@15、react@19、tailwindcss@4、@radix-ui/*、shadcn@latest、bcrypt@5、jose@5（JWT）、zod@3 | 当前生态主流 |

---

## 1. 文件清单

### 1.1 新建（agent 端）

| 路径 | 职责 |
|---|---|
| `agent/packages/opencode/src/business/user/cli.ts` | `agent users add/list/passwd/delete` 业务 helper（与 SkillCli 同模式） |
| `agent/packages/opencode/src/cli/cmd/users.ts` | yargs subcmd group |
| `agent/packages/opencode/src/auth/web.ts` | bcrypt 验证 + JWT 签发（`signJwt(userId, role) / verifyJwt(token)`） |
| `agent/packages/opencode/src/server/routes/instance/auth.ts` | `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me` |
| `agent/packages/opencode/src/server/routes/instance/asset.ts` | `GET /api/assets`、`GET /api/assets/:id` |
| `agent/packages/opencode/src/permission/profile.ts` | `creator` / `developer` 两个 ruleset 常量 + helper `applyProfile(ruleset, profile)` |
| `agent/packages/opencode/src/business/session-token/session-token.sql.ts` | `business_session_token` drizzle schema |
| `agent/packages/opencode/src/business/session-token/session-token.ts` | CRUD service |
| `agent/packages/opencode/migrations/00X_session_token.sql` | drizzle migration |

### 1.2 新建（web/）

WebUI 文件多，按目录列：

```
web/
├── package.json                  # next, react, tailwind, shadcn deps
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json               # shadcn config
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout
│   │   ├── globals.css
│   │   ├── login/
│   │   │   └── page.tsx          # login form
│   │   ├── (creator)/            # auth-gated layout group
│   │   │   ├── layout.tsx        # sidebar nav + auth check
│   │   │   ├── page.tsx          # / chat workspace
│   │   │   ├── skills/
│   │   │   │   └── page.tsx      # skill list (creator scope only)
│   │   │   ├── assets/
│   │   │   │   └── page.tsx      # asset list + detail drawer
│   │   │   └── projects/
│   │   │       └── page.tsx      # project list
│   │   └── api/                  # Next.js route handlers (proxy to agent)
│   │       └── auth/
│   │           ├── login/route.ts
│   │           ├── logout/route.ts
│   │           └── me/route.ts
│   ├── components/
│   │   ├── ui/                   # shadcn primitives (button, input, drawer, ...)
│   │   ├── chat-window.tsx
│   │   ├── chat-input.tsx
│   │   ├── streaming-message.tsx
│   │   ├── asset-card.tsx
│   │   ├── asset-detail-drawer.tsx  # 仿 legacy ResourceDetailDrawer
│   │   ├── skill-row.tsx
│   │   ├── sidebar.tsx
│   │   └── login-form.tsx
│   ├── lib/
│   │   ├── agent-client.ts       # fetch wrapper hitting agent/* endpoints
│   │   ├── auth-client.ts        # cookie-based session helpers
│   │   ├── sse.ts                # EventSource wrapper for chat streaming
│   │   └── utils.ts              # shadcn cn() etc.
│   └── types/
│       └── api.ts                # SkillInfo, AssetInfo, ChatEvent shapes
└── README.md
```

### 1.3 修改

| 路径 | 修改 |
|---|---|
| `agent/packages/opencode/src/index.ts` | 注册 `UsersCommand` |
| `agent/packages/opencode/src/server/routes/instance/index.ts` | 注册 AuthRoutes、AssetRoutes |
| `agent/packages/opencode/src/server/routes/instance/skill.ts` | 加 JWT-admin gate（升级 Phase 4 MUST-4） |
| `agent/packages/opencode/src/server/middleware.ts` | 加 JWT middleware 解析 token → 注入 user/profile 到 hono context |
| `agent/packages/opencode/src/session/session.ts`（or 等价） | 启动 session 时根据 user profile 应用 ruleset |
| `package.json`（仓库根） | 加 web workspace |
| `.env.example` | 加 `JWT_SECRET`、`AGENT_HTTP_BASE_URL`（web → agent） |

---

## 2. 步骤拆解（30 步）

每步 5-20 min，每步独立 commit。

| Step | 内容 | 预计输出 / 测试 |
|---|---|---|
| 1 | 写本 plan + commit + push | 本文 |
| 2 | `business/user/cli.ts` + `cli/cmd/users.ts` 实现 add/list/passwd/delete | `agent users add admin --role admin` 落 DB |
| 3 | bcrypt + jose 加依赖到 agent 包；写 `auth/web.ts` (signJwt/verifyJwt/hashPassword/verifyPassword) | unit-style smoke |
| 4 | drizzle schema `business_session_token` + migration | `agent db migrate` 通过 |
| 5 | `business/session-token` CRUD service | bun build 通过 |
| 6 | `auth.ts` HTTP routes：POST /api/auth/login（验密码、签 JWT、写 refresh）、logout（撤 refresh）、me（验 JWT） | curl POST /api/auth/login 拿 token |
| 7 | server middleware：解 Authorization Bearer → 注入 user/profile 到 hono ctx | curl 带 token 访 GET /api/auth/me |
| 8 | `permission/profile.ts`：creator deny rules（bash/edit/write/skill 管理 等）+ developer 全开 | spec § 9.2 表格 |
| 9 | session 启动时按 profile 应用 ruleset | session.list 看到对应 permissions |
| 10 | `/api/skills` 加 JWT-admin gate（POST/PATCH/DELETE 限 admin；GET 限 admin+creator） | curl 拿 401/403 |
| 11 | `/api/assets` GET list + GET :id（仅返自己 user 的资产；query: project_id, type, limit, offset） | unit |
| 12 | web/ 起 Next.js 15 + shadcn/ui workspace（package.json、next.config、tsconfig、tailwind、components.json） | `bun --cwd web run dev` 起 3000 |
| 13 | shadcn install button / input / form / drawer / dialog / sonner / select / table | 全 ui/ 文件落地 |
| 14 | `lib/agent-client.ts` + `lib/auth-client.ts` + types/api.ts | 类型对齐 |
| 15 | `/login` page + `app/api/auth/login/route.ts` proxy → agent | 登录，cookie 写入 |
| 16 | (creator) layout：sidebar 导航 + auth check redirect /login | 访问 / 未登录跳 /login |
| 17 | `/skills` page：fetch GET /api/skills?scope=creator → table；点 row 跳 Langfuse `<host>/p/<key>` | scope=system 不显示 |
| 18 | `/projects` page：fetch GET /api/projects → list（先用 stub，agent 端无 GET 时同步加） | list 可见 |
| 19 | `/assets` page：fetch GET /api/assets → grid card；点 card 开 detail drawer 显示图/视频/prompt | 仿 legacy 视觉 |
| 20 | `/`（chat）page：input box + message list + send → 创建 session → SSE EventSource | 第一条消息打过去能看到 streaming |
| 21 | chat 中工具调用 streaming UI（tool name + status + result preview） | run novel-to-video，UI 显示 tool calls |
| 22 | chat 中断按钮（POST /api/session/:id/abort） | 中断生效 |
| 23 | `agent users add` admin 用户 + login from web | 成功 |
| 24 | E2E：登录 → 在 chat 中跑 novel-to-video → 资产页看到 3 个 OSS URL | 验收 #2、#4 |
| 25 | creator profile 拒绝 bash 工具调用（直接 chat 让 LLM bash → 看到 deny） | 验收 #3 |
| 26 | creator 看不到 `/skills` 的 scope=system skill（只看 creator） | 验收 #3 |
| 27 | 中断 chat 后 session 状态正确（不卡死、不丢失） | 验收 #5 |
| 28 | 写 verification report | docs/.../phase-5-webui-verification.md |
| 29 | 跑 superpowers:code-reviewer + 应用 MUST FIX | commits |
| 30 | commit + push + /compact 通知 | git push |

---

## 3. permission profile ruleset

### 3.1 `creator`

> **修订 (2026-04-30)**: 原稿规则顺序 + 命名空间均与 codebase 中 `Permission.evaluate` / `Permission.disabled` 的 `findLast` 语义不兼容。修正：(a) catch-all `allow * *` 必须在最前（一般规则在前，具体 deny 在后，因为 last-match-wins）；(b) tool permission key 是裸名，不带 `tool:` 前缀（runtime 调用点确认：`tool/bash.ts` 传 `permission: "bash"`，`Permission.disabled` 用裸 tool 名）。`skills:add/update/delete` / `config:*` / `shell:*` 在当前 runtime 没有调用点（HTTP-level admin gate 已通过 JWT 中间件实现），从 ruleset 中移除避免死代码。

```ts
[
  // catch-all allow（评估顺序在前；下面具体 deny 因 last-match-wins 覆盖之）
  { permission: "*", pattern: "*", action: "allow" },
  // 砍掉的工具（裸名，无 tool: 前缀）
  { permission: "bash", pattern: "*", action: "deny" },
  { permission: "edit", pattern: "*", action: "deny" },
  { permission: "write", pattern: "*", action: "deny" },
  { permission: "apply_patch", pattern: "*", action: "deny" },
  { permission: "lsp_*", pattern: "*", action: "deny" },
  { permission: "ast_grep_*", pattern: "*", action: "deny" },
  { permission: "debug", pattern: "*", action: "deny" },
]
```

skills 管理 / config / shell 的隔离由 HTTP 层 JWT admin gate（step 10 已实现）负责，不依赖 ruleset。

### 3.2 `developer`

```ts
[ { permission: "*", pattern: "*", action: "allow" } ]
```

---

## 4. JWT shape

```json
{
  "sub": "<user.id>",
  "username": "<username>",
  "role": "creator" | "admin",
  "profile": "creator" | "developer",
  "iat": <unix>,
  "exp": <unix + 12h>
}
```

- `role` 决定 admin-only 路由（`/api/skills` POST/PATCH/DELETE、`/api/users`）
- `profile` 决定 chat session 的 ruleset（admin 可手动指定 dev profile？暂不支持，admin 默认走 creator profile，CLI 才有 developer）
- HMAC-SHA256，env `JWT_SECRET`（≥ 32 chars）

---

## 5. 接口契约（精简）

### 5.1 `POST /api/auth/login`

```ts
// Request
{ username: string, password: string }

// Response 200
{ token: string, expires_at: number, user: { id, username, role } }
// Response 401
{ error: "invalid credentials" }
```

### 5.2 `GET /api/assets?project_id=<>&type=<image|video>&limit=<>&offset=<>`

```ts
// Response 200
{ assets: AssetInfo[], total: number }
```

### 5.3 `GET /api/assets/:id`

```ts
// Response 200
AssetInfo  // including OSS URL, prompt, model, generated_at, source_session
```

### 5.4 `POST /api/session/:id/abort`

```ts
// Response 204
```

---

## 6. 验收项核对（spec § 10 Phase 5 — 5 项）

| # | 验收项 | 验证方法 |
|---|---|---|
| 1 | 创作者用 username/password 能登入 | curl + browser；JWT 签发 + cookie 写入 |
| 2 | web 端 chat 能跑通"小说 → 视频"全流程 | 浏览器登录 → 输入 passage → chat 调 skill + 3 atomic tool → 拿 OSS URL；资产页看到 |
| 3 | creator profile 时 skill 管理 / config / shell 工具不可见也不可调（即使尝试也被 ruleset 拒） | LLM 试调 bash 看到 PermissionDeniedError；`/skills` 无 add 按钮 |
| 4 | 资产页能看到生成历史 + 单资产详情（图、视频、prompt 元数据） | UI 截图 / 接口校验 |
| 5 | 中断 chat 后 task 状态正确（不卡死、不丢失） | 中断后 session 进 idle，可以发新消息 |

---

## 7. 风险登记

| ID | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | Phase 4 MUST-4 auth 缺位 | /api/skills 没保护 | step 10 升级（POST/PATCH/DELETE admin-only） |
| R2 | session 启动时 ruleset 注入位置不显眼 | profile 实际不生效 | step 9 加 unit + step 25 E2E |
| R3 | `skill <name>` tool 在 creator 也允许加载 system scope skill（？） | system skill 漏给 creator | merged() 在 system-prompt 注入处按 profile 过滤；`skill` tool execute 也校验 |
| R4 | shadcn / Tailwind v4 init 在 monorepo 下踩坑 | 起不来 | 直接用官方 CLI（npx shadcn@latest init）；不要造轮 |
| R5 | SSE 跨 origin（web:3000 → agent:8001）CORS | 流断 | agent serve 加 CORS allow 3000；cookie SameSite=Lax |
| R6 | Next.js 15 RSC vs client component 抉择 | 错误使用 SSE | chat 必须 client component；asset list 可 RSC |
| R7 | Sisyphus plugin 在 web 端是否仍然干扰 | 看不到 managed skill | web 经由 agent serve（HTTP），不走 user-global config，应该不受影响。step 24 验证 |
| R8 | bcrypt 在 bun 下编译 native | dev 环境装不上 | 用 `@noble/hashes/bcrypt` 纯 JS 实现兜底 |
| R9 | 资产页性能：当 1000+ 行资产时 | 慢 | 加 limit/offset paging；初版默认 limit=50 |
| R10 | 资产 OSS URL 跨域加载 | 图片 / 视频显示不出 | OSS bucket 已开公开读（与 Phase 3 一致）；如果失败加 image proxy |

---

## 8. 不在本 phase

- 用户注册（admin CLI 建用户即可）
- cost 分析 / 计费看板
- 多用户管理 UI
- 监控 / observability dashboard
- TLS / 反向代理（dev-only HTTP）
- WebUI 内 skill 编辑器（点 row 跳 Langfuse 即可）
- mobile / responsive polish（desktop-first）
- e2e 自动化 test（Phase 6）

---

## 9. 自检

- ✅ 红线 1（atomic + skill 编排）：本 phase 不写硬编码视频流水线 service
- ✅ 红线 2（skill body 不在仓库）：保持 Phase 4 行为
- ✅ 红线 3（WebUI 不实现独立业务）：所有业务调用都走 agent server HTTP / SSE，**WebUI 是受限 CLI 包装**
- ✅ 红线 4（不混淆 profile）：明确 creator / developer 两个 ruleset，WebUI 强制 creator
- ✅ 红线 5（先 plan）：本文先于代码
- ✅ 红线 6（不跳 verification + /compact）：step 28-30 内含
- ✅ 红线 7（不偏离 spec）：scope 与 spec § 7 / § 9 / § 10 Phase 5 完全对齐

进入实施。
