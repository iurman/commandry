# Centralized email production activation

**Status: Operational; primary seven-domain Resend connection activated**

**Date:** November 8, 2026, UTC.

## Released source and preserved state

[PR 62](https://github.com/iurman/commandry/pull/62) merged normally as
`ebaa2c9be2fde84a76dba4035771a9bfd6fb120c`, retaining both prior main `b3eaf25`
and reviewed feature head `dc151ff`. Branch qualification
[42527269117](https://github.com/iurman/commandry/actions/runs/42527269117)
passed. Main [42528495916 attempt 2](https://github.com/iurman/commandry/actions/runs/42528495916/attempts/2)
passed all twelve jobs and published the exact tested image:

`ghcr.io/iurman/commandry@sha256:2f99657e954c55cdf57d1caf4af9f5f4f1b7e7417b204d47630c3d40fabb1ec9`

The trusted `github-actions[bot]` digest receipt matched that run and attempt.
The rolling controller confirmed the release at `2026-11-08T22:49:13Z` on `web`,
retaining `b3eaf25` on `web_next`. Fresh encrypted offsite recovery, owner login,
protected reads, actual separate-worker completion and traffic confirmation
passed. The public homepage, private `/app`, database volume/cluster, Caddy,
Tunnel and unrelated service were preserved.

Reviewed additive migration 0076 produced 77 migration journal entries and six
mail tables. All 134 resource IDs/parents, 15 project IDs, 93 project-resource
binding rows and three existing clients' scopes/operations exactly matched the
pre-migration baseline. Only the four reviewed changed host controls were installed:
Compose, the example environment and the two backup permission modules. The live
generated Caddyfile was preserved. No DNS or forwarding configuration changed.

Private read-only credential mounts are root-owned, application-group-readable
files under owner-restricted configuration directories. The narrow backup
permission rule admits only the two named mail credential files. Automatic
selection was paused under the deployment lock for migration, then restored to
its previously enabled state with the reviewed source fingerprints.

## Actual provider and delivery checks

The existing isaacurman Resend workspace verified iyulabs.com, aviune.com,
resupals.com, freeresumetools.com, atsresumetools.com, sensitiv.app and
tomeandquill.com. The real owner registered its one primary account to the
existing Commandry project. The real worker completed both initial traversals:
62 received and 82 sent references, 16 observed addresses and seven domain
summaries. Paginated list counts matched the overview. One existing original
returned actual provider text and 17 headers; its attachment list was empty.

A separate enabled Commandry webhook accepts receiving and delivery events. The
existing ResuPals webhook's endpoint, enabled status and event subscriptions
matched the pre-change baseline. Its existing forwarding, support/privacy/hello
handling, MXroute forwarding and inactive Sieve set remain intact. The actual
signing secret was written into its mounted file without replacing the inode.

One routine own-address verification draft was exercised through the real owner
API. Sending before approval was rejected. Exact approval queued the immutable
draft, the actual worker obtained a provider acceptance receipt, and repeating
the send returned the same permanent receipt. Resend reported delivered; the
signed provider event was hydrated into Commandry with delivered status. The
resulting population was 62 received and 83 sent references. Gmail visibly
received the forwarded verification message in Spam. Delivery does not establish
Inbox placement, and no Gmail filtering change was made.

An encrypted post-activation backup, readback, isolated database/web restore and
host role/configuration recovery passed after installing the actual signing
secret and indexing the real account. Snapshot:

`eaa6441e12548170922f1369410bd04c0ff0a6b9cb900146549fbd4a78c01a2f`

The host drill extracted configuration and applied roles in isolation; it did
not install restored configuration or prove recovery after losing VPS access.

## Corrections and retained failures

Qualification corrected a stale migration audit, shared single-account fixtures,
standalone asset-link preparation and two browser readiness waits. Their original
failures remain in the private QA evidence. A main inventory browser check timed
out while a scene request was pending after rapid outline expansion. The unchanged
test passed locally on desktop and both phone sizes; the complete main workflow
was rerun with all assertions and all twelve jobs retained. No per-test retry,
new skip or gate bypass was introduced.

The first rolling activation rejected its recovery check and rolled back before
touching the worker. The complete official new-image recovery gate then passed.
Only that exact qualified candidate hold was released under the deployment lock.
The normal controller repeated every gate and confirmed the release in 219.274
seconds. Both failed and successful records are retained; no specific underlying
cause was established for the initial recovery failure.

Live desktop/phone interactions and light/dark screenshots worked, but exposed a
hydration mismatch absent from direct local qualification. Public HTML showed
Cloudflare replacing the explanatory mailbox address with its email-protection
anchor before React loaded. A separate diagnostic ruled out the device-status
portal. The explanation now names direct owner mail without placing a literal
mailbox address in initial HTML. This avoids the rewrite while retaining the
explicit MXroute disconnection. Cloudflare documents its
[email-rewriting behavior](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/).
Final public DOM, browser and scoped MCP receipts are retained in the QA ledger
and the [PR 62 release closure](https://github.com/iurman/commandry/pull/62).

## Evidence, cleanup and limits

Sanitized account, send, webhook and browser receipts remain under the task's
ignored `.agent` evidence. Full API keys, signing secrets, owner credentials and
session cookies stay outside Git. Runtime evidence includes the exact main
qualification and digest receipt, pre/post-migration identity baseline, rolling
controller audit, original read and permanent send receipt. Private operator
records and encrypted recovery snapshots are retained for review and recovery.
Temporary verification sessions and client credentials are revoked after use;
shared production release, health, backup and collector timers remain running.

The [verification record](VERIFICATION.md) retains the separate 100,000-reference
synthetic scale measurements. They do not measure Resend throughput or production
capacity at that population. Actual production adoption indexed metadata only;
original bodies and files remain provider-authoritative and are read on demand.

Direct `contact@isaacurman.com` mail remains an independently authenticated MXroute
connector with no active IMAP connection. It is outside the seven-domain index
and is disclosed as disconnected. No eligible original advertised an attachment,
so a live original-file download was not verified. Provider retention still
limits original availability; this is not an all-time archive. Viewports emulate
phones and do not certify physical devices or universal email Inbox placement.
