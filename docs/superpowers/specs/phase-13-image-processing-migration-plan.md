# Phase 13 — 图片处理大套迁移 Plan

> Spec ref: [§ 10 Phase 13](2026-04-29-assets-produce-spec.md#phase-13--图片处理大套迁移-112) / [§ 15 row 1.12](2026-04-29-assets-produce-spec.md#15-修订记录)
> Design doc: [2026-05-15-audio-and-asset-parity-design.md](2026-05-15-audio-and-asset-parity-design.md) § 6
> Date: 2026-05-15
> 前置依赖：Phase 9 完成（`tools/` 顶层 + 共用约定 + `python-runner.ts` 桥就位）；Phase 12 完成（`oss-put` 原子工具就位，迁入工具经它拿 OSS URL）。

## 0. Decision Table

| Item | Decision | Reason |
|---|---|---|
| 迁移范围 | 按文件评估，只搬「能独立产视觉产物的纯素材生产件」（matting/MODNet、cutout、hole_fill、green_spill/rgb_unspill、hybrid_to_webp 等）；编排/胶水/与 backend 业务耦合件**不迁** | 设计 §6；master spec §10 Phase 13「不迁全部子目录」 |
| 实现语言 | Python（原型保持）+ Bun atomic tool 外壳 | 沿用 Phase 9；重写 TS 风险大无收益 |
| Python 环境 | 每 tool 自带 venv + `requirements.txt`；重 ML（torch/MODNet）依赖隔离 | 设计 §9.5；各工具依赖冲突 |
| mock 模式 | **强制**：每 tool `--mock` 必须在无 GPU / 无模型权重环境跑通（确定性占位产物）| 设计 §9.5；master spec §10 Phase 13 验收 |
| atomic tool 注册 | 能产视觉产物者注册原子工具，输出经 Phase 12 `oss-put` 拿 URL；判定/检测类（如 `detect_matting_failures`）不注册，仅离线 CLI | master spec §10；沿用 Phase 9 `oss-sync` 不挂逻辑 |
| 工具样板 | atomic 外壳严格复刻 `generate-video-seedance.ts` + `.txt`；Python 入口照 Phase 9 `tools/README.md` 共用约定（JSON I/O + `--mock` + stdout JSON only） | 设计 §3「严格对等」 |
| backend 文件处理 | 加 DEPRECATED 注释 + 单独 commit；**不删除** | 设计 §6；沿用 Phase 9 §1.6 体例 |
| backend push | 跨 namespace（`cdotlock/moonshort-backend`），push **必须** backend 维护方明确 ack | 全局 CLAUDE.md push 政策；沿用 Phase 9/10 |
| AssetKind | **不新增**（迁入件是后处理/抠图，非独立 kind）；若调研发现独立 kind 必要 → 走 §15 修订再加，不擅自 | 设计 §6；红线（不偏离 spec） |
| placeholderGenerator | **不碰**（经 REST API 仍 stub） | 设计 §2.2 选项 B |
| 迁移顺序 | Step 1 调研定清单 → 先 matting（最复杂，建立 ML venv + mock 模板）→ 逐件复用模板 | 沿用 Phase 9「先打通最复杂件」 |

## 1. Deliverables

### 1.1 调研产物（执行前置，落 `docs/superpowers/specs/phase-13-survey.md`）

- `moonshort-backend/generate-upscale-matting/` 全目录树
- 逐文件判定表：`迁 / 不迁`、`产视觉产物（注册原子工具）/ 检测判定（仅 CLI）/ 不迁（编排胶水）`、依赖、env
- 候选清单（设计 §6 列出，待调研确认）：matting/MODNet、cutout、hole_fill、green_spill/rgb_unspill、detect_matting_failures、hybrid_to_webp
- 各文件隐式 import 路径（`grep` 全 import，防 sys.path 相对引用迁移后断）
- backend Python 版本要求（`.python-version` / `pyproject.toml` / `setup.py`）

### 1.2 迁入工具（按 §1.1 清单逐件，每件统一结构）

每件迁入工具产出：

- `tools/<name>/README.md`（1 条 happy path + env 列表 + mock 示例）
- `tools/<name>/requirements.txt`（列原 backend 实际依赖；重 ML 件含 torch/MODNet）
- `tools/<name>/<name>.py`（从 backend 对应文件迁；入口规范化为 JSON I/O：stdin 或 `--input <path>`，stdout JSON only，stderr error JSON，`--mock` flag；保留原内部算法逻辑不重写）
- `tools/<name>/.gitignore`（忽略 `.venv/` / `__pycache__/` / 输出）

### 1.3 atomic tool 外壳（仅「产视觉产物」件）

- `agent/packages/opencode/src/tool/asset/<name>.ts` + `.txt`（形状照 seedance；`never` 错误通道）
- 内部：拉 OSS 输入到本地临时目录 → 经 `python-runner.ts` 桥调 `tools/<name>/<name>.py` → 产物经 Phase 12 `oss-put` 拿 OSS URL → 返回
- `registry.ts` 3 处静态注册（import / `Tool.init` / `builtin[]`）
- `agent tools list` 可见；`agent tools show <name>` schema 完整

### 1.4 skill body（仅当该工具是独立 asset 生产/后处理手段）

- `knowledge/asset-generation/<name>-spec.md`（6 段式：Intent / Atomic tools / Inputs / Output / Failure / Boundary），Atomic tools 段串 `oss-put`，Output 段交付 OSS URL
- `knowledge/asset-generation/README.md` 补 Phase 13 状态行

### 1.5 backend DEPRECATED 注释

- `moonshort-backend/generate-upscale-matting/` 内被迁文件头部插入 DEPRECATED 注释 block（照 Phase 9 §1.6 文案：注明迁移目的地 `cdotlock/assets-produce/tools/<name>/`、保留仅作历史参考、删除权归 backend 维护方）
- backend 单独 commit；message 说明迁移目的地
- **本地 commit；push 必须 backend 维护方明确 ack**（沿用 Phase 9/10）

### 1.6 配置 / 文档

- `tools/README.md` 补迁入工具索引 + 与 atomic tool 对应表
- `SKILL.md`「可用素材生产工具」节补注册的新原子工具 + 离线 CLI 件
- `.env.example` 补迁入件实际读取的 env（block 标 `# Phase 13 — Image Processing`）
- `ERRORS.md` 补迁入原子工具错误码

## 2. Execution Steps

### Step 1 — 调研与现场清单

预期输出：

- `git status` 干净起点；`bun --cwd=agent run typecheck` / `test` 全过基线
- `moonshort-backend/generate-upscale-matting/` 实际目录树
- 逐文件判定表（迁/不迁 + 注册原子工具/仅 CLI/不迁 + 依赖 + env + 隐式 import）
- backend Python 版本要求
- 落 `docs/superpowers/specs/phase-13-survey.md`

测试：

- `find /Users/august/MobAI/moonshort-backend/generate-upscale-matting -maxdepth 3 -type f -name "*.py"`
- `grep -rn "os.environ\|os.getenv\|^import \|^from " /Users/august/MobAI/moonshort-backend/generate-upscale-matting/`
- `phase-13-survey.md` 存在，每文件有明确判定

### Step 2 — matting 迁移（锚件，建立 ML venv + mock 模板）

预期输出：

- `tools/matting/`（README + requirements + `matting.py` + .gitignore）就位
- `matting.py` JSON 入口规范化；`--mock` 写确定性占位产物（不依赖 GPU/MODNet 权重）
- 保留原 MODNet/matting 算法逻辑不重写
- 建立「重 ML 件 venv + mock」标准模板供后续件复用

测试：

- `tools/matting/` 建 venv → `pip install -r requirements.txt` 成功（或记录 torch 安装耗时/体积）
- `python tools/matting/matting.py --mock --input fixtures/matting-input.json` 输出有效 JSON + 占位产物非空
- mock 模式在无 GPU/无权重环境跑通（断言不 import 真实权重路径）

### Step 3 — matting atomic tool 外壳 + 注册 + oss-put 串接

预期输出：

- `agent/packages/opencode/src/tool/asset/matting.ts` + `.txt` 落盘
- 经 `python-runner.ts` 桥调；产物经 Phase 12 `oss-put` 拿 OSS URL
- `registry.ts` 3 处注册

测试：

- 单元：fake python runner + mock OSS → schema 正确 → 返回 OSS URL 形状
- `bun --cwd=agent run typecheck` 全过
- `agent tools list | grep matting`；`agent tools show matting --json | jq '.input'` schema 完整
- `bun --cwd=agent run test` 全过

### Step 4 — 逐件迁移其余「产视觉产物」件（cutout / hole_fill / spill / hybrid_to_webp 等，按 §1.1 清单）

预期输出（每件复用 Step 2+3 模板）：

- `tools/<name>/`（README + requirements + `<name>.py` + .gitignore），JSON 入口 + `--mock`
- 该件 atomic tool 外壳 + `.txt` + `registry.ts` 注册 + `oss-put` 串接

测试（每件）：

- venv install 成功
- `python tools/<name>/<name>.py --mock --input fixtures/<name>-mock.json` 输出有效 JSON
- 单元：fake python runner + mock OSS → 返回 OSS URL 形状
- `agent tools list | grep <name>`
- `bun --cwd=agent run typecheck` / `test` 全过

### Step 5 — 检测/判定类件（如 detect_matting_failures）仅离线 CLI

预期输出：

- `tools/<name>/`（README + requirements + `<name>.py`），JSON 入口 + `--mock`
- **不**注册原子工具（沿用 Phase 9 `oss-sync` 决策：检测判定不让 LLM 直调）
- README 给 1 条 CLI happy path + mock 示例

测试：

- venv install
- `python tools/<name>/<name>.py --mock --input fixtures/<name>-mock.json` 输出有效判定 JSON
- 确认 `registry.ts` **未**注册（`agent tools list | grep <name>` 应无)

### Step 6 — skill body（仅注册为原子工具且是独立后处理手段的件）

预期输出：

- 对应 `knowledge/asset-generation/<name>-spec.md` 6 段式 ≥ 30 行，Atomic tools 段串 `oss-put`
- `README.md` 补 Phase 13 状态行

测试：

- `wc -l knowledge/asset-generation/<name>-spec.md` ≥ 30
- `intent-to-skill` mock LLM 能识别新 skill name（若该件成独立 skill）
- markdown lint 无破损

### Step 7 — backend DEPRECATED 注释

预期输出：

- `moonshort-backend/generate-upscale-matting/` 内被迁文件加 DEPRECATED 注释 block
- backend 单独 commit；message：`chore(deprecated): mark image-processing tools as migrated to assets-produce/tools/`

测试：

- `grep -rl "DEPRECATED" /Users/august/MobAI/moonshort-backend/generate-upscale-matting/` 列出所有标记文件，与 §1.1 迁移清单一致
- 文件功能未变（仅加注释；Python 语法保持有效，`python -c "import ast; ast.parse(open(f).read())"` 通过）
- backend 仓 `git diff --stat` 仅注释行变化
- **backend push 本 phase 不做**，留待 backend 维护方 ack（沿用 Phase 9/10）

### Step 8 — 配置与文档

预期输出：`tools/README.md` / `SKILL.md` / `.env.example` / `ERRORS.md` 更新

测试：

- `grep -c "Phase 13 — Image Processing" .env.example` ≥ 1（若有新 env）
- 注册的新原子工具名在 `SKILL.md` 可 grep 到
- `tools/README.md` 含迁入件 ↔ atomic tool 对应表

### Step 9 — Acceptance 自检 + verification

预期输出：

- 跑全部 Phase 13 验收项（§5）
- 写 `phase-13-image-processing-migration-verification.md` 逐条打勾或解释偏差

测试：见 §5 Acceptance Checklist

### Step 10 — Commit / Push

预期输出（assets-produce 仓，atomic commit 切分）：

1. 每个迁入 `tools/<name>/`（Python 件）各一 commit
2. 每个 atomic tool 外壳 + 注册 + oss-put 串接 各一 commit
3. skill body（按件）
4. `tools/README.md` + `SKILL.md` + `.env.example` + `ERRORS.md`
5. verification report

预期输出（moonshort-backend 仓，单独 commit；push 推迟）：

6. DEPRECATED 注释 block（一次 commit）

测试：

- `git log --oneline main..HEAD` 每 commit 单一变更面
- 各 commit `typecheck` / `test` 不破坏
- assets-produce `git push origin main`（remote cdotlock；assets-produce 已预授权）
- backend push **必须** backend 维护方明确 ack（无 ack 则本地保留 commit，记入 verification）

## 3. Risks

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 重 ML 依赖（torch/MODNet）体积大 / venv 隔离失败 | 中 | 中 | 每 tool 独立 venv；requirements 固定版本；Step 2 先打通 matting 锚件记录体积/耗时 |
| mock 模式仍依赖 GPU / 模型权重，CI 无法跑 | 中 | 高 | 每 tool `--mock` 写确定性占位产物（如直接 copy 输入 / 1x1 png）；断言 mock 路径不 import 权重 |
| backend 内部隐式 import 路径迁移后断 | 中 | 中 | Step 1 grep 全 import；迁移时整理为同目录内引用 |
| 检测/判定类件被误注册为原子工具 | 中 | 中 | Step 5 显式不注册；Decision Table 写死判定标准；code-review 复核 |
| 迁移范围判定主观 / 漏迁或多迁 | 中 | 中 | Step 1 survey 把每文件判定写入 `phase-13-survey.md`，code-review 复核范围 |
| backend push 被维护方拒绝或无响应 | 中 | 低 | 本地 commit 留，不阻塞 assets-produce phase；verification 记 push 状态 |
| atomic 外壳把 Python stdout 解析错（混入 print）| 中 | 中 | `<name>.py` 严格 stdout JSON only，任何其它输出走 stderr（沿用 Phase 9 约定）|

## 4. Out-of-Scope（本 phase 不做）

- 迁 `moonshort-backend/generate-upscale-matting/` 全部子目录（只迁 §1.1 判定为「纯素材生产件」的）
- 真实删除 backend 内对应文件（删除权归 backend 维护方）
- 把检测/判定/编排胶水类注册为原子工具
- 碰 `placeholderGenerator` / asset-service 注入点（经 REST API 仍 stub）
- 新增 AssetKind（除非 §15 修订明确批准）
- CI 接 Python pytest / linter（本 phase 仅本地跑通，CI 集成留以后）
- 引入共享 npm/pip 包；把 `tools/` 抽成独立 git submodule

## 5. Acceptance Checklist（对齐 master spec §10 Phase 13）

- [ ] 迁入工具跑通 fixture（`--mock` 模式无需 GPU / 模型权重）
- [ ] 注册的原子工具在 `agent tools list` 出现，`agent tools show <name>` schema 完整
- [ ] 注册工具输出经 Phase 12 `oss-put` 拿 OSS URL
- [ ] 单元 / mock ≥ 80% 行覆盖
- [ ] 检测/判定类件未注册为原子工具（仅离线 CLI）
- [ ] backend 对应文件加 DEPRECATED 注释，单独 commit，**不删**（push 状态记入 verification）
- [ ] `bun --cwd=agent run typecheck` / `bun --cwd=agent run test` 全过；`bun --cwd=web run typecheck` / `bun --cwd=web run build` 全过
- [ ] `phase-13-image-processing-migration-verification.md` 完成
- [ ] assets-produce 所有 atomic commit push 到 origin/main；backend push 必须 backend 维护方 ack
