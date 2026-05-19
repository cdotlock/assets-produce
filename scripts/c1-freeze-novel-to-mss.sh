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
