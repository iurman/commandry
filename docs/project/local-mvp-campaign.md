# Local MVP campaign

**Status: Operational**

This document records temporary implementation assumptions for the local campaign on
`autonomous-commandry-mvp`. It does not set the first release cut, select live
integrations, approve production deployment, or resolve the
[open questions](open-questions.md). The target is the
[minimum coherent product](../product/scope.md#minimum-coherent-product) with
PostgreSQL, the versioned API, a separate worker, responsive screens, and the
local experience lab.

## Local assumptions

- The API and database will run on laptop loopback. The existing `test` / `pass`
  LAN preview is a review gate only, not a Commandry sign-in or recovery method.
  Production startup remains gated on OQ-003 and the accepted deployment gates.
- Project `type` will be a descriptive label, not a template or a security
  boundary. A project will not require a repository. Initial relationship
  choices will be registered with allowed entity kinds and inverse meaning;
  adding more edge types will remain possible without duplicating resources.
- Manually entered resources will have unknown operational state until an
  observation with a named source and time exists. Cached or synthetic health
  will always identify its source and freshness.
- Local resource containment will use one cycle-safe primary parent for
  navigation. Manual `depends_on` links will be separate typed edges with a
  `required_by` inverse; neither containment nor dependency will manufacture
  operational health. The initial Infrastructure view will page roots and each
  branch so the entire catalog remains reachable. This is a provisional graph
  slice, not a decision on live topology discovery or connector ownership.
- Text and URL capture will come first. Original input will be immutable; filing,
  classification, and generated summaries will remain separate derived records.
  Local deterministic suggestions will identify their rule and rationale and
  will never be labeled as AI analysis. The provisional `capture-triage/v1` rule
  suggests a task for text containing a small fixed action-word list, a note
  for other text, and a note for an HTTP URL. Its confidence is a fixed rule
  score, not a calibrated probability. A person can correct the proposed
  project, kind, title, and body before approval, or reject it. A separate
  immutable decision records the local unattributed reviewer label. Queue
  failure must not lose the original, and manual filing remains available.
- Initial manual filing will create a project task or note while retaining a
  direct link to the capture. PostgreSQL full-text search will cover these
  records and the project/resource catalog with a project filter and cursor
  continuation. This local search is not a semantic answer or an access-control
  substitute while OQ-003 remains open.
- A local task may be completed and reopened. Each change will use the displayed
  status as an expected value and append an immutable event. Live briefs will
  select currently open tasks, while already generated execution packets will
  keep their original task-status snapshot.
- Two fixture adapters will model development and operational signals without
  connecting to external services. Their source envelopes, normalized events,
  activity, attention, briefs, and search results will all carry a visible
  `Synthetic` label. Replaying a fixture should be idempotent. Operational
  fixture observations will have their own projection and will not update a
  resource's real observed state or last observed time.
- Briefs and execution packets will initially use deterministic assembly from
  stored records, with evidence links and generation time. This will not claim
  semantic answer quality or resolve OQ-009. Brief sections may be bounded for
  readability only when their full product population remains reachable through
  continuation. Packet context will be explicitly selected, project-scoped,
  immutable after generation, and linked to exact source records; it will not
  include secret values or claim unrecorded acceptance criteria. Selected
  resources will contribute only identity and exact project-link provenance,
  never an external URL. When a resource has multiple active relationship
  types, the local packet records the oldest active link (then ID) and names
  that choice; relationship selection remains a future product question.
- Scoped reads, agent runs, and higher-risk action review will use a local fake
  actor and simulated action. Approval will never invoke an external system.
  The local capability representation will remain replaceable while OQ-006,
  OQ-007, and OQ-008 are unresolved. The fake agent will have persisted project
  assignments and a run-specific, expiring grant for `project.brief.read` and
  `work.read` only. The worker will read through the same policy and audit path
  as the local API, then report a cited, unverified result with no external
  actions. A person selecting an agent in the local UI does not establish a
  production agent or human identity while OQ-003 and OQ-006 remain open.
- The first higher-risk review will be one fixed `simulated.resource.restart`
  descriptor linked to a successful fake run and an exact resource selected in
  its immutable packet. Its conceptual `infrastructure.restart` capability is
  never granted to the local worker. The provisional automatic risk ceiling
  defaults to `reversible` and can be lowered to `read_only`; the sensitive
  simulation always requires explicit review. Its expiration is locally
  configurable. Approve, reject, cancel, and expire decisions will retain an
  audit trail, with an unauthenticated local reviewer label. Approval permits
  only a worker-recorded `simulated_only` outcome and never changes a resource
  or invokes a real integration. OQ-003 and OQ-007 remain open.

## Evidence expected before campaign completion

- UI and API journeys persist and relate projects, resources, captures, work,
  knowledge, synthetic signals, packet snapshots, runs, and approvals in
  PostgreSQL. Briefs are generated from a consistent database snapshot and
  preserve links to their source records.
- The separate worker processes the asynchronous local paths, retaining
  product-visible attempts, source evidence, and audit history.
- Repository checks, meaningful unit and PostgreSQL integration tests, a
  production-shaped local Compose stack, and desktop and phone browser checks
  pass. The local Storybook lab shows actual shared components and remains out
  of the production image.
- A final audit distinguishes working local behavior from simulations and from
  the external dependencies needed for a real release.

## Questions that remain open

The existing decision queue remains authoritative: OQ-003 (human sign-in and
recovery), OQ-005 (first live connector pair), OQ-006 (external agent runtime),
OQ-007 (capability/policy representation), OQ-008 (secret broker), OQ-009
(generated-answer evaluation), OQ-010 (first release cut), OQ-012 (attention
noise controls), OQ-013 (retention/deletion), and OQ-019 (VPS and recovery
readiness). Local fixtures and defaults do not settle them.
