#!/bin/bash
# ============================================================
# pg_dump 自动备份 — 保留最近 10 份
# 用法:
#   手动: pnpm db:backup
#   定时: crontab -e → 0 */6 * * * /path/to/scripts/db-backup.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
CONTAINER="agent-forge-db-dev"
DB_NAME="agent_forge"
DB_USER="postgres"
KEEP=10

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="agent_forge_${TIMESTAMP}.sql"

echo "⏳ Backing up $DB_NAME → backups/$FILENAME ..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists > "$BACKUP_DIR/$FILENAME"

echo "✅ Backup complete: backups/$FILENAME ($(wc -c < "$BACKUP_DIR/$FILENAME" | tr -d ' ') bytes)"

# 清理旧备份，只保留最近 KEEP 份
cd "$BACKUP_DIR"
COUNT=$(ls -1 agent_forge_*.sql 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  REMOVE=$((COUNT - KEEP))
  ls -1t agent_forge_*.sql | tail -n "$REMOVE" | xargs rm -f
  echo "🧹 Removed $REMOVE old backup(s), keeping latest $KEEP"
fi
