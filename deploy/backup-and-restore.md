# PostgreSQL backup and restore drill

**Status: Operational**

The host-side `scripts/restic-postgres.mjs` streams a custom-format `pg_dump`
from the `commandry_backup` database role into a restic repository. `backup`
reports the full restic snapshot ID and the SHA-256 digest of the dump stream in
one JSON line after `restic check` succeeds. `verify` streams that exact
snapshot into a randomly named empty database, checks the restored public
schema and core Project, Capture, and Work tables, and drops the test database.
Supplying the dump digest to `verify` also proves the retrieved archive bytes
match the original stream. Neither command restores over the live database.

The backup role is created on new Commandry database volumes by
`docker/postgres/initdb/20-backup-role.sql`. It has no password, cannot write
data or schema, and is used only over the PostgreSQL container's local socket
through a host-controlled Compose command. PostgreSQL's `pg_read_all_data`
grants read access to all data in this dedicated Commandry cluster, including
future tables. It does not bypass row-level security. An existing local volume
can receive the role by running the same SQL once through `psql` as `postgres`:

```bash
docker compose --env-file .env.local -f compose.yaml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d commandry -f /docker-entrypoint-initdb.d/20-backup-role.sql
```

The role behavior is documented in [PostgreSQL 18 predefined roles](https://www.postgresql.org/docs/18/predefined-roles.html).

## Local drill

Use a private absolute repository path and a private password file containing
at least 32 characters. Initialize the repository once with `restic init`.
Set `RESTIC_REPOSITORY` and `RESTIC_PASSWORD_FILE` to those paths and run:

```bash
pnpm backup:restic
pnpm backup:restic:verify <full-snapshot-id> <dump-sha256>
```

The commands emit machine-readable JSON. The second command must report
`"outcome":"passed"` and a nonzero public table count. It also reports Project,
Capture, and Work row counts from the restored database. On Bazzite, the script
can use the host Homebrew restic through `flatpak-spawn`; elsewhere it uses
`restic` on `PATH`. Node.js 24, restic, the local Compose stack, and its
migrations must be available and current.
Run `pnpm backup:restic:test` for a repeatable isolated drill. It creates a
private local restic repository and disposable schema copy, files a synthetic
capture, checks the read-only role, proves the restore and digest, rejects a
wrong digest, and removes its databases and repository.

## Production activation boundary

The accepted deployment design calls for a root-owned host timer and a private
Cloudflare R2 restic repository. The timer, R2 bucket, access credentials,
retention policy, alerting, key custody, and separate-instance restore are not
activated by this drill. A later production configuration must supply the
Compose environment file at `/etc/commandry/commandry.env`, an absolute
root-owned `RESTIC_PASSWORD_FILE` with mode `0600`, an R2
`RESTIC_REPOSITORY`, and bucket-scoped S3 credentials through a root-owned host
environment file. Do not put secret values in a command line, repository file,
or agent prompt.

The local `verify` target is an empty database in the active PostgreSQL
container. Before production deployment, restore an offsite snapshot into a
separate disposable PostgreSQL instance, run application smoke checks against
it, and record the achieved recovery point and recovery time. The backup
script does not export cluster-global role definitions or root-owned
configuration, so those must be captured and tested separately.
