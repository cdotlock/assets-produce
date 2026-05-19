# MSS Golden Fixtures — Provenance

## Source

- **Repository**: `cdotlock/novels-to-moonscript` (n2m)
- **HEAD SHA** (full): `8049ac772f7350ea593519fbeb891ccaee488c9c`
  (subject: `docs: rename style-prompts MCP endpoint broti.mob-ai.cn -> style-config.mob-ai.cn`)

## Files copied (3 golden .mss scripts)

| Fixture file | Absolute source path |
|---|---|
| `ep_10_weston_final.md` | `/Users/august/MobAI/novels-to-moonscript/moonscripts/no-rules-in-bad-ideas/05-episode-writer/scripts/ep_10_weston_final.md` |
| `ep_10_diego_final.md` | `/Users/august/MobAI/novels-to-moonscript/moonscripts/no-rules-in-bad-ideas/05-episode-writer/scripts/ep_10_diego_final.md` |
| `ep_11_luca_final.md` | `/Users/august/MobAI/novels-to-moonscript/moonscripts/no-rules-in-bad-ideas/05-episode-writer/scripts/ep_11_luca_final.md` |

**Copy date**: 2026-05-19

## What these fixtures are

These are **real produced n2m output** from the `no-rules-in-bad-ideas` demo book — the
downstream-compat truth set. They span 3 distinct character routes (weston / diego / luca,
episodes 10-11) and are representative of real multi-route MSS output from the n2m pipeline.

Copies are byte-exact (`cp`-preserved, SHA256-verified at copy time).

## CI note (C1 precedent)

**Real-validator fidelity (Go-backed) is proven at Task-7 controller-run acceptance.**
Go is absent in CI; these committed fixtures are the CI-safe equivalent (C1 precedent:
recorded constants replace live repo reads at test time).

The parity test (`test/business/novel-mss-compat.test.ts`) invokes `mss-validate` in
hermetic `mock:true` mode only (no Go required). It verifies the wrapper accepts the real
fixture shape — it does NOT assert a specific real validator verdict. Real validation is
Task-7 (Go-absent-in-CI by design).
