# Centralized email verification

**Status: Operational local verification; live provider connection and release pending**

**Verified:** November 8, 2026, UTC.

The [implementation plan](PLAN.md) and [feature contract](../../features/email.md)
are implemented on `feat/centralized-email`. Current main `b3eaf25` was merged
normally, preserving the public homepage, private `/app` dashboard and existing
deployment controls. The original `ops/vps-activation` checkout and its owner
edits were not changed.

## Executed checks

| Check | Result and scope |
| --- | --- |
| Workspace check | Passed formatting, lint, type checking, package boundaries, generated contracts and experience-lab checks. Existing lint warnings remain; no lint errors. |
| Full test command | Passed 190 Vitest files / 3,168 tests, 33 lab tests, 123 host tests, 11 agent-registry tests, four LAN-preview tests and four phone-preview tests. |
| Production build | Passed with the real Next application, owner email API, signed webhook, attachment route and Foundation MCP. |
| Disposable PostgreSQL functional run | Passed seven baseline migration/job tests plus eight email subjourneys and their parent. Real migrations and runtime-role SQL exercised seven-domain counts, multi-recipient deduplication, unknown addresses, more than 100 messages, BCC and literal search, original continuation, unavailable-original metadata fallback, stale triage, scope and live authority checks, webhook replay/order/backoff, draft identity, immutable approvals, retries and permanent send receipts. |
| Guarded browser run | Passed seven baseline tests and one complete email journey against the final built app. Desktop 1440 x 1000 and phone 390 x 844, each light/dark, covered populated lists, domain/address counts, pagination, original text/isolated HTML, attachments, review, rules, compose/reply and multiple recipients. No page errors were recorded. |
| Real worker and MCP transport | The browser rig delivered signed webhook HTTP requests, rejected bad signatures and replayed identical events, ran the built pg-boss worker, and exercised ten explicitly granted tools through authenticated Streamable HTTP. Machine approval attempts were denied. Provider acceptance was a fixture, not external delivery. |
| Negative control | Temporarily removing the finite-expiry guards made the malformed-expiry tests fail. The guards were restored and the positive tests passed. |

The browser review corrected stable control names, a save-completion race in the
test, stale sidebar counts after triage and temporary zero counts during refresh.
The host preflight tests caught empty optional credential assignments in the
example environment. Those assignments are now comments; preflight was preserved.
Original body failures now retain an inspectable metadata view. Search includes
all original recipient fields. These corrections are included in the final checks.

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

Local evidence remains in `.agent/email-scale-result.json`,
`.agent/email-browser/result.json` and the populated full-page and viewport PNGs
under `.agent/email-browser/`. The screenshots use fictional `example.test` mail.
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

## Live connection and release gaps

The saved ResuPals key was an unusable development value. No reusable primary
Resend credential was found in the known private Commandry references. Chrome
refused the account-access tab while an extension popup was open; dismissal is
still pending. Consequently actual domain verification, retained-history coverage,
original availability, a live webhook and real delivery have not been verified.

Direct `contact@isaacurman.com` mail is independently hosted by MXroute. No usable
IMAP credentials were found and no MXroute connector is implemented or active.
The UI labels it disconnected; it is outside the seven-domain Resend population.

No real mailbox ingestion, external send, new account access grant, remote SQL,
forwarding change or deployment occurred. `MAIL_POLLING` remains off by default.
Migration `0076_centralized_email`, private credential mounts, account/project
binding and any new Commandry webhook require the normal reviewed activation.
Preserve the existing ResuPals webhook, provider forwarding and inactive Sieve set.
After usable access exists, verify the provider account, all seven identities,
both paginated populations and an explicitly authorized delivery check. These are
remaining operational checks, not local passes.
