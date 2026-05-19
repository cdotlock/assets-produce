# Langfuse Skill-Body Loader — 验证报告

> 对 [`2026-05-19-langfuse-skill-loader-plan.md`](2026-05-19-langfuse-skill-loader-plan.md) 验收清单逐条核验。2026-05-19。
> 治理：主 spec §15 r1.16。设计：[`2026-05-19-langfuse-skill-loader-design.md`](2026-05-19-langfuse-skill-loader-design.md)（D1–D8）。
> 实现 commits（branch `claude/beautiful-feistel-d80d5f`，基于 `b216a7b`）：
> `8ca8826` docs / `1de76cb` refactor(skill-source) / `a1d4fd1` feat(loader) / `d59c581` feat(sync) / `fac8f81` docs(S4) / 本报告。

## 环境前提

本 worktree 无 Langfuse 凭据（`LANGFUSE_PUBLIC_KEY`/`SECRET_KEY` 未配）、无 `.env`。这正是 D1「无凭据 → 纯本地」路径，已被专项验证（见下）。S5 实时 bootstrap 属凭据环境的运维步骤，本报告给出 runbook。

## 验收清单逐条

- [x] **S1 命令存在，推送/`--check`/promote 闸全测过**
  - `agent skills sync asset-generation [--label staging|production] [--check]` 注册可达：`bun run src/index.ts skills sync --help` 显示 `--label`（choices staging|production，default staging）+ `--check`。
  - 业务 `syncAssetGeneration` 8 hermetic 测试全绿（`test/business/skill/sync-asset-generation.test.ts`）：①推 staging 字节一致并 round-trip；②坏 allowlist body 推 `production` 被拒（写前拦截，`createPrompt` 零调用）/ 推 `staging` 放行；③`--check` 一致→ok、漂移→非 ok 且点名漂移 skill；③b `--check` 零写；④单 skill Langfuse 失败→该条 error + 整体非 ok（无静默半成功）；missing-local→非 ok 不崩；非法 label→Effect 失败。
  - promote 闸用 **与 loop 同一个** `skill-source.parseAllowlist`（非分叉），D5 满足。
- [x] **S2 loader：Langfuse 命中、宕机回退、无凭据纯本地、TTL —— 四态全测**
  - `test/business/asset-service/langfuse-skill-loader.test.ts` 8 测试全绿：①命中用 Langfuse body+allowlist；②fetch→null 回退本地不抛；②b fetch 抛错仍回退本地；③真实 default fetch 在无凭据下 resolve null→本地；④TTL 内不重复 fetch、过期重取；⑤坏 body→`SkillInfeasibleError`（非回退、非 500）；⑤b 坏 body 不缓存、修好即恢复；⑥按 skill 名隔离缓存。
- [x] **Langfuse 不可达从不 hard-fail job**（专项断言）
  - 单测 ②/②b：fetch 返回 null 或抛错均回退本地、`load()` 正常返回。
  - 端到端：`env -u LANGFUSE_PUBLIC_KEY -u LANGFUSE_SECRET_KEY bun run src/index.ts skills sync asset-generation --check` → 输出可读 `Error: [env] Langfuse env missing: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY`，**真实退出码 1**（非崩溃、非 0）。loader 侧无凭据走纯本地（= 现状回归）。
- [x] **坏 allowlist body 无法进 `production`**
  - S1 测试②：`--label production` + 空 allowlist body → `rejected-allowlist`，`createPrompt` 未被调用，整体非 ok（CLI 映射非零退出）。`staging` 不设闸（编辑暂存层）。
- [x] **Phase 14 既有生成在 local==Langfuse 时行为不变（回归）**
  - `skill-source` 抽取为**行为保真**：`parseAllowlist`/`SkillInfeasibleError`/`LoadedSkill`/本地读 逐字搬迁，llm-generator 原样 re-export；新增 load-time drift guard 锁 `ATOMIC_TOOLS` 键 == 规范 id 列表。
  - `bun test test/business/asset-service/`（15 文件 200 测试）：199 pass。唯一 fail = `ep-sprite-spec`（**预存 B1 缺体债，clean HEAD stash 复现，与本改动无关**，已 spawn 独立任务）。
  - `tsgo --noEmit` 全包 exit 0。
- [x] **§11.4 对外接口零变更核对**
  - 无新增/改动 AssetKind、REST 路由、DB schema、error code。`GenerationOutcome` 码集不变（坏 body 仍归 `GENERATION_REJECTED`）。loop / 原子工具 / `wire.ts` 注入形态（lazy AssetService，generator/writer/tracer 三字段）不变 —— 仅 generator 的 `loadSkill` 注入了 Langfuse-first 实现。
- [x] **`.env.example`/README/CLAUDE.md 同步**（commit `fac8f81`）
  - `.env.example`：新增 `ASSETS_SKILL_LANGFUSE_TTL_MS=60000` + 无凭据降级注释；确认 `LANGFUSE_HOST/PROJECT/PUBLIC_KEY/SECRET_KEY` 在位。
  - 项目 `CLAUDE.md` Langfuse 节：§15 r1.16 加载模型、label 约定、promote 闸、`--check` 漂移哨兵 + 回灌纪律。
  - `knowledge/asset-generation/README.md`：纠正过时 Phase-8 草稿（曾误称 loop 仍接 placeholder、只列 8/12 skill、称 matting/cutout 未注册）→ 现 Phase-14 + Langfuse-first 真实态；ep-sprite-spec 缺体显式标注。
- [~] **bootstrap 完成：production label 齐 + 端到端通** —— **本环境不可执行（无凭据），转 runbook（见下）**。另：clean bootstrap 还被预存的 `ep-sprite-spec.md` 缺体阻塞（已独立 spawn 修复任务）。非本计划代码缺陷。

## S5 Bootstrap Runbook（凭据环境执行）

前置：`ep-sprite-spec.md` 缺体任务完成（否则 `sync` 会对该条报 `missing-local`、整体非 0）。

1. 配 `LANGFUSE_PUBLIC_KEY`/`SECRET_KEY`（env 或 `.env`）。
2. `agent skills sync asset-generation --label staging` —— 12 条本地 body 推 staging。
3. Langfuse Web UI 人工抽验若干 body（diff vs git）。
4. `agent skills sync asset-generation --label production` —— 过 D5 promote 闸后写 production label。
5. 验证：`agent skills sync asset-generation --check` 退出码 0（git==Langfuse production）。
6. 端到端：经 REST `/assets/create` 产一个非 music kind，确认走 Langfuse body；Langfuse 临时改 staging 不影响 production；改 production 后约 1 TTL（默认 60s）内生效；停 Langfuse → 回退本地仍出图。
7. CI 接 `agent skills sync asset-generation --check` 作漂移门禁。

## 偏差与遗留

- **`ep-sprite-spec.md` 缺体**：预存 B1 债（commit `fd30d52` 注册名、`b216a7b` 只补了 outfit-anchor 体）。clean HEAD 复现，**非本改动引入**。已通过 spawn 开独立修复任务；README 已标注。
- **golden-asset 内容质量 eval**：D8 / §15 r1.16 开放后续项，本计划明确不覆盖，另起。
- **production promote / 实时 bootstrap**：需凭据环境 + 人工 go-live 判断（D7 设计即如此），不在无凭据环境自动执行。
