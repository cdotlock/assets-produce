# Assets-Produce Agent Platform — Master Spec

**Version**: 1.0
**Date**: 2026-04-29
**Status**: Approved (brainstorming session 产出)
**Audience**: 所有未来在该仓库工作的 Claude Code session

---

## 1. 项目定位

**一句话**：基于 opencode 改造的 agent-native 多形态素材生产平台。Agent 既是 CLI（外部 agent 黑盒入口），又是 WebUI 后端（创作者交互）。

**为什么重写而非改造**：旧 Agent Forge 在 prompt 构造、context 管理、错误协议、tool 配对、provider 抽象、subagent 实现六个底层维度都偏离主流 agent 工程实践。修补成本超过重写成本，且修补无法解决"硬编码视频流水线 service"这种结构性过度设计。

**目标**：
1. 旧 Agent Forge 能做的视频生产能力，新版本一件不少（功能等价）
2. 架构精简：原子能力 + skill 编排，**不允许任何硬编码流水线**
3. 拓展自由度优先：未来加漫画、立绘集、广告、表情包等都不需要改代码
4. agent-native 双入口：CLI（黑盒）+ WebUI（创作者）共享一套底层

---

## 2. 核心架构原则（不可妥协，违反 = 错误）

### 原则 1：原子能力 + Skill 编排
- **底层**：atomic tools（生成图、生成视频、风格转换、拼接、裁剪、合成）
- **上层**：agent + skill 通过 LLM 推理组合 atomic tools
- **禁止**：在代码里写"小说→分镜→角色图→场景图→视频→拼接"这条特定流水线
- **理由**：旧 Agent Forge 的 `video-asset-generation-service` / `video-coordination-service` / `video-workflow-orchestration-service` 三层硬编码就是反例

### 原则 2：SKILL/CLI/MCP/API 四层

依据 `~/.claude/CLAUDE.md` 的全局四层哲学。在本项目落地为：

| 层 | 职责 | 在本项目中表现为 |
|---|---|---|
| SKILL | "How to think" — 流程知识、prompt 模板、领域知识、业务规则 | Langfuse 托管 |
| CLI | 外部 agent 黑盒入口、渐进发现 | `agent` binary（opencode 改造） |
| MCP/Tool | 原子能力 | atomic tools 注册到 opencode 工具表 |
| API | 底层调用面 | FC functions / OSS / Langfuse / DB |

跨层调用必须按方向（SKILL → CLI → Tool → API），不许逆向。

### 原则 3：WebUI = 受限 CLI 包装
- WebUI 不实现独立业务逻辑
- WebUI 调用底层 agent 时强制带 `profile=creator`，通过 opencode 的 permission ruleset 砍掉危险工具
- 创作者 web 端能做的事 = `creator` profile 工具集；CLI 用 `developer` profile 全权

### 原则 4：Skill body 在 Langfuse
- 本地 DB 只存 skill metadata（name / description / langfuse_prompt_key / scope / enabled）
- skill 正文（markdown）在 Langfuse（`prompt.mobai-game.com`，project=`assets-produce`）
- **仓库里禁止散落 markdown skill 文件**

---

## 3. 物理结构

```
cdotlock/assets-produce
├── legacy/                       旧 Agent Forge 全量（参考用，不维护、不部署、不测试）
├── agent/                        opencode 改造的 agent + CLI 基座（自成 Bun monorepo）
├── web/                          创作者工作台（Next.js + shadcn/ui）
├── cli-example/                  MiniMax-AI/cli（设计参考，不维护）
├── docs/superpowers/specs/       本 spec + phase plans + verification reports
├── CLAUDE.md                     项目级指令
├── README.md
├── package.json                  monorepo 根（Bun workspace, § 15 / 1.1, 1.2）
└── bun.lock
```

工作区配置（⚠ [§ 15 / 1.2](#15-修订记录)）：
- 根 `package.json` `workspaces: ["web"]`：仅 `web/` 是 root workspace 成员
- `agent/` 是独立 Bun monorepo（自带 catalog / patches / `bun.lock`），通过根脚本 `install:agent` / `install:all` 桥接
- `legacy/`、`cli-example/` 不在 workspace（不参与 install / build / test）

---

## 4. 业务核心 Entity（drizzle，6 张表）

精简自旧 Agent Forge 18 张表。**字段为草图**，详细字段在 Phase 2 phase plan 中定。

| Entity | 替代旧 entity | 说明 |
|---|---|---|
| `User` | User | auth + role（admin/creator） |
| `Project` | Novel + NovelScript + Episode | 通用项目 — type 区分（novel/manga/ad/preset_set/other） |
| `Asset` | KeyResource + KeyResourceVersion + ImageGeneration + ImageGenerationVersion + DomainResource | 单表 + type 字段（image/video/audio/script/metadata），版本通过 `parent_id` |
| `Skill` | Skill | metadata + langfuse_prompt_key + langfuse_label + scope（system/creator）+ enabled |
| `StylePreset` | StylePreset | 结构化风格预设（type=character/scene/overall） |
| `Task` | BatchGenerationTask + SubAgent + SubAgentEvent | 统一异步任务表 |

opencode 自带的 `Session` / `Message` / `Part` 不动。

**直接砍掉的旧 entity**（不迁移）：BizSchema / BizSchemaVersion / BizTableMapping（动态 schema 系统，过度设计）。

---

## 5. Skill 系统

### 5.1 Skill 边界

**应当放 skill 的**：
- 流程性知识 / playbook（"如何把一本小说做成视频"）
- prompt 模板 / 风格描述（"古风女主立绘 prompt 模板"）
- 领域知识 / 术语 / 美学（"镜头语言术语"、"色彩心理学"）
- 业务规则 / 约束（"广告项目合规清单"、"客户 X 偏好"）

**不应当放 skill 的**：
- 具体 tool 调用代码 → 归 tool 实现
- API key / 凭据 → 归 env / config
- DB schema / 字段 → 归 drizzle migration
- 模型选型 / 重试参数 → 归 config
- 运行时 session 状态 → 归 storage 层

**判断公式**：
- 改了它会影响"模型决策" → skill
- 改了它会影响"系统执行" → 代码 / config

### 5.2 存储拆分

**本地 DB（drizzle `skills` 表）只存 metadata**：
- `name`（unique）、`description`、`langfuse_prompt_key`、`langfuse_label`、`scope`、`enabled`、`created_at`、`updated_at`、`attachments`（OSS URL 列表）

**Langfuse 存 skill body**（markdown）：
- prompt name = `skill_<name>`（统一前缀）
- 编辑 / 版本 / A/B 全在 Langfuse Web UI 完成
- 切换 production / staging 通过 label 切换，不需要改代码

**加载时机**：
- agent 启动时只拉 enabled skill 的 name + description，注入 system prompt
- LLM 决定使用某个 skill 时，调 `skill <name>` tool 才从 Langfuse 拉正文塞进 context

### 5.3 三个 Import 入口

**CLI（外部 coding agent 用）**：

```bash
agent skills add --name novel-to-video \
                 --description "..." \
                 --content-file ./flow.md \
                 [--label production] [--scope system|creator]

agent skills add --name novel-to-video \
                 --description "..." \
                 --langfuse-prompt-key existing_key

agent skills add --name novel-to-video \
                 --description "..." \
                 --content-url https://...

agent skills update --name novel-to-video --content-file ./v2.md
agent skills delete --name novel-to-video
agent skills list [--enabled-only] [--scope creator]
agent skills enable --name ...
agent skills disable --name ...
agent skills export-schema [--command "skill <name>"]
```

CLI 创建的 skill 默认 `scope=system`（WebUI 不可见），可加 `--scope creator` 强制可见。

**WebUI（创作者用）**：
- list / enable / disable
- 「编辑内容」直接跳 Langfuse 对应 prompt 页（不做内置 markdown 编辑器）
- 只显示 `scope=creator AND enabled=true`

**HTTP API（其他业务集成）**：
- `POST /api/skills`、`PATCH /api/skills/:name`、`DELETE /api/skills/:name`、`GET /api/skills`

---

## 6. CLI 设计

### 6.1 双模式

| 模式 | 形态 | 适用场景 |
|---|---|---|
| chat-first | `agent run "..."` | 高层指令、外部 agent 走 NL |
| command-first | `agent <group> <verb> ...` | 已规划好的具体任务、需要确定性 |

两种模式共享底层 tools / skills / provider。

### 6.2 Agent-Native 标准（仿 MiniMax CLI）

| 设计点 | 要求 |
|---|---|
| 单 `OptionDef[]` 驱动 | 一处定义，自动派生 parser、tool schema、help |
| `agent config export-schema` | 输出 Anthropic/OpenAI 兼容 JSON tool schema（全部命令） |
| non-TTY 自动 JSON 输出 | piped 调用无需加 `--output json` |
| 全局 `--dry-run` | 任何命令都能打印 resolved request，不真实调用 |
| `--non-interactive` + `failIfMissing` | CI / agent 调用时不卡 stdin |
| 标准 exit code | 0 / 1 / 2 / 3 / 4 / 5 / 6 / 10 / 130 共 9 个（详见 `ERRORS.md`） |
| `ERRORS.md` 完整契约 | 每命令 × 每错误 → 精确文案 |
| `SKILL.md`（仓库根） | 让另一 Claude session 用 `npx skills add cdotlock/assets-produce -g` 直接装 |
| 单二进制（Bun bundle） | `agent/dist/agent.mjs`，cold start ≤ 100ms |

---

## 7. WebUI 设计

### 7.1 技术栈
- Next.js（App Router）+ shadcn/ui
- 接 opencode server SSE / WebSocket
- JWT auth

### 7.2 页面
- `/login`
- `/`（主 chat workspace，含 streaming + 中断）
- `/assets`（资产浏览，参考 legacy `ResourceDetailDrawer` / `ResourceDrawer` / `EpisodeList`）
- `/projects`（项目列表）
- `/skills`（skill 列表，仅 `scope=creator`，跳 Langfuse 编辑）

### 7.3 权限
- WebUI session 强制 `profile=creator`
- 不暴露 skill 管理 / config / shell / debug 工具

---

## 8. Provider 配置

### 8.1 LLM
- **主脑**：Claude（开 prompt cache）
- **fallback / 国产合规**：DeepSeek
- 其他 provider 走 AI SDK v6 抽象，加包即可（不在 Day 0 范围）

### 8.2 媒体
- DashScope（image）
- OpenAI Image
- Wan（video）
- happyhorse（Kling-style）

### 8.3 Langfuse
- project: `assets-produce`
- base url: `https://prompt.mobai-game.com`
- 凭据走 env

---

## 9. Auth & 权限

### 9.1 用户
- username / password / role（admin / creator）
- admin 通过 CLI 建用户（`agent users add ...`）
- 不接 SSO / OAuth（除非业务出现明确需求）

### 9.2 Permission Profiles

| Profile | 入口 | 工具集 |
|---|---|---|
| `developer` | CLI / TUI / 外部 agent | 全部工具 |
| `creator` | WebUI（强制） | 业务工具 + chat + 资产查询 + skill 调用。**砍**：skill 管理、config、shell、debug、跨用户查询 |

具体 ruleset 列表在 Phase 5 phase plan 中定。

---

## 10. Phase 划分

> 实施节奏：**Big Bang**——一次性把架构铺开，不做渐进改造。每 phase 完成后必须 commit + push + verification report + `/compact`，才能进下一 phase。

### Phase 0 — Bootstrap

**目标**：仓库物理结构就位。

**范围**：
- 移动当前 Agent Forge 全量到 `legacy/`
- clone opencode（dev 分支）到 `agent/`（暂不修改）
- clone MiniMax-AI/cli 到 `cli-example/`
- 起 `web/` 空骨架（仅一个 README，技术栈到 Phase 5 决定）
- 配 monorepo（`pnpm-workspace.yaml`）
- 写仓库根 `README.md`（指向本 spec）

**不做**：opencode 内部任何修改、业务代码、UI

**验收**：
- `cd agent && bun run dev --help`（或等价命令）能跑通原生 opencode
- 根 `bun install` 成功 ⚠ ([§ 15 修订 1.1](#15-修订记录))
- `legacy/` 不在 workspace（确认 `bun install` 不进 legacy）
- `cli-example/` 不在 workspace
- `git status` 干净

---

### Phase 1 — Base Trim

**目标**：opencode 砍干净，得到聚焦的 agent 基座。

**砍**：
- TUI 包（`packages/tui` 或类似）
- Tauri 桌面壳
- share / acp 协议层 ⚠ § 15 / 1.3：Phase 1 只砍 acp,share 因深度耦合 storage/schema/启动链推迟
- IM gateway 适配器（如有）
- RL / Atropos 实验性
- 文档站 / web examples
- 不需要的 provider adapter（Day 0 保留 anthropic、openai-compatible、deepseek；其他作为 fallback 留 1-2 个）

**保留**：
- session / tool / agent / provider（精简后）/ mcp / storage / permission / plugin / server

**重命名**：
- binary：`opencode` → `agent`
- package：业务命名

**不做**：业务逻辑、新 tool

**验收**：
- `agent --help` 显示干净的命令树（无 TUI / IM / share / acp）
- 保留 package 的单测全绿
- `du -sh agent/` 体积比 clone 时减少 ≥ 40%
- `agent` binary 可独立运行（不依赖砍掉的包）
- 全文搜索砍掉 package 的 import 应为空

---

### Phase 2 — Foundation

**目标**：业务基座可用——DB / OSS / Langfuse / LLM 全部接通。

**范围**：
- drizzle schema 落地 6 张业务表 + migration 脚本
- ali-oss 集成（env-driven 配置）
- Langfuse SDK 集成 + 凭据接入
- LLM provider：Claude（主脑，启 prompt cache）+ DeepSeek（fallback）
- `agent model` 命令切换
- `.env.example` 完整化
- 业务 service 骨架（精简版，不写流水线）

**不做**：atomic tools、skill 系统、UI

**验收**：
- `agent run "say hi"` 用 Claude 跑通；`--model deepseek` 跑通 ⚠ § 15 / 1.5：Phase 2.x 用新凭据 `deepseek-v4-flash`/`v4-pro` 实跑通(初版 404 是凭据问题,非 opencode routing)
- `agent oss put foo.txt` / `get` / `list` 跑通
- 内部测试脚本能从 Langfuse 拉到一个测试 prompt
- `pnpm db:migrate` 跑通，6 张表存在
- `.env.example` 跟 `.env` 字段一致
- prompt cache 在 Claude 调用时确实命中（log 验证）

---

### Phase 3 — Atomic Tools

**目标**：把 6 个素材生产能力包装成 atomic tools。

**Tools（Day 0 版本）**：⚠ § 15 / 1.6（命名加模型后缀）
1. `generate-image-nanobanana`（nanobanana 2 / `gemini-3.1-flash-image-preview`）
2. `generate-image-gpt`（OpenAI GPT-Image 1）
3. `generate-video-seedance`（SeedDance 2 pro）
4. `generate-video-happyhorse`（HappyHorse / Kling-style multimodal）
5. `concat-clips`（FFmpeg-style stream concat）
6. `crop-video`（FFmpeg-style trim）

每个 tool：
- opencode plugin 自动加载（`tools/` 目录 glob）
- 输入 zod 校验
- 输出统一为 OSS URL
- 支持 `--dry-run` 打印 resolved request
- 实现错误结构化回灌（`isError`），不 throw 中断

**不做**：编排流水线、skill、UI

**验收**：
- `agent tools list` 显示 6 个 tool
- 每个 tool 单独可调用、可 `--dry-run`
- `agent config export-schema --command "tools generate-image"` 输出 Anthropic 兼容 JSON schema
- 在 chat 里 LLM 能成功调用每个 tool，结果是 OSS URL
- 任意一个 tool 失败时错误进消息流（不 throw 中断会话）
- tool signature 一旦在本 phase 定下，**后续 phase 不许改**

---

### Phase 4 — Skill System

**目标**：skill 三入口 + Langfuse 内容托管 + scope 字段。

**范围**：
- `Skill` 表 + drizzle migration
- Langfuse client 拉 / 推 prompt body（`skill_<name>` 命名空间）
- CLI 三入口：`agent skills add/update/delete/list/enable/disable`，支持 `--from-file` / `--from-url` / `--from-langfuse-prompt-key` / `--scope`
- HTTP API：`POST/GET/PATCH/DELETE /api/skills`
- system prompt 自动注入 enabled skill 的 description（懒加载正文）
- 实现 `skill <name>` tool（拉 Langfuse 正文塞 context）
- 写 1 个示范 skill：「小说→视频片段」完整流程（存 Langfuse）
- `agent skills export-schema`

**不做**：UI、agent 自动管理 skill（只读，不 self-modify）

**验收**：
- CLI 三入口都跑通；`scope=system` 默认隐藏，`scope=creator` 显示
- 在 Langfuse 改一个 skill 内容，下一次 agent 调用立即生效（cache 不挡）
- 外部 LLM 拿 export-schema 输出能直接装载工具描述
- 示范 skill 让 agent 完成端到端任务（输入小说片段 → 输出一段视频）
- `scope=system` 创建的 skill 在 `agent skills list --scope creator` 中不出现

---

### Phase 5 — WebUI Workspace

**目标**：创作者工作台上线。

**范围**：
- `web/` 起 Next.js + shadcn/ui
- 接 opencode server SSE
- 实现：
  - `/login`（username/password + JWT）
  - `/`（主 chat 界面 + streaming + 中断）
  - `/assets`（资产页，参考 legacy `ResourceDetailDrawer` / `ResourceDrawer` / `EpisodeList`）
  - `/skills`（skill list，仅 `scope=creator`，跳 Langfuse）
  - `/projects`（项目列表）
- `developer` / `creator` 两个 permission profile 落地
- WebUI session 强制 `--profile creator`
- `creator` profile 砍掉 skill 管理 / config / shell / debug 工具

**不做**：完整后台（cost 分析、多用户管理、监控）

**验收**：
- 创作者用 username/password 能登入
- web 端 chat 能跑通"小说 → 视频"全流程
- creator profile 时 skill 管理 / config / shell 工具不可见也不可调（即使尝试也被 ruleset 拒）
- 资产页能看到生成历史 + 单资产详情（图、视频、prompt 元数据）
- 中断 chat 后 task 状态正确（不卡死、不丢失）

---

### Phase 6 — CLI Polish

**目标**：CLI 达到 MiniMax CLI 那种 agent-native 标准 + 清理 legacy。

**范围**：
- 单 `OptionDef[]` 驱动 parser + tool schema + help
- `agent config export-schema`（全量）
- non-TTY 自动 JSON 输出
- 全局 `--dry-run`
- `--non-interactive` + `failIfMissing` + CI 自动检测
- 8 个标准 exit code（仿 mmx）
- `ERRORS.md` 完整覆盖（每命令 × 每错误）
- `SKILL.md`（仓库根，给外部 coding agent 用）
- 单二进制（Bun bundle，`agent/dist/agent.mjs`）
- **移除 `legacy/`**（用户最终确认后）

**验收**：
- 外部 agent 用 `agent config export-schema` 拿到完整 tool schema 能直接接入
- 单二进制 ≤ 30MB，cold start ≤ 100ms
- `ERRORS.md` 每错误场景都有匹配实现
- `SKILL.md` 可被另一 Claude Code session 直接读懂使用
- `legacy/` 被移除后构建 / 测试 / 部署不受影响

---

## 11. 工作流（Claude Code Session 必读）

### 11.1 进入新 phase 时

1. 读本 spec 对应 phase 章节
2. 在 `docs/superpowers/specs/phase-N-<slug>-plan.md` 写详细计划 + 测试项
   - **不写代码 / 伪代码 / 任何实现**
   - 内容：步骤拆解 + 每步预计输出 + 详细测试项 + 风险点
   - **不需要等用户审核，写完直接执行**
3. 执行
4. 完成时跑通**所有验收项**

### 11.2 完成 phase 后必须做的事（缺一不可）

- ✅ 跑通所有验收项
- ✅ 写 `docs/superpowers/specs/phase-N-<slug>-verification.md`，逐条对验收项打勾或解释偏差
- ✅ commit 并 push 到 main
- ✅ 跑 `superpowers:code-reviewer`
- ✅ **运行 `/compact` 压缩 context**
- ✅ 才能进入下一 phase 的 plan 撰写

### 11.3 遇到 spec 没覆盖的情况

1. **停下来问用户**，不擅自决定
2. 收到答复后**更新 spec**（在 §15 修订记录加新条目，必要时改对应 phase 章节）
3. 才能继续

### 11.4 跨 phase 接口稳定

- atomic tool signature 一旦在 Phase 3 定下，Phase 4-6 不许改
- DB schema 一旦在 Phase 2 定下，后续要改走 spec 修订
- 要改：在 spec § 15 修订记录加条目，说明原因 + 影响范围

### 11.5 commit / push

依据全局 CLAUDE.md（`~/.claude/CLAUDE.md`）：
- atomic commits（每次提交一件事）
- trunk-based（直接在 main 工作）
- no PR
- push 频繁
- 每完成一个 phase **必须** commit + push

---

## 12. 红线（违反 = 错误）

- ❌ 不写硬编码视频流水线 service（任何 `*-orchestration` / `*-coordination` / `*-workflow-service` 命名都是嫌疑）
- ❌ 不让 skill body 散落在仓库 markdown 文件
- ❌ 不在 WebUI 实现独立业务逻辑
- ❌ 不混淆 `creator` / `developer` permission profile
- ❌ 不偏离本 spec（要偏离走 § 15 修订流程）
- ❌ 不在没写 phase plan 前直接动代码
- ❌ 不在 phase 之间跳过 `/compact` / verification report

---

## 13. 风险与回退

### 13.1 Effect TS 学习曲线
- **风险**：Phase 3 之后实现速度大幅下降
- **触发条件**：Phase 3 早期写第一个 atomic tool 时仍无法独立完成
- **回退**：剥 Effect 用 async/await 重写主循环（约 1 周代价）—— 写到 § 15 修订记录后才能执行

### 13.2 opencode 上游变化
- **决策**：fork once，不跟上游
- **风险**：opencode 修了重大 bug 我们不会自动拿到
- **缓解**：定期人工 cherry-pick 重要 commit（不在 Day 0 范围）

### 13.3 Langfuse 服务不可用
- **影响**：skill body 拉不到，部分 agent 会话受阻
- **缓解**：local memory cache + 文件 fallback
- **要求**：skill_manage 写入失败必须 surface 错误，不静默降级

### 13.4 单二进制 cold start
- **风险**：Phase 6 实现的 Bun bundle cold start > 100ms
- **触发**：Phase 6 测试时
- **回退**：放弃单二进制约束，用 Node + 全量依赖

---

## 14. 不在本 spec 范围

- prod 数据迁移（旧 prod 自生自灭，由用户独自处置）
- legacy 修复（不修，任其凋零）
- 部署 / CI / Infra（按需 Phase 6 后做）
- 商业化 / billing / 多租户
- agent 自动管理 skill（Hermes 风的 background_review）—— V2 候选

---

## 15. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|---|---|---|---|
| 1.0 | 2026-04-29 | 初版（brainstorming session 产出） | cdotlock + Claude |
| 1.1 | 2026-04-29 | Phase 0 落地时确认 opencode upstream 是 Bun-only（`packageManager: bun@1.3.13`、`bun.lock`、用 `workspaces.catalog` 特性、19 个 packages 全 `bun run --cwd` 入口）。根改用 Bun workspace（`package.json` 内 `workspaces`），废弃 `pnpm-workspace.yaml`。Phase 0 验收命令 `pnpm install` → `bun install`。影响范围：仅 build/install 工具链；不动 § 2 任何核心架构原则、不影响后续 phase 设计。 | cdotlock + Claude |
| 1.2 | 2026-04-29 | Phase 0 落地时进一步确认：把 `agent/` 列为根 workspace 成员会触发 Bun 嵌套 workspace + catalog 解析失败（实测 `error: @tsconfig/bun@catalog: failed to resolve` 等）。opencode 上游用 `workspaces.catalog` + `patchedDependencies` + `overrides`，把这些抬到根需要长期同步上游 churn，维护代价大。决策：根 workspace 只含 `web/`，`agent/` 是独立 Bun monorepo，通过根 `package.json` 内两个脚本 `install:agent` / `install:all` 桥接。spec § 3 物理结构与工作区配置已同步更新。`legacy/`、`cli-example/` 仍不在 workspace。影响范围：仅工作区拓扑；不影响 § 2 任何核心架构原则、不影响后续 phase。 | cdotlock + Claude |
| 1.3 | 2026-04-29 | Phase 1 落地时确认：opencode/src 的 `share/`、`sync/`、`control-plane/` 三个子目录在 `storage/schema`、`effect/bootstrap-runtime`、`effect/app-runtime`、`project/bootstrap`、`server/routes/instance/{session,sync,control}`、`session/{session,projectors,revert,message-v2}` 等十几处深度耦合（share 8 inbound、sync 15+ inbound、control-plane 15+ inbound）。Phase 1 砍这些会牵动启动链 + storage schema + session 生命周期；此外 `sync` / `control-plane` 不在 spec § 10 字面 cut 列表内（§ 10 Phase 1 只列 share / acp）。决策：Phase 1 只砍 acp（`acp/` 目录 + `cli/cmd/acp.ts` + `index.ts` 注册），保留 share / sync / control-plane。Phase 2 LLM/DB 接通后视实际 runtime 副作用再决定何时砍。spec § 10 Phase 1 字面要求"share 砍"未落地（acp 已落地）；§ 10 Phase 1 加 ⚠ 标记引用本行。影响范围：trim 时序；不动 § 2 任何核心架构原则，不影响后续 phase 接口设计。 | cdotlock + Claude |
| 1.4 | 2026-04-29 | Phase 2 落地时确认：`agent run --model deepseek/deepseek-chat` 实跑撞 opencode-internal Anthropic-routing 策略 —— 所有 LLM 请求被路由到 `<base>/anthropic/chat/completions`，而 DeepSeek 的 `/anthropic` Anthropic-compat 端点返回 404（可能需要不同 header / region 配置）。结构性已通（catalog 自动加载、`@ai-sdk/openai-compatible` SDK 已 bundled、`agent models deepseek` 列出 4 个模型）；live integration 推迟到 **Phase 2.x**（单独 sub-phase 修 routing，可能加 `deepseek` customLoader 走 `/v1/chat/completions`）。spec § 10 Phase 2 acceptance #2 加 ⚠ 标记引用本行。影响范围：DeepSeek live fallback 时序；不动 § 2 / § 8 任何核心 LLM provider 设计。 | cdotlock + Claude |
| 1.5 | 2026-04-29 | Phase 2.x：用户提供新 DeepSeek 凭据(`sk-f801...`),实测 `deepseek-v4-flash` / `v4-pro` 走 `@ai-sdk/openai-compatible` SDK + 标准 `/v1/chat/completions` 路径完全跑通。**1.4 中关于 opencode 路由到 `/anthropic/chat/completions` 的判断是错的**：opencode 没有"全 provider 走 Anthropic 路径"的策略,models.dev catalog 把 DeepSeek 标记 `npm: "@ai-sdk/openai-compatible"`,所以走 OpenAI 兼容路径。`deepseek-chat` / `deepseek-reasoner` 仍 404 是 DeepSeek 端 v3 endpoint 已停服或新凭据无权访问,与 opencode 无关。spec § 10 Phase 2 acceptance #2 ⚠ 标记从 1.4 改引 1.5,Phase 2 验收 7/7 全过。影响范围:解除 1.4 推迟;不动 § 2 / § 8 任何设计。 | cdotlock + Claude |
| 1.6 | 2026-04-29 | Phase 3 实施时调整 atomic tool 命名:在 tool id 里编码具体模型后缀,LLM 看 tool 名就能区分能力。映射:`generate-image` → `generate-image-nanobanana`(nanobanana 2 / `gemini-3.1-flash-image-preview`);`generate-image-gpt` 不变(原本就带模型名);`generate-video` → `generate-video-seedance`(SeedDance 2 pro);`happyhorse` → `generate-video-happyhorse`(HappyHorse / Kling-style);`concat-clips` / `crop-video` 不变(无 AI 模型,FFmpeg-style ops)。env vars 同步:`FC_GENERATE_IMAGE_*` → `FC_GENERATE_IMAGE_NANOBANANA_*`,`FC_GENERATE_VIDEO_*` → `FC_GENERATE_VIDEO_SEEDANCE_*`,`FC_HAPPYHORSE_*` → `FC_GENERATE_VIDEO_HAPPYHORSE_*`。原因:LLM 凭 tool 名选 tool 而不读 description body,语义化 tool id 显著降低误调率。spec § 10 Phase 3 tool 列表加 ⚠ 引本行。影响范围:命名;tool 接口形态、6 tool 数量、§ 11.4 跨 phase 接口稳定原则不变(命名更新作为本 phase 内 lock-in 起点)。 | cdotlock + Claude |

> 后续修订请在此追加新行，并在受影响的 phase 章节加 ⚠ 标记 + 引用本表行号。

---

## 附录 A：参考材料速查

- 全局 CLAUDE.md（用户级）：`~/.claude/CLAUDE.md`（含 SKILL/CLI/MCP/API 四层哲学详细论述、git 工作流）
- opencode 源码：`agent/`（Phase 0 后落盘）
- MiniMax CLI 源码：`cli-example/`（Phase 0 后落盘）
- 旧 Agent Forge：`legacy/`（Phase 0 后落盘，参考用，不维护）
- Langfuse：`https://prompt.mobai-game.com`，project=`assets-produce`
