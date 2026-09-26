# ADR 0008: Separate the control plane from execution runners

**Status:** Superseded

**Reopened:** 2026-09-21

**Superseded:** 2026-09-25 by [0009](0009-deploy-the-initial-control-plane-to-the-vps.md)
and [0012](0012-use-postgres-backed-background-work.md).

The security boundary between the control plane and privileged execution
runners remains accepted. The managed serverless deployment assumption below
is no longer current.

**Date:** 2026-09-15

## Context

Commandry's public API and coordination workload fits managed serverless
infrastructure, but future agent work may require browsers, Git repositories,
SSH, custom binaries, GPUs, private networks, or long-running processes. Moving
the entire application to a VPS just to obtain those capabilities would combine
different trust, availability, and scaling concerns.

## Decision

Keep the public control plane on the managed platform and run privileged or
long-lived work on separately authenticated execution runners. A runner may be
a local machine, home server, or Dockerized VPS service. It receives scoped
execution packets and capability grants, not the application's master secrets
or unrestricted database access.

Maintain platform interfaces for blobs, jobs, workflows, and configuration, a
Node API entrypoint, and a production container build so the control plane can
move to Docker if later evidence justifies it.

## Consequences

- A VPS can be introduced for the work that needs it without taking over web,
  auth, database, and deployment operations.
- Runner compromise has a narrower blast radius than control-plane compromise.
- Runner dispatch, heartbeat, cancellation, artifact transfer, and capability
  enforcement become explicit protocols.
- The repository must exercise the Node/container path enough to prevent it from
  becoming fictional portability.
- A fully self-hosted edition later needs queue/workflow and object-store
  adapters plus complete backup/upgrade operations.

## Alternatives considered

- **Run all work in Workers:** rejected because arbitrary binaries, browser
  automation, and long CPU-heavy tasks do not fit the runtime.
- **Deploy everything to one VPS immediately:** rejected because it creates
  operational burden and an unnecessarily broad security boundary.
- **Give agents direct database/cloud-owner access:** rejected because it bypasses
  capability policy, audit, and revocation.

## Follow-up

Define the runner protocol before the first external execution integration. Add
a runner only when a real vertical slice needs it; do not create an idle service
merely to match the architecture diagram.
