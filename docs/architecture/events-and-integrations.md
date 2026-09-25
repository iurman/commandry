# Events and integrations

**Status: Proposed**

## Integration contract

An integration connects one configured external account or environment. A
connector implementation may support many integration instances.

Each connector should declare which capabilities it supports:

- discovery and inventory sync;
- state and metric polling;
- webhook/event ingestion;
- history backfill;
- deep links;
- read queries;
- normalized actions;
- health and permission checks.

## Common normalized outputs

Integrations map provider-specific concepts into five common abstractions:

1. **Resource** — what exists.
2. **Metric** — a measurement over time.
3. **Event** — something that happened.
4. **Alert** — an actionable condition.
5. **Action** — something Commandry can request.

Provider-specific fields may be retained as namespaced metadata, but common UI
and automation behavior must use normalized fields where possible.

## Ingestion pipeline

1. Receive a webhook, poll result, agent callback, or collector sample.
2. Authenticate source and store a source envelope/reference.
3. Deduplicate using stable source IDs or a connector-defined key.
4. Resolve the integration and external subject identity.
5. Normalize to resources, metrics, and events.
6. Update current-state projections with source timestamp and freshness.
7. Resolve project and dependency relationships.
8. Evaluate alert and automation rules.
9. Update activity, attention, search, and notifications.

Every stage should support replay without creating duplicate actions.

## Event envelope

A normalized event should contain:

```text
id, type, occurred_at, ingested_at
source_actor, integration, subject, related_entities
severity, normalized_payload, source_reference
deduplication_key, correlation_id, causation_id
schema_version, processing_version
```

Event schemas are versioned. Consumers should tolerate additive fields and must
not infer provider behavior from undocumented payload fragments.

## Connector synchronization

Each entity or field should identify ownership:

- **External:** displayed/cached by Commandry; edits happen at the source.
- **Commandry:** local record with optional export.
- **Mapped:** configured bidirectional behavior and conflict policy.
- **Derived:** recalculated from source records and never edited directly.

Connector state should expose last successful sync, next attempt, cursor, error,
scope, and data freshness.

## Initial integration candidates

Potential categories from the product definition:

- development: GitHub;
- deployment/hosting: Vercel, Coolify, Cloudflare;
- analytics: Google Search Console and Google Analytics;
- reliability: Sentry and uptime providers;
- infrastructure: Proxmox, Docker, Beszel, Netdata, custom collector;
- game hosting: CubeCoders AMP;
- home: Home Assistant;
- communications: Resend;
- agent execution: Codex, Paperclip, or other runtimes;
- custom APIs and webhooks.

These are candidates, not committed launch integrations. The first vertical
slice should choose one development source and one operational source based on
available environments and usefulness.

## Integration quality bar

An integration is not complete merely because it fetches data. It should:

- use stable external identity and idempotent processing;
- make source, scope, ownership, and freshness visible;
- connect records to projects/resources;
- handle revocation, permission loss, and rate limiting;
- avoid exposing credential values;
- emit useful health and failure events;
- document which actions exist and how they are verified;
- degrade safely when the provider is unavailable.
