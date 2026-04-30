# Phase 6 — CLI Polish + Legacy Cleanup Plan

> **Spec ref**: [§ 6 + § 10 Phase 6](2026-04-29-assets-produce-spec.md#phase-6--cli-polish)
> **Date**: 2026-04-30
> **Author**: Claude Opus 4.7 (1M)

---

## 0. 决策表（先决, 不待 verification）

| # | 议题 | 决策 | 理由 |
|---|---|---|---|
| 0.1 | OptionDef 形态 | 直接复用 [`cli-example/src/command.ts`](../../../cli-example/src/command.ts) 的 `OptionDef` 结构（`flag` / `description` / `type` / `required`）；放在 `agent/packages/opencode/src/cli/option-def.ts` | spec § 6.2 字面引用 MiniMax CLI；同 type 字段简化 mental model |
| 0.2 | parser 底座 | 保留 yargs，OptionDef 作为「单一定义源」，由 adapter 派生 yargs `.option()` chain。**不**重写 parser — 只把 option 定义抽到中央 | yargs 已嵌入所有 cmd；改 parser 牵动太广，scope creep |
| 0.3 | export-schema 输出格式 | Anthropic tool schema (默认) + 可选 `--format openai`；schema 字段：`name`/`description`/`input_schema` (zod-like JSON Schema)；包含 global options 作为顶层 `parameters.global_flags` 字段 | spec § 6.2 字面要求 Anthropic/OpenAI 兼容 |
| 0.4 | `agent config` 命令组 | 新建 `cli/cmd/config.ts`：`config export-schema`、`config show`、`config validate`。最小可用集 | spec § 6.2 字面 |
| 0.5 | output 模式检测 | `process.stdout.isTTY === false` → 默认 JSON；env `CI=true` 同样视为 non-TTY；可被 `--output text` 覆盖 | spec § 6.2 字面 |
| 0.6 | 全局 `--dry-run` 推广 | 现有 `users`/`skills`/`tools` 已有 `--dry-run`；新增到 GLOBAL_OPTIONS，所有 mutating 命令必须 honor。Read-only 命令（list/get/status）忽略 | spec § 6.2 字面 |
| 0.7 | `--non-interactive` + `failIfMissing` | global flag；当 set 时：(a) 任何 `inquirer`/stdin prompt → 立即 exit 2 with `Missing required: <flag>`；(b) `CI=true` env 自动隐含 `--non-interactive --no-color` | spec § 6.2 字面 |
| 0.8 | exit code 规范 | 9 个：0=SUCCESS / 1=GENERAL / 2=USAGE / 3=AUTH / 4=QUOTA / 5=TIMEOUT / 6=NETWORK / 10=CONTENT_FILTER / 130=SIGINT (auto)。Spec § 10 写「8 个」是 typo，实际 § 6.2 列了 9 个。MiniMax CLI 也是 8 个命名 + 130 auto | spec § 6.2 字面（9 个） |
| 0.9 | exit code 注入点 | 新建 `cli/errors/codes.ts`（const ExitCode 对象）+ `cli/errors/router.ts`（把 Effect Cause / NamedError 映射到 exit code）。每个命令 handler 改用 `process.exit(router(error))` 而非 `process.exitCode = 1` | 集中原则 |
| 0.10 | ERRORS.md 位置 | 仓库根 `ERRORS.md`（不是 docs/）；与 `cli-example/ERRORS.md` 同级别引用资料 | spec § 6.2 + spec § 10 字面 |
| 0.11 | ERRORS.md 覆盖范围 | 每个 user-facing CLI 命令（约 17 个：users×4 / skills×6 / tools×4 / oss×3 / config×3 / models×1 / run / serve / version / help / 加 web user命令组合后再细化）× 主要错误场景 | spec § 6.2 字面 |
| 0.12 | SKILL.md 位置 | 仓库根 `SKILL.md` | spec § 6.2 字面 |
| 0.13 | SKILL.md 内容 | 安装路径 / quick-start CLI / 错误码 reference / 输出格式约定 / 链接到 ERRORS.md + 主 spec | "可被另一 Claude Code session 直接读懂使用"（spec § 10 验收 #4） |
| 0.14 | 单二进制工具 | Bun bundle (`bun build --target=bun --outfile=agent/dist/agent.mjs`) — Bun 已是 toolchain 默认 (`packageManager: bun@1.3.13`)，不引入 esbuild/ncc 等额外打包器 | spec § 6.2 字面 |
| 0.15 | 单二进制范围 | 把 `agent/packages/opencode` 的 CLI entry 打成 `.mjs`；native 依赖 (better-sqlite3, bcryptjs, ali-oss 等) 走 `--external` 让 Bun runtime resolve；`bunx agent` 仍然能用 | 避免捆绑 native — Bun 自带 sqlite/bcrypt 替代时再优化 |
| 0.16 | 单二进制验收阈值 | size ≤ 30MB（spec 字面）、cold start ≤ 100ms。Cold start 测量：`hyperfine --warmup 0 'bun agent --version'`，min run ≤ 100ms | spec § 10 验收 #2 |
| 0.17 | legacy/ 删除 gate | **必须先与用户确认** — CLAUDE.md 红线之外的破坏性操作。流程：写完前置 task → 提交 task summary → 等用户回 OK → 才执行 `git rm -r legacy/`。本 plan 把 legacy 删除拆为独立 task 8，前置 task 0-7 不依赖它 | spec § 10 字面 + 全局 CLAUDE.md 操作纪律 |
| 0.18 | 保留命令优先级 | P1（必改 OptionDef）：`users`, `tools`, `skills`, `oss`, `run`, `serve`, `models`. P2（保留 yargs，不必改 OptionDef）：`account`, `cmd`, `db`, `export`, `generate`, `github`, `import`, `mcp`, `pr`, `providers`, `stats`, `uninstall`, `upgrade`, `web`, `plug`, `agent`. P3（hidden / internal）：`debug` | P1 = 直接面向 agent 的命令；P2 = opencode upstream / dev 工具，不暴露 schema |
| 0.19 | 兼容性承诺 | OptionDef 重构必须**完全保留**现有 P1 命令的 CLI surface（flag 名、参数类型、行为）。不改用户面 — 只换内部实现 | spec § 11.4 跨 phase 接口稳定 |
| 0.20 | tool schema 与 atomic tools 区分 | `agent tools export-schema` (Phase 3 已有) 输出 atomic tool 的 LLM schema；`agent config export-schema` (Phase 6 新增) 输出 CLI 命令的 LLM schema (即「外部 agent 怎么调 CLI」)。两者并存，不混淆 | spec § 5.3 + § 6.2 |
| 0.21 | dryRun 在 read-only 上 | `agent users list --dry-run` 等读命令报 `--dry-run not applicable to read-only command, ignored` 并继续；不退出 | UX：避免脚本 wrapper 因 read 命令传 --dry-run 失败 |

---

## 1. 文件清单

### 1.1 新建

| 路径 | 职责 |
|---|---|
| `agent/packages/opencode/src/cli/option-def.ts` | OptionDef 接口 + GLOBAL_OPTIONS 常量 + adapter (`toYargsBuilder` / `toJsonSchema` / `helpFor`) |
| `agent/packages/opencode/src/cli/errors/codes.ts` | ExitCode const（9 个） + 映射表 |
| `agent/packages/opencode/src/cli/errors/router.ts` | Effect Cause / NamedError → ExitCode |
| `agent/packages/opencode/src/cli/output/mode.ts` | TTY 检测 + JSON/text 切换辅助 |
| `agent/packages/opencode/src/cli/cmd/config.ts` | `agent config export-schema/show/validate` 命令组 |
| `agent/build.ts` | Bun bundle 入口（如 `cli-example/build.ts` 同款） |
| `agent/dist/agent.mjs` | 打包产物（gitignore，不入仓） |
| `ERRORS.md` | 仓库根错误参考矩阵 |
| `SKILL.md` | 仓库根 agent 自助文档 |

### 1.2 修改

| 路径 | 改动 |
|---|---|
| `agent/packages/opencode/src/cli/cmd/users.ts` | option 来源改 OptionDef adapter；handler 改 `process.exit(router(err))` |
| `agent/packages/opencode/src/cli/cmd/tools.ts` | 同上；保留现有 dry-run |
| `agent/packages/opencode/src/cli/cmd/skills.ts` | 同上；保留现有 dry-run |
| `agent/packages/opencode/src/cli/cmd/oss.ts` | 同上 |
| `agent/packages/opencode/src/cli/cmd/run.ts` | 同上；推广 `--dry-run` |
| `agent/packages/opencode/src/cli/cmd/serve.ts` | 同上；运行态命令通常不 dry-run，需 explicit handle |
| `agent/packages/opencode/src/cli/cmd/models.ts` | 同上 |
| `agent/packages/opencode/src/cli/cmd.ts`（main entry） | 注入 GLOBAL_OPTIONS；TTY 模式 hook；root error handler |
| `agent/packages/opencode/package.json` | 加 `build` script + 加 `agent` bin alias（确保 `bunx agent` work） |
| `agent/.gitignore` | 加 `dist/` |
| `package.json`（仓库根） | 加 `agent:build` / `agent:size` 脚本 |
| `README.md`（仓库根） | 链接 SKILL.md / ERRORS.md / 主 spec |
| `CLAUDE.md`（项目级） | 加 Phase 6 完成后的「单二进制位置」一行；移除对 legacy/ 的引用（task 8 同步） |

### 1.3 删除（task 8 with 用户确认）

| 路径 | 改动 |
|---|---|
| `legacy/` | `git rm -r legacy/` — Phase 0 移入的旧 Agent Forge，Phase 6 移除 |
| 任何引用 legacy 的文档段落 | 同步清掉 |

---

## 2. Task 拆分（subagent dispatch units）

每个 task 一次 subagent 派遣，用 superpowers:subagent-driven-development（plan + spec-review + code-review 两阶段）。任务序内严格依赖：每个 task 完成 + review pass 才进下一个。

### Task 1 — Audit + OptionDef foundation（无行为变更）

**目标**：建立 OptionDef 中央定义层，不改任何用户面行为。

**步骤**：
- [ ] 1.1 列出 `agent/packages/opencode/src/cli/cmd/*.ts` 全部命令 + option，按 0.18 分 P1/P2/P3
- [ ] 1.2 写 `cli/option-def.ts`：定义 `OptionDef` 接口、`GLOBAL_OPTIONS` 常量、adapter 函数 `toYargsBuilder(yargs, options)` / `toJsonSchema(options)` / `helpFor(cmdName, options)`
- [ ] 1.3 加 `agent run --help` smoke：cmd 树未变；exit 0
- [ ] 1.4 加 unit test for adapter：3 个 OptionDef → 各派生 yargs / JSON schema / help

**输出文件**：`cli/option-def.ts`、`test/cli/option-def.test.ts`

**测试项**：
- [ ] `bun --cwd packages/opencode run typecheck` 0 errors（仅本 task 文件）
- [ ] `bun --cwd packages/opencode test test/cli/option-def.test.ts` 全绿
- [ ] `bun bin/opencode.js --help` 输出与 main 分支一致（diff 为空）

**风险**：adapter type-safety 与 yargs interface mismatch — yargs 的 option config schema 比 OptionDef 复杂（choices / coerce / conflicts）。Mitigation：OptionDef 留 `extra: yargs.Options` 逃生口。

---

### Task 2 — P1 命令迁移到 OptionDef（机械重构）

**目标**：7 个 P1 命令的 option 定义全部抬到 OptionDef，handler 不动。

**步骤**：
- [ ] 2.1 `users`：`add` / `list` / `passwd` / `delete` 全部用 `defineCommand({ options: [...] })`，builder 走 adapter
- [ ] 2.2 `tools`：同上
- [ ] 2.3 `skills`：同上
- [ ] 2.4 `oss`：同上
- [ ] 2.5 `run`：同上
- [ ] 2.6 `serve`：同上
- [ ] 2.7 `models`：同上
- [ ] 2.8 每个命令的现有 smoke test（如 `agent users add --dry-run --username foo --role creator --password testpw12`）跑通，结果与重构前 byte-for-byte 一致

**测试项**：
- [ ] 7 个命令 `--help` 输出与重构前 diff 为空（除 GLOBAL_OPTIONS 加入引起的差异）
- [ ] 每个命令的 `--dry-run` 输出 JSON shape 不变
- [ ] `bun test` 全 phase 单测全绿（不引入 regression）

**风险**：yargs `.command()` chain 行为差异（subcmd inherits parent options）— 用 adapter 时要正确传 yargs instance，不能丢上下文。

---

### Task 3 — `agent config export-schema` + 命令组

**目标**：实现 spec § 6.2 字面要求的 `agent config export-schema [--command <name>]` + 配套 `config show` / `config validate`。

**步骤**：
- [ ] 3.1 写 `cli/cmd/config.ts`：3 个 subcmd
- [ ] 3.2 `export-schema`：默认 Anthropic 格式（`{name, description, input_schema}`），全量命令；`--command users add` 过滤；`--format openai` 输出 OpenAI tools 形态（`{type:"function", function:{name, description, parameters}}`）
- [ ] 3.3 `show`：打印有效 config（env / `.opencode.jsonc` / 默认）
- [ ] 3.4 `validate`：检查 env 必需字段（参考 `.env.example`），缺失退 exit code 3 (AUTH) / 6 (NETWORK) 视情况
- [ ] 3.5 hook 到 `cmd.ts` 主 entry

**测试项**：
- [ ] `agent config export-schema | jq 'length'` 返回 ≥ 17（P1+P2 命令数）
- [ ] `agent config export-schema --command users-add | jq -r '.[0].name'` = `users-add`
- [ ] `agent config export-schema --format openai | jq '.[0].type'` = `function`
- [ ] schema 中每个 option 都有 `type` / `description`
- [ ] `agent config show | jq 'has("anthropic_api_key")'` = true（key 存在；value redacted）

**风险**：JSON schema 与 zod schema 重叠 — Phase 3 已有 `agent tools export-schema` 用 zod-to-json-schema。本 task schema 是「CLI 命令 → 给 LLM 看的工具表」，输入空间大（free-form text + path），不强求严格 JSON Schema。简化版即可。

---

### Task 4 — Output mode + 全局 `--dry-run` + `--non-interactive`

**目标**：CLI 跨命令 cross-cutting 行为统一。

**步骤**：
- [ ] 4.1 写 `cli/output/mode.ts`：`outputMode(): "tty" | "json"`，规则：`process.stdout.isTTY === false || process.env.CI === "true" || flags.output === "json" → "json"`；否则 `"tty"`
- [ ] 4.2 改 GLOBAL_OPTIONS 加 `--output` / `--dry-run` / `--non-interactive` / `--no-color`
- [ ] 4.3 `cmd.ts` 入口：解析全局 flag → 注入 context（用 yargs `.middleware()` 或全局变量都行；选最低改动方式）
- [ ] 4.4 P1 命令 handler 检查 context.dryRun / context.nonInteractive，未实现 dry-run 的命令在 dryRun=true 时打印 warning「not applicable」继续运行
- [ ] 4.5 任何 `inquirer.prompt` / `process.stdin` 调用：non-interactive 时直接退 exit 2

**测试项**：
- [ ] `agent users list | cat` 输出 JSON（non-TTY 自动）
- [ ] `agent users list` 直接 terminal 输出 table（TTY 默认）
- [ ] `CI=true agent users list` 输出 JSON
- [ ] `agent users add --username x --role admin --non-interactive` 缺 `--password` 时 exit 2 with `Missing required: --password`（而不是 prompt）
- [ ] `agent users list --dry-run` 输出 warning + 列表正常

**风险**：opencode 内部 `inquirer` 调用点散布；需要 grep 全部 stdin 入口确认没有遗漏。

---

### Task 5 — Exit codes + ERRORS.md

**目标**：errors 集中 + 用户面文档完整。

**步骤**：
- [ ] 5.1 写 `cli/errors/codes.ts`：`export const ExitCode = { SUCCESS: 0, GENERAL: 1, USAGE: 2, AUTH: 3, QUOTA: 4, TIMEOUT: 5, NETWORK: 6, CONTENT_FILTER: 10 } as const`；不为 130 命名（auto from SIGINT）
- [ ] 5.2 写 `cli/errors/router.ts`：`router(err: unknown): ExitCode` 映射规则（NamedError 名 → 码、Effect Cause 是 Interrupt → 130（fall-through, OS 处理）、network errno → 6 等）
- [ ] 5.3 P1 命令 handler 改用 `process.exit(router(err))`；删 `process.exitCode = 1`
- [ ] 5.4 加 `cli/cmd.ts` 顶层 `process.on("SIGINT", ...)` confirm exit 130
- [ ] 5.5 写 `ERRORS.md`（仓库根）：
   - 每个 P1 命令一节
   - 每节列：场景 / message / exit code
   - 末尾加「Exit Code Reference」全表
- [ ] 5.6 `agent --version` / `agent help` exit 0

**测试项**：
- [ ] `agent users add` （无 args）→ exit 2 + `Missing required: --username`（USAGE）
- [ ] `agent oss put missing-file` → exit 1 + path-not-found message（GENERAL）
- [ ] `agent run "say hi"` 缺 ANTHROPIC_API_KEY → exit 3 (AUTH)
- [ ] `Ctrl-C` 进行中的 `agent run` → exit 130
- [ ] `ERRORS.md` 每 P1 命令至少 3 条错误场景；每行有 exit code

**风险**：opencode 内部错误形态丰富（`Provider.ModelNotFoundError`、`AuthFailed`、`NamedError.Unknown` 等）；router 映射要覆盖主要类型，不能 catch-all 1。

---

### Task 6 — SKILL.md（仓库根）

**目标**：另一 Claude Code session 读 SKILL.md 立刻能调 agent。

**步骤**：
- [ ] 6.1 写 SKILL.md，章节：
   - 概述（一句话定位）
   - 安装：`bunx agent` / 仓库本地 `bun install:all && bun --cwd agent run dev`
   - Quick-start：`agent run "say hi"`、`agent tools list`、`agent skills list`、`agent oss list`、`agent config export-schema | head -50`
   - 输出模式：TTY/JSON 切换、`--output json`、`CI=true` 自动
   - 错误处理：链接 ERRORS.md，提示 9 个 exit code
   - Agent-native 用法：`agent config export-schema --format openai > tools.json` → 用作 LLM tool list
   - 常见 env：链接 .env.example
   - 链接：主 spec、ERRORS.md
- [ ] 6.2 跑 markdownlint 通过（spec 没要求，但避免 git 噪音）
- [ ] 6.3 用「fresh subagent」读 SKILL.md，执行 quick-start：要求所有命令 exit 0 / 非空输出

**测试项**：
- [ ] SKILL.md 每个 quick-start 命令能在干净 shell 里运行
- [ ] 对照 spec § 10 验收 #4：「另一 Claude Code session 直接读懂」— 用 fresh subagent 验证

**风险**：文档过期 — 后续 phase（如有）改 CLI 后须同步 SKILL.md。本 plan 不解决；spec § 11.5 commit 纪律已涵盖。

---

### Task 7 — Bun bundle 单二进制 + cold start 测试

**目标**：`agent/dist/agent.mjs` 单文件 ≤ 30MB，cold start ≤ 100ms。

**步骤**：
- [ ] 7.1 写 `agent/build.ts`：调 `Bun.build({ entrypoints: ["packages/opencode/src/index.ts"], target: "bun", outdir: "dist", external: ["better-sqlite3", "bcryptjs", ...native list] })`
- [ ] 7.2 在 `agent/package.json` 加 `"build": "bun run build.ts"`
- [ ] 7.3 加 `agent/.gitignore`: `dist/`
- [ ] 7.4 写 `bun --cwd agent run build` 验证 single .mjs 产出
- [ ] 7.5 size check: `du -h agent/dist/agent.mjs` 必 ≤ 30MB
- [ ] 7.6 cold start: `hyperfine --warmup 0 --runs 5 'bun agent/dist/agent.mjs --version'` min ≤ 100ms
- [ ] 7.7 functional smoke: `bun agent/dist/agent.mjs run "say hi"` 跑通（用 .env 现有凭据）
- [ ] 7.8 加根 `package.json` script `agent:build` / `agent:size`

**测试项**：
- [ ] `du -b agent/dist/agent.mjs` 输出 ≤ 30 * 1024 * 1024
- [ ] `hyperfine` min ≤ 100
- [ ] `bun agent/dist/agent.mjs --help` exit 0、命令树完整
- [ ] `bun agent/dist/agent.mjs config export-schema | jq 'length'` ≥ 17

**风险**：Bun bundle 与某些 dynamic import 不兼容（Effect runtime / drizzle 内部 `require`）。Mitigation：试 `--target=bun` 失败时 fallback `--target=node` + 标 native external。最坏情况 30MB 超标 — spec § 13.4 已留 fallback 路径（放弃单二进制约束，回 Node + 全量依赖）。

---

### Task 8 — 移除 `legacy/`（用户 gate）

**目标**：spec § 10 字面 — 删除 legacy/ 目录。

**前置 gate**：完成 task 1-7 后，向用户报告 task 1-7 全绿；**等用户口头/打字确认 OK 才执行 git rm**。

**步骤**：
- [ ] 8.1 等待用户确认（不自动执行）
- [ ] 8.2 grep `legacy/` 在所有非 legacy 的 .md / .ts 文件中的引用
- [ ] 8.3 修主 README.md / CLAUDE.md / 主 spec § 3 物理结构 / § 附录 A 引用：移除 legacy 行
- [ ] 8.4 `git rm -r legacy/`
- [ ] 8.5 跑 `bun install:all` / `bun --cwd agent run typecheck` / `bun --cwd web run build` 全绿
- [ ] 8.6 spec § 14 「不在本 spec 范围」加一行「legacy/ 已于 Phase 6 移除」（或 § 15 修订条目记录）

**测试项**：
- [ ] `find legacy -type f` 空（目录已删）
- [ ] `bun install:all` 0 errors
- [ ] `bun --cwd agent run typecheck` 0 errors
- [ ] `bun --cwd web run build` 0 errors
- [ ] `git status` 干净（除 commit pending）

**风险**：legacy/ 内可能有未发现的引用（symlink / build script）。Mitigation：8.2 全文搜索；如有遗漏由 8.5 typecheck 兜底。

---

## 3. 全 Phase 测试 / 验收映射

| Spec § 10 验收项 | 由 Task 兑现 | 验证方式 |
|---|---|---|
| 1. 外部 agent 用 `agent config export-schema` 拿到完整 tool schema 能直接接入 | Task 3 + Task 6 | export-schema 输出 ≥ 17 命令、Anthropic + OpenAI 双格式；fresh subagent 拿 schema 跑 quick-start |
| 2. 单二进制 ≤ 30MB, cold start ≤ 100ms | Task 7 | `du` + `hyperfine` |
| 3. ERRORS.md 每错误场景都有匹配实现 | Task 5 | 抽 5 条错误手动触发，对照 ERRORS.md 预测 message + exit code |
| 4. SKILL.md 可被另一 Claude Code session 直接读懂使用 | Task 6 | fresh subagent 读 SKILL.md 后跑 quick-start，全 0 退出 |
| 5. legacy/ 被移除后构建 / 测试 / 部署不受影响 | Task 8 | typecheck + build + test 全绿 |

5/5 acceptance items 必须全 PASS 才能写 verification report 并关 phase。

---

## 4. 风险登记

| ID | 风险 | 触发条件 | 处置 |
|---|---|---|---|
| R1 | OptionDef adapter 与 yargs 行为偏差（subcmd 选项继承等）| Task 2 重构后某 P1 命令 smoke 失败 | adapter 加 yargs `extra: Options` 逃生口；如仍失败回退该命令 yargs 原生写法，scope 缩到 P1 子集 |
| R2 | Bun bundle 与 native dep 不兼容（better-sqlite3 / bcryptjs）| Task 7.4 build 失败 | 全部 native 标 `external`，依赖 Bun runtime resolve；最坏 fallback Node + ncc / esbuild |
| R3 | cold start ≤ 100ms 达不到 | Task 7.6 hyperfine min > 100 | spec § 13.4 字面允许「放弃单二进制约束，回 Node + 全量依赖」；走 § 15 修订流程记录 |
| R4 | size ≤ 30MB 达不到 | Task 7.5 `du` > 30 \* 1024 \* 1024 | 同 R3 fallback |
| R5 | legacy 移除后某未发现引用导致 build 失败 | Task 8.5 typecheck/build fail | grep 全文 + 跑 typecheck/build；保持 commit 原子化便于 revert |
| R6 | ERRORS.md 漏覆盖某错误场景 | Task 5.6 抽样测试发现 message 与代码不一致 | 在 task 5 内迭代；接受 «最佳努力» 不要求 100% 穷举 |
| R7 | export-schema 与 LLM 实际期望格式微差 | 验收 #1 fresh subagent 拿 schema 跑命令报 schema-mismatch | 对齐 Anthropic tools API doc + OpenAI function call doc 字面 |
| R8 | 用户拒绝删 legacy/（task 8 gate） | 用户回 NO | 跳过 task 8，spec § 14 加注「legacy/ 暂留」；其他 task 不受影响 |
| R9 | 推广 `--dry-run` 到所有命令时某些命令无法 dry-run（如 `serve`）| Task 4.4 实现时发现 | 0.21 决策：read-only / 启动型命令打印 warning + 继续；不退出 |

---

## 5. 不在本 phase 范围（防 scope creep）

- ❌ Phase 5 § 6 deferred polish：atomic tools 自动写 business_asset / SSE Next.js proxy / `/auth/refresh` 端点 + WebUI cookie bootstrap / session-route ownership check / skill loader scope-guard / TLS / mobile polish — 这些不在 spec § 10 Phase 6 范围；如要做，走 § 15 修订记录新增 Phase 7 或独立 polish phase
- ❌ Web 端任何改动（除 task 8 移除 legacy 引用）— Phase 6 是 CLI phase，web/ 留 Phase 5 状态
- ❌ 引入新 atomic tool / 新 skill — 跨 phase 接口稳定（spec § 11.4）
- ❌ DB schema 改动 — 同上
- ❌ 部署 / CI / Infra — spec § 14 字面排除
- ❌ 多 OS 单二进制（Linux/Mac/Windows 三平台）— task 7 只产 macOS .mjs；如需多平台走单独 phase

---

## 6. 操作纪律

- task 间严格串行；每个 task 跑 subagent-driven (implementer + spec-review + code-review)
- 每个 task 完成 → atomic commit + push origin/main（CLAUDE.md trunk-based）
- task 8 前向用户报告 task 1-7 完整状态、明确请求 «删 legacy/ 的口头确认»，等回复
- 完 task 8 后跑全 phase code-review，写 `phase-6-cli-polish-verification.md`，对 5 项验收逐条勾选；commit + push + `/compact` 才算关 phase
- 任何 spec 没覆盖的情况停下问用户（CLAUDE.md § 红线）

---

## 7. 完成定义

- [ ] task 1-8 全部 PASS（含 task 8 用户 confirm）
- [ ] 5/5 acceptance items 验证通过
- [ ] `phase-6-cli-polish-verification.md` 写完
- [ ] 全部 commit push 到 origin/main
- [ ] superpowers:code-reviewer 全 phase review 跑过；MUST FIX 全部应用
- [ ] `/compact`

到此 spec § 10 字面定义的 Phase 0 → Phase 6 全 phase 闭环。后续 polish 走 spec § 15 修订流程。

---

## 8. Audit results — CLI surface (Task 1.1 output)

> Source: `agent/packages/opencode/src/cli/cmd/*.ts` walk on 2026-04-30. Classified per § 0.18.
>
> Format per row: subcommand · option flag → yargs type (R = required) · note. Parent commands (e.g. `users <command>`) only do `.command(...).demandCommand()` — no own options — so they're omitted. Only leaf cmd options listed.

### P1 — agent-facing, must adopt OptionDef in Task 2

| Cmd | Subcmd | Options | Notes |
|---|---|---|---|
| `users` | `add` | `--username` string R · `--role` enum(admin,creator) R · `--password` string · `--dry-run` boolean | canonical reference; uses `choices` (extra escape hatch) |
| `users` | `list` | (none) | read-only |
| `users` | `passwd` | `--username` string R · `--password` string R · `--dry-run` boolean | |
| `users` | `delete` | `--username` string R | |
| `tools` | `list` | `--verbose` boolean | read-only |
| `tools` | `show <id>` | positional `id` string R | read-only |
| `tools` | `call <id>` | positional `id` R · `--json` string · `--params-file` string · `--output` enum(raw,url,json) default `raw` | mutating-ish; reads stdin |
| `tools` | `export-schema [id]` | positional `id` string | read-only |
| `skills` | `add` | `--name` R · `--description` R · `--content-file` · `--content-url` · `--langfuse-prompt-key` · `--label` default `production` · `--scope` enum(system,creator) default `system` · `--enabled` boolean default true · `--dry-run` boolean | content source mutually-exclusive enforced in handler |
| `skills` | `update` | `--name` R · plus optionals: `--description` `--content-file` `--content-url` `--label` `--scope` `--enabled` `--dry-run` | |
| `skills` | `delete` | `--name` R | |
| `skills` | `list` | `--scope` enum · `--enabled-only` boolean default false · `--output` enum(text,json) default text | read-only |
| `skills` | `enable` | `--name` R | |
| `skills` | `disable` | `--name` R | |
| `skills` | `show <name>` | positional `name` R · `--output` enum(text,json) default text | |
| `skills` | `export-schema` | (none) | |
| `oss` | `put <local> <key>` | both positional R | |
| `oss` | `get <key> <local>` | both positional R | |
| `oss` | `list [prefix]` | positional `prefix` · `--max-keys` number default 100 · alias `ls` | |
| `run` | `[message..]` | 16 options: `--command` `--continue/-c` `--session/-s` `--fork` `--share` `--model/-m` `--agent` `--format` enum default · `--file/-f` array · `--title` · `--attach` · `--password/-p` · `--dir` · `--port` number · `--variant` · `--thinking` boolean default false · `--dangerously-skip-permissions` boolean default false | largest surface; aliases via `extra.alias` in OptionDef |
| `serve` |  | `withNetworkOptions(...)` (`cli/network.ts`) | shared helper — keep as group |
| `models` | `[provider]` | positional `provider` · `--verbose` boolean · `--refresh` boolean | |

**P1 count: 7 cmd groups** — `users` `tools` `skills` `oss` `run` `serve` `models` (matches plan § 0.18).

### P2 — keep yargs native, no OptionDef migration

| Cmd | Reason |
|---|---|
| `account` (login/logout/switch/orgs/open/console) | upstream auth flow, dev-time |
| `agent` (create) | upstream agent scaffold |
| `cmd` (helper, not exposed) | internal `cmd()` factory at `cli/cmd/cmd.ts` |
| `db` (`$0` query / `path`) | dev-time SQL shell |
| `export [sessionID]` | session export |
| `generate` | code-gen helper |
| `github` (install/run) | CI agent |
| `import <file>` | session import |
| `mcp` (list/auth/auth list/logout/add/debug) | MCP transport mgmt |
| `pr <number>` | PR checkout |
| `providers` (list/login/logout) | upstream auth |
| `session` (delete/list) | session admin |
| `stats` | usage report |
| `uninstall` | installer |
| `upgrade [target]` | installer |
| `web` | dev server |
| `plug` (`plugin <module>`) | plugin install |

**P2 count: 17 commands.**

### P3 — hidden / internal

- `debug` (sub-tools at `cmd/debug/*.ts`: `agent`, `config`, `file`, `lsp`, `ripgrep`, `scrap`, `skill`, `snapshot`, `startup`) — diagnostics; not exported in agent schema.

**P3 count: 1 (with 9 sub-debug commands).**

### Globals already present at root (`src/index.ts`)

`--print-logs` boolean · `--log-level` enum(DEBUG,INFO,WARN,ERROR) · `--pure` boolean · `--help`/`-h` · `--version`/`-v`.

Task 4 will add `--api-key` `--base-url` `--output` `--timeout` `--quiet` `--verbose` `--no-color` `--dry-run` `--non-interactive` per § 0.18 GLOBAL_OPTIONS — deferred until then to avoid touching root entry in Task 1.
