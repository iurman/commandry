# Deployment strategy

**Status: Proposed**

**Recommendation date:** 2026-09-21

The proposed initial deployment is one existing VPS running Docker Compose.
Cloudflare provides DNS, edge protection, and an outbound Tunnel. It does not
run Commandry's application code. PostgreSQL, the web application, and the
background worker run in containers on the VPS.

This proposal must not be provisioned until the owner accepts the related ADRs
and the VPS inventory in this document is completed.

## Initial production topology

```text
browser, native client, webhook, or agent
                  |
       Cloudflare DNS and edge
                  |
        outbound Cloudflare Tunnel
                  |
              Caddy proxy
                  |
        +---------+---------+
        |                   |
  Next.js web/API      health and static
        |
        +-------------------+
        |                   |
  PostgreSQL 18        pg-boss worker
  canonical state      schedules and jobs
        |
   encrypted nightly logical backup
        |
  Cloudflare R2 offsite bucket
```

Privileged execution runners are outside this trust boundary. They communicate
with the public API using scoped machine credentials and never connect directly
to production PostgreSQL.

## Compose services

The production Compose project contains these services:

| Service | Responsibility | Public port |
| --- | --- | --- |
| `web` | Next.js standalone server, `/api/v1`, auth, SSE, health, and version | None |
| `worker` | pg-boss supervisors, consumers, schedules, retries, and dead-letter handling | None |
| `postgres` | PostgreSQL 18 with `pg_trgm` and optional `vector` extension | None |
| `caddy` | Internal reverse proxy, request limits, forwarded headers, and access logs | None when Tunnel is active |
| `cloudflared` | Outbound connection from the VPS to the named Cloudflare Tunnel | None |
| `migrate` | One-shot Drizzle migration image using the same release as `web` | None |

Backups run from a root-owned host systemd timer or a one-shot Compose command,
not from the web or worker container. The timer creates a logical PostgreSQL
backup, encrypts and uploads it to R2, verifies repository integrity, and emits
a machine-readable result.

The database data directory uses a named local volume on durable VPS storage.
It is never baked into an image and is never mounted into the web or worker
containers.

## Environments

- **local:** host Node processes for fast reload plus Docker PostgreSQL, or the
  full Compose stack when production parity is under test.
- **test:** disposable PostgreSQL and application containers created in CI.
- **preview:** optional, short-lived deployments created only when remote review
  is needed. A preview never receives production credentials or data.
- **production:** the VPS Compose project reached through `commandry.site`.

There is no permanent staging environment initially. CI integration and browser
tests exercise the production image locally. An on-demand preview may run as a
separate Compose project on the VPS or as a Vercel preview with a dedicated Neon
branch, but only after that path is automated and isolated.

## Build and release artifacts

The repository produces one multi-stage application image containing the
Next.js standalone output and the compiled worker entrypoint. The same immutable
image digest is used for migration, web, and worker commands. This prevents the
schema migrator and running code from drifting across releases.

GitHub Actions will:

1. install the lockfile with the pinned Node.js and pnpm versions;
2. run formatting, lint, TypeScript, generated-contract, and dependency checks;
3. run unit and contract tests;
4. start disposable PostgreSQL 18, apply all migrations, and run integration
   tests;
5. build the production image;
6. start the production Compose shape and run Playwright and worker smoke tests;
7. scan the image and dependency graph;
8. push the image to GitHub Container Registry by immutable commit tag and
   digest;
9. publish the release metadata needed by `/version`.

Production never builds from source on the VPS. It pulls the previously tested
image by digest.

## Agent-operated deployment

An agent may build, test, and deploy without receiving a shell that can freely
read production secrets.

- Local agents use committed fixtures, `.env.local`, and the local Compose
  stack.
- GitHub Actions uses repository and environment secrets only for the step that
  needs them.
- The VPS has a dedicated `commandry-deploy` SSH identity.
- That identity may invoke one root-owned deployment script through a narrow
  sudo rule. It does not receive an unrestricted root shell.
- The deployment script accepts an approved image digest, verifies the image,
  acquires a deployment lock, runs backup and migration gates, updates Compose,
  checks health, and rolls application containers back if verification fails.
- The root-owned production environment file is not readable by the deploy
  identity. Docker Compose reads it through the controlled script.

The deployment sequence is:

1. confirm the exact source revision and image digest passed CI;
2. verify disk capacity, database readiness, backup freshness, and current
   schema compatibility;
3. create the migration-risk restore point defined by the migration;
4. run the release's one-shot migration command;
5. start the new web and worker containers;
6. verify `/health/live`, `/health/ready`, `/version`, login, one read path, and
   one enqueue-to-worker path;
7. retain the prior application image digest for rollback;
8. write a structured deployment event containing the actor, revision, schema,
   start/end times, and verification result.

A code rollback does not roll back the database. Migrations must remain
compatible with the previous application until the new release is verified.
Destructive changes use expand, backfill, cut over, and later contract steps.

## Secrets and configuration

The repository commits `.env.example` with every variable, type, purpose, and a
safe example. It never commits a usable secret.

| Location | Purpose |
| --- | --- |
| `.env.local` | Gitignored developer and local-agent configuration only |
| GitHub environment secrets | Registry, deployment identity, and optional preview credentials |
| `/etc/commandry/commandry.env` | Root-owned production application secrets, mode `0600` |
| `/etc/commandry/cloudflared/` | Root-owned Tunnel credential or token |
| Commandry encrypted credential records | Connector credentials after the product implements its credential vault boundary |

The app validates configuration at process startup with Zod and exits before
serving traffic if required values are absent or invalid. Browser-visible values
must use the `NEXT_PUBLIC_` prefix and are assumed public.

Initial application variables include:

| Name | Secret | Purpose |
| --- | --- | --- |
| `APP_ENV` | No | `local`, `test`, `preview`, or `production` |
| `APP_ORIGIN` | No | Canonical HTTPS origin for auth and links |
| `RELEASE_SHA` | No | Immutable Git revision returned by `/version` |
| `RELEASE_IMAGE_DIGEST` | No | Immutable running image identity |
| `DATABASE_URL` | Yes | Application role connection string |
| `DATABASE_MIGRATION_URL` | Yes | More privileged migration role used only by the one-shot migrator |
| `BETTER_AUTH_SECRET` | Yes | Better Auth signing/encryption secret |
| `APP_ENCRYPTION_KEY` | Yes | Envelope encryption key for protected application records |
| `INITIAL_ADMIN_EMAIL` | Personal config | Only initial permitted human identity |
| `R2_ENDPOINT` | No | S3-compatible endpoint when blob or backup storage is enabled |
| `R2_BUCKET` | No | Bucket name for the relevant environment |
| `R2_ACCESS_KEY_ID` | Yes | Bucket-scoped access identity |
| `R2_SECRET_ACCESS_KEY` | Yes | Bucket-scoped access secret |

Runtime database roles are separate:

- the app role can read and write application tables but cannot alter schema;
- the migration role can apply reviewed migrations and is not present in web or
  worker containers;
- the backup role has the minimum privileges required for a complete logical
  backup;
- future reporting or collector roles receive narrower grants when needed.

## Health, logs, and telemetry

Every release exposes:

- `/health/live`, which answers without dependency checks;
- `/health/ready`, which verifies configuration and a bounded database query;
- `/version`, which reports release SHA, image digest, build time, schema
  compatibility, and environment without leaking secrets.

Logs are JSON to standard output and include timestamp, level, service,
environment, release, correlation or run ID, actor class, operation, duration,
and safe error details. Tokens, cookies, connection strings, authorization
headers, source payloads, and personal captures are always redacted.

The first alerts cover deployment failure, readiness failure, backup failure or
staleness, PostgreSQL disk pressure, worker heartbeat loss, dead-letter growth,
schedule lateness, certificate/Tunnel failure, and VPS disk or memory pressure.
OpenTelemetry hooks are included, but an external collector and paid backend are
added only when local logs and product-owned run records are insufficient.

## Backups and recovery

Running PostgreSQL on one VPS creates a single-host failure domain. The
deployment is acceptable only with offsite, encrypted, tested backups.

- Run a nightly `pg_dump` in custom format against the backup role.
- Store backup files through restic in a private R2 bucket.
- Retain a documented daily, weekly, and monthly policy sized after observing
  real database growth.
- Run `restic check` on a schedule and alert on failure.
- Restore into a disposable PostgreSQL instance at least monthly and run schema
  and application smoke checks against it.
- Back up application data, migration state, and required configuration. Do not
  treat the Docker volume itself as the only backup.
- Record recovery time and recovery point results so a future managed database
  comparison uses evidence rather than assumptions.

R2 is offsite storage, not a reason to adopt Cloudflare Workers. If R2 pricing
or policy changes, the S3-compatible storage boundary permits another provider.

## Updates and host responsibility

Self-hosting makes these first-class operational work:

- security updates for the VPS operating system, Docker Engine, Caddy,
  cloudflared, Node base image, PostgreSQL, and application dependencies;
- firewall rules that allow SSH through the owner's chosen secure path and do
  not expose PostgreSQL or the application port publicly;
- disk, inode, memory, load, container restart, and backup monitoring;
- quarterly restore and deploy rollback drills;
- pinned images with automated update proposals, not unreviewed `latest` tags.

Commandry should monitor its own application state, but an external check must
monitor `commandry.site` so a total VPS or Tunnel failure is still visible.

## Vercel and Neon path

Next.js and standard PostgreSQL preserve a managed alternative:

- Vercel can host the web/API process with no application-framework rewrite.
- Neon can host the PostgreSQL database with the same migrations and driver.
- A continuously running worker must move to a suitable long-lived Node host or
  a managed job system; Vercel Functions alone are not the equivalent of the
  Compose worker.
- Preview deployments may pair a Vercel branch preview with a dedicated Neon
  branch only after creation, migration, seeding, and deletion are automated.

Vercel Hobby is for personal non-commercial use and cannot absorb paid
overages. Neon Free compute can be kept awake by background jobs, which defeats
its scale-to-zero economics. Those are reasons not to make Vercel plus Neon the
default production topology for this project.

## Required VPS inventory before provisioning

Record these facts in the operational inventory before accepting this proposal:

- provider and region;
- operating system and support lifecycle;
- CPU architecture and vCPU count;
- RAM and swap;
- disk type, usable capacity, and snapshot capability;
- existing workloads and expected contention;
- backup bandwidth and provider snapshot policy;
- SSH and recovery-console access;
- whether outbound Cloudflare Tunnel traffic is permitted;
- whether the provider offers a firewall and automated snapshots;
- the owner's acceptable recovery point and recovery time.

If the VPS has less than 2 GB of available RAM, unreliable storage, no recovery
console, or no workable offsite backup path, the database placement must be
reopened before deployment.
