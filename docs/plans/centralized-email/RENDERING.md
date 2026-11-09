# Email rendering and history follow-up

**Status: In progress**

**Owner decision:** November 8, 2026, Pacific. Connect direct MXroute, backfill
history and verify email formatting/images. The owner subsequently directed that
all work independent of the missing MXroute credential ship first; handle that
credential and mailbox activation after this release. Do not block rendering or
the existing seven-domain backfill on that dependency.

## Source and scope

Originals already live in Resend and the independently authenticated MXroute
mailbox. Keep them there. Reference their original IDs and index metadata using
the existing separate worker. Never import Gmail copies or copy whole mailboxes,
bodies or attachments into PostgreSQL. Preserve forwarding and existing webhooks.
The ResuPals EmailStudio preview is a read-only implementation reference for
isolated rendered/text views; its application, routing and auto-replies are not
modified or imported.

Fix long-content continuation so complete original HTML survives every page.
Show formatted HTML with a plain-text alternative. Preserve document styles and
responsive tables/images in a sandbox. Remove active/navigation markup and
unsafe URLs; keep remote resources blocked until the owner chooses Load images
for that message. Embedded CID images resolve from fresh, authorized provider
attachment metadata, with bounded visible continuation. Keep provider errors and
unavailable originals honest and retryable. Do not relax machine grants or send
approval. No new email needs to be sent for this work.

## Capacity before backfill

The existing qualification envelope is 100000 metadata references x approximately
4 KiB indexed storage, about 400 MiB PostgreSQL. One 100-row page (maximum 2 MiB)
per separate-worker job, serialized account reconciliation, two directions and
bounded provider starts. Reuse the measured existing unchanged indexing path:
100000 references, no body or attachment bytes, concurrent SQL-read p95 5.15 ms.
This is synthetic coverage, not a provider/VPS throughput promise. Revalidate the
actual production population and observe public/web health during a fresh
complete provider-accessible traversal. Report retention gaps rather than
claiming all-time Resend history.

On-demand body JSON remains bounded; request CID HTML to avoid transferring
base64 attachment bytes within body reads. Browser content pages are 32000
characters with explicit continuation and preserve both HTML and text. An
individual rendered message can be at most the provider response ceiling. Inline
image metadata is resolved in bounded batches; original image bytes load directly
from the provider in the sandbox, never through the shared web process. No
background image download, persistent signed URL or body archive is added.

## Verification and release

Reproduce the long-body loss, HTML-only mail, CID/remote images, tables/styles,
malicious scripts/forms/navigation and interrupted/retried reads. Exercise the
built app with real disposable PostgreSQL, worker and owner/MCP transport on
desktop/phone in light/dark. Keep external images off before explicit selection;
prove they load after selection, while script and navigation protections remain.
Run workspace checks, affected unit/integration suites and build, then normally
merge the qualified PR. Require final-main exact-image CI and normal rolling
recovery gates. After deployment, verify actual originals, image loads and
complete backfill with unchanged grants/services/forwarding. Retain failed and
final evidence. Direct MXroute activation remains a separate final credential
step under the owner's sequencing instruction.

## Recovery startup correction

PR 64 merged as `38d2705`. All twelve final-main jobs passed on the first attempt,
but the normal rolling release rejected its fresh recovery gate before touching
the business worker or routing. The isolated database/web restore passed. A full
standalone gate repeated the host-recovery failure, and an instrumented copy of
the unchanged host drill identified a role-query connection failure after socket
readiness had reported success. PostgreSQL's image starts a temporary socket-only
server during initialization, then stops it before starting the final server.

The correction makes that drill wait on `127.0.0.1` TCP readiness. On the existing
VPS, the original probe reproduced `ISOLATED_POSTGRES` with a missing socket at
the role query; the otherwise identical TCP-ready copy passed the complete
isolated host-role/configuration drill. Both attempts removed their disposable
containers/volumes and the temporary diagnostic script. Production data and
services were not changed by the reproduction.

This changes one controlled host script and its release fingerprint. Qualify the
new main image, preserve the installed script/policy for rollback, install only
the reviewed readiness correction under the deployment lock, and pass the full
official fresh backup/restore/host-recovery gate. Then enroll the exact reviewed
fingerprint and clear only the rejected PR 64 attempt's hold, allowing the normal
controller to repeat all its gates for the newly qualified main. Do not weaken
readiness, skip recovery or claim the rendered-email release is live before its
actual confirmation and real-message checks.

## Primary sources

- [Received content and CID format](https://resend.com/docs/api-reference/emails/retrieve-received-email)
- [Original attachment metadata](https://resend.com/docs/api-reference/emails/retrieve-received-email-attachment)
- [Existing scale and activation evidence](VERIFICATION.md)
