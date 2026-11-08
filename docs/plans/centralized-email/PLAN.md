# Centralized email implementation

**Status: Operational plan, source implementation complete; live activation pending**

**Owner authorization:** November 8, 2026, Pacific. Unified and individual inboxes,
dashboard summaries, original messages and attachments, compose/reply, attention
triage and scoped agent access are authorized. Production activation, new account
access grants and unrelated infrastructure changes retain their existing gates.

## Source discovery and preservation

Resend primary workspace isaacurman owns sending and receiving for iyulabs.com,
aviune.com, resupals.com, freeresumetools.com, atsresumetools.com, sensitiv.app and
tomeandquill.com. Providers remain authoritative. Preserve the existing ResuPals
webhook, support/privacy/hello behavior, MXroute provider forwarding and Gmail
copies. Never restore cardiaccompanion.app or activate the experimental Sieve set.
Direct contact@isaacurman.com mail lives at witcher.mxrouting.net independently.
The saved ResuPals local key is an unusable short development value. No reusable
Resend or MXroute API/mailbox credential was found in Commandry credential refs.
The owner completed browser sign-in. Live read-only discovery confirmed the
isaacurman Pro workspace, all seven Verified domains, original receiving records
for all seven domains and the enabled existing ResuPals webhook. The prepared
`commandry-email` Full access / All domains key was explicitly approved by the
owner, created once and stored in an owner-only file outside the repository.
After popup recovery, the actual Commandry provider adapter passed read-only
live qualification: all seven verified identities, complete current sent/received
traversals and original reads in both directions. No eligible list reference
advertised an attachment. No send or production activation was performed.

## Smallest complete implementation

1. Commit this plan and ADR 0020. Add strict email contracts and domain policies.
2. Add an additive metadata index, recipients, rules, immutable versioned drafts,
   exact owner approvals, audits, provider cursors and durable worker outbox.
3. Implement Resend REST pagination, receiving-specific reads, attachments,
   verified-domain identity validation, signed webhook ingestion and reconciliation.
   Index only metadata. Never backfill bodies or attachments in web requests.
4. Add authenticated unified/domain/address email views, sent/received/unread/
   attention drill-downs, explicit coverage/freshness, message/thread/attachment
   inspection, rule controls, review/resolved state, compose/reply and owner send.
   Add a linked summary/recent activity card to the primary dashboard.
5. Extend the existing Foundation MCP with separate mail.read, mail.triage,
   mail.draft and mail.send grants. Account project binding defines machine scope.
   Owner UI scope never transfers to agents. Agent sends require the exact owner
   approved draft. Optional agent summaries are cited, unverified annotations;
   no inference runtime, autonomous replies or permission promotion is introduced.
6. Verify provider/security/failure/replay and cross-domain identity journeys,
   actual disposable PostgreSQL counts/pagination/concurrency, representative
   index scale and shared-web latency, MCP parity and guarded desktop/mobile
   light/dark interactions. Commit/push verified milestones and prepare a PR.

## Scale and budgets, before sync implementation

Design qualification population: 100,000 message references, average 2 KiB indexed
metadata plus about 2 KiB indexes/recipient rows = about 400 MiB total PostgreSQL.
At an illustrative 100 KiB average body and 20% 2 MiB attachments, copying mail
would require about 50 GiB; this implementation copies neither. One 100-row
provider page is at most 2 MiB response, one account page at a time, one worker
job per account/direction. Two directions share bounded scheduling and the
provider rate budget. A full scan is 1,000 pages, not one HTTP request. Background
jobs checkpoint each page, retry transient failures and show incomplete coverage.
Reconciliation restarts at the head after each complete cursor pass. Web reads
are paginated SQL or one on-demand bounded provider read, never a sync loop.
Attachment downloads use fresh provider URLs, never persistent signed URLs.
Measure actual database size, worker RSS/CPU and concurrent web read p50/p95;
record fixture versus live evidence separately. Reduce concurrency if page
latency regresses materially. This is a qualification envelope, not measured
production volume or a claim of complete history.

## Provider limitations and sources

- [Sent list](https://resend.com/docs/api-reference/emails/list-emails): cursor pagination.
- [Received list](https://resend.com/docs/api-reference/emails/list-received-emails): separate population.
- [Original content](https://resend.com/docs/dashboard/receiving/get-email-content): metadata-only webhooks.
- [Retention](https://resend.com/security/gdpr/): published Free/Pro/Scale retention is 30 days.
- [Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys): provider keys expire after 24 hours.
- [Signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests): exact raw bytes.
- [Retries](https://resend.com/docs/webhooks/retries-and-replays): retries and manual replays require deduplication.

Historical coverage is the indexed provider-accessible window, never all-time.
Expired original bodies/attachments must return unavailable while preserving
metadata and annotations. MXroute needs an independently authenticated IMAP
connector; absence of mailbox credentials must not make the seven-domain index
look complete for direct owner mail. SMTP/MXroute writes stay unavailable until
that connector and authority are verified. No external test mail is needed for
fixture qualification. Authorized owner recipients can be used only for a
labeled delivery check after provider access exists.

## Completion evidence

The [verification record](VERIFICATION.md) records executed checks, measured scale, fixes, retained test rigs and the separate live connection/release gaps. Current main was merged normally to preserve the November 7 public site and `/app` dashboard cutover.
