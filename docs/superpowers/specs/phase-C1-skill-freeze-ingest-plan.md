# C1 — Skill Freeze + Registration + Ingestion Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Byte-freeze novels-to-moonscript's 11 in-scope authoring skills (+ companions) into `knowledge/novel-to-mss/`, wire opencode filesystem skill discovery to them with zero Langfuse/DB, and add a novel-project on-disk workspace helper that reproduces n2m's `NN-stage` directory contract.

**Architecture:** Verbatim corpus freeze (mirror n2m `skills/` tree so intra-corpus relative refs like `../episode-writer/mss-spec.md` stay valid) guarded by a committed SHA256 manifest drift test; registration via `config.skills.paths` (codebase-confirmed local-discovery path, not the managed-CLI/Langfuse path); a pure-ish `ensureNovelWorkspace` helper with the n2m stage names frozen as constants.

**Tech Stack:** TypeScript (Effect, bun:test), opencode skill discovery (`agent/packages/opencode/src/skill/index.ts`), opencode config (`opencode.jsonc` + `config/skills.ts`), bash for the one-shot freeze.

**Spec linkage:** design `2026-05-19-upstream-authoring-migration-design.md` §4.1/§4.3/§4.5/§6 (C1 row); master spec §15 r1.16.

---

## Source Inventory (frozen facts from C0 survey — authoritative)

n2m repo root: `/Users/august/MobAI/novels-to-moonscript` (`$N2M`).

10 global skills under `$N2M/skills/<name>/` + 1 project-scoped:

| # | name (frontmatter, kebab) | source dir | notable companions |
|---|---|---|---|
| 1 | `novel-evaluator` | `$N2M/skills/novel-evaluator/` | SKILL.md (~17KB); no code companions |
| 2 | `character-architect` | `$N2M/skills/character-architect/` | SKILL.md (~29KB); refs `../episode-writer/mss-spec.md` |
| 3 | `bible-reviewer` | `$N2M/skills/bible-reviewer/` | SKILL.md (~12KB) |
| 4 | `entity-planner` | `$N2M/skills/entity-planner/` | SKILL.md (~19KB); refs `../episode-writer/mss-spec.md` |
| 5 | `planner-reviewer` | `$N2M/skills/planner-reviewer/` | SKILL.md (~15KB) |
| 6 | `entity-normalizer` | `$N2M/skills/entity-normalizer/` | SKILL.md (~9.4KB); `scripts/validate_normalizer.py`, `scripts/regenerate_alias_map.py`, `tests/test_*.py`×3 |
| 7 | `entity-rename` | `$N2M/skills/entity-rename/` | SKILL.md (~19KB); `scripts/apply_rename.py`, `scan_tokens.py`, `validate_rename.py`, `validate_map_schema.py`, `README.md`, `fixtures/` |
| 8 | `rename-reviewer` | `$N2M/skills/rename-reviewer/` | SKILL.md (~3.7KB); `README.md` |
| 9 | `episode-writer` | `$N2M/skills/episode-writer/` | SKILL.md (~56KB); `mss-spec.md` (~49KB), `scripts/look_audit.py`, `check_narrator_pov.py`, `audit_bg_refs.py`, `cleanup_dead_looks.py`, `tests/test_audit_bg_refs.py` |
| 10 | `episode-writer-reviewer` | `$N2M/skills/episode-writer-reviewer/` | SKILL.md (~13KB) |
| 11 | `arc-reviewer` | `$N2M/moonscripts/no-rules-in-bad-ideas/skills/arc-reviewer/` | SKILL.md (~13KB, 321 lines); only copy in repo |

**Exclude from freeze (build artifacts):** `.pytest_cache/`, `.backups/`, `__pycache__/`, `.DS_Store`, `.git`, `*.pyc`.

n2m authoring-stage on-disk dir contract (demo book), authoring stages only:
`01-novel-evaluator/`, `02-character-architect/`, `03-entity-planner/`, `04-entity-normalizer/`, `04.5-entity-rename/`, `05-episode-writer/scripts/`, plus loose `signal_checklist.md` and `skills/arc-reviewer/`. (Out of scope, NOT created by the helper: `02.5-outfit-anchor/`, `05.5-music-normalizer/`, `05.5c-sfx-normalizer/`, `06-asset-prompt-generator/`, `mss-build/`.)

## File Structure

- Create: `knowledge/novel-to-mss/<name>/…` (11 verbatim skill dirs, mirrors n2m `skills/` tree so `../episode-writer/mss-spec.md` relative refs resolve within the corpus)
- Create: `knowledge/novel-to-mss/FREEZE_MANIFEST.sha256` (path→sha256, the golden)
- Create: `knowledge/novel-to-mss/FREEZE_SOURCES.md` (records exact n2m source paths + n2m git SHA at freeze, for provenance)
- Create: `scripts/c1-freeze-novel-to-mss.sh` (one-shot deterministic freeze + manifest generator; idempotent)
- Modify: the authoritative opencode config (`opencode.jsonc` at repo root OR `agent/.opencode/opencode.jsonc` — Task 4 Step 1 determines which) — add `skills.paths`
- Create: `agent/packages/opencode/src/business/novel/workspace.ts` (stage-name constants + `ensureNovelWorkspace`)
- Create: `agent/packages/opencode/test/business/novel-workspace.test.ts`
- Create: `agent/packages/opencode/test/skill/novel-to-mss-freeze.test.ts` (manifest drift + frontmatter validity)
- Create: `agent/packages/opencode/test/skill/novel-to-mss-discovery.test.ts` (discovery sees 11, fs-served, no langfuse, no dup)
- Create: `docs/superpowers/specs/phase-C1-skill-freeze-ingest-verification.md` (Task 6)

Test command (bun lives in `~/.bun/bin` per env): `PATH=$HOME/.bun/bin:$PATH bun test --timeout 30000` run with `--cwd agent/packages/opencode` or from that dir.

---

### Task 1: Freeze script (deterministic copy + manifest)

**Files:**
- Create: `scripts/c1-freeze-novel-to-mss.sh`

- [ ] **Step 1: Write the freeze script**

```bash
#!/usr/bin/env bash
# C1 one-shot verbatim freeze of n2m authoring skills into knowledge/novel-to-mss/.
# Idempotent: re-running reproduces identical output + manifest.
set -euo pipefail

N2M="${N2M:-/Users/august/MobAI/novels-to-moonscript}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/knowledge/novel-to-mss"

GLOBAL_SKILLS=(novel-evaluator character-architect bible-reviewer entity-planner \
  planner-reviewer entity-normalizer entity-rename rename-reviewer \
  episode-writer episode-writer-reviewer)

EXCLUDES=(--exclude='.pytest_cache' --exclude='.backups' --exclude='__pycache__' \
  --exclude='.DS_Store' --exclude='.git' --exclude='*.pyc')

rm -rf "$DEST"
mkdir -p "$DEST"

for s in "${GLOBAL_SKILLS[@]}"; do
  src="$N2M/skills/$s"
  [ -d "$src" ] || { echo "MISSING global skill: $src" >&2; exit 3; }
  rsync -a "${EXCLUDES[@]}" "$src/" "$DEST/$s/"
done

arc_src="$N2M/moonscripts/no-rules-in-bad-ideas/skills/arc-reviewer"
[ -d "$arc_src" ] || { echo "MISSING arc-reviewer: $arc_src" >&2; exit 3; }
rsync -a "${EXCLUDES[@]}" "$arc_src/" "$DEST/arc-reviewer/"

# Provenance
n2m_sha="$(git -C "$N2M" rev-parse HEAD 2>/dev/null || echo unknown)"
{
  echo "# Freeze sources (C1)"
  echo "n2m HEAD at freeze: $n2m_sha"
  echo "frozen: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  for s in "${GLOBAL_SKILLS[@]}"; do echo "- $s  <=  \$N2M/skills/$s/"; done
  echo "- arc-reviewer  <=  \$N2M/moonscripts/no-rules-in-bad-ideas/skills/arc-reviewer/"
} > "$DEST/FREEZE_SOURCES.md"

# Deterministic manifest (sorted, repo-relative paths)
( cd "$DEST" && find . -type f ! -name FREEZE_MANIFEST.sha256 -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 shasum -a 256 \
  | sed "s|  \./|  |" > FREEZE_MANIFEST.sha256 )

echo "FROZEN: $(grep -c . "$DEST/FREEZE_MANIFEST.sha256") files"
```

- [ ] **Step 2: Make executable + run it**

Run: `chmod +x scripts/c1-freeze-novel-to-mss.sh && ./scripts/c1-freeze-novel-to-mss.sh`
Expected: prints `FROZEN: <N> files` (N ≥ 14: 11 SKILL.md + episode-writer/mss-spec.md + the .py companions + READMEs); exit 0. If `MISSING …` → stop, investigate the n2m path before proceeding.

- [ ] **Step 3: Manual byte-equality spot check vs n2m (one-time freeze verification)**

Run:
```bash
diff -r --exclude=.pytest_cache --exclude=.backups --exclude=__pycache__ \
  --exclude=.DS_Store --exclude='*.pyc' \
  /Users/august/MobAI/novels-to-moonscript/skills/episode-writer \
  knowledge/novel-to-mss/episode-writer
diff <(sed -n '1,5p' knowledge/novel-to-mss/novel-evaluator/SKILL.md) \
     <(sed -n '1,5p' /Users/august/MobAI/novels-to-moonscript/skills/novel-evaluator/SKILL.md)
```
Expected: no output from `diff -r` (byte-identical); frontmatter heads identical. This is the one-time human-confirmed verbatim guarantee; the manifest test (Task 3) guards drift thereafter.

- [ ] **Step 4: Commit**

```bash
git add scripts/c1-freeze-novel-to-mss.sh knowledge/novel-to-mss
git commit -m "feat: freeze n2m authoring skill corpus into knowledge/novel-to-mss (C1)"
```

---

### Task 2: Frontmatter validity check (discovery precondition)

opencode discovery drops any SKILL.md whose frontmatter lacks `name` or `description` (`skill/index.ts:98` `z.object({name,description}).safeParse`). Verify every frozen SKILL.md satisfies this.

**Files:**
- Create: `agent/packages/opencode/test/skill/novel-to-mss-freeze.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test"
import { readdirSync, readFileSync, existsSync } from "fs"
import path from "path"

const REPO = path.resolve(import.meta.dir, "../../../../..")
const CORPUS = path.join(REPO, "knowledge/novel-to-mss")
const EXPECTED = [
  "novel-evaluator","character-architect","bible-reviewer","entity-planner",
  "planner-reviewer","entity-normalizer","entity-rename","rename-reviewer",
  "episode-writer","episode-writer-reviewer","arc-reviewer",
]

function frontmatter(md: string): Record<string,string> {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const out: Record<string,string> = {}
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":")
    if (i > 0) out[line.slice(0,i).trim()] = line.slice(i+1).trim()
  }
  return out
}

test("all 11 frozen skill dirs exist with a SKILL.md", () => {
  expect(existsSync(CORPUS)).toBe(true)
  const dirs = readdirSync(CORPUS, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort()
  for (const name of EXPECTED) {
    expect(dirs).toContain(name)
    expect(existsSync(path.join(CORPUS, name, "SKILL.md"))).toBe(true)
  }
})

test("every frozen SKILL.md has name + description frontmatter", () => {
  for (const name of EXPECTED) {
    const fm = frontmatter(readFileSync(path.join(CORPUS, name, "SKILL.md"), "utf8"))
    expect(fm.name, `${name}: missing frontmatter name`).toBeTruthy()
    expect(fm.description, `${name}: missing frontmatter description`).toBeTruthy()
  }
})
```

- [ ] **Step 2: Run it (passes if Task 1 freeze is correct)**

Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/skill/novel-to-mss-freeze.test.ts --timeout 30000`
Expected: both tests PASS. If a SKILL.md lacks `description`, that is a real finding — record it in the verification report and add a sidecar note; do NOT edit the frozen body (verbatim rule). Resolution for a missing-frontmatter skill is escalated, not patched.

- [ ] **Step 3: Commit**

```bash
git add agent/packages/opencode/test/skill/novel-to-mss-freeze.test.ts
git commit -m "test: assert frozen novel-to-mss corpus shape + frontmatter (C1)"
```

---

### Task 3: Manifest drift test (the golden guard)

**Files:**
- Modify: `agent/packages/opencode/test/skill/novel-to-mss-freeze.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```ts
import { createHash } from "crypto"

test("frozen corpus matches FREEZE_MANIFEST.sha256 (no drift)", () => {
  const manifestPath = path.join(CORPUS, "FREEZE_MANIFEST.sha256")
  expect(existsSync(manifestPath)).toBe(true)
  const lines = readFileSync(manifestPath, "utf8").split("\n").filter(Boolean)
  expect(lines.length).toBeGreaterThanOrEqual(14)
  for (const line of lines) {
    const sha = line.slice(0, 64)
    const rel = line.slice(66) // "<sha>  <relpath>"
    const abs = path.join(CORPUS, rel)
    expect(existsSync(abs), `manifest references missing file: ${rel}`).toBe(true)
    const got = createHash("sha256").update(readFileSync(abs)).digest("hex")
    expect(got, `drift in ${rel}`).toBe(sha)
  }
})
```

- [ ] **Step 2: Run it**

Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/skill/novel-to-mss-freeze.test.ts --timeout 30000`
Expected: PASS (manifest from Task 1 Step 2 matches on-disk bytes).

- [ ] **Step 3: Commit**

```bash
git add agent/packages/opencode/test/skill/novel-to-mss-freeze.test.ts
git commit -m "test: add FREEZE_MANIFEST drift guard for novel-to-mss (C1)"
```

---

### Task 4: Wire `skills.paths` + discovery test

**Files:**
- Modify: authoritative opencode config (determined in Step 1)
- Create: `agent/packages/opencode/test/skill/novel-to-mss-discovery.test.ts`

- [ ] **Step 1: Determine the authoritative config + add skills.paths**

Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun -e "import {Config} from './src/config/config'; /* inspect */" 2>/dev/null || true`
Then inspect both candidates and how `directory` resolves:
```bash
cat opencode.jsonc
cat agent/.opencode/opencode.jsonc
grep -n "directories\|jsonc\|opencode.json" agent/packages/opencode/src/config/paths.ts | head
```
Decision rule: discovery (`skill/index.ts:179-188`) resolves a relative `skills.paths` entry against the runtime project `directory`. Add to the **repo-root** `opencode.jsonc` (the project root that contains `knowledge/`) the key:
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": { "deepseek": { "npm": "@ai-sdk/openai-compatible", "name": "DeepSeek (OpenAI-compatible)", "options": { "baseURL": "https://api.deepseek.com" } } },
  "skills": { "paths": ["knowledge/novel-to-mss"] }
}
```
If Step 3 proves the runtime `directory` is `agent/` (not repo root), instead use an absolute-from-root or the `agent/.opencode/opencode.jsonc` with path `"../../knowledge/novel-to-mss"` and re-run Step 3. Record the chosen file + rationale in the verification report.

- [ ] **Step 2: Write the failing discovery test**

```ts
import { test, expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { Skill } from "../../src/skill"

const REPO = path.resolve(import.meta.dir, "../../../../..")
const EXPECTED = [
  "novel-evaluator","character-architect","bible-reviewer","entity-planner",
  "planner-reviewer","entity-normalizer","entity-rename","rename-reviewer",
  "episode-writer","episode-writer-reviewer","arc-reviewer",
]

test("opencode discovery sees all 11 novel-to-mss skills, filesystem-served", async () => {
  const list = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const svc = yield* Skill.Service
        return yield* svc.all()
      }),
      Skill.defaultLayer,
    ).pipe(Effect.scoped) as any,
  ).catch((e: unknown) => { throw e })

  const byName = new Map(list.map((s: any) => [s.name, s]))
  for (const name of EXPECTED) {
    const info = byName.get(name)
    expect(info, `discovery missing skill: ${name}`).toBeTruthy()
    // filesystem-served (NOT langfuse://) and points into knowledge/novel-to-mss
    expect(String(info.location).startsWith("langfuse://")).toBe(false)
    expect(String(info.location)).toContain(path.join("knowledge","novel-to-mss",name))
    expect(typeof info.content).toBe("string")
    expect(info.content.length).toBeGreaterThan(0)
  }
})
```

> Note for implementer: if `Skill.defaultLayer` requires additional context (Instance directory/worktree) to run in a bare test, follow the harness used by existing skill-touching tests (grep `Skill.defaultLayer`/`InstanceState` under `agent/packages/opencode/test`); construct the minimal Layer/`InstanceState` exactly as the closest existing example does. Do not stub discovery — the test must exercise real `discoverSkills`.

- [ ] **Step 3: Run it**

Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/skill/novel-to-mss-discovery.test.ts --timeout 30000`
Expected: PASS — all 11 names discovered, every `location` is a filesystem path under `knowledge/novel-to-mss/<name>` (no `langfuse://`), `content` non-empty. If FAIL because `directory` ≠ repo root, fix the config per Step 1's fallback and re-run.

- [ ] **Step 4: Assert no duplicate-name collision**

Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/skill/novel-to-mss-discovery.test.ts --timeout 30000 2>&1 | grep -i "duplicate skill name" && echo "COLLISION" || echo "no collision"`
Expected: prints `no collision`. If `COLLISION`, a frozen name clashes with an existing assets-produce skill — record in verification; resolution (namespacing) is escalated, not silently renamed (verbatim rule).

- [ ] **Step 5: Commit**

```bash
git add opencode.jsonc agent/packages/opencode/test/skill/novel-to-mss-discovery.test.ts
git commit -m "feat: wire skills.paths to novel-to-mss corpus + discovery test (C1)"
```

---

### Task 5: Novel-project workspace helper

Pure, deterministic helper that materializes n2m's authoring-stage skeleton for a `Project(type=novel)`. `Project` entity already exists (`agent/packages/opencode/src/business/project/project.sql.ts`, `type` enum includes `novel`) — no schema change.

**Files:**
- Create: `agent/packages/opencode/src/business/novel/workspace.ts`
- Create: `agent/packages/opencode/test/business/novel-workspace.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test"
import { mkdtempSync, existsSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { AUTHORING_STAGE_DIRS, ensureNovelWorkspace } from "../../src/business/novel/workspace"

test("AUTHORING_STAGE_DIRS is the frozen n2m authoring contract", () => {
  expect(AUTHORING_STAGE_DIRS).toEqual([
    "01-novel-evaluator",
    "02-character-architect",
    "03-entity-planner",
    "04-entity-normalizer",
    "04.5-entity-rename",
    "05-episode-writer/scripts",
  ])
})

test("ensureNovelWorkspace creates the n2m-compatible skeleton idempotently", () => {
  const root = mkdtempSync(path.join(tmpdir(), "c1-ws-"))
  try {
    const ws = ensureNovelWorkspace(root, "no-rules-in-bad-ideas")
    const base = path.join(root, "moonscripts", "no-rules-in-bad-ideas")
    expect(ws.base).toBe(base)
    for (const d of AUTHORING_STAGE_DIRS) expect(existsSync(path.join(base, d))).toBe(true)
    expect(existsSync(path.join(base, "skills", "arc-reviewer"))).toBe(true)
    expect(ws.stage("05-episode-writer/scripts")).toBe(path.join(base, "05-episode-writer/scripts"))
    // idempotent: second call must not throw and returns same base
    expect(ensureNovelWorkspace(root, "no-rules-in-bad-ideas").base).toBe(base)
    // slug is sanitized (no traversal)
    expect(() => ensureNovelWorkspace(root, "../evil")).toThrow()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/business/novel-workspace.test.ts --timeout 30000`
Expected: FAIL — `Cannot find module ../../src/business/novel/workspace`.

- [ ] **Step 3: Implement the helper**

```ts
import { mkdirSync } from "fs"
import path from "path"

/** n2m authoring-stage on-disk contract (verbatim from the demo book; the
 *  downstream-compat surface — do not reorder/rename). Post-MSS stages
 *  (02.5/05.5/06/mss-build) are intentionally excluded: out of C-track scope. */
export const AUTHORING_STAGE_DIRS = [
  "01-novel-evaluator",
  "02-character-architect",
  "03-entity-planner",
  "04-entity-normalizer",
  "04.5-entity-rename",
  "05-episode-writer/scripts",
] as const

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export interface NovelWorkspace {
  readonly base: string
  readonly stage: (name: (typeof AUTHORING_STAGE_DIRS)[number]) => string
}

export function ensureNovelWorkspace(root: string, slug: string): NovelWorkspace {
  if (!SLUG_RE.test(slug)) throw new Error(`invalid book slug: ${JSON.stringify(slug)}`)
  const base = path.join(root, "moonscripts", slug)
  for (const d of AUTHORING_STAGE_DIRS) mkdirSync(path.join(base, d), { recursive: true })
  mkdirSync(path.join(base, "skills", "arc-reviewer"), { recursive: true })
  return { base, stage: (name) => path.join(base, name) }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/business/novel-workspace.test.ts --timeout 30000`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/packages/opencode/src/business/novel/workspace.ts agent/packages/opencode/test/business/novel-workspace.test.ts
git commit -m "feat: add novel-project workspace helper (n2m NN-stage contract) (C1)"
```

---

### Task 6: Full suite + verification report + push + review

- [ ] **Step 1: Run the full agent test suite (no regressions)**

Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test --timeout 30000 2>&1 | tail -20`
Expected: existing suites still green; the 3 new test files pass. Investigate any new failure before proceeding (do not mark complete on red).

- [ ] **Step 2: Typecheck**

Run: `cd agent && PATH=$HOME/.bun/bin:$PATH bun run typecheck 2>&1 | tail -20`
Expected: no new type errors from `business/novel/workspace.ts` or the test files.

- [ ] **Step 3: Write `docs/superpowers/specs/phase-C1-skill-freeze-ingest-verification.md`**

Tick each C1 acceptance item from design §6 with evidence (file counts, manifest line count, test output, chosen config file + rationale, any frontmatter/collision findings + escalation note). Explicitly state: no Langfuse upload, no `Skill` DB rows, not in `ASSET_GENERATION_SKILLS`.

- [ ] **Step 4: Commit + push (assets-produce — authorized, no per-push ask)**

```bash
git add docs/superpowers/specs/phase-C1-skill-freeze-ingest-verification.md
git commit -m "docs: C1 verification report (skill freeze + discovery + ingest)"
git push origin claude/admiring-wilson-5d9f34
```

- [ ] **Step 5: Run `superpowers:code-reviewer` on the C1 diff**

Address CRITICAL/HIGH inline; record MEDIUM/LOW in the verification report. Then C1 is complete (the per-phase `/compact` is user-gated — note it in status; do not self-invoke).

---

## Self-Review

**Spec coverage (design §6 C1 row):** survey facts → Source Inventory section + Task 1 provenance; 11 byte-frozen dirs → Task 1; companions + cross-ref preservation → Task 1 (tree mirror) ✓; golden byte-equality → Task 1 Step 3 (one-time) + Task 3 (drift guard); `skills.paths` wired → Task 4; discovery sees 11 / fs-served / no Langfuse-DB / no dup → Task 4 Steps 3-4; frontmatter precondition → Task 2; `Project(novel)` + on-disk workspace helper (NN-stage contract) → Task 5; ≥80% line cov on new glue → Task 5 covers `workspace.ts` fully (every branch incl. invalid-slug + idempotent path), Tasks 2-4 cover the freeze/discovery glue; verification report → Task 6. No gap.

**Placeholder scan:** no TBD/TODO; the only deferred decision (which config file) is an explicit Task 4 Step 1 decision procedure with a concrete default + concrete fallback + recorded rationale — not a placeholder. The discovery-test layer-wiring note points the implementer at the exact existing pattern to copy rather than hand-waving.

**Type consistency:** `AUTHORING_STAGE_DIRS`, `ensureNovelWorkspace`, `NovelWorkspace.base/stage` consistent between Task 5 test and impl; `EXPECTED` 11-name list identical across Task 2 and Task 4; manifest format (`<64 sha>  <relpath>`, slice 0/66) consistent between Task 1 generator (`shasum -a 256` + `sed`) and Task 3 parser.
