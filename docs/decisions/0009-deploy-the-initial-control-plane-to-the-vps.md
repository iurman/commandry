# ADR 0009: Deploy the initial control plane to the existing VPS

**Status:** Proposed

**Date:** 2026-09-21

## Context

Commandry needs a public web/API control plane, dynamic schedules, durable
background work, integrations, and later agent coordination. The owner already
has a VPS and wants the option to self-host. The first review selected
Cloudflare Workers before accounting for that existing capacity or the value of
a continuously running Node worker.

Vercel and Cloudflare both provide good managed deployment experiences, but the
full Commandry workload would still need a long-lived worker or execution host.
Neon's free scale-to-zero behavior is also a poor match for frequent background
connections.

## Proposed decision

Deploy the initial control plane as a Docker Compose project on the existing
VPS. Run the web/API process, a separate background worker, PostgreSQL, Caddy,
and cloudflared as containers. Publish `commandry.site` through a named
Cloudflare Tunnel to Caddy. Do not expose PostgreSQL or the application port to
the public network.

Build and test immutable images in GitHub Actions, publish them to GitHub
Container Registry, and deploy exact image digests through a constrained VPS
deployment command. Keep production secrets in a root-owned VPS environment
file, not in the repository or an agent prompt.

Store encrypted offsite database backups in Cloudflare R2 and prove restores on
a schedule. The VPS deployment is not considered ready until its hardware,
operating system, storage, recovery console, and snapshot capabilities are
recorded.

Cloudflare Workers is not an initial runtime. Vercel remains an optional preview
or future managed host.

## Consequences

- The existing VPS covers the web process, persistent worker, database, and
  arbitrary Node workloads without another initial compute bill.
- Local and production behavior use the same container artifacts.
- The owner assumes operating-system, Docker, PostgreSQL, monitoring, backup,
  restore, capacity, and incident responsibility.
- One VPS is a failure domain, so offsite backups and an external availability
  check are mandatory.
- Vercel and Neon can be adopted later without rewriting domain behavior, but
  migration is an operational project rather than a one-click toggle.
- Privileged execution runners remain separate identities and do not receive
  direct database access, even if an early runner shares the same physical VPS.

## Alternatives considered

- **Vercel plus Neon:** strong managed developer experience, but introduces two
  providers while still leaving the long-lived worker elsewhere. Vercel Hobby
  is restricted to personal non-commercial use, and frequent background work
  can keep Neon compute active.
- **Cloudflare Workers plus Neon:** strong serverless primitives, but the edge
  runtime constrains process duration and drove unnecessary framework choices.
- **VPS app plus managed PostgreSQL:** the fallback if VPS storage, backup, or
  database operations fail the readiness review.
- **Direct public Caddy ingress:** viable, but Cloudflare Tunnel avoids an open
  application port and fits the domain's current nameserver setup.

## Evidence

See [Hosting and stack evaluation](../research/hosting-and-stack-evaluation.md)
and [Deployment strategy](../architecture/deployment-strategy.md).

## Acceptance gates

1. Record the VPS inventory and confirm at least 2 GB of available RAM,
   reliable storage, recovery-console access, and an offsite backup path.
2. Prove a full Compose deployment, health check, and application rollback.
3. Prove a PostgreSQL backup, offsite upload, clean restore, and application
   smoke test.
4. Prove the constrained deployment identity cannot read the production
   environment file or obtain an unrestricted root shell.
