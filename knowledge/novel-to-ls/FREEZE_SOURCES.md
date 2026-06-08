# Freeze sources (C1)
n2m HEAD at freeze: 8049ac772f7350ea593519fbeb891ccaee488c9c
frozen: 2026-05-19T01:58:11Z

- novel-evaluator  <=  $N2M/skills/novel-evaluator/
- character-architect  <=  $N2M/skills/character-architect/
- bible-reviewer  <=  $N2M/skills/bible-reviewer/
- entity-planner  <=  $N2M/skills/entity-planner/
- planner-reviewer  <=  $N2M/skills/planner-reviewer/
- entity-normalizer  <=  $N2M/skills/entity-normalizer/
- entity-rename  <=  $N2M/skills/entity-rename/
- rename-reviewer  <=  $N2M/skills/rename-reviewer/
- episode-writer  <=  $N2M/skills/episode-writer/
- episode-writer-reviewer  <=  $N2M/skills/episode-writer-reviewer/
- arc-reviewer  <=  $N2M/lunascripts/no-rules-in-bad-ideas/skills/arc-reviewer/

## C4 — n2m upstream retired (master-spec §15 r1.16)

As of the C-track close, n2m's 10 upstream authoring `skills/<name>/SKILL.md`
carry a comment-only DEPRECATED header pointing here; assets-produce is the
single source of truth. n2m copies are **retained, not deleted** (D7). From
this point the assets-produce frozen copy and the live n2m source intentionally
diverge by exactly that header — this is designed retirement, not drift. The
n2m commit's push status (committed locally vs pushed) is recorded in
`phase-C4-n2m-retire-docs-verification.md` (push is gated on explicit user ack
— global git red line, non-user namespace).
