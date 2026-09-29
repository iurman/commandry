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

`pnpm production:topology:rehearse` runs a disposable local subset of this
production Compose file using the exact clean committed local application
image. It starts PostgreSQL 18, the one-shot migrator, web, worker, and Caddy
under a unique project with no published ports. A synthetic owner password is
provided through standard input to the production-mode smoke command, which
bootstraps one account, logs in, reads `/api/v1`, revokes the probe session,
and waits for a versioned worker job. A second probe signs in through Caddy,
reads a server-rendered page and versioned API, and signs out. The rehearsal
copies the init scripts and Caddyfile into a private temporary directory with
local SELinux mount labels; it leaves this production file unchanged. It
removes its containers, network, volume, and temporary credentials, then saves
private synthetic evidence under `.agent/production-topology-evidence/`.
Cloudflare Tunnel is deliberately not started. The local Caddy image is a
rehearsal tag, not an approved production digest. The result marks offsite,
VPS, Tunnel, and public ingress verification false and cannot authorize a
release. The normal local app and Storybook continue running separately.

The [release candidate workflow](../.github/workflows/release-candidate.yml)
can be started manually from the current `main` commit. It runs repository
checks, a production dependency audit, built-app smoke tests, desktop and
phone browser tests against local Compose, and this synthetic production
topology rehearsal. It scans the exact tested image with pinned Trivy tooling:
one pass reports all high and critical findings, and a second pass blocks
findings with available fixes and high or critical secret findings. Unfixed
findings remain visible in the workflow summary; a passing gate does not mean
the image has no vulnerabilities. The workflow tags the tested image with its
commit SHA and a unique workflow run identifier, publishes it to GHCR, pulls
it back by repository digest, and compares its image ID with the tested local
image. The resulting digest appears in the workflow summary. The workflow
has no push trigger or deployment step. It does
not prove an offsite restore, install any VPS control, or validate production
ingress; those gates remain open before a deployment approval.

Before activation, validate approved image digests and the resolved Compose
configuration without printing secrets, establish the deployment lock and
backup gate, and rehearse both release rollback and a real offsite restore.
Code rollback never reverses a PostgreSQL migration.

## Provisional owner sign-in and operator recovery, not activated

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

The installed but unactivated [`commandry-owner-recover.sh`](commandry-owner-recover.sh)
is at `/usr/local/sbin/commandry-owner-recover`, owned by root with mode
`0750`. It accepts no arguments and reads the configured owner email and
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

## One-shot host commissioning

The [`commandry-commission.sh`](commandry-commission.sh) prepares
inert host controls and a restricted `commandry-deploy` SSH identity. It is a
one-shot root operation, not a deployment. It accepts the exact reviewed source
revision, SHA-256 values for the controls archive and manifest, Node.js and
restic binaries, and a separate deployment public key. The operator must copy
the installer itself into a root-owned, non-writable directory and verify its
reviewed SHA-256 before executing it. The script checks the ownership and mode
of its executing copy. It copies every user-staged input into a root-owned
temporary directory and verifies its hash before parsing or running it. The
current runtime versions are Node.js 24.20.0 and restic 0.19.1.

All five hash arguments must be literal expected values prepared on the trusted
local machine, never values recomputed from the files staged on the VPS. The
controls archive and manifest hashes come from a local bundle generated from
the exact committed Git tree and a reviewed file list. Record those hashes in
a trusted local manifest outside VPS staging. The Node.js and restic binary
hashes come from the verified local runtime bundle and its signed upstream
checksum evidence. Hash the dedicated local deploy public key separately.
Check that the bundle revision is the intended Git commit before copying any
artifact. The installer verifies equality to these values, but cannot decide
whether caller-provided values are trustworthy.

It refuses any existing Commandry install path or deploy account. The source
archive must contain only regular files whose names and hashes match the
reviewed manifest. The installed controls are root-owned. Private state and
configuration directories have mode `0700`; the installer leaves environment,
backup, Tunnel, and approval secrets absent. It creates a locked passwordless
`commandry-deploy` account with a normal shell, no home directory, and only its
own group. The public key is accepted only through an authorized-key file owned
by root and the `commandry-deploy` group with mode `0640`, readable by the
deploy identity but not writable by it. The file contains a forced dispatcher.
The installer checks that the account can traverse every directory from `/`
through the key directory and verifies file ownership and mode before
reloading SSH. If account creation does not return confirmed success, it
preserves any account or group left behind for operator inspection and removes
the other new controls.

During the first live SSH check, `root:root` mode `0600` made sshd report
`Permission denied` while opening this file as `commandry-deploy`;
`root:commandry-deploy` mode `0640`
allowed the dedicated key to authenticate. A single no-argument sudo rule
invokes the root-owned deploy command. The appended SSH Match block also
requires public key authentication and disables TTY, forwarding, and user RC
behavior.

Before changing the active SSH configuration, the installer requires explicit
`--tailnet-context` and `--public-context` arguments. Each contains the actual
resolved client host, client source address, server local address, and SSH port
in `host=...,addr=...,laddr=...,lport=22` form. Refresh those values from
the live SSH connection and host resolver immediately before commissioning.
The installer validates the sudoers rule, candidate sshd syntax, and effective
`sshd -T -C` policy for both paths, using both the resolved client name and
its numeric address as `host` to cover DNS-dependent Match behavior. It
requires the forced dispatcher, exactly the root-owned key-file path, no
alternate AuthorizedKeysCommand or trusted user CA, public-key-only
authentication, and no TTY or forwarding. It checks the installed key file's
owner and mode, then reloads the existing `ssh` service without stopping it.
A failed reload restores the previous sshd configuration and removes the new
key, sudo rule, and deploy account. No Commandry service,
container, timer, Tunnel, firewall rule, network listener, or external
connection is started. Ephemera is outside every command in this installer.

On a normal failed run, the installer removes only the new Commandry paths it
created, including inert controls, wrappers, key, and sudo rule. It removes
the account only after `useradd` returns confirmed success. If `useradd`
fails ambiguously, it preserves any partial account or group for operator
inspection before retrying. If restoring the previous SSH
configuration or reloading it fails, it preserves
`/var/lib/commandry/sshd_config.before-commission`. Use the IONOS recovery
console to compare that copy with `/etc/ssh/sshd_config` and repair SSH before
retrying. A hard interruption can leave partially installed paths; inventory
them and confirm the deploy key, sudo rule, and account are absent before a
scoped cleanup. The atomic `/run/commandry-commission.lock` directory
prevents concurrent runs; if left by a crashed process, confirm no
commissioning process is active before removing it.

After a successful run, inspect `sshd -T -C` using the real client address,
verify the account is password-locked with no Docker or sudo group, and test
that a requested command, TTY, unrestricted shell, Docker socket, root shell,
and production secret read are denied through the new key. The local synthetic
fixture test proves the install and rollback sequence but does not establish
actual VPS SSH confinement. Production release, offsite restore, owner sign-in,
and public ingress remain separate gates.

The initial commissioner ran on the IONOS VPS Linux L from reviewed commit
`64cfb06`. The first dedicated-key SSH attempt failed because sshd could not
read the root-owned key file at mode `0600`. A scoped live repair changed only
that file to `root:commandry-deploy` mode `0640`. The dedicated key then
authenticated through both tailnet and public paths. Requested commands,
TTY, Docker socket access, secret reads, and an unrestricted root shell were
denied; the no-argument deployment command failed closed on missing Tunnel
configuration. The source installer now creates the readable mode directly.
No Commandry application, backup timer, or ingress has started on the VPS.
Ephemera remained healthy after commissioning.

## Constrained deployment command, installed but unconfigured

`commandry-deploy.sh` is a host-side command for a future controlled release.
The command, sudo rule, gate hooks, and dedicated SSH dispatcher are installed
on the VPS, but private production configuration and a release approval are
absent.
The installed path is fixed at `/usr/local/sbin/commandry-deploy`; the
[`sudoers` template](commandry-deploy.sudoers) allows the `commandry-deploy`
identity to run that command with no arguments. The installed
[SSH dispatcher](commandry-ssh-dispatch.sh), invalid
[authorized-key example](commandry-deploy-authorized-keys.example), and
[sshd Match example](sshd-commandry-deploy.match.example) constrain a
separate deployment key to that no-argument command. The dispatcher rejects
requested commands and TTYs and clears inherited environment variables before
calling `sudo -n`. The Match block must be appended after existing global
directives, then checked against the complete effective host configuration;
it must not be placed in an early included file. The deployment key must be
distinct from the broad bootstrap operator key. The identity must not join
the Docker or sudo groups or own any file below `/opt/commandry` or
`/etc/commandry`. Local tests cover the dispatcher, and the initial on-host
`sudo -l`, secret-read denial, Docker-socket denial, and unrestricted
root-shell denial verified the installed identity. Recheck these controls
after any host SSH or account change.

The host capability is `commandry.host.deploy.approved-release`, with high
risk. An approved release digest and expiry in the root-owned file authorize
the action; the SSH identity merely triggers that already approved release.
Each deployment records an event in the root-only `deployments.jsonl` and a
private smoke receipt. No product agent receives this capability.

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
is installed; the [backup configuration example](backup.env.example) remains
invalid and uninstalled. The wrapper requires root-owned, executable Node.js 24 and restic
binaries at `/opt/commandry/runtime/node` and
`/opt/commandry/runtime/restic`, with no symlinks or group/world write access.
The commissioner installed Node.js 24.20.0 and restic 0.19.1 from
hash-checked binaries in that controlled location. The receipt must have one each of
`SNAPSHOT=<64 lowercase hex>`,
`COMPLETED_AT=<UTC ISO 8601 seconds>`, `OFFSITE=true`, and `VERIFIED=true`;
it also requires `RESTORE_PASSED=true`, `HOST_RECOVERY_DRILL_PASSED=true`, a
full `DUMP_SHA256`, and
`GLOBALS_SNAPSHOT`, `GLOBALS_SHA256`, `CONFIG_SNAPSHOT`, and `CONFIG_SHA256`
for the encrypted host bundle. The timestamp must be within 30 minutes. The
hook fails unless the streaming backup, PostgreSQL globals and private
configuration readback, isolated role application and configuration
extraction, repository check, exact-digest clean restore, and unexposed web
read smoke all pass. A local `pnpm backup:restic:test` rehearsal uses a
synthetic local repository and never writes a production receipt. The hook
exists on the VPS but is closed by missing configuration. An empty private R2 bucket is reserved, but
backup credentials and a working offsite restore are not configured.

The uninstalled [nightly host service and timer](systemd/commandry-backup.timer)
use the same controlled runtime to create encrypted R2 database, PostgreSQL
globals, and private host configuration snapshots without a release image.
The configuration archive excludes the restic password file if it is inside
`/etc/commandry`; that password needs separate secure custody. The command
applies explicit recent, daily, weekly, and monthly retention values; its
committed example deliberately sets invalid zeroes. It keeps private
last-attempt and last-success JSON records and exits nonzero on
failure. A separate uninstalled hourly health unit fails on a failed attempt
or a snapshot older than the configured maximum age. Local synthetic rehearsals
exercise retention and those status states. The uninstalled
[webhook alert adapter](backup-and-restore.md#provisional-backup-alert-transport-not-installed)
can deliver and deduplicate failure and resolution events, but its local test
uses only a synthetic loopback receiver. Choosing retention and freshness
targets, an approved owner alert receiver, R2 access, and installation remain
gates.
An uninstalled monthly timer can apply retained PostgreSQL globals to a
disposable cluster, extract the private configuration into a disposable
directory, and restore a fresh database snapshot into isolated PostgreSQL and
web containers using the current approved image. The local test runs that
path against a synthetic repository and proves complete cleanup. The monthly
command does not install configuration on the live host. A clean VPS recovery
and authenticated read remain separate requirements.

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
the owner email and password from standard input. The installed
[`host wrapper`](commandry-app-smoke.sh) runs the one-shot worker command in
the private Compose network. It writes a fresh mode `0600` receipt under
`/var/lib/commandry` only after the exact release, login, read, sign-out,
and worker result match. The deployment command independently validates that
receipt before ingress starts. The hook is installed but lacks production
configuration and owner credentials, so deployment still fails closed. After the hook passes, the
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
