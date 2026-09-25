# Agent development workflow

**Status: Proposed**

This workflow is designed so an agent can inspect, implement, test, preview,
deploy, and diagnose Commandry with minimal human handling and without receiving
unbounded production credentials. It depends on the proposed stack ADRs and
must not be treated as an implementation order until those ADRs are accepted.

## One-command contract

The repository will expose stable root commands. Their internal implementation
may evolve, but an agent should not need to reverse-engineer routine work.

| Command | Contract |
| --- | --- |
| `pnpm setup` | Verify Node, pnpm, Docker, and required local tools; install dependencies; print missing non-secret prerequisites |
| `pnpm dev` | Start PostgreSQL and required dependencies, then the Next.js and worker development loops |
| `pnpm check` | Run formatting check, lint, TypeScript, dependency boundaries, and generated-contract validation |
| `pnpm test` | Run deterministic unit and contract tests |
| `pnpm test:integration` | Create disposable PostgreSQL, apply migrations, and run database/auth/job integration tests |
| `pnpm test:e2e` | Run Playwright against an explicitly configured local or preview URL |
| `pnpm build` | Produce the same standalone web and worker artifacts used by the production image |
| `pnpm compose:up` | Start the production-shaped local Docker Compose stack |
| `pnpm compose:down` | Stop the named local Compose project without deleting its data unless explicitly requested |
| `pnpm lab` | Start loopback-only Storybook experience tooling; never create a production artifact |
| `pnpm lab:check` | Validate lab types, stories, boundaries, and manifests without production bundling |
| `pnpm doctor` | Check tools, configuration, database, migrations, worker heartbeat, and optional provider access without changing production |
| `pnpm deploy:preview` | Create or update an isolated preview and print its URL; unavailable until a preview target is configured |
| `pnpm deploy` | Deploy an approved image digest through the constrained production deployment path |
| `pnpm logs` | Stream redacted structured logs for an explicitly named environment and service |
| `pnpm backup:verify` | Check backup freshness and integrity without exposing backup credentials or contents |

Commands must fail with actionable messages and non-zero exit codes. No script
may silently fall back from local or preview to production.

## Agent-readable repository state

The implementation repository will include:

- accepted ADRs and current project status;
- `.node-version` or equivalent plus a pinned Corepack/pnpm version;
- an `.env.example` containing every variable, description, type, and safe
  example, but no usable secret;
- Dockerfiles, Compose manifests, Caddy configuration, and health checks;
- database migrations and a deterministic synthetic seed;
- Zod contracts and generated OpenAPI checked in or reproducibly generated;
- health and version endpoints;
- structured logging and redaction rules;
- runbooks for deploy, rollback, backup, restore, key rotation, and incidents;
- concise fixtures covering major domain and failure states;
- a local-only Storybook experience lab using real shared components and
  sensory contracts;
- an `AGENTS.md` that routes work to the minimum required documentation.

An agent must be able to discover an endpoint, job payload, migration,
configuration value, or deployment target from versioned files rather than a
dashboard screenshot or prior chat.

## Credential classes

Do not create one omnipotent `.env` file. Credentials have four separate
classes.

### Local development

`.env.local` is gitignored and contains local values only. Local PostgreSQL uses
disposable development roles and synthetic data. Agents may start, migrate,
seed, inspect, and destroy an explicitly named disposable local database.

### Continuous integration

Most CI jobs need only repository read access and temporary service-container
credentials. Publishing an image receives package-write access only after tests
pass. Preview credentials are isolated from production credentials.

### Deployment automation

The deployment job receives:

- permission to read the approved private image from GitHub Container Registry;
- a dedicated VPS SSH identity;
- authority to invoke one root-owned deployment script through a narrow sudo
  rule;
- no direct access to production connector credentials, application encryption
  keys, or the database superuser password.

The script accepts an immutable image digest. It does not accept arbitrary shell
text from CI or an agent.

### Runtime application

The web and worker processes receive only the application database role, auth
secret, application encryption key, configured origin, and enabled connector or
blob credentials. The migration role is injected only into the one-shot
migration process. A future execution runner receives scoped machine credentials
and never the database connection string.

Prefer workload identity or short-lived credentials where the chosen service
supports them. Otherwise use GitHub environment secrets and the root-owned VPS
environment file. Secrets never enter prompts, shell history, committed files,
logs, screenshots, or generated OpenAPI.

## Configuration inventory

The `.env.example` will converge on these names:

| Name | Scope | Secret | Purpose |
| --- | --- | --- | --- |
| `APP_ENV` | build/runtime | No | `local`, `test`, `preview`, or `production` |
| `APP_ORIGIN` | runtime | No | Canonical HTTPS origin for auth, links, and allowed origins |
| `RELEASE_SHA` | build/runtime | No | Immutable source revision returned by `/version` |
| `RELEASE_IMAGE_DIGEST` | runtime | No | Immutable production image identity |
| `INITIAL_ADMIN_EMAIL` | bootstrap/runtime | Personal config | Initial permitted human account |
| `BETTER_AUTH_SECRET` | runtime | Yes | Better Auth signing and encryption material |
| `APP_ENCRYPTION_KEY` | runtime | Yes | Envelope encryption for protected application records |
| `DATABASE_URL` | web/worker | Yes | Bounded application-role PostgreSQL connection |
| `DATABASE_MIGRATION_URL` | migration only | Yes | Schema-migration role connection |
| `R2_ENDPOINT` | blob/backup | No | S3-compatible R2 endpoint when enabled |
| `R2_BUCKET` | blob/backup | No | Environment-specific bucket |
| `R2_ACCESS_KEY_ID` | blob/backup | Yes | Bucket-scoped identity |
| `R2_SECRET_ACCESS_KEY` | blob/backup | Yes | Bucket-scoped secret |

Connector-specific variables are added only with their connector and use a
documented prefix such as `GITHUB_`. Values prefixed with `NEXT_PUBLIC_` are
browser-visible and must never contain secrets.

## Local verification loop

For every substantive change an agent should:

1. read project status, the relevant specifications, open questions, and ADRs;
2. create or reuse a scoped branch as required by the repository workflow;
3. run `pnpm setup` when tool or dependency state may have changed;
4. reproduce the behavior with deterministic fixtures;
5. implement the smallest coherent change in the correct package boundary;
6. run `pnpm check`, `pnpm test`, and affected integration tests;
7. run the production image through Compose for changes involving runtime,
   configuration, database, auth, jobs, or deployment;
8. use Playwright for user-visible changes and asynchronous Server Components;
9. inspect structured logs, health, version, and worker evidence;
10. report the exact revision, commands, tests, migration impact, screenshots or
    URLs where useful, and known limitations.

Browser verification is required for UI behavior. API, database, or worker-only
changes require their real boundary tests even when the UI still renders.

## Preview strategy

Local Docker Compose plus Playwright is the default preview because it exercises
the actual production image and worker. A remote preview is optional, not a
prerequisite for every change.

Two remote preview shapes are permitted after automation exists:

1. a separate, resource-limited Compose project with a generated hostname and
   isolated PostgreSQL database; or
2. a Vercel preview using a dedicated Neon branch, with the worker disabled or
   hosted separately when the feature requires it.

A preview must never receive production database, auth, R2, connector, Tunnel,
or deployment credentials. Shared mutable preview databases are not permitted
for schema-changing branches. Creation, migration, synthetic seeding, expiry,
and deletion must be automated before branch-per-preview is enabled.

## Deployment control surface

The durable control surface is, in order:

1. checked-in Docker, Compose, Caddy, migration, and configuration files;
2. stable repository commands;
3. GitHub Actions workflows producing immutable images and evidence;
4. the constrained VPS deployment command;
5. provider APIs or MCP tools for narrowly scoped Cloudflare, R2, Neon, or
   Vercel lifecycle work;
6. dashboards for exceptional inspection and recovery.

MCP access is a convenience, not undocumented infrastructure. After an agent
creates any remote resource, it records the non-secret identifier and lifecycle
procedure in the repository. No essential setup may exist only in chat history.

## Production authority

Agent-driven does not mean ungoverned:

- tests and image builds may run automatically;
- production deploys use only an approved commit and immutable image digest;
- the protected `main` branch or a later deployment environment gate is the
  auditable production approval event;
- high-risk or destructive migrations require explicit human approval;
- an agent may rotate a production credential only when explicitly authorized;
- production data export, deletion, restore, or retention changes require the
  relevant runbook and authorization;
- external write actions remain subject to Commandry's capability, approval,
  and audit model even during tests.

## Database and migration verification

Before a production migration, CI proves:

- all migrations apply to an empty PostgreSQL 18 database;
- migrations apply from the last released schema and preserve required data;
- the new application works against the migrated schema;
- the prior application remains compatible for the deployment window;
- pg-boss and Better Auth schema behavior remains valid;
- the backup or restore point matches the migration's risk;
- the forward repair and code rollback plan is explicit.

Neon compatibility is tested before Neon is described as a deployable fallback.
It is not inferred merely because both databases use PostgreSQL.

## Test layers

- **Unit:** domain policies, schedule calculation, capability evaluation,
  normalization, projections, and pure UI logic without network access.
- **Contract:** Zod/OpenAPI, event, job, runner, and adapter compatibility.
- **Integration:** real PostgreSQL constraints and migrations, Drizzle
  repositories, Better Auth, pg-boss, transactions, and idempotency.
- **Component:** Storybook interaction and accessibility tests using the shipped
  components and deterministic fixtures.
- **End to end:** login, capture, project context, a command-center read path,
  an approval boundary, and a worker-driven state transition in Playwright.
- **Operational:** image build, Compose start, health, version, logs, migration,
  backup, restore, scheduler heartbeat, deploy, and rollback rehearsal.

Tests inject time, random IDs, and provider responses. Live provider tests are
separate, explicitly named, narrowly credentialed, and never run implicitly.

## Diagnostics and rollback

Every release reports its Git SHA, image digest, and schema compatibility.
Correlation IDs flow through HTTP, database events, pg-boss jobs, integration
calls, and runner callbacks. An agent can start from a failed UI action and find
the complete path without broad secret or payload access.

When release verification fails:

1. stop new risky work and prevent additional worker intake if necessary;
2. classify the failure as code, configuration, schema, host, database, Tunnel,
   provider, or data specific;
3. preserve logs and deployment evidence;
4. roll web and worker containers back to the previous digest when schema
   compatibility permits;
5. use a reviewed forward data repair instead of a blind down migration;
6. verify health and the affected path after recovery.

A container rollback does not restore the database, object storage, environment
file, Cloudflare configuration, or external side effects.

## Bootstrap sequence after stack acceptance

1. Record the VPS inventory and prove the backup destination and recovery path.
2. Initialize the pinned Node.js 24 and pnpm workspace with strict TypeScript,
   formatting, linting, and root commands.
3. Create the Next.js application, package boundaries, and local Storybook lab.
4. Add local PostgreSQL 18, Drizzle, migration roles, and integration tests.
5. Add configuration validation, structured logging, health, version, and
   OpenTelemetry hooks before product features.
6. Add pg-boss and prove transactional enqueue, retries, schedules, dead
   letters, idempotency, and two-worker concurrency.
7. Add the production image, Compose stack, Caddy, and local Playwright smoke
   tests.
8. Add Better Auth and the accepted single-user sign-in/recovery flow.
9. Establish GitHub Actions, GHCR publishing, constrained VPS deployment,
   Cloudflare Tunnel, backup, restore, and rollback.
10. Implement the smallest product vertical slice.
11. Add R2 application blob storage only when the first attachment or large
   source payload needs it. Backup storage may use R2 earlier.
