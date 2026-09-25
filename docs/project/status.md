# Project status

**Status: Operational**

**Last updated:** 2026-09-21

## Current phase

Commandry has completed its initial product definition. Its technology and
deployment choices have been reopened and are not yet accepted. This repository
still contains documentation only; there is no application, schema,
infrastructure as code, or deployment. It is not ready for implementation
bootstrap until the proposed stack ADRs are reviewed and accepted.

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
- A responsive web/PWA remains the initial client direction, with stable API
  contracts for future native and desktop clients.
- PostgreSQL remains the recommended canonical database family, subject to the
  proposed provider and operations decision.
- Privileged execution runners remain a distinct security boundary from the
  public control plane.

## Confirmed operational facts

- The product name is Commandry.
- The domain `commandry.site` has been purchased.
- The domain nameservers have been changed to Cloudflare.
- The repository currently tracks the `main` branch and has an `origin` remote.

## Not yet decided

- acceptance or rejection of proposed ADRs 0009 through 0012;
- whether the existing VPS meets the minimum storage, memory, recovery, and
  backup requirements for the proposed production topology;
- exact first human sign-in and account-recovery method;
- initial connector pair;
- first concrete external agent runtime adapter and runner protocol details;
- exact first-release feature cut and success metrics;
- initial design language and component/token set;
- first sound/haptic vocabulary and preference defaults;
- initial scope for a live agent/system-flow viewport.

The future design-system, local-lab, sensory-feedback, and flow-visualization
directions are documented as proposed or exploratory. They are not implemented
or accepted architecture decisions.

See [Open questions](open-questions.md) for the decision queue.

The prior implementation ADRs
[0005](../decisions/0005-use-cloudflare-workers-and-neon.md) through
[0008](../decisions/0008-separate-control-plane-from-execution-runners.md) are
reopened. The evidence-based replacements are proposed ADRs
[0009](../decisions/0009-deploy-the-initial-control-plane-to-the-vps.md) through
[0012](../decisions/0012-use-postgres-backed-background-work.md).

## Documentation baseline

The [original 42-section working brief](../reference/original-product-definition.md)
has been preserved and decomposed into canonical, proposed, operational, and
reference documents. Coverage is tracked in
[Original-brief coverage](../reference/brief-coverage.md).
