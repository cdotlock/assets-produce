# MSS Validator — Vendor Record

## Upstream

- **Repo:** https://github.com/cdotlock/moonshort-script
- **Pinned commit:** `b36a407605c7819e6ca86506b721f34baa09ea3a`
- **Commit subject:** `docs(fixtures): register T58b in feature_parade README`
- **Vendored date:** 2026-05-19

## Re-vendor command

Run from the assets-produce repository root (requires a local clone of moonshort-script at a path that contains commit `b36a407`):

```sh
rm -rf tools/mss-validate/moonshort-script
mkdir -p tools/mss-validate/moonshort-script
git -C /path/to/moonshort-script archive b36a407 -- go.mod go.sum cmd internal \
  | tar -x -C tools/mss-validate/moonshort-script
```

No network access is required when a local clone is present.

## Go directive

`go.mod` declares `go 1.23.4`. Any Go toolchain >= 1.23.4 satisfies this.

## Provenance note

n2m's `scripts/validate_scripts.sh` clones upstream HEAD **unpinned** (floats); assets-produce **pins** `@b36a407` (project convention).

## Design note

Frozen verbatim per design D6 / §8.2 — reuse the canonical validator, never reimplement.
