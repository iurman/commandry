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

### OQ-020: Which conditional automation rules belong in the first release?

The local fixture rule uses a per-definition availability threshold, fires on
entry into the below-threshold state, and resets after recovery. Decide which
live metrics, units, source freshness checks, hysteresis, missing-data behavior,
and suppression controls are needed after the first connectors are selected.

### OQ-021: How should domains, projects, and systems share context?

The local portfolio currently permits one active owning domain per project and
one per system, retaining archived memberships as history. Systems may relate
to several projects and be supported by several resources; those edges are
manually authored local context. Validate additional cross-domain
relationships, the exact system/project/resource vocabulary and cardinality,
and whether domain navigation should use manual ordering or another
presentation. Domains are not access boundaries.

### OQ-022: How should one Knowledge record serve multiple projects?

The local MVP keeps the original capture and one immutable primary project while
allowing explicit, auditable secondary project context. Validate whether this
relationship vocabulary and cardinality fit notes, links, and documents; whether
project-specific annotations or a different ownership model are needed; and how
attachments and access policy should behave when secondary context is removed.
The local implementation currently requires archiving active task attachments
before unlinking their secondary Knowledge context; validate that policy for
real integrations. These manual links are not authorization grants.

### OQ-023: How should one Work item span multiple projects?

The local MVP keeps one original capture, immutable primary project, and shared
status while allowing explicit, auditable secondary project context. Validate
whether the relation should also carry project-specific planning or annotations,
whether parent and blocker relations may cross project boundaries, and how
execution packets, direct agent work reads, and approval policy should treat
secondary context. For now those operations remain owned by the primary
project. A related project's brief includes the shared task, so its authorized
brief readers can see that context; the link itself grants no capability.

### OQ-024: What distinct workflow should initiatives and subtasks have?

The local MVP files initiatives from original captures and derives a subtask
type from one active, project-scoped parent relationship. It currently permits
the same status, planning fields, packet creation, and fake local run path as a
task. Validate whether initiative completion should depend on child work,
whether initiatives should ever be executable, how reparenting should behave,
and whether hierarchy may span secondary project context. The local type is a
work organization aid, not a settled execution policy.

### OQ-025: Which Knowledge types and changes should be canonical?

The local MVP uses the proposed text categories of note, idea, research,
requirement, architecture note, runbook, meeting note, lesson learned, and
instruction. Link and document keep distinct source rules, and structured
Decisions remain separate. Validate the vocabulary, whether type changes need
their own audited revision, whether templates or required fields belong to
specific types, and how imported sources should map into these categories.
The current type is fixed at filing and does not assert a canonical taxonomy.

### OQ-026: How should Work assignment relate to identity and agent execution?

The local MVP can assign one Work item to the unattributed local user or one
synthetic agent already scoped to its immutable primary project. Changes are
audited, and an assigned agent appears with exact evidence in a live project
brief and in new execution packet snapshots. Assignment is organizational and
does not grant a run, capability, or external action. Validate whether Work
needs multiple assignees, project-specific assignees for shared Work, a real
human identity, reassignment on project scope change, and a deliberate path
from assignment to a governed run. Keep production identity and runner policy
open under OQ-003 and OQ-006 through OQ-008.
