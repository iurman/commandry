# Architecture overview

**Status: Canonical**

This document defines conceptual boundaries. The concrete implementation and
deployment selections are in [Technology stack](technology-stack.md) and
[Deployment strategy](deployment-strategy.md).

## System context

```text
Humans ───────────────┐
Agents via API/MCP ───┼──> Commandry ──> governed actions
External events ──────┘         │
                                ├── context graph and project memory
External systems <──connectors──┤
                                ├── event, alert, and automation engine
Agent runtimes <────adapters────┤
                                └── search, briefs, and attention projections
```

External systems remain authoritative for the concerns they own. Commandry owns
cross-system identity, relationships, annotations, context, policy, and its own
work/knowledge/execution records.

## Conceptual layers

### Experience layer

- responsive web application and command bar;
- project and resource workspaces;
- Command Center, Inbox, search, activity, approvals, and briefs;
- later native or specialized clients.

### Interface layer

- application API;
- MCP server for agent discovery and action;
- webhook ingestion endpoints;
- connector and runtime adapter contracts.

### Application layer

- capture and triage;
- portfolio, work, and knowledge services;
- resource graph and health projection;
- event normalization, alerting, and attention ranking;
- automation scheduling and run coordination;
- policy, approvals, and audit;
- search, retrieval, and brief generation.

These are logical modules and do not require initial microservices.

### Data layer

- transactional entities and typed relationships;
- immutable source payload references and normalized events;
- search/semantic indexes derived from authorized records;
- current metrics and summaries, with external telemetry storage where useful;
- artifacts and attachments;
- audit history and connector cursors.

## Primary flows

### Capture to context

```text
Input -> source capture -> extraction -> triage suggestions -> user/policy review
      -> work or knowledge records -> project brief/search/activity refresh
```

### External signal to attention

```text
Webhook/poll -> raw source record -> normalize/deduplicate -> event
             -> resource/project relationships -> state/alert projection
             -> activity, notification, automation, or agent candidate
```

### Work to governed execution

```text
Work item -> readiness check -> execution packet -> agent/runtime selection
          -> capability grant -> run -> proposed actions/approvals
          -> verification -> outcome, artifacts, activity, and knowledge
```

## Ownership rules

For every synced field or action, the system must know:

- which service is authoritative;
- whether sync is read-only or bidirectional;
- what Commandry may annotate locally;
- how deletion, disconnection, and stale data behave;
- whether external writes are idempotent and verifiable.

Conflicts are surfaced, not silently resolved by last-write-wins across systems.

## Consistency and processing

External ingestion and derived projections can be eventually consistent. The UI
must expose freshness when it matters. Transactional Commandry changes—such as
granting approval or updating a task—require strong enough consistency to avoid
duplicate or unauthorized execution.

Event consumers should be idempotent. Connector delivery, scheduling, and agent
callbacks may occur more than once.

## Build shape

The accepted first implementation direction is a TypeScript modular monolith: a Next.js
web/API process, a separate Node background worker, and PostgreSQL. It deploys
as a Docker Compose project on the existing VPS. Vercel and Neon remain optional
managed paths. Separate execution runners are introduced for operational
capability or isolation, not merely because the conceptual diagram has boxes.

## Architecture qualities

- traceable: summaries and actions link to evidence;
- extensible: new resource and connector types use common contracts;
- resilient: failed enrichment does not lose source input;
- safe: capabilities and approvals govern every external action;
- observable: connector lag, job failure, stale projections, and run state are
  themselves visible;
- portable: agents can retrieve context without screen scraping the UI.
