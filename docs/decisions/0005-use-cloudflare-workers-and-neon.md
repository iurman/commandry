# ADR 0005: Use Cloudflare Workers and Neon for the initial managed platform

**Status:** Superseded

**Reopened:** 2026-09-21

**Superseded:** 2026-09-25 by [0009](0009-deploy-the-initial-control-plane-to-the-vps.md),
[0010](0010-build-a-nextjs-web-first-modular-monolith.md),
[0011](0011-self-host-postgres-and-preserve-a-managed-exit.md), and
[0012](0012-use-postgres-backed-background-work.md).

This historical decision assumed a managed edge control plane before evaluating
the owner's existing VPS and continuous background-work requirements. Its
platform, framework, database-hosting, and job choices are no longer current.

**Date:** 2026-09-15

## Context

Commandry needs a public web/API control plane, previews, background delivery,
durable work, object storage, and a relational database while remaining close
to zero cost at personal scale. It must also be practical for coding agents to
deploy and diagnose. Cloudflare already provides authoritative DNS for
`commandry.site`, but DNS alone did not determine application hosting.

## Decision

Use Cloudflare Workers with Static Assets for the initial web/API deployment.
Use Cloudflare Queues, Workflows, Cron Triggers, R2, and Hyperdrive as those
capabilities become necessary. Use Neon-hosted PostgreSQL as the canonical
database, connected from Workers through Hyperdrive.

The first production site is a static React application plus a Hono Worker. A
single Cron Trigger wakes a database-backed scheduler; individual automations do
not receive individual platform cron definitions.

## Consequences

- Static hosting and low-volume application traffic can begin on free tiers.
- Git previews, platform bindings, logs, and rollbacks are agent-operable.
- The system spans Cloudflare and Neon, so incidents and budgets cover two
  providers.
- Worker CPU limits prohibit treating the control plane as a general-purpose
  compute host.
- Current pricing and free limits must be rechecked before provisioning and
  monitored after launch.
- Data and workflow history are stored in Postgres rather than relying on queue
  or workflow retention.

## Alternatives considered

- **Vercel + Neon:** a credible runner-up with excellent previews, but less
  aligned with a static authenticated app and the selected Cloudflare job/blob
  primitives. Hobby cron and commercial-use terms also complicate the initial
  path.
- **Cloudflare + D1:** simpler provider topology, rejected for the canonical
  database because Commandry benefits from Postgres features and portability.
- **VPS + Docker:** kept as a portable target, rejected as the first public
  control plane because it imposes unnecessary operations and always-on cost.

## Follow-up

Create Cloudflare and Neon development/production resources during the
implementation bootstrap. Add usage alerts, deployment runbooks, backup/restore
tests, and a platform reconsideration trigger before public launch.
