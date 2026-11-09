# Direct MXroute mailbox adoption

**Status: Operational plan; implementation and activation in progress**

Owner authorization: November 8, 2026, Pacific. Connect the existing direct
contact@isaacurman.com mailbox, backfill all available folders and verify original
rendering/images after the independent Resend rendering release is live. That
release is confirmed as1b41fb8. The owner identified1Password; its existing mailbox
credential authenticated to witcher.mxrouting.net:993 with certificate validation.
Read-only discovery found403 INBOX messages and six selectable folders. The
credential stays outside Git; no new password, forward, DNS or test send is needed.

## Source and scope

MXroute remains authoritative. Index envelope metadata plus mailbox path,
UIDVALIDITY and UID, deriving a stable provider UUID from that tuple. Preserve
existing Resend IDs and all source folders, including Junk/Trash/Drafts; Sent is
a separate direction. Folder names remain visible. Local read/review state does
not change IMAP flags. EXAMINE and BODY.PEEK reads only. Reject stale UIDVALIDITY
instead of returning a different message after a mailbox reset. Source-deleted
originals retain metadata and report unavailable. No mailbox body/archive copy.

Use existing owner/account/project and mail.read/triage boundaries. Register a
separate mxroute account through the owner service; no new standing agent grant.
Direct SMTP sending stays unavailable. Draft/approve/send must fail closed for
this account and the UI labels it read-only. Existing Resend sending is preserved.

## Bounds and capacity

Qualification envelope remains100,000 references at roughly4KiB indexed each,
about400MiB database including indexes. IMAP reconciliation runs only in the
separate worker, one folder/100-UID window per job with a durable checkpoint.
At most100 envelopes/body structures are fetched per window, never body parts.
A snapshot upper UID bounds a pass; expunged holes do not skip later UIDs and new
arrivals are read on the next five-minute pass. Folder removal/reset restarts its
scan while old originals remain explicitly unavailable. Cursor columns become
text while existing UUID values and all message identities remain valid.

On-demand original reads select only text/plain and text/html MIME parts, each
bounded to2MiB, with decoded size checked and an operation deadline. IMAP has no
provider HTTPS attachment URLs. A single owner-authorized attachment read may
stream its selected decoded MIME part through the existing authenticated route,
with a20MiB limit, two active transfers per process, timeout/cancellation cleanup,
no file write/cache and no archive. Inline images require per-message consent and
serve only raster MIME types; other types download with nosniff, sandbox CSP and
attachment disposition. Max streaming memory is bounded by stream buffers, not
mailbox size. Bulk sync never enters a web request. Measure100k background index
work and concurrent web latency/RSS using the existing scale rig; verify real
folder/index parity and all modes after activation.

## Verification and rollout

Exercise multi-folder pagination, sparse UIDs, UIDVALIDITY changes, body charset/
transfer decoding, MIME structure/attachments/CID, read-only behavior, credential
failure, read-only action policy, permission scope, retries and transfer cleanup.
Retain local isolated database/worker/browser evidence and live counts separately.
Generate/review the additive provider constraint and cursor migration, preserve
baseline identities, pass hooks/required CI, normally merge and qualify main.
Install reviewed key mount/backup allowlist with rollback, fresh recovery and
migration gates. Register the new account only after the new worker is active.
Verify complete available metadata reconciliation, actual originals/images,
read-only remote flags, preserved routing/services/grants, and revoke temporary
verification sessions. No claim of permanent archive or complete lost-VPS recovery.

Sources: [MXroute settings](https://docs.mxroute.com/docs/quick-setup.html),
[ImapFlow client](https://imapflow.com/docs/api/imapflow-client/).


## Local evidence, November 8

The real TLS adapter traversed407 received references (403 INBOX, four Trash)
and one Sent reference. Other selectable folders were empty. Three actual
originals were read without changing source seen flags; no message was sent.
Original body bytes were not persisted. The direct credential is the existing
owner1Password entry, privately stored outside the repository.

A synthetic100,000-reference run exercised the actual direct adapter,
application/SQL repository and separate worker, substituting only the external
IMAP client transport. It completed1,000 pages in28.0s, reading zero original or
attachment bytes. Database usage was133,128,192 bytes, worker peak RSS353,349,632
and concurrent web peak RSS306,966,528. Concurrent ordinary web reads994, loaded
p95 5.62ms versus baseline p95 13.70ms. This local stress bound does not measure
MXroute network throughput or VPS capacity. Real runtime-role SQL verifies direct
account/cursor persistence, source-seen initial local state, owner stream reads,
other-project denial and direct-account draft refusal while preserving Resend.

The first built journey exposed a missing direct worker runtime dependency;
`imapflow` is now pinned in the worker's external dependency set as well as the
platform adapter. Original failure evidence is retained and the entire guarded four-mode
owner/database/separate-worker/MCP journey passed after the fix. Thirteen affected
unit/component tests pass, including authenticated CID consent/credential-origin
controls. Production activation remains pending qualification and0077.
