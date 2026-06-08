# LS Validator — Vendor Record

## Upstream

- **Repo:** https://github.com/cdotlock/lunascripts
- **Pinned commit:** `b36a407605c7819e6ca86506b721f34baa09ea3a`
- **Commit subject:** `docs(fixtures): register T58b in feature_parade README`
- **Vendored date:** 2026-05-19

## Re-vendor command

Run from the assets-produce repository root (requires a local clone of lunascripts at a path that contains commit `b36a407`):

```sh
rm -rf tools/ls-validate/lunascripts
mkdir -p tools/ls-validate/lunascripts
git -C /path/to/lunascripts archive b36a407 -- go.mod go.sum cmd internal \
  | tar -x -C tools/ls-validate/lunascripts
```

No network access is required when a local clone is present.

Note: upstream has no LICENSE file at b36a407 (top-level tree at that commit: `.gitignore LS-SPEC.md Makefile README.md cmd docs go.mod go.sum internal skills testdata`). The re-vendor command intentionally omits a `LICENSE` pathspec because `git archive` fatals (exit 128, zero output) on any unmatched pathspec — an absent path must be omitted, not relied on as a no-op. The vendored tree is 22 files; no omission should be suspected.

## Go directive

`go.mod` declares `go 1.23.4`. Any Go toolchain >= 1.23.4 satisfies this.

## Provenance note

n2m's `scripts/validate_scripts.sh` clones upstream HEAD **unpinned** (floats); assets-produce **pins** `@b36a407` (project convention).

## Design note

Frozen verbatim per design D6 / §8.2 — reuse the canonical validator, never reimplement.
