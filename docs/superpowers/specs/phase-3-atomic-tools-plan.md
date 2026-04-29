# Phase 3 — Atomic Tools Plan

> **Spec ref**: [§ 10 Phase 3](2026-04-29-assets-produce-spec.md#phase-3--atomic-tools)
> **Date**: 2026-04-29
> **Author**: Claude Opus 4.7 (1M)

---

## 0. 决策表（先决,不待 verification）

| # | 议题 | 决策 | 理由 |
|---|---|---|---|
| 0.1 | 工具实现位置 | `agent/packages/opencode/src/tool/asset/<verb>.ts` | 与内置 tool 共目录,`registry.ts` 注册入 builtin。spec § 10 不要求外部 plugin loader |
| 0.2 | 参数 schema | `effect/Schema`（不用 zod） | opencode 内置 tool 全部用 effect/Schema;混用会导致 tool 工厂 wrap 异常 |
| 0.3 | tool ID 命名 | kebab-case + 模型名后缀(便于 LLM 选 tool):`generate-image-nanobanana` / `generate-image-gpt` / `generate-video-seedance` / `generate-video-happyhorse` / `concat-clips` / `crop-video`。**spec § 10 偏离**(spec 原写 `generate-image` / `generate-video` / `happyhorse`),走 § 15 修订记录(1.6 项)记下:命名加模型后缀方便 LLM 区分能力 | spec § 10 字面命名是占位,加模型后缀更自描述,方便 LLM 选 tool |
| 0.4 | 错误返回 | `Effect.try / Effect.tryPromise` 失败时 `Effect.die` —— opencode `wrap()` 会捕获并转 `assistant` message,不中断 session | registry.ts:124 `Effect.orDie` 已是规范,不需改 |
| 0.5 | OSS URL 输出 | 每 tool 返回 `output: <oss-url>` 字符串 + `metadata: { ossUrl, sourceParams, ... }` | spec § 10 "输出统一为 OSS URL" |
| 0.6 | dry-run | 在 schema 加 `dryRun?: boolean`(默认 false);为 true 时 Effect.gen 直接返回 resolved request 不调 FC | spec § 10 "支持 --dry-run 打印 resolved request"。注:opencode 的 `--dry-run` global flag 是 cli 级,这里加 tool 参数 dryRun 是 LLM 可访问的;两者不冲突 |
| 0.7 | FC endpoint 配置来源 | env vars(沿用 legacy 命名) | spec § 8.2 没规定;legacy 已有完整 env naming 沿用即可 |
| 0.8 | timeout 处理 | image 60s / video 5min / concat-crop 2min,可由参数覆盖(`timeoutMs`) | legacy fc-video-client 已是这一组数,延续 |
| 0.9 | 输入验证 | URL fields 必须 `https?://`;timeout 0-600s;duration 数值 1-30s | 防止注入 + 极值 |
| 0.10 | 不写 OSS upload tool | 当前 6 个 tool 都直接返回 FC 给的 OSS URL,不需要单独 upload tool | spec § 10 Phase 3 字面就是 6 个,verification 5 也"6 atomic tools"。不超纲 |
| 0.11 | export-schema 命令 | 给 `agent tools export-schema [<tool-id>]` 加个新 verb,直接 dump tool registry 的 Schema | spec § 10 验收 #3 要求 |
| 0.12 | tool list / show | `agent tools list`(已经在 spec § 10 验收 #1),需新增 cli `agent tools` group | 现状没有 |
| 0.13 | DB 持久化(asset 表写入) | **不在本 phase**。Phase 3 是 atomic capability,asset record 写入留给 Phase 4 skill / 业务 service 层 | 红线"原子能力 + skill 编排" |
| 0.14 | reference image / video URL 列表 | optional Schema.Array(Schema.String) | legacy 一致 |
| 0.15 | 失败回灌 | tool execute 内 try/catch,失败时 `output: error message`、`metadata.error: true` —— LLM 看到错误原因决定重试或换路 | spec § 10 验收 #5 "任意一个 tool 失败时错误进消息流" |
| 0.16 | tool 范围 / scope | builtin,所有 agent 可用;不分 creator/developer profile(留 Phase 5) | spec § 10 Phase 3 不分 profile |

---

## 1. 文件清单

### 1.1 新建

| 路径 | 职责 |
|---|---|
| `agent/packages/opencode/src/tool/asset/fc-client.ts` | shared FC POST 客户端(超时、错误、URL 解析) |
| `agent/packages/opencode/src/tool/asset/generate-image-nanobanana.ts` | Tool.define `generate-image-nanobanana`(nanobanana 2 / gemini-3.1-flash-image-preview) |
| `agent/packages/opencode/src/tool/asset/generate-image-gpt.ts` | Tool.define `generate-image-gpt`(OpenAI GPT-Image) |
| `agent/packages/opencode/src/tool/asset/generate-video-seedance.ts` | Tool.define `generate-video-seedance`(SeedDance 2 pro) |
| `agent/packages/opencode/src/tool/asset/generate-video-happyhorse.ts` | Tool.define `generate-video-happyhorse`(HappyHorse / Kling-style) |
| `agent/packages/opencode/src/tool/asset/concat-clips.ts` | Tool.define `concat-clips`(FFmpeg-style stream concat,无 AI 模型) |
| `agent/packages/opencode/src/tool/asset/crop-video.ts` | Tool.define `crop-video`(FFmpeg-style trim,无 AI 模型) |
| `agent/packages/opencode/src/tool/asset/<tool>.txt` × 6 | LLM-facing description for each tool |
| `agent/packages/opencode/src/cli/cmd/tools.ts` | `agent tools list / show / export-schema` yargs subcmd |

### 1.2 修改

| 路径 | 修改 |
|---|---|
| `agent/packages/opencode/src/tool/registry.ts` | import 6 新 tool + 加入 `builtin` array |
| `agent/packages/opencode/src/index.ts` | 注册 `ToolsCommand` |
| `.env.example` | 加 12 个 FC env(URL+TOKEN × 6)+ 注释引用 phase-3 验收 |

### 1.3 不动

- `business/asset/asset.ts` —— Phase 3 不改业务层
- `provider/*.ts` —— FC 调用走原生 fetch,不走 LLM provider

---

## 2. 步骤拆解（16 步）

每步预估 5-15 min。每步独立 commit。

| Step | 内容 | 预计输出 / 测试 |
|---|---|---|
| 1 | 写本 plan + commit + push | 本文 + commit |
| 2 | shared `fc-client.ts`(callFc<T>) | Effect.tryPromise wrap,timeout,JSON 解析。dry-run 模式直接 Effect.succeed payload。**单测**:本地 mock fetch 跑一次 |
| 3 | `generate-image.ts` + .txt + register | tool 加进 registry.ts builtin。`agent tools list` 看到 |
| 4 | `generate-image-gpt.ts` + .txt + register | 同 #3 |
| 5 | `generate-video.ts` + .txt + register | 同上,timeout 5min |
| 6 | `concat-clips.ts` + .txt + register | 同上 |
| 7 | `crop-video.ts` + .txt + register | 同上 |
| 8 | `happyhorse.ts` + .txt + register | 同上 |
| 9 | `agent tools` CLI subcmd | `agent tools list` / `agent tools show <id>` / `agent tools export-schema [<id>]` 三个 verb |
| 10 | `.env.example` 加 12 FC vars | spec § 10 验收 #2 |
| 11 | 跑 `agent tools list` | 验收 #1。看到 6 个 asset tool(+ 内置 tool) |
| 12 | 跑 `agent tools export-schema generate-image` | 验收 #3。输出 Anthropic 兼容 JSON schema |
| 13 | 跑 dry-run:`agent run "use generate-image with prompt X" --dry-run` 或在 chat 用 dryRun=true 参数 | 验收 (LLM 调 tool,tool 看到 dryRun 直接返回 resolved request 不打 FC) |
| 14 | 跑实际 FC(如有可用 endpoint):chat LLM "generate an image" | 验收 #4 |
| 15 | 写 verification report | docs/superpowers/specs/phase-3-atomic-tools-verification.md |
| 16 | commit + push + code-review + 通知 /compact | git push origin main |

---

## 3. tool schema 设计

### 3.1 generate-image-nanobanana (model: nanobanana 2 / gemini-3.1-flash-image-preview)

```
{
  prompt: string (required, 1..4000 chars)
  model?: string  (default "gemini-3.1-flash-image-preview")
  referenceImageUrls?: string[]  (https? URLs, 0..8)
  dryRun?: boolean  (default false)
}

→ output: <oss-url>
  metadata: { ossUrl, model, refCount, dryRun? }
env: FC_GENERATE_IMAGE_NANOBANANA_URL / FC_GENERATE_IMAGE_NANOBANANA_TOKEN
```

### 3.2 generate-image-gpt (model: OpenAI GPT-Image 1)

```
{
  prompt: string (required, 1..4000)
  model?: string  (default "gpt-image-1")
  referenceImageUrls?: string[]
  dryRun?: boolean
}

→ output: <oss-url>
env: FC_GENERATE_IMAGE_GPT_URL / FC_GENERATE_IMAGE_GPT_TOKEN
```

### 3.3 generate-video-seedance (model: SeedDance 2 pro)

```
{
  prompt: string (required)
  sourceImageUrl?: string (https?)
  styleName?: string
  model?: string  (default "seedance-2-pro")
  referenceImageUrls?: string[]
  sourceVideoUrls?: string[]
  dryRun?: boolean
}

→ output: <oss-url> (5-min timeout)
env: FC_GENERATE_VIDEO_SEEDANCE_URL / FC_GENERATE_VIDEO_SEEDANCE_TOKEN
```

### 3.4 generate-video-happyhorse (model: HappyHorse / Kling-style multimodal)

```
{
  prompt: string (required)
  media: { type: "video"|"reference_image", url: string }[]  (1..8)
  resolution?: "1080P" | "720P"
  ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4"
  duration?: number (1..30)
  model?: string
  dryRun?: boolean
}

→ output: <oss-url> (5-min timeout, metadata 含 taskId / status)
env: FC_GENERATE_VIDEO_HAPPYHORSE_URL / FC_GENERATE_VIDEO_HAPPYHORSE_TOKEN
```

### 3.5 concat-clips (FFmpeg-style concat, 无 AI 模型)

```
{
  clipUrls: string[] (2..16, https?)
  dryRun?: boolean
}

→ output: <oss-url>
env: FC_CONCAT_CLIPS_URL / FC_CONCAT_CLIPS_TOKEN
```

### 3.6 crop-video (FFmpeg-style trim, 无 AI 模型)

```
{
  videoUrl: string (https?, required)
  startTime: number (>= 0)
  endTime: number (> startTime)
  dryRun?: boolean
}

→ output: <oss-url>
env: FC_CROP_VIDEO_URL / FC_CROP_VIDEO_TOKEN
```

---

## 4. env vars 增量(`.env.example`)

```
# Phase 3 — Atomic Tool FC endpoints (6 tools × URL+TOKEN)
# Tool ↔ env mapping (model name encoded in env to ease ops grep):
#   generate-image-nanobanana  → nanobanana 2 / gemini-3.1-flash-image-preview
#   generate-image-gpt         → OpenAI GPT-Image
#   generate-video-seedance    → SeedDance 2 pro
#   generate-video-happyhorse  → HappyHorse (Kling-style multimodal)
#   concat-clips / crop-video  → FFmpeg-style ops, no AI model
FC_GENERATE_IMAGE_NANOBANANA_URL=
FC_GENERATE_IMAGE_NANOBANANA_TOKEN=
FC_GENERATE_IMAGE_GPT_URL=
FC_GENERATE_IMAGE_GPT_TOKEN=
FC_GENERATE_VIDEO_SEEDANCE_URL=
FC_GENERATE_VIDEO_SEEDANCE_TOKEN=
FC_GENERATE_VIDEO_HAPPYHORSE_URL=
FC_GENERATE_VIDEO_HAPPYHORSE_TOKEN=
FC_CONCAT_CLIPS_URL=
FC_CONCAT_CLIPS_TOKEN=
FC_CROP_VIDEO_URL=
FC_CROP_VIDEO_TOKEN=
```

12 个新字段,env name 与 tool id 一致(对照 § 3 schema 表)。

---

## 5. 验收项核对表（spec § 10 Phase 3 — 6 项）

| # | 验收项 | 验证方法 |
|---|---|---|
| 1 | `agent tools list` 显示 6 个 tool(`generate-image-nanobanana` / `generate-image-gpt` / `generate-video-seedance` / `generate-video-happyhorse` / `concat-clips` / `crop-video`) | grep 输出 |
| 2 | 每个 tool 单独可调用、可 `--dry-run` | 6 次 dryRun=true 调用 |
| 3 | `agent config export-schema --command "tools generate-image"`(spec 字面) → 我们走 `agent tools export-schema generate-image`(更直接) | JSON 输出含 `inputSchema` / `description` |
| 4 | 在 chat 里 LLM 能成功调用每个 tool,结果是 OSS URL | env 真实配置后跑(未配置时会 surface error,不中断) |
| 5 | 任意 tool 失败时错误进消息流(不 throw 中断会话) | mock FC 返 500,看 chat 继续 |
| 6 | tool signature 在本 phase 定下,后续 phase 不许改 | spec § 11.4 已规定,本 plan 锁定 6 个 tool 的 schema |

---

## 6. 风险登记

| ID | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | effect/Schema 与 Schema.Struct 在 Optional 用法上有 quirks | 类型错误 | 参考 `webfetch.ts` Optional pattern(`Schema.optional + withDecodingDefault`) |
| R2 | tool description.txt 文件 LLM 读不全(opencode 内部按 Bun.text() 加载) | LLM 调用错误 | description 控制在 200 字内,精炼 |
| R3 | FC 端点未真实可用(env 没配) | 验收 #4 跑不了 | 加 dryRun=true 模式,验收 1-3+5 必通,#4 用 mock 或 env 真实凭据择一 |
| R4 | export-schema 输出格式跟 Anthropic / OpenAI 不完全一致 | 外部 agent 接入失败 | 仿 effectai/Schema 转 JSON Schema 标准做法,Phase 6 polish 时再细 |
| R5 | tool ID 含 `-` 在 Anthropic tool naming 是合法的 | 无 | 已确认(spec § 10 字面命名带 `-`) |
| R6 | dryRun 参数让 LLM 在生产时也加上 → 永远不真正调 | 业务事故 | description 明确 "dryRun ONLY for testing,never set in production" |
| R7 | concat-clips clipUrls 数量上限 | OOM | Schema.Array maxItems=16 |
| R8 | crop-video startTime/endTime 校验 | 参数错 → FC 500 | Schema refine `endTime > startTime` |

---

## 7. 不在本 phase

- skill 系统(Phase 4)
- asset table 写入(Phase 4 / 业务编排时)
- WebUI tool 暴露(Phase 5,经 creator profile)
- export-schema 全量(`agent config export-schema` 全 CLI),Phase 6
- tool 错误格式 i18n / 富格式(Phase 6)

---

## 8. 自检

- ✅ 红线 1(原子能力 + skill 编排):6 tool 都是 atomic,**没有写编排**;不存在 `*-orchestration` / `*-workflow-service` / `*-coordination`
- ✅ 红线 2(skill body 不散落):本 phase 不动 skill
- ✅ 红线 3(WebUI 不实现独立业务):本 phase 不动 web/
- ✅ 红线 5(没写 plan 前不直接动代码):本文先于代码
- ✅ 红线 7(不偏离 spec):严格按 spec § 10 Phase 3 6 个 tool

进入实施。
