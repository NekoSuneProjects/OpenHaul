#!/usr/bin/env sh
set -eu

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: ./scripts/restore.sh backups/openhaul-YYYYMMDDTHHMMSSZ.sql.gz" >&2
  exit 1
fi

DB_CONTAINER="${OPENHAUL_POSTGRES_CONTAINER:-$(docker compose ps -q postgres)}"
if [ -z "$DB_CONTAINER" ]; then
  echo "Postgres container not found. Start OpenHaul first." >&2
  exit 1
fi

DB="${POSTGRES_DB:-openhaul}"
USER="${POSTGRES_USER:-openhaul}"

echo "Restoring $ARCHIVE into $DB..."
gzip -dc "$ARCHIVE" | docker exec -i "$DB_CONTAINER" psql -U "$USER" -d "$DB"
echo "Restore complete. Restart OpenHaul with: docker compose restart openhaul"
