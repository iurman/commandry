# Project status

**Status: Operational**

**Last updated:** 2026-09-25

## Current phase

Commandry has completed its initial product definition. ADRs 0009 through 0012
establish the initial technology and deployment architecture. The local
application foundation now includes a Next.js web shell and API, PostgreSQL
schema and migrations, a separate pg-boss worker, shared contracts, and the
local experience lab. The accepted architecture and local code do not establish
that the VPS is ready, that backups and restores work, or that human
authentication is complete. There is no production deployment.

## Established direction

- Commandry is a personal control plane spanning projects, knowledge,
  infrastructure, automations, monitoring, and agents.
- Existing tools generally remain systems of record.
- The source model is graph-minded with typed relationships and an optional
  hierarchy for navigation.
- Raw captures and source evidence are preserved.
- Agent and automation access is capability-scoped and risk-gated.
- Responsive web/PWA is the initial client direction.
- The first product boundary has six modules: Command Center, Projects, Capture,
  Infrastructure, Automations, and Agents.
- A responsive web/PWA remains the initial client direction, with versioned API
  contracts for future native and desktop clients.
- PostgreSQL is the canonical database, with self-hosted PostgreSQL 18 as the
  accepted initial placement subject to VPS and recovery validation.
- Privileged execution runners remain a distinct security boundary from the
  public control plane.

## Confirmed operational facts

- The product name is Commandry.
- The domain `commandry.site` has been purchased.
- The domain nameservers have been changed to Cloudflare.
- The repository has a `main` default branch and an `origin` remote.

## Local implementation evidence

- The web application exposes `/health/live`, `/health/ready`, `/version`, and
  initial `/api/v1` resource and synthetic-run routes.
- Shared Zod contracts generate a checked OpenAPI document. The database has a
  reviewed initial Drizzle SQL migration and separate local migration and
  application roles.
- The worker records product-visible run attempts and heartbeat evidence
  separately from pg-boss transport tables.
- Semantic CSS tokens, accessible shell components, preference foundations,
  and representative Storybook states exist in the local-only lab.
- Automated source, unit, browser, and disposable PostgreSQL checks cover this
  scaffold. Docker image and Compose execution remain unverified on the
  current host because Docker is unavailable.

## Not yet decided

- whether the existing VPS meets the minimum storage, memory, recovery, and
  backup requirements for the accepted production topology;
- exact first human sign-in and account-recovery method;
- initial connector pair;
- first concrete external agent runtime adapter and runner protocol details;
- exact first-release feature cut and success metrics;
- full visual design language beyond the initial semantic token set;
- first sound/haptic vocabulary and preference defaults;
- initial scope for a live agent/system-flow viewport.

The local experience lab boundary is accepted development tooling and the
Storybook scaffold is implemented. The full design language, sensory-feedback
vocabulary, and flow-visualization details remain proposed or exploratory.

See [Open questions](open-questions.md) for the decision queue.

The prior implementation ADRs
[0005](../decisions/0005-use-cloudflare-workers-and-neon.md) through
[0008](../decisions/0008-separate-control-plane-from-execution-runners.md) are
superseded. The accepted replacements are ADRs
[0009](../decisions/0009-deploy-the-initial-control-plane-to-the-vps.md) through
[0012](../decisions/0012-use-postgres-backed-background-work.md).

## Documentation baseline

The [original 42-section working brief](../reference/original-product-definition.md)
has been preserved and decomposed into canonical, proposed, operational, and
reference documents. Coverage is tracked in
[Original-brief coverage](../reference/brief-coverage.md).
