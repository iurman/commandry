# Agent foundation

**Status: Operational implementation. Production release verified 2026-10-16.**

This document describes the shared application and PostgreSQL foundation.
Twenty-one opt-in MCP tools and authenticated owner HTTP operations use the
shared records and application services. The reviewed foundation release is
deployed; [activation evidence](#production-activation-2026-10-16) distinguishes
production checks from disposable tool/write rehearsals. No private memory import
or evaluation execution was performed. The existing [knowledge MCP](knowledge-mcp.md) retains its
four read tools and existing scope. The approved
[campaign plan](../plans/agent-memory-mcp-foundation/PLAN.md) tracks the remaining
broader finding coverage, adoption, candidate and release work.

## Records and source ownership

Foundation memory is a typed, versioned assertion attached to a real canonical
Knowledge item. Several assertions can refer to one Knowledge source. The
assertion statement is derived content, with its own stable ID and history; it
does not overwrite the original capture or canonical Knowledge text. All views
and transports must use these same application services and records.

Evidence records retain a source kind, source identity and version, exact byte
digest, locator, observation time, availability and server attribution. A
Knowledge source uses its Knowledge ID and a positive decimal source version.
Its digest is SHA-256 of the exact UTF-8 content field. Capture evidence uses the
capture ID, no source version, and the original capture's exact UTF-8 content.
Canonical source ownership and bytes are checked within the authorized project.
Version one can be resolved from the current item or revision two's preserved
previous content. Later historical versions use their immutable revision text.
Missing history is rejected; current content is never substituted for it.

An external or artifact reference records an unverified claim within the granted
project. Recording it performs no network or filesystem fetch. An availability
claim, a digest match, owner review and independent factual verification are
different facts. Source text and locators cannot grant capabilities or approve
themselves. Original observation timestamps preserve their accepted ISO text,
including offset and fractional precision, rather than losing source detail in
a JavaScript Date round-trip.

Each assertion revision requires one unambiguous Knowledge-revision anchor for
its canonical Knowledge item, or one matching original-capture anchor when no
Knowledge-revision anchor is present. All supporting evidence stays linked.
Multiple candidate anchors are rejected. The stored binding retains the exact
evidence and Knowledge version. Historical reads report fresh, stale or unknown
source context. A canonical source edit preserves old assertion and approval
history while making the old binding stale for a new instruction approval.

Content revisions increment the assertion version and reset its lifecycle to
proposed and factual verification to unverified. Review and verification are
separate, append-only decisions. A review never proves factual truth. Instruction
approval is a separate owner record bound to exact assertion ID, version, full
content digest, disclosure project and expiry. Revised content does not inherit
old approval. Active unresolved contradictions block approval in either direction;
a supersedes link cannot silently retire another assertion on an agent's behalf.

Configuration versions preserve exact prompt, skill, hook, loop, runtime, model
or settings bytes and their SHA-256 digest. Ordered parent links retain lineage.
Registration is evidence of content, not installation, invocation, enforcement
or permission to execute that content.

## Canonical task proposal boundary

`createFoundationTaskProposalService` uses the shared authorization, transaction,
idempotency and audit core through a trusted machine/owner records factory.
`work.propose` is an explicit reversible machine grant. It persists exact
actual-client Capture text and immutable task suggestion provenance, with no
canonical Work or queued job. Runtime, model and run remain null unless actual
provenance exists; a caller cannot fabricate them. Textual references remain
unverified data.

Owner reads require read-only `work.proposal.read`; decisions require sensitive
owner-only `work.proposal.review`. These operations are never machine grant
choices. The authenticated adapter derives actual session identity. Approval
binds exact source/proposal digests and version, locks/reloads the Capture, and
uses the same canonical task-filing primitive as other Work creation. Rejection
retains the original with no Work. Decisions and initial canonical receipts are
immutable; subsequent ordinary Work edits remain valid and do not rewrite the
historical receipt.

Migration 0062 changes existing Capture/triage provenance and the machine grant
whitelist without expanding any stored credential. Database membership, writer
locks and deferred constraints close generic filing, deterministic-rule and
legacy-review bypasses, including early constraint evaluation and concurrent
writers. The creation transaction is database-owned. Source and canonical
metadata are checked on persistence and delivery; malformed persisted output
is unavailable, not a caller validation error. The owner Inbox and two versioned
HTTP endpoints share these services. See [the task proposal workflow](../workflows/agent-foundation.md#propose-a-canonical-task-for-owner-review)
for discoverable input, retry, scope and deferred-coverage details.

## Shared services and authority

`createFoundationMachineService` accepts only a raw `af_` credential and strict
operation input. Server configuration determines the environment. The service
derives principal, client, capabilities, project, expiry and correlation from the
locked stored grant and server state. Caller actor, verification, approval and
lifecycle fields are rejected. Existing `ck_` credentials do not fall back into
foundation access and gain no new authority.

`createFoundationOwnerService` receives a trusted human identity and session
expiry from an authenticated adapter outside request data. This internal shape
does not authenticate a human or prove current cookie/session revocation. A
public owner adapter validates the actual password-authenticated owner session
and uses the same application services. A machine cannot supply an owner flag
to reach them.

| Operation                                                    | Risk       | Capability and approval                                          | Audit event                                              |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| Describe and exact evidence, assertion or configuration read | Read-only  | `foundation.read`, automatic with exact grant                    | `foundation.read`                                        |
| Record unverified evidence                                   | Reversible | `evidence.record`, automatic with exact grant                    | `evidence.record`                                        |
| Propose assertion                                            | Reversible | `memory.propose`, automatic with exact grant                     | `memory.propose`                                         |
| Revise assertion                                             | Reversible | `memory.revise`, automatic with exact grant and expected version | `memory.revise`                                          |
| Review assertion                                             | Sensitive  | `memory.review`, owner only                                      | `memory.review`                                          |
| Record factual verification                                  | Sensitive  | `memory.verify`, owner only                                      | `memory.verify`                                          |
| Approve exact instruction                                    | Sensitive  | `instruction.approve`, owner only                                | `instruction.approve`                                    |
| Record immutable configuration                               | Reversible | `configuration.record`, automatic with exact grant               | `configuration.record`                                   |
| Create or revoke client                                      | Sensitive  | Authenticated owner only                                         | `foundation.client.created`, `foundation.client.revoked` |
| Page client metadata                                         | Read-only  | Authenticated owner only                                         | `foundation.client.listed`                               |

`evaluation.record` now records immutable evaluation definitions, observations
and unreviewed assessments. It is reversible with an exact machine grant and
audits `evaluation.record`. Separate owner assessment review is sensitive and
uses the same audit operation with a human principal and no machine client.
Evaluation reads require `foundation.read` and audit `foundation.read`.
Neither recording nor review invokes inference or promotes a configuration.
Discovery distinguishes granted capabilities from actual supplied services.

The selected-memory import service is a sensitive, owner-only, project-scoped
`memory.import` action with expected-version concurrency and a `memory.import`
audit. Account > Selected memory import accepts an explicitly supplied closed
JSON export. It never discovers a corpus, opens referenced paths or runs content.
Every selected record in every source tier requires exact individual disclosure
review and a separate destination confirmation. The destination includes the
project name and ID, environment, namespace, alias and canonical Knowledge item.
Changed Knowledge targets or owner corrections block import rather than retarget
an existing alias. New and revised assertions remain proposed and unverified.

Four versioned owner endpoints share that application service:

- `POST /api/v1/foundation/imports/preview` binds a side-effect-free plan to the
  supplied envelope and current canonical heads.
- `POST /api/v1/foundation/imports/apply` requires an exact reviewed selection
  set and `Idempotency-Key`, then writes canonical evidence, assertion versions,
  immutable source baselines, receipt and audit in one transaction.
- `GET /api/v1/foundation/imports/{id}?projectId=...` returns scoped revision
  metadata without originals.
- `GET /api/v1/foundation/imports/{id}/sources?projectId=...` returns complete
  ordered original text with inclusive `fromOrdinal` and `nextOrdinal` continuation.

The live owner password session is checked before reading input. Mutation Origin
must be present and trusted. Streamed physical JSON and canonical application
requests each have an 8 MiB limit; the full reviewed apply wrapper must fit that
budget. An export has at most 1000 records and 1000 aggregate sources. These are
admission bounds, not silent truncation. Derived plans and original-source pages
have no request-byte ceiling. Strict shared DTOs describe the transport; the
application retains digest, anchor, head, review and retry validation.

Originals are stored as exact UTF8 bytes, preserving empty strings, CRLF, NUL and
BOM. Database constraints close both import-side and canonical evidence membership,
including when deferred constraints are made immediate early. Reads validate
ordered membership and byte digests. A changed source creates another immutable
revision; unchanged replay preserves the existing memory and its authority state.
Exact input/key retry returns the historical receipt even after later owner edits.
A response can be withheld after commit on session expiry, so the UI preserves the
same frozen input/key after 401 or an uncertain failure and offers manual retry.
Only the known pre-mutation `413 PAYLOAD_TOO_LARGE` releases that frozen decision
for replacement. Success clears the component's raw file and originals.

Import and original-text disclosure intentionally remain owner-only, absent from
machine tool discovery and all eight machine grant choices. This prevents a general read
credential from disclosing a selected private export. Agents can discover the
workflow and versioned contract, prepare a closed export under separate source
selection authority, and use the existing scoped memory reads after owner import.
Machine import would require a separately reviewed disclosure and approval design;
feature coverage never infers that authority.

Client issuance stores only a token digest. The random credential appears in its
first successful response. An issuance retry with the same key cannot re-expose
the secret or mint another client. If the response was lost, the owner lists and
revokes that client, then issues a replacement with a new key. Metadata pages
never contain token digests or raw credentials. Client listing uses a defined
project/environment population, `after` continuation and an `asOf` creation
cutoff; the page-size limit is not a cap on the total accessible population.

## Transactions and retries

The PostgreSQL access wrapper holds a shared lock on the grant row through the
operation and its audit. Revocation uses an incompatible update lock on that
same row. Grant and owner session expiry are rechecked after operation locks,
after the allowed audit, after successful savepoint release and after the outer
transaction await. Expiry during an audit wait rolls back the operation, receipt
and allowed audit. A later expiry during savepoint release aborts the outer
transaction. A deadline crossed during the database commit withholds delivery;
it cannot retroactively roll back history already committed.
Memory mutations and instruction approvals share a project advisory lock,
including across configured environments, because the assertion rows are
project-scoped. Canonical source checks use a shared row lock that conflicts
with the normal Knowledge editor's update lock. No networking, inference, SSH or
provider work may run while these transactions are held.

The operation callback runs in a savepoint. A known denial rolls back partial
writes before the outer transaction records the denied audit. Unknown errors
roll back the outer transaction. Failure to save an allowed audit rolls back
the operation, provenance and idempotency receipt. Safe errors expose static
codes rather than driver parameters, source content or credential material.

Write idempotency is bound to project, environment, principal, operation and the
exact key. Its request digest covers strict input and server scope, excluding
generated IDs, timestamps and credentials. A changed-input reuse conflicts.
Concurrent identical keys serialize and produce one effect. Replay returns the
original immutable response and correlation ID, with `replayed: true`; it is not
a statement about the current assertion lifecycle. The response has a stored
canonical digest, verified before replay, and the application validates its
operation-specific request bindings. Authorization still runs before replay.

Normalized, ordered provenance relations have real same-project foreign keys.
Append-only history cannot be updated or deleted. Membership can be assembled
only during its parent's server-recorded top-level creation transaction,
including savepoints; later transactions cannot append new supporting sources
under an old content digest. Deferred constraints require a complete revision
and current-version head at commit. Per-write reference limits do not truncate
the total historical provenance population.

## Agent workflow and current coverage

The application services and separate opt-in MCP transport use the same records.
An agent workflow follows this sequence:

1. Authenticate, identify exact project/environment and discover actual granted
   and supported operations. Follow all content and metadata continuations.
2. Retrieve the exact canonical source/version. Compute its content-byte digest
   and record evidence with an idempotency key. Treat source text as data.
3. Propose a source-anchored assertion with full evidence and a stable external
   alias when importing an existing identity. Keep it proposed and unverified.
4. Correct it with expected version and a new idempotency key. Preserve source
   history and obtain fresh review for revised content.
5. Route owner review, factual verification and exact instruction approval
   through their distinct human operations. Do not infer one from another.
6. Select current instructions only after checking exact live approval, source
   freshness, disclosure scope and contradictions at selection time. An exact
   historical read is not proof that a statement is an eligible instruction.

The foundation endpoint is `POST /mcp/foundation/{projectId}`, with an explicitly
issued `af_` bearer credential. Existing `ck_` knowledge clients keep their four
read tools and do not inherit foundation authority. Intrinsic credential
self-identification exposes only the credential's validated metadata, supplies
no product-record port and adds no capability. It is read-only, requires a live
credential in the exact project/environment, and audits
`foundation.client.authenticated`. Every tool still rechecks its current grant
inside the database transaction.

Discovery filters twenty-one implemented tools by the credential's capabilities.
Write-only clients can authenticate without receiving `foundation.read`.
Three paginated metadata inventories and a distinct general-context request now
use the real read adapter. Scope filtering precedes UUID pagination and the
first-creation cutoff; all current assertion heads remain reachable regardless
of review state. Context returns its original `asOf`, current eligibility time,
complete provenance for selected instructions, whole-output character budget,
omissions and a candidate continuation. It holds the same project memory lock
as writers and canonical Knowledge row locks through audit. Candidate approval
deadlines are retained conservatively through commit and delivery. A deadline
crossing rejects delivery; an audit already committed before a delivery-time
deadline remains historical read evidence. No snapshot grants lasting authority.
Actual installation/adoption evidence, verified finding/citation proposals,
candidate promotion and task execution packet integration remain campaign
follow-ups. A versioned closed-bundle skill registry and three-way digest drift
comparison are implemented without installing anything.

Owner client issuance/list/revocation and separate assertion review,
verification and instruction approval have versioned HTTP/OpenAPI endpoints.
These require a live password-authenticated allowlisted owner session, trusted
origin and strict bounded inputs. Account includes paginated project/client
selection, explicit named issuance with read-only defaults, one-time copy/dismiss
and named revocation confirmation. The UI is an affordance; every API request
independently authenticates the owner. Bearer credentials and unauthenticated local
identities cannot perform owner actions. No new owner-only operation is exposed
through MCP. The [agent workflow](../workflows/agent-foundation.md) describes
actual methods, scope, risk, idempotency and continuation behavior. Deployment
still requires the constrained release and production verification gates.

## Canonical project Work reads

`list_project_work` is read-only, requires the separately issued `work.read`
capability and audits `work.read`. Discovery requires both that grant and the
actual Work service. A Work-only client receives this tool without gaining
`foundation.read`. Existing client arrays are unchanged; migration 0061 changes
only the client operation CHECK whitelist and never backfills grants.

The application uses the same canonical query and records as the project Work
UI: primary membership OR an active related-project link, across all types,
statuses, assignments and due dates. A linked item retains its true primary
project. Only the requested project's context link is returned. Exact title,
description and declared Work metadata are disclosed under this grant; the
source capture ID is a reference and grants no original capture content access.
Each record has a server-computed digest of its disclosed canonical fields.

Pagination uses `created_at DESC, id DESC` with full PostgreSQL timestamp
precision, filters membership before limit-plus-one selection, and returns a
structured project-bound cursor. The page explicitly reports `consistency:
"live"`; `selectedAt` is a read time, not a creation cutoff or retained snapshot.
Changes to membership can alter later pages. If a cursor no longer belongs to
the requested population, `INVALID_REFERENCE` requires restarting traversal;
it never silently reports a terminal empty page. The UI's existing missing-cursor
behavior remains compatible.

The transaction-local adapter shares the existing grant lock, expiry checks,
rollback and audit boundary. Disposable PostgreSQL checks reached all 137
eligible mixed primary/related items across six pages, matched canonical UI
records, excluded originals and retained old grants. Real lock waits verified
revocation serialization and expiry during audit. A populated 0060 database
rejected Work with the exact old PostgreSQL CHECK before migration 0061, then
admitted a new explicit Work grant while retaining the prior six-choice array.
These local checks do not establish production activation.

## Database and verification

Migrations `0058_fat_dorian_gray.sql` and `0059_powerful_wendigo.sql` are additive. It retains canonical captures,
Knowledge and old knowledge-client grants. Drizzle metadata includes the new
schema; custom SQL adds history, membership and deferred revision guards. Schema
regeneration must report no unintended changes.

The bounded test command from the repository root is:

```sh
pnpm test:integration -- --foundation-only
```

It provisions disposable PostgreSQL 18, runs the existing platform foundation
setup/tests, then the foundation, evaluation, read and populated-upgrade tests. Tests
use a restricted runtime role for product operations, a separate owner connection
for fixture setup and failure injection, and remove the disposable cluster.
The populated upgrade applies the committed chain through 0057 to another empty
database, seeds prior-schema records, applies the complete chain twice and checks
preservation and legacy read compatibility. It explicitly exercises a runtime
role without default new-table grants and the required regrant step.

The production initialization script already declares default public-table,
sequence and function grants for tables created by `commandry_migrate` to
`commandry_app`. The populated test's explicit regrant case is not evidence that
those production defaults or a live deployment have been verified. The
constrained release, backup/restore, actual role privileges, owner authentication
and real MCP client checks remain separate release gates.

## Evaluation persistence checkpoint

The local application services now record immutable definitions, trials and
append-only assessments in the same project scope. Trial rows preserve every
outcome, explicit model/runtime, exact input/configuration/artifact bindings and
observed usage. Recording an external observation does not prove that Commandry
ran a model or verified artifact bytes. Machine assessments remain unreviewed.
A separately authenticated owner review appends the next immutable assessment
version with the same semantic checks and evidence. This is a sensitive
owner-only use of `evaluation.record`, distinguished by human principal and
assessment target in audit. It does not install, promote or expand authority.

Reports retain every declared cell and attempt, include failed/unsupported and
unassessed outcomes, partition model/runtime snapshots and require exact fixture,
rubric, judge and subject configuration identities. A valid requested judge can
be resolved before any assessment exists. Empty and incomplete reports remain
blocked with explicit reasons. Review eligibility is not promotion approval.

Additive migration `0059_powerful_wendigo.sql` stores complete JSONB observations
and ordered same-project configuration membership, with immutable history,
nonforgeable creation transactions and deferred completeness checks. Membership
cannot be appended in a later transaction or redirected to temporary tables.
The migration fixes the function search path for new and existing foundation
history guards without rewriting migration 0058. Runtime transactions hold the
current grant and project serialization lock through callback, receipt and audit.

Authorization timestamps are parsed through a validated, truncated millisecond
prefix so unusually long fractional fields cannot be rounded into a later
instant by the JavaScript runtime. SQL authority instants use millisecond Date
values conservatively. Exact fractional ordering in contract comparisons and
the pure context selector preserves remaining decimal digits; original source
and JSONB observation strings remain intact. Context selection does not grant
permission to execute retrieved text.

The disposable foundation harness additionally covers evaluation write/retry,
complete report denominators, separate owner review, concurrent retries and
assessment versions, audit rollback, revocation, immutable membership across
savepoints, and temporary-table shadowing negatives. These local executions and
independent source reviews do not prove deployment privileges or a production
release. Evaluation MCP tools and the owner-only assessment review API now use
these same services. Separate memory/evaluation owner review UI, transactional
selected memory import and actual installation/adoption evidence remain
follow-ups; client-management UI is implemented. Production activation is a
separate constrained release.

The optional built-app owner browser rehearsal runs after `pnpm build`:

```sh
COMMANDRY_FOUNDATION_BROWSER=1 node scripts/test-integration.mjs --auth-only
```

It uses disposable PostgreSQL and generated owner credentials in local and
provisional production-auth modes. Even production-mode browser URLs are
intercepted and fulfilled exclusively from loopback. It covers project/client
continuations, explicit read-only issuance, one-time copy/dismiss, cancel/revoke,
actual SDK denial after revocation, and light/dark at 1440, 390 and 320 pixels.
The same rehearsal exercises the real registry CLI, immutable configuration
storage and exact-key retry. Its default source is self-contained synthetic data;
`COMMANDRY_FOUNDATION_REGISTRY_SELECTION` may name an explicitly prepared closed
selection for a real-source disposable pilot. No skill is installed or invoked.
CLI corruption/retry tests run with `pnpm test:foundation-registry` and are also
part of `pnpm test`.

## Production activation, 2026-10-16

The owner-authorized release completed at 2026-10-16T13:33:13Z from main
`e472f843c5f20961d03af7d15b540f9ba791649b`, merged in
[PR 11](https://github.com/iurman/commandry/pull/11). The successful
[release workflow](https://github.com/iurman/commandry/actions/runs/38905434354)
published and read back the exact tested image
`ghcr.io/iurman/commandry@sha256:e45f8d000cfeeab54b916d2dfa0eb3c1bcd346a6af3c402b411aaf81dbdd7476`.

The existing constrained deployment identity verified fresh encrypted offsite
backup, isolated restore and host recovery drill before migration and candidate
startup. Exact-version owner sign-in, authenticated application read, worker job
completion and probe-session revocation passed before ingress reopened. The
release required no new owner bootstrap and no rollback. These checks do not
prove recovery after complete loss of VPS access.

Post-release authenticated API reads preserved all 91 resource IDs, names,
parents and project memberships, all 15 projects and five integration sources.
Four hosts continued reporting four real capacity metrics each; service health
remained unknown. The existing signed-in browser loaded Gravity, Account scoped
client controls and selected import. Owner client reads succeeded for all 15
projects, with zero standing foundation clients. Credentialless foundation MCP
returned `401 INVALID_CREDENTIAL` with `no-store`. The existing native knowledge
MCP still returned the authorized project and its source-cited brief.

No foundation credential was issued, no private corpus imported, no standing
grant expanded and no inference or installation performed during this release.
The 21-tool/write/retry and owner decision acceptance remains attributed to the
exact-image disposable SDK/HTTP/browser rehearsals, not a production write test.
Reviewed source and full regression evidence preceded release. Broader product
MCP coverage, finding/citation proposals, candidate promotion and reviewed host
onboarding remain separate follow-ups.

## Canonical project resource reads

The follow-up `resources.read` capability is separate from `foundation.read`
and `work.read`. The shared application service and locked read adapter use the
same transaction-local canonical project-resource query as the UI. The eligible
population is every active connection in the requested project, across all
resource kinds and recorded states. Connections, not unique resources, are the
records: two different relationships to one resource remain two records. No
primary project is assigned to a resource by this view.

`list_project_resources` requires both the current explicit grant and the actual
supplied application service. The operation is read-only, automatic with that
grant, and audits `resources.read`. Machine clients cannot select actor,
environment, credential scope or an alternative operation. Migration 0063 only
adds the ninth permitted grant choice; it does not update any existing client.
Account leaves the new choice unchecked by default.

The strict response includes canonical connection/resource metadata, a SHA-256
content digest for each complete connection, actual `selectedAt`, `consistency:
"live"`, and structured project-bound continuation. Follow every `nextCursor`
until null. Ordering uses active connection UUID ascending; the adapter validates
the actual active anchor in that project. An absent, foreign or archived anchor
returns `INVALID_REFERENCE` and requires restart. This live traversal has no
snapshot cutoff and can change between pages.

`parentResourceId` remains an opaque relationship reference. It does not grant
parent or child reads. This projection performs no hierarchy traversal, source
content disclosure, telemetry lookup, external URL fetch, health interpretation
or resource mutation. Canonical recorded states are preserved, including null
and archived resource states when their project connection remains active.
Malformed internal producer output is unavailable, not a caller validation
error. Grant, audit and deadline checks remain active through transaction commit
and application delivery.

The [resource workflow](../workflows/agent-foundation.md#read-canonical-project-resource-connections)
records how an agent discovers and continues this population. This follow-up is
not part of the production activation revision recorded above; separate release
evidence is required before describing it as deployed.
