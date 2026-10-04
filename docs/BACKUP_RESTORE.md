# OpenHaul backup and restore

OpenHaul's persistent state is PostgreSQL plus `data-runtime/` (downloaded/generated map assets and other runtime files).

## Create a backup

From the repository directory:

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh
```

Backups are written to `./backups` by default. Pass another directory as the first argument.

The database dump uses PostgreSQL's `pg_dump` from the running Compose container and is compressed with gzip. If `data-runtime/` exists, it is archived separately.

## Restore

Make sure the target OpenHaul Compose stack is running, then:

```bash
./scripts/restore.sh ./backups/openhaul-YYYYMMDDTHHMMSSZ.sql.gz
docker compose restart openhaul
```

Restore the matching `openhaul-data-*.tar.gz` archive into the repository root if you also want the saved runtime/map files.

## Before upgrades

Create a database backup before pulling a new image. OpenHaul records applied database schema versions in `schema_versions` and applies pending migrations during API startup.

For production, copy backups off the Docker host and apply your normal encryption/retention policy.
