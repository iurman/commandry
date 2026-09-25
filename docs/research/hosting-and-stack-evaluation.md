# Hosting and stack evaluation

**Status: Exploratory**

**Research date:** 2026-09-21

This evaluation reopens every application-platform choice recorded on
2026-09-15. Those choices were written as accepted before the owner had reviewed
their premises. The recommendation below is evidence for proposed ADRs, not an
authorization to provision or implement them.

## Recommendation

Start on the existing VPS with Docker Compose:

- Next.js 16 on Node.js 24 LTS for the web application and versioned API;
- a separate Node.js 24 worker using pg-boss;
- self-hosted PostgreSQL 18 as the canonical database;
- Cloudflare Tunnel plus Caddy for ingress;
- encrypted PostgreSQL backups in Cloudflare R2;
- GitHub Actions and GitHub Container Registry for tested immutable releases;
- standard PostgreSQL, S3, HTTP, and OpenAPI boundaries so Neon, Vercel, or
  another container host remain future options.

Do not start on Cloudflare Workers. Do not start on Vercel plus Neon. Both are
valid platforms, but neither fits the known combination of an already-paid VPS,
continuous background work, self-hosting intent, and near-zero incremental
cost as well as the VPS topology.

## Decision criteria

The criteria are ordered for Commandry rather than for a generic web app:

1. support continuous schedules, integrations, and agent coordination;
2. use the existing VPS with near-zero incremental hosting cost;
3. let an agent reproduce, test, deploy, inspect, and roll back the system;
4. keep production behavior close to local behavior;
5. preserve a clean managed-hosting exit without lowest-common-denominator
   application design;
6. provide a strong relational store for relationships, audits, permissions,
   runs, events, text search, and optional vectors;
7. support a PWA now and native or Linux shells later through stable APIs;
8. minimize the number of stateful systems operated at the start;
9. avoid free-tier assumptions that break when a background process stays
   active;
10. keep production credentials scoped and outside agent prompts and source.

## Hosting comparison

| Option | Fit | Material evidence and tradeoffs | Result |
| --- | --- | --- | --- |
| VPS plus Docker Compose plus self-hosted PostgreSQL | Full Node processes, arbitrary schedules, persistent connections, local parity, existing paid capacity | Requires patching, monitoring, backups, restore drills, and incident ownership | Recommended initial production topology, conditional on VPS inventory and tested offsite recovery |
| Vercel plus Neon | Excellent Next.js deployment and previews; managed application and database operations | Vercel Hobby is personal/non-commercial and cannot buy overages; an always-on worker needs another host; Neon background connections can prevent scale-to-zero | Keep as optional previews or a future paid managed topology, not the initial default |
| Cloudflare Workers plus Neon | Strong edge platform with queues, workflows, storage, and low idle request cost | Splits state and runtime across providers; requires Hyperdrive for the chosen connection model; arbitrary binaries and long jobs need another host; Worker constraints shaped the app prematurely | Rejected for the initial control plane |
| Cloudflare Workers plus D1 | Single vendor and simple edge bindings | D1 is SQLite, not PostgreSQL; it does not satisfy the chosen extension and portability path without redesign | Rejected as the canonical store |
| VPS app plus managed Neon | Removes database patching while keeping long-lived Node processes | Adds database cost/latency; background activity defeats much of Neon's free scale-to-zero value | Sensible fallback if self-hosted database operations prove unacceptable |
| Local or device only | Private and cheap | Unreliable webhooks, multi-device access, and availability | Suitable for collectors and runners, not the canonical service |

Sources: [Vercel Hobby](https://vercel.com/docs/plans/hobby),
[Vercel fair-use rules](https://vercel.com/docs/limits/fair-use-guidelines),
[Neon compute lifecycle](https://neon.com/docs/manage/endpoints/),
[Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 overview](https://developers.cloudflare.com/d1/), and
[Docker Compose production guidance](https://docs.docker.com/compose/how-tos/production/).

## Why Vite and Hono are removed

The earlier Vite plus Hono choice was not based on a demonstrated product need.
It was a consequence of choosing Cloudflare Workers first and then optimizing
for a shared Worker/Node HTTP layer.

Vite remains a maintained frontend build tool, but a React/Vite SPA would leave
Commandry to assemble routing, API delivery, authentication integration,
server rendering decisions, metadata, and PWA server behavior from separate
pieces. Hono would then be a second framework with its own middleware and
runtime adapters. That composition is useful when multi-runtime HTTP portability
is a primary requirement. It is not the primary requirement here.

Next.js gives this project one supported Node and Docker application containing
the React UI and Route Handlers. The official deployment matrix states that
Node.js and Docker deployments support all Next.js features, and `output:
"standalone"` creates a minimal production image. Vercel remains a first-class
target without becoming a dependency. Next.js also documents self-hosting,
reverse proxies, runtime environment values, PWA manifests and web push, and
OpenTelemetry.

Sources: [Next.js deployment options](https://nextjs.org/docs/app/getting-started/deploying),
[Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting),
[standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[Route Handlers and backend-for-frontend guidance](https://nextjs.org/docs/app/guides/backend-for-frontend),
[PWA guidance](https://nextjs.org/docs/app/guides/progressive-web-apps), and
[OpenTelemetry guidance](https://nextjs.org/docs/app/guides/open-telemetry).

Vite may still appear under Storybook because Storybook recommends its
`@storybook/nextjs-vite` framework for most Next.js projects. That is a local
documentation builder, not Commandry's application architecture or production
runtime.

Source: [Storybook for Next.js with Vite](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite).

## Why Node.js 24

Node.js 24 is the current LTS line and is scheduled for support through April
2028. Node.js 20 reached end of life in March 2026. pg-boss requires Node.js
22.12 or newer, so Node.js 24 satisfies both the production support window and
the job system.

Sources: [Node.js release schedule](https://nodejs.org/en/about/previous-releases),
[Node.js 24 migration and support window](https://nodejs.org/en/blog/migrations/v22-to-v24),
[Node.js end-of-life releases](https://nodejs.org/en/about/eol), and
[pg-boss requirements](https://github.com/timgit/pg-boss).

## Why self-host PostgreSQL first

PostgreSQL is a strong fit for Commandry regardless of provider. It provides
transactions and constraints for capabilities, relationships, approvals, runs,
and audits; recursive queries for graph-like navigation; JSONB for bounded
provider metadata; full-text search and `pg_trgm`; and the `pgvector` extension
when semantic retrieval is validated.

PostgreSQL 18 is the current major version and is supported until November
2030. pgvector publishes PostgreSQL 18 container variants. Starting on the
current major avoids choosing a release near end of support, while pinning the
current minor and image digest keeps production reproducible.

Sources: [PostgreSQL version policy](https://www.postgresql.org/support/versioning/),
[PostgreSQL 18 release](https://www.postgresql.org/about/news/postgresql-18-released-3142/),
and [pgvector](https://github.com/pgvector/pgvector).

Neon remains a credible managed PostgreSQL provider, but its free economics do
not match a continuously active queue worker. Neon documents that frequent
connections and background jobs can prevent a compute from suspending, while
the default scale-to-zero window is five minutes. Its free plan is metered in
compute-unit hours, so a worker that keeps the compute awake consumes the
benefit the free plan is meant to provide.

Sources: [Neon compute lifecycle](https://neon.com/docs/manage/endpoints/),
[Neon usage-based pricing](https://neon.com/blog/new-usage-based-pricing), and
[Neon free-plan guidance](https://neon.com/blog/how-to-make-the-most-of-neons-free-plan).

The self-hosted choice is conditional, not ideological. If the VPS lacks
reliable storage, sufficient memory, a recovery console, or tested offsite
backup, use Neon or another managed PostgreSQL service rather than pretending a
Docker volume is durable operations.

## Why Drizzle, with constraints

Drizzle keeps the schema in TypeScript, supports the standard `pg` driver, and
generates reviewable SQL migrations. This suits a domain with many explicit
constraints and Postgres-specific queries better than hiding SQL behind a
heavier generated client.

Use the current stable Drizzle release, not the Drizzle v1 release candidate.
Generate committed migrations and review their SQL. `drizzle-kit push` is
limited to disposable local databases. Production applies versioned migrations
in a separate release step.

This is not a claim that Drizzle is universally better than Prisma. Prisma is a
credible alternative with a mature migration and client ecosystem. Drizzle is
selected because Commandry benefits from direct SQL visibility and a thin query
layer, while its team does not currently need Prisma's generated-client
abstraction.

Sources: [Drizzle PostgreSQL guide](https://orm.drizzle.team/docs/get-started/postgresql-new),
[Drizzle migrations](https://orm.drizzle.team/docs/migrations),
[Drizzle with Neon and standard Node drivers](https://orm.drizzle.team/docs/connect-neon),
and [Prisma PostgreSQL quickstart](https://www.prisma.io/docs/prisma-orm/quickstart/postgresql).

## Why pg-boss for background work

Commandry needs dynamic schedules, retries, dead letters, rate and concurrency
controls, and eventually multi-step agent and integration work. pg-boss uses
PostgreSQL `SKIP LOCKED`, supports LISTEN/NOTIFY plus polling, cron and RRULE
schedules, job dependencies, retries, dead letters, and transactional enqueue.
It requires no Redis and already supports Drizzle transaction adapters.

Run it in a separate worker process. Treat every handler as idempotent even
though pg-boss describes its database delivery semantics as exactly-once. No
queue can atomically cover an external API side effect and the local
acknowledgement unless that external system participates in the transaction.

Alternatives:

- Graphile Worker is a credible PostgreSQL-backed queue with cron and backfill.
  pg-boss is preferred for the initial stack because its current feature set
  includes RRULE schedules, dependency workflows, dead-letter redrive, a
  dashboard package, and explicit Drizzle integration.
- BullMQ is mature but requires Redis, adding a second stateful service before
  measured throughput demands it.
- Trigger.dev provides a larger workflow product, but self-hosting brings a
  materially larger stack and operational surface than this single-user system
  needs.
- Operating-system cron cannot represent user-created schedules, durable
  retries, concurrency policies, or run history. It remains appropriate for
  host backups and maintenance.

Sources: [pg-boss](https://github.com/timgit/pg-boss),
[pg-boss job API](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md),
[Graphile Worker cron](https://worker.graphile.org/docs/cron),
[BullMQ introduction](https://docs.bullmq.io/), and
[Trigger.dev self-hosting](https://trigger.dev/docs/open-source-self-hosting/overview).

## Why Vercel is optional, not primary

Vercel is the easiest managed deployment path for Next.js and an excellent
preview system. It does not remove Commandry's need for a continuously running
worker or privileged execution runners. Using Vercel for web/API, Neon for the
database, and the VPS for workers would create three operational surfaces where
one VPS currently suffices.

The Vercel Hobby plan is explicitly limited to personal, non-commercial use.
Hobby cannot purchase additional usage, so workloads pause or require a plan
change at the limit. This is acceptable for experiments and previews, but it is
not a robust assumption for a product that may become commercial.

Sources: [Vercel Hobby](https://vercel.com/docs/plans/hobby),
[Vercel fair-use rules](https://vercel.com/docs/limits/fair-use-guidelines), and
[Vercel deployment environments](https://vercel.com/docs/deployments/environments).

If self-hosted operations become the dominant burden, the managed topology to
evaluate is Vercel for web/API, Neon for PostgreSQL, and a long-lived worker host
or managed job service. It must be priced and tested as a whole, not presented
as a free two-service replacement.

## Why Cloudflare remains, but Workers do not

Cloudflare is already authoritative for `commandry.site`. A named Cloudflare
Tunnel lets the VPS establish outbound-only connections, hides the origin IP,
and avoids exposing the application port. Caddy remains between the Tunnel and
Next.js because Next.js recommends a reverse proxy for request filtering and
because Caddy preserves a direct HTTPS ingress path if Tunnel is later removed.

R2 remains useful as offsite object storage and backup storage. It exposes an
S3-compatible API, offers strong consistency, has a free allowance, and does
not charge Internet egress. None of those benefits requires running application
code in Workers.

Sources: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/),
[cloudflared downloads and container image](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/),
[Caddy reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy),
[R2 architecture](https://developers.cloudflare.com/r2/how-r2-works/), and
[R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## Authentication

Better Auth is recommended because it is self-hosted, integrates with Next.js,
and provides a maintained Drizzle/PostgreSQL adapter. Auth.js documentation now
points new adopters toward Better Auth while its Next.js package installation
still uses a beta release. Better Auth therefore has the cleaner current path
for this stack.

This selection carries a maintenance obligation. Better Auth states that only
the latest version receives security support and its security history includes
serious advisories. Pin the latest stable version, automate update proposals,
apply security patches promptly, and keep the initial plugin surface small.

Sources: [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next),
[Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle),
[Better Auth security policy](https://github.com/better-auth/better-auth/security),
and [Auth.js Next.js installation](https://authjs.dev/getting-started/installation?framework=next-js).

The sign-in mechanism remains a separate decision. Passkeys, password, magic
link, and OAuth have different email, recovery, and device-loss implications.

## API, native clients, and desktop

Use Zod schemas to validate `/api/v1` requests, responses, events, and jobs, and
generate OpenAPI for external consumers. This keeps native clients, agents, and
MCP tools from depending on Next.js internals.

The first client remains a responsive PWA. Next.js documents installable PWA
manifests and web push, including iOS support for installed home-screen apps.
Add Capacitor only when TestFlight or a device API is proven necessary. Evaluate
Tauri only when Linux needs native tray, filesystem, protocol, or bundled-runner
features.

Sources: [Zod](https://zod.dev/),
[OpenAPI specification](https://spec.openapis.org/oas/),
[Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps),
[Capacitor](https://capacitorjs.com/docs), and
[Tauri](https://v2.tauri.app/start/).

## Testing and local experience tooling

Use Vitest and React Testing Library for synchronous components and application
logic. Next.js documents that Vitest does not currently support asynchronous
Server Components, so Playwright covers those components and full browser
flows. Integration tests run against disposable real PostgreSQL, not an in-memory
SQLite substitute.

Storybook is the local experience lab for components, states, visualizations,
sound, and haptic mappings. It is committed and checked in CI but never copied
into the production image or routed by the production app.

Sources: [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest),
[Next.js Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright),
and [Storybook for Next.js](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite).

## Backup evidence

`pg_dump` creates consistent logical exports without blocking normal readers or
writers. Restic encrypts repository data and supports S3-compatible object
storage. A backup is not accepted until an automated restore into disposable
PostgreSQL succeeds and the application can read it.

Sources: [PostgreSQL `pg_dump`](https://www.postgresql.org/docs/18/app-pgdump.html),
[restic S3-compatible repositories](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html),
[restic integrity checking](https://restic.readthedocs.io/en/stable/045_working_with_repos.html),
and [restic restore](https://restic.readthedocs.io/en/stable/050_restore.html).

## Cost and migration posture

The existing VPS cost is treated as sunk only after its available capacity is
recorded. The initial incremental cloud cost can otherwise remain close to zero:
Cloudflare DNS/Tunnel, GitHub Actions/GHCR within account allowances, and R2
within its free allowance. Pricing and account limits must be verified before
provisioning because free tiers change.

The architecture has four explicit exit paths:

1. move Next.js from Docker to Vercel;
2. move PostgreSQL from the VPS to Neon or another standard managed provider;
3. move R2 to another S3-compatible store;
4. move the full Compose project to another VPS or container platform.

The application does not claim that all exits are one-click. Migrations still
require backup, restore, DNS, secret, connection, and smoke-test work. The point
is that no core domain behavior depends on Workers, Hyperdrive, Vercel-only
functions, or a proprietary database API.

## Remaining infrastructure facts

The stack recommendation is complete enough for owner review. It is not ready
for provisioning until the VPS CPU, RAM, storage, operating system, region,
existing workload, snapshot support, and recovery-console access are recorded.
Those facts may change database placement or capacity settings, but they do not
justify returning to Vite, Hono, or Cloudflare Workers.
