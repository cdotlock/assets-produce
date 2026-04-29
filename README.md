# assets-produce

Agent-native multi-format asset production platform — based on opencode.

> **Status**: Phase 0 bootstrap (not usable yet).

## Layout

- [`agent/`](agent) — opencode-based agent + CLI base (cloned from `sst/opencode` dev branch)
- [`web/`](web) — creator workstation (Next.js + shadcn/ui, scaffolded in Phase 5)
- [`cli-example/`](cli-example) — `MiniMax-AI/cli` (design reference, unmaintained)
- [`legacy/`](legacy) — old Agent Forge snapshot (parked, do not maintain / deploy / test)
- [`docs/superpowers/specs/`](docs/superpowers/specs) — master spec, phase plans, verification reports

## Read Next

- [`CLAUDE.md`](CLAUDE.md) — project rules for any Claude Code session working in this repo
- [`docs/superpowers/specs/2026-04-29-assets-produce-spec.md`](docs/superpowers/specs/2026-04-29-assets-produce-spec.md) — master spec (architecture, phases, red lines)

## Tooling

- Runtime: [Bun](https://bun.sh) `1.3.13` (matches `agent/` upstream)
- Workspace: declared in root [`package.json`](package.json) `workspaces`

### Install

`agent/` is a self-contained Bun monorepo (own `bun.lock`, own catalog, own patches) inherited from `sst/opencode`. Lifting it into the outer workspace would couple us to upstream's catalog churn, so it stays standalone. Use:

- `bun install` — installs root + `web/` deps
- `bun run install:agent` — installs `agent/` deps (runs `bun install` inside `agent/`)
- `bun run install:all` — both, in order

`legacy/` and `cli-example/` are intentionally **outside** the workspace — they are not maintained.
