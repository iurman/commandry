# Production topology template

**Status: Operational**

For the initial operator connection and a safe inventory of the existing VPS,
use the [VPS access and onboarding runbook](../docs/operations/vps-access-and-onboarding.md).

`compose.production.yaml` describes the accepted VPS topology but is
unactivated. It has no published web or database port. Cloudflare Tunnel would
reach Caddy through the private Compose network. The web application, worker,
and one-shot migrator use the same approved image digest. The local Storybook
lab is absent.

The application rejects `APP_ENV=production` unless a reviewed environment
explicitly sets `PRODUCTION_AUTH_MODE=password`, one owner email, and a plain
HTTPS origin. This is a provisional single-owner password path and does not
settle OQ-003 or justify running this file on a VPS. The other gates in
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

## Provisional owner sign-in and operator recovery, not installed

The single-owner password mode is a reversible implementation option while
[OQ-003](../docs/project/open-questions.md#oq-003-what-is-the-first-human-sign-in-and-recovery-method)
stays open. Production requires `PRODUCTION_AUTH_MODE=password` in the private
environment file, a configured owner email, and an HTTPS origin. The example
keeps the mode disabled. Public sign-up is closed; the one-time owner bootstrap
reads the initial password from standard input in a one-shot worker container.
No owner password belongs in the Compose environment or repository. The
`test`/`pass` phone preview gate is separate.

During an approved first release, the application smoke command creates the
configured owner only when the user table is empty. This is a sensitive action
requiring root-controlled deployment access and the exact release approval;
it is never an agent capability. It records `auth.owner_bootstrapped` with the
operator path and release revision, then tests an owner login, a protected API
read, probe-session revocation, and a versioned job completed by the separate
worker. If a later gate fails, the account remains in PostgreSQL because
application rollback does not undo data changes. Recovery after loss of VPS
operator access and human audit attribution remain open.

The uninstalled [`commandry-owner-recover.sh`](commandry-owner-recover.sh)
is intended for `/usr/local/sbin/commandry-owner-recover`, owned by root with
mode `0750`. It accepts no arguments and reads the configured owner email and
new password as two standard-input lines from an operator terminal. It requires
root-owned private configuration, shares the deployment lock, stops web,
changes the password in PostgreSQL, revokes sessions, records an
`auth.owner_password_recovered` event with actor `vps-operator-cli`, and
restarts web if it was running. A failed reset still attempts the restart.
This procedure requires working VPS operator access. The audit actor identifies
the operator path, not a verified human identity.

`pnpm test:auth-smoke` exercises the first-owner, authenticated read, sign-out,
and worker probe against disposable PostgreSQL with built web and worker code;
it also exercises provisional production sign-in and recovery configuration.
The production-mode test supplies HTTPS proxy headers over a loopback test
transport and verifies a Secure session cookie; it does not test the real
Cloudflare Tunnel, Caddy, or VPS access. No production account or recovery
command has been run on the VPS.

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
installed. The wrapper requires root-owned, executable Node.js 24 and restic
binaries at `/opt/commandry/runtime/node` and
`/opt/commandry/runtime/restic`, with no symlinks or group/world write access.
The current VPS has Node only in the `hermes` user's nvm directory and no
restic executable on its search path. Neither runtime has been installed in
the controlled location. The
receipt must have one each of `SNAPSHOT=<64 lowercase hex>`,
`COMPLETED_AT=<UTC ISO 8601 seconds>`, `OFFSITE=true`, and `VERIFIED=true`;
it also requires `RESTORE_PASSED=true` and a full `DUMP_SHA256`. The timestamp
must be within 30 minutes. The hook fails unless the streaming backup,
repository check, exact-digest clean restore, and unexposed web read smoke all
pass. A local `pnpm backup:restic:test` rehearsal uses a synthetic local
repository and never writes a production receipt. The hook does not exist on
the VPS yet, and no R2 bucket or credentials are configured.

Before migration it stops Commandry's existing Tunnel and Caddy services so
the candidate web process cannot receive public traffic before smoke passes.
If a later gate fails, rollback restarts the prior web, worker, Caddy, and
Tunnel services. Ephemera and other unrelated services are outside this
Compose project and are not touched by the command.
After migration and container health, the script checks `/health/live`,
`/health/ready`, and exact `/version` identity from inside the web container.
It then requires root-owned `/usr/local/sbin/commandry-app-smoke` to verify a
real login, an authenticated read, and one enqueue-to-worker result. The smoke
hook receives the environment-file path, image digest, and revision and reads
the owner email and password from standard input. The committed
[`host wrapper`](commandry-app-smoke.sh) runs the one-shot worker command in
the private Compose network. It writes a fresh mode `0600` receipt under
`/var/lib/commandry` only after the exact release, login, read, sign-out,
and worker result match. The deployment command independently validates that
receipt before ingress starts. The hook is not installed, so production
deployment still fails closed. After the hook passes, the
script starts Caddy and cloudflared, records a root-only JSON event, and saves
the current release. On failure it restores the prior application image and
environment, or stops the first-release application containers. The database
schema is never rolled back.
The deployment event records whether smoke passed, its worker job ID, and
whether the first owner was created; the private receipt retains the exact
image and revision for local audit.

Run `pnpm production:deploy:test` for a disposable synthetic command rehearsal.
The tests fake Docker and the two gate hooks, cover successful sequencing,
digest and provenance rejection, backup failure, non-offsite receipt rejection,
and code rollback after smoke failure. Separate local tests exercise the app
smoke wrapper and the real built web plus worker probe. They do not prove
production sign-in through Tunnel and Caddy, real VPS Docker execution, SSH
restrictions, or an offsite restore. `pnpm release:rehearse` separately exercises real local
containers and rollback with synthetic data. Do not activate production until
the remaining readiness gates and explicit release approval are complete.
