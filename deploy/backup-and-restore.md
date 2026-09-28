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

For an operator-selected snapshot, run the separate-instance drill with the
full snapshot ID and its recorded dump digest:

```bash
RECOVERY_SOURCE_LABEL=synthetic-local-test pnpm backup:restic:verify-isolated <full-snapshot-id> <dump-sha256>
```

Set `RECOVERY_SOURCE_LABEL` to the actual source being tested; the example
above labels a synthetic local fixture. The drill requires a clean committed
local web image and the current PostgreSQL image in Compose. It creates a new
PostgreSQL container and volume on an internal network, restores the snapshot,
and starts the existing web image with a read-only database role and no
published port. From inside that web container it checks liveness, readiness,
version identity, the versioned Project list, and a saved Project and Capture
when present. The command reports restore and recovery durations in
milliseconds, plus the snapshot timestamp and its age at drill start, and
saves a private JSON record under
`.agent/restic-recovery-evidence/`. It removes the containers, network, volume,
and temporary credential files on success or failure. The repeatable test also
checks that a wrong archive digest fails and cleanup succeeds.
The isolated web process uses local auth-off mode so its read-only database
role can check restored records without creating a session. Its evidence marks
`authenticatedReadVerified` false. Production sign-in and worker smoke are
separate gates that must still pass before a release.

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

The original local `verify` target is an empty database in the active
PostgreSQL container. `verify-isolated` uses a separate local container and
tests the app read path, but its measured time is not a production recovery
target. Before production deployment, restore an actual offsite snapshot on
the intended recovery host, run application smoke checks, and agree on and
record the achieved recovery point and recovery time. Snapshot age in a local
drill is not a production recovery point guarantee. These scripts do not
export cluster-global role definitions or root-owned configuration, so those
must be captured and tested separately.

## Deployment backup gate

The uninstalled [backup gate](../scripts/commandry-backup-gate.mjs) connects the
streaming backup to the separate-container restore. Its root-owned
[host wrapper](commandry-backup-gate.sh) reads a private
[`backup.env` example](backup.env.example) only after installation under
`/etc/commandry/backup.env` with mode `0600`. The real configuration requires
one dedicated restic password file with mode `0600` and bucket-scoped R2 S3
credentials. The backup key and S3 secret must stay outside this repository.
The production hook accepts only a canonical Cloudflare R2 endpoint, performs
an upload and download through restic, checks the exact dump digest, and
restores into isolated PostgreSQL and web containers without public ports. It
writes the deployment receipt only after those steps and cleanup pass. The
candidate web image must be the approved digest with the expected clean source
revision. No R2 or VPS run has occurred.

`pnpm backup:restic:test` also invokes the gate with a synthetic repository
under `.agent/`. That local mode cannot use an S3 address and emits no
production receipt. It proves orchestration, failure cleanup, and the restored
read path, but it does not prove offsite storage or recovery of root-owned
configuration and PostgreSQL global roles. Record an actual offsite recovery
time and point only after the owner approves the bucket and the VPS run passes.

Cloudflare documents the [R2 S3 endpoint and bucket-scoped credentials](https://developers.cloudflare.com/r2/get-started/s3/)
and [jurisdiction-specific endpoints](https://developers.cloudflare.com/r2/reference/data-location/).
Restic documents its [S3-compatible repository URL and AWS credential variables](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage).
