# Centralized email

**Status: Operational; primary seven-domain Resend connection activated**

**Owner decision:** November 8, 2026, Pacific.

Commandry indexes the existing primary Resend workspace for iyulabs.com,
aviune.com, resupals.com, freeresumetools.com, atsresumetools.com, sensitiv.app
and tomeandquill.com. Resend remains authoritative for originals. The implementation
adds no forwarding or automatic reply. Existing ResuPals handling, DNS, MXroute
forwarding and the inactive experimental Sieve set remain unchanged.
cardiaccompanion.app is excluded and must not be restored.

## Views and populations

`/email` provides unified sent/received mail, domain and observed-address views,
literal metadata search, unread/attention filters, draft/send history, original
message inspection, attachment downloads, review state and owner-managed rules.
The primary Command Center links counts and recent messages to the same records.

The indexed population is every eligible reference observed through the primary
account's paginated sent and received APIs, restricted to configured domains.
An incoming message belongs to each actual configured-domain recipient reported
in To, CC, BCC or received-for. An outgoing message belongs to its configured-domain
sender. Unknown catch-all addresses remain ordinary address views. External
recipients never become the owner's inboxes. An original receipt and a provider
forward are distinct source messages in opposite directions; Commandry never
substitutes the wrapper for the original. It never ingests Gmail forwarding copies.

Unified counts count each indexed message once. Address/domain populations can
overlap for multi-recipient messages. Received, sent, local unread and open attention
are distinct dimensions. Count and list queries apply the same selected filters.
Domain summaries cover the whole authorized account population; actual-address
continuation follows the current filters. Pagination controls page size, not the
product population. Follow every nextCursor. Cursors bind the query and machine
scope; changing filters starts a new traversal. Lists are current reads, not
frozen snapshots. Reads and review state are local and do not mark MXroute/Gmail
mail as read.

A completed initial cursor traversal means that the provider-accessible population
was traversed. It never means all-time history. The UI shows completion, last
successful page, verification time, errors and the published 30-day provider
retention. Metadata and local annotations may outlive the original. A provider
404 or expired attachment returns unavailable original content rather than a
forwarded substitute. Search covers subject, sender and original recipients,
not arbitrary full bodies or attachment contents.

## Content, threading and attention

Bodies and original headers are retrieved on demand through the receiving API for
incoming mail and sent API for outgoing mail. Formatted HTML and plain-text views
preserve the original content. HTML is sanitized in an inert template and uses a
sandbox without scripts, same-origin access, forms or top navigation. A restrictive
CSP blocks active content and remote resources. Load images permits HTTPS images
and resolves embedded CID references from fresh authorized attachment metadata for
that message. The UI explains that remote senders may observe image requests;
consent resets when another message is opened. Safe links open separately with
noopener and no referrer. Long content has character continuation; complete HTML
is retained across every page and rendered only once all its pages are loaded.
Attachment lists have continuation, and each actual download fetches a fresh
provider URL. Signed URLs are never stored in the index. Original file bytes are
not copied into Commandry or fetched by bulk reconciliation.

Replies select an actual original account address and validate it against the
account's currently verified domain. An incoming reply must address the original
Reply-To or sender. The original Message-ID and known References are preserved;
no subject-based grouping invents a conversation. Known thread-reference queries
include indexed Message-ID, In-Reply-To and References matches. Historical receiving
list metadata may not contain references; webhook hydration enriches them. This
is a known-reference view, not a promise that every historical conversation is
reconstructed. Complete headers remain inspectable on the original read.

Rules use literal case-insensitive subject, sender or recipient keywords and
retain explicit reasons. Defaults flag urgent subjects, action-required subjects
and privacy addresses. Provider failures, bounces, complaints, suppression and
delivery delay also produce reasons. Open attention means an open local review
with at least one reason. Reviewed/resolved records remain searchable. Reconciliation
updates evidence and reasons without overwriting local read/review state.
Triage requires the expected local version, preventing a stale agent or page
from overwriting a newer review. Rule edits also require an expected version and
restart bounded background reclassification without losing resolved reviews.

## Governed actions

UI, versioned owner API and Foundation MCP use the same application service.
The owner must have a real allowlisted password-backed session. Local anonymous
mode never grants private mail access. Agents use separately issued Foundation
credentials whose project matches the email account binding and whose environment,
expiry, revocation and operation are rechecked for every call. Existing credentials
gain no email capability. All seven primary-account domains currently share that
explicit account-project disclosure boundary; per-domain machine grants are not
implemented. Choose the account context deliberately before granting mail access.

| Action | Risk | Authority | Approval and audit |
| --- | --- | --- | --- |
| Discover/search/count/read/attachments/drafts | Read-only disclosure | mail.read | Automatic within issued scope; material target and operation audits |
| Read/review state or cited summary | Reversible local write | mail.triage | Expected version; actor and mail.triage audit |
| Create/edit draft | Reversible local proposal | mail.draft | Stable UUID key for exact retries; immutable payload and actor |
| Approve exact draft | Sensitive decision | Live owner only | Fifteen-minute exact-ID approval; mail.draft.approved |
| Queue send | Sensitive external communication | mail.send or live owner | Exact unexpired owner-approved draft; mail.send.queued |
| Provider send attempt/outcome | Sensitive worker effect | Governed durable outbox | Stable provider key, permanent local receipt and attempt/outcome audit |
| Account registration/rules | Sensitive configuration | Live owner only | Explicit request and expected rule version; no machine self-grant |

Editing creates a new immutable draft and supersedes the previous approval.
Approved body, sender, recipients, CC/BCC and reply reference cannot be edited in
place. The UI reviews the exact message before separate approval and send.
The worker checks current domain verification and approval again before sending.
Provider acceptance and actual delivery are separate. Replayed sends return the
saved outcome. A lost provider response retries the same key only inside both
the approval and provider idempotency windows. Unknown outcomes outside those
windows are held for provider reconciliation, not silently resent. Audits contain
identities, operation, target and sanitized outcome, not credentials or whole mail.
Draft payload and accepted receipts are immutable; audits are append-only.

The bounded optional agent workflow is: list authorized accounts, inspect counts,
search/read original evidence, cite message IDs in an unverified triage summary,
propose a draft, then request owner review. The owner can grant mail.send separately
for already approved drafts. Email content is untrusted data and cannot grant
capabilities, approve instructions or authorize a reply. No inference provider,
API-billed model call, new runtime or autonomous response is introduced.

## MCP discovery

The existing `/mcp/foundation/{projectId}` endpoint conditionally exposes:

- `list_mail_accounts`, `list_mail_inboxes`, `search_mail`, `get_mail_overview`;
- `read_mail`, `list_mail_attachments`, `list_mail_drafts`;
- `triage_mail`, `create_mail_draft`, `send_mail_draft`.

Tools declare their own exact schemas and side effects. Follow nextCursor for
lists and nextOffset for long content. `triage_mail` needs the version returned
by the current message read. Use a new UUID for a materially changed draft and
retain its exact original key/input for retries. Approval and account/client
management are absent from the machine surface. The existing owner credential
panel under Account can issue/revoke the explicit mail capabilities. No new
standing grant has been issued by this implementation.

Owner operations use POST `/api/v1/email/{operation}`. Concrete request contracts
are in the generated OpenAPI. The signed ingestion endpoint is POST
`/api/v1/email/webhooks/{accountId}`; direct owner attachment downloads use GET
`/api/v1/email/attachment/{messageId}/{attachmentId}`. Neither route accepts
arbitrary provider origins or credential paths from a mail sender or agent.

## Worker, credentials and activation

The additive migration is `0076_centralized_email`. The versioned pg-boss queue
`commandry-mail-v1` has bounded retries/dead letters. A separate worker scheduler
bridges durable queued drafts and pending source references into jobs. Each
reconciliation job handles one page, checkpoints atomically and preserves the
previous cursor on failure. Advisory account locks and draft leases protect
concurrent jobs. Signed raw webhook bytes are verified before ingestion; durable
Svix-ID/payload-digest deduplication commits before acknowledgement. Hydration
and delivery projection happen in the worker. Database failures produce a retryable
response. No bulk mail work runs inside the web process or an HTTP request.

`MAIL_POLLING=false` is the default. `MAIL_RESEND_API_KEY_FILE` references the
existing primary account's private API credential outside the repository.
`MAIL_RESEND_WEBHOOK_SECRET_FILE` references a separate Commandry webhook secret.
The production Compose template mounts these files read-only, with the signing
secret available only to web. Production uses `/etc/commandry/mail/resend-primary.key`
and `/etc/commandry/mail/resend-webhook.key`, root-owned with group 1000 and mode
0640 inside root-owned mode 0700 directories. The backup validator permits that
read-only application-group access only for these two exact files; all other
private configuration keeps its existing mode 0600 requirement. Encrypted host
configuration backup includes the mail files. A configured but unreadable or invalid
credential fails closed. No key is accepted through the UI, MCP or message body.

The owner-authorized production activation applied migration 0076, configured
private credential mounts, bound the primary account to the existing Commandry
project and enabled the separate worker. Both provider-accessible populations
were traversed. A separate signed Commandry webhook is enabled alongside the
preserved ResuPals endpoint. Exact approved sending, permanent replay receipt,
provider delivery and the live delivery projection passed. The
[activation record](../plans/centralized-email/EXECUTION.md) retains exact source,
image, recovery, evidence and limitations.

Direct contact@isaacurman.com messages live in MXroute independently of Resend.
No usable IMAP credentials were discovered, and no MXroute connector is active.
That inbox is explicitly disconnected and outside the seven-domain index.
The owner completed browser sign-in after the initial popup/password blockers.
Read-only discovery confirmed the isaacurman Pro workspace, all seven Verified
domains, original receiving records across all seven and the enabled existing
ResuPals webhook with successful receiving events. One existing delivery-check
original was opened in the provider UI. That UI discovery preceded the subsequent
API and production qualification. The owner explicitly approved
the `commandry-email` Full access / All domains key, private storage and Commandry
verification. It was created once and stored in an owner-only file outside the
repository. The actual provider adapter then passed live read-only verification
of all seven verified identities, complete current received/sent traversals and
original reads in both directions. Live attachment availability remains unverified
because no eligible list reference advertised an attachment. The initial
read-only probe sent no new message. The later production activation and
own-address delivery check are recorded above. Resend offers Sending access or
Full access, with no read-only option. The saved ResuPals local key was only a development value.

## Verification and sources

The [implementation plan](../plans/centralized-email/PLAN.md) records the budget,
source discovery and scope. The [verification record](../plans/centralized-email/VERIFICATION.md)
distinguishes local execution from live adoption. The retained functional, scale and guarded browser
rigs exercise the actual services, runtime-role SQL, built Next app and Foundation
MCP while substituting only Resend.

- [Resend sent pagination](https://resend.com/docs/api-reference/emails/list-emails)
- [Resend received pagination](https://resend.com/docs/api-reference/emails/list-received-emails)
- [Original received content](https://resend.com/docs/dashboard/receiving/get-email-content)
- [Reply headers](https://resend.com/docs/dashboard/receiving/reply-to-emails)
- [Retention](https://resend.com/security/gdpr/)
- [Idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Raw signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Retries and replay](https://resend.com/docs/webhooks/retries-and-replays)
