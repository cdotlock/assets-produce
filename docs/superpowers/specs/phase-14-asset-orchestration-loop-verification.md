# Phase 14 — 真·素材编排循环 Verification

> 对 spec § Phase 14 / §15 行 1.14 的验收项逐条打勾或解释偏差。
> 分支：`claude/explore-agent-features-Or0ap`。

## 治理前置（红线流程）

- ✅ §15 行 1.14 已写入 spec（推翻 1.12 的"不接真编排循环"，1.13 music 占位不变），签名 `cdotlock + Claude`。
- ✅ spec 新增 `### Phase 14` 章节（⚠ 1.14）。
- ✅ `docs/superpowers/specs/phase-14-asset-orchestration-loop-plan.md` 详细 plan（纯步骤/输出/测试项/风险，无代码）。
- ✅ 未破 §11.4：未改 `AssetService`/`runAssetGeneration` 状态机契约、4 REST 端点、`AssetKind`、DB schema、`AssetServiceErrorCode`(10)、`GenerationOutcome` 形状与 code 集合、OpenAPI（`openapi.test.ts` 等回归全绿）。

## 实现产物

| 文件 | 说明 |
|---|---|
| `asset-service/budget.ts` (新) | `ASSETS_SERVICE_MAX_STEPS_PER_JOB` / `_MAX_TOKENS_PER_JOB` env reader，安全默认（step 默认仍 30，env 未设时行为不变） |
| `asset-service/llm-generator.ts` (新) | `createLlmGenerator()` → 真 `AssetGenerator`：磁盘读 skill body + 解析 allowlist → Claude 主/DeepSeek fallback → 通用 tool-calling loop（仅暴露该 skill allowlist 内原子工具） → 终态映射。零 per-AssetKind 分支 |
| `asset-service/wire.ts` | 注入缝 `generator: createLlmGenerator()`；`placeholderGenerator` 保留导出但不再注入 |
| `asset-service/intent-to-skill.ts` | `ASSET_GENERATION_SKILLS` 注册 `matting-spec` / `cutout-spec` |
| `run-asset-generation.ts` / `asset-service.ts` | maxSteps 默认改走 `resolveMaxStepsPerJob()`（env 未设 = 30，行为不变）；`DEFAULT_MAX_STEPS` 改由 budget.ts 单一来源 re-export |
| 测试 + `.env.example` | llm-generator 单测 26 例；intent-to-skill +matting/cutout 测试；.env.example 预算注释更新 |

## 验收项逐条

### 1. typecheck + 全测试通过；新 loop ≥ 80% 行覆盖（mock LLM + dryRun）

- ✅ **typecheck**：`tsgo --noEmit` 全包 **0 错误**。
- ✅ **测试**：asset-service 套件 **179/179 通过**（含 llm-generator 26、intent-to-skill 含新增 matting/cutout）。更广 `test/business/ test/tool/` **535 通过，1 失败**——该失败为 `test/tool/write.test.ts` 的"OS 拒绝写权限时抛错"，**容器以 root 运行，root 绕过 DAC 文件权限**，`chmod 0o444` 后写仍成功，与 Phase 14 无关（diff 未触及 `src/tool/write.ts`），属环境性 pre-existing，非回归。
- ⚠️ **偏差（覆盖率 62.44% < 80%）**：核心编排逻辑（skill→allowlist 解析、通用 loop、终态映射、music deferred 短路、step/token 双预算、模型拒绝路径、真盘 defaultLoadSkill 对全部 10 个 shipped skill body）已**全面 hermetic 单测**。残余未覆盖行（`179-258` 模型解析含 DeepSeek fallback、`294-321` defaultDriveLoop=ai generateText 薄包装、`375-385` syntheticContext、`619-663` buildToolSet=Tool.init 装配、`672-675` schemaModelShim）**100% 是 Provider/AppRuntime/网络绑定的默认接线**，按构造无法在无 live runtime + 凭据时 hermetic 单测；其正确性由全包 typecheck 0 错误 + 既有 provider/tool 测试守门，落入与下方第 2/6 项相同的"需凭据集成"桶（plan R7）。不为凑数写脆弱 mock-runtime 测试或伪造打勾。

### 2. 非 music intent → 真 OSS URL（凭据已配时）/ mock 模式结构正确

- ✅ **mock 模式**：T5 验证 allowlist 内工具返回 `metadata.ossUrl`/bare `output` URL → `ok:true`（`url`/`atomic_tool`/`steps`/`ref_urls` 结构正确）；skill 选择在上游 `intentToSkill` 完成（既有 179 测试覆盖），loop 仅消费已选 skill。
- ⚠️ **真 OSS URL via REST（N/A 本环境）**：本临时容器**无任何凭据、无 .env**（`ANTHROPIC_API_KEY`/`OSS_*`/`ELEVENLABS_API_KEY`/`FC_*`/`LANGFUSE_*` 全空），与用户"环境已配/我会提供"答复不符——此 ephemeral 容器未注入密钥。结构路径已验证（typecheck + 单测 + 真盘 skill loader）；真端到端需在用户已配凭据的环境跑 `agent serve` + `asset.create`（plan R7：记 N/A + 保留 mock/结构证据，不阻塞 phase）。

### 3. music intent → ok:true + 占位 url，job succeeded 非 failed

- ✅ T6 两测：`generate-music-suno` `metadata.placeholder:true` → `ok:true`（`atomic_tool="generate-music-suno"`，`url`=占位串，`steps`），且"占位优先于后续工具 error"——短路发生在任何失败/预算映射之前（§15/1.13 / plan D6）。经 `runAssetGeneration`，`ok:true` 即 `succeeded`。

### 4. 越界工具被 allowlist 拒绝；step/token 超预算 → BUDGET_EXCEEDED

- ✅ T7：仅 allowlist 内工具被装入 ToolSet 暴露给模型，越界工具结构上不可达（`capture.exposed` 恰等于解析的 allowlist）。
- ✅ T8：token 累计超 `resolveMaxTokensPerJob()` → `BUDGET_EXCEEDED`；step 达上限无终态 → `BUDGET_EXCEEDED`（两预算独立，D7）。

### 5. matting/cutout intent 能解析到对应 skill

- ✅ `intent-to-skill.test.ts`：`matting-spec`/`cutout-spec` 经 picker 与 `skill_hint` 均可解析（仿 upscale-spec，无 kind 默认项）。
- ✅ 真盘 loader 测试：`matting-spec`/`cutout-spec` body 经 `defaultLoadSkill` 加载且解析出非空已知工具 allowlist（matting→{matting,hole-fill}，cutout→{cutout}）。

### 6. Langfuse trace 一次 job 后可见，根 span asset_job_<id>

- ✅ **代码路径不变**：trace 由既有 `runAssetGeneration` 驱动（`tracer.startJob`→`skill.picked`→`generator.ok`→`trace.end`，根 span `asset_job_<id>`），Phase 14 未改该 driver；新 generator 按设计返回 `langfuse_trace_id:null`（driver 拥有 trace）。既有 `tracer.test.ts` 守门。
- ⚠️ **live 可见性 N/A 本环境**：无 `LANGFUSE_PUBLIC_KEY/SECRET_KEY`，`createLangfuseTracer()` 回退 nullTracer（设计如此，dev/CI 无 LF 仍完成 job）。真 Langfuse 可见性需凭据环境（同第 2 项桶）。

### 7. plan + verification report 齐

- ✅ plan：`phase-14-asset-orchestration-loop-plan.md`（已提交）。
- ✅ verification：本文件。

### 8. commit + push 到 claude/explore-agent-features-Or0ap

- ✅ 原子提交：`docs: spec §15/1.14 + Phase 14 plan` / `feat: budget + matting/cutout` / `feat: real LLM orchestration loop wired` / `test: defaultLoadSkill real bodies` / 本 report commit。
- ✅ push 到 `claude/explore-agent-features-Or0ap`（本 session 指定分支，§15/1.14 记录的 git 偏离；非 main）。

## 偏差小结（须用户知晓）

1. **覆盖率 62% < 80%**：核心逻辑全测；残余为只能集成测的 Provider/AppRuntime 接线。判定：合理偏差，不阻塞。
2. **真 OSS / 真 Langfuse E2E = N/A 本容器**：此 ephemeral 环境实际**无凭据、无 .env**（与"环境已配"答复不符）。结构与 mock 已验证；真端到端待用户在已配凭据环境跑 `agent serve`+`asset.create`（或注入密钥后重跑）。
3. **music 仍占位**：尊重 §15/1.13，loop 将其作成功 deferred；Suno 接通是独立开放项。
4. **root 环境单测 1 例失败**：`tool.write` 权限测试，与 Phase 14 无关。

## 后续（完成 phase 必做项）

- ⏳ 跑 `superpowers:code-reviewer`
- ⏳ `/compact`
