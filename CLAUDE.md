# Assets-Produce Agent Platform

## 这是什么

基于 opencode 改造的 agent-native 视频/漫画/立绘等多形态素材生产平台。
Agent 既是 CLI（外部 agent 黑盒入口），又是 WebUI 后端（创作者交互）。

> **必读**：完整设计在 [`docs/superpowers/specs/2026-04-29-assets-produce-spec.md`](docs/superpowers/specs/2026-04-29-assets-produce-spec.md)。本文件只列出每次 session 需要立即遵守的规则。

---

## 物理结构

```
legacy/                       旧 Agent Forge（参考用，不维护、不部署、不测试）
agent/                        opencode 改造的 agent + CLI 基座
web/                          创作者工作台（Next.js + shadcn/ui）
cli-example/                  MiniMax-AI/cli（设计参考，不维护）
docs/superpowers/specs/       主 spec + phase plans + verification reports
```

---

## 核心架构原则（不可妥协）

1. **原子能力 + skill 编排** — 禁硬编码视频流水线 service
2. **SKILL/CLI/MCP/API 四层** — SKILL 在 Langfuse、CLI 在 `agent/` binary、Tool 在 opencode 工具表、API 在 FC/OSS/Langfuse
3. **WebUI = 受限 CLI 包装** — 不实现独立业务逻辑，强制 `profile=creator`
4. **Skill body 在 Langfuse** — 本地只存 metadata，仓库内禁止散落 markdown skill 文件

详见 [spec § 2](docs/superpowers/specs/2026-04-29-assets-produce-spec.md)。

---

## 工作流（每次进 phase 必读）

### 进入新 phase 时

1. 读 [主 spec](docs/superpowers/specs/2026-04-29-assets-produce-spec.md) 对应 phase 章节
2. 在 `docs/superpowers/specs/phase-N-<slug>-plan.md` 写详细计划 + 测试项
   - **不写代码 / 伪代码 / 任何实现**
   - 内容：步骤拆解 + 每步预计输出 + 详细测试项 + 风险点
   - **不需要等用户审核，写完直接执行**
3. 执行
4. 完成时跑通**所有验收项**

### 完成 phase 后必须做的事（缺一不可）

- ✅ 跑通所有验收项
- ✅ 写 `docs/superpowers/specs/phase-N-<slug>-verification.md`，逐条对验收项打勾或解释偏差
- ✅ commit 并 push 到 main
- ✅ 跑 `superpowers:code-reviewer`
- ✅ **运行 `/compact` 压缩 context**
- ✅ 才能进入下一 phase 的 plan 撰写

### 遇到 spec 没覆盖的情况

1. **停下来问用户**，不擅自决定
2. 收到答复后更新 spec（在 § 15 修订记录加条目）
3. 才能继续

---

## 红线（违反 = 错误）

- ❌ 不写硬编码视频流水线 service（任何 `*-orchestration` / `*-coordination` / `*-workflow-service` 命名都嫌疑）
- ❌ 不让 skill body 散落在仓库 markdown 文件
- ❌ 不在 WebUI 实现独立业务逻辑
- ❌ 不混淆 `creator` / `developer` permission profile
- ❌ 不在没写 phase plan 前直接动代码
- ❌ 不在 phase 之间跳过 `/compact` 或 verification report
- ❌ 不偏离 spec（要偏走 § 15 修订流程）

---

## 关键约定速查

### Provider
- LLM 主脑：Claude（开 prompt cache）
- LLM fallback / 国产合规：DeepSeek
- 媒体：DashScope / OpenAI Image / Wan / happyhorse

### Skill 边界（判断公式）
- 影响"模型决策" → skill
- 影响"系统执行" → 代码或 config
- 流程 / playbook / prompt 模板 / 领域知识 / 业务规则 → skill
- API key / DB schema / 模型选型 / 运行时状态 → 代码 / config / storage

### Skill scope
- `system`（CLI 创建默认）：WebUI 不可见
- `creator`（WebUI 创建默认）：所有创作者可见
- 加 `--scope creator` 强制 CLI 创建的 skill 可见

### Langfuse
- project: `assets-produce`
- base url: `https://prompt.mobai-game.com`
- skill body 命名空间：`skill_<name>`

### Permission Profiles
- `developer`：CLI / TUI / 外部 agent — 全部工具
- `creator`：WebUI — 受限子集（无 skill 管理 / config / shell / debug）

### 命名约定
- skill name：`snake_case`
- CLI 命令：`kebab-case`
- entity（drizzle）：`PascalCase`
- 文件：`kebab-case.ts`

---

## Git 协作

依据全局 CLAUDE.md（`~/.claude/CLAUDE.md`）：

- **Atomic commits**：每次提交一件事
- **Trunk-based**：直接在 main 工作，不开 feature branch（除非用户明确要求）
- **No PR**：不开 PR，不 push feature branch
- **Push 频繁**：每个 atomic commit（或一组小 commit）后 push 到 origin/main
- **完成 phase 必须 commit + push**

---

## 端口 / 环境

- agent server: 8001（env `AGENT_PORT`）
- web dev: 3000
- 配置文件：`.env`（不入 git）+ `.env.example`（入 git，所有字段）
- Langfuse 凭据已在用户环境配置好，从全局 env 注入

---

## 索引

- [主 Spec](docs/superpowers/specs/2026-04-29-assets-produce-spec.md)
- 全局 CLAUDE.md（用户级）：`~/.claude/CLAUDE.md`（SKILL/CLI/MCP/API 四层哲学详述）
- 当前 phase plan：`docs/superpowers/specs/phase-N-*-plan.md`（进入 phase 时由 Claude Code 创建）
- 当前 phase verification：`docs/superpowers/specs/phase-N-*-verification.md`（完成 phase 时由 Claude Code 创建）
