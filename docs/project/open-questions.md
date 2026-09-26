# Open questions

**Status: Operational**

These are unresolved choices. Agents must not silently settle them in code or
documentation. When decided, create or update an ADR and remove the item from
this list.

## P0 — required for production readiness or the first product slice

### OQ-019: Can the existing VPS safely host the initial database?

Record its provider, region, operating system, CPU architecture and count, RAM,
swap, disk type and capacity, current workloads, snapshots, recovery console,
firewall, and backup bandwidth. Confirm the recovery point and recovery time the
owner will accept. If it lacks 2 GB of available RAM, reliable storage, recovery
access, or tested offsite backup, revisit database placement before production
deployment. Disposable local PostgreSQL work can proceed without this inventory.

### OQ-003: What is the first human sign-in and recovery method?

Better Auth, Postgres-backed sessions, separate machine identities, and a
single-user allowlist are settled. Choose passkey, email/password, or magic link
for the first human login and define device loss/account recovery. This choice
must not require a paid email service merely to start local development.

### OQ-005: Which two integrations prove the vertical slice?

Choose one development/work signal and one operational signal. Selection should
favor real available data, webhook/API quality, usefulness, and the ability to
demonstrate cross-context value.

## P1 — required before agent execution

### OQ-006: Which agent runtime adapter and runner protocol come first?

The control-plane/runner split is settled. Choose a direct Codex-style adapter,
Paperclip as an execution backend, or a minimal generic run protocol, then
specify dispatch, workspace, heartbeat, cancellation, log, artifact, retry, and
callback ownership.

### OQ-007: What is the first capability and policy representation?

Define operations, scopes, environments, expiry, delegation, and approval
evaluation in enough detail to safely ship read tools and the first write action.

### OQ-008: Which secrets system will broker credentials?

Decide whether the first release integrates a vault, uses platform-managed
secrets behind connector boundaries, or supports both. Secret values must never
enter normal knowledge or prompt storage.

### OQ-009: How are generated briefs and semantic answers evaluated?

Set evidence requirements, freshness behavior, citation format, inference
labeling, model/provider policy, and quality tests.

## P2 — product validation

### OQ-010: What is the minimum first-release cut?

Turn the “minimum coherent product” in [Scope](../product/scope.md) into a
testable release plan with explicit deferrals.

### OQ-011: Which project templates are needed first?

Likely candidates are software project, infrastructure system, and personal
event. Validate whether shared primitives really support all three without
prematurely building template-specific features.

### OQ-012: How proactive should the first Command Center be?

Decide the initial deterministic attention rules, notification channels, noise
budgets, and where AI ranking is allowed.

### OQ-013: What data retention and deletion promises apply?

Define source payload, event, metric, agent log, artifact, audit, and deleted
external-resource retention, including local-first or self-hosted expectations.

### OQ-014: Is “Infra Agent” retained as a product name?

Decide whether the collector becomes Commandry Collector, remains Infra Agent,
or is replaced by integrations with Beszel/Netdata and a smaller custom adapter.

### OQ-015: What is Commandry's initial design language?

Define the first semantic visual tokens, typography/density, component set,
motion families, themes, accessibility targets, and voice. Use
[Aviune](https://aviune.com/design) and [Phloom](https://phloom.app/design) as
owner-provided references for executable design documentation without silently
copying either product's identity.

### OQ-016: Which sensory feedback intents should ship?

Validate the smallest sound and haptic vocabulary, default/mute behavior, quiet
hours, event rate limits, browser/native capability matrix, generated-asset
review/provenance, and accessibility tests. Do not treat “make it haptic” as
permission to vibrate or play sound for every event.

### OQ-017: What is the first useful agent/system-flow visualization?

Choose a narrow question and real data source for the first viewport—likely one
run's messages and handoffs or one correlation chain—before building a universal
live graph. Define aggregation, replay, freshness, privacy, and list/timeline
fallback behavior.
