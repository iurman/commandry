# Production topology template

**Status: Operational**

For the initial operator connection and a safe inventory of the existing VPS,
use the [VPS access and onboarding runbook](../docs/operations/vps-access-and-onboarding.md).

`compose.production.yaml` describes the accepted VPS topology but is
unactivated. It has no published web or database port. Cloudflare Tunnel would
reach Caddy through the private Compose network. The web application, worker,
and one-shot migrator use the same approved image digest. The local Storybook
lab is absent.

The application currently rejects `APP_ENV=production` at startup. Do not
remove that guard or run this file on a VPS until OQ-003 establishes human
sign-in and recovery. The other deployment gates in
[deployment strategy](../docs/architecture/deployment-strategy.md) also remain:
VPS inventory and capacity, encrypted offsite backup with an actual restore,
and constrained deployment controls. The local rehearsal at
`pnpm recovery:rehearse` proves only a disposable local logical restore.
The [restic backup runbook](backup-and-restore.md) covers a streaming local
backup and isolated PostgreSQL plus web smoke drill. Its local repository is
neither offsite nor a VPS recovery test.
`pnpm backup:local` encrypts the current local PostgreSQL archive and verifies
it in a disposable database. Its ignored `.agent/local-backups/` file stays on
the same machine and requires the local application encryption key. The
recovery screen reports the result at creation, not current file availability.
This command does not meet the offsite backup or VPS restore gate.

`pnpm release:rehearse` builds the prior and current committed application
images, clones local PostgreSQL into an isolated container, and verifies the
web read path and worker heartbeat before an image switch, after it, and after
rolling application code back. It publishes no ports and removes its network,
containers, and volume after the drill. The Recovery screen shows immutable
local evidence. This does not exercise production deployment controls, a VPS
host, human sign-in, or a down migration. Database migrations remain forward.

`production.env.example` contains invalid example values. A later controlled
deployment will read the real root-owned
`/etc/commandry/commandry.env` with mode `0600`. The named Tunnel
configuration and credentials belong under the root-owned
`/etc/commandry/cloudflared/` directory. A deployment identity must not be
able to read either secret location.

`pnpm production:config:check` validates the example's service shape without
printing its values. Passing a real root-owned env path as the command argument
also requires immutable image digest references and rejects placeholders. This
is configuration validation, not a deployment readiness check.

Before activation, validate approved image digests and the resolved Compose
configuration without printing secrets, establish the deployment lock and
backup gate, and rehearse both release rollback and a real offsite restore.
Code rollback never reverses a PostgreSQL migration.

## Constrained deployment command, not installed

`commandry-deploy.sh` is a host-side command for a future controlled release.
No copy of it, its sudo rule, or its gate hooks has been installed on the VPS.
The installed path is fixed at `/usr/local/sbin/commandry-deploy`; the
[`sudoers` template](commandry-deploy.sudoers) allows the `commandry-deploy`
identity to run that command with no arguments. A separate forced SSH command
and an on-host `sudo -l` plus secret-read denial test are still required before
this identity can be called constrained. The identity must not join the Docker
group or own any file below `/opt/commandry` or `/etc/commandry`.

The root-owned, mode `0600` `/etc/commandry/approved-release` is the only
release input. Its [example](approved-release.example) has deliberately fake
metadata. An authorized operator must write an exact GHCR image digest,
40-character Git revision, UTC build time, approval ID, approver, and
`TARGET=production`. The approval expires within one day; this cap is a
provisional local control pending a production approval policy. The deployment
identity can trigger only that approved release; it cannot choose an image or
edit the approval. The production environment and approval files are root-only.
Their parent directory,
the Tunnel credential directory, and `/var/lib/commandry` must be root-owned
with mode `0700`. The script checks path ownership and write permissions,
serializes runs with a lock, pulls the digest,
and compares its repository digest, revision label, and clean-source label to
the approval. It runs Compose with a fixed project, local Docker socket, and
scrubbed environment. Docker and hook output are suppressed to avoid logging
configuration values.

Before migration, the script requires executable, root-owned
`/usr/local/sbin/commandry-backup-gate` to create a fresh mode `0600`
`/var/lib/commandry/predeploy-backup.receipt`. The hook receives
`predeploy <receipt-path> <image-digest> <revision>` and must finish a verified
offsite snapshot and isolated restore. The [host wrapper](commandry-backup-gate.sh)
and [backup configuration example](backup.env.example) are committed but not
installed. The
receipt must have one each of `SNAPSHOT=<64 lowercase hex>`,
`COMPLETED_AT=<UTC ISO 8601 seconds>`, `OFFSITE=true`, and `VERIFIED=true`;
it also requires `RESTORE_PASSED=true` and a full `DUMP_SHA256`. The timestamp
must be within 30 minutes. The hook fails unless the streaming backup,
repository check, exact-digest clean restore, and unexposed web read smoke all
pass. A local `pnpm backup:restic:test` rehearsal uses a synthetic local
repository and never writes a production receipt. The hook does not exist on
the VPS yet, and no R2 bucket or credentials are configured.

After migration and container health, the script checks `/health/live`,
`/health/ready`, and exact `/version` identity from inside the web container.
It then requires root-owned `/usr/local/sbin/commandry-app-smoke` to verify a
real login, an authenticated read, and one enqueue-to-worker result. The smoke
hook receives the environment-file path, image digest, and revision. It is not
installed, so production deployment fails closed. After the hook passes, the
script starts Caddy and cloudflared, records a root-only JSON event, and saves
the current release. On failure it restores the prior application image and
environment, or stops the first-release application containers. The database
schema is never rolled back.

Run `pnpm production:deploy:test` for a disposable synthetic command rehearsal.
The tests fake Docker and the two gate hooks, cover successful sequencing,
digest and provenance rejection, backup failure, non-offsite receipt rejection,
and code rollback after smoke failure. They do not prove the gate hooks,
production sign-in, real Docker execution, SSH restrictions, a VPS deployment,
or an offsite restore. `pnpm release:rehearse` separately exercises real local
containers and rollback with synthetic data. Do not activate production until
the remaining readiness gates and explicit release approval are complete.
