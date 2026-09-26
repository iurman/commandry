# ADR 0011: Self-host PostgreSQL and preserve a managed exit

**Status:** Accepted

**Date:** 2026-09-21

**Accepted:** 2026-09-25

**Supersedes:** [0005](0005-use-cloudflare-workers-and-neon.md) and
[0006](0006-use-postgres-as-the-canonical-database.md) for initial database
hosting and operations. PostgreSQL remains the canonical database.

## Context

Commandry needs transactional relationships, capability and approval state,
events, runs, audits, structured search, and optional semantic retrieval. The
owner already has a VPS. A continuously active background worker can prevent a
Neon compute from scaling to zero, weakening the case for Neon Free as the
initial production database.

## Decision

Run PostgreSQL 18 at its current minor release on the VPS. Use a pinned container
image that includes pgvector, with `pg_trgm` and `vector` enabled only when a
feature needs them. Use the standard `pg` driver, bounded connection pools, and
the current stable Drizzle ORM release.

Keep TypeScript schema definitions and committed, reviewed SQL migrations.
Apply production migrations through a separate migration role and one-shot
release command. Do not use `drizzle-kit push` in production.

Use PostgreSQL full-text search and `pg_trgm` before semantic search. Do not
embed all data by default. Store large captures and artifacts behind an
S3-compatible blob interface.

Back up PostgreSQL nightly with `pg_dump` through restic to a private R2 bucket,
check backup integrity, and prove restores into disposable PostgreSQL monthly.

Preserve a Neon or other managed-PostgreSQL exit by avoiding host filesystem
dependencies, custom local-only extensions, and superuser assumptions in
application code.

## Consequences

- The canonical database has no separate initial hosting bill and sits near the
  web and worker processes.
- PostgreSQL can also provide the initial queue, schedule, and event substrate,
  keeping the stateful service count low.
- The owner is responsible for database security updates, capacity, backup,
  restore, corruption response, and major-version upgrades.
- A VPS failure can remove both application and primary database, so tested
  offsite backup is mandatory and availability is lower than a managed
  multi-zone service.
- A managed database remains available if operational evidence outweighs cost
  or latency concerns.

## Alternatives considered

- **Neon first:** excellent managed PostgreSQL and branching, but background
  connections can defeat scale-to-zero and add a provider before it is needed.
- **D1/SQLite:** does not provide the selected PostgreSQL extension and migration
  path.
- **Dedicated graph database:** no known query requires a second canonical
  database; relational edges and recursive SQL are sufficient initially.
- **Dedicated vector database:** deferred until measured PostgreSQL vector
  performance is inadequate.
- **Prisma:** credible alternative, but Drizzle better matches the preference
  for visible SQL and a thin typed query layer.

## Evidence

See [Hosting and stack evaluation](../research/hosting-and-stack-evaluation.md)
and [Technology stack](../architecture/technology-stack.md).

## Implementation and deployment validation gates

The local migration and extension checks can begin now. VPS placement, offsite
restore, and a tested managed fallback remain separate deployment claims:

1. Verify the VPS storage and memory meet the deployment readiness threshold.
2. Run Drizzle migrations and integration tests on PostgreSQL 18.
3. Verify the selected pgvector image and extensions at pinned versions.
4. Restore an encrypted offsite backup and pass application smoke tests.
5. Run the same migration suite against Neon before describing Neon as a tested
   fallback.
