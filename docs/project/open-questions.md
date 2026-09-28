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

The [current VPS audit](mvp-readiness.md#what-prevents-production-activation)
now identifies the IONOS Linux L server, its active provider firewall, and
available console. This question remains open until offsite backup, clean
restore, and recovery targets are proven.

### OQ-003: What is the first human sign-in and recovery method?

Better Auth, Postgres-backed sessions, separate machine identities, and a
single-user allowlist are settled. Choose passkey, email/password, or magic link
for the first human login and define device loss/account recovery. This choice
must not require a paid email service merely to start local development.

An opt-in local password experiment now creates exactly one allowlisted owner
through a one-time Docker bootstrap command, rejects public sign-up, validates
PostgreSQL sessions on human pages and versioned routes, and offers sign-in and
sign-out screens. Machine callback, receiver, and MCP POST routes retain their
own scoped credentials. The local phone proxy can forward only session routes
through its separate test/pass review gate. This experiment is off by default;
an offline local operator can now reset that one owner's password, revoke all
sessions, and record an `auth.owner_password_recovered` audit event while web
traffic is stopped. The built-app smoke checks sign-in, denial, sign-out, and
recovery against disposable PostgreSQL. This does not decide a production login
or recovery method, cover loss of VPS operator access, attribute existing
product audit records to a human, or lift the preview/production config gate.

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

The local fake worker now reports fixed progress milestones through an
application callback port, and queued or running fake runs can be canceled with
an audited state transition. This is a provisional protocol rehearsal. It does
not select an external runtime, callback authentication, workspace ownership,
artifact transfer, or retry policy for a real runner.

The local worker also uses a per-attempt, ten-minute maximum callback lease.
Only its digest is stored. A local-only versioned endpoint accepts ordered
heartbeats and one bounded synthetic JSON report; replay, wrong scope, expiry,
and closed runs are rejected. The report is immutable and downloadable from the
run timeline. This is a low-risk Commandry-owned evidence write requiring the
exact attempt token, no approval, and an immutable callback event plus audit
record. It performs no external action. Token distribution to an external
runner, callback transport trust, real workspace/log/artifact ownership,
heartbeat loss policy, and retries remain undecided.

For local review, a packet-scoped routing page shows only currently assigned
synthetic agents, their active fake-run count, the two fixed read operations,
and the reason they may be selected. The selection remains manual; skills,
budget, and provider capacity have no configured model and are labeled
unassessed. The latest successful fake result for that exact packet digest can
be read as a historical snapshot while the agent remains assigned, with
bounded evidence pages and a link to its read audit. It does not reissue a run
grant or imply verified work. Decide actual matching criteria, assignment
revocation semantics for historical output, cache retention, and whether any
future automatic dispatch requires a separate approval policy.

### OQ-007: What is the first capability and policy representation?

Define operations, scopes, environments, expiry, delegation, and approval
evaluation in enough detail to safely ship read tools and the first write action.

The local MVP now allows an automation definition to opt into one fixed
Commandry-owned note action with the literal capability reference
`commandry.project.knowledge.create`. The worker checks the enabled definition
and exact reference again before filing one labeled synthetic note and original
capture atomically with the run result and audit. The note can be revised; its
original and audit remain. This is a local policy rehearsal, not a general
capability grant, human identity or approval system, secret reference, or
authorization for an external write. Validate scoped grants, revocation,
approval identity, and action risk before production use.

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

The local MVP rehearses two transparent synthetic rules: a source observation
past its per-integration freshness window, and an availability metric drop of
at least a configurable number of percentage points between the latest two
samples when the latest is under 24 hours old. Local rule toggles and the drop
threshold are audited. These defaults do not settle real-source noise budgets,
notification routing, or production alert thresholds.

The local signal screen now records a useful or noisy rating and an optional
note against the exact synthetic evidence shown. It can snooze that evidence
for up to seven days, dismiss it, or restore visibility. Active queries hide a
currently suppressed observation; All history and the append-only review audit
retain it. New worker evidence is visible again and can receive its own review.
No rating changes a rule or trains an automatic ranker. This reversible local
action is assigned the provisional capability
`local_attention.signal.review`, requires no approval, performs no external
action, and records `local_attention.reviewed` with the evidence ID. The local
preview does not yet enforce human capability grants. Validate noise budgets,
feedback vocabulary, suppression across repeated observations, reviewer
identity, and critical-alert exceptions before production use.

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

The local MVP now stores optional controls only in each browser. Sound and
vibration default off, and reduced sensory mode or device-local quiet hours
suppresses both. A direct preview click and a deliberate synthetic signal
review can use one short, rate-limited acknowledgement; background events never
autoplay. The procedurally generated tone is a local prototype, not an accepted
asset. Validate categories, volume, real device behavior, accessibility,
cross-device preferences, and which future semantic events deserve a cue.

### OQ-017: What is the first useful agent/system-flow visualization?

Choose a narrow question and real data source for the first viewport—likely one
run's messages and handoffs or one correlation chain—before building a universal
live graph. Define aggregation, replay, freshness, privacy, and list/timeline
fallback behavior.

The local MVP now uses one synthetic fixture import as a bounded historical
replay. Its ordered list cites the stored envelope, worker attempts, normalized
event, metric, alert evidence, and directly linked automation runs. It shows
source occurrence separately from Commandry recording time and never claims a
live flow. This is a provisional accessible timeline, not a choice of live
transport, aggregation policy, universal graph, or cross-system correlation.

A second provisional project flow page lists persisted manual relationships,
synthetic events, fake local agent runs, local automation runs, and simulated
approvals for one project. It pages historical records with source links and
explicit synthetic labels. Current relationship and approval states are shown
alongside their recorded timestamps; the page is neither a live stream nor a
complete collaboration trace. Validate which cross-record correlations and
time semantics are useful before choosing a live viewport.

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

### OQ-027: What recurrence policy should govern Work in production?

The local MVP can attach one interval definition to an original task and use
the separate PostgreSQL worker to create unassigned task occurrences. Each
occurrence retains a link to that task and its preserved original capture.
The scheduler queues only the latest due slot after downtime and audits skipped
slots. Pausing stops future queueing; already queued occurrences retain their
history and may still complete. Validate calendar and time-zone semantics,
catch-up limits, edits to a source task, cancellation of queued work, retention,
source task completion, and how recurrence relates to assignment or approved
execution. No occurrence automatically runs an agent or external action.

### OQ-028: Which file extraction and storage policy belongs in production?

The local MVP stores original files of at most 2 MiB in PostgreSQL and uses a
deterministic UTF-8 worker for text, Markdown, CSV, and JSON. It indexes only
the first 200,000 characters, labels the projection, and leaves unsupported or
unreadable files intact. Validate file-size and type limits, malware scanning,
larger blob storage, extraction of PDF and images, reprocessing after extractor
changes, retention, access controls, and whether derived text may enter agent
packets. This local extractor is a provisional implementation, not a canonical
production content policy.

### OQ-029: Which saved-view semantics and ownership should ship?

The local MVP saves a named Work or Knowledge query definition for the
unattributed local user. It re-runs current records when reopened, uses relative
UTC due buckets, and archives removed views with an audit history. Validate
sharing, default views, ordering, pinned views, per-project ownership,
retention, identity and access rules, and whether Knowledge Decisions should
have a separate type filter. This local persistence does not settle a
multi-user or canonical view taxonomy.

### OQ-030: Which connector trust and polling model should ship?

The local MVP rehearses a token-protected receiver and a PostgreSQL fixture
feed polled by the separate worker. Both accept only named synthetic scenarios
in local or test mode and use the existing envelope, deduplication, mapping,
normalization, and activity path. The receiver token is shown once and stored
as a digest. Validate provider authentication and signature schemes, credential
custody, replay windows, source-specific cursors, backoff, retention, rate
limits, source freshness, and the first real adapter before enabling a live
connection. The local review gate is not product authentication.

### OQ-031: How should source freshness affect operational health?

The local MVP classifies the most recent successful synthetic source timestamp
as unknown, fresh, stale, or future-dated using an auditable per-source window
in minutes. Received time and import completion remain distinct. The default
60-minute window is provisional and can be changed locally; this classification
never marks a real resource healthy. Validate provider-specific expected
cadence, delay tolerance, clock skew, mixed sources, silence alerts, and how a
production health projection should use freshness once real inputs exist.
The local resource impact view follows up to six manually recorded dependency
hops and shows active supporting Project links beside synthetic metric-drop
evidence. Validate dependency direction, propagation depth, cycles, project
impact semantics, and mixed-source anomaly thresholds before treating this as
an incident or operational health model.

### OQ-032: What verifies an automation result and belongs in its export?

The local MVP records an immutable check that each referenced database record
still exists, along with the exact synthetic result digest, missing references,
and audit event. This is reference presence only; it never changes the worker
result from unverified or asserts an external effect. A versioned, paged JSON
export carries the local definition and every synthetic run with its result and
evidence. Validate semantic verification, reviewer identity, recheck policy,
redaction, provenance of imported definitions, export format and scope, and
retention before treating this as a production verification workflow.

### OQ-033: What offline behavior should an installed client support?

The local MVP offers an installable manifest on secure origins and caches only
a generic offline help page. Project pages, API responses, captures, and queued
actions stay online-only; the browser connection indicator checks reachability
without implying that external sources are fresh. The current same-network
phone preview uses HTTP and is usable in the browser but cannot offer secure
origin installation or service-worker offline help. Validate real-device
installation, authentication, cached-data privacy, conflict handling, source
freshness, and the smallest useful offline read/write scope before expanding
this behavior.

### OQ-034: What backup retention and key policy should ship?

The local MVP can explicitly invoke a sensitive CLI operation to read the
current local PostgreSQL database, encrypt a bounded custom-format archive
under `.agent/local-backups/`, and verify it by restoring into a disposable
database. The CLI derives a separate AES-256-GCM key from the local application
encryption key with a per-archive salt. An immutable PostgreSQL evidence row
records the local result, but no web action creates a backup. Invocation by a
local operator is the provisional approval behavior; no product capability is
granted. The evidence is the audit record, and verification never writes to an
external system or restores over the live database. Its 128 MiB in-memory limit,
reuse of the local application key, capture-sample check, file location, and
manual retention are local-only choices. Decide dedicated key custody and
rotation, backup role, size and streaming, schedule, retention, encrypted offsite
storage, restore target, recovery point, and recovery time before production.

A separate host-side restic path now streams a custom-format dump through a
read-only backup role to a configurable encrypted repository. Its repeatable
local test uses a synthetic Project and Capture, a separate disposable
PostgreSQL container, and an unexposed web read smoke. The actual R2
repository, dedicated key custody and rotation, schedule, retention,
offsite and VPS restore, and recovery targets remain open.

A provisional deployment backup gate now requires that streamed snapshot to
pass a separate-container restore with exact dump bytes and a web read smoke
before it can issue a production receipt. Local rehearsals are explicitly
synthetic and cannot issue that receipt. The R2 bucket, scoped credentials,
key custody, timer, alert, retention, production restore, and recovery targets
still require a production decision and proof.

### OQ-035: What project lifecycle and overview configuration should be canonical?

The local MVP lets the owner edit a project's name, summary, free-text type,
and one of the core model's five lifecycle states. It accepts any transition,
requires the current version to prevent silent overwrites, and retains an
immutable per-version before/after record. This is an editable local context
model, not a settled transition policy. Validate lifecycle rules, archived
project behavior, project dates, default cards by type, custom overview layout,
and how external health and attention should appear beside manual state.
The local metadata edit is classified reversible, has no external effect, and
records `project_metadata_event` as its audit event. Its intended production
capability is `commandry.project.update`; the current local UI does not issue
or enforce that grant, and no approval is requested for this local action.
Human attribution and production grants remain open under OQ-003 and OQ-007.
The local MVP also offers one universal, user-editable overview card order and
visible-area set. It does not infer defaults from free-text project type. Cards
read the current evidence-linked brief; hiding an area only changes its
presentation and never removes or limits the underlying records. This
reversible local-only setting is version checked, requests no approval, and
records `project_presentation_event` as its append-only audit event. Its
intended production capability is `commandry.project.presentation.update`;
local review does not enforce that grant. Validate type defaults, the canonical
card catalog, layout flexibility, and any sharing model before production.

### OQ-036: Which capture channels and derived media processing should become canonical?

The local MVP preserves pasted email, conversation, and manually entered voice
transcript text as distinct source types in the same immutable capture envelope.
It does not connect to mail or chat, record audio, or transcribe speech. Local
file capture accepts bounded originals; a matching PNG, JPEG, WebP, or GIF can
be previewed through a verified, same-origin raster response. SVG and unknown
files remain downloadable only. No image text extraction, OCR, metadata
stripping, or external media service is implied. Decide permitted source
channels, consent and retention, image preview policy, transcription and OCR
quality, and any production file store before real integrations are enabled.
