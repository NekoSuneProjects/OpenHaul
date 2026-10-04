#!/usr/bin/env sh
set -eu

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"

DB_CONTAINER="${OPENHAUL_POSTGRES_CONTAINER:-$(docker compose ps -q postgres)}"
if [ -z "$DB_CONTAINER" ]; then
  echo "Postgres container not found. Start OpenHaul first." >&2
  exit 1
fi

DB="${POSTGRES_DB:-openhaul}"
USER="${POSTGRES_USER:-openhaul}"
ARCHIVE="$OUT_DIR/openhaul-$STAMP.sql.gz"

docker exec "$DB_CONTAINER" pg_dump -U "$USER" -d "$DB" --clean --if-exists --no-owner | gzip > "$ARCHIVE"

if [ -d "./data-runtime" ]; then
  tar -czf "$OUT_DIR/openhaul-data-$STAMP.tar.gz" ./data-runtime
fi

echo "Database backup: $ARCHIVE"
