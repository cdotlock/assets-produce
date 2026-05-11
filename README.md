# assets-produce

Agent-native multi-format asset production platform — based on opencode.

> **Status**: Phase 7 prompt-workflow parity in progress. CLI/WebUI can build; prompt-only video workflow is being hardened for launch readiness.

## Repository Boundary

本仓库只保留可运行项目代码和必要的本地知识包。旧参考仓库与示例 CLI 已清理出工作树。
`video-agent-test/` 仅保留可用于 prompt-only 验证的剧本、素材和视频 CLI 参考代码；skill 内容已沉淀到 [`knowledge/novel-to-video/`](knowledge/novel-to-video/)。

## Layout

- [`agent/`](agent) — opencode-based agent + CLI base (cloned from `sst/opencode` dev branch)
- [`web/`](web) — creator workstation (Next.js + shadcn/ui, scaffolded in Phase 5)
- [`knowledge/novel-to-video/`](knowledge/novel-to-video/) — self-contained prompt workflow knowledge pack
- [`video-agent-test/`](video-agent-test) — prompt-only scripts/assets fixture and video CLI reference
- [`docs/superpowers/specs/`](docs/superpowers/specs) — master spec, phase plans, verification reports

## Read Next

- [`SKILL.md`](SKILL.md) — agent-facing CLI entry-point (how to invoke, output modes, error codes)
- [`CLAUDE.md`](CLAUDE.md) — project rules for any Claude Code session working in this repo
- [`docs/superpowers/specs/2026-04-29-assets-produce-spec.md`](docs/superpowers/specs/2026-04-29-assets-produce-spec.md) — master spec (architecture, phases, red lines)

Single-binary build: `bun run agent:build` writes `agent/dist/agent.mjs`.
Run with `bun agent/dist/agent.mjs <cmd>` (or `agent/bin/agent <cmd>`).

## Tooling

- Runtime: [Bun](https://bun.sh) `1.3.13` (matches `agent/` upstream)
- Workspace: declared in root [`package.json`](package.json) `workspaces`

### Install

`agent/` is a self-contained Bun monorepo (own `bun.lock`, own catalog, own patches) inherited from `sst/opencode`. Lifting it into the outer workspace would couple us to upstream's catalog churn, so it stays standalone. Use:

- `bun install` — installs root + `web/` deps
- `bun run install:agent` — installs `agent/` deps (runs `bun install` inside `agent/`)
- `bun run install:all` — both, in order

Historical `legacy/` and `cli-example/` reference folders have been removed. Keep new reference material in `knowledge/` or docs, not as embedded external projects.
