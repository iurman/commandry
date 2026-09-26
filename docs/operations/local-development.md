# Local development

**Status: Operational**

This runbook covers the local foundation. It does not provision the VPS or
establish production readiness. The accepted topology and its deployment gates
are in [Deployment strategy](../architecture/deployment-strategy.md).

## Host prerequisites

- Node.js 24 and the pnpm version pinned in the root `package.json`.
- A Docker-compatible container runtime and Compose provider for the database
  and image checks. On this Bazzite laptop, host Podman and a Homebrew Docker
  Compose provider are reached from Toolbx through the repository runtime
  bridge.
- A private, gitignored `.env.local` with `DB_NAME`, `DB_ROOT_PASSWORD`,
  `DB_APP_PASSWORD`, `DB_MIGRATION_PASSWORD`, `BETTER_AUTH_SECRET`, and
  `APP_ENCRYPTION_KEY`. `APP_ORIGIN` defaults to
  `http://127.0.0.1:3000` for the local Compose stack.

The Toolbx-to-host runtime bridge was verified on 2026-09-26 with
`pnpm run doctor` and `pnpm compose:up`. The local Compose stack started its
PostgreSQL, migrator, web, and worker services successfully.

Use independent, random, URL-safe values for all local passwords. The Compose
connection strings interpolate the password values into URLs, so hex values
from `openssl rand -hex 32` work without URL encoding. Never put production
credentials or data in `.env.local`.

## Fast local loop

Run from the repository root:

```sh
cd /home/urmani/Documents/Personal/commandry
pnpm setup
pnpm dev
```

`pnpm dev` uses `compose.dev.yaml` to make PostgreSQL available to host Node
processes on `127.0.0.1:5432` by default. Set `DB_HOST_PORT` in `.env.local`
before startup if another local service uses that port. The base Compose file
does not publish PostgreSQL on the host.

## Local checks

```sh
cd /home/urmani/Documents/Personal/commandry
pnpm check
pnpm test
pnpm test:integration
pnpm build
pnpm test:smoke
pnpm test:e2e
pnpm lab:check
pnpm run doctor
```

The integration runner creates and removes a disposable PostgreSQL 18 cluster;
it does not use production data. Playwright starts a loopback Next.js server.
`pnpm lab` starts the local-only Storybook server on port 6006. Use
`pnpm run doctor` for the repository's prerequisite check: pnpm 11 also has a
built-in `pnpm doctor` command, which checks pnpm itself instead of running the
repository script.

## Authenticated LAN design review

Start the local stack, then run the explicit LAN preview from the repository
root in a second terminal:

```sh
cd /home/urmani/Documents/Personal/commandry
pnpm compose:up
pnpm preview:lan
```

The preview command builds an ignored static Storybook output under
`apps/lab/storybook-static`, selects the active private Wi-Fi IPv4 address,
and prints two phone-ready URLs. Port 3001 proxies only the app root and
required Next.js static assets from `127.0.0.1:3000`. Port 3002 serves the
static design lab. Both ports require HTTP Basic authentication, accept only
GET and HEAD, and reject clients outside the selected address's subnet. API,
auth, health, and version paths are unavailable through the preview. The app
and its unauthenticated API stay bound to loopback.

For this local review preview, use username `test` and password `pass` on both
ports. These fixed credentials are for the read-only preview gateway only;
they are not Commandry product sign-in credentials. If automatic Wi-Fi
selection is ambiguous, pass an active private address:
`pnpm preview:lan --host 10.0.0.73`. The preview uses plain HTTP on the local
network, so use it only on a trusted private Wi-Fi network. Stop the preview
with Ctrl+C. `pnpm preview:lan:test` verifies authentication, route denial,
read-only behavior, and subnet filtering.

As of 2026-09-26, the laptop preview runs as the transient user service
`commandry-lan-review.service`, so it stays available after the launching
terminal closes. From Toolbx, inspect or stop it with
`flatpak-spawn --host systemctl --user status commandry-lan-review.service`
or `flatpak-spawn --host systemctl --user stop commandry-lan-review.service`.
It does not start automatically after a reboot; use `pnpm preview:lan` again.

## Production-shaped local stack

The local stack builds one Node.js 24 image for the web server, worker, and
one-shot migrator. It also starts PostgreSQL 18 with pgvector available. The
web port is bound to `127.0.0.1:3000`; there is no Tunnel or public reverse
proxy in this local manifest. The Node.js and PostgreSQL base images are pinned
to OCI manifest digests. Compose waits for the web readiness query and a recent
worker heartbeat before reporting the stack healthy.

In the isolated `commandry-mvp` campaign worktree, the Compose web port is
`127.0.0.1:3010` and the full same-Wi-Fi review gateway is
`http://10.0.0.73:3011/` with the local `test` / `pass` review gate. That
gateway permits same-origin `/api/v1` interactions for phone review but does
not proxy `/mcp` writes. An assigned synthetic agent can receive a
packet-scoped MCP read session from its execution-packet page. Its bearer token
is shown once; a client on this laptop uses `http://127.0.0.1:3010/mcp` and
`Authorization: Bearer <token>`. Session scope, expiry, revocation, and audits
are visible from the packet. This is local review tooling, not product
authentication or a public MCP deployment.

```sh
cd /home/urmani/Documents/Personal/commandry
pnpm compose:up
flatpak-spawn --host /home/urmani/.local/bin/docker compose --env-file .env.local -f compose.yaml ps
curl --fail http://127.0.0.1:3000/health/live
curl --fail http://127.0.0.1:3000/health/ready
pnpm compose:down
```

To use only the database from the host, add the development override:

```sh
cd /home/urmani/Documents/Personal/commandry
flatpak-spawn --host /home/urmani/.local/bin/docker compose --env-file .env.local -f compose.yaml -f compose.dev.yaml up -d postgres
flatpak-spawn --host /home/urmani/.local/bin/docker compose --env-file .env.local -f compose.yaml -f compose.dev.yaml ps postgres
flatpak-spawn --host /home/urmani/.local/bin/docker compose --env-file .env.local -f compose.yaml -f compose.dev.yaml down
```

The named volume `commandry-local-postgres` persists across `down` and
container recreation. The PostgreSQL 18 image expects the volume mounted at
`/var/lib/postgresql`; its data directory is below that path. The init script
creates roles only when that volume is first initialized. Changing a password
in `.env.local` after initialization does not change the stored PostgreSQL
role password.

## Database roles and extension check

The local `postgres` superuser is confined to the database container. The
`commandry_migrate` role can create schemas in the local database and objects
in `public` and `pgboss`. The `commandry_app` role used by web and worker
receives table, sequence, and function access from the migration role's default
privileges, but no database or schema `CREATE` privilege.
The migrator receives `DATABASE_MIGRATION_URL`; web and worker receive only
`DATABASE_URL`. pg-boss schema installation runs in the migrator, while the
worker starts with its own migration behavior disabled.

With the stack started, verify the database image and local grants with:

```sh
cd /home/urmani/Documents/Personal/commandry
flatpak-spawn --host /home/urmani/.local/bin/docker compose --env-file .env.local -f compose.yaml exec postgres sh -lc 'psql -U postgres -d "$POSTGRES_DB" -c "SELECT version(); SELECT name, default_version FROM pg_available_extensions WHERE name IN ('\''vector'\'', '\''pg_trgm'\''); SELECT has_schema_privilege('\''commandry_app'\'', '\''public'\'', '\''CREATE'\'') AS app_can_create_public, has_schema_privilege('\''commandry_app'\'', '\''pgboss'\'', '\''CREATE'\'') AS app_can_create_pgboss;"'
```

The two privilege results should be false. Availability of `vector` does not
enable vector search: a reviewed migration will create the extension only
when a feature needs it. The selected image tag and PostgreSQL 18 volume
behavior are documented by [pgvector](https://github.com/pgvector/pgvector#docker)
and the [PostgreSQL official image](https://hub.docker.com/_/postgres#pgdata).

## Parallel local worktrees

A second checkout can run beside the default stack without sharing its database
or ports. Run `pnpm setup` inside that worktree so it has independent ignored
secrets, then set these local-only values in its `.env.local`:

```dotenv
COMPOSE_PROJECT_NAME=commandry-mvp
DB_VOLUME_NAME=commandry-mvp-postgres
WEB_HOST_PORT=3010
DB_HOST_PORT=5433
APP_ORIGIN=http://127.0.0.1:3010
```

Change the port in that worktree's `DATABASE_URL` and
`DATABASE_MIGRATION_URL` to `5433` as well. `pnpm compose:up` will then run a
separate Compose project, named volume, and web endpoint. The production-shaped
web container still listens on port 3000 internally. `pnpm lab` stays on
loopback port 6006 and is not part of the Compose image. Use different host
ports and names if those values are already occupied.

## Current limits

The local Compose file is a development and verification artifact. VPS
inventory, offsite backup and restore, deployment controls, and the human
sign-in and recovery choice remain required before production provisioning.
The `/api/v1` scaffold is unauthenticated and
[accepts only local/test runtime configuration](../../packages/config/src/index.ts)
with a loopback origin and local PostgreSQL host. Better Auth
persistence and route wiring exist, but no human sign-in or recovery method has
been chosen. Do not expose this local stack as a public service.
