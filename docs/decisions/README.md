# Architecture decision records

**Status: Canonical**

ADRs capture durable product or technical decisions whose rationale future
contributors need. They do not record minor implementation details.

## Statuses

- **Proposed** — under active consideration.
- **Reopened** — previously accepted but returned to consideration before implementation.
- **Accepted** — current decision.
- **Superseded** — replaced by a newer ADR; link both directions.
- **Deprecated** — retained for history but no longer recommended.
- **Rejected** — considered and intentionally not chosen.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-external-systems-remain-authoritative.md) | External systems remain authoritative | Accepted |
| [0002](0002-use-a-typed-relationship-model.md) | Use a typed relationship model | Accepted |
| [0003](0003-preserve-source-captures.md) | Preserve source captures | Accepted |
| [0004](0004-govern-actions-by-capability-and-risk.md) | Govern actions by capability and risk | Accepted |
| [0005](0005-use-cloudflare-workers-and-neon.md) | Use Cloudflare Workers and Neon for the initial managed platform | Superseded |
| [0006](0006-use-postgres-as-the-canonical-database.md) | Use Postgres as the canonical database | Superseded; PostgreSQL retained |
| [0007](0007-build-a-portable-web-first-application.md) | Build a portable web-first application | Superseded; web-first retained |
| [0008](0008-separate-control-plane-from-execution-runners.md) | Separate the control plane from execution runners | Superseded; runner isolation retained |
| [0009](0009-deploy-the-initial-control-plane-to-the-vps.md) | Deploy the initial control plane to the existing VPS | Accepted |
| [0010](0010-build-a-nextjs-web-first-modular-monolith.md) | Build a Next.js web-first modular monolith | Accepted |
| [0011](0011-self-host-postgres-and-preserve-a-managed-exit.md) | Self-host PostgreSQL and preserve a managed exit | Accepted |
| [0012](0012-use-postgres-backed-background-work.md) | Use PostgreSQL-backed background work | Accepted |

## Creating an ADR

Copy [the template](template.md), assign the next four-digit number, use a short
kebab-case filename, and add it to the index. An ADR should include context,
decision, consequences, and rejected or deferred alternatives.
