# Product roadmap

**Status: Proposed**

The roadmap is outcome-based. It intentionally avoids dates; framework and
platform commitments are recorded separately as accepted ADRs.

## Phase 0 — Foundation

**Outcome:** a validated product model and implementation plan.

- bootstrap the accepted stack, storage model, identity boundary, and deployment
  target;
- convert open model questions into ADRs;
- prototype the shared entity and relationship model;
- define connector, event, capability, and audit contracts;
- choose the first two integrations for a vertical slice;
- define measurable acceptance criteria for the first release;
- define the semantic token/component boundary and the production-exclusion
  contract for a local experience lab; do not attempt the full sensory system.

Exit signal: the team can implement a narrow end-to-end loop without inventing
core semantics during feature work.

## Phase 1 — Remember and organize

**Outcome:** Commandry is useful as a persistent project brain before it can
control external systems.

- projects, systems, resources, and typed relationships;
- tasks, notes, decisions, links, and attachments;
- Quick Capture, Inbox, and reviewable triage;
- project overview and generated project brief;
- list and board views over the same work items;
- search over structured records and captured text.

Exit signal: a dormant project can be resumed from Commandry without hunting
through multiple tools.

## Phase 2 — Observe and explain

**Outcome:** external changes become contextual activity and attention items.

- connector framework and webhook/poll ingestion;
- one development integration, likely a repository/deployment source;
- one operational integration, likely host or uptime telemetry;
- normalized events, metrics, alerts, and resource health;
- Command Center, project activity, and contextual notifications;
- first infrastructure hierarchy and dependency views.

Exit signal: a real external event appears once, maps to the correct resource
and project, and produces a useful action or explanation.

## Phase 3 — Prepare and delegate

**Outcome:** agents can consume scoped context and return governed results.

- API/MCP read interface;
- generated execution packets;
- agent registry, runtime adapters, and run history;
- capability grants and project/resource scope;
- assignment, progress, output, and blocked/approval states;
- first read-only agent investigation workflow;
- read-only agent/run/message timeline suitable as the factual foundation for a
  later collaboration viewport.

Exit signal: an external agent completes a useful task without manual context
assembly, and Commandry records the evidence and result.

## Phase 4 — Automate safely

**Outcome:** scheduled and event-driven work can execute with explicit policy.

- recurring, scheduled, condition-based, and event-based automations;
- Overnight Queue and morning brief;
- action risk classification and approval inbox;
- secret-vault capability references;
- verification steps, retries, failure handling, and audit export;
- carefully selected reversible write actions.

Exit signal: unattended work runs predictably, pauses when policy requires, and
can be explained and audited afterward.

## Phase 5 — Proactive control plane

**Outcome:** Commandry finds useful work and opportunities across the user's
world without becoming noisy.

- staleness, trend, anomaly, and dependency reasoning;
- agent-generated widgets with cached structured output;
- capacity-aware task routing across agent providers;
- richer browser-mediated actions in isolated sessions;
- mobile/PWA refinement and native evaluation;
- continuous quality controls for suggestions and notifications;
- optional live agent/system-flow viewport with truthful replay and aggregation;
- refined sound and haptic language with independent preference controls,
  generated-asset provenance, accessibility testing, and real-device validation.

Exit signal: proactive suggestions are more often acted on than dismissed, and
the user trusts the system's restraint.

## Roadmap constraints

- Every phase must preserve source evidence and an audit trail.
- Write access follows proven read workflows, not the reverse.
- Connector count is not a success metric; useful cross-system context is.
- Autonomy expands per capability and resource, never as a global switch.
- Roadmap order may change after user research, but the security and provenance
  constraints do not.
