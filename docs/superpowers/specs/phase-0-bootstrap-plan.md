# Phase 0 — Bootstrap 计划

> 对应主 spec：[`2026-04-29-assets-produce-spec.md`](2026-04-29-assets-produce-spec.md) § 10 Phase 0
> 工作流参考：spec § 11

> **执行期修订(spec § 15 / 1.1)**:落盘后确认 opencode upstream 是 Bun-only。根工具链改为 Bun(`packageManager: bun@1.3.13`)、workspace 声明在根 `package.json` 内,**不写 `pnpm-workspace.yaml`**。下文 Step 7/8/11 涉及 pnpm 的字句以此修订为准。

## 1. 目标（重申）

仓库物理结构就位：
- 旧 Agent Forge 全量进 `legacy/`
- opencode（dev 分支）落 `agent/`
- MiniMax-AI/cli 落 `cli-example/`
- `web/` 留空骨架
- 根 `package.json` / `pnpm-workspace.yaml` / `README.md` / `.gitignore` 重写
- 根 `pnpm install` 跑通；`legacy/` / `cli-example/` 不进 workspace

**显式不做**：opencode 内部任何修改、业务代码、UI、Phase 1 砍包动作。

## 2. 范围分解

### 2.1 当前根目录分类

**保留在根**（不动）：
- `.git/`
- `CLAUDE.md`（新 project 指令，6f239ff 刚提交）
- `docs/superpowers/`（新 spec 所在）

**全部进 `legacy/`**（旧 Agent Forge 残留）：
- 所有顶层文件：`.dockerignore`、`.env`、`.env.example`、`AGENTS.md`、`Dockerfile`、`docker-compose.*.yml`、`eslint.config.mjs`、`next-env.d.ts`、`next.config.ts`、`nginx.conf`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`postcss.config.mjs`、`test-system-prompt.ts`、`test.json`、`tsconfig.cli.json`、`tsconfig.json`
- 所有顶层目录：`FC/`、`deploy/`、`prisma/`、`scripts/`、`src/`、`db/`、`skills/`
- `docs/` 下除 `superpowers/` 外的全部内容：`ROADMAP.md`、`api-playbook.md`、`cli.md`、`content-null-investigation.md`、`dataflow.md`、`fc-development-guide.md`、`fixes/`、`main-branch-protection.md`、`skills-api-quick-reference.md`、`useCase/`

**直接删除**（运行时垃圾，不进 git，不进 legacy）：
- `.next/`、`node_modules/`、`temp/`、`dev.pid`、`.DS_Store`

**根需要重写（不复用旧版）**：
- `.gitignore`（旧版有大量 next.js / FC / prisma 特化条目，整体不再适用）
- `package.json`（旧 agent-forge 版，根改为 monorepo 占位）
- `pnpm-workspace.yaml`（旧版只声明 builtDependencies，需改成 workspace 包列表）

### 2.2 待落盘的新结构

```
/
├── .git/
├── .gitignore                  ← 重写
├── CLAUDE.md                   ← 已有（保留）
├── README.md                   ← 新建（仅指向 spec + 简介）
├── package.json                ← 重写（monorepo 根，private、name=assets-produce、scripts 留空）
├── pnpm-workspace.yaml         ← 重写
├── docs/
│   └── superpowers/            ← 已有（保留）
│       └── specs/
│           ├── 2026-04-29-assets-produce-spec.md
│           └── phase-0-bootstrap-plan.md  ← 本文件
├── legacy/                     ← 旧 Agent Forge 全量
├── agent/                      ← clone sst/opencode dev 分支（删 .git）
├── cli-example/                ← clone MiniMax-AI/cli（删 .git）
└── web/                        ← 空骨架（仅 README.md 占位）
```

## 3. 步骤拆解

每步：**动作 → 预计输出 → 自检方法**。

### Step 1 — Pre-flight check
- 动作：确认在 `/Users/Clock/moonshort/assets-produce`；确认 `git status` 仅有已知 untracked（db/、scripts/*.js、skills/）；确认 HEAD = `6f239ff`。
- 预计输出：无文件变化，仅命令打印。
- 自检：`pwd` 命中目标；`git rev-parse HEAD` = `6f239ff`；`git status --short` 输出列表与开工提示一致。
- 风险：若用户在 session 间动过文件，状态可能漂移 → 此时停下问。

### Step 2 — 删除运行时垃圾
- 动作：`rm -rf` 掉 `.next`、`node_modules`、`temp`、`dev.pid`、`.DS_Store`（仅根级）。
- 预计输出：上述路径不再存在。
- 自检：`ls -la` 不出现这些；`du -sh .` 显著减小（旧 node_modules 数百 MB）。
- 风险：误删 `.git`/`docs` → 通过逐项明确路径规避，不用通配。

### Step 3 — 创建 `legacy/` 并搬运旧 Agent Forge 全量
- 子步骤 3a：`mkdir legacy`
- 子步骤 3b：用 `git mv` 搬已 tracked 的顶层文件（保留 history）：
  - 文件：`.dockerignore`、`.env.example`、`AGENTS.md`、`Dockerfile`、`docker-compose.dev.yml`、`docker-compose.prod.yml`、`eslint.config.mjs`、`next-env.d.ts`、`next.config.ts`、`nginx.conf`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`postcss.config.mjs`、`test-system-prompt.ts`、`test.json`、`tsconfig.cli.json`、`tsconfig.json`
  - 目录：`FC`、`deploy`、`prisma`、`src`
- 子步骤 3c：用 `git mv` 把 `docs/` 下旧文档搬进 `legacy/docs/`（保留 superpowers 在原位）：
  - `docs/ROADMAP.md`、`docs/api-playbook.md`、`docs/cli.md`、`docs/content-null-investigation.md`、`docs/dataflow.md`、`docs/fc-development-guide.md`、`docs/fixes/`、`docs/main-branch-protection.md`、`docs/skills-api-quick-reference.md`、`docs/useCase/`
- 子步骤 3d：用普通 `mv` 搬 untracked 的（无 git history 可保）：`db/`、`scripts/`、`skills/`
- 子步骤 3e：搬 `.env`（含 secrets，未 tracked）—— 用普通 `mv` 进 `legacy/.env`，**不入 git**（新 `.gitignore` 必须挡）
- 子步骤 3f：搬旧 `.gitignore` —— 重命名为 `legacy/.gitignore`（保留旧规则供参考；根重写）
- 预计输出：根只剩 `.git`、`CLAUDE.md`、`docs/`、`legacy/`；`legacy/` 内是旧仓快照
- 自检：
  - `ls -A` 根：仅 `.git CLAUDE.md docs legacy`
  - `ls legacy/` 含上述全部条目
  - `git status --short` 大量 `R` 重命名条目 + 少量 `A` 新增（untracked → legacy/）
  - `cat legacy/CLAUDE.md` 应失败（CLAUDE.md 留在根，不该被搬）
- 风险：
  - 漏搬某个文件 → 步骤完后 `ls -A` 严格核对清单
  - `git mv` 在文件多时 rename 检测可能失败；若 git status 看不到 R，需 `git add -A` 强制 git 自己识别
  - `.env` 含 secrets，搬动过程中防止 echo 内容到日志

### Step 4 — Clone opencode 到 `agent/`
- 动作：`git clone --depth 1 --branch dev https://github.com/sst/opencode.git agent`，然后 `rm -rf agent/.git`
- 预计输出：`agent/` 下是 opencode 源码；无独立 `.git`
- 自检：
  - `ls agent/` 至少有 `package.json`
  - `cat agent/package.json | head` 显示 opencode metadata
  - `git -C agent status` 报错（不是 git repo）
  - 在主仓 `git status` 中 `agent/` 出现为大量新增文件
- 风险：
  - opencode 仓库默认分支可能不是 `dev`（spec 注明用 dev） → `--branch dev` 显式拉；若失败回退到默认分支并在 § 15 加修订
  - opencode 是 monorepo（packages/* 结构）—— Phase 0 不修改、不 build，仅落盘
  - 网络问题 → 失败时报错，不静默继续

### Step 5 — Clone MiniMax-AI/cli 到 `cli-example/`
- 动作：`git clone --depth 1 https://github.com/MiniMax-AI/cli.git cli-example`，然后 `rm -rf cli-example/.git`
- 预计输出：`cli-example/` 下是 MiniMax CLI 源码；无独立 `.git`
- 自检：`ls cli-example/` 非空；`git -C cli-example status` 报错
- 风险：仓库可能 rename → 失败时停下问用户确认正确路径

### Step 6 — 创建 `web/` 空骨架
- 动作：`mkdir web`；写 `web/README.md`（一句话占位 + 指向 spec § 7）
- 预计输出：`web/` 仅含一个 README.md
- 自检：`ls web/` 仅显示 `README.md`

### Step 7 — 写根 `package.json`
- 动作：写最小 monorepo 根 package.json
- 内容要点（不写代码,只描述字段）：
  - `name`: `assets-produce`
  - `version`: `0.1.0`
  - `private`: true
  - `packageManager`: 与 opencode 上游一致（在 Step 4 落盘后查 `agent/package.json` 决定，Bun 项目通常用 `bun@x.y.z` 或 `pnpm@x.y.z`）
  - `workspaces`: 不在此声明（pnpm 用 `pnpm-workspace.yaml`）
  - `scripts`: 留 `{}` 空对象（具体 script Phase 1 起逐步加）
  - 无任何 dependencies / devDependencies
- 预计输出：根 `package.json` ≤ 15 行
- 自检：`node -e "JSON.parse(require('fs').readFileSync('package.json'))"` 无错；字段满足上面要点
- 风险：包管理器选错 → 在 Step 4 后再写此文件（依赖 opencode 实际配置），别凭记忆写

### Step 8 — 写根 `pnpm-workspace.yaml`
- 动作：根 workspace 列表
- 内容要点：
  - `packages` 包含：`agent`（如果 opencode 是单包）或 `agent/packages/*`（如果是 monorepo）— Step 4 落盘后查 `agent/pnpm-workspace.yaml` 决定
  - `packages` 包含：`web`
  - 显式排除：`legacy`、`cli-example`（用 `!legacy`、`!cli-example` 模式，或简单不列出 — pnpm-workspace.yaml 默认只识别 `packages` 下的列出项，不写就不进）
- 预计输出：根 `pnpm-workspace.yaml`
- 自检：`pnpm -r exec ls` 列表不应包含 `legacy/` 或 `cli-example/`
- 风险：opencode 的 monorepo 结构未知 → 在 Step 4 完成后再决定 `agent` 或 `agent/packages/*`

### Step 9 — 写根 `.gitignore`
- 动作：写新 .gitignore
- 内容要点：
  - 通用：`node_modules/`、`.DS_Store`、`*.log`、`*.tsbuildinfo`、`.env`、`.env.local`、`.env.*.local`（保留 `!.env.example`）
  - 各 workspace 的 build/cache：`.next/`、`dist/`、`build/`、`.turbo/`、`.cache/`
  - opencode 可能用的：`.bun/`、`bun.lockb`（需 Step 4 后核实是否已存在）
  - legacy 子目录的运行时垃圾：`legacy/node_modules/`、`legacy/.next/`、`legacy/temp/`、`legacy/.env`（含 secrets，绝不入 git）
  - IDE 杂项：`.vscode/`、`.idea/`（按用户偏好可保留）
  - git worktree：`.agent-worktrees/`（保留旧规则）
- 预计输出：根 `.gitignore`
- 自检：
  - `git check-ignore -v legacy/.env` 命中规则
  - `git check-ignore -v node_modules/foo` 命中规则
  - `legacy/.env` 不出现在 `git status` 的待提交里

### Step 10 — 写根 `README.md`
- 动作：极简 README
- 内容要点：
  - 项目名 `assets-produce`
  - 一段话定位（agent-native 多形态素材生产平台）
  - 指向 [`CLAUDE.md`](CLAUDE.md) 和 [`docs/superpowers/specs/2026-04-29-assets-produce-spec.md`](docs/superpowers/specs/2026-04-29-assets-produce-spec.md)
  - 状态标注：Phase 0 bootstrap，不可用
- 预计输出：根 `README.md` ≤ 30 行
- 自检：链接路径相对正确

### Step 11 — `pnpm install` 验证
- 动作：根目录跑 `pnpm install`
- 预计输出：成功；不应进 `legacy/` 或 `cli-example/`；只装 `agent/` 和 `web/` 的依赖
- 自检：
  - 退出码 0
  - 没有 `legacy/node_modules/`、`cli-example/node_modules/` 被创建
  - 有 `agent/node_modules/`（如果 opencode 单包）或 `agent/packages/*/node_modules/`
- 风险：
  - opencode 上游可能要求特定 Node/Bun 版本 → 用 `cat agent/package.json` 查 `engines`，按需 `nvm use` / 装 Bun
  - 如有 native 依赖编译失败 → Phase 0 不解决，记录到 verification 偏差栏

### Step 12 — 验证 opencode 可执行
- 动作：尝试 `cd agent && bun run dev --help` 或等价命令（具体命令取决于 opencode CLI 入口，在 Step 4 后查 README）
- 预计输出：原生 opencode 帮助文本
- 自检：退出码 0；输出含命令树
- 风险：
  - 上游 dev 分支可能不稳定 / 缺依赖 → 改试 `bun --bun packages/opencode/src/index.ts --help` 之类候选；记录实际 working command
  - 如完全跑不通 → 停下问用户是否换分支（按 § 11.3 流程）

### Step 13 — Atomic commits + push
- 提交策略（按 atomic commits 原则,拆 N 笔）：
  1. `chore: move legacy Agent Forge into legacy/` —— Step 3 全部
  2. `feat(agent): import opencode dev branch` —— Step 4
  3. `feat(cli-example): import MiniMax-AI/cli reference` —— Step 5
  4. `feat(web): scaffold empty workspace skeleton` —— Step 6
  5. `feat: configure pnpm monorepo root` —— Step 7 + Step 8 + Step 9 一起（这三者紧耦合）
  6. `docs: add root README pointing to spec` —— Step 10
- 每笔 commit 后 push 到 `origin/main`（按全局 CLAUDE.md：push 频繁）
- 自检：每笔 commit `git show --stat` 仅含本次范围；`git push` 成功
- 风险：
  - opencode 单笔提交体积巨大（数千文件）→ 接受，不拆；commit message 注明来源
  - push 失败（认证）→ 停下问

### Step 14 — 写 verification report
- 动作：写 `docs/superpowers/specs/phase-0-bootstrap-verification.md`
- 内容：逐条对照 spec § 10 Phase 0 验收项打勾或记偏差
- 预计输出：md 文件
- 自检：每条验收项有命令 + 实际输出截选

### Step 15 — 跑 superpowers:code-reviewer
- 动作：以 Skill 调用 `superpowers:code-reviewer`，传当前 phase 计划 + 实际改动范围
- 预计输出：reviewer 反馈
- 处置：若 reviewer 指出阻断性问题 → 修；若是 Phase 1+ 才能解决的 → 记录到 verification 报告

### Step 16 — 通知用户 `/compact`
- 动作：在主对话给用户结束语
- 内容：「Phase 0 完成,请 `/compact` 后说『继续』,我进 Phase 1」

## 4. 验收项（来自 spec § 10 Phase 0）

| 验收项 | 测试命令 | 预计结果 |
|---|---|---|
| `cd agent && bun run dev --help` 跑通原生 opencode | `cd agent && bun run dev --help`（或等价命令） | 退出 0,显示 help |
| 根 `pnpm install` 成功 | `pnpm install` | 退出 0 |
| `legacy/` 不在 workspace | `ls legacy/node_modules` | 不存在 |
| `cli-example/` 不在 workspace | `ls cli-example/node_modules` | 不存在 |
| `git status` 干净 | `git status` | "nothing to commit" |

## 5. 风险点汇总

1. **opencode dev 分支结构未知** — 影响 Step 7/8/12。缓解：先做 Step 4 落盘后再写 Step 7/8;Step 12 失败时降级为「能跑某个等价命令」即可。
2. **opencode 包管理器假设** — 上游可能用 Bun（不是 pnpm）。缓解：根 `package.json` 选 packageManager 时跟随 opencode;若不一致,要么根改用 Bun workspace,要么 spec § 15 加修订。
3. **monorepo 嵌套** — opencode 自己是 monorepo,我们的根 workspace 又包含它。缓解:`packages: agent/packages/*` 把它的子包扁平到根 workspace,这是 pnpm 标准玩法。
4. **`.env` 误入 git** — Step 3e 移动期间。缓解:Step 9 先就位 `.gitignore` 也行,但顺序上 .gitignore 依赖 Step 4 拉到的 opencode 习惯条目。退而求其次:Step 3 完成后立刻 `git status` 核查 `.env` 在不在追踪列表,任何时刻发现 → 立即 `git rm --cached`。
5. **历史 push 推到错仓** — `upstream-rydia` 不是 push 目标。缓解:每次 `git push` 显式写 `git push origin main`。
6. **Step 13 大体积提交在网络上失败** — opencode 几千文件。缓解:接受,失败重试;如多次失败考虑分多个子 commit(但破坏 atomicity,需谨慎)。

## 6. 执行后衔接

完成 Step 16 后等用户 `/compact`,进 Phase 1 时:
- 读 spec § 10 Phase 1
- 写 `phase-1-base-trim-plan.md`
- 开始砍 opencode 包

不在本 phase 做的事(显式声明,避免 scope creep):
- 砍 opencode 包 → Phase 1
- 重命名 binary `opencode` → `agent` → Phase 1
- 装 drizzle / OSS / Langfuse / LLM provider → Phase 2
- 任何 atomic tool → Phase 3
