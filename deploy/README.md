# Production topology template

**Status: Operational**

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
