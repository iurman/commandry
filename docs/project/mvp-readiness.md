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

1. **VPS and recovery facts.** [OQ-019](open-questions.md#oq-019-can-the-existing-vps-safely-host-the-initial-database) needs the actual VPS inventory, available memory, storage,
   recovery console, and snapshot path. ADR 0009 requires an offsite encrypted
   backup and a clean VPS restore, plus a constrained deployment identity.
   Local backup and rollback drills do not satisfy these gates.
2. **Human identity.** [OQ-003](open-questions.md#oq-003-what-is-the-first-human-sign-in-and-recovery-method) must settle production sign-in and account recovery. The
   optional Better Auth local owner experiment and phone `test`/`pass`
   review gate are not that decision. `APP_ENV=production` still refuses to
   start.
3. **Immutable release and control.** An approved immutable registry image
   digest or signed build chain, production secret handling, deployment
   command restrictions, and rollback rehearsal on the actual host remain to
   be validated. The unactivated topology and exact procedure are in
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

This sequence is an operational handoff, not authorization to provision,
deploy, connect an account, or perform an external action.
