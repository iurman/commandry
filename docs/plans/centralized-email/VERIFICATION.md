# Centralized email verification

**Status: Operational; local qualification and primary production activation**

**Verified:** November 8, 2026, UTC.

The [implementation plan](PLAN.md) and [feature contract](../../features/email.md)
were delivered through [PR 62](https://github.com/iurman/commandry/pull/62).
The [activation record](EXECUTION.md) contains production evidence; the initial
local and read-only provider results below remain historical evidence. Current main `b3eaf25` was merged
normally, preserving the public homepage, private `/app` dashboard and existing
deployment controls. The original `ops/vps-activation` checkout and its owner
edits were not changed.

## Executed checks

| Check                                 | Result and scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace check                       | Passed formatting, lint, type checking, package boundaries, generated contracts and experience-lab checks. Existing lint warnings remain; no lint errors.                                                                                                                                                                                                                                                                                                                            |
| Full test command                     | Passed 190 Vitest files / 3,168 tests, 33 lab tests, 123 host tests, 11 agent-registry tests, four LAN-preview tests and four phone-preview tests.                                                                                                                                                                                                                                                                                                                                   |
| Production build                      | Passed with the real Next application, owner email API, signed webhook, attachment route and Foundation MCP.                                                                                                                                                                                                                                                                                                                                                                         |
| Workflow and dependency checks        | GitHub workflow YAML formatting passed. Production dependency audit passed the high-severity gate and reported one moderate advisory. The PR browser-policy check passed. Final branch run 42527269117 passed, followed by all twelve main release jobs in run 42528495916 attempt 2. The exact published image was promoted through the normal rolling controller.                                                                                                                  |
| Production Compose configuration      | Template shape passed using the existing container runtime. This validates configuration only; example credentials/images remain invalid for deployment.                                                                                                                                                                                                                                                                                                                             |
| Disposable PostgreSQL functional run  | Passed seven baseline migration/job tests plus eight email subjourneys and their parent. Real migrations and runtime-role SQL exercised seven-domain counts, multi-recipient deduplication, unknown addresses, more than 100 messages, BCC and literal search, original continuation, unavailable-original metadata fallback, stale triage, scope and live authority checks, webhook replay/order/backoff, draft identity, immutable approvals, retries and permanent send receipts. |
| Guarded browser run                   | Passed seven baseline tests and one complete email journey against the final built app. Desktop 1440 x 1000 and phone 390 x 844, each light/dark, covered populated lists, domain/address counts, pagination, original text/isolated HTML, attachments, review, rules, compose/reply and multiple recipients. No page errors were recorded.                                                                                                                                          |
| Real worker and MCP transport         | The browser rig delivered signed webhook HTTP requests, rejected bad signatures and replayed identical events, ran the built pg-boss worker, and exercised ten explicitly granted tools through authenticated Streamable HTTP. Machine approval attempts were denied. Provider acceptance was a fixture, not external delivery.                                                                                                                                                      |
| Negative control                      | Temporarily removing the finite-expiry guards made the malformed-expiry tests fail. The guards were restored and the positive tests passed.                                                                                                                                                                                                                                                                                                                                          |
| Live provider read-only qualification | After explicit owner key approval, the actual Commandry adapter verified all seven identities, completed both current provider-accessible list traversals, and read an existing received and sent owner delivery-check original. The transport rejected non-GET requests. No message body, signed URL or full credential was persisted in the evidence. No eligible list metadata advertised an attachment, so live attachment availability remains unverified.                      |

The browser review corrected stable control names, a save-completion race in the
test, stale sidebar counts after triage and temporary zero counts during refresh.
The host preflight tests caught empty optional credential assignments in the
example environment. Those assignments are now comments; preflight was preserved.
Original body failures now retain an inspectable metadata view. Search includes
all original recipient fields. These corrections are included in the final checks.

The moderate dependency finding is [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99),
affecting the existing optional esbuild 0.18.20 chain through Better Auth and
Drizzle Kit. The audit reported zero high or critical findings. This feature did
not change that dependency chain.

## Production-scale qualification

The retained scale rig used actual application/repository code, PostgreSQL and a
separate built web process while a separate worker indexed 100,000 synthetic
message references. Two page jobs were invoked concurrently and serialized by
the account advisory lock. The fixture represented 20% of messages with 2 MiB
attachment descriptors. No message body or attachment file was fetched or copied.

| Measurement | Observed |
| --- | ---: |
| Indexed references / pages | 100,000 / 1,000 |
| Body reads / attachment bytes | 0 / 0 |
| Worker elapsed / CPU | 27.87 s / 8.51 s |
| Worker peak RSS | 361,435,136 bytes |
| Total disposable database size | 123,502,592 bytes |
| Baseline web reads / p50 / p95 | 20 / 5.50 ms / 13.34 ms |
| Concurrent web reads / p50 / p95 | 994 / 3.72 ms / 5.15 ms |
| Web peak RSS / CPU | 302,419,968 bytes / 5.57 s |
| Maximum sampled web event-loop p95 | 696.78 ms |

The rate limiter was disabled only in this sustained CPU/index stress fixture.
These figures do not measure Resend throughput, actual mailbox volume or VPS
capacity. The event-loop maximum includes process startup and host contention;
the passing request latency measurements do not establish an event-loop latency
guarantee. The production adapter retains bounded responses, serialized starts,
timeouts and one-page checkpoints. Requalify the deployment host before activation.

## Evidence and reproduction

The original measured scale receipt remains in
`.agent/email-scale-qualification-original.json`; later full smoke runs also write
`.agent/email-scale-result.json`. Browser evidence is in
`.agent/email-browser/result.json` and the populated full-page and viewport PNGs
under `.agent/email-browser/`. The application screenshots use fictional
`example.test` mail. A separate `resend-key-approval.jpg` captures the unsubmitted
provider permission form and contains no full credential or message body. The
creation receipt is `resend-key-created.jpg`. Sanitized live provider results are
in `.agent/email-live-read-result.json`; its executed log is
`/tmp/commandry-email-live-read.log`. The credential is retained privately outside
the repository with file mode 0600 in an owner-only directory.
Raw command logs are retained at `/tmp/commandry-email-check.log`,
`/tmp/commandry-email-full-test.log`, `/tmp/commandry-email-build.log`,
`/tmp/commandry-email-integration.log`, `/tmp/commandry-email-browser.log`,
`/tmp/commandry-email-scale.log` and
`/tmp/commandry-email-expiry-negative-control.log`. No private mail inventory or
credential is committed. The structured QA report is retained outside the checkout
under the agent QA project/run state.

From the repository root, using Node.js 24 and pinned pnpm 11.19.0:

```bash
pnpm check
pnpm test
pnpm build
pnpm test:integration --db-test=email.integration.test.ts
pnpm test:integration --db-test=email-scale.integration.test.ts
pnpm browser:isolated pnpm test:integration --email-browser-only
```

The test harnesses use disposable clusters, synthetic provider transport and
temporary private fixture keys. They stop their web/worker/browser processes and
remove the clusters and keys in cleanup. Review evidence and the existing source
worktree are intentionally retained. User browser tabs and shared runtimes remain
available. No watcher or automation was created.

## Initial connection history and retained limits

The saved ResuPals key was an unusable development value. No reusable primary
Resend credential was found in the known private Commandry references. After the
initial popup/password blockers, the owner completed browser sign-in. Read-only
provider UI discovery confirmed the isaacurman Pro workspace, all seven expected
domains marked Verified, original receiving records addressed to all seven and
the single enabled existing ResuPals webhook. Its visible receiving events showed
Success. One earlier owner delivery-check original was opened successfully, with
its original sender, recipient, subject and body. No new delivery check was sent.

The owner explicitly approved the dedicated `commandry-email` key, Full access /
All domains permission, private storage outside the repository and Commandry
verification. Resend offers Sending access or Full access, with no read-only
option; Full access can manage account resources. Add was clicked once. After a
second popup blocker was cleared, the one-time result was captured directly into
the private file without printing the credential. The key inventory confirmed one
dedicated key. Existing keys, domains and webhook settings were not modified.

The actual Commandry adapter then made five GET requests against Resend: domain
verification, complete current sent/received traversals and two original reads.
All seven configured domains were verified. Existing delivery-check originals in
both directions returned body content. Live attachment availability remains
unverified because no eligible list metadata advertised one. This is provider API
qualification, not a production mailbox index or a claim of all-time history.
No new external send or webhook delivery into Commandry was executed.

Direct `contact@isaacurman.com` mail is independently hosted by MXroute. No usable
IMAP credentials were found and no MXroute connector is implemented or active.
The UI labels it disconnected; it is outside the seven-domain Resend population.

Those initial local checks performed no production ingestion, remote migration
or send. Subsequent owner-authorized activation applied the reviewed migration,
connected the real index and independent signed webhook, and verified an exact
approved own-address delivery. The existing Vercel preview remained separate
from private email activation. `MAIL_POLLING` stays off by default in the template
and is explicitly enabled in the private production configuration.

The [activation record](EXECUTION.md) retains the live results and the production
HTML-rewrite correction. Final public DOM, browser and scoped MCP receipts are
retained in the QA ledger and [PR 62 release closure](https://github.com/iurman/commandry/pull/62).
Live original-file download remains unverified because no eligible original
advertised an attachment. Direct MXroute is a separate disconnected connector.
