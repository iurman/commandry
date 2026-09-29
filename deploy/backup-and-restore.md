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
The default isolated web process uses local auth-off mode so its read-only
database role can check restored records without creating a session. Its
evidence marks `authenticatedReadVerified` false. The repeatable local test
can opt into a synthetic owner probe through a private
`RECOVERY_AUTH_PROBE_FILE`. It creates the owner in a disposable source
database, restores that database, then verifies unauthenticated denial, owner
sign-in, protected Project and Capture reads, a protected page, sign-out, and
session revocation. The probe uses a writable role only inside the disposable
restore and never records credentials in evidence. Production rejects this
probe; production sign-in and worker smoke remain separate gates before a
release. Neither local mode proves an offsite or VPS restore.

## Production activation boundary

The accepted deployment design calls for a root-owned host timer and a private
Cloudflare R2 restic repository. A private, empty `commandry-backups` bucket
has been reserved. The timer, access credentials, retention policy, alerting,
key custody, and separate-instance restore are not activated by this drill.
A later production configuration must supply the
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
drill is not a production recovery point guarantee. The host bundle captures
PostgreSQL global roles and root-owned Commandry configuration as encrypted
restic snapshots, then reads them back and checks their SHA-256 digests. The
[host recovery drill](../scripts/restic-host-recovery.mjs) applies the original
global-role SQL to a separate PostgreSQL cluster with no network, extracts the
configuration into a private disposable directory, and verifies cleanup. It
does not install configuration on a replacement host. Keep the restic password
outside the configuration archive and in separate secure custody.

## Deployment backup gate

The installed but unconfigured [backup gate](../scripts/commandry-backup-gate.mjs) connects the
streaming backup to the separate-container restore. Its root-owned
[host wrapper](commandry-backup-gate.sh) reads a private
[`backup.env` example](backup.env.example) only after installation under
`/etc/commandry/backup.env` with mode `0600`. The real configuration requires
one dedicated restic password file with mode `0600` and bucket-scoped R2 S3
credentials. The backup key and S3 secret must stay outside this repository.
The host wrapper executes only a root-owned Node.js 24 binary at
`/opt/commandry/runtime/node` and sets `RESTIC_BINARY` to the root-owned
`/opt/commandry/runtime/restic`. Both binaries must be executable and their
paths must not be symlinks or group/world writable. The commissioner installed
verified Node.js 24.20.0 and restic 0.19.1 in these root-owned paths. The
backup gate still fails closed without private R2 configuration and a real
offsite restore.
The production hook accepts only a canonical Cloudflare R2 endpoint, performs
an upload and download through restic, checks the exact dump digest, and
restores into isolated PostgreSQL and web containers without public ports. It
applies globals and extracts configuration in disposable local resources. It
writes the deployment receipt only after those steps, readback, and cleanup
pass. The receipt links the database, globals, and
configuration snapshot IDs to their SHA-256 digests. The candidate web image
must be the approved digest with the expected clean source
revision. No R2 or VPS run has occurred.

The first release has a distinct bootstrap order. The constrained deploy
command rejects an existing unmarked Commandry database volume and any running
Commandry web, worker, or ingress service. It creates a new volume with a
generated identity in its Docker labels, checks those labels before and after
starting PostgreSQL, and records PostgreSQL's cluster system identifier in a
private mode `0600` `pending-first-release` marker alongside the approved
image, revision, and volume identity. It keeps Commandry ingress closed and
runs the initial migration before this first
backup. The backup gate then archives the pending marker, reads its encrypted
bytes back, extracts and checks its exact SHA-256 in the isolated host recovery
drill, restores the migrated database in separate containers, and ties the
marker digest to the receipt. Only after the application and worker smoke
checks and ingress start does the deploy command replace the pending state with
`current-release`. Both markers also bind the canonical PostgreSQL database
name. Before any Docker command, the deploy gate requires that name to match
`DB_NAME` in the private production and backup files and the exact database
path in both application and migration URLs. Those URLs must target the
`postgres:5432` Compose service with the expected role, and cannot contain
query strings, fragments, or ambiguous interpolation. The backup gate checks
its private `DB_NAME` against the marker before dumping, and the receipt repeats
the database name for the deploy gate to verify before migration. The production
environment also requires a single canonical assignment grammar: blank lines,
comments, and unique uppercase `KEY=value` lines with
nonempty unquoted printable values. Spaces, quotes, backslashes, `#`, and `$`
are disallowed in values. Compose `KEY: value` and `export KEY=value` forms,
malformed lines, and duplicate keys are rejected before Docker starts. A failed first
release after marker creation stops only
Commandry web, worker, and ingress started by that attempt while retaining the
pending marker and database volume for a retry of
the same approved image, revision, volume, and PostgreSQL cluster. A missing
pending volume, changed cluster identifier, or crash before the marker is
recorded requires a separately reviewed recovery path; the command never
silently initializes a replacement database. Subsequent releases keep the
backup-before-migration order and restore the prior code and release marker on
failure. The active `current-release` marker retains the volume name, database
name, bootstrap label, and PostgreSQL cluster identifier. An upgrade compares those
to the private environment, Docker volume, and running cluster before its
backup; it rejects an edited volume name or replacement cluster. If the
running cluster identity cannot be confirmed after PostgreSQL starts, rollback
stops Commandry web, worker, and ingress without restarting them against an
unverified database. The previous release marker and environment are restored,
but operator recovery must confirm the database before another deployment.
Pre-database validation failures preserve the running previous release. A legacy
active marker without volume and database identities has no trustworthy database identity
and requires operator review before any upgrade. This first-release exception
has only synthetic local command tests;
the actual R2 and VPS restore still need proof before production activation.

`pnpm backup:restic:test` also invokes the gate with a synthetic repository
under `.agent/`. That local mode cannot use an S3 address and emits no
production receipt. It proves orchestration, failure cleanup, and the restored
read path, plus encrypted readback, isolated global-role application, and
disposable extraction of synthetic private configuration. It does not prove
offsite storage or installing configuration on a clean host. Record an actual
offsite recovery time and point only after the owner approves the bucket and
the VPS run passes.

## Nightly host backup path, not installed

The [systemd service](systemd/commandry-backup.service) calls the same
root-owned host wrapper with `nightly`; its [timer](systemd/commandry-backup.timer)
requests a daily UTC run with a bounded random delay and catches a missed run
after reboot. Neither unit is installed or enabled on the VPS. The wrapper
requires the controlled Node.js 24 and restic binaries described above. The
nightly wrapper shares the deployment and owner-recovery lock, waiting up to
15 minutes rather than pruning during a release or password reset. The
nightly command reads only the private R2 backup configuration, streams a new
PostgreSQL dump, PostgreSQL global roles, and a tar archive of
`/etc/commandry` plus `/var/lib/commandry/current-release` into three tagged
restic snapshots. It excludes the restic password file from the archive if
that file is within `/etc/commandry`; keep this password separately for
recovery. It reads back and checks the two host bundle digests, runs
`restic check`, applies the configured recent, daily, weekly, and monthly
retention counts to `commandry-postgres` snapshots with
`restic forget --prune`, then checks the repository again. The real
`backup.env` must supply positive `RETENTION_LAST`, `RETENTION_DAILY`,
`RETENTION_WEEKLY`, `RETENTION_MONTHLY`, and `MAX_BACKUP_AGE_HOURS` values;
the committed example uses invalid zeroes so no owner policy is silently
chosen. A failed retention or integrity pass leaves the prior success record
unchanged and marks the latest attempt failed. It verifies all three new
snapshot IDs survive retention. The command does not require a release image
or issue a predeploy receipt.

After a passing run, the command atomically writes mode `0600`
`/var/lib/commandry/backup-last-success.json` and
`backup-last-attempt.json`. A failed run writes only the last-attempt record,
preserving the last confirmed success. The JSON records the database snapshot
and dump digest, both host bundle snapshot IDs and digests, completion time,
repository-check result, and whether storage was offsite. It explicitly sets
`restoreVerified` to false: the nightly upload is
not a clean restore. The service also exits nonzero on failure for the systemd
journal. These local status files are not an owner notification channel.

The `rehearse` mode uses a disposable local encrypted repository under
`.agent/`, writes status only in a private local test directory, and marks
`offsiteStored` false. `pnpm backup:restic:test` checks a passing nightly
rehearsal, rejected policy and database failures, and a failed attempt that
leaves the prior success intact.

The uninstalled [health service](systemd/commandry-backup-health.service) and
[hourly timer](systemd/commandry-backup-health.timer) read these private
records. The probe fails if the latest attempt failed, the saved success and
attempt do not match, or the successful snapshot is older than the configured
maximum age. A new backup in progress is reported as such while the previous
success remains fresh; an attempt still running after the service's 90-minute
limit fails as stalled. A local rehearsal checks healthy, in-progress, stalled,
failed, and stale states. The
probe's nonzero systemd result and journal entry are machine-readable host
signals. The separate notification path below remains uninstalled.

## Provisional backup alert transport, not installed

The [alert service](systemd/commandry-backup-alert.service) and
[fifteen-minute timer](systemd/commandry-backup-alert.timer) can run the same
backup health probe and POST a small JSON firing or resolved event to an
owner-approved HTTPS webhook. This is a configurable local implementation, not
a decision about the canonical alert provider or a running owner notification.
The invalid [example](alert.env.example) documents the private
`/etc/commandry/alert.env` and separate bearer-token file. Both must be
root-owned, mode `0600`, and under `/etc/commandry`. The webhook URL cannot
contain credentials, a query, or a fragment. Redirects are rejected. The
payload contains the condition, health reason, timestamp, environment, and a
stable event ID. It contains no backup credential or response body. The
production payload labels its source as VPS offsite backup health.

The host capability is `commandry.host.backup_alert.dispatch`, with medium
risk because it sends operational status outside the VPS. It is not exposed to
product agents. Activation requires explicit owner approval of the receiver,
its token and delivery policy, plus root-controlled installation of the unit.
After activation, each delivery or failure records a private mode `0600`
`/var/lib/commandry/backup-alert-last-attempt.json` audit record. Successful
delivery updates `backup-alert-state.json`; the next timer run suppresses a
repeat of the same unresolved reason. A failed delivery remains retryable with
the same event ID. A healthy probe sends one resolution for an active incident.
The controlled host wrapper uses a separate lock so overlapping runs cannot
duplicate delivery, and alert dispatch does not depend on a working restic
binary. A provider's receipt or acknowledgement semantics, repeat reminders,
and the final owner channel remain open choices.

`node --test scripts/commandry-backup-alert.test.mjs` rehearses a healthy
probe, a synthetic failed backup, duplicate suppression, rejected delivery,
retry, and resolution against a loopback receiver. Its JSON explicitly marks
the event as simulated and the source as synthetic. It makes no external
request. Neither the service nor the timer is installed on the VPS.

Before enabling the timers, select retention and maximum-age values based on
measured data growth and accepted recovery targets, approve and install an
owner-facing failure and staleness alert channel, test a monthly clean restore, and record
achieved recovery point and time. None of those choices is implied by these
uninstalled units. Do not treat the nightly status file as restore evidence.

## Monthly isolated restore path, not installed

The uninstalled [monthly service](systemd/commandry-restore-monthly.service)
and [timer](systemd/commandry-restore-monthly.timer) select the latest retained
nightly snapshot only if its private success record is fresh under the chosen
maximum-age policy. The root-owned wrapper shares the deployment lock. On a
production host, the command reads the current immutable image digest and Git
revision from `/var/lib/commandry/current-release`, then invokes the existing
separate-container PostgreSQL and web restore against the R2 snapshot and exact
dump digest. It also reads back the retained PostgreSQL globals and host
configuration snapshots, applies the globals to a separate PostgreSQL
cluster with no network, and extracts configuration into a private disposable
directory. It requires the restored web health, version, and versioned read
checks, exact source evidence, no published ports, and complete cleanup before
recording a private mode `0600` version 3 monthly success. A failure marks only the
latest monthly attempt and preserves the last successful monthly record.

The local `monthly-rehearse` mode completes that same isolated restore with a
labeled synthetic snapshot. It marks `offsiteVerified` and
`vpsRecoveryVerified` false. Even a passing future production run will not
prove installation of host configuration, application of global roles on a
replacement VPS, or an authenticated human session; its record keeps
`vpsRecoveryVerified` and
`authenticatedReadVerified` false. A separate clean VPS recovery exercise and
the production login smoke gate remain required before activation.

Cloudflare documents the [R2 S3 endpoint and bucket-scoped credentials](https://developers.cloudflare.com/r2/get-started/s3/)
and [jurisdiction-specific endpoints](https://developers.cloudflare.com/r2/reference/data-location/).
Restic documents its [S3-compatible repository URL and AWS credential variables](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage).
