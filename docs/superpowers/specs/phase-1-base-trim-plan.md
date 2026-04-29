# Phase 1 — Base Trim Plan

> 对应:[spec § 10 Phase 1](2026-04-29-assets-produce-spec.md#phase-1--base-trim)
> 起始 commit:`5f07a0a`(Phase 0 终点)
> 预计:1 个工作日,8-12 个 atomic commits
> 执行人:Claude Opus 4.7 (1M) + cdotlock

---

## 0. 目标与范围

### 0.1 目标(spec § 10 Phase 1)

opencode 砍干净,得到聚焦的 agent 基座 —— 留下 `session / tool / agent / provider(精简)/ mcp / storage / permission / plugin / server`,binary 改名 `opencode` → `agent`,体积减少 ≥ 40%。

### 0.2 在范围内

- 砍 opencode upstream 的 14 个 package(详见 § 1.2 决策表)
- 砍 opencode/src 子目录:`acp`、`share`、`sync`、`control-plane`、`cli/cmd/tui/`、`cli/cmd/acp.ts`、`cli/cmd/web.ts`(待确认)
- 砍 `@ai-sdk/*` provider:Day 0 留 `anthropic` + `openai-compatible` + `deepseek` + 1-2 个 fallback
- binary 重命名:`opencode` → `agent`(`bin/opencode` → `bin/agent`、`bin: {"opencode": ...}` → `bin: {"agent": ...}`)
- package 重命名:`opencode` → `agent`(只重命名 root binary 包,其他 `@opencode-ai/*` 暂不动 —— Phase 1 范围内动它们等同重写,留给后续 phase)
- 同步 agent/package.json `workspaces.packages` 删掉砍掉的项
- 同步 agent/turbo.json / agent/script/* 等顶层配置去掉 dead reference
- 全文搜索 import,确认没有 dangling import

### 0.3 不在范围内

- 业务逻辑(留 Phase 2-3)
- 新 atomic tool(留 Phase 3)
- DB schema 改动(留 Phase 2)
- Skill 系统改造(留 Phase 4)
- 重命名所有 `@opencode-ai/*` 包到 `@assets-produce/*`(改动巨大,与 base trim 无关,留给后续 phase 视需求决定)
- 砍 opencode/src 内部 `provider/` 子目录代码 —— 只动 `package.json` 依赖列表,代码留着不会编进 bundle 也不会被加载(轻成本快路径)

### 0.4 决策预设(不再问用户,执行时如发现假设错误才停下)

| 议题 | 决策 | 理由 |
|---|---|---|
| `temporary.ts`(`dev:temporary` 入口) | 保留 | 体积 0,改起来牵动 dev 流程,等真正用到再决定 |
| `opencode/src/v2/` | 保留 | opencode 新 API surface,plugin 已大量依赖 |
| `opencode/src/ide/`、`lsp/`、`pty/`、`shell/` | 保留 | 工具能力,服务于 tool execution |
| `cli/cmd/web.ts` | 砍 | 启的是 docs 站对接,docs 站本身砍掉 |
| `cli/cmd/github.ts`、`cli/cmd/pr.ts` | 暂留 | 是 GitHub 集成 atomic tool 的雏形,Phase 3 决定 |
| `agent/specs/`、`agent/sdks/`、`agent/script/`、`agent/github/`、`agent/infra/`、`agent/nix/` | 暂留 | 不进 bundle,不影响验收;真要清理在 Phase 6 整理 |
| 多语言 README(README.ar.md..README.zht.md) | 砍 | 噪声,无人维护 |
| `agent/AGENTS.md`、`agent/SECURITY.md`、`agent/STATS.md`、`agent/CONTRIBUTING.md`、`agent/LICENSE` | 暂留 | upstream 痕迹,Phase 6 写自己的 |
| 是否动 opencode upstream GitHub Actions(`agent/github/`) | 不动 | 不在 CI 范围内,反正不跑 |

---

## 1. Pre-Step:Inventory 与 Anchor

### 1.1 先量基线体积

| 检查 | 命令 | 预计输出 | 用途 |
|---|---|---|---|
| 当前 `agent/` 总体积(含 node_modules) | `du -sh agent/` | ~2.5G | Phase 1 开始 baseline |
| 当前 `agent/` 不含 node_modules | `du -sh --exclude=node_modules agent/` | 待测 | code-only baseline |
| 当前 packages 各项 | `du -sh agent/packages/*` | console 33M / web 13M / opencode 13M ... | 砍后对比 |
| 全文 import 当前 anchor 数 | `grep -rl "@opencode-ai/web\|@opencode-ai/desktop" agent/packages/opencode/src` | 列表 | 验证砍后 import = 0 |

**预计输出文件**:落在执行 log 里,verification report § 1 / § 5 引用。

### 1.2 确认砍 / 留清单(基于 Phase 0 后探查结果)

| package 路径 | name | 大小 | 决策 | 理由 |
|---|---|---|---|---|
| `agent/packages/opencode/` | `opencode` | 13M | **保留**(rename) | binary entry,核心 |
| `agent/packages/core/` | `@opencode-ai/core` | 268K | **保留** | bun-shell + npm + FS 工具,opencode 依赖 |
| `agent/packages/script/` | `@opencode-ai/script` | 16K | **保留** | opencode build 工具 |
| `agent/packages/plugin/` | `@opencode-ai/plugin` | 64K | **保留** | server-side plugin API,opencode 依赖 |
| `agent/packages/sdk/js/` | `@opencode-ai/sdk` | 888K | **保留** | run / generate / plugin 等 10+ 处内部 import |
| `agent/packages/app/` | `@opencode-ai/app` | 3.8M | **砍** | Vite SPA(desktop 前端) |
| `agent/packages/desktop/` | `@opencode-ai/desktop` | 8.9M | **砍** | Tauri 桌面壳 |
| `agent/packages/desktop-electron/` | `@opencode-ai/desktop-electron` | 8.6M | **砍** | Electron 桌面壳 |
| `agent/packages/ui/` | `@opencode-ai/ui` | 8.5M | **砍** | Solid UI 组件库(desktop 用) |
| `agent/packages/web/` | `@opencode-ai/web` | 13M | **砍** | Astro 文档站 |
| `agent/packages/storybook/` | `@opencode-ai/storybook` | 136K | **砍** | Storybook |
| `agent/packages/slack/` | `@opencode-ai/slack` | 32K | **砍**(spec § 10 IM gateway) | Slack IM 适配器 |
| `agent/packages/enterprise/` | `@opencode-ai/enterprise` | 120K | **砍** | Enterprise SST/SolidStart 云后台 |
| `agent/packages/function/` | `@opencode-ai/function` | 32K | **砍** | Cloudflare Workers + GitHub auth(opencode.com 云能力) |
| `agent/packages/console/` | (5 个 SST nested workspace) | 33M | **砍** | opencode.com SST 云控制台 |
| `agent/packages/containers/` | (无 package.json,Tauri/Linux 发布脚手架) | 32K | **砍** | 跟 desktop 一起 |
| `agent/packages/docs/` | (无 package.json,Mintlify MDX) | 496K | **砍** | upstream 文档站源 |
| `agent/packages/extensions/` | (无,只有 zed 插件) | 8K | **砍** | Zed 编辑器扩展 |
| `agent/packages/identity/` | (无,只有品牌 logo) | 24K | **砍** | upstream 品牌资源 |

**砍 14 个、留 5 个**(opencode + core + script + plugin + sdk)。

### 1.3 opencode/src/ 内部子目录决策

| 子目录 | 决策 | 理由 |
|---|---|---|
| `acp/` | **砍** | spec § 10 Phase 1 砍 ACP 协议 |
| `share/` | **砍** | spec § 10 Phase 1 砍 share 协议 |
| `sync/` | **砍** | opencode.com 云 event sync(SQL schema + sync.ts) |
| `control-plane/` | **砍** | opencode.com 云 workspace context |
| `cli/cmd/tui/` | **砍** | spec 隐含 —— 我们提供独立 WebUI(Phase 5),不留 OpenTUI 终端 UI |
| `cli/cmd/acp.ts` | **砍** | 跟 `acp/` 一起 |
| `cli/cmd/web.ts` | **砍** | 配合砍 `@opencode-ai/web` astro docs 站 |
| `cli/cmd/github.ts`、`cli/cmd/pr.ts` | **暂留** | GitHub 集成有可能在 Phase 3 包装 atomic tool |
| `cli/cmd/run.ts`、`generate`、`agent`、`session`、`mcp`、`models`、`providers`、`stats`、`debug`、`upgrade`、`uninstall`、`serve`、`plugin`、`db`、`export`、`import`、`completion` | **保留** | 全是核心 CLI 命令 |
| `account/`、`agent/`、`auth/`、`bus/`、`cli/`、`command/`、`config/`、`effect/`、`env/`、`file/`、`format/`、`git/`、`id/`、`ide/`、`installation/`、`lsp/`、`mcp/`、`patch/`、`permission/`、`plugin/`、`project/`、`provider/`、`pty/`、`question/`、`server/`、`session/`、`shell/`、`skill/`、`snapshot/`、`storage/`、`temporary.ts`、`tool/`、`util/`、`v2/`、`worktree/`、`index.ts`、`node.ts` | **保留** | 全是 spec 列出的核心域或服务核心域的设施 |

### 1.4 Provider 依赖列表(opencode/package.json)精简方针

**保留**:
- `@ai-sdk/anthropic`(Day 0 主脑)
- `@ai-sdk/openai-compatible`(Day 0 接 DeepSeek 等 OpenAI 兼容)
- `@ai-sdk/openai`(留 1 个标准 OpenAI fallback,日后切 OpenAI 用)
- `@ai-sdk/google`(留 1 个 fallback,Gemini 偶尔需要)
- `@ai-sdk/provider`、`@ai-sdk/provider-utils`(都是 ai-sdk 自身依赖,不动)

**砍**:`@ai-sdk/alibaba`、`amazon-bedrock`、`azure`、`cerebras`、`cohere`、`deepinfra`、`gateway`、`google-vertex`、`groq`、`mistral`、`perplexity`、`togetherai`、`vercel`、`xai`(共 14 个)

**砍 ai 网关 / 第三方 provider** :`ai-gateway-provider`、`gitlab-ai-provider`、`@gitlab/opencode-gitlab-auth`、`opencode-gitlab-auth`、`opencode-poe-auth`、`@openrouter/ai-sdk-provider`、`venice-ai-sdk-provider`(7 个)

**注**:不动 `opencode/src/provider/` 目录代码本身 —— `models.ts` 等用 dynamic loader 按 ID 注入,删依赖即可。如果 provider/ 下某 ts 在 import 已删 SDK,会编译报错,届时再删那个 ts。轻成本快路径。

### 1.5 OpenTUI 依赖

砍 TUI 后,`@opentui/core` + `@opentui/solid` + `solid-js`(被 TUI 用)+ `cli-sound`、`opentui-spinner`、`@solid-primitives/*` 都要清。

**注意**:`solid-js` 同时是 `@opencode-ai/sdk/v2` 的 dep(待确认),如果 sdk 也用就别在 opencode/package.json 删 —— sdk 自己管。

---

## 2. 步骤拆解

> 每步:**Action / 预计输出 / 自检 / 风险**。提交一步一 commit,失败可回滚。

### Step 1:落 Phase 1 plan + push

- **Action**:本文件落盘 + commit `docs(phase-1): add base trim plan` + push
- **预计输出**:HEAD 前进 1
- **自检**:`git log -1 --oneline`、`git status` 干净
- **风险**:零

### Step 2:删第一波 obvious 包(纯增量删除,无 import 牵连)

- **Action**:`git rm -r` 这 8 个目录:
  - `agent/packages/web/`
  - `agent/packages/docs/`
  - `agent/packages/storybook/`
  - `agent/packages/extensions/`
  - `agent/packages/identity/`
  - `agent/packages/containers/`
  - `agent/packages/console/`(整个 33M)
  - `agent/packages/function/`
- **预计输出**:`git status` 显示 ~数千 file deleted,`du -sh agent/` 减 ~50M+(node_modules 还在,真减量在 Step 8 重 install 后)
- **自检**:
  - `grep -rl "@opencode-ai/web\|opencode-ai/docs\|opencode-ai/storybook\|opencode-ai/function" agent/packages/{opencode,core,script,plugin,sdk}/src 2>/dev/null` 应为空(这些都是 dev 消费包,opencode 不会反向依赖)
  - 留下的 5 个核心包 + sdk 仍存在
- **风险**:console 内部 SST 配置可能被 `agent/sst.config.ts` 引用 → 检查后处理(见 Step 3)
- **commit**:`chore(agent): remove docs/web/storybook/console/etc upstream-only packages`

### Step 3:删 desktop / TUI 周边包

- **Action**:`git rm -r`:
  - `agent/packages/app/`
  - `agent/packages/desktop/`
  - `agent/packages/desktop-electron/`
  - `agent/packages/ui/`
  - `agent/packages/enterprise/`
- **预计输出**:5 个目录消失
- **自检**:
  - `grep -rl "@opencode-ai/app\|opencode-ai/desktop\|opencode-ai/ui\|opencode-ai/enterprise" agent/packages/{opencode,core,script,plugin,sdk}/` 应为空
  - 检查 `agent/sst.config.ts` 是否引用 desktop / enterprise / console → 如有,改 / 删 sst.config.ts(SST infra 我们不用)
- **风险**:opencode/src 可能 import @opencode-ai/ui 的 design token → grep 验证;如果有,要么移到 opencode 内部要么彻底剔
- **commit**:`chore(agent): remove desktop / TUI / enterprise packages`

### Step 4:删 slack(IM gateway)

- **Action**:`git rm -r agent/packages/slack/`
- **预计输出**:slack 目录消失
- **自检**:`grep -rl "@opencode-ai/slack" agent/packages/opencode/` 应为空
- **风险**:opencode plugin/ 里可能注册 slack 入口 → grep 验证
- **commit**:`chore(agent): remove slack IM gateway`

### Step 5:砍 opencode/src 内部子目录

- **Action**:
  - `git rm -r agent/packages/opencode/src/acp/`
  - `git rm -r agent/packages/opencode/src/share/`
  - `git rm -r agent/packages/opencode/src/sync/`
  - `git rm -r agent/packages/opencode/src/control-plane/`
  - `git rm -r agent/packages/opencode/src/cli/cmd/tui/`
  - `git rm agent/packages/opencode/src/cli/cmd/acp.ts`
  - `git rm agent/packages/opencode/src/cli/cmd/web.ts`(若存在)
- **预计输出**:对应目录 / 文件消失
- **自检**:`grep -rln "from \"\\./acp\"\|from \"\\./share\"\|from \"\\./sync\"\|from \"\\./control-plane\"\|cmd/tui\|cmd/acp\|cmd/web" agent/packages/opencode/src/` 应为空(除内部自引,但已被删)
- **风险**:`session/index.ts` / `storage/migrations/*` 可能引用 sync 的 `event.sql.ts` 表 schema → 出现 import error 时,移除引用行
- **commit**:`chore(agent): drop acp/share/sync/control-plane/tui/web internal modules`

### Step 6:更新 opencode/src/index.ts CLI 注册表

- **Action**:打开 `agent/packages/opencode/src/index.ts`,移除被砍命令的 import + 注册:
  - `AttachCommand`(`./cli/cmd/tui/attach`)
  - `TuiThreadCommand`(`./cli/cmd/tui/thread`)
  - `AcpCommand`(`./cli/cmd/acp`)
  - `WebCommand`(`./cli/cmd/web`)—— 若存在
  - 任何 yargs `.command(*)` 链对应的注册行
- **预计输出**:index.ts 减少 ~10 行
- **自检**:bun typecheck(`cd agent/packages/opencode && bun run typecheck`)对 index.ts 应过(对其他文件可能仍报错,正常,Step 7-9 解决)
- **风险**:upgrade.ts 内有自启 TUI 流程 → 需验证;如果有,删
- **commit**:`refactor(agent): unregister cut CLI commands from entry`

### Step 7:更新 opencode/package.json 砍 provider + opentui + 其他 dep

- **Action**:编辑 `agent/packages/opencode/package.json` `dependencies`:
  - 删 § 1.4 列出的 14 个 `@ai-sdk/*` provider
  - 删 7 个第三方 ai/auth provider
  - 删 `@opentui/core`、`@opentui/solid`、`opentui-spinner`、`cli-sound`
  - 删 `@solid-primitives/event-bus`、`@solid-primitives/scheduled`(TUI 专用)
  - 留 anthropic / openai-compatible / openai / google / provider / provider-utils
- **预计输出**:dependencies 行数减 ~25
- **自检**:
  - 视觉 diff 看清楚没误删
  - `bun install`(在 agent/ 下,带 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`)能正常完成
- **风险**:漏删 → 后续 typecheck 暴露;误删 → typecheck 暴露
- **commit**:`refactor(agent): trim provider/ai-sdk + opentui deps`

### Step 8:更新 agent/package.json workspace + 顶层脚本

- **Action**:
  - `workspaces.packages` 删 `packages/console/*`、`packages/sdk/js`、`packages/slack` 的特殊条目 ——`packages/sdk/js` 仍要(`packages/*` 不能 match nested 的 `sdk/js`),所以保留 `packages/sdk/js`,删 `packages/console/*`、`packages/slack`
  - `scripts` 删:`dev:desktop`、`dev:web`、`dev:console`、`dev:storybook`(对应包都没了)
  - `scripts.postinstall` `bun run --cwd packages/opencode fix-node-pty` 保留
  - `trustedDependencies` 删 `electron`(可选)
  - `patchedDependencies` 检查 → solid-js patch 还要不要(若 SDK 用 solid 则要,否则删)
- **预计输出**:workspace 列表清爽 + scripts 缩短
- **自检**:`cd agent && bun install` 跑通,无 missing workspace 报错
- **风险**:`packages/sdk/js` 路径在 `packages/*` glob 下会不会被双声明 → 实测无害(Bun 容忍)
- **commit**:`refactor(agent): align root workspaces.packages with trimmed tree`

### Step 9:binary 重命名 `opencode` → `agent`

- **Action**:
  - `git mv agent/packages/opencode/bin/opencode agent/packages/opencode/bin/agent`
  - 编辑 `agent/packages/opencode/bin/agent`(原文件):内部 `OPENCODE_BIN_PATH` 暂留(env 变量在 spec § 15 / 后续 phase 决定)。
  - 编辑 `agent/packages/opencode/package.json`:`"bin": {"opencode": "./bin/opencode"}` → `"bin": {"agent": "./bin/agent"}`
  - **不**修改 `agent/packages/opencode/package.json` 的 `name: "opencode"` —— Phase 1 不重命名 npm 包名(rename root package 触发 SDK / plugin / scripts 大量 import 替换,与 base trim 解耦,留给 Phase 6 命名整理)
  - `agent/package.json`(根)`name: "opencode"` 也保持,Phase 6 重命名为 `agent`
- **预计输出**:bin 路径更新
- **自检**:
  - `cd agent && bun run --cwd packages/opencode --conditions=browser src/index.ts --help` → 输出 help(命令树应不再包含 attach / thread / acp / web)
  - 检查 `OPENCODE_BIN_PATH` env 是否还有意义 —— bin/agent 走的是 OPENCODE_BIN_PATH;Phase 6 时改为 AGENT_BIN_PATH 更彻底,Phase 1 先不动
- **风险**:`bin/opencode` 内部如果硬编码 "opencode" 字面量(用于 fallback path 查找),改名后能不能找到 `target` —— 看完整代码后判断
- **commit**:`refactor(agent): rename binary opencode -> agent`

### Step 10:清残留 import + 删孤儿测试

- **Action**:
  - 全文 grep 砍掉的模块 import,逐个删
  - 主要怀疑点:
    - `*.test.ts` 中引用 acp/share/sync/tui
    - `agent/specs/*` 中引用 acp/share schema
    - `agent/script/*` build 脚本中引用砍掉的 cli command
  - `bun run --cwd packages/opencode typecheck` 必须全过(或剩零星非阻塞警告)
- **预计输出**:零 import error
- **自检**:`grep -rn "from \"\\./acp\\|share\\|sync\\|control-plane\\|tui\\|cli-sound\\|opentui" agent/packages/opencode/src/` 应为空
- **风险**:link 了上游内部 module 的间接路径(transitive),需逐个看
- **commit**:`refactor(agent): clean up dangling imports after package trim`

### Step 11:跑保留 package 单测

- **Action**:
  - `cd agent && bun --cwd packages/opencode test --timeout 30000`
  - `cd agent && bun --cwd packages/core test`(若有)
  - `cd agent && bun --cwd packages/script test`(若有)
  - `cd agent && bun --cwd packages/plugin test`(若有)
  - `cd agent && bun --cwd packages/sdk/js test`(若有)
- **预计输出**:绿(允许 skip 或预先标 .skip 的 test;不允许 fail)
- **自检**:每个 package 测试结果 log 落 verification report
- **风险**:有些测试依赖被砍模块 → 改 / 删 / skip,记到 verification 偏差
- **commit**:`test(agent): adapt remaining test suites post-trim`(只在改 / 删 / skip 测试时建一次 commit;若 0 测试受牵连,跳过 commit)

### Step 12:验收 + 量减量

- **Action**:
  - `cd agent && bun run --cwd packages/opencode --conditions=browser src/index.ts --help` —— 检查命令树
  - `du -sh agent/`、`du -sh --exclude=node_modules agent/` —— 对比 § 1.1 baseline
  - 全文 grep 砍掉的 package.json name 在 src 里的 import → 0
- **预计输出**:
  - help 输出无 attach / thread / acp / web / tui / share / sync 等命令
  - 体积减少 ≥ 40%(主要从 packages/console + web + desktop + ui + node_modules 砍中获得)
- **自检**:数据落 verification report § 1
- **风险**:体积没减够 —— 通常 node_modules 缩水巨大,如果不够,补刀 dev deps(eslint / playwright / storybook 相关)
- **commit**:`chore(agent): finalize phase 1 base trim`(若上面所有 step 都已 commit,这里如无变动则 skip)

### Step 13:写 verification report

- **Action**:`docs/superpowers/specs/phase-1-base-trim-verification.md`,逐条对 spec § 10 Phase 1 的 5 个验收项打勾,记下偏差(必有几条)
- **预计输出**:文件落盘
- **自检**:5 个验收项每条都有命令 + 实际输出 + 通过标记
- **风险**:发现某验收项没过 —— 倒回去补
- **commit**:`docs(phase-1): add base trim verification report`

### Step 14:跑 superpowers:code-reviewer

- **Action**:dispatch code-reviewer subagent,reviewing Phase 1 commits 全集,与 plan + spec 对照
- **预计输出**:report,可能含 SHOULD FIX / NIT
- **自检**:每条 SHOULD FIX 都修;NIT 视情况
- **风险**:reviewer 发现 plan 和实际偏差(比如某验收项被默认通过但其实没验证)
- **commit**:per fix(若有)

### Step 15:push 到 origin/main + 通知用户 /compact

- **Action**:`git push origin main`,然后告诉用户 "Phase 1 完成,请 /compact 后说『继续』"
- **预计输出**:remote 同步,session 结束
- **自检**:`git log origin/main..HEAD` 应为空
- **风险**:零

---

## 3. 验收对照(spec § 10 Phase 1)

| # | 验收项 | 验证命令 / 方法 | 预计通过条件 |
|---|---|---|---|
| 1 | `agent --help` 显示干净命令树(无 TUI / IM / share / acp) | `cd agent && bun run --cwd packages/opencode --conditions=browser src/index.ts --help` | 输出不含 `attach`、`thread`、`acp`、`web`、任何 tui 子命令;包含 `run`、`agent`、`session`、`mcp`、`models`、`providers`、`stats`、`debug`、`upgrade`、`uninstall`、`serve`、`plugin`、`db`、`export`、`import`、`completion`、`generate`、`github`、`pr` |
| 2 | 保留 package 的单测全绿 | 见 Step 11 命令组 | 5 个 package 都 PASS(或无 test 的明示标注 NO TEST) |
| 3 | `du -sh agent/` 体积比 clone 时减少 ≥ 40% | Step 12 命令 | clone 时 baseline ~2.5G,目标 ≤ 1.5G(主要靠 node_modules 缩水) |
| 4 | `agent` binary 可独立运行(不依赖砍掉的包) | `bun run --cwd packages/opencode --conditions=browser src/index.ts run "say hi"` 或更轻的 `--version` | 不报 missing module / cannot find;help 都跑通即视为可独立(更深 run 测试需 LLM 凭据,Phase 2 才补) |
| 5 | 全文搜索砍掉 package 的 import 应为空 | `grep -rln "@opencode-ai/web\\|@opencode-ai/desktop\\|@opencode-ai/desktop-electron\\|@opencode-ai/ui\\|@opencode-ai/enterprise\\|@opencode-ai/storybook\\|@opencode-ai/slack\\|@opencode-ai/function" agent/packages/` | 0 行(排除 node_modules) |

---

## 4. 风险注册

| 风险 | 触发场景 | 影响 | 缓解 |
|---|---|---|---|
| **R1**:opencode/src 内部对 cut 模块的 transitive 依赖 | Step 5 砍 sync/control-plane 后,session 或 storage 找不到 schema | typecheck 红 | Step 10 grep + 修复;实在牵动太多就保留该模块,记入 verification 偏差 |
| **R2**:`@opencode-ai/sdk` 内部用了 solid-js / @opentui | Step 7 删 opentui + solid-js 后 sdk build 报错 | sdk 编不出来 | sdk 是独立 build,先看 sdk/js/package.json 的 deps,sdk 本身的 deps 不动;只动 opencode 的 deps |
| **R3**:`agent/sst.config.ts` 引用砍掉的包 | Step 2 / 3 后 SST 报错 | 影响 SST 命令(我们不用 SST 部署) | 直接砍 sst.config.ts(或大块改写),记入 verification |
| **R4**:`packages/opencode/script/build.ts` 引用砍掉的包 | Step 7 后 build 报错 | 影响生产打包(Phase 6 才用) | Phase 1 不要求 build 跑通,只要 dev / typecheck / test 跑通即可。verification 记一笔 |
| **R5**:体积减不到 40% | node_modules 没瘦下来 | 验收 #3 失败 | 补砍 dev deps(eslint / playwright / @playwright/test / storybook) |
| **R6**:`bun install` 又卡 electron | electron 在 desktop-electron 删了,但其他包可能仍引 | install 卡 | 已删 desktop-electron;若仍卡,继续用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` |
| **R7**:`OPENCODE_BIN_PATH` 改名后字面 "opencode" 找不到 path | bin/agent 改名 | run 时报错 | Phase 1 不动 bin/agent 内部,留环境变量原名;Phase 6 整体重命名 |
| **R8**:plugin/ 注册了 cut command | Step 6 后 plugin index 加载报错 | 启动失败 | grep agent/packages/plugin 验证 |

---

## 5. 后续 phase 待办挂起

(Phase 1 不做,但执行中可能撞到的事)

- 重命名 npm 包 `@opencode-ai/*` → `@assets-produce/*`(Phase 6)
- 重命名 `OPENCODE_BIN_PATH` env → `AGENT_BIN_PATH`、`AGENT_PORT` 等(Phase 6)
- 重写 `agent/sst.config.ts` 或彻底删除(若不用 SST 部署)
- 更新 `agent/package.json` `name: "opencode"` → `agent`(Phase 6)
- `cli/cmd/github.ts`、`pr.ts` 是否包装成 atomic tool(Phase 3 决定)

---

## 6. 与 spec 的对照(防偏离自检)

- ✅ 不写硬编码视频流水线 service —— Phase 1 全是删除 + 重命名,无新增 service
- ✅ 不让 skill body 散落 markdown —— Phase 1 不动 skill
- ✅ 不在 WebUI 实现独立业务逻辑 —— Phase 1 不动 web/
- ✅ 不混淆 creator / developer profile —— Phase 1 不动 permission
- ✅ 在没写 phase plan 前不直接动代码 —— 本文落盘后才 Step 2 起执行
- ✅ phase 之间不跳过 /compact / verification —— Step 13-15 覆盖

如执行时撞到 spec § 15 修订点(比如发现某保留模块其实不必保留、或某验收项语义需要调整),按 § 11.3 流程更新 spec § 15 后才继续。
