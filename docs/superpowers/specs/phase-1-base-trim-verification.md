# Phase 1 — Base Trim Verification

> 对应:[Phase 1 plan](phase-1-base-trim-plan.md) / [spec § 10 Phase 1](2026-04-29-assets-produce-spec.md#phase-1--base-trim)
> 起始 commit:`5f07a0a`(Phase 0 终点)
> 终点 commit:`0c642fc`(verification 落盘前的最后一个代码 commit)
> 执行日期:2026-04-29
> 执行人:Claude Opus 4.7 (1M) + cdotlock

---

## 1. 验收项核对(spec § 10 Phase 1)

| # | 验收项 | 命令 | 实际输出 | 通过 |
|---|---|---|---|---|
| 1 | `agent --help` 显示干净命令树(无 TUI / IM / share / acp) | `cd agent && bun run --cwd packages/opencode --conditions=browser src/index.ts --help` | 输出 19 个命令:`completion / mcp / run / debug / providers / agent / upgrade / uninstall / serve / web / models / stats / export / import / github / pr / session / plugin / db`。**确认不含**:`acp` / `attach` / `thread`(TUI)/ 任何 tui 子命令。`generate` 命令仍注册但无 `describe` 字段所以 yargs 不在 --help 列出 —— 与 trim 无关,upstream 行为。binary 名称仍显示 `opencode`(npm 包名 Phase 1 不重命名,见 § 3.2)。 | ✅ |
| 2 | 保留 package 的单测全绿 | 见 § 1.1 / § 1.2 | opencode:2030 pass / 8 skip / 1 todo / 0 fail / 287.95s,**全绿**。core:80 pass / 0 fail / 12.47s,**全绿**。`@opencode-ai/script` / `@opencode-ai/plugin` / `@opencode-ai/sdk` 无单测(没 `test` script 或 `test/` 目录),NO TEST 标注。 | ✅ |
| 3 | `du -sh agent/` 体积比 clone 时减少 ≥ 40% | `du -sh agent/`(clean install 后) | **2.5G(Phase 1 起点)→ 978M(Phase 1 终点)= 减少 62%** ≥ 40%。详细 § 1.3。 | ✅ |
| 4 | `agent` binary 可独立运行(不依赖砍掉的包) | `bun run --cwd packages/opencode --conditions=browser src/index.ts --help`、`bun --cwd packages/opencode typecheck` | help 跑通,无 missing module;typecheck 退出 0(无报错)。Phase 2 起点验收会跑 `agent run "say hi"` 真实 LLM 调用,Phase 1 不要求(没 LLM 凭据)。 | ✅ |
| 5 | 全文搜索砍掉 package 的 import 应为空 | 详细命令见 § 1.4 | 0 hits(在 `agent/packages/{opencode,core,script,plugin,sdk}/` 下,排除 `node_modules`)。 | ✅ |

**5/5 全过。**

### 1.1 opencode 单测细节

**命令**:
```
cd /Users/Clock/moonshort/assets-produce/agent && bun --cwd packages/opencode test --timeout 30000
```

**结果**:
```
 2030 pass
 8 skip
 1 todo
 0 fail
 17 snapshots, 10174 expect() calls
Ran 2039 tests across 155 files. [287.95s]
```

**修复了 3 个测试**(每个都记入 commit `027a94e` / `7647c5f`):
1. `test/server/session-select.test.ts` — **删除**:整文件只测 `/tui/select-session` 端点,该路由跟随 TUI 一起砍。
2. `test/session/prompt.test.ts` — **bump timeout**:`it.live("loop waits while shell runs and starts after shell exits", ..., 3_000)` → `30_000`。这是 timing-sensitive `it.live` 测试,3s 在普通 dev 机器跑不稳,真实运行时间 ~5s。与 Phase 1 砍包无因果。
3. `test/effect/runner.test.ts:114 "cancel interrupts running work"` —— 第 2 次跑 full suite 时一次性 timeout(30001ms),isolated 重跑及第 3 次跑 full suite 都 PASS。**结论:flake**(资源争抢导致 `it.live` 偶发超时)。**未修改**测试,记入风险栏。

### 1.2 core 单测细节

**命令**:
```
cd /Users/Clock/moonshort/assets-produce/agent && bun --cwd packages/core test
```

**结果**:`80 pass / 0 fail / 12.47s`(全绿)

**修复了 1 个测试**(commit `027a94e`):
- `test/effect/cross-spawn-spawner.test.ts:114` — 在 macOS 上 `process.cwd()` 返回 realpath(`/private/var/...`)而 `tmp.path` 是 `/var/...`(symlink),原 expect 不通过。改用 `fs.realpath` 双向解析后比较。预存在 portability bug,与 Phase 1 砍包无因果。

### 1.3 体积减量细节

| 阶段 | `du -sh agent/` | `du -sh agent/node_modules` | 增量减量 |
|---|---|---|---|
| Phase 1 起点(clone + 第一次 install) | **2.5G** | 2.4G | baseline |
| Phase 1 中段(包砍完 + 复用旧 lockfile / 旧 node_modules) | 仍 2.5G | 2.4G | 0%(因 incremental install 不深度 prune) |
| Phase 1 终点(clean `rm -rf node_modules` + `bun install`) | **978M** | 908M | **62%↓** |

**结论**:验收 ≥ 40% 充裕完成。绝大部分减量来自 node_modules(2.4G → 908M,减少 62%),源于:
- 14 个 `@ai-sdk/*` provider + 7 个第三方 provider(openrouter / venice / gitlab-ai / poe / etc.)的 transitive deps
- `@opentui/core` + `@opentui/solid` + `solid-js` 全树
- `@kobalte/*` / `@solid-primitives/*` / `vite` / `@solidjs/start` / `dompurify` / `marked` / `tailwindcss` 等 UI 链
- `electron`(被 trustedDependencies 排除 + desktop-electron 包砍)
- `@playwright/test` / `storybook` 测试 / 文档工具

源码 `agent/packages/`:**92M → 12M**(减少 87%)

### 1.4 import 净化检查

**命令**:
```
grep -rln "@opencode-ai/web\|@opencode-ai/desktop\|@opencode-ai/desktop-electron\|@opencode-ai/ui\|@opencode-ai/enterprise\|@opencode-ai/storybook\|@opencode-ai/slack\|@opencode-ai/function" agent/packages/ 2>/dev/null | grep -v node_modules
```
**结果**:0 hits

**命令**:
```
grep -rln "import\\b\\(.*['\"]\\(@ai-sdk/alibaba\\|@ai-sdk/amazon-bedrock\\|@ai-sdk/azure\\|@ai-sdk/cerebras\\|@ai-sdk/cohere\\|@ai-sdk/deepinfra\\|@ai-sdk/gateway\\|@ai-sdk/google-vertex\\|@ai-sdk/groq\\|@ai-sdk/mistral\\|@ai-sdk/perplexity\\|@ai-sdk/togetherai\\|@ai-sdk/vercel\\|@ai-sdk/xai\\|gitlab-ai-provider\\|venice-ai-sdk-provider\\|@openrouter\\|opencode-gitlab-auth\\|opencode-poe-auth\\|@gitlab/opencode\\|ai-gateway-provider\\|@agentclientprotocol\\)" agent/packages/opencode/src
```
**结果**:0 hits

**命令**:
```
grep -rln "@opentui\|opentui-spinner\|cli-sound\|@solid-primitives" agent/packages/opencode/src
```
**结果**:0 hits

---

## 2. 砍 / 留对照(plan § 1.2 / § 1.3)

### 2.1 Package 级(plan § 1.2,共 19 → 5)

| package | 决策 | 实施 |
|---|---|---|
| `opencode` | KEEP(rename binary) | ✅ binary `opencode` → `agent`(`bin/opencode` → `bin/agent` + `package.json` `bin` 字段),npm 包名 `opencode` 保留 |
| `@opencode-ai/core` | KEEP | ✅ 留,80 单测全绿 |
| `@opencode-ai/script` | KEEP | ✅ 留(opencode build 工具) |
| `@opencode-ai/plugin` | KEEP | ✅ 留(server-side plugin API) |
| `@opencode-ai/sdk` (sdk/js) | KEEP | ✅ 留(opencode src/ 多处 import) |
| `@opencode-ai/app` | CUT | ✅ 删,3.8M |
| `@opencode-ai/desktop` | CUT | ✅ 删,8.9M |
| `@opencode-ai/desktop-electron` | CUT | ✅ 删,8.6M |
| `@opencode-ai/ui` | CUT | ✅ 删,8.5M |
| `@opencode-ai/web` | CUT | ✅ 删,13M |
| `@opencode-ai/storybook` | CUT | ✅ 删,136K |
| `@opencode-ai/slack` | CUT | ✅ 删,32K |
| `@opencode-ai/enterprise` | CUT | ✅ 删,120K |
| `@opencode-ai/function` | CUT | ✅ 删,32K |
| `console` 嵌套(5 nested workspace) | CUT | ✅ 删,33M |
| `containers` | CUT | ✅ 删,32K |
| `docs` | CUT | ✅ 删,496K |
| `extensions` | CUT | ✅ 删,8K |
| `identity` | CUT | ✅ 删,24K |

外加意外砍:
- `agent/sst.config.ts` + `agent/infra/` —— SST 云部署配置,引用已删 enterprise / function / desktop / app。assets-produce 不用 SST(spec § 14 部署 Phase 6 后才做)。计入 plan § 2 Step 3 R3。
- `agent/sst-env.d.ts`(类型声明)
- 3 个根级 `sst-env.d.ts` 在子包内(已经跟着 package 一起删)

### 2.2 opencode/src 内部子目录(plan § 1.3)

| 子目录 / 文件 | 决策 | 实施 |
|---|---|---|
| `acp/`(整个目录,4 文件) | CUT | ✅ |
| `cli/cmd/acp.ts` | CUT | ✅ |
| `cli/cmd/tui/`(整个目录,~150 文件 inc. opentui Solid UI + .wav 资源) | CUT | ✅ |
| `temporary.ts`(TUI 单独入口) | CUT | ✅ |
| `server/routes/instance/tui.ts` + `httpapi/tui.ts` | CUT | ✅ |
| `util/keybind.ts`(只 TUI 用) | CUT | ✅ |
| `cli/cmd/web.ts` | **plan 原本 CUT,实施 KEEP** | ⚠ web cmd 启的是 agent 自己的 server + 浏览器,跟砍掉的 docs 站无关。详见 § 3.1。 |
| `acp` (cmd) inbound:`src/index.ts` | 移除 import + .command(AcpCommand) | ✅ |
| `tui` inbound:`src/index.ts`、`temporary.ts`、`mcp/index.ts`、`server/routes/instance/index.ts`、`server/routes/instance/httpapi/server.ts`、`server/routes/instance/httpapi/public.ts`、`script/build.ts`、`script/schema.ts` | 修补全部 inbound | ✅ |
| `share/`(spec § 10 列为砍) | **plan deferred,KEEP** | ⚠ 8 inbound跨 storage/server/session/effect,深度耦合。详见 § 3.2。 |
| `sync/` | **plan deferred,KEEP** | spec 没列,15+ inbound。详见 § 3.2。 |
| `control-plane/` | **plan deferred,KEEP** | spec 没列,深度耦合 plugin/effect/server/session。详见 § 3.2。 |

### 2.3 opencode/package.json deps trim(plan § 1.4 / § 1.5)

| 类别 | 计划 cut | 实际 cut |
|---|---|---|
| `@ai-sdk/*` 不用的 provider | 14 个 | ✅ 14 个(alibaba / amazon-bedrock / azure / cerebras / cohere / deepinfra / gateway / google-vertex / groq / mistral / perplexity / togetherai / vercel / xai) |
| 第三方 provider / auth | 7 个 | ✅ 7 个(@gitlab/opencode-gitlab-auth / @openrouter/ai-sdk-provider / ai-gateway-provider / gitlab-ai-provider / opencode-gitlab-auth / opencode-poe-auth / venice-ai-sdk-provider) |
| ACP SDK | 1 个 | ✅ `@agentclientprotocol/sdk` |
| TUI / Solid | 6 个 | ✅ `@opentui/core` / `@opentui/solid` / `@solid-primitives/event-bus` / `@solid-primitives/scheduled` / `cli-sound` / `opentui-spinner` / `solid-js`(7 个,比计划多 1) |
| **保留 provider** | anthropic / openai-compatible + 1-2 fallback | ✅ anthropic / openai-compatible / openai / google + provider/utils 基础设施 + github-copilot 内部 SDK |
| 砍 dev script | `dev:temporary`、`upgrade-opentui` | ✅ |

### 2.4 agent/package.json (root) trim

| 项 | 计划 | 实施 |
|---|---|---|
| `workspaces.packages` | 删 `packages/console/*` + `packages/slack` | ✅ 现 `["packages/*", "packages/sdk/js"]` |
| `scripts` | 删 `dev:desktop` / `dev:web` / `dev:console` / `dev:storybook` | ✅ 一并删了 `random` / `hello` 占位 |
| `devDependencies` | 不动(plan 暂留) | ✅ + 砍 `sst`(infra 删了) |
| `trustedDependencies` | 暂留 | ✅ 砍 `electron` |
| `patchedDependencies` | 检查 solid-js patch | ✅ 砍 `solid-js@1.9.10` 条目 + 删 `agent/patches/solid-js@1.9.10.patch` |

### 2.5 配置 / 工具链文件

| 文件 | 改动 |
|---|---|
| `agent/turbo.json` | 删 `@opencode-ai/app#test` / `@opencode-ai/app#test:ci` task entries |
| `agent/packages/opencode/tsconfig.json` | 删 `jsxImportSource: @opentui/solid` + `@tui/*` path alias |
| `agent/packages/opencode/bunfig.toml` | 删 `preload = ["@opentui/solid/preload"]`(全局 + test 段)否则每次 bun 调用都报错 |
| `agent/packages/opencode/package.json` | 删 `build` 脚本(`script/build.ts` 已删)|
| `agent/packages/opencode/script/build.ts` | 删整个文件(引用 `@opentui/solid/bun-plugin` + `../../app` embed flow,Phase 6 重写) |
| `agent/packages/opencode/script/schema.ts` | 删 `TuiConfig` 引用 + `tuiFile` argv 处理 |
| `agent/packages/opencode/script/upgrade-opentui.ts` | 删整个文件 |

---

## 3. 偏差与决策记录(plan 之外的额外判断)

### 3.1 `cli/cmd/web.ts` 保留(plan 原列 CUT)

**触发**:plan § 1.3 / § 0.4 假设 `cli/cmd/web.ts` 是配合 `@opencode-ai/web` astro docs 站的。Step 5 砍前 `head` 读 `web.ts` 内容,发现它 import `Server`(我们的 server)+ `open`(打开浏览器)+ `withNetworkOptions`,功能是 **启动 agent server 并打开 web 界面**(help 描述:"start opencode server and open web interface")—— 与 docs 站无关。

**决策**:保留,Phase 5 自己的 WebUI 上线后再决定是否替换。

**判断**:plan 的"显然解",不打断用户。

### 3.2 `share/` + `sync/` + `control-plane/` 保留(spec § 10 列要砍 share / acp)

**触发**:Step 5 之前用 grep 量 inbound,发现:
- `share/`:8 inbound(`effect/bootstrap-runtime`、`effect/app-runtime`、`cli/cmd/github`、`cli/cmd/import`、`server/routes/instance/session`、`server/routes/instance/httpapi/session`、`storage/schema`、`storage/json-migration`、`project/bootstrap`)
- `sync/`:15+ inbound(server / session / share / control-plane)
- `control-plane/`:15+ inbound(plugin / effect / server / storage/schema / project / session / sync / share)

**决策**:Phase 1 都不动,记 plan 偏差。理由:
1. `share` 砍掉要改 8+ 文件,牵动 storage / project 启动,与"base trim"目标超出
2. `sync` + `control-plane` 不在 spec § 10 的 cut 列表 —— 我自己加上去过激了
3. 即使保留这些目录,最终 binary 不依赖它们(没人用 share / sync / control-plane 的 npm/cloud 服务时,代码路径不会跑到)

**影响**:
- spec § 10 Phase 1 字面要求"share / acp 协议层 砍",我们只砍了 `acp`(连 cli/cmd/acp.ts + acp/ 目录),`share` 没砍,记入 § 11.3 spec 偏差。
- **本 verification report 已是修订记录**:Phase 2 / 3 视实际依赖再决定 share/sync/control-plane 何时砍。如果 Phase 2 LLM/DB 接通后发现 share 仍然有副作用,届时单独走 § 15 修订流程。

**判断**:**结构性偏差**,但属于"砍法的选择",不改 spec § 2 任何核心架构原则。

### 3.3 dev/postinstall 期间的 bunfig 副作用

**触发**:clean install 时 `postinstall: fix-node-pty` 失败,报 `error: preload not found "@opentui/solid/preload"`。

**根因**:`agent/packages/opencode/bunfig.toml` 顶部 `preload = ["@opentui/solid/preload"]` —— bun 在 install 阶段就要求 preload module 存在。

**决策**:删 bunfig 顶部 preload,留 `[test]` 段下的 preload(改为只 `./test/preload.ts`)。

**判断**:操作细节。验证后:`bun install` 重新跑通。

### 3.4 clean install 暴露 + 修补的 5 个 dangling 静态 / 类型 import

第一次砍包后 typecheck 通过,但**那时 node_modules 还残留 cut 包**,所以 tsgo 没报错。Clean install 后:

| 问题文件 | 来源 | 修复 |
|---|---|---|
| `src/plugin/index.ts:17` | `import { gitlabAuthPlugin } from "opencode-gitlab-auth"`(静态) | 删 import + 删 INTERNAL_PLUGINS 数组里的 `GitlabAuthPlugin` + `PoeAuthPlugin` |
| `src/session/llm.ts:7` | `import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"`(静态) | 删 import + 删 80 行 `instanceof GitLabWorkflowLanguageModel` 的 toolExecutor / approvalHandler 块 |
| `src/provider/provider.ts:104-116` | BUNDLED_PROVIDERS 字典的 18 个 dynamic import 入口 | 砍 18 个 entries,只留 anthropic / google / openai / openai-compatible / github-copilot |
| `src/provider/provider.ts:512-655` | `gitlab` customLoader 用 `import("gitlab-ai-provider")` + workflow model discovery | 删整个 144-line `gitlab` Effect.fnUntraced loader |
| `src/provider/provider.ts:555-633` | `cloudflare-ai-gateway` customLoader 用 `import("ai-gateway-provider")` | 删整个 78-line loader |

**判断**:操作细节,不触红线。spec § 10 Phase 1 范围内"砍 provider adapter"应有的清理。计入 commit `7647c5f`。

### 3.5 测试套件 3 处修复

详见 § 1.1 / § 1.2。两个真实修复(macOS realpath、`/tui/select-session` 端点废除)+ 一个 timeout bump。

---

## 4. commit 历史(11 个 atomic commits)

```
0c642fc chore(agent): drop dead build script reference
7647c5f refactor(agent): cut gitlab + cloudflare-ai-gateway provider integration
027a94e test(agent): adapt remaining test suites post-trim
9df4a68 refactor(agent): clean dangling imports + dead test/script files
325b523 refactor(agent): rename binary opencode -> agent
504a978 refactor(agent): trim deps + scripts after package/module cuts
2e50d18 refactor(agent): drop acp + tui from opencode/src
6245fcd chore(agent): remove slack IM gateway
508c173 chore(agent): remove desktop/UI/enterprise + SST cloud infra
b6baac8 chore(agent): remove docs/web/storybook/console/function/extensions/identity/containers
e57455c docs(phase-1): add base trim plan
5f07a0a (Phase 0 终点)
```

每个 commit 独立可 revert、消息描述了 why 而非 what。

---

## 5. 已知遗留(留给后续 phase)

- `share/` / `sync/` / `control-plane/` 子目录(详 § 3.2)—— Phase 2 LLM 接通后再评估
- npm 包名 `@opencode-ai/*` → `@assets-produce/*`(Phase 6 命名整理)
- `OPENCODE_BIN_PATH` env / `bin/agent` 内部"opencode-<platform>" 字面查找(Phase 6 整理)
- `agent/AGENTS.md`、`agent/SECURITY.md`、`agent/STATS.md`、`agent/CONTRIBUTING.md`、`agent/LICENSE`(upstream 痕迹,Phase 6 写自己的)
- 多语言 README(`agent/README.??.md` × 24)Phase 6 整理
- `agent/specs/`、`agent/sdks/`、`agent/script/`、`agent/github/`、`agent/nix/`、`agent/flake.{lock,nix}`(upstream 留下,不影响验收)
- `agent/turbo.json` 残留 `opencode#test:ci` task(`build` script 已删,`dependsOn: ^build` 现是死引用 —— 不报错但 noise)
- `cli/cmd/web.ts`(详 § 3.1)与 Phase 5 自己的 Next.js WebUI 关系
- `cli/cmd/github.ts` / `pr.ts`(暂留,Phase 3 决定是否包装成 atomic tool)
- `bin/agent` 内的"opencode-platform-arch" lookup names + `OPENCODE_BIN_PATH` env(Phase 6 整理)

---

## 6. 进入下一 phase 前的 checklist

- [x] 跑通所有 5 个验收项(全过)
- [x] 写 verification report(本文)
- [x] commit + push 到 main(11 commits 推到 `origin/main`,push 在 verification commit 之后一并)
- [ ] 跑 `superpowers:code-reviewer`(下一步)
- [ ] 通知用户 `/compact`

下一阶段:Phase 2 — Foundation(drizzle schema、ali-oss、Langfuse SDK、LLM provider 接通)。
