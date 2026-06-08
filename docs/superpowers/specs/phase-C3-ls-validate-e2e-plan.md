# C3 — `ls-validate` Atomic Tool + Demo-Book e2e + Downstream-Compat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute via `superpowers:subagent-driven-development` — fresh implementer subagent per task, two-stage review (spec-compliance THEN code-quality) after each. Steps use `- [ ]` checkboxes.
>
> **Plan convention (project red line overrides the writing-plans show-code default):** CLAUDE.md mandates phase plans contain **no code / pseudocode / implementation** — only step breakdown, exact paths, exact commands, expected outputs, test items, risks. Implementer subagents write the code via TDD from the precise specs here + controller-curated context. This is the C1/C2 precedent.

**Goal:** Freeze the upstream canonical LS validator (`cdotlock/lunascripts` Go binary, pinned `@b36a407`) as a registered `ls-validate` atomic tool, wire it as the per-episode `.ls` quality gate in the `novel_to_ls` orchestration body, and discharge the C3 acceptance via a downstream-compat golden + a minimal live novel→LS slice.

**Architecture:** Established frozen-subprocess atomic-tool pattern (`cg-render` / `nrbi-render-prompt`): vendored sha256-pinned source → Python JSON-I/O bridge with `--mock` + drift guard → Effect-Schema TS wrapper → 3-site registry registration. The validator is **reused verbatim, never reimplemented** (it is a platform single-source-of-truth: ~98.9% validator coverage, 200+ tests). Sequencing/gate logic stays **knowledge** (the C2 body), zero pipeline code (§12 red line).

**Tech Stack:** Go ≥1.23.4 (vendored `go.mod`; build-time only, exercised solely by the Task 7 real run), Python 3 stdlib (bridge), TypeScript + Effect `Schema` + `bun:test` (opencode), the existing `python-runner.ts` subprocess bridge.

**Locked decisions (design §3 D1–D8 + §8.2, user-confirmed):** D6 source = upstream `cdotlock/lunascripts@b36a407` (full sha `b36a407605c7819e6ca86506b721f34baa09ea3a`), **vendored** into `tools/ls-validate/`, sha256-pinned; **no** Python re-implementation. e2e = compat-golden + minimal-live slice (literal full-book-from-original-novel infeasible: n2m `.gitignore`s `novels/`; recorded). Tool **is** registered (design §4.6 — orchestration calls it; unlike `detect-matting`). Gate sits **at** the `.ls` boundary (in C-track scope).

**Pre-flight facts (verified at plan time, de-risked):**
- Local clone `/Users/august/MobAI/lunascripts` has `origin = https://github.com/cdotlock/lunascripts.git`; commit `b36a407` (`b36a407605c7819e6ca86506b721f34baa09ea3a`, "docs(fixtures): register T58b in feature_parade README") **is present in local objects** → Task 1 vendors offline from the local clone, **zero network dependency**.
- Buildable subset @b36a407 = **22 files**: `go.mod`, `go.sum`, `cmd/lsc/main.go`, `internal/{ast,emitter,fixer,lexer,parser,resolver,token,validator}/**`, `LICENSE`. `go.mod` declares `go 1.23.4`; local `go version` = `go1.26.2 darwin/arm64` (satisfies).
- Real validator CLI contract (mob-wiki `entities/lunascripts` + n2m `scripts/validate_scripts.sh` + frozen `episode-writer/ls-spec.md §6`): `lsc validate <file>` → exit 0 + empty/`OK` (valid) | non-zero + human diagnostic text (invalid), **no JSON in validate mode**. `lsc compile` emits JSON (not used by the authoring gate — needs a downstream `--assets mapping.json`, out of C-track scope).
- 60 real `ep_*_final.md` exist at `/Users/august/MobAI/novels-to-lunascript/lunascripts/no-rules-in-bad-ideas/05-episode-writer/scripts/` (golden source; n2m HEAD `8049ac772f7350ea593519fbeb891ccaee488c9c`).
- Reference atomic tool to copy verbatim: `agent/packages/opencode/src/tool/asset/nrbi-render-prompt.ts` (+ `.txt`, + `test/tool/nrbi-render-prompt.test.ts`). Bridge: `agent/packages/opencode/src/tool/asset/python-runner.ts` (`runPython`/`PythonRunInput`/`PythonRunner`). Registry: `agent/packages/opencode/src/tool/registry.ts` (**3 sites**: import / `yield*` resolve / `Tool.init` map + `builtin:[]` array). Validate-type semantics precedent: `tools/detect-matting/detect-matting.py` (a FAIL **verdict** is a successful judgement → tool exit 0 + JSON report; reserve non-zero exit for operational failure). Freeze drift-guard precedent: `tools/nrbi-render-prompt/render.py` `FROZEN_SHA256` + C1 `knowledge/novel-to-ls/FREEZE_MANIFEST.sha256` (sorted, deterministic).

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `tools/ls-validate/lunascripts/**` (22 vendored files) | Verbatim pinned upstream Go source @b36a407 (the freeze) | 1 |
| `tools/ls-validate/VENDOR.md` | Provenance: upstream repo, full pinned sha, message, re-vendor cmd, n2m-floats-we-pin note | 1 |
| `tools/ls-validate/FROZEN_MANIFEST.sha256` | Deterministic sha256 manifest of the vendored tree (drift guard) | 1 |
| `tools/ls-validate/ls_validate.py` | JSON-I/O bridge: drift-guard → build-on-demand (cache) → verbatim `lsc validate` subprocess → exit/text→JSON; `--mock` | 2 |
| `tools/ls-validate/requirements.txt` | Convention (stdlib-only; no deps) | 2 |
| `tools/ls-validate/test_ls_validate_mock.py` | pytest: mock PASS/FAIL, drift tamper, JSON contract, op-error (no Go) | 2 |
| `agent/packages/opencode/src/tool/asset/ls-validate.ts` | Effect-Schema TS wrapper (nrbi pattern), `never` channel | 3 |
| `agent/packages/opencode/src/tool/asset/ls-validate.txt` | LLM-facing tool description | 3 |
| `agent/packages/opencode/test/tool/ls-validate.test.ts` | bun:test: stub-runner wrapper cases + registry-id assertion | 3,4 |
| `agent/packages/opencode/src/tool/registry.ts` | +3 sites registering the builtin tool | 4 |
| `knowledge/novel-to-ls/novel_to_ls/SKILL.md` | +`## .ls quality gate` knowledge section (post-stage-5; PASS-before-FINAL) | 5 |
| `agent/packages/opencode/test/skill/novel-to-ls-orchestration.test.ts` | +assertion: body names `ls-validate` as the post-`05-episode-writer` gate | 5 |
| `agent/packages/opencode/test/fixture/novel-to-ls/ls-golden/{*.md,PROVENANCE.md}` | 3 byte-frozen real demo-book `.ls` + provenance | 6 |
| `agent/packages/opencode/test/business/novel-ls-compat.test.ts` | bun:test: workspace `NN-stage` parity + golden input-contract | 6 |
| `docs/superpowers/specs/phase-C3-ls-validate-e2e-verification.md` | Acceptance matrix + ledger + evidence | 8 |

No `agent/packages/opencode/src/**` change beyond `ls-validate.ts` + the 3 `registry.ts` lines. **No** `intent-to-skill.ts` / `ASSET_GENERATION_SKILLS` change (validator is not a generation picker — D4/§4.6, keeps B1 overlap ≈0). **No** new `AssetKind`, REST, DB, OpenAPI (design §5).

---

## Task 1 — Vendor + sha256-pin the upstream LS validator (the freeze)

**Files — Create:** `tools/ls-validate/lunascripts/**`, `tools/ls-validate/VENDOR.md`, `tools/ls-validate/FROZEN_MANIFEST.sha256`

- [ ] **Step 1 — Vendor the buildable subset offline from the local clone.** From the worktree root, extract exactly the buildable subset of `b36a407` out of `/Users/august/MobAI/lunascripts` into `tools/ls-validate/lunascripts/` using `git -C /Users/august/MobAI/lunascripts archive b36a407 -- go.mod go.sum cmd internal LICENSE | tar -x -C tools/ls-validate/lunascripts`. Expected: 22 files materialized; tree contains `go.mod`, `go.sum`, `cmd/lsc/main.go`, `internal/{ast,emitter,fixer,lexer,parser,resolver,token,validator}/`, `LICENSE`. No `.git`, no upstream tests/docs.
- [ ] **Step 2 — Build-sanity (proves the vendored subset is self-contained & verbatim-correct).** `cd tools/ls-validate/lunascripts && go build -o /tmp/ls-c3-sanity ./cmd/lscc`. Expected: exit 0, binary produced. Then `/tmp/ls-c3-sanity validate <a trivially-valid one-line @episode .md>` → exit 0; `/tmp/ls-c3-sanity validate <a trivially-invalid file>` → non-zero + diagnostic text. Discard the binary (it is rebuilt by the bridge in Task 2; this step only proves vendor integrity). Record observed pass/fail behavior for Task 2's translation contract.
- [ ] **Step 3 — Write `VENDOR.md`.** Record: upstream repo `https://github.com/cdotlock/lunascripts`; pinned commit full sha `b36a407605c7819e6ca86506b721f34baa09ea3a` + subject; vendored date; the exact re-vendor command (Step 1); `go.mod` go-directive (`go 1.23.4`); the provenance note "n2m `scripts/validate_scripts.sh` clones upstream HEAD unpinned; assets-produce pins `@b36a407` (project convention from n2m `4185c47` / `docs/.../2026-04-25-ls-upstream-sync.md`)"; D6/§8.2 linkage.
- [ ] **Step 4 — Generate `FROZEN_MANIFEST.sha256` deterministically.** A sorted `sha256  <relpath>` line per vendored file under `tools/ls-validate/lunascripts/`, **excluding** the manifest itself and `VENDOR.md` (VENDOR.md carries a volatile vendored-date — exclude it from the integrity set so the drift guard is deterministic; C1 `d015ee9` provenance-determinism precedent). Stable sort, fixed `LC_ALL=C`. Expected: 22 lines.
- [ ] **Step 5 — Verification items.** (a) `FROZEN_MANIFEST.sha256` line-count == vendored buildable file-count (22); (b) recompute the manifest → byte-identical (determinism); (c) Step-2 build exit 0 + valid/invalid behavior recorded; (d) byte-equality vs the local clone @b36a407 proven once now (`git -C /Users/august/MobAI/lunascripts diff b36a407 -- <each vendored path>` empty) — durable guard is the committed manifest (n2m/upstream absent in CI; manifest is the CI-safe equivalent — C1 precedent).
- [ ] **Step 6 — Commit.** Single atomic commit `feat: vendor + sha256-pin upstream LS validator (lunascripts@b36a407)`. Stage only `tools/ls-validate/`.

**Risks:** vendored subset not self-contained (missing `internal/*` pkg) → Step 2 build-sanity catches it before commit. Manifest non-determinism → sorted + `LC_ALL=C` + VENDOR.md excluded (C1 precedent). Go version drift → VENDOR.md records `go 1.23.4`; local go1.26.2 satisfies. Vendoring a non-user-namespace repo's source is a **read/copy into our pre-authorized repo**, not a push — git policy unaffected.

---

## Task 2 — `ls_validate.py` JSON-I/O bridge (drift-guard → build-on-demand → verbatim subprocess → `--mock`)

**Files — Create:** `tools/ls-validate/ls_validate.py`, `tools/ls-validate/requirements.txt`; **Test:** `tools/ls-validate/test_ls_validate_mock.py`

- [ ] **Step 1 — Write the failing pytest first (TDD RED).** Tests (all `--mock` or tamper — **no Go invoked**): (1) `--mock` valid input → stdout JSON `{"verdict":"PASS","errors":[]}`, exit 0; (2) `--mock` with the documented FAIL sentinel input → `{"verdict":"FAIL","errors":[…non-empty…]}`, exit 0 (a FAIL verdict is exit 0 — detect-matting precedent); (3) drift tamper — flip one byte under `lunascripts/` then run non-mock → process raises / exits non-zero with a drift message, **never** silently PASSes; (4) JSON I/O contract — input read from stdin via `--input -`; malformed stdin → non-zero + error JSON; (5) operational error — input referencing a missing script file (non-mock, mock off) → tool exit non-zero + `{"error":true,"message":…}` (NOT a FAIL verdict). Run: `cd tools/ls-validate && python3 -m pytest test_ls_validate_mock.py -v`. Expected: FAIL (module/behavior absent).
- [ ] **Step 2 — Implement `ls_validate.py` to GREEN (behavior contract, no code in this plan):**
  - Input: JSON on stdin (`--input -`, `python-runner.ts` contract). Fields: `script_path` (absolute path to the `.ls`/`.md` to validate) OR `content` (raw LS text). `--mock` flag arg.
  - `--mock`: deterministic canned output; a documented sentinel in the input selects a canned FAIL vs PASS so tests cover both with no Go/network. No filesystem/Go/subprocess touched in mock.
  - Non-mock: (a) **drift guard** — recompute the sorted manifest over `lunascripts/` and compare to `FROZEN_MANIFEST.sha256`; mismatch → raise (operational error, non-zero) — never proceed on drift; (b) **build-on-demand** — `go build -o <cacheDir>/ls ./cmd/lscc` from the vendored source into a cache dir **keyed by the manifest sha** (skip rebuild if a cached binary for that sha exists); (c) materialize the LS text to a temp `.md` (or use `script_path` directly); (d) run the **verbatim** subprocess `<cacheDir>/lsc validate <file>`, capture exit/stdout/stderr; (e) **translate** (no parser behavior change — the parser's exit code is authoritative): exit 0 AND (stdout/stderr empty OR `OK`) → `{"verdict":"PASS","errors":[]}`, tool exit 0; non-zero exit → `{"verdict":"FAIL","errors":[<diagnostic lines split/trimmed>],"raw":<captured text>}`, **tool exit 0**; (f) operational failure (Go missing, build fail, missing input file, drift) → tool exit non-zero + `{"error":true,"message":…}`. Temp files cleaned up. Heavy work guarded so `--mock` needs none of (a)–(e).
  - `requirements.txt`: stdlib-only (empty/comment) — file present for the `tools/<id>/` convention.
- [ ] **Step 3 — Run pytest to GREEN.** `cd tools/ls-validate && python3 -m pytest test_ls_validate_mock.py -v`. Expected: all PASS.
- [ ] **Step 4 — Real-binary smoke (local only, not CI).** `echo '{"script_path":"<a real demo-book ep_*_final.md>"}' | python3 ls_validate.py --input -` → `{"verdict":"PASS",...}` exit 0 (first run builds `ls`, subsequent cached). Record timing for the verification report (build-once cost). Not a committed test (Go absent in CI).
- [ ] **Step 5 — Commit.** `feat: add ls_validate.py frozen-subprocess bridge (drift-guard + --mock)`.

**Risks:** validate-mode emits no JSON → the bridge owns a deterministic text→JSON translation; only `exit 0` ⇒ PASS (never infer PASS from text) so a real parser FAIL can never be masked. First-real-run Go build cost → cache keyed by manifest sha. Drift guard must fire before any build/translate. `--mock` must be fully Go/network-free (CI safety).

---

## Task 3 — TS atomic-tool wrapper `ls-validate.ts` + description + Effect Schema

**Files — Create:** `agent/packages/opencode/src/tool/asset/ls-validate.ts`, `agent/packages/opencode/src/tool/asset/ls-validate.txt`; **Test:** `agent/packages/opencode/test/tool/ls-validate.test.ts`

- [ ] **Step 1 — Write the failing bun:test first (TDD RED), injected stub runner (no Go).** Cases mirroring `test/tool/nrbi-render-prompt.test.ts`: (1) happy — stub returns `{verdict:"PASS",errors:[]}` → tool output reflects PASS, `metadata.error` absent/false; (2) FAIL verdict — stub returns exit 0 + `{verdict:"FAIL",errors:[…]}` → surfaced as a normal result (NOT `metadata.error`: a FAIL verdict is a successful judgement); (3) `dryRun` → runner NOT called; (4) non-zero exit → `metadata.error:true`; (5) malformed JSON stdout → `metadata.error:true`; (6) valid JSON wrong shape → runtime `Schema.decodeUnknownEffect` rejects (M1-hardening precedent, no bare cast); (7) `Parameters` rejects empty/relative `script_path`; (8) `mock:true` ⇒ `--mock` in `extraArgs`, absent otherwise. Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/tool/ls-validate.test.ts --timeout 30000`. Expected: FAIL (module absent).
- [ ] **Step 2 — Implement `ls-validate.ts` to GREEN — copy `nrbi-render-prompt.ts` structure verbatim, substituting:** `TOOL_ID="ls-validate"`; `DEFAULT_SCRIPT = REPO_ROOT/tools/ls-validate/ls_validate.py` (same `import.meta.url` REPO_ROOT walk as nrbi); `Parameters = Schema.Struct({ script_path: <non-empty absolute-path string>, mock?: boolean, dryRun?: boolean })` each `.annotate({description})`; output `LsValidateResult = Schema.Struct({ verdict: Schema.Literals(["PASS","FAIL"]), errors: Schema.Array(Schema.String), raw: Schema.optional(Schema.String) })`; `execute`: dryRun early-return; `extraArgs = params.mock ? ["--mock"] : []`; `Effect.tryPromise` around `runner({script,input:{script_path},extraArgs,timeoutMs,signal:ctx.abort})`; non-zero-exit → `metadata.error:true`; `JSON.parse` fail → `metadata.error:true`; `Schema.decodeUnknownEffect(LsValidateResult)` → mapped error; success → `{title,output,metadata:{truncated:false,…}}`; tail `.pipe(Effect.catch(...succeed metadata.error...))` preserving the `never` channel. Factory `makeLsValidateTool({runner?,scriptPath?}={})` + `export const LsValidateTool = makeLsValidateTool()`. `ls-validate.txt`: concise LLM-facing description (what it is — the LS `.ls` structural/reference validator; when to call — per produced episode before FINAL; that a FAIL verdict means the script is invalid, not a tool error).
- [ ] **Step 3 — Run bun:test to GREEN** (same command as Step 1). Expected: all PASS.
- [ ] **Step 4 — Typecheck.** `cd /Users/august/MobAI/assets-produce/.claude/worktrees/admiring-wilson-5d9f34/agent && PATH=$HOME/.bun/bin:$PATH bun run typecheck`. Expected: 4 successful, 4 total.
- [ ] **Step 5 — Commit.** `feat: add ls-validate atomic-tool TS wrapper (nrbi frozen-subprocess pattern)`.

**Risks:** must preserve nrbi's `never`-error-channel discipline (no thrown error escapes `execute`). FAIL-verdict-is-not-tool-error must be explicitly asserted. Mandatory runtime schema decode (no `as` cast). REPO_ROOT relative walk identical to nrbi (robust in worktree + post-merge).

---

## Task 4 — Register `ls-validate` in the opencode tool registry (3 sites)

**Files — Modify:** `agent/packages/opencode/src/tool/registry.ts`; **Test:** extend `agent/packages/opencode/test/tool/ls-validate.test.ts`

- [ ] **Step 1 — Failing registry test first (TDD RED).** Add a `describe` block (copy nrbi's registry block) that builds `ToolRegistry.Service` under `provideTmpdirInstance` and asserts `registry.ids()` includes `"ls-validate"`. Run the file. Expected: FAIL (id absent).
- [ ] **Step 2 — Apply exactly 3 edits to `registry.ts` to GREEN:** (i) `import { LsValidateTool } from "./asset/ls-validate"` with the other asset-tool imports; (ii) `const lsValidate = yield* LsValidateTool` in the `Effect.gen` resolve block; (iii) `lsValidate: Tool.init(lsValidate),` in the `Effect.all({...})` map AND `tool.lsValidate,` in the returned `builtin:[...]` array. No other tool perturbed. (No `intent-to-skill.ts`/`ASSET_GENERATION_SKILLS` 4th site — the validator is not a generation-picker skill; D4/§4.6.)
- [ ] **Step 3 — Run bun:test to GREEN** + **typecheck** (`agent` 4/4). Expected: file all PASS; 4 successful.
- [ ] **Step 4 — Blast-radius regression.** `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/tool --timeout 30000`. Expected: all pre-existing tool tests still PASS (registration is additive).
- [ ] **Step 5 — Commit.** `feat: register ls-validate in the opencode tool registry`.

**Risks:** exactly 3 sites — over/under-registration breaks the layer; additive only (no reorder of `builtin`). `provideTmpdirInstance` harness must match nrbi's exactly.

---

## Task 5 — Wire the `ls-validate` gate into the `novel_to_ls` orchestration body (knowledge) + structural test

**Files — Modify:** `knowledge/novel-to-ls/novel_to_ls/SKILL.md`, `agent/packages/opencode/test/skill/novel-to-ls-orchestration.test.ts`

- [ ] **Step 1 — Failing structural assertion first (TDD RED).** Extend the C2 orchestration test: a new assertion that the body contains a machine-checkable `## ` section naming the **`ls-validate`** tool as the post-`05-episode-writer` `.ls` quality gate, with semantics "every produced episode `.ls` must get a `ls-validate` `verdict:"PASS"` before that episode/route is declared FINAL; non-PASS → producer-fix loop (same shape as a reviewer CONDITIONAL/FAIL), block FINAL". The existing C2 assertions (6 sections, gate-contract per-cell, `AUTHORING_STAGE_DIRS` coverage, injected-FAIL derivation) must remain unchanged & green. Run: `cd agent/packages/opencode && PATH=$HOME/.bun/bin:$PATH bun test test/skill/novel-to-ls-orchestration.test.ts --timeout 30000`. Expected: the new assertion FAILs, the prior ones PASS.
- [ ] **Step 2 — Amend the body to GREEN (knowledge only — red-line safe; the body is authored, not C1-frozen, absent from `FREEZE_MANIFEST.sha256`).** Add a section (e.g. `## .ls quality gate`) that: (a) states after stage-5 `episode-writer` writes `05-episode-writer/scripts/<ep>.ls`, the driving agent MUST call the registered `ls-validate` tool on each produced episode; (b) PASS → episode may proceed toward FINAL; non-PASS → treat exactly like a reviewer CONDITIONAL (producer fixes the script, re-run `ls-validate`, loop until PASS) and the episode/route MUST NOT be declared FINAL until PASS; (c) cites the C1-frozen `episode-writer/SKILL.md` hard门槛「每集 FINAL 之前必须 `lsc compile` exit 0」 as the source authority; (d) keeps it knowledge — instructs use of the **existing registered tool**, writes no code, defines no engine. Ensure the C2 per-cell gate-contract parser/section invariants still hold (additive section; do not perturb the 6 existing headings the C2 parser asserts unless the assertion set is updated in lock-step).
- [ ] **Step 3 — Run the full orchestration test file to GREEN.** Expected: all (prior 12 + new) PASS. Then run `bun test test/skill --timeout 30000` — zero regressions across the skill suite.
- [ ] **Step 4 — Commit.** `feat: wire ls-validate as the post-episode .ls quality gate in novel_to_ls`.

**Risks:** must not break C2's section-set / gate-contract parser tests → additive section + lock-step assertion update if the heading set is asserted by equality. Gate is **at** the `.ls` boundary (in C-track scope), not a post-LS downstream stage (design §8.2). Knowledge-only — no `*-orchestration` code (§12).

---

## Task 6 — Downstream-compat golden: frozen real demo-book `.ls` + workspace-structure parity test

**Files — Create:** `agent/packages/opencode/test/fixture/novel-to-ls/ls-golden/{<3 real ep_*_final.md>,PROVENANCE.md}`, `agent/packages/opencode/test/business/novel-ls-compat.test.ts`

- [ ] **Step 1 — Freeze 3 representative real demo-book scripts.** Byte-copy 3 `ep_*_final.md` from `/Users/august/MobAI/novels-to-lunascript/lunascripts/no-rules-in-bad-ideas/05-episode-writer/scripts/` spanning ≥2 routes (e.g. `ep_10_weston_final.md`, `ep_10_diego_final.md`, `ep_11_luca_final.md`) into `ls-golden/`. Write `PROVENANCE.md`: n2m HEAD `8049ac772f7350ea593519fbeb891ccaee488c9c`, exact source paths, copy date, "real produced n2m output — the downstream-compat truth set; real-validator fidelity is proven at Task 7 acceptance (Go absent in CI), the committed fixtures are the CI-safe equivalent (C1 precedent)".
- [ ] **Step 2 — Failing parity test first (TDD RED).** `novel-ls-compat.test.ts` asserts: (a) **workspace `NN-stage` parity** — import `AUTHORING_STAGE_DIRS` from `../../src/business/novel/workspace` (not hardcoded); a frozen reference constant in the test lists the n2m demo-book authoring stage-dir names (with a provenance comment: n2m `lunascripts/no-rules-in-bad-ideas/`, HEAD `8049ac7…`, recorded — n2m absent in CI, C1 precedent); assert every `AUTHORING_STAGE_DIRS` entry string-equals its n2m counterpart verbatim, and `ensureNovelWorkspace(tmp, "demo-book")` materializes exactly those dirs + `skills/arc-reviewer`; (b) **golden input-contract** — each `ls-golden/*.md` exists, is non-empty, and the `ls-validate` tool in `mock:true` mode returns a well-formed `LsValidateResult` for each (proves the wrapper accepts the real fixture shape; **real** verdict deferred to Task 7). Run: `bun test test/business/novel-ls-compat.test.ts --timeout 30000`. Expected: FAIL (test/fixtures absent).
- [ ] **Step 3 — Add fixtures + implement the test to GREEN.** Expected: all PASS. Then `bun test test/business --timeout 30000` — zero regressions (incl. C1 `novel-workspace.test.ts`).
- [ ] **Step 4 — Typecheck** (`agent` 4/4).
- [ ] **Step 5 — Commit.** Two atomic commits: `test: freeze real demo-book .ls golden fixtures (downstream-compat)` then `test: assert novel workspace NN-stage parity + golden input-contract` (split: fixtures vs test logic are distinct logical units).

**Risks:** n2m not in CI → frozen byte-copies + recorded reference constant, never read n2m at test time. Golden must be representative (≥2 routes). Real-validator fidelity is **explicitly** Task-7 acceptance evidence, not hidden — stated in PROVENANCE.md + verification.

---

## Task 7 — C3 live e2e acceptance demonstration (controller-executed; evidence-captured; not a subagent code task)

> Not a subagent-driven code task — a controller-run acceptance demonstration (C1/C2 final-verification precedent), bounded LLM spend (one micro-novel, one episode). All evidence captured verbatim into the Task 8 verification report.

- [ ] **Step 1 — Validator fidelity on real data (downstream-compat proof).** Build `ls` once from the vendored pinned source via the Task-2 bridge; run the **real** (non-mock) `ls-validate` over every `ls-golden/*.md` fixture. Expected: every fixture → `verdict:"PASS"`. This proves the frozen `@b36a407` validator agrees with n2m's real produced scripts (fidelity + downstream-compat on real data). Capture commands + outputs + the build-once timing.
- [ ] **Step 2 — Minimal live slice, PASS path.** Author a tiny self-contained public-domain/synthetic micro-novel (a few hundred words, zero copyright risk; store under a scratch path, not committed unless small & licence-clean). `ensureNovelWorkspace(<tmp>, "<slug>")`. Controller drives the `novel_to_ls` orchestration through **one** episode of **one** route, honoring the body: at the gated stage dispatch a **real** fresh-context reviewer subagent via the opencode `task` tool (Agent tool, subagent_type general-purpose, loaded with the relevant frozen reviewer SKILL body + producer output), follow the gate contract on its verdict. `episode-writer` produces one real `.ls` into `05-episode-writer/scripts/`. Run the **real** `ls-validate` on it. Expected: reviewer returns a bare-token verdict the body's gate contract classifies; gate advances on PASS; produced `.ls` → `verdict:"PASS"`; on-disk layout == the `NN-stage` contract. Capture the dispatch transcript summary + produced script + validator output.
- [ ] **Step 3 — Minimal live slice, FAIL-halt path (the C2→C3 deferred live proof).** Repeat the gated step with an injected-FAIL reviewer verdict. Expected: the orchestration **halts** — does NOT advance to the next stage, does NOT declare the episode/route FINAL, surfaces the reviewer report (per `## Halt & surface` + the gate contract `FAIL`→HALT cell). Capture the halt evidence (no downstream stage dir/artifact produced; surfaced report).
- [ ] **Step 4 — If the live drive contradicts the body.** If a real reviewer subagent's verdict shape doesn't match the body's gate-contract token assumptions, that is exactly the watch-item → fix `knowledge/novel-to-ls/novel_to_ls/SKILL.md` (knowledge), re-run Task 5's structural test, re-demonstrate Steps 2–3, commit the body fix. (Discovery → corrective commit, recorded.)
- [ ] **Step 5 — Capture all evidence** for the verification report (exact commands, real validator outputs, dispatch summaries, halt proof, timings).

**Risks:** bounded LLM spend (1 micro-novel, 1 episode). No network (vendor offline, Go build offline). Live-drive may surface a body/reviewer token mismatch → Step 4 corrective loop (expected, recorded — this is the deferred watch-item being discharged for real). Go must be present (verified at plan time: go1.26.2).

---

## Task 8 — C3 verification report + commit/push + final review (closeout)

**Files — Create:** `docs/superpowers/specs/phase-C3-ls-validate-e2e-verification.md`

- [ ] **Step 1 — Final verification commands.** `bun test test/skill test/business test/tool --timeout 30000` (zero regressions, all C1/C2/C3 covered); `cd agent && bun run typecheck` (4/4); `cd tools/ls-validate && python3 -m pytest -v` (bridge mock/tamper green); `git status --short` clean. Record exact pass/fail counts.
- [ ] **Step 2 — Write the verification report:** acceptance matrix vs design §6 C3 row + §8.2 (each criterion ✅/deviation + evidence); per-task two-stage review ledger (Tasks 1–6 full subagent spec+quality review; Task 7 controller-run acceptance with captured evidence; Task-5/7 body-fix loop if any); the validator-fidelity + minimal-live + FAIL-halt evidence; durable decisions (D6 premise correction, vendored pin, gate seam, e2e interpretation); deferred non-blocking minors; "Ready for C4" conclusion. Stable enumerable stat subset (C2 `a95af1c` self-reference precedent).
- [ ] **Step 3 — Commit + push** to `origin/claude/admiring-wilson-5d9f34` (assets-produce push pre-authorized — memory). Atomic `docs:` commit.
- [ ] **Step 4 — Run `superpowers:code-reviewer`** over the whole C3 change set (vendored freeze + bridge + wrapper + registry + body + compat + verification). Address CRITICAL/HIGH; record MINORs.
- [ ] **Step 5 — Surface the user-gated `/compact`** (CLAUDE.md mandates `/compact` between phases; only the user runs it). Do NOT self-invoke; do NOT start C4 plan on saturated context. Stop at the clean C3 boundary.

**Risks:** `/compact` is user-only (CLAUDE.md) — surface, never self-run. C4's n2m DEPRECATED push is hard-gated on explicit user ack (non-user namespace) — not in C3.

---

## Self-Review (writing-plans checklist, run at plan close)

1. **Spec coverage (design §6 C3 row + §7 + §4.6 + §8.2):** `ls-validate` atomic tool in `agent tools list` w/ schema + mock + real fixture → Tasks 1–4,6; full novel→LS run on demo book → Task 7 (compat-golden + minimal-live; literal full-book recorded infeasible per §8.2, user-confirmed); produced `.ls` passes `ls-validate` → Task 7 Steps 1–2; produced workspace structurally matches n2m `lunascripts/no-rules-in-bad-ideas/` → Task 6 parity + Task 7; reviewer FAIL blocks / CONDITIONAL re-review (§7) → Task 5 body gate + Task 7 Step 3 live halt; ≥80% line cov on new glue (§7) → Tasks 2–6 TDD by construction (bridge + wrapper + registry + compat fully exercised; vendored Go source is frozen verbatim, not glue — not coverage-counted, manifest-guarded; C1 coverage-by-construction precedent). No gaps.
2. **Placeholder scan:** no TBD/TODO; every task has exact paths, exact commands, expected outputs, explicit test items + risks; no implementation code (project red line, deliberately — overrides skill show-code default per instruction priority; C1/C2 precedent).
3. **Type/name consistency:** `TOOL_ID`/`LsValidateTool`/`makeLsValidateTool`/`LsValidateResult`/`verdict∈{PASS,FAIL}`/`script_path`/`mock`/`dryRun`/`FROZEN_MANIFEST.sha256`/`ls-golden/` used consistently across Tasks 2–7; `AUTHORING_STAGE_DIRS` imported (not hardcoded) in Task 6; registry "3 sites" consistent with §4.6/D4 (no 4th `intent-to-skill.ts` site). Consistent.

**Plan complete and saved to `docs/superpowers/specs/phase-C3-ls-validate-e2e-plan.md`. Starting execution via subagent-driven-development.**
