# Phase 14 — 真·素材编排循环（asset-orchestration-loop）Plan

> 依据 spec §15 行 1.14（推翻 1.12 的"不接真编排循环"，1.13 music 占位不变）
> + spec § Phase 14 章节。本文件只写步骤 / 预期输出 / 测试项 / 风险，不写代码或伪代码。

## 0. 背景与目标

经 REST API 进来的所有素材当前都走 `asset-service/wire.ts` 的 `placeholderGenerator`，
返回 `https://stub.assets.local/...` 假链接，从不读 skill body、不调原子工具。本 phase
在既有 `deps.generator` 注入缝把它换成真·LLM 编排循环：LLM 读 skill body → 在该
skill 的原子工具 allowlist 内选工具执行 → 终态返回真 OSS URL。

**契约边界（不可破，§11.4）**：`AssetGenerator.generate(input): Promise<GenerationOutcome>`
这个 Promise 接口是唯一改动面。`AssetService` / `runAssetGeneration` 状态机、4 个 REST
端点、`AssetKind`、DB schema、`AssetServiceErrorCode`(10)、`GenerationOutcome` 形状与
code 集合（`BUDGET_EXCEEDED`/`GENERATION_REJECTED`/`ATOMIC_TOOL_FAILED`）、OpenAPI 全不动。

**红线（§2/§12）**：loop 必须是通用「LLM + skill body + 原子工具运行回路」，禁止任何
per-asset 分支逻辑。新素材类型 = 加一个 `knowledge/asset-generation/<name>.md` + 注册
名字，loop 代码零改动。

## 1. 关键设计决策（落地前先锁定）

| # | 决策 | 依据 |
|---|---|---|
| D1 | skill body runtime 来源 = 本地磁盘 `knowledge/asset-generation/<skill>.md`；Langfuse 按需上传不在本 phase | CLAUDE.md 本地源材料原则；代码现状（这些 .md 非 SKILL.md，不被 Skill discovery 收） |
| D2 | per-skill 工具 allowlist = 解析 body 内 "## Atomic tools (allowed)" 段列出的 kebab-case tool id | README § Conventions 第 2 条 |
| D3 | 原子工具程序化调用 = `Tool.init` 取 `Def` → 合成最小 `Tool.Context`（system profile，`ask()` 直接 deny，`abort` 取 job 的 signal）→ `def.execute(args, ctx)` 在 Effect runtime 跑；输出取 `metadata.ossUrl` 优先，回退 `output` | 代码现状（无既有非-agent 调用桥） |
| D4 | tool→LLM schema 转换复用 `ToolRegistry`/`session` 现有路径；prompt cache 复用 `ProviderTransform.message`（anthropic 分支自动注 cacheControl） | 代码现状，避免重造 |
| D5 | 模型策略：优先 Claude（`Provider.defaultModel()` 或 config 指定的 asset 模型），调用抛错/不可用 → DeepSeek fallback；二者都不可用 → `GENERATION_REJECTED`（不可生成）| spec §8.1 主脑+fallback；asset-service 内此前无此策略 |
| D6 | music：`generate-music-suno` 返回 `metadata.placeholder=true` 时，loop 视为**成功终态** `ok:true`（`url`=占位串，`atomic_tool="generate-music-suno"`），不进失败分支 | §15/1.13；README:22-31 |
| D7 | 预算：新增 env reader `ASSETS_SERVICE_MAX_STEPS_PER_JOB`(默认 30，沿用现 `DEFAULT_MAX_STEPS`)、`ASSETS_SERVICE_MAX_TOKENS_PER_JOB`(默认 200000)。step 计数 = LLM↔tool 往返轮次；token 计数 = 累加各 LLM 调用 usage。任一超 → `ok:false, code:"BUDGET_EXCEEDED"` | spec Phase 8/§15；.env.example:135-136 已声明 |
| D8 | Promise↔Effect 桥：`generate()` 内构建并 `runPromise` 一个 Effect program，复用既有 app runtime layer 取 `Provider`/`ToolRegistry`/`OSS` 等 service | 代码现状（栈是 Effect，接口边界是 Promise） |

## 2. 步骤拆解 + 每步预期输出

### Step 1 — 预算 env reader + 常量
- 在 asset-service 内加 `ASSETS_SERVICE_MAX_STEPS_PER_JOB` / `ASSETS_SERVICE_MAX_TOKENS_PER_JOB`
  读取（env 缺省走默认 30 / 200000），与现 `DEFAULT_MAX_STEPS` 协调（不破坏
  `asset-service.ts:74` / `run-asset-generation.ts:145` 现有 `?? DEFAULT_MAX_STEPS` 语义）。
- **预期输出**：一处集中的预算配置读取；现有 maxSteps 链路行为不变（默认仍 30）。

### Step 2 — skill body 磁盘 loader
- 新增按 skill 名从 `knowledge/asset-generation/<name>.md` 读 body 文本的函数；解析
  出 "## Atomic tools (allowed)" 段内的 tool id 列表（allowlist）。
- 找不到文件 / 解析不到 allowlist 段 → 明确错误（映射到 `GENERATION_REJECTED`，
  视为 spec 不可执行，不是 500）。
- **预期输出**：给定 `cg-render-spec` 返回 body 文本 + `["cg-render","oss-put"]` 类 allowlist。

### Step 3 — 程序化原子工具调用桥
- 实现：给 tool id + args，`Tool.init` 取 `Def`，合成最小 `Tool.Context`
  （sessionID/messageID = job 派生；agent="asset-service"；abort = job signal；
  `ask()` = 立即 deny；`metadata()` = no-op 收集器），跑 `def.execute`，归一化输出
  （成功取 `metadata.ossUrl`→否则 `output` 内 URL；`metadata.error===true` → 工具失败）。
- **预期输出**：可对任一 asset 原子工具（含 `oss-put`/`cg-render`/`generate-sfx-elevenlabs`/
  `generate-music-suno`）以编程方式单步调用并拿到归一化结果。

### Step 4 — 模型选择策略（Claude 主 / DeepSeek fallback）
- 实现选模型：主 = Claude，fallback = DeepSeek；返回可用 `LanguageModel` + 标识。
  二者都不可用时给出可被上层映射成 `GENERATION_REJECTED` 的信号。
- prompt cache：走 `ProviderTransform.message` 既有 anthropic 分支，无需自造。
- **预期输出**：mock 下可注入假 model；真实环境优先 Claude，Claude 异常自动切 DeepSeek。

### Step 5 — LLM 编排循环主体（新 `asset-service/llm-generator.ts`）
- 组装 system prompt = skill body（D1）+ 通用 loop 指令（"只用 allowlist 内工具；
  产出后调 oss-put 得永久 URL（若 body 要求）；完成时给出终态"）；user 消息 =
  `intent`（kind/key/spec_md/refs/constraints）+ preferences。
- 多步 tool-calling 循环：每轮 LLM 可调 allowlist 内工具（Step 3 执行），结果回灌；
  累计 step / token（Step 1 预算，超 → `BUDGET_EXCEEDED`）。
- 终止：LLM 给出最终 URL → `ok:true`（`atomic_tool` = 最后产视觉/音频产物的工具，
  `url`、`ref_urls`、`steps`、`langfuse_trace_id`）。
- music 特例（D6）：工具结果 `metadata.placeholder=true` → 直接成功 deferred 终态，
  不要求真 OSS URL，不进失败分支。
- 失败映射：工具 `error:true` 且不可恢复 → `ATOMIC_TOOL_FAILED`；模型判定 spec
  不可执行 / 内容过滤 → `GENERATION_REJECTED`；预算超 → `BUDGET_EXCEEDED`。
- 实现为 Promise（D8 内部 Effect→`runPromise`），满足 `AssetGenerator` 接口。
- **预期输出**：一个实现 `AssetGenerator` 的真 generator，不含任何 per-kind 分支
  （kind 只通过"选了哪个 skill body"间接生效）。

### Step 6 — 注入缝替换 + skill 注册收口
- `wire.ts` 的 `assetServiceSingleton`：`generator: placeholderGenerator` →
  真 generator 实例（其余 deps：tracer/writer/skillPicker 不变）。
- `placeholderGenerator` 保留在文件内（测试 `wire.test.ts` 仍引用其确定性；不删，
  仅不再注入到 singleton）——若 `wire.test.ts` 断言 singleton 用 placeholder 则按
  新行为更新该断言。
- `intent-to-skill.ts` 的 `ASSET_GENERATION_SKILLS` 追加 `matting-spec`/`cutout-spec`
  （仿 `upscale-spec`：无 `DEFAULT_KIND_SKILL_MAP` 项，靠 hint/picker 选）。
- **预期输出**：经 REST 路径默认走真 loop；matting/cutout intent 可解析到 skill。

### Step 7 — 测试
- 见 § 3。
- **预期输出**：新增/更新测试全绿，覆盖率达标。

### Step 8 — 验收 + verification report + commit/push
- 跑通 § Phase 14 所有验收项，逐条写
  `docs/superpowers/specs/phase-14-asset-orchestration-loop-verification.md`。
- commit（atomic）+ push 到 `claude/explore-agent-features-Or0ap`。
- 跑 code-reviewer；`/compact`。

## 3. 详细测试项

**单元（mock LLM + dryRun/mock 原子工具）**
- T1 skill loader：已知 skill 名返回正确 body + allowlist；未知名 → `GENERATION_REJECTED` 信号。
- T2 allowlist 解析：从真实 `cg-render-spec.md`/`sfx-spec.md`/`music-spec.md` 解析出预期 tool id 集。
- T3 工具桥：mock `Def.execute` 返回 `metadata.ossUrl` → 归一化拿到 URL；返回 `error:true` → 识别为失败。
- T4 模型策略：Claude 抛错 → 切 DeepSeek；两者都无 → 可映射 `GENERATION_REJECTED`。
- T5 loop 成功路径：mock LLM 选 allowlist 内工具 → 终态 `ok:true` 结构完整（url/atomic_tool/steps）。
- T6 music deferred：mock `generate-music-suno` 返回 `placeholder=true` → `ok:true` deferred，**非** failed。
- T7 allowlist 强制：mock LLM 试调 allowlist 外工具 → 被拒、不执行，不污染终态。
- T8 预算：step 超 `MAX_STEPS` → `BUDGET_EXCEEDED`；累计 token 超 `MAX_TOKENS` → `BUDGET_EXCEEDED`。
- T9 工具失败：mock 工具 `error:true` → `ATOMIC_TOOL_FAILED`，无内部重试（design §5.2 一击失败）。

**集成 / 状态机**
- T10 经 `runAssetGeneration` 全链：queued→running→（真 generator）→succeeded，DB 写入 asset，trace 事件 `skill.picked` 等保留。
- T11 `intentToSkill`：`matting`/`cutout` 相关 intent（经 hint 或 picker）解析到 `matting-spec`/`cutout-spec`。
- T12 §11.4 回归：4 REST 端点 / 错误码矩阵 / OpenAPI 既有测试全绿，无签名变化。
- T13 `wire.test.ts`：`placeholderGenerator` 确定性单测仍通过（函数保留）；singleton 注入断言按新行为更新。

**真端到端（凭据已配，spec 验收项；缺凭据则记为 N/A 并保留 mock 证据）**
- T14 经 REST `asset.create` 一个非 music intent（如 sfx 或 cg）→ 轮询 `asset.status` 得 `succeeded` + 真 OSS https URL。
- T15 music intent 经 REST → `succeeded` + 占位 url（非 failed）。
- T16 Langfuse：一次 job 后 trace 可见，根 span `asset_job_<id>`。

## 4. 风险点与缓解

| 风险 | 缓解 |
|---|---|
| R1 退化成硬编码流水线 service（红线） | loop 零 per-kind 分支；kind 只经"选哪个 skill body"生效；评审专门检查 `llm-generator.ts` 无 `switch(kind)` 类逻辑 |
| R2 `Tool.Context` 合成不全导致原子工具运行期崩 | Step 3 先对每个 asset 工具用 dryRun/mock 跑通桥再接 loop；`ask()`=deny、`abort`/`metadata` 提供最小可用实现 |
| R3 Promise↔Effect 桥泄漏 / runtime layer 缺 service | 复用既有 app runtime layer 构造；`generate()` 内单一 `runPromise` 边界，错误归一化为 `GenerationOutcome.code` 不抛穿 |
| R4 §11.4 接口被无意改动 | 只改注入缝后实现 + 新文件；不碰 `types.ts`/REST/OpenAPI；T12 回归守门 |
| R5 music 误判为失败（违 1.13） | T6 专测；D6 在 loop 顶层短路，先于失败映射 |
| R6 预算计数不准导致死循环或过早杀 | step=往返轮次硬上限；token 累加每次 LLM usage；二者独立判定；T8 覆盖边界 |
| R7 真凭据不可用导致 T14-16 无法跑 | 用户已确认"环境已配/会提供"；若实跑缺某 key，该项记 N/A + 保留对应 mock 证据，不阻塞 phase（结构正确为准） |
| R8 改动量大、单 session context 压力 | 按 Step 原子 commit，每步自带测试；完成后 `/compact` |

## 5. 验收项映射（spec § Phase 14 → 本 plan）

- typecheck+测试+≥80% → Step 7 / T1-T13
- 非 music 真 OSS URL（凭据已配）/ mock 结构正确 → T14 / T5
- music succeeded deferred → T6 / T15
- 越界拒绝 + 预算 `BUDGET_EXCEEDED` → T7 / T8
- matting/cutout 解析 → T11
- Langfuse trace 根 span → T16 / T10
- plan + verification 齐 → 本文件 + Step 8
- commit+push 到 `claude/explore-agent-features-Or0ap` → Step 8
