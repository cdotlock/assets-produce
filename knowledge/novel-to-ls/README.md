# Novel To LS Knowledge Pack

This directory is the local self-contained, **byte-frozen** source for the
novel → `.ls` *authoring* pipeline migrated from `cdotlock/novels-to-lunascript`
(n2m). As of the C-track (master-spec §15 r1.16), **assets-produce is the sole
authoritative owner** of this pipeline; n2m's upstream copies are retired
(DEPRECATED header, comment-only, not deleted — design D7).

Unlike `knowledge/novel-to-video/` (inert), this corpus **is** runtime-active:
each `<name>/SKILL.md` is discovered via the opencode filesystem skill system
(`skills.paths` → `knowledge/novel-to-ls`, design §4.3), served verbatim from
disk with **zero Langfuse / DB coupling**.

## Frozen authoring skills (11)

Driven by the `novel_to_ls/` orchestration skill (the stage DAG + reviewer-gate
semantics; design §4.2). 10 are n2m's global upstream authoring skills; the 11th
(`arc-reviewer`) is n2m's per-book reviewer template, frozen as the reference
copy.

| Skill dir | Role |
|---|---|
| `novel-evaluator/` | GO/NO-GO novel screen |
| `character-architect/` | producer — character bible |
| `bible-reviewer/` | reviewer — bible gate |
| `entity-planner/` | producer — per-LI-route plan |
| `planner-reviewer/` | reviewer — plan gate |
| `entity-normalizer/` | producer — characters/locations/alias json |
| `entity-rename/` | producer — optional copyright desensitization |
| `rename-reviewer/` | reviewer — rename gate |
| `episode-writer/` | producer — `.ls` script |
| `episode-writer-reviewer/` | reviewer — episode craft gate |
| `arc-reviewer/` | reviewer — per-book arc (project-scoped template) |
| `novel_to_ls/` | **orchestration skill** — stage sequencing + gate contract (authored, not frozen) |

## Validation

`.ls` output is gated by the **`ls-validate`** registered atomic tool
(`tools/ls-validate/`, frozen `cdotlock/lunascripts@b36a407` Go source,
sha256 drift-guarded — design §4.6 / §8.2). `agent tools list` discovers it.

## Provenance & drift

- `FREEZE_SOURCES.md` — n2m freeze commit + per-skill source paths + C4 retirement note.
- `FREEZE_MANIFEST.sha256` — sha256 of every frozen file; guarded by
  `agent/packages/opencode/test/skill/novel-to-ls-freeze.test.ts`.
- After C4, the assets-produce frozen copies and n2m's source intentionally
  differ by exactly the n2m-side DEPRECATED header (design §10 risk row); this
  is **by-design retirement, not drift** — assets-produce is authoritative.

## Design

`docs/superpowers/specs/2026-05-19-upstream-authoring-migration-design.md`
(C-track C0–C4; master-spec §15 r1.16). Per-phase verification reports:
`docs/superpowers/specs/phase-C{0..4}-*-verification.md`.
