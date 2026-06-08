# assets-produce

Agent-native multi-format asset production platform — based on opencode.

> **Status**: Phase 7 prompt-workflow parity in progress. CLI/WebUI can build; prompt-only video workflow is being hardened for launch readiness.

## Repository Boundary

本仓库只保留可运行项目代码和必要的本地知识包。旧参考仓库与示例 CLI 已清理出工作树。
视频执行逻辑放在独立 [`videoctl/`](videoctl/) CLI 包里；`video-agent-test/` 只保留 prompt-only AB 验证所需的剧本、素材和 fixture。

## Layout

- [`agent/`](agent) — opencode-based agent + CLI base (cloned from `sst/opencode` dev branch)
- [`web/`](web) — creator workstation (Next.js + shadcn/ui, scaffolded in Phase 5)
- [`videoctl/`](videoctl) — standalone Go CLI for video upload/payload/validate/submit/postprocess
- [`knowledge/novel-to-video/`](knowledge/novel-to-video/) — self-contained prompt workflow knowledge pack
- [`knowledge/novel-to-ls/`](knowledge/novel-to-ls/) — self-contained **byte-frozen** novel→`.ls` authoring corpus (11 skills + `novel_to_ls` orchestration; migrated from n2m, now authoritative — §15 r1.16)
- [`claude-skills/novel-to-video/`](claude-skills/novel-to-video/) — Claude skill source that drives the knowledge pack through `videoctl`
- [`video-agent-test/`](video-agent-test) — prompt-only scripts/assets fixture workspace
- [`docs/superpowers/specs/`](docs/superpowers/specs) — master spec, phase plans, verification reports

## Read Next

- [`SKILL.md`](SKILL.md) — agent-facing CLI entry-point (how to invoke, output modes, error codes)
- [`CLAUDE.md`](CLAUDE.md) — project rules for any Claude Code session working in this repo
- [`docs/superpowers/specs/2026-04-29-assets-produce-spec.md`](docs/superpowers/specs/2026-04-29-assets-produce-spec.md) — master spec (architecture, phases, red lines)

## 对外 Asset 服务（三仓接入）

Phase 10 起 assets-produce 对外暴露 4 个 HTTP 操作（mount 在 `/api/v1/assets/`）：

| 操作 | 方法 | 用途 |
|---|---|---|
| `create` | POST | 触发一次素材生产 job |
| `status` | GET | 查 job 状态 |
| `lookup` | POST | 按 key / name 批量查已生产的 Asset URL |
| `catalog-since` | GET | 按时间游标增量拉 Asset 目录 |

接入方：
- **novels-to-lunascript** — 上游写作流水线（选小说→`.ls`）已迁入本仓自维护（C-track，§15 r1.16），n2m 上游退役（DEPRECATED 注释，未删）。n2m 侧只保留**下游**（asset-prompt-generator / dramatizer 等），仍按 `lookup` 拉已生产 Asset URL
- **lunaverse-backend** — 4 个操作全用；通过 `app/upstream/assets-produce-http.ts` + `agent-forge-client.ts` 的 `ASSETS_REMIX_MODE=real` 分支接通

各仓 token / project_id 治理 + 故障排查见 [`docs/ops/three-repo-token-flow.md`](docs/ops/three-repo-token-flow.md)。OpenAPI 完整 spec 见 `agent/packages/opencode/test/business/asset-service/openapi.test.ts` snapshot。

Single-binary build: `bun run agent:build` writes `agent/dist/agent.mjs`.
Run with `bun agent/dist/agent.mjs <cmd>` (or `agent/bin/agent <cmd>`).

Video CLI build: `bun run videoctl:build` writes `videoctl/bin/videoctl`.

## Tooling

- Runtime: [Bun](https://bun.sh) `1.3.13` (matches `agent/` upstream)
- Workspace: declared in root [`package.json`](package.json) `workspaces`

### Install

`agent/` is a self-contained Bun monorepo (own `bun.lock`, own catalog, own patches) inherited from `sst/opencode`. Lifting it into the outer workspace would couple us to upstream's catalog churn, so it stays standalone. Use:

- `bun install` — installs root + `web/` deps
- `bun run install:agent` — installs `agent/` deps (runs `bun install` inside `agent/`)
- `bun run install:all` — both, in order

Historical `legacy/` and `cli-example/` reference folders have been removed. Keep new reference material in `knowledge/` or docs, not as embedded external projects.
