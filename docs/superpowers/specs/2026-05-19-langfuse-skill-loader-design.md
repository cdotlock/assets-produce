# assets-produce — Langfuse Skill-Body Loader 设计

> 设计文档（非 phase plan）。2026-05-19。
> 治理：主 spec [§15 行 1.16](2026-04-29-assets-produce-spec.md#15-修订记录)。回归并落地 §2 原则 4 / §5.2。
> 实施：[`2026-05-19-langfuse-skill-loader-plan.md`](2026-05-19-langfuse-skill-loader-plan.md)。

---

## 1. 一句话

把 asset-generation 的 11+ 个 skill body 的「正本来源」从「只读本地文件」改为「Langfuse `production` label 优先 + 本地兜底」，使维护者能在 Langfuse 热改/版本管理/staging→production 切换而不部署，**同时不把「改错一个字全体创作者崩」的风险带进生产**。

## 2. 背景：这是回归原始设计，不是推翻

- 主 spec **§2 原则 4 标题即「Skill body 在 Langfuse」**；**§5.2** 明文：「Langfuse 存 skill body；编辑/版本/A-B 全在 Langfuse Web UI；切换 production/staging 通过 label，不需要改代码」。
- 当前 asset-generation loader（`llm-generator.ts` `defaultLoadSkill`）只读 `knowledge/asset-generation/<name>.md`，是 **Phase-8 草稿 + Phase-14（§15 r1.14）明确延后** 的债（「Langfuse 仍按需上传不在本 phase」），**不是** 设计终态。
- 因此本设计 = 偿还 1.14 延后的 Langfuse 半截，**回归 §2/§5.2**。

## 3. 关键事实：skill body 是可执行控制流，不是普通 prompt

`llm-generator.ts` `parseAllowlist` 从 body 的 `## Atomic tools (allowed)` 段解析工具白名单；解析为空 → `SkillInfeasibleError` → `GENERATION_REJECTED`。一次格式破坏的编辑 = 该 kind 的素材生产对**全体创作者**当场失效。这决定了所有护栏的必要性。

## 4. Council 结论与采纳

四声独立评审（Architect/Skeptic/Pragmatist/Critic）+ brainstorming：

- **采纳**：(a) Langfuse 的 staging/production label + 版本历史，确实消解「即时无审查上线、无回滚、无版本管理」——这是 §5.2 本就规定的机制；(b) sync 命令尚不存在是真实排序问题 → 列为计划第一步；(c) skill body = 带 allowlist 的控制流 → 必须有 promote 前防灾闸。
- **采纳为开放后续项（不阻塞本轮）**：内容质量回归闸（golden-asset eval）——staging 人眼只挡得住「整张废」，挡不住「静默变差」。记入 §15 r1.16 开放项，另起独立计划。
- **据 spec 纠正 council**：council 未持有 spec 文本（反锚定），其「削弱架构不变量」论点事实上反了——不变量是 *Langfuse 存储*，本地-only 才是临时偏离。

## 5. 决策（D1–D8）

| # | 决策 |
|---|---|
| D1 | loader 优先取 Langfuse `skill_<name>` 的 **`production`** label；miss/error/timeout → 回退本地 `knowledge/asset-generation/<name>.md`。**Langfuse 不可达绝不 hard-fail job。** |
| D2 | `knowledge/asset-generation/*.md` 仍是 git 受审查正本 + 离线兜底 + 首推种子。Langfuse `production` 是热改生产层。 |
| D3 | 二者偏离由 **parity-check** 显式标记（`--check` / CI），git 不撒谎；回灌纪律由该检查兜底，不靠人记。 |
| D4 | 新增 `agent skills sync asset-generation [--label staging\|production] [--check]`；复用 `langfuse.createPrompt` + `promptKeyFor`。asset-generation 是 system-profile 固定 const（`ASSET_GENERATION_SKILLS`），**不进 `skills` DB 表**（与 creator Skill DB 系统隔离）。 |
| D5 | **promote 到 `production` 前强制 allowlist 解析校验**（`parseAllowlist` 必须 ≥1 已知工具），否则拒绝写 `production` label。防灾闸。 |
| D6 | loader 加短 TTL 进程内缓存（默认 ~60s，env 可调）。热改约 1 TTL 内生效；不每 job 打 Langfuse、不把 job 延迟耦合 Langfuse。 |
| D7 | label 约定：`production` = 线上 loader 读的；`staging` = 编辑先落点；promote = 在 Langfuse 把 `production` 指向校验过的版本（Langfuse 原生，无需改代码——即 §5.2）。 |
| D8 | golden-asset 内容质量 eval = 开放后续项，本轮不做、不删；先用 D5 挡灾难性破坏。 |

## 6. 范围

**做**：asset-generation 11+ system-profile body 的加载源切换 + sync/parity CLI + promote 防灾闸 + 缓存 + 文档（`.env.example`/README/CLAUDE.md skill 说明）。

**不做 / 不改**：§11.4 任何对外接口（无新 AssetKind / 无 REST / DB schema / error code）；§2 原子能力 + skill 编排原则（喂给 loop 的 body 同形，零 loop / 零原子工具改动）；Phase 14 状态机；creator Skill DB 系统；golden-asset eval（开放后续）。

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Langfuse 编辑破坏 allowlist → 全 kind 失效 | D5 promote 前解析闸 + D1 本地兜底（旧 `production` 版本仍在，可一键回退 label） |
| Langfuse 宕机 → 阻断生产 | D1 永不 hard-fail，回退本地 git 正本 |
| git 与 Langfuse 漂移、git 变虚构 | D2 git 仍正本 + D3 parity-check 显式标记 |
| 每 job Langfuse 往返拖慢/耦合 | D6 TTL 缓存 |
| 静默质量变差（人眼漏检） | 记为 §15 r1.16 开放后续项（golden-asset eval），D5 仅挡灾难 |
| 凭据缺失（`LANGFUSE_PUBLIC_KEY`/`SECRET_KEY`） | D1 退化为「纯本地」（= 现状），不回归、不崩 |

## 8. 关联

- 主 spec：§2 原则 4、§5.2、§11.4、§15 r1.14（本债来源）、r1.16（本决策）。
- 注入缝：`agent/packages/opencode/src/business/asset-service/llm-generator.ts`（`LlmGeneratorOverrides.loadSkill` / `defaultLoadSkill`）。
- Langfuse 客户端：`src/langfuse/langfuse.ts`（`getPrompt(name,{label,version})` / `createPrompt(name,body,{label})`，默认 label `production`，已具备）。
- 实施计划：`2026-05-19-langfuse-skill-loader-plan.md`。
