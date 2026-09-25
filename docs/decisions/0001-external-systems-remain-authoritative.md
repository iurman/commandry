# ADR 0001: External systems remain authoritative

**Status:** Accepted

**Date:** 2026-09-15

## Context

Commandry connects repositories, infrastructure, home systems, deployments,
monitoring, analytics, and agent runtimes. Reimplementing each specialized tool
would expand scope while losing depth and creating conflicting state.

## Decision

Commandry will be the system of understanding and governed control across tools.
External services remain systems of record for the concerns they are designed
to own unless a later explicit decision moves ownership into Commandry.

Every integration must document field/action ownership, sync direction,
freshness, conflict behavior, and disconnection behavior.

## Consequences

- Commandry prioritizes normalization, relationships, context, and actions.
- Deep specialized workflows may use external deep links or embeds.
- Connectors and stale-data behavior are core architecture concerns.
- Commandry-owned work and knowledge can coexist with mirrored external items.
- Offline operation is bounded by what Commandry owns or has cached.

## Alternatives considered

- Rebuild each underlying capability: rejected as unfocused and costly.
- Act only as a link dashboard: rejected because it lacks understanding,
  history, and governed action.
