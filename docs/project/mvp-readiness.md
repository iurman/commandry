# Local MVP and VPS handoff

**Status: Operational**

This is the evidence boundary for the [expanded MVP campaign](mvp-campaign.md).
The connected product runs locally in Docker. It is a place to begin attaching
real sources after the deployment gates below are met. It is not a claim that
the existing VPS, external agents, or production actions have been validated.
The [product scope](../product/scope.md) and accepted
[deployment](../decisions/0009-deploy-the-initial-control-plane-to-the-vps.md),
[database](../decisions/0011-self-host-postgres-and-preserve-a-managed-exit.md),
and [worker](../decisions/0012-use-postgres-backed-background-work.md)
decisions retain precedence.

## Connected local product

| Path                         | What works now                                                                                                                                                                                                                                                                                | Evidence boundary                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Projects and resources       | Create and edit projects, Domains, Systems, resources, typed links, hierarchy, dependencies, and project context. Project briefs and saved packets cite their source records.                                                                                                                 | Manually entered structure is real local data; operational health is unknown without a source.                                                                                       |
| Capture, Work, and Knowledge | Preserve original text, pasted source, link, image, and bounded local file captures. Review worker suggestions, file into Work or Knowledge, use project and global lists, board, search, saved views, decisions, discussions, assignments, recurrence, attachments, and typed relationships. | Derived suggestions and extracted text remain separate from immutable originals. Pasted email, conversations, and voice text are manually supplied, not synchronized or transcribed. |
| Search and briefs            | Search indexed local records and source-backed text; generate current evidence-linked project briefs and immutable packet snapshots.                                                                                                                                                          | Briefs are deterministic local assembly, not validated semantic answers.                                                                                                             |
| Integrations and observation | Configure bounded local synthetic development and operational sources through receiver and polling paths. The worker normalizes events, metrics, and alerts, records freshness and replay history, and links activity, attention, notifications, resource impact, and project flow.           | Every fixture and observation is labeled synthetic; no Git provider, host, or monitoring account is connected.                                                                       |
| Agents                       | Register and assign local fake agents, issue packet-scoped read grants and MCP reads, queue fake runs, record callbacks, artifacts, audit, cancellation, paged cached output, and project findings tied to exact packet digests.                                                              | Results are synthetic and unverified. No external runtime, provider capacity, browser session, Git, or SSH action ran.                                                               |
| Approvals and automation     | Review an exact simulated resource action above a configurable local risk ceiling. Run one-time, recurring, event, condition, and Overnight Queue routines with worker attempts, evidence checks, export, and one opt-in Commandry-owned synthetic note action.                               | Resource action outcomes are `simulated_only`; no external resource is changed. Real write credentials and production capability policy are absent.                                  |
| Delivery and recovery        | Run separate web, worker, and PostgreSQL services; inspect local backup, restore, release rollback, and source preflight evidence in Infrastructure / Recovery.                                                                                                                               | The local rehearsal is not an offsite restore or VPS deployment. Production startup remains guarded.                                                                                 |

The versioned API contract is under `/api/v1` and generated OpenAPI. Domain and
application logic stays outside route handlers and the separate pg-boss worker.
The Storybook lab is local development tooling and is absent from production
manifests. The app is responsive at desktop and 390px and 320px phone widths.
The [host-side restic drill](../../deploy/backup-and-restore.md) has also passed
with a synthetic Project and Capture in a separate PostgreSQL container, an
internal web read smoke, and a local encrypted repository. An opt-in local
variant restores one synthetic owner and proves sign-in, protected reads, and
session revocation against that restored database. The default production
restore check remains read-only and does not claim authenticated access. Both
record measured time in private JSON files. They are separate from the
product Recovery screen and do not prove an offsite or VPS restore. A separate synthetic host bundle
drill captures and reads back encrypted PostgreSQL globals and private
configuration, applies roles to a networkless disposable cluster, and extracts
configuration locally. It does not install either on a replacement VPS.
The disposable [production topology rehearsal](../../deploy/README.md) now
passes PostgreSQL migration, production-mode owner login, a protected API and
server-rendered page through internal Caddy, a completed worker job, session
revocation, no published ports, and complete container, network, and volume
cleanup. It uses synthetic credentials and a local application image. Its
private evidence explicitly leaves offsite, VPS, Tunnel, and public ingress
verification false.

An unrun [manual release candidate workflow](../../.github/workflows/release-candidate.yml)
now prepares a GHCR image from the exact clean image tested by those local
checks, audits production dependencies, reports high and critical image
findings, blocks findings with available fixes and high or critical secrets,
and verifies the published digest by pulling it back. Unfixed vulnerabilities
are reported rather than silently treated as a clean scan. No GHCR release
digest, hosted image scan, VPS deployment, or production backup result has
been verified by this workflow yet.

## Local review

- App: `http://127.0.0.1:3010/`.
- Same-Wi-Fi phone gateway: `http://10.0.0.73:3011/`, with the local review
  gate username `test` and password `pass`. The address depends on this
  machine retaining `10.0.0.73` on the same network. The gate is not
  product authentication.
- Storybook lab: `http://127.0.0.1:6006/`.
- Recovery evidence: `http://127.0.0.1:3010/infrastructure/recovery`.

The Compose app port is loopback-only. No Tailscale dependency or public
exposure is required for the phone gateway. HTTP on the LAN does not meet the
secure-origin requirement for full PWA installation; the manifest and offline
help can be reviewed on a secure origin later.

## Local verification at handoff

`pnpm check`, `pnpm test` (200 root tests plus lab and gateway suites),
`pnpm test:integration`, `pnpm --filter @commandry/db db:check`, and
`pnpm test:smoke` passed. The full Playwright run against Compose passed 171
cases at desktop, 390px, and 320px widths; three cases were skipped by their
own conditions. The saved fake agent finding story rendered at 1440px, 390px,
and 320px without horizontal overflow. Web, lab, and the same-Wi-Fi phone
gateway returned HTTP 200. These checks validate local behavior and do not
replace the production gates.

## What prevents production activation

1. **VPS and recovery facts.** An initial read-only inventory under
   [OQ-019](open-questions.md#oq-019-can-the-existing-vps-safely-host-the-initial-database) found four vCPUs, about 5 GiB of available memory,
   180 GiB of free disk, existing Docker workloads, and a working SSH path.
   After the owner-authorized Hermes and Paperclip retirement on 2026-09-27,
   Ephemera was the only remaining Compose project and remained healthy;
   about 187 GiB of disk was free.
   The IONOS VPS Linux L panel matches the known public IP and lists four
   vCores, 8 GB RAM, a 240 GB NVMe SSD, and a data center identified only as
   United States. The host has a 232 GiB root filesystem and only Ephemera in
   Docker Compose. Its PostgreSQL container still maps port 5433 on all
   interfaces. The assigned active IONOS firewall policy allows TCP 22, 80,
   443, 8443, and 8447 from all IPs, with no 5433 rule. At inspection, the
   host listened on 22 and 5433, not 80, 443, 8443, or 8447. SSH password and
   root login are disabled in the host configuration; the operator account
   retains broad sudo and Docker access. Host UFW is active with default
   incoming deny.

   At the last verified panel inspection, there was no active Backup Package
   or saved server image. Its remote console connected without a reboot, and
   Grml recovery media is offered
   but was not mounted. No snapshot action appeared for this VPS. No
   application database backup timer appeared in inspected system or user
   timers. Nightly backup, hourly health, and monthly isolated restore timer templates now exist locally;
   their synthetic rehearsal records private results but they have not been
   installed or run with R2. Exact data center region, provider host-key verification, offsite
   encrypted backup, clean restore, and constrained deployment identity
   remain open. Local backup and rollback drills do not satisfy ADR 0009.

2. **Human identity.** [OQ-003](open-questions.md#oq-003-what-is-the-first-human-sign-in-and-recovery-method) must settle production sign-in and account recovery. The
   optional Better Auth owner experiment includes an offline operator reset
   that revokes sessions and writes an audit event. Built-app local and
   provisional production smoke runs check access denial and recovered sign-in
   against disposable PostgreSQL. Production mode requires an explicit
   `PRODUCTION_AUTH_MODE=password` setting and is closed by default. The
   uninstalled root-only recovery wrapper stops web during reset and restarts
   it afterward. It cannot recover from loss of VPS operator access. The phone
   `test`/`pass` review gate is separate. These tests do not decide the
   canonical production method or complete its deployment gates.
3. **Immutable release and control.** An approved immutable registry image
   digest or signed build chain, production secret handling, deployment
   command restrictions, and rollback rehearsal on the actual host remain to
   be validated. A local-only command rehearsal now checks digest and revision
   approval, backup and smoke gate failures, and code rollback using synthetic
   Docker. The committed, uninstalled app smoke hook has a separate wrapper
   test and a built-app local test that creates the first owner, reads through
   a real session, revokes it, and waits for a worker job result. A separate
   backup-gate drill uses a synthetic restic repository and isolated web
   restore, plus isolated application of global roles and extraction of
   private host configuration, but cannot write an offsite receipt. The
   production Compose subset also passes locally through Caddy with a
   synthetic owner and no public port. None of these paths validates the VPS
   identity, real R2 storage, Tunnel, or public ingress. The
   unactivated topology and exact procedure are in
   [deploy/README.md](../../deploy/README.md).
4. **Real sources.** [OQ-005](open-questions.md#oq-005-which-two-integrations-prove-the-vertical-slice) needs one actual development source and one actual
   operational source. Account ownership, source credentials, webhook or poll
   access, and health reconciliation need to be tested against those systems.
   Synthetic receiver and poll fixtures exercise the local pipeline only.
5. **Privileged execution and writes.** [OQ-006](open-questions.md#oq-006-which-agent-runtime-adapter-and-runner-protocol-come-first),
   [OQ-007](open-questions.md#oq-007-what-is-the-first-capability-and-policy-representation), and
   [OQ-008](open-questions.md#oq-008-which-secrets-system-will-broker-credentials) must define a separately authenticated runner, runtime
   and callback ownership, scoped grants, secret brokerage, and approved
   targets before real agent, Git, SSH, browser, or external automation work.
   Under ADR 0012, neither the web process nor the database-connected worker
   is a privileged browser runner. A local fixture click would not validate a
   real target's identity, credential boundary, or side-effect policy.

The later [roadmap](../product/roadmap.md) items that depend on real usage are
also still validation work: semantic brief usefulness and agent-generated
widgets require a real agent and evaluation; provider capacity routing
requires provider limits and credentials; anomaly thresholds and suggestion
quality need real observations; native/PWA and sound or haptic behavior need
actual supported devices. Current local analogues are labeled and do not
silently decide those product questions.

## Activation order after the gates

Record the VPS facts and production identity/recovery decision first. Then
validate an approved immutable image, constrained deployment access, and an
offsite encrypted restore on that host. Attach one development and one
operational source, verify normalized evidence and freshness against their
systems of record, and only then enable separately scoped runner or action
capabilities. Every real action must name risk, capability, approval behavior,
and audit evidence as required by
[security and permissions](../architecture/security-and-permissions.md).
The [VPS access and onboarding runbook](../operations/vps-access-and-onboarding.md)
starts with a verified SSH target and read-only inventory of existing services.

This sequence is an operational handoff, not authorization to provision,
deploy, connect an account, or perform an external action.
