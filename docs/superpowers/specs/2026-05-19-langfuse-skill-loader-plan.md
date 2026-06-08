# Langfuse Skill-Body Loader — 实施计划

> 计划文档（步骤 / 预计输出 / 测试项 / 风险，**不含代码**，遵项目 CLAUDE.md「phase plan 不写实现」）。2026-05-19。
> 治理：主 spec §15 r1.17。设计：[`2026-05-19-langfuse-skill-loader-design.md`](2026-05-19-langfuse-skill-loader-design.md)（决策 D1–D8）。

## 目标

asset-generation skill body 的正本来源：本地-only → Langfuse `production` 优先 + 本地兜底；可在 Langfuse 热改/版本/staging→production 不部署生效；保留全部安全护栏。

## 前置事实（实现者必须信任，规划期已核实）

- Langfuse 客户端已具 `getPrompt(name,{label?,version?})` / `createPrompt(name,body,{label?})`，默认 label `production`（`src/langfuse/langfuse.ts`）。**无需新建客户端能力。**
- 注入缝已存在：`llm-generator.ts` `LlmGeneratorOverrides.loadSkill`（默认 `defaultLoadSkill` 读本地文件）。改加载源 = 替换/包装这一处，**不动 loop、不动 `createLlmGenerator` 其余、不动 `wire.ts` 注入形态**。
- asset-generation 集 = `intent-to-skill.ts` 的 `ASSET_GENERATION_SKILLS` const（11+：character-portrait-spec / scene-bg-spec / cg-render-spec / cover-spec / shot-image-from-ls / sfx-spec / music-spec / upscale-spec / matting-spec / cutout-spec / outfit-anchor-spec / ep-sprite-spec）。
- `agent skills` CLI 现有子命令：add/update/delete/list/enable/disable/show/export-schema（`cli/cmd/skills.ts`）。**无 `sync asset-generation`** —— 须新建（与 README「future phase」一致）。
- `promptKeyFor(name)`（`business/skill/cli.ts`）= `skill_<name>` 规范键，复用。

## 步骤

### S1 — `skills sync asset-generation` 推送/校验命令（D4 + D5）

- 行为：遍历 `ASSET_GENERATION_SKILLS`，读本地 body，`createPrompt(skill_<name>, body, {label})` 推至 Langfuse；`--label` 默认 `staging`，显式 `production` 才推生产；`--check` 只比对 Langfuse vs 本地、零写、非零退出码表示漂移。
- **promote 防灾闸**：推 `production`（或将 label 指向某版本）前，对每个 body 跑 `parseAllowlist`，结果 < 1 已知工具 → 拒绝该条并整体非零退出，报哪个 body、缺什么。
- 预计输出：新 CLI 子命令；`--check` 可作 CI 钩子；干跑/凭据缺失有清晰报错。
- 测试：① 推送后 Langfuse 取回字节一致；② 含坏 allowlist 的 body 推 `production` 被拒、推 `staging` 允许；③ `--check` 在一致/漂移下退出码正确；④ 缺 `LANGFUSE_*` 凭据时报错可读、不崩。

### S2 — Langfuse-backed `loadSkill`（D1 + D6）

- 行为：新加载实现 = 先 `getPrompt(skill_<name>, {label:"production"})`；命中 → 用其 body 走既有 `parseAllowlist`；miss/error/timeout → 回退 `knowledge/asset-generation/<name>.md`（即现 `defaultLoadSkill`）。进程内 TTL 缓存（env `ASSETS_SKILL_LANGFUSE_TTL_MS`，默认 60000）。经 `overrides.loadSkill` 注入；`createLlmGenerator()` 默认启用，本地兜底恒在。
- 预计输出：注入缝后实现替换；`wire.ts` 注入形态不变；Phase 14 状态机/契约不变。
- 测试：① Langfuse 命中 → 用 Langfuse body；② Langfuse 抛错/超时 → 用本地、job 仍成功（**绝不 hard-fail**）；③ 凭据缺失 → 纯本地（= 现状回归）；④ TTL 内不重复请求、TTL 过期刷新；⑤ Langfuse body allowlist 解析照常生效（坏 body 在 production 不应存在，因 S1 闸；防御性测「真坏了仍按 `SkillInfeasibleError` 归类，不是 500」）。

### S3 — parity check（D3）

- 行为：S1 `--check` 即 parity 实现；补一条文档化用法（本地/CI 跑 `skills sync asset-generation --check`）作为「git 正本 vs Langfuse production」漂移哨兵。
- 预计输出：CLAUDE.md / README 增「改完 Langfuse 须回灌 git，CI 用 --check 守漂移」一节。
- 测试：构造一处漂移 → `--check` 非零并指出具体 skill。

### S4 — 配置 + 文档

- `.env.example` 增 `ASSETS_SKILL_LANGFUSE_TTL_MS`（注释默认/含义）；确认 `LANGFUSE_HOST/PUBLIC_KEY/SECRET_KEY` 已在。
- README + CLAUDE.md「Langfuse」节：写明 asset-generation body 现 Langfuse-first、label 约定（staging/production）、promote 闸、本地兜底、回灌纪律。
- 测试：文档与实际 env/flag 名一致（评审核对）。

### S5 — Bootstrap（首次上线）

- 行为：当前 11+ 本地 body `sync --label staging` → 人工抽验 → `--label production`（过 S1 闸）promote。
- 预计输出：Langfuse `assets-produce` project 下 `skill_<name>` production label 齐备；线上 loader 自此走 Langfuse、本地兜底待命。
- 测试：端到端——经 REST `/assets/create` 产一个非 music kind，确认走 Langfuse body；Langfuse 临时改 staging 不影响 production；改 production 后约 1 TTL 内生效；停 Langfuse → 回退本地仍出图。

## 验收清单

- [ ] S1 命令存在，推送/`--check`/promote 闸全测过
- [ ] S2 loader：Langfuse 命中、宕机回退、无凭据纯本地、TTL —— 四态全测
- [ ] **Langfuse 不可达从不 hard-fail job**（专项断言）
- [ ] 坏 allowlist body 无法进 `production`
- [ ] Phase 14 既有生成在 local==Langfuse 时行为不变（回归）
- [ ] §11.4 对外接口零变更（无 AssetKind/REST/DB/error code 改动）核对
- [ ] `.env.example`/README/CLAUDE.md 同步
- [ ] bootstrap 完成：production label 齐 + 端到端通

## 风险（承计划期）

- 漂移：git 与 Langfuse production 不一致 → S3 `--check` + 回灌纪律；不做自动双向同步（避免隐式权威翻转）。
- 质量静默退化：D8，本计划**不覆盖**，记 §15 r1.17 开放后续项（golden-asset eval 另起）。
- Langfuse 延迟/抖动：D6 TTL 缓存；超时即回退本地。
- 部分推送失败：S1 须逐条报告 + 整体非零，不静默半成功。

## 明确不在本计划

golden-asset 内容质量 eval；creator Skill DB 系统迁移；任何 AssetKind/REST/DB/error code 变更；loop / 原子工具改动。
