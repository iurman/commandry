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
- The synthetic monitor fixture will also project an immutable
  `external_availability` percentage sample (0 for down, 100 for recovered)
  onto its linked resource and project. Earlier fixture events are backfilled
  from their preserved envelopes. Sample times are source occurrence times;
  later ingestion cannot rewrite history or real resource health. The UI will
  label every value historical and synthetic, and the unit/name are a local
  adapter choice rather than a live telemetry contract.
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
- A filed knowledge note may be revised locally by supplying its displayed
  version. Each accepted edit stores the previous and new title/content in an
  immutable revision row, while the exact original capture remains separate.
  Current search and live briefs use the latest note; saved execution packets
  retain their original snapshot. The `local-user:unattributed` edit label is
  provisional until OQ-003 establishes human identity. Deletion, merge, and
  retention policy remain open under OQ-013.
- A URL capture may be filed as a `link` knowledge record. The saved link target
  will omit query and fragment text and refuse embedded user credentials;
  the original capture remains exact and separate. Link title and context can
  be revised, while the target remains tied to its original. The local UI will
  not fetch the URL. Work comments will be append-only manual records with
  audit and search links to their task. This is a narrow reference and
  discussion slice; task attachment links, external sync, multi-project
  ownership, and richer work types remain open for later implementation.
- A manual file capture will keep exact bytes, original name, media type,
  byte count, and SHA-256 in a dedicated PostgreSQL row with an immutable
  source pointer. This local path accepts 1 byte through 2 MiB and serves a
  verified download only as an attachment. Filing it creates a Knowledge
  document with separately revisioned title and context. No file is executed,
  scanned, extracted, uploaded to a provider, or represented as live external
  content. The PostgreSQL storage cap is a local adapter choice and does not
  select production blob storage, retention, or access policy.
- A local task may be completed and reopened. Each change will use the displayed
  status as an expected value and append an immutable event. Live briefs will
  select currently open tasks, while already generated execution packets will
  keep their original task-status snapshot.
- Filed tasks may be linked within one project through `parent_of` and `blocks`
  relationships. A task may have one active parent, and neither link type may
  form a cycle. Removing a link archives it and retains the audit record. An
  open blocking task will pause a local Overnight Queue entry at scheduling or
  dispatch; a completed blocker or archived link will not. The brief will cite
  exact relationship records for previewed blocked work. These local meanings
  do not decide cross-project work ownership, broader initiative types, or a
  universal task dependency policy.
- Local task priority (`low`, `normal`, `high`) and UTC calendar due date are
  optional, editable planning metadata. An edit requires the displayed task
  revision and appends an immutable local event. The cross-project upcoming
  view orders dated open tasks by date and pages all matches. `Overdue` means
  before the current UTC date, not a live external scheduling signal. These
  priority labels and date semantics are provisional, not a canonical planning
  policy or an automatic assignment of captured work.
- The first task board will be a view over the same cursor-paged open/done task
  records as the list, using the same audited status operation. It will not
  introduce separate board copies or silently assign task priority. Manual
  project decisions will record question, outcome, alternatives, rationale,
  status, and append-only revisions. A stale editor must reload, and a
  superseded decision cannot be revised. These are local user-authored facts,
  not product architecture ADRs or AI conclusions. The live brief will cite the
  current decision; previously saved execution packets remain snapshots.
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
- The local MCP preview will issue a one-time bearer token bound to a saved
  packet and assigned synthetic agent. It will store only a token digest,
  expose read-only brief and packet-work tools to loopback clients, check
  project and work scope at each call, and retain an audit record. Sessions
  will expire and can be revoked. The same-Wi-Fi review gateway will not
  proxy MCP writes. This local interface does not settle product sign-in,
  machine identity, external runner access, or the final capability policy.
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
- The first local automation will be a project-summary routine with an
  `on_creation_once` trigger. Enabled definitions queue one worker read at
  creation; disabled definitions remain inert. Manual reruns are explicit.
  The worker reads only the bound project's evidence-linked brief, records
  attempts and audit events, and returns a synthetic, unverified preview with
  no external action. This is a local scheduler/source-of-truth assumption,
  not a choice of live integration scheduler or an Overnight Queue policy.
- A local reviewer may also request one future run of that same read-only
  summary. The requested device time is converted to a stored UTC instant;
  the run row, occurrence ID, queue job, and audit commit together. pg-boss
  defers worker pickup until the due time. A disabled definition is rejected
  when scheduling and is checked again by the worker before reading. If the
  run is skipped while disabled, enabling later does not replay that one-time
  occurrence; another explicit run is required. This is a provisional local
  schedule, not an overnight readiness decision or external scheduler integration.
- A definition may instead start a local recurring summary at a future UTC
  instant and repeat at a configured 5 to 10080 minute interval. The worker
  materializes due occurrences into durable runs and audits. After downtime,
  it creates only the latest due occurrence and records the number of missed
  intervals; it records a skipped run if a previous run is active. Disabling
  prevents new occurrences, and re-enabling resumes at the next future
  interval without replaying disabled time. The interval, catch-up, and
  overlap policy are provisional local choices, not a decision about live
  integration scheduling or an Overnight Queue.
- A definition may instead match one of the three named synthetic fixture
  event types within its project. The separate worker materializes one
  source-linked local summary run per newly normalized event, or an audited
  skipped run if the definition is disabled or already busy. Replaying an
  import does not duplicate its occurrence; enabling later does not replay a
  skipped event. Each completed summary cites the normalized event and its
  original source envelope remains available through that record. This
  local-only rule is an exercise of the event trigger contract, not a chosen
  live connector or a production automation policy.
- The local morning run digest is a read-only projection of completed local
  automation and fake agent runs in an explicit, user-selected UTC window of
  at most 31 days. It groups successful synthetic outcomes as awaiting review,
  failed attempts as failed, and skipped occurrences as skipped, with stable
  cursor continuation and links to the saved run and source evidence. It does
  not claim verified work, establish overnight readiness, or schedule a
  morning delivery. Overnight Queue policy remains open.
- The local notification center will derive current items from synthetic
  monitor conditions, pending simulated approvals, and failed local summary
  attempts. A continuing monitor condition yields one item per open cycle and
  a distinct recovery item; repeated down events do not create more items.
  Acknowledgement, dismissal, and one-hour UI snooze are reversible local
  receipts with immutable audit, not alert-source mutations or external
  delivery. Priority and the local-only channel are provisional examples;
  notification budgets, routing, and live channels remain open under OQ-012.
- The local Command Center will preview the three most recent source-timed
  active notifications and link to the paged notification center for older
  items. Its next action will open the newest item's source context, or the
  Inbox when no active notification exists. This is a transparent recency
  rule, not a settled priority or attention-ranking policy under OQ-012.

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
