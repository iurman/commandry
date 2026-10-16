# Agent foundation

**Status: Operational local implementation. Not production activation.**

This document describes the shared application and PostgreSQL foundation on the
agent-memory campaign branch. It does not claim new public MCP tools, credential
issuance routes, memory import, evaluation execution or deployment. The existing
[knowledge MCP](knowledge-mcp.md) retains its four read tools and existing scope.
The approved [campaign plan](../plans/agent-memory-mcp-foundation/PLAN.md) tracks
the dependent transport, import, registry and evaluation work.

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
future public owner adapter must validate the actual owner session and use the
same application services. A machine cannot supply an owner flag to reach them.

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

`evaluation.record` is a reserved contract capability. This slice does not
implement an evaluation writer or advertise it as an implemented operation.
Discovery must distinguish granted capabilities from actual supported services.

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
same row. Grant expiry is rechecked after waiting and before operation return.
Owner session expiry is rechecked after operation locks and before return.
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

The current services are internal application APIs. A future MCP or UI adapter
must follow this sequence using the same records:

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

Public foundation MCP transport, owner credential/review controls and working
context selection are intentionally deferred to campaign workstream 2. The
reason is to integrate actual authenticated transport/session validation and
complete discovery with the tested services, rather than activate an internal
trusted identity as a public request parameter. Follow-up must add the versioned
HTTP/OpenAPI contract, discoverable MCP tools and workflows, UI controls and a
real built-server client rehearsal before claiming feature access is complete.
No new owner-only operation may be exposed through a machine tool dispatcher.

## Database and verification

Migration `0058_fat_dorian_gray.sql` is additive. It retains canonical captures,
Knowledge and old knowledge-client grants. Drizzle metadata includes the new
schema; custom SQL adds history, membership and deferred revision guards. Schema
regeneration must report no unintended changes.

The bounded test command from the repository root is:

```sh
pnpm test:integration -- --foundation-only
```

It provisions disposable PostgreSQL 18, runs the existing platform foundation
setup/tests, then the foundation repository and populated-upgrade tests. Tests
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
