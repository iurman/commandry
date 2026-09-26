# Technology stack

**Status: Canonical**

**Architecture accepted:** 2026-09-25

This document is the accepted implementation baseline for Commandry under
[ADRs 0009 through 0012](../decisions/README.md). Local bootstrap may proceed.
VPS capacity, backups, restore, deployment controls, and human sign-in and
recovery remain separate production-readiness gates.

The architecture is VPS-first and container-first. It uses standard Node.js
and PostgreSQL so the production system can run on the existing VPS without
depending on a serverless platform. Vercel and Neon remain compatible optional
paths, not required production services.

## Accepted stack

| Concern | Recommendation | Why it fits Commandry |
| --- | --- | --- |
| Language | TypeScript with strict compiler settings | One type system across UI, HTTP contracts, jobs, integrations, and agent tools |
| Runtime | Node.js 24 LTS | Current production LTS, supported through April 2028, and supported by the selected application and job tooling |
| Package manager | pnpm workspaces with Corepack and a locked pnpm version | Fast, deterministic monorepo installs without introducing a separate build orchestrator before it is needed |
| Application framework | Next.js 16 App Router on the Node runtime | One web and API deployment, first-class Docker self-hosting, first-class Vercel compatibility, PWA support, and a large maintained ecosystem |
| UI | React through Next.js | Shared responsive UI for desktop, mobile web, and a later native wrapper |
| Styling and design system | Tailwind CSS v4, semantic CSS custom-property tokens, and Radix Primitives only for accessible interaction behavior | Supports a distinct Commandry design language without inheriting a visual kit |
| Local experience lab | Storybook using the official Next.js integration | Executable component, state, motion, sound, haptic, and visualization documentation that is excluded from production |
| HTTP API | Versioned REST/JSON Route Handlers under `/api/v1` | Stable boundary for web, native, agents, MCP tools, and external integrations without a second web framework |
| Contracts | Zod 4 schemas with generated OpenAPI | Runtime validation plus machine-readable contracts for agents and client generation |
| Database | PostgreSQL 18, current minor release, self-hosted on the VPS | Canonical relational state, constraints, JSONB, recursive queries, full-text search, and no second database bill |
| Database driver and access | `pg` connection pool plus stable Drizzle ORM and reviewed SQL migrations | Standard Node/Postgres connectivity and type-safe SQL while keeping the schema and migrations visible |
| Text search | PostgreSQL full-text search and `pg_trgm` | Explainable, inexpensive retrieval before adding semantic infrastructure |
| Semantic search | `pgvector` extension installed but used only after a measured retrieval need | Preserves a simple path to vectors without making embeddings foundational |
| Authentication | Current stable Better Auth release with its Drizzle/Postgres adapter and a single-user allowlist | Self-hosted application-owned identity that works with Next.js and later native clients |
| Background jobs | A separate Node worker using pg-boss in the same PostgreSQL database | Retries, dead letters, cron/RRULE schedules, transactional enqueue, and no Redis or cloud queue dependency |
| Dynamic schedules | Commandry schedule rows plus pg-boss scheduling and deterministic occurrence IDs | Supports user-created schedules without one operating-system cron entry per automation |
| Object storage | An internal S3-compatible `BlobStore`; Cloudflare R2 when the first blob or offsite backup is required | Cheap offsite storage, standard API, strong consistency, and no dependency on Workers |
| Realtime UI | Server-Sent Events backed by persisted events | Fits one-way run, health, and system-map updates; WebSockets remain deferred until bidirectional latency is proven necessary |
| Ingress | Cloudflare Tunnel to a Caddy reverse-proxy container | Uses the domain's existing Cloudflare setup, avoids an open inbound application port, and keeps a provider-independent reverse proxy |
| Packaging | Multi-stage Dockerfiles and Docker Compose | One production artifact that runs on the VPS, a developer machine, or another container host |
| CI and image registry | GitHub Actions and GitHub Container Registry | Builds, tests, scans, and immutable image digests can be reproduced and audited from the repository |
| Tests | Vitest, React Testing Library, Playwright, and integration tests against real disposable PostgreSQL | Fast logic tests plus real database and browser boundary verification |
| Observability | Structured JSON logs, correlation/run IDs, health/version endpoints, and OpenTelemetry hooks | Agent-readable evidence without requiring a paid observability service |

Versions are pinned in the lockfile and container image digests at bootstrap.
Major versions above are architecture constraints. Patch and minor updates are
maintenance work and must pass the full compatibility suite.

## Deliberate non-selections

- Vite is not the application framework or production build contract. Next.js
  owns the web build. Storybook may use Vite internally through Storybook's
  official Next.js integration, but that is local development tooling and does
  not create a Vite application or production runtime.
- Hono is not selected. A separate HTTP framework adds another routing,
  middleware, deployment, and authentication integration layer without solving
  a current problem.
- Cloudflare Workers, Hyperdrive, Queues, Workflows, and Cron Triggers are not
  part of the initial application runtime.
- Vercel is not the initial production host. It remains a compatible deployment
  target for previews or a future managed-hosting decision.
- Neon is not the initial production database host. It remains a compatible
  managed PostgreSQL option and may later provide isolated preview branches.
- Redis, BullMQ, Kafka, Kubernetes, a graph database, and a dedicated vector
  database are not justified by the initial workload.
- Turborepo is deferred. pnpm workspace scripts are enough for the initial
  number of packages; add task graph orchestration only after build timing or
  dependency ordering demonstrates the need.

## Repository shape

The application will start as a modular monolith with two production processes:
the web process and the job worker.

```text
apps/
|-- web/              Next.js web, Route Handlers, auth mount, and SSE endpoints
|-- worker/           pg-boss consumers, schedule handling, and integration jobs
|-- lab/              local-only Storybook experience lab
`-- runner/           optional privileged execution runner, added only when needed
packages/
|-- domain/           entities, value objects, policies, and domain events
|-- application/      use cases independent of Next.js and job transport
|-- contracts/        Zod HTTP, event, job, and runner schemas
|-- db/               Drizzle schema, repositories, migrations, and seeds
|-- integrations/     connector ports and provider adapters
|-- platform/         blobs, jobs, clocks, IDs, mail, and telemetry adapters
|-- ui/               shared components and design tokens
|-- experience/       sound, haptic, motion, and feedback-intent contracts
|-- config/           typed environment parsing
`-- test-support/     fixtures, factories, and integration harnesses
```

`apps/web` and `apps/worker` will use the same domain, application, database, and
contract packages. They are separate processes so web requests are not delayed
by polling, long integrations, model calls, or scheduled work. They are not
separate microservices and do not receive separate domain models.

The local experience lab is committed executable documentation. Production
code may be imported by the lab. Production code must never import lab stories,
fixtures, controls, routes, or generated assets. See
[Local experience lab](local-experience-lab.md).

## Application and API boundaries

Next.js is a delivery adapter, not the home of domain behavior. Route Handlers,
Server Actions, React components, and pg-boss consumers call application use
cases. They do not contain authorization policy, integration orchestration, or
database business rules.

```text
browser or native client
  -> /api/v1 Route Handler
  -> application use case
  -> domain policy
  -> repository or platform port
  -> Drizzle/Postgres or provider adapter
```

Server Actions may be used for tightly coupled web-only form interactions, but
they must call the same application services and may not replace the versioned
HTTP API for capabilities needed by native clients, agents, integrations, or
MCP tools.

The first API will use REST/JSON because Commandry's operations are resource and
command oriented, Zod/OpenAPI tooling is mature, and external clients can
inspect the contract easily. GraphQL and tRPC are deferred until a measured
client problem justifies another protocol.

## Database conventions

PostgreSQL is the only canonical structured store for Commandry-owned state.
Typed relationships use relational edge tables with explicit source type,
target type, relationship type, lifecycle, and provenance.

- Use PostgreSQL 18 at the current minor release and apply minor updates after
  backup and compatibility checks.
- Use one bounded `pg` pool per process. Configure connection limits from the
  VPS database capacity rather than accepting library defaults.
- Generate versioned migrations with Drizzle, review the SQL, and run them as a
  distinct deployment step. Do not run schema migration from a request handler.
- Use `drizzle-kit push` only against disposable local databases. Production
  changes use committed migrations.
- Enforce cross-process invariants with primary keys, foreign keys, unique
  constraints, and check constraints.
- Store timestamps in UTC and retain the IANA timezone for schedules.
- Use bounded JSONB for provider payloads, not as a substitute for the domain
  model.
- Use expand-and-contract migrations for destructive changes.
- Install `pg_trgm` and `vector` in the image, but enable and query them only
  when a feature needs them.

Neon compatibility is preserved by using normal PostgreSQL features and the
standard driver. The application must not depend on local superuser access,
filesystem extensions, or VPS-specific paths.

## Jobs, schedules, and long-running work

The worker process owns pg-boss consumers and schedule dispatch. Jobs are
validated with versioned Zod schemas and carry an idempotency key, correlation
ID, actor identity, capability context, and trace context where applicable.

pg-boss can atomically enqueue a job in the same transaction as an application
state change. This prevents the common split-brain case where data commits but
its follow-up message does not. Consumers must still be idempotent because an
external side effect can succeed before the worker records completion.

User schedules live in Commandry's database. Operating-system cron or a systemd
timer is reserved for host operations such as backups and update checks. It is
not the product scheduler.

Privileged work remains separate from both web and worker processes. Browser
automation, Git worktrees, SSH, local-network discovery, GPUs, and arbitrary
binaries run on authenticated execution runners with scoped capabilities. The
control plane never hands a runner the production database password.

## Authentication and identity

Better Auth is the selected identity library because it is self-hostable,
supports Next.js, and has a maintained Drizzle/Postgres adapter. Its latest
stable release must be pinned and kept current because the project supports
security fixes on the current release rather than old release lines.

Human sessions are distinct from machine identities. Agent, collector, and
runner credentials are hashed, revocable application credentials mapped to
explicit capabilities and scopes. Deployment credentials are never reused as
runtime credentials.

The exact first human sign-in and recovery flow remains a product decision. It
does not change the infrastructure choice.

## Client progression

1. Ship a responsive Next.js web application with a standards-based manifest
   and installable PWA behavior.
2. Validate mobile use on the installed web app before adding a native shell.
3. Add Capacitor only when TestFlight, native push, secure storage, sharing, or
   another proven device capability warrants it.
4. Build Android from the same shell when an Android test device and a concrete
   native requirement exist.
5. Evaluate Tauri for Linux only when tray, filesystem, protocol-handler, or
   bundled local-runner behavior is required.

The `/api/v1` and event contracts are the portability boundary. Native shells
may add device adapters but must not fork domain behavior.

## Implementation validation gates

The accepted stack still needs the following implementation evidence. These
checks do not block local bootstrap, and remote checks do not authorize
production provisioning:

1. a production Next.js standalone image starts on Node.js 24;
2. the web and worker containers connect to PostgreSQL 18 through bounded pools;
3. Drizzle migrations apply to an empty database and upgrade the previous test
   schema;
4. Better Auth's adapter and server integration work locally; session creation,
   validation, and recovery through the production origin follow the human
   sign-in decision in [OQ-003](../project/open-questions.md);
5. pg-boss schedules, retries, dead letters, and transactional enqueue work on
   the selected PostgreSQL image;
6. Playwright can exercise login, one API route, one server-rendered route, and
   one worker-driven state transition through Docker Compose;
7. the same web repository can build on Vercel without making Vercel a runtime
   requirement;
8. the lab is typechecked in CI but absent from the production image.

The evidence and rejected alternatives are in
[Hosting and stack evaluation](../research/hosting-and-stack-evaluation.md).
