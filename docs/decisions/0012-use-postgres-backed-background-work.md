# ADR 0012: Use PostgreSQL-backed background work

**Status:** Accepted

**Date:** 2026-09-21

**Accepted:** 2026-09-25

**Supersedes:** [0005](0005-use-cloudflare-workers-and-neon.md),
[0006](0006-use-postgres-as-the-canonical-database.md), and
[0008](0008-separate-control-plane-from-execution-runners.md) for initial
background-work transport. Privileged execution remains runner-isolated.

## Context

Commandry needs durable integration work, dynamic user schedules, retries,
dead-letter handling, concurrency controls, and eventually multi-step agent
coordination. The initial workload does not justify operating Redis, Kafka, or a
provider-specific queue in addition to PostgreSQL.

## Decision

Run a separate Node.js worker process using pg-boss against the canonical
PostgreSQL database. Use pg-boss for enqueueing, retries, dead letters,
concurrency and rate policies, cron/RRULE schedule registration, and simple job
dependencies.

Define versioned Zod schemas for job payloads. Enqueue transactionally with the
application state change when both must commit together. Give each scheduled
occurrence a deterministic identity and make every worker handler idempotent.

Persist product-visible run, attempt, evidence, and audit records in Commandry
tables. pg-boss tables are transport state, not the complete product history.

Use operating-system timers only for host maintenance such as backups. Use a
separately authenticated execution runner for Git, SSH, browsers, arbitrary
binaries, private networks, or other privileged work.

## Consequences

- One PostgreSQL service provides transactional state and the initial durable
  queue, reducing operational surface.
- The worker can maintain connections and execute long Node tasks on the VPS.
- Queue load competes with product queries and must be measured, bounded, and
  moved later if it harms primary-database performance.
- pg-boss migration and retention policies become part of database operations.
- External side effects still require idempotency and reconciliation because an
  external API and local acknowledgement cannot share one transaction.

## Alternatives considered

- **Graphile Worker:** strong PostgreSQL alternative. pg-boss is preferred for
  its current RRULE, dependency, dead-letter redrive, dashboard, and Drizzle
  integration surface.
- **BullMQ:** mature, but requires Redis as another stateful service.
- **Cloudflare Queues and Workflows:** capable, but would make background work
  depend on Cloudflare while the control plane runs on the VPS.
- **Vercel Queues or Workflows:** capable managed options, but add platform
  coupling and do not remove the execution-runner requirement.
- **System cron:** lacks dynamic product schedules, durable retry policy,
  concurrency control, and product run history.

## Evidence

See [Hosting and stack evaluation](../research/hosting-and-stack-evaluation.md)
and [Technology stack](../architecture/technology-stack.md).

## Implementation validation gates

These checks validate the accepted job architecture during local implementation:

1. Prove transactional enqueue with the selected Drizzle version.
2. Prove retries, dead letters, redrive, schedule catch-up, and deterministic
   occurrence deduplication.
3. Prove two worker replicas do not double-execute the protected test effect.
4. Measure database connections and queue-table growth under a representative
   test workload.
