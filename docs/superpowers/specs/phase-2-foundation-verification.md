# Phase 2 — Foundation Verification

> 对应:[Phase 2 plan](phase-2-foundation-plan.md) / [spec § 10 Phase 2](2026-04-29-assets-produce-spec.md#phase-2--foundation)
> 起始 commit:`540109d`(Phase 2 plan 落盘)/ 严格的"Phase 1 终点"是 `68437d9`
> 终点 commit:`30b8104`(verification 落盘前最后一个代码 commit)
> 执行日期:2026-04-29
> 执行人:Claude Opus 4.7 (1M) + cdotlock

---

## 1. 验收项核对(spec § 10 Phase 2 — 7 项)

| # | 验收项 | 命令 / 方法 | 实际输出 | 通过 |
|---|---|---|---|---|
| 1 | `agent run "say hi"` 用 Claude 跑通 | `bun run --cwd packages/opencode --conditions=browser src/index.ts run "say hi"` (env: `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` 走用户 cc-vibe.com 代理 / 或直连 api.anthropic.com) | `> Sisyphus - Ultraworker · claude-opus-4-6` 然后 "Hi" 输出。两种环境(代理 + 直连)都跑通 | ✅ |
| 2 | `agent run --model deepseek/...` 跑通 | `bun run ... run --model deepseek/deepseek-v4-flash "say hi"`(env DEEPSEEK_API_KEY) | **Phase 2.x 验证(2026-04-29 新凭据)**:`deepseek-v4-flash` 输出 "Hi";`deepseek-v4-pro` 输出 "4"(对 "2+2" 的 5 词回答)—— 两个 v4 模型完全跑通,走 `@ai-sdk/openai-compatible` SDK + `https://api.deepseek.com/v1/chat/completions` 路径。`deepseek-chat` / `deepseek-reasoner` 仍 404(DeepSeek 端 v3 endpoint 已停服或新凭据无权访问,与 opencode 无关)。spec § 8.1 "DeepSeek fallback" 目标达成 | ✅ |
| 3 | `agent oss put / get / list` 跑通 | 三件套 round-trip 一个文件 | `put` 返回 `https://mobai-file.oss-cn-shanghai.aliyuncs.com/phase2-smoke/<ts>.txt`(57 bytes);`list "phase2-smoke/"` 返回该 key;`get <key> /tmp/...txt` 下载 57 bytes,`diff` 与原文件一致("round-trip OK") | ✅ |
| 4 | 内部测试脚本能从 Langfuse 拉到一个测试 prompt | `bun run --cwd packages/opencode script/langfuse-smoke.ts admin__achievement__generate` | JSON 输出 `{name: "admin__achievement__generate", version: 4, label: "production", type: "text", body: "<5KB markdown>"}`. Langfuse host = `https://prompt.mobai-game.com`,project 用 legacy 凭据 | ✅ |
| 5 | `pnpm db:migrate` 跑通,6 张业务表存在(spec 字面 pnpm,实施按 § 0.4 改 bun) | `AGENT_DB_PATH=/tmp/x.db bun run ... session list` 触发 startup migration,然后 `sqlite3 /tmp/x.db ".tables" \| grep business_` | 6 张 `business_*` 表全部建出:`business_user / business_project / business_asset / business_skill / business_style_preset / business_task` | ✅ |
| 6 | `.env.example` 跟 `.env` 字段一致 | `diff <(grep -oE '^[A-Z_]+(?==)' .env.example \| sort -u) <(grep -oE '^[A-Z_]+(?==)' /tmp/test.env \| sort -u)` | 空 diff,11 个字段(AGENT_PORT / ANTHROPIC_API_KEY / DEEPSEEK_API_KEY / LANGFUSE_HOST/PUBLIC_KEY/SECRET_KEY / OSS_REGION/ACCESS_KEY_ID/ACCESS_KEY_SECRET/BUCKET/ENDPOINT)完全对得上 | ✅ |
| 7 | prompt cache 在 Claude 调用时确实命中(log 验证) | `agent run "say hi"` 跑两次同 prefix,然后 `agent stats` 看 Cache Read / Write | **代理路径(cc-vibe.com)**:Cache Write 16.4K(三次累积),Cache Read 0 — 代理有可能不透传 cache header。**直连 api.anthropic.com**(unset ANTHROPIC_BASE_URL):Cache Write 4.1K,**Cache Read 4.1K**。两次相同 prompt 触发 cache 命中。证明 `cacheControl: { type: "ephemeral" }`(opencode/src/provider/transform.ts:260)wiring 正确 | ✅ |

**全 7 项**:7 全部通过(初版 6 + 1 部分 → Phase 2.x 用新凭据补齐 DeepSeek 实跑,见 § 3.1 + § 8 Phase 2.x)。

### 1.1 acceptance #5 详细输出

```
$ AGENT_DB_PATH=/tmp/phase2-smoke.db bun run --cwd packages/opencode --conditions=browser src/index.ts session list
$ sqlite3 /tmp/phase2-smoke.db ".tables" | tr -s ' \t' '\n' | grep business_ | sort
business_asset
business_project
business_skill
business_style_preset
business_task
business_user
```

### 1.2 acceptance #7 详细输出(直连 Anthropic)

```
$ unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN
$ AGENT_DB_PATH=/tmp/phase2-direct.db bun run ... run "say hi"  # 第 1 次
> Sisyphus - Ultraworker · claude-opus-4-6
Hi
$ bun run ... run "say hi"  # 第 2 次,同 prompt,同 session 之外但 prefix 一样
> Sisyphus - Ultraworker · claude-opus-4-6
Hi
$ bun run ... stats
│Cache Read                                         4.1K │
│Cache Write                                        4.1K │
```

`Cache Read = 4.1K` 表明 ephemeral cache 5min TTL 内命中。

---

## 2. 与 plan 的对照(plan § 2 步骤拆解 16 步)

| Step | plan 描述 | 实施 |
|---|---|---|
| 1 | 写 phase-2 plan + commit + push | ✅ commit `540109d` |
| 2 | DB 路径 env 化 | ✅ commit `1fb278f` —— `AGENT_DB_PATH` 优先,fallback `<Global.Path.data>/agent.db`(原 `opencode.db` 重命名,避免撞库)。drizzle.config.ts CWD-relative fallback `./.agent/agent.db` 给 tooling 用 |
| 3 | 6 张业务表 schema | ✅ commit `01b84b5` —— 6 个 `*.sql.ts` 文件,字段如 plan § 3.1-§ 3.6 严格落地 |
| 4 | drizzle generate migration | ✅(同 commit `01b84b5`)`migration/20260429111225_phase2_business_schema/` |
| 5 | smoke migration 跑通 | ✅ AGENT_DB_PATH=/tmp/x.db 触发 startup,sqlite3 看到 6 张表 |
| 6 | ali-oss + OSS Effect Service | ✅ commit `b806e17` —— `src/oss/oss.ts` Effect.Service,4 操作(put/get/list/delete)。OSSError NamedError。env 校验失败时友好报错 |
| 7 | `agent oss <verb>` CLI | ✅(同 commit `b806e17`)`src/cli/cmd/oss.ts` —— 注册 yargs 子命令树,index.ts 加 `.command(OssCommand)`。help 输出含 "oss <command> manage Aliyun OSS objects" |
| 8 | langfuse + Langfuse Effect Service + smoke 脚本 | ✅(同 commit `b806e17`)`src/langfuse/langfuse.ts` Effect.Service,`getPrompt(name, opts?)` 接口。`script/langfuse-smoke.ts` smoke harness。`LANGFUSE_HOST` 默认 `https://prompt.mobai-game.com` |
| 9 | DeepSeek + Claude 接通 | ✅ **不需写代码** —— DeepSeek 在 models.dev catalog 中(`env: ["DEEPSEEK_API_KEY"]`、`npm: "@ai-sdk/openai-compatible"`),opencode 自动加载。Claude 走 `@ai-sdk/anthropic`(已 bundled)。see § 1 #2 + § 3.1 |
| 10 | prompt cache 验证 | ✅ **不需写代码** —— transform.ts:260 已写好 `cacheControl: { type: "ephemeral" }`。spec 验收即"实跑双跑+log 解析",已直连 Anthropic 验出 Cache Read=4.1K |
| 11 | 6 entity CRUD service 骨架 | ✅ commit `660b477` —— 每 entity 一个 `<entity>.ts`,`Effect.Service` 模式,基础 CRUD + 域特定 helper(asset.versions / asset.current / project.list 按 owner / skill.getByName / style-preset.list 按 ownerId / task.listByStatus)。`Layer.succeed`(Database.use 是 sync) |
| 12 | `.env.example` 完整化 | ✅ commit `ed0cd37` —— 11 字段,分组 + spec § 10 acceptance 引用注释 |
| 13 | 全量验收 | ✅ 本节 § 1 |
| 14 | 写 verification report | ✅ 本文 |
| 15 | 跑 superpowers:code-reviewer | (下一步) |
| 16 | push + 通知用户 /compact | (最后一步) |

---

## 3. 偏差与决策记录(plan 之外的额外判断)

### 3.1 DeepSeek 实跑历经凭据切换 → Phase 2.x 用新凭据通过

**初版触发**:Step 13 验收 #2,跑 `agent run --model deepseek/deepseek-chat "say hi"` —— 旧凭据下 deepseek-chat 实跑撞 404。verification 初版误判为 opencode 内部 Anthropic-routing 问题。

**Phase 2.x 修正(2026-04-29 用户提供新凭据)**:
- 凭据:`DEEPSEEK_API_KEY=sk-f801...`,base url `https://api.deepseek.com`(OpenAI 兼容)/ `https://api.deepseek.com/anthropic`(Anthropic 兼容)
- 用户指定 `deepseek-v4-flash` 验证

**实测结果**:
- ✅ `agent run --model deepseek/deepseek-v4-flash "say hi"` 输出 "Hi"
- ✅ `agent run --model deepseek/deepseek-v4-pro "in 5 words: what is 2+2"` 输出 "4"
- ❌ `deepseek-chat` / `deepseek-reasoner` 仍 404 —— DeepSeek 端 v3 endpoint 已停服或新凭据无权访问,**与 opencode 无关**
- 走的是 `@ai-sdk/openai-compatible` SDK + 标准 `/v1/chat/completions` 路径,不是 `/anthropic`

**根因更正**:opencode 没有"全部走 Anthropic 路径"的策略。models.dev catalog 把 DeepSeek 标记为 `npm: "@ai-sdk/openai-compatible"`,所以走 OpenAI 兼容路径。初版的 404 是凭据问题。

**决策**:
1. Phase 2 acceptance #2 → ✅ 通过(deepseek-v4-flash / v4-pro 实跑通)
2. 不在 catalog 写死禁用 chat/reasoner —— 留给用户/agent 自己选模型,LLM 调用时返回 404 已经是清晰信号
3. spec § 15 / 1.4 entry 维持(记录决策路径),状态升级为"已通过"(本 verification 1.1 修订)

**判断**:凭据 + DeepSeek 端 endpoint 变更,不动 spec § 2 / § 8 任何核心架构原则。

### 3.2 DB 默认路径从 `opencode.db` 改 `agent.db`(plan § 0.4 R10 决策落地)

**触发**:opencode 默认 DB 文件名是 `<Global.Path.data>/opencode.db`,即 `~/.local/share/opencode/opencode.db`。如果用户机器上同时安装了上游 opencode,我们会撞库。

**决策**:`getChannelPath()` 返回值改 `agent.db`(stable channel 时)/ `agent-<channel>.db`(其他)。`Flag.OPENCODE_DB` 仍读(legacy 逃生路径),新增 `AGENT_DB_PATH` 优先级最高。

**注意**:opencode 还有不少地方写死 `opencode.db`(如 src/index.ts:118 的 `marker = path.join(Global.Path.data, "opencode.db")`)—— 这导致每次启动都判定"未做 JSON migration",触发 `JsonMigration.run`。该 migration 是 idempotent 的(opencode 内部对存在 row 跳过),不会破数据,但每次启动会多 1-2 秒。**Phase 6 命名 pass 一并修**。

**判断**:操作细节,不触红线。

### 3.3 ali-oss `list({marker: undefined})` 静默返回 0 结果(执行中发现 + 修复)

**触发**:Step 13 跑 `agent oss list "phase2-smoke/"` —— 同时段 put 的 key 不在 list 结果里,但 `agent oss get` 能拿到。

**根因**:`ali-oss` SDK 对 query 对象传 `{marker: undefined}` 时会静默返回 0 个 object(应该是 SDK 内部 `if (query.marker) ...` 把 undefined 当 falsy 但拼到 URL 时 toString 成 "undefined" 字符串)。

**修复**:commit `30b8104` —— 用 spread 模式构造 query,只在 prefix/marker 有值时加 key,避免显式 `undefined`。

**判断**:upstream SDK 限制,fix 1 行。

### 3.4 OSS / Langfuse 凭据来源:暂时复用 legacy/.env

**触发**:Phase 2 验收要 OSS / Langfuse 实跑,新仓库 `.env` 还没建。

**决策**:Step 13 验证时临时 source `legacy/.env`(用户自己的凭据,本来就不入 git),把 LANGFUSE_BASE_URL alias 成 LANGFUSE_HOST(legacy 用前者命名,我们 spec 规定后者)。**不**把 `.env` 写到新仓库根目录(下个 phase 真要起 server / 跑 atomic tool 时再让用户写自己的 .env)。

**判断**:操作细节,不污染 git。

---

## 4. commit 历史(9 个 atomic commits + 1 plan + 1 verification)

```
<reviewer fix> refactor(agent/business): apply code-reviewer SHOULD FIX (S1/S2) + select NIT
f37cc72 docs(phase-2): add foundation verification report
30b8104 fix(agent/oss): drop undefined marker key from list query
ed0cd37 docs(env): add complete .env.example for Phase 2 foundation
660b477 feat(agent/business): add CRUD service skeletons for 6 entities
b806e17 feat(agent): add OSS + Langfuse Effect services + agent oss CLI
01b84b5 feat(agent/business): add 6 drizzle business tables + migration
1fb278f refactor(agent/storage): make DB path env-driven via AGENT_DB_PATH
540109d docs(phase-2): add foundation plan
68437d9 (Phase 1 终点)
```

每个 commit 独立可 revert、消息描述了 why 而非 what。

**code-reviewer 反馈处理**:2 个 SHOULD FIX(S1: Asset.create 包 transaction + 加 uniqueIndex,migration regenerate;S2: spec § 15 / 1.4 entry + § 10 Phase 2 ⚠ 标记)+ 3 NIT(N1: 5 service update() empty-patch guard;N2: style-preset.list 复合过滤;N5: index.ts:116 marker rename comment 给 Phase 6)。N3 / N4 / N6 / N7 留 Phase 6 / Phase 3。

---

## 5. 已知遗留(留给后续 phase)

- ~~**Phase 2.x**:DeepSeek routing fix~~ — **已闭环**(详 § 3.1 修订,2026-04-29 用户提供新凭据后 deepseek-v4-flash / v4-pro 实跑通)
- Phase 3:atomic tools 包装(generate-image / generate-video / concat-clips / crop-video / OSS upload tool / etc.)
- Phase 4:Skill 系统完整加载 — agent 启动时拉 enabled skill 的 metadata + Langfuse 拉 body 注入 system prompt;`skill <name>` tool 实现
- Phase 5:WebUI(Next.js + shadcn);auth (bcrypt/argon2 落地 password_hash);HTTP API endpoints
- Phase 6:命名整理 + cleanup(npm 包名 / `OPENCODE_BIN_PATH` env / `opencode.db` marker / `agent/sst.config.ts` 已删但还有 upstream 痕迹 / 多语言 README / catalog 残留)
- spec § 4 sketch 字段 vs 实际 drizzle 字段:`time_created` / `time_updated`(opencode 现有规范) vs spec 草图的 `created_at` / `updated_at`(英文)。verification 这里**用了 opencode 规范**,Phase 6 命名 pass 时统一(看是否要全表 rename)。

---

## 6. 与 spec / 红线的对照(防偏离自检)

- ✅ **不写硬编码视频流水线 service** —— 6 个 service 都是 entity-level CRUD,没有 `*-orchestration` / `*-workflow-service` / `*-coordination` 命名,没有跨 entity 编排逻辑
- ✅ **不让 skill body 散落 markdown** —— SkillTable 只存 `langfuse_prompt_key`,正文 SkillService 不取(留 Phase 4 加载时拉)
- ✅ **不在 WebUI 实现独立业务逻辑** —— Phase 2 不动 `web/`
- ✅ **不混淆 creator / developer profile** —— Phase 2 不动 permission(留 Phase 5)
- ✅ **在没写 phase plan 前不直接动代码** —— commit `540109d` plan 落盘后才 Step 2 起执行
- ✅ **phase 之间不跳过 /compact / verification** —— Step 14-16 覆盖
- ✅ **Effect TS 风格遵循 opencode 规范** —— `Context.Service<Self, Interface>("@<ns>/<Name>")` + `Layer.succeed/effect` + `defaultLayer` export

---

## 7. 进入下一 phase 前的 checklist

- [x] 跑通 7/7 验收项(初版 6 完整 + 1 部分;Phase 2.x 用新凭据补齐 DeepSeek 实跑 → ✅,详 § 3.1 修订)
- [x] 写 verification report(本文)
- [x] 跑 `superpowers:code-reviewer`(返 2 个 SHOULD FIX:S1 Asset.create 非事务化 + 缺 UNIQUE,S2 spec § 15 / 1.4 缺;以及 7 NIT,处理了 N1/N2/N5。详 § 4 末段)
- [x] commit + push 到 main(11 commits 推到 `origin/main`)
- [ ] 通知用户 `/compact`

下一阶段:**Phase 3 — Atomic Tools**(generate-image / generate-video / concat / crop / OSS upload / etc. 6 个 atomic tools)。Phase 2.x 已闭环。
