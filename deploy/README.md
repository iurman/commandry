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
