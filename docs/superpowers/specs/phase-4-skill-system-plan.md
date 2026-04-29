# Phase 4 — Skill System Plan

> **Spec ref**: [§ 5 Skill 设计 + § 10 Phase 4](2026-04-29-assets-produce-spec.md#phase-4--skill-system)
> **Date**: 2026-04-29
> **Author**: Claude Opus 4.7 (1M)

---

## 0. 决策表（先决，不待 verification）

| # | 议题 | 决策 | 理由 |
|---|---|---|---|
| 0.1 | 现存 fs skill loader 处理 | **保留**。upstream opencode 的 `Skill.Service`（fs-scan `SKILL.md`）继续运转，提供 opencode 内建 skill；新增"managed skill" 源（DB + Langfuse）合并进同一 `Info` 流 | 不破坏 upstream，复用 system-prompt 注入路径（`skill.available()`） |
| 0.2 | "merged" 实现方式 | 新写 `business/skill/managed.ts`：从 `business_skill` 表读 metadata，懒加载 Langfuse body；用 Layer 包装现有 `Skill.Service`，`all()` / `available()` 合并 fs + managed | 单一 entry point，下游（system prompt、tool）零改动 |
| 0.3 | 同名冲突处理 | managed 优先于 fs：DB 里 enabled=true 的 skill 与 fs 同名时，managed 覆盖 fs。warn 不 throw | 业务管理优先；不破坏 fs 兜底 |
| 0.4 | Langfuse body fetch cache | **不做缓存**。每次 `skill <name>` tool 调用都从 Langfuse 拉。spec § 10 验收 #2 明确"cache 不挡" | 编辑 → 立刻生效。Langfuse 自带 server-side cache，client 端不再叠加 |
| 0.5 | Langfuse client 扩展 | 加 `createPrompt(name, body, label?)` 和 `updatePrompt(name, body, label?)` —— Langfuse SDK 用 `client.createPrompt({ name, prompt, type: "text", labels })` | spec § 5.3 三入口需要把 file/url 内容推到 Langfuse |
| 0.6 | scope 默认值 | CLI `add` 默认 `--scope system`；带 `--scope creator` 才显示在 WebUI | spec § 5.3 / § 11.4 |
| 0.7 | enabled 默认值 | `add` 默认 enabled=true | 加完即用，`disable` 后再关 |
| 0.8 | 三入口实现 | `--content-file <path>` 读文件 → push Langfuse + 创 DB row；`--content-url <url>` GET → push Langfuse + 创 DB row；`--langfuse-prompt-key <key>` 不 push，仅链接到已存在 prompt | spec § 5.3 |
| 0.9 | `agent skills update --content-*` 行为 | 新版本 push 到 Langfuse（递增 version），DB 不动（version 由 Langfuse 管理；DB 的 `langfuse_label` 锁定哪个 label） | Langfuse-native 版本管理 |
| 0.10 | HTTP API location | 新建 `agent/packages/opencode/src/server/routes/instance/skill.ts`，遵循现有 HttpApi 模式（HttpApiBuilder + Schema-driven），挂到 `/api/skills` | 复用 auth、middleware、Effect runtime |
| 0.11 | HTTP API 鉴权 | 走现有 `authorizationLayer`（Bearer token，与其他 instance API 一致） | 不重复造轮 |
| 0.12 | `agent skills export-schema` 输出 | 与 `agent tools export-schema` 一致：`{ name, description, input_schema }`，每个 enabled skill 一个 entry，input_schema 为空对象（`{}`）—— skill 无输入参数（参数都在 prompt body 里） | 外部 LLM 直接装载 |
| 0.13 | 示范 skill | 名字 `novel-to-video`，描述 "Pipeline: 小说片段 → 拆 scene → 角色立绘 → 分镜插画 → 视频片段 → 拼接"。body 走 Langfuse `skill_novel-to-video`。本 phase 不写 markdown 文件（spec 红线 2），从 inline string 推到 Langfuse 即可 | spec § 10 验收 #4 |
| 0.14 | E2E "novel → video" 实测 | 用示范 skill + 5 atomic tool 让 LLM 跑通：输入小说一段 → 角色 portrait（generate-image-nanobanana）→ 1-2 个 scene shot（generate-image-nanobanana 或 -gpt）→ 转视频片段（generate-video-seedance）。**不需要 concat-clips/crop-video**（FC 未部署） | spec § 10 验收 #4 |
| 0.15 | error → assistant message | skill tool 失败（Langfuse fetch 4xx/5xx、name 不存在等）走 `Effect.catch` 兜回 graceful output；不 die | 与 Phase 3 atomic tool 同款 |
| 0.16 | scope=creator 过滤 | `agent skills list --scope creator` 只显示 creator；不传 `--scope` 显示全部（system + creator）。WebUI（Phase 5）始终强制 `scope=creator` | spec § 11.4 |
| 0.17 | name 命名 | snake_case + 必须匹配 `^[a-z][a-z0-9_-]{0,63}$`；Langfuse prompt key 自动加前缀 `skill_<name>` | spec § 5.2 / § 11.4 |
| 0.18 | description 长度 | 1..500 字符 | system prompt 内放 N 个 skill description，需要紧凑 |
| 0.19 | attachments 字段 | 本 phase 不实现 attachments 入口；DB 字段已存（Phase 2），允许通过 HTTP API JSON 直传 OSS URL 列表 | 留 Phase 5 创作者用 |
| 0.20 | dryRun for skills CLI | `agent skills add --dry-run` 打印 resolved Langfuse push body + DB insert，不实际写 | spec § 6.2 全局 dry-run；Phase 4 实现 add/update 两个写操作的 dry-run |

---

## 1. 文件清单

### 1.1 新建

| 路径 | 职责 |
|---|---|
| `agent/packages/opencode/src/business/skill/managed.ts` | DB+Langfuse merged skill source，导出 `Managed.Service` 接口 `getInfo / list / loadBody` |
| `agent/packages/opencode/src/business/skill/cli.ts` | （内部 helper）封装 add/update/delete/list/enable/disable 业务逻辑（CLI + HTTP 共用） |
| `agent/packages/opencode/src/cli/cmd/skills.ts` | `agent skills` yargs subcommand group（add/update/delete/list/enable/disable/export-schema/show） |
| `agent/packages/opencode/src/server/routes/instance/skill.ts` | HttpApi `/api/skills` endpoints（POST/GET/GET-by-name/PATCH/DELETE） |
| `agent/packages/opencode/src/business/skill/seed.ts` | 一次性 seeder：把示范 skill `novel-to-video` body 推 Langfuse + 建 DB row |

### 1.2 修改

| 路径 | 修改 |
|---|---|
| `agent/packages/opencode/src/langfuse/langfuse.ts` | 加 `createPrompt(name, body, opts)` / `updatePrompt(name, body, opts)`；`getPrompt` 已有不动 |
| `agent/packages/opencode/src/skill/index.ts` | layer 内额外 yield `Managed.Service`，把 managed 列表合入 `state.skills`；冲突时 managed 覆盖 fs，记 warn |
| `agent/packages/opencode/src/tool/skill.ts` | execute 时若是 managed skill，懒拉 Langfuse body 替换 `info.content`；location 改为合成 `langfuse://prompt/skill_<name>` |
| `agent/packages/opencode/src/server/routes/instance/httpapi/server.ts` | import 新 `SkillApi` + `skillHandlers`，加进 router 表 |
| `agent/packages/opencode/src/index.ts` | 注册 `SkillsCommand`（CLI 入口） |
| `docs/superpowers/specs/2026-04-29-assets-produce-spec.md` § 15 | 加修订记录（如有偏离） |

### 1.3 不动

- `business/skill/skill.sql.ts`（schema 已建）
- `business/skill/skill.ts`（CRUD service 已建，本 phase 不改）
- `tool/skill.txt`（tool 描述不变）

---

## 2. 步骤拆解（22 步）

每步 5-15 min，每步独立 commit。

| Step | 内容 | 预计输出 / 测试 |
|---|---|---|
| 1 | 写本 plan + commit + push | 本文 + commit |
| 2 | langfuse.ts 加 `createPrompt` / `updatePrompt` | 单元：dryRun 模式 dump body 即可；live：跑一次小 push |
| 3 | `business/skill/managed.ts`：定义 Service 接口 + Layer，组合 `Skill.Service`（business CRUD）+ `Langfuse.Service`，提供 `list()` / `getInfo(name)` / `loadBody(name)` | bun build 通过；list 返回 DB 里所有 row（带 description） |
| 4 | `skill/index.ts` 合并 managed：`state.skills` 加 managed 项，managed 覆盖 fs；info.location 用 `langfuse://prompt/skill_<name>` | `agent skills list` 看到示范 skill |
| 5 | `tool/skill.ts` 改：识别 managed location，懒拉 Langfuse body 替换 info.content | `agent run "use skill novel-to-video"` 在 LLM 端拿到完整正文 |
| 6 | `business/skill/cli.ts` helper：`addFromFile / addFromUrl / addFromLangfuseKey / update / delete / enable / disable / list` | bun build 通过 |
| 7 | `cli/cmd/skills.ts`：yargs subcmd —— add（三入口 mutual-exclusive）、update（同三入口）、delete、list（--scope, --enabled-only）、enable、disable、show、export-schema | `agent skills --help` 列出全部 verb |
| 8 | `agent skills add --dry-run` 实现：打印 resolved body | dryRun 不写 DB / 不调 Langfuse |
| 9 | 注册 `SkillsCommand` 到 index.ts | `agent skills list` 跑通 |
| 10 | `business/skill/seed.ts`：写示范 skill `novel-to-video` body（约 600 字 markdown），调 langfuse.createPrompt + skill.create | 跑一次 `bun run scripts/seed-skill.ts` 或 `agent skills add --langfuse-prompt-key skill_novel-to-video`（先 push body，再链 metadata） |
| 11 | seed 后 `agent skills list` 看到 | grep 输出 |
| 12 | `agent skills show novel-to-video` 输出 metadata + Langfuse 拉的 body 摘要 | LLM 提示 |
| 13 | system prompt 注入验证：`agent run "list available skills"` 看 LLM response | 看到 novel-to-video 在 list |
| 14 | E2E：`agent run "novel-to-video skill 用：'夜色，少女走过石板街'"`，观察 LLM 调 `skill novel-to-video` → 然后调 `generate-image-nanobanana` 生角色 → 再调 `generate-video-seedance`。验收 #4 | 完整 OSS URL 链 |
| 15 | `agent skills export-schema` 输出 JSON 列表 | jq parse 通过 |
| 16 | HTTP API 路由：实现 SkillApi（HttpApiBuilder schema）+ skillHandlers | bun build 通过 |
| 17 | `agent serve` 启动后 curl POST /api/skills | 返 201 + JSON row |
| 18 | curl GET /api/skills?scope=creator | 返列表 |
| 19 | curl PATCH /api/skills/:name | 改 enabled/scope |
| 20 | curl DELETE /api/skills/:name | 204 |
| 21 | scope filter 验收：`scope=system` 不出现在 `--scope creator` 输出 | 验收 #5 |
| 22 | 写 verification report + commit + push + code-review + /compact | docs/superpowers/specs/phase-4-skill-system-verification.md |

---

## 3. CLI 设计

### 3.1 `agent skills add`

```
agent skills add \
  --name <name> \
  --description "<text>" \
  (--content-file <path> | --content-url <url> | --langfuse-prompt-key <key>) \
  [--label <label>] \
  [--scope system|creator] \
  [--enabled true|false] \
  [--dry-run]
```

- 三个 content 入口 mutually exclusive；mutually exclusive 校验在 yargs `conflicts`
- `--content-file` / `--content-url`：读取 → push Langfuse `skill_<name>` → 创 DB row
- `--langfuse-prompt-key`：仅创 DB row，链接到已存在 prompt（不 push）
- `--label`：默认 `production`；DB 里存这个 label
- `--scope`：默认 `system`；CLI 创建默认隐藏 WebUI

### 3.2 `agent skills update`

```
agent skills update --name <name> \
  [--description "<text>"] \
  [--content-file <path> | --content-url <url>] \
  [--label <label>] \
  [--scope system|creator] \
  [--dry-run]
```

- `--content-*` 推新 body（Langfuse 自动 +1 version）
- 不带 `--content-*` 时只改 metadata

### 3.3 `agent skills delete --name <name>`

只删 DB row。Langfuse prompt 保留（防误删）—— 可选 `--purge-langfuse` 同时删 prompt（**Phase 4 不实现**，留 Phase 6）。

### 3.4 `agent skills list`

```
agent skills list [--scope system|creator] [--enabled-only] [--output text|json]
```

- 默认 text：`<name>\t<scope>\t<enabled>\t<description-truncated>`
- `--output json`：完整 row 列表

### 3.5 `agent skills enable / disable --name <name>`

仅切 enabled 字段。

### 3.6 `agent skills show <name>`

输出 metadata + Langfuse 拉的 body（如能拉到）。`--output json` 输出 `{ metadata, body }`。

### 3.7 `agent skills export-schema [<name>]`

输出 Anthropic-compatible JSON：

```json
[
  {
    "name": "skill",
    "description": "Load a skill <name> from registry...",
    "input_schema": {
      "type": "object",
      "properties": { "name": { "type": "string" } },
      "required": ["name"]
    }
  },
  {
    "name": "skill:novel-to-video",
    "description": "<DB description>",
    "input_schema": { "type": "object", "properties": {} }
  }
]
```

第一个 entry 是通用 `skill` tool；后续每个 enabled skill 一个 entry（命名 `skill:<name>`）便于外部 LLM 决策。

---

## 4. HTTP API（`/api/skills`）

| Method | Path | 入参 | 返 |
|---|---|---|---|
| GET | `/api/skills` | query: `scope?`, `enabledOnly?` | `{ skills: SkillInfo[] }` |
| GET | `/api/skills/:name` | — | `SkillInfo` |
| POST | `/api/skills` | body: `{ name, description, langfusePromptKey?, contentBody?, contentUrl?, scope?, label?, enabled? }` | `SkillInfo` (201) |
| PATCH | `/api/skills/:name` | body: 部分字段 | `SkillInfo` |
| DELETE | `/api/skills/:name` | — | 204 |

`SkillInfo`:
```ts
{
  id: string
  name: string
  description: string
  langfuse_prompt_key: string
  langfuse_label: string
  scope: "system" | "creator"
  enabled: boolean
  attachments: string[] | null
  created_at: string
  updated_at: string
}
```

POST body 里 `contentBody` / `contentUrl` 与 `langfusePromptKey` 三选一（与 CLI 三入口一致）。

---

## 5. 示范 skill `novel-to-video` 内容大纲

存到 Langfuse `skill_novel-to-video`（type=text，label=production）。

```markdown
# Novel → Video Pipeline Skill

You are now in **novel-to-video** mode. Goal: turn a short novel passage into one video clip.

## Workflow

1. Read the input passage. Identify: 1 protagonist + 1 setting + 1 mood.
2. Build a portrait of the protagonist:
   - Use `generate-image-nanobanana` with a prompt like:
     "Full-body portrait, [character description], [setting], cinematic lighting,
     anime/realistic style depending on mood."
3. Build a key scene shot:
   - Use `generate-image-nanobanana` (descriptive scene) or `generate-image-gpt` (stylised art).
   - Anchor to the portrait via `referenceImageUrls: [<portrait OSS URL>]`.
4. Animate the scene shot:
   - Use `generate-video-seedance` with `sourceImageUrl: <scene OSS URL>` and a motion prompt.
5. Return: the video OSS URL + (optionally) the portrait + scene URLs.

## Constraints

- Keep prompts < 200 chars; emphasise composition + mood.
- If `generate-image-nanobanana` fails, retry once with simplified prompt; then fall through to `generate-image-gpt`.
- Never call `concat-clips` / `crop-video` unless explicitly asked — they are FFmpeg-only ops.
- Always quote the final video URL in your reply, separated from prose.

## Output template

> Portrait: <url>
> Scene: <url>
> Video: <url>
> Summary: <one sentence>
```

---

## 6. 验收项核对（spec § 10 Phase 4 — 5 项）

| # | 验收项 | 验证方法 |
|---|---|---|
| 1 | CLI 三入口（add/update/delete/list/enable/disable）跑通；`scope=system` 默认隐藏，`scope=creator` 显示 | 7 个 verb 各跑一次；list `--scope creator` 不含 system |
| 2 | Langfuse 改 skill 内容，下次 agent 调用立即生效（cache 不挡） | Langfuse Web UI 改 `skill_novel-to-video` body → 立刻 `agent run "use novel-to-video"`，看到新 body 摘要 |
| 3 | export-schema 输出能直接装载工具描述 | jq parse + 形状校验 |
| 4 | 示范 skill 让 agent 完成端到端 novel → video | E2E 跑通，输出 OSS video URL |
| 5 | `scope=system` 创建的 skill 在 `agent skills list --scope creator` 中不出现 | 同 #1 |

---

## 7. 风险登记

| ID | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | Langfuse SDK `createPrompt` 在某些版本签名变化 | push 失败 | 看 langfuse-js npm 当前版本 API；写 thin wrapper，错误转 LangfuseError |
| R2 | fs skill 与 managed skill 同名时 system prompt 混乱 | LLM 选错 | `add` 操作前查 fs 里是否同名（warn but not block）；merge 时 managed 优先并 log warn |
| R3 | scope=creator 在 system prompt 里也注入（CLI 模式不该看到 creator-only？） | 信息泄漏（轻） | spec 没说 system prompt 要按 scope 过滤 —— developer profile 看全部，creator profile 才过滤。Phase 4 只在 list / WebUI 过滤，system prompt 全注入 |
| R4 | `--content-url` 拉 HTTP 内容 → SSRF | 内网穿透 | 强制 `https://`；规范 URL；超时 10s；最大 1MB（与 Phase 3 SF-3 一致） |
| R5 | Langfuse prompt 不存在 → tool 失败 | session 中断 | tool execute 用 `Effect.catch` 兜底，returns graceful error output |
| R6 | DB 同名 unique 冲突 | add 报错 | catch UniqueConstraint，转友好 SkillError op="duplicate" |
| R7 | HTTP API 没鉴权时被外网调 | 凭据泄漏 | 走现有 `authorizationLayer`；Phase 4 不放公网 |
| R8 | Anthropic SDK 拒绝 tool name 含 `:`（`skill:<name>`） | export-schema 输出不能直接加载 | 改成 underscore：`skill__<name>` 或干脆只输出顶层 `skill` tool。**决策**：仅输出顶层 `skill` tool 一个 entry + per-skill 信息塞进 description；不造 `skill:<name>` 假 tool。修订 § 0.12 |
| R9 | seeder 重复跑 → DB 重复行 | unique violation | seeder 检查 getByName 已存在则 update 而非 create |
| R10 | LLM 不会自动调 `skill` tool | 验收 #4 跑不通 | system prompt 已 verbose 注入；如仍不调，加一行 "When task matches a skill description, you MUST call `skill <name>` first" |

---

## 8. 修订（§ 0.12 / R8 → 决策更新）

`agent skills export-schema` **不输出** `skill:<name>` 假 tool。仅输出：

```json
[
  {
    "name": "skill",
    "description": "<现有 skill.txt 描述>\n\nAvailable skills:\n- <name>: <description>\n- ...",
    "input_schema": {
      "type": "object",
      "properties": { "name": { "type": "string" } },
      "required": ["name"]
    }
  }
]
```

description 里嵌入所有 enabled skill 的 name + description，外部 LLM 看 description 就知道有哪些 skill 可调。

---

## 9. 不在本 phase

- WebUI（Phase 5）
- agent 自动管理 skill / self-modify（spec 红线）
- attachments 上传（仅字段保留）
- skill A/B / 多 label 路由（Langfuse 已支持，CLI 留 Phase 6 polish）
- skill 删除时清 Langfuse prompt（Phase 6）
- skill 版本回滚 CLI（Phase 6）

---

## 10. 自检

- ✅ 红线 1（原子能力 + skill 编排）：本 phase 实现 skill 系统，让 LLM 编排 atomic tool；无任何 `*-orchestration` / `*-coordination` / `*-workflow-service`
- ✅ 红线 2（skill body 不在仓库）：示范 skill `novel-to-video` 内容只在 Langfuse；本 plan 仅作大纲示意，不写 .md 文件落仓库
- ✅ 红线 3（WebUI 不实现独立业务）：本 phase 不动 web/
- ✅ 红线 4（permission profile）：本 phase 暂不分 profile（system prompt 注入对 developer/creator 一致；过滤在 list / WebUI 层做）
- ✅ 红线 5（没写 plan 不动代码）：本文先于代码
- ✅ 红线 6（不跳 verification + /compact）：步骤 22 含 verification + code-review；本 phase 完成后 /compact
- ✅ 红线 7（不偏离 spec）：§ 0.12 / R8 修订 + § 8 已记，进 spec § 15 修订前先按本 plan 执行

进入实施。
