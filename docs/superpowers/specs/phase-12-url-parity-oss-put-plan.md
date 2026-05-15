# Phase 12 — URL 对等 + oss-put Plan

> Spec ref: [§ 10 Phase 12](2026-04-29-assets-produce-spec.md#phase-12--url-对等--oss-put-112) / [§ 15 row 1.12](2026-04-29-assets-produce-spec.md#15-修订记录)
> Design doc: [2026-05-15-audio-and-asset-parity-design.md](2026-05-15-audio-and-asset-parity-design.md) § 5
> Date: 2026-05-15
> 前置依赖：Phase 9 完成（`cg-render` / `upscale-image` 原子工具 + `cg-render-spec.md` 已落地，`tools/` + `python-runner.ts` 桥就位）；Phase 2 OSS 服务（`agent/packages/opencode/src/oss/oss.ts`）。**与 Phase 11 独立**（Phase 11 音频工具内联调 OSS，不经 oss-put）。

## 0. Decision Table

| Item | Decision | Reason |
|---|---|---|
| 范围 | 单文件 `oss-put` 原子工具 + 经 skill 编排补 `cg-render` / `upscale-image` 的 OSS URL 对等 | 设计 §5；master spec §10 Phase 12 |
| `oss-put` 实现 | 薄壳复用 Phase 2 OSS 服务（`src/oss/oss.ts`）：本地路径 → OSS https URL | 设计 §5；不重写上传逻辑，与 Phase 11 音频内联同源 |
| URL 对等手段 | 在 **skill body**（`cg-render-spec.md` / 新 `upscale-spec.md`）里串一步 `oss-put`，不在 `cg-render.ts` / `upscale-image.ts` 工具内硬接 OSS | 守 §2「原子能力 + skill 编排」红线（工具内硬接 = 硬编码流水线） |
| 工具样板 | `oss-put` 严格复刻 `generate-video-seedance.ts` + `.txt`（Effect + Schema + `never` 错误通道） | 设计 §3「严格对等」 |
| `cg-render.ts` / `upscale-image.ts` 工具本体 | 输出维持 local path（**不改工具本体语义**，除非 typecheck 需要） | 设计 §5；改 skill 编排而非改工具 |
| `oss-sync` | 维持现状，**不**注册为原子工具 | 沿用 Phase 9 决策（LLM 不应决定批量目录上传） |
| AssetKind | **不新增**（`cg` 已有；upscale 是后处理，不单独成 kind） | 设计 §5 |
| placeholderGenerator | **不碰**（经 REST API 仍 stub，与视频一致） | 设计 §2.2 选项 B |
| 真实调用 | 测试一律 mock OSS；fixture/dev key 手动 verify 不入测试套件 | 沿用 Phase 8/9/11 惯例 |

## 1. Deliverables

### 1.1 `oss-put` 原子工具

- `agent/packages/opencode/src/tool/asset/oss-put.ts`
- `agent/packages/opencode/src/tool/asset/oss-put.txt`（LLM 描述 sidecar，照 `generate-video-seedance.txt` 体例）
- 形状照 seedance：`Tool.define` + `Effect.gen` + Schema 输入校验 + `never` 错误通道（错误折进结果不抛）
- 输入 schema：`local_path`（必填，校验在允许目录内、文件存在/非空）、可选 `oss_prefix`、可选 `content_type`、`dryRun`
- 内部：薄壳调 Phase 2 OSS 服务（`src/oss/oss.ts`）上传 → 返回裸 OSS https URL
- `dryRun` / `--mock`：不调真实 OSS，返回确定性占位 URL

### 1.2 工具注册

- `agent/packages/opencode/src/tool/registry.ts`：`oss-put` 3 处静态注册（import / `Effect.all` 内 `Tool.init` / `builtin[]` push）
- `agent tools list` 出现 `oss-put`；`agent tools show oss-put` 输出完整 schema

### 1.3 `cg-render-spec.md` skill body 更新（编排补 OSS URL）

- `knowledge/asset-generation/cg-render-spec.md`：
  - Atomic tools 段：`cg-render` 产本地路径后**必须**串一步 `oss-put` 拿 OSS URL
  - Output 段：最终交付物是 OSS https URL（非本地路径）
  - Failure 段：`oss-put` 失败的回退说明
  - 明确「产物必须经 `oss-put` 交付 OSS URL」一句（防 LLM 漏这步）

### 1.4 `upscale-spec.md` skill body 新建

- `knowledge/asset-generation/upscale-spec.md`（6 段式：Intent / Atomic tools / Inputs / Output / Failure / Boundary）
- Atomic tools：`upscale-image` → `oss-put`；Output：OSS https URL
- Phase 9 仅落了 `cg-render-spec.md`，本 phase 补 upscale 专属 skill body

### 1.5 文档

- `knowledge/asset-generation/README.md` 补一行：Phase 12 后 cg-render/upscale 经 skill 编排串 `oss-put` 交付 OSS URL
- `SKILL.md`「可用素材生产工具」节补 `oss-put`
- `ERRORS.md` 补 `oss-put` 错误码（路径不存在 / 路径越权 / OSS 上传失败 / 鉴权失败）
- `.env.example`：若 `oss-put` 读取新 env 才补；Phase 2 已有的 OSS env 不重复

## 2. Execution Steps

### Step 1 — Baseline & 现场确认

预期输出：

- `git status` 干净起点；`bun --cwd=agent run typecheck` / `test` 全过基线
- 确认 `cg-render.ts` / `upscale-image.ts` 当前输出 local path 的事实（设计 §1.2 引 `cg-render.ts:218 output: localPath`）
- 确认 `src/oss/oss.ts` 对外接口签名（与 Phase 11 §1.1 复用同一记录）
- 确认 Phase 9 落的 `cg-render-spec.md` 现状内容（避免覆写丢信息）

测试：

- `bun --cwd=agent run typecheck` 全过
- `bun --cwd=agent run test` 全过
- `agent tools list | grep -E "cg-render|upscale-image"` 两工具在册
- `grep -n "localPath\|local_path" agent/packages/opencode/src/tool/asset/cg-render.ts` 确认现状

### Step 2 — `oss-put` 原子工具（TDD）

预期输出：

- `oss-put.ts` + `.txt` 落盘，形状对齐 seedance 模板
- 输入 schema 卡边界（路径存在 / 非空 / 允许目录内 / dryRun）
- 薄壳调 Phase 2 OSS 服务、返回 OSS URL
- 错误折进结果（`never` 通道）

测试：

- 单元：mock OSS → 本地临时文件 → 断言返回 OSS https URL 形状
- schema 测试：路径不存在 / 空文件 / 路径穿越（`../`）→ schema 或前置校验拒绝
- `dryRun` 路径：确定性占位 URL，不触发 OSS
- 错误折叠：OSS 鉴权失败 / 5xx → 不抛、`metadata.error=true`
- `bun --cwd=agent run typecheck` 全过

### Step 3 — `oss-put` 注册

预期输出：`registry.ts` 3 处注册

测试：

- `agent tools list | grep oss-put`
- `agent tools show oss-put --json | jq '.input'` schema 完整
- `bun --cwd=agent run test` 全过

### Step 4 — `cg-render-spec.md` skill body 更新

预期输出：

- `cg-render-spec.md` Atomic tools / Output / Failure 段更新为「cg-render → oss-put → OSS URL」编排
- 明确「产物必须经 oss-put 交付 OSS URL」

测试：

- `intent-to-skill`（Phase 8 已落地）mock LLM + 一条 `kind=cg` input → 选中 `cg-render-spec`
- 人工读 `cg-render-spec.md`：Output 段交付物是 OSS URL 而非 local path
- markdown lint 无破损

### Step 5 — `upscale-spec.md` skill body 新建

预期输出：`upscale-spec.md` 6 段式 ≥ 30 行有内容

测试：

- `wc -l knowledge/asset-generation/upscale-spec.md` ≥ 30
- `intent-to-skill` mock LLM 能识别 `upscale-spec`
- markdown lint 无破损

### Step 6 — 配置与文档

预期输出：`README.md` / `SKILL.md` / `ERRORS.md`（+ `.env.example` 若有新 env）更新

测试：

- `grep -c "oss-put" SKILL.md` ≥ 1
- `grep -c "oss-put" ERRORS.md` ≥ 1
- `grep -c "Phase 12" knowledge/asset-generation/README.md` ≥ 1

### Step 7 — CLI/Session e2e（用户本机一条，fixture/dev key）

预期输出：

- `agent` 会话加载 `cg-render-spec` → LLM 跑 `cg-render`（mock 或 dev key）→ 串 `oss-put` → 最终输出 OSS https URL
- 同 `upscale-spec` → `upscale-image` → `oss-put` → OSS https URL

测试：

- 本机 session 跑 `cg-render-spec` / `upscale-spec`，最终交付物断言为 OSS https URL（不是 local path）
- 沿用 Phase 10 惯例：CI 不要求 e2e

### Step 8 — Acceptance 自检 + verification

预期输出：

- 跑全部 Phase 12 验收项（§5）
- 写 `phase-12-url-parity-oss-put-verification.md` 逐条打勾或解释偏差

测试：见 §5 Acceptance Checklist

### Step 9 — Commit / Push

预期输出（atomic commit 切分）：

1. `oss-put` 工具 + `.txt`
2. `oss-put` 注册
3. `cg-render-spec.md` 编排更新
4. `upscale-spec.md` 新建
5. `README.md` + `SKILL.md` + `ERRORS.md`（+ `.env.example` 若改）
6. verification report

测试：

- `git log --oneline main..HEAD` 每 commit 单一变更面
- 各 commit `typecheck` / `test` 不破坏
- `git push origin main`（remote cdotlock；assets-produce 已预授权）

## 3. Risks

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| skill 编排串 `oss-put` 时 LLM 漏掉这步，仍交本地路径 | 中 | 中 | skill body 明确写「产物必须经 oss-put 交付 OSS URL」；e2e 断言最终输出是 OSS URL |
| 误把 OSS 上传硬接进 `cg-render.ts` / `upscale-image.ts` 工具本体（违 §2 红线）| 中 | 高 | Decision Table 写死「工具本体不改，只改 skill 编排」；code-review 专项检查 |
| `oss-put` 与 Phase 11 音频内联 OSS 重复实现 | 中 | 低 | 两者都复用同一 `src/oss/oss.ts` 服务，不重写上传逻辑 |
| 本地路径越权 / 路径穿越（`../` 逃逸）| 低 | 中 | schema 前置校验路径在允许目录内，拒绝 `..` 段 |
| 改写 `cg-render-spec.md` 丢失 Phase 9 已有信息 | 低 | 中 | Step 1 先记录现状；Step 4 增量改 Atomic tools/Output/Failure 段，不整文件覆写 |

## 4. Out-of-Scope（本 phase 不做）

- `oss-sync`（批量目录上传）注册为原子工具（沿用 Phase 9 决策）
- 新增 AssetKind
- 碰 `placeholderGenerator` / asset-service 注入点（经 REST API 仍 stub）
- 改 `cg-render.ts` / `upscale-image.ts` 工具本体输出语义（用 skill 编排补 URL，不改工具）
- 引入共享 npm/pip 包；要求 CI E2E

## 5. Acceptance Checklist（对齐 master spec §10 Phase 12）

- [ ] `oss-put` 在 `agent tools list` 出现，`agent tools show oss-put` 输出 schema 完整
- [ ] `cg-render` / `upscale-image` 经 skill 编排最终产出 OSS URL（fixture/dev key）
- [ ] 单元覆盖 `oss-put` happy / 错误 ≥ 80% 行覆盖；mock OSS
- [ ] `bun --cwd=agent run typecheck` / `bun --cwd=agent run test` 全过；`bun --cwd=web run typecheck` / `bun --cwd=web run build` 全过
- [ ] `knowledge/asset-generation/upscale-spec.md` ≥ 30 行；`cg-render-spec.md` 已更新为编排串 `oss-put`
- [ ] 未新增 AssetKind；未改 `cg-render.ts` / `upscale-image.ts` 工具本体输出语义；未碰 `placeholderGenerator`
- [ ] `phase-12-url-parity-oss-put-verification.md` 完成
- [ ] 所有 atomic commit push 到 origin/main
