# Project status

**Status: Operational**

**Last updated:** 2026-09-27

## Current phase

Commandry has completed its initial product definition. ADRs 0009 through 0012
establish the initial technology and deployment architecture. The local
application foundation now includes a Next.js web shell and API, PostgreSQL
schema and migrations, a separate pg-boss worker, shared contracts, and the
local experience lab. The autonomous local MVP campaign now exercises the
interconnected project, capture, Work, Knowledge, infrastructure, activity,
agent, approval, automation, integration fixture, and morning review paths.
The accepted architecture and local code do not establish that the VPS is
ready, that offsite backups and VPS restores work, or that human
authentication is complete. There is no production deployment.

The user expanded the local campaign target to MVP-depth coverage of every
roadmap workstream. Planned phases now guide implementation order without
deferring a locally feasible module. Open product choices remain provisional
and production prerequisites remain gates.

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
- A responsive web/PWA remains the initial client direction, with versioned API
  contracts for future native and desktop clients.
- PostgreSQL is the canonical database, with self-hosted PostgreSQL 18 as the
  accepted initial placement subject to VPS and recovery validation.
- Privileged execution runners remain a distinct security boundary from the
  public control plane.

## Confirmed operational facts

- The product name is Commandry.
- The domain `commandry.site` has been purchased.
- The domain nameservers have been changed to Cloudflare.
- The repository has a `main` default branch and an `origin` remote.

## Local implementation evidence

- The web application exposes `/health/live`, `/health/ready`, `/version`, and
  versioned `/api/v1` routes for project and resource relationships, original
  captures, Work, Knowledge, search, synthetic development and operational
  evidence, explainable activity and attention, briefs, packets, scoped fake
  agents, simulated approvals, local automation, integration fixtures, and the
  Overnight Queue, and local packet-scoped MCP read sessions.
- Portfolio Domains are distinct local records with editable details and one
  active typed `owned_by` relationship per project. Moving or unlinking a
  project archives the old edge while retaining exact link and audit reads.
  Domain membership appears in the live project brief and new packet evidence;
  it is local organization metadata and does not authorize access. The single
  owning domain rule is provisional while broader context relationships remain
  open.
- Systems are distinct local records for continuing operated capabilities. A
  system may have one owning Domain, relate to multiple Projects, and receive
  support from multiple canonical Resources through typed, auditable links.
  Project briefs cite the exact system and project relationship. These manual
  links do not change resource hierarchy, grant access, or assert live health.
  The cardinalities and vocabulary remain provisional under OQ-021.
- Knowledge records can retain one original capture and primary Project while
  receiving active, typed secondary Project context. The additional relation
  appears in project and global Knowledge lists, scoped search, live briefs,
  and newly generated packet evidence. Unlinking archives the exact relation
  and removes current context without rewriting existing packets or the
  original capture. The local relationship policy remains provisional under
  OQ-022 and does not grant access.
- Text captures can be filed as source-backed notes, ideas, research,
  requirements, architecture notes, runbooks, meeting notes, lessons learned,
  or instructions. The chosen type appears in project and global Knowledge,
  search, live briefs, and new packet snapshots. Current content can be
  revised without changing the original or previous packets. Links and
  documents keep their distinct source handling; structured Decisions remain
  separate. This local taxonomy and retyping policy remain provisional under
  OQ-025.
- A Work item can retain one original capture and primary Project while gaining
  explicit, auditable secondary Project context. All related projects show the
  same persisted task and status. Project Work lists, scoped search, and live
  briefs cite the exact active relation; unlinking archives it without changing
  the original capture or primary ownership. New execution packets and direct
  agent work reads remain scoped to the primary Project, while a related
  Project's brief includes the shared task. This local relationship policy is
  provisional under OQ-023 and grants no capability by itself.
- Shared Zod contracts generate a checked OpenAPI document. PostgreSQL has
  reviewed, repeatable Drizzle migrations and separate local migration and
  application roles. The pg-boss worker records attempts, audits, and heartbeat
  evidence separately from transport tables.
- The local Overnight Queue binds a saved packet to an assigned synthetic agent
  and a due time. Its delayed job, audit, and entry commit together. The worker
  checks current readiness at dispatch, creates fresh scoped read grants,
  records an unverified fake result, and links it into the morning digest.
  Cancellation, changed-work blocking, replay, and recovery scans are local
  behaviors. The seven-day scheduling horizon is configurable through
  `LOCAL_OVERNIGHT_MAX_DAYS`; it is not a settled product policy.
- A local read-only MCP endpoint exposes the saved packet's project brief and
  work item to a loopback client through short-lived, one-time bearer sessions.
  The database stores only token digests. Project and work scope, revocation,
  expiry, and each tool read are checked and audited; the UI shows session
  history. The endpoint has no write or external action tools. Its provisional
  local session policy does not settle human sign-in, machine identity, or the
  production capability model.
- Work items now have append-only, cursor-paged local comments with immutable
  bodies and source-labeled search results. URL captures can be filed as
  knowledge links while preserving the original URL; the navigable link omits
  query and fragment text. Links appear in project and global Knowledge,
  search, live briefs, and packet selection. No captured URL is fetched by
  this local flow.
- An original local task can define an interval recurrence. PostgreSQL stores
  one definition per source task, durable due occurrences, and an audit trail.
  The separate worker creates an unassigned task linked to that source and the
  same preserved original capture. The scheduler records skipped slots after
  downtime, supports pause and resume, and never starts an agent run or external
  action. This local recurrence policy remains provisional under OQ-027.
- The Inbox accepts bounded local files and preserves exact bytes, original
  metadata, and a SHA-256 digest in PostgreSQL. A file can be filed as a
  project Knowledge document; its editable context remains separate from the
  immutable file. Downloads are forced attachments. File extraction, larger
  storage and production blob access remain open.
- Project Knowledge documents can be linked to tasks through primary or active
  secondary project context. Shared attachments cite the exact Knowledge
  project relation, which cannot be unlinked while an active task attachment
  depends on it. Task and document screens show both directions, exact
  original downloads, and source context. Link creation and archive are
  audited; live briefs cite active links and packet selection remains explicit.
  The local API has no product human sign-in or production capability grant.
- Work tasks now have versioned acceptance criteria and source-linked manual
  completion reviews. Current reviews cite attached original documents and
  appear in live briefs and new packet snapshots; older packets retain their
  original context. A configurable local completion gate requires a current
  met review when criteria exist. Claims remain manually recorded and
  unverified by any external system.
- A local automation can watch a linked resource's labeled synthetic external
  availability sample against a per-definition threshold. The worker creates
  one source-linked brief run when the sample first enters the below-threshold
  state and requires an above-threshold recovery before another crossing.
  Exact metric, event, and original-envelope evidence remains available; a
  disabled or overlapping crossing is audited as skipped. This condition uses
  only fixture imports and cannot operate on live monitoring data or take an
  external action.
- A local PostgreSQL recovery command now restores the application schema into
  disposable databases, seeds an original capture fixture, creates a logical
  backup, restores it, and compares public table counts and capture bytes. An
  immutable, cursor-paged record exposes the result and exact digests in the
  Infrastructure UI and versioned API. The local rehearsal does not verify
  offsite storage, a VPS restore, or production readiness. An unactivated
  production Compose template describes web, worker, migrate, PostgreSQL,
  Caddy, and outbound Tunnel services with one required app image digest and
  no published application or database port; production startup remains gated
  by OQ-003 and the deployment prerequisites.
- Work items have project-scoped, typed parent/subtask and blocking links with
  cycle prevention, audit-preserving archive, cursor-paged inverse views, and
  a responsive editor. Open blockers appear with exact relationship evidence
  in live briefs and pause local overnight readiness. Cross-project task
  dependencies and larger file handling remain open.
- Work records can be filed from an original capture as tasks or initiatives.
  An active `parent_of` relation derives the subtask type and unlinking returns
  it to task; existing parent links are backfilled. Lists, details, scoped
  search, live briefs, and new packets show the type, while old packets keep
  their saved snapshot.
  The primary project bounds hierarchy links, and the local type semantics
  remain provisional under OQ-024.
- Work items can be assigned to the unattributed local user or one synthetic
  agent already scoped to the primary project. An immutable assignment event
  records each change. The current assignee appears in Work lists and detail,
  with exact event evidence in live project briefs and new execution packet
  snapshots. Assignment does not authorize a run or external action; identity,
  multiplicity, and the assignment-to-run policy remain open under OQ-026.
- Work has list and two-column board projections over the same PostgreSQL
  tasks. Each board column pages independently, and completing or reopening a
  card uses the existing audited status transition. Priority, assignment, and
  UTC due buckets filter in the versioned API and across both views without
  replacing project scope, typed context links, or original captures. The UI
  keeps every matching task reachable through cursor continuation.
- Semantic CSS tokens, accessible responsive components, and representative
  Storybook states exist in the local-only lab. The lab is excluded from the
  production image.
- The current local app is served on the same Wi-Fi through a separate review
  gateway at `http://10.0.0.73:3011/` with `test` / `pass`; the Compose app
  remains on laptop loopback. That gate is only for local review, not product
  authentication. Browser checks cover desktop, 390 px, and 320 px widths;
  actual device rendering remains to be confirmed on the phone.
- Automated source, unit, browser, built-service smoke, and disposable
  PostgreSQL checks cover the local paths. On this Bazzite laptop, the
  Docker-compatible Podman service and Compose provider build the image and run
  PostgreSQL, migrations, web, and worker locally. The database, web, and worker
  report healthy. No VPS or production environment has been provisioned.

## Not yet decided

- whether the existing VPS meets the minimum storage, memory, recovery, and
  backup requirements for the accepted production topology;
- exact first human sign-in and account-recovery method;
- initial connector pair;
- first concrete external agent runtime adapter and runner protocol details;
- exact first-release feature cut and success metrics;
- full visual design language beyond the initial semantic token set;
- first sound/haptic vocabulary and preference defaults;
- initial scope for a live agent/system-flow viewport.

The local experience lab boundary is accepted development tooling and the
Storybook scaffold is implemented. The full design language, sensory-feedback
vocabulary, and flow-visualization details remain proposed or exploratory.

See [Open questions](open-questions.md) for the decision queue.
The [interconnected MVP campaign ledger](mvp-campaign.md) tracks local coverage
and remaining work across every roadmap area.

The prior implementation ADRs
[0005](../decisions/0005-use-cloudflare-workers-and-neon.md) through
[0008](../decisions/0008-separate-control-plane-from-execution-runners.md) are
superseded. The accepted replacements are ADRs
[0009](../decisions/0009-deploy-the-initial-control-plane-to-the-vps.md) through
[0012](../decisions/0012-use-postgres-backed-background-work.md).

## Documentation baseline

The [original 42-section working brief](../reference/original-product-definition.md)
has been preserved and decomposed into canonical, proposed, operational, and
reference documents. Coverage is tracked in
[Original-brief coverage](../reference/brief-coverage.md).
