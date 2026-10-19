# ADR 0018: Promote verified main releases with two web slots

**Status:** Accepted

**Date:** 2026-10-19

**Authority:** Owner explicitly requested implementation of automatic main
releases, candidate verification before switching, retained safe release and
lower deployment latency. This decision refines ADR 0009 within its existing
VPS, Compose, Caddy, PostgreSQL and separate worker boundaries.

## Context

The existing deploy command closes Caddy and the Tunnel while replacing the
application. The October 18 activation's successful-request enclosing window
was 18.699 seconds and its complete command took 107.977 seconds. Parallel CI
already qualified and published main in 9m51s without removing any of the 207
browser identities. Building on production would contend with the live DB.

## Decision

Build and qualify once in GitHub Actions on main pushes and manual dispatch.
A root-owned host controller independently checks the current main SHA, the
completed workflow and all twelve successful jobs, including the complete
browser census and publication. Pull the unique SHA/run/attempt tag, resolve
its immutable digest, require the publish job's bot-created, attempt-bound
`commandry/qualified-image` commit status to match that digest, check clean-source
labels and qualify that exact digest.
No production credential or deployment key is added to GitHub Actions.

Use two private web slots, `web` and `web_next`. Start the inactive candidate
without reconciling the active web, PostgreSQL, Caddy or Tunnel containers.
Overlap candidate startup/stability with the existing fresh R2 backup, isolated
restore and host-recovery gate. Do not cache or skip those recovery checks.

After both pass, drain the sole business worker, requiring a clean exit before
starting its replacement. Require the candidate worker's own release heartbeat
and the existing owner login, protected read, probe-session revocation and real
job receipt against the candidate web. Then gracefully reload Caddy. Keep the
previous web running as a readiness-based fallback and static-asset fallback.
Never replay application writes. Configure Next deployment identity for version
skew detection and allow a five-minute stream drain. Confirm the switched
candidate before replacing the confirmed release marker. Journal changes before
mutation, recover interrupted transactions and retain one rollback target.

The host watchdog checks the active web and worker and restores the retained
release after two unhealthy observations. Database identity uncertainty closes
Commandry ingress and requires recovery; it never authorizes a different DB.
The pause flag stops new automatic promotions while preserving recovery checks.

Automatic rollout requires the image's migration tree and reviewed host-control
fingerprints to match the enrolled policy. A migration or deployment-control
change is held for operator review and policy enrollment. Automatic destructive
or newly introduced DDL is outside this decision. The first installation proves
that the enrolled migration tree equals the serving release's tree. No schema
rollback is attempted. Worker messages and HTTP contracts must remain compatible
with the retained web during a worker handoff.

Root-owned policy and reusable smoke input stay outside Git. The constrained SSH
identity remains unchanged and can neither edit policy nor read credentials.
This host release operation is owner-only, high impact, uses host deployment
capability and emits host audit receipts. No broader MCP action is granted.

## Consequences and limits

- Ordinary compatible application releases retain serving capacity during all
  deployment stages. The VPS remains a single host failure domain.
- A candidate health check cannot prove absence of all later bugs. Readiness,
  authenticated behavior, real work, a confirmation window and retained rollback
  reduce that risk without claiming complete availability or zero lost client
  component state during a version-triggered reload.
- One old web consumes extra memory. Reuse it only after the configured minimum
  five-minute retention. Older browser assets have a bounded two-release window;
  deployment ID mismatch can trigger a hard navigation.
- Business jobs briefly wait during a clean worker handoff. There is one consumer
  generation; this is uninterrupted HTTP serving, not simultaneous workers or
  exactly-once external side effects.
- Incompatible schema/control changes remain deliberately held. Expansion and
  contraction migration automation needs a separate compatibility design.

## Sources and alternatives

[Caddy reload](https://caddyserver.com/docs/command-line#caddy-reload) supports
configuration changes without restarting the proxy. Its
[reverse proxy controls](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
cover ordered fallback, readiness checks, response interception and stream drain.
[Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting) documents
version skew, deployment identity and immutable assets. GitHub's
[workflow jobs API](https://docs.github.com/en/rest/actions/workflow-jobs) exposes
attempt-bound qualification results.

Swarm, Kamal, Kubernetes and a second host were considered in the prior research.
Two slots extend the existing controls without a new orchestration platform or
paid build service. A second host would address host failure, which this change
does not.
