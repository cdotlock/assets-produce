# Phase 9 — Asset 工具迁移（CG / OSS-sync / upscale）Plan

> Spec ref: [§ 10 Phase 9](2026-04-29-assets-produce-spec.md#phase-9--asset-工具迁移cg--oss-sync--upscale--110) / [§ 15 row 1.10](2026-04-29-assets-produce-spec.md#15-修订记录)
> Design doc: [2026-05-14-three-repo-asset-integration-design.md](2026-05-14-three-repo-asset-integration-design.md) § 11 Phase 9
> Date: 2026-05-14
> 前置依赖：Phase 8 完成（AssetService / atomic tool 注册框架就位）

## 0. Decision Table

| Item | Decision | Reason |
|---|---|---|
| 迁移范围 | 三件：CG 渲染 / OSS 批量上传 / upscale | 设计 §7.3 列出 backend 内 "纯素材生产工具"；其余子目录评估后留给 backend 维护方 |
| 实现语言 | Python（原型保持）；外壳用 Bun atomic tool 包装 | cg_render.py / sync_to_oss.py 原本就是 Python；重写为 TS 风险大且无收益；包装层让 opencode agent 能调 |
| Python 环境 | 每个 tool 自带 venv + requirements.txt；不污染仓库根 | 各工具依赖不同，集中 venv 会冲突 |
| 顶层目录 | 新增 `tools/` 顶层目录 | 设计 §11 Phase 9；与 `videoctl/` 同级；外部工具的统一存放地 |
| atomic tool 注册 | `cg-render` 与 `upscale-image` 注册为 atomic tool；`oss-sync` 仅离线 CLI，**不**注册 | 设计 §11 Phase 9："oss-sync 不让 agent 直调" |
| Skill body 衔接 | Phase 8 已落地 `cg-render-spec.md` 草稿；本 phase 把它改为引用新 atomic tools；其他 skill 不动 | 设计 §11 Phase 9 |
| Backend 文件处理 | 加 DEPRECATED 注释 + 单独 commit；**不删除** | 设计 §7.3：删除留给 backend 维护方 |
| 真实 ZENMUX 调用 | 测试用 stub；dev key 可手动 verify 但不入测试套件 | 减少外部依赖与成本；设计 §11 Phase 9 acceptance #1 |
| Migration 顺序 | cg-render → oss-sync → upscale | cg-render 最复杂（依赖 render-with-style.py）；先把它打通其他两件复用模式 |

## 1. Deliverables

### 1.1 顶层目录 `tools/`

```
tools/
├── README.md                  # 三个 tool 索引 + 共用约定
├── cg-render/
│   ├── README.md
│   ├── requirements.txt
│   ├── render.py              # 从 moonshort-backend/generate-upscale-matting/cg_render.py 迁移
│   ├── render-with-style.py   # 依赖文件（如原 backend 有）
│   └── .gitignore             # 忽略 venv / 输出
├── oss-sync/
│   ├── README.md
│   ├── requirements.txt
│   └── sync.py                # 从 _local_tools/sync_to_oss.py 迁移
└── upscale/
    ├── README.md
    ├── requirements.txt
    └── upscale.py             # 从 backend upscale 工具迁移
```

### 1.2 共用约定（`tools/README.md`）

- 每个 tool 自带 venv（`tools/<name>/.venv/`，gitignore）
- 入口约定：每个 tool 提供 `<name>.py` 主脚本，接受 JSON 形态参数（stdin 或 `--input <path>`），输出 JSON 到 stdout
- 错误：非零 exit code + stderr JSON `{ error: { code, message } }`
- 环境变量从 `.env` 注入（不在脚本内硬编码）
- 不在工具内调 OSS 上传（除 oss-sync 本身）—— 输出 local path，由调用方决定 OSS

### 1.3 cg-render tool

#### 1.3.1 文件迁移

- `moonshort-backend/generate-upscale-matting/cg_render.py` 内容迁到 `tools/cg-render/render.py`
- `moonshort-backend/generate-upscale-matting/render-with-style.py` 同迁（若 backend 现存）
- requirements.txt 列原 backend 实际依赖（参考 backend 仓 requirements 或脚本 import）
- env：`ZENMUX_API_KEY`、`ZENMUX_BASE_URL`（默认 ZENMUX 官方）

#### 1.3.2 入口规范化

- 调整 `render.py` 主入口接受 JSON：
  - `{ scene_spec_path, style_ref_paths[], output_dir, model? }`
  - 输出 `{ outputs: [{ path, kind }], meta: { model, latency_ms } }`
- 保留原内部逻辑（不重写 prompt 构造、参数选择）

#### 1.3.3 atomic tool 包装

- `agent/packages/opencode/src/tool/cg-render.ts`
- 工具 schema（zod）：
  - 输入：scene spec markdown / style ref OSS urls / output prefix
  - 输出：OSS url 列表 + meta
- 实现：
  - 把 OSS urls 拉到本地临时目录
  - 调 `python tools/cg-render/render.py --input <json>`
  - 把输出文件 OSS put（复用现有 `oss-put` tool 函数）
  - 返回 OSS urls
- 注册到 opencode 工具表（参考 Phase 3 generate-image-nanobanana 注册方式）
- `agent tools list` 后 `cg-render` 可见
- `agent tools show cg-render` 输出 schema

#### 1.3.4 cg-render-spec 更新

- 改 `knowledge/asset-generation/cg-render-spec.md`：
  - "首选 atomic tool: cg-render"
  - "回退：generate-image-nanobanana + 手动 ref 拼接"
  - 输入约定与 §1.3.2 入口对齐

### 1.4 oss-sync tool

#### 1.4.1 文件迁移

- `moonshort-backend/generate-upscale-matting/_local_tools/sync_to_oss.py` → `tools/oss-sync/sync.py`
- requirements.txt 列依赖（如 `oss2`）
- env：`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_BUCKET`、`OSS_REGION`、`OSS_ENDPOINT`

#### 1.4.2 入口规范化

- 主入口接受 JSON：
  - `{ source_dir, oss_prefix, include_glob?, exclude_glob?, dry_run? }`
  - 输出 `{ uploaded: [{ local, key, etag }], skipped: [...], errors: [...] }`
- dry-run：不调用 OSS API，仅枚举要上传的文件

#### 1.4.3 不注册为 atomic tool

- 离线工具，从 CLI 调用：`python tools/oss-sync/sync.py --input <json>`
- README 给 1 条 happy path + 1 条 dry-run 示例

### 1.5 upscale tool

#### 1.5.1 文件迁移

- backend 中 upscale 工具迁过来；具体文件名以 backend 仓现状为准（执行阶段 first step：列 backend `generate-upscale-matting/` 目录，确认 upscale 工具实际入口）
- 通用模板与 cg-render 一致

#### 1.5.2 入口规范化

- 主入口接受 JSON：
  - `{ input_path, output_path, scale: 2|4, model? }`
  - 输出 `{ output: { path }, meta: { scale, latency_ms } }`

#### 1.5.3 atomic tool 包装

- `agent/packages/opencode/src/tool/upscale-image.ts`
- schema：
  - 输入：input OSS url + scale
  - 输出：upscaled OSS url + meta
- 实现：拉到本地 → 调 python → 上传 → 返回 url
- 注册到 opencode 工具表

### 1.6 moonshort-backend 内对应文件 DEPRECATED 注释

设计 §11 Phase 9 acceptance #5：**只标 DEPRECATED 不删**。

需要标记的文件（执行阶段以 backend 仓实际为准；以下是参考）：

- `moonshort-backend/generate-upscale-matting/cg_render.py`
- `moonshort-backend/generate-upscale-matting/render-with-style.py`（若存在）
- `moonshort-backend/generate-upscale-matting/_local_tools/sync_to_oss.py`
- backend upscale 工具入口文件

每个文件头部插入注释 block：

```
# DEPRECATED 2026-05-14
# This tool has been migrated to cdotlock/assets-produce/tools/<name>/.
# Kept here only for historical reference; do not invoke from new code.
# Removal is at the discretion of the moonshort-backend maintainer.
```

backend 单独 commit；commit message 说明迁移目的地。

### 1.7 配置 / 文档

- `.env.example` 在 assets-produce 内新增（block 标 `# Phase 9 — Asset Tools`）：
  - `ZENMUX_API_KEY=`
  - `ZENMUX_BASE_URL=https://zenmux.ai/api`（或 backend 实际值）
- `tools/README.md` 写：三件 tool 的关系 / 各自入口 / 共用约定 / 与 atomic tool 的对应表
- `SKILL.md` 在 Phase 8 已加 "对外 Asset API" 节后补一节 "可用素材生产工具"，列：
  - atomic tools: `cg-render`、`upscale-image`、已有的 `generate-image-*` / `generate-video-*`
  - 离线 CLI: `tools/oss-sync/sync.py`
- `knowledge/asset-generation/cg-render-spec.md` 同步指向新 atomic tool
- `knowledge/asset-generation/README.md` 补一条："Phase 9 后 cg-render / upscale 已挂上 atomic tool；scene-bg / character-portrait 仍走 generate-image-*"

## 2. Execution Steps

### Step 1 — 调研与现场清单

预期输出：

- 列 `moonshort-backend/generate-upscale-matting/` 实际目录树
- 确认三件工具实际文件名 / 入口 / 依赖
- 记录每个工具的 env 依赖（grep `os.getenv` / `os.environ`）
- 记录 backend 仓的 Python 版本要求（如有 `.python-version` / `setup.py` / `pyproject.toml`）

测试：

- `find /Users/august/MobAI/moonshort-backend/generate-upscale-matting -maxdepth 3 -type f -name "*.py"`
- `grep -r "os.environ\|os.getenv" /Users/august/MobAI/moonshort-backend/generate-upscale-matting/`
- 输出落到 plan-notes 文件 `docs/superpowers/specs/phase-9-survey.md`（plan 子文件，不入 spec 主目录）

### Step 2 — 顶层目录 `tools/` 与共用约定

预期输出：

- `tools/README.md` 写完
- `tools/.gitignore` 排除 `**/.venv/` 与 `**/__pycache__/`

测试：

- `tree tools/ -L 1`
- `cat tools/README.md | head -40` 内容合理

### Step 3 — cg-render 迁移

预期输出：

- `tools/cg-render/` 目录就位
- `tools/cg-render/render.py` 接受 JSON 入口；保留原内部逻辑
- `tools/cg-render/requirements.txt` 列依赖
- `tools/cg-render/README.md` 1 条 happy path + env 列表
- 用 stub mode（在 render.py 加 `--mock` flag；mock 时不调真实 ZENMUX）

测试：

- 在 `tools/cg-render/` 创建 venv → `pip install -r requirements.txt` 成功
- `python tools/cg-render/render.py --mock --input fixtures/cg-input.json` 输出有效 JSON
- 输出文件存在且非空（mock 模式写一个 1x1 占位 png 即可）

### Step 4 — cg-render atomic tool 包装

预期输出：

- `agent/packages/opencode/src/tool/cg-render.ts` 落盘
- 注册到 opencode 工具表
- 输入 schema 与 §1.3.3 对齐
- 内部用子进程调 `python tools/cg-render/render.py`；stdout JSON 解析
- 测试模式可注入 fake python runner（避免真起 venv）

测试：

- 单元：fake python runner 路径 → schema 正确 → OSS put 调用形态正确（mock OSS）
- `bun --cwd=agent run typecheck` 全过
- `bun --cwd=agent run test` 全过
- `agent tools list | grep cg-render`
- `agent tools show cg-render --json | jq '.input'` schema 完整

### Step 5 — oss-sync 迁移

预期输出：

- `tools/oss-sync/sync.py` 落盘
- 入口接受 JSON；dry-run 模式实现
- `tools/oss-sync/README.md` 1 条 dry-run + 1 条真实 upload 示例

测试：

- venv install
- `python tools/oss-sync/sync.py --input fixtures/sync-dryrun.json` 输出 `{ uploaded: [], skipped: [...] }` 形态正确
- 真实 upload 用 dev OSS bucket 跑 1 个文件 → 拿到 etag

### Step 6 — upscale 迁移

预期输出：

- `tools/upscale/upscale.py` 落盘
- 入口接受 JSON
- `tools/upscale/README.md`

测试：

- venv install
- `python tools/upscale/upscale.py --input fixtures/upscale-mock.json` 输出有效 JSON（mock 模式）

### Step 7 — upscale-image atomic tool 包装

预期输出：

- `agent/packages/opencode/src/tool/upscale-image.ts` 落盘
- 注册到工具表
- 单元测试覆盖 happy / 错误返回

测试：

- `bun --cwd=agent run typecheck` 全过
- `bun --cwd=agent run test` 全过
- `agent tools list | grep upscale-image`

### Step 8 — cg-render-spec skill body 更新

预期输出：

- `knowledge/asset-generation/cg-render-spec.md` 改写：
  - "首选 atomic tool: cg-render"
  - 输入 / 输出对齐
  - 失败回退说明

测试：

- intent-to-skill（Phase 8 已落地）用 mock LLM + 一条 "kind=cg, spec_md=..." input → 选中 `cg-render-spec`
- mini agent loop 跑（stub atomic tool）→ 成功路径写 Asset

### Step 9 — backend DEPRECATED 注释

预期输出：

- 在 `moonshort-backend` repo 中改 3-4 个文件，加 DEPRECATED 注释 block
- 单独 commit；message："chore(deprecated): mark CG/OSS-sync/upscale tools as deprecated (migrated to assets-produce/tools/)"

测试：

- `grep -l "DEPRECATED 2026-05-14" /Users/august/MobAI/moonshort-backend/generate-upscale-matting/` 列出所有标记文件
- 文件功能未变（仅加注释；语法保持有效）
- backend 仓内 `git diff --stat` 仅注释行变化

注意：

- backend 不是用户维护；push 必须先征得 backend 维护方明确同意（设计 §11 Phase 10 acceptance 同款 ack）
- 本 phase 仅做本地 commit；push 留到 Phase 10 一并征求 ack

### Step 10 — 配置与文档

预期输出：

- `.env.example` 加 2 个变量（`ZENMUX_*`）
- `SKILL.md` 加 "可用素材生产工具" 节
- `knowledge/asset-generation/README.md` 补 Phase 9 状态行
- `tools/README.md` 完整

测试：

- `grep ZENMUX .env.example | wc -l` ≥ 2
- `grep -c "可用素材生产工具" SKILL.md` ≥ 1

### Step 11 — Acceptance 自检

预期输出：

- 跑所有 Phase 9 验收项
- 写 `phase-9-asset-tools-migration-verification.md`

测试：

- 见 §5 Acceptance Checklist

### Step 12 — Commit / Push

预期输出（assets-produce 仓，按 atomic commit 切分）：

1. `tools/` 顶层 + README + .gitignore
2. cg-render tool 迁移（含 render.py + requirements + README）
3. cg-render atomic tool 包装 + 注册
4. oss-sync tool 迁移
5. upscale tool 迁移
6. upscale-image atomic tool 包装 + 注册
7. cg-render-spec skill body 更新
8. `.env.example` + SKILL.md + knowledge README 更新
9. verification report

预期输出（moonshort-backend 仓，单独 commit；push 推迟）：

10. DEPRECATED 注释 block（4 个文件左右；一次 commit）

测试：

- `git log --oneline main..HEAD` 看每个 commit 单一变更面
- 各 commit 跑测试不破坏（参考 master spec §11.5 atomic commit 规则）
- assets-produce `git push origin main` 需用户 ack（remote 是 cdotlock）
- backend push **本 phase 不做**；留 Phase 10

## 3. Risks

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| python 依赖在 macOS / linux 上行为不一致 | 中 | 中 | venv + 固定版本 requirements；CI 留 Phase 10 后补 linux |
| backend cg_render.py 内部隐式 import 路径（如 render-with-style.py 是 sys.path 相对引用） | 中 | 中 | Step 1 调研阶段 grep 所有 import；迁移时整理为同目录 |
| atomic tool 包装层把 Python stdout 解析错（混入 print） | 中 | 中 | render.py 严格按 stdout JSON only；任何其它输出走 stderr |
| ZENMUX_BASE_URL 在 backend 与 assets-produce 不同（zenmux 自身 endpoint 漂移） | 低 | 中 | env 默认值放 `.env.example` 注释；调研阶段对比 backend `.env.example` |
| atomic tool 调真实 ZENMUX 在 CI 烧钱 | 中 | 低 | 测试一律 stub；真实调用只手动 verify |
| backend repo push 被 backend 维护方拒绝 | 低 | 低 | 本 phase 不 push backend；DEPRECATED commit 留本地 |

## 4. Out-of-Scope（本 phase 不做）

- 把 `moonshort-backend/generate-upscale-matting/` 其他子目录迁过来（只迁列出三件）
- 真实删除 backend 内对应文件
- 把 cg-render 替换 ZENMUX 为别的模型供应商
- 让 oss-sync 注册为 atomic tool（设计明确不挂）
- CI 接 Python linter / pytest（本 phase 仅本地跑通；CI 集成留以后）
- 把 `tools/` 抽成独立 git submodule

## 5. Acceptance Checklist（对齐 master spec §10 Phase 9）

- [ ] `tools/cg-render` 跑通 fixture（stub 或 dev key）
- [ ] `tools/oss-sync` dry-run fixture 目录跑通
- [ ] `tools/upscale` 跑通 fixture（mock 模式）
- [ ] 新 atomic tool 出现在 `agent tools list`：`cg-render`、`upscale-image`
- [ ] `agent tools show cg-render` / `agent tools show upscale-image` 输出 schema 完整
- [ ] `cg-render-spec.md` skill 拉起 mini agent loop（Phase 8 已落地的 runAssetGeneration）能跑完 stub CG 生成
- [ ] moonshort-backend 内对应文件加 DEPRECATED 注释（本地 commit，未 push）
- [ ] `bun --cwd=agent run typecheck` / `bun --cwd=agent run test` 全过
- [ ] `phase-9-asset-tools-migration-verification.md` 完成
- [ ] assets-produce 所有 atomic commit push 到 origin/main
