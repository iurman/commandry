# ADR 0020: Index provider email with governed actions

**Status:** Accepted; owner-authorized implementation and release

**Date:** 2026-11-08

## Context and authority

The owner requested centralized mail across seven consolidated Resend domains,
unified and per-address views, dashboard attention and agent access on November
8. This is an explicit product decision within ADRs 0001, 0004 and 0010-0012.
The owner subsequently authorized merge and production activation on November 8.
This does not grant broader machine authority or remove release qualification,
recovery, identity and exact-draft action checks.

## Decision

Keep providers authoritative for original message bodies and attachments. Store a
minimal searchable metadata index, original addressing, provider references,
local read/review state and derived attention reasons separately. Use real
pagination and disclose provider retention, incomplete history and sync errors.
Use a separate pg-boss worker for bounded reconciliation, signed event hydration
and durable sending. A web request never runs a bulk sync or downloads a mailbox.

Map the account/domain/address to a resource reference; counts to derived metrics;
provider receipt/delivery observations to events; attention reasons to alerts;
and drafts/triage/send to governed actions. These are email projections, not
claims of infrastructure health or duplicate canonical resources. Account project
binding provides the machine disclosure boundary. The owner can see all accounts;
each machine rechecks its current Foundation grant, project and environment on
every operation, with atomic audit. Existing grants gain no email operations.

mail.read is read-only disclosure. mail.triage and mail.draft are reversible
local annotations/proposals. mail.send is sensitive and queues only a specific
immutable draft version approved by the live owner with a short expiry. Edits
create a new draft and invalidate prior approval by identity. The worker records
provider acceptance separately from delivery, uses a permanent local receipt and
one stable provider idempotency key, and refuses automatic ambiguous retries
outside the provider 24-hour window. Exact action, actor, approval and sanitized
outcome are audited without credentials or full message content.

The bounded optional agent workflow is explicit MCP read, cited unverified
summary/triage, draft, owner review and approved send. Email content is untrusted
data. No model call, inference billing, autonomous reply or new runtime is added.

Keep existing forwarding, DNS and ResuPals behavior intact. Commandry receives an
additional independent webhook only during authorized activation, or polls through
the same index services. No duplicate forwards or auto acknowledgements.
MXroute remains a separately authenticated connector; label it disconnected when
credentials are unavailable rather than indexing forwarded Gmail wrappers.

## Consequences and alternatives

Originals can expire at the provider. The metadata index is not an archive and
must not promise complete history. A later archive or IMAP adoption needs explicit
scope, capacity and retention decisions. Full body/attachment copying, proxying
Gmail forwards as canonical, reusing UI sessions as machine grants and autonomous
agent replies were rejected. New DDL remains held for the normal release review.

See the [implementation plan](../plans/centralized-email/PLAN.md) for source
verification, scale budgets, tests and operational gaps.


## Direct mailbox extension, November 8, 2026

The owner explicitly requested direct MXroute connection and available-folder
backfill, then supplied the existing1Password source after the independent release.
Adopt read-only IMAP using stable mailbox/UIDVALIDITY/UID references and separate
worker checkpoints, retaining providers as the original-content authority. A
bounded single-message MIME read or single attachment stream is permitted on
explicit authorized demand; it writes no archive and never performs bulk sync.
No SMTP action is added. Existing mail.read/triage and account/project audit
boundaries apply; direct-account draft/approve/send are refused. The
[adoption plan](../plans/centralized-email/MXROUTE.md) defines exact budgets,
credential/migration controls, remote read-only behavior and verification.
