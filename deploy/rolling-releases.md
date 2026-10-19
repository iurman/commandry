# Automatic rolling release controls

**Status: Operational implementation in progress**

See [ADR 0018](../docs/decisions/0018-promote-verified-main-releases-with-two-web-slots.md)
and the [delivery plan](../docs/plans/automatic-safe-releases/PLAN.md). The
production execution record must distinguish implementation from activation.

## Selection and promotion

A main push starts the existing full release pipeline. Its twelve jobs must all
succeed for the current main source and run attempt. The host timer reads public
GitHub metadata and pulls the unique published image tag, resolves its immutable
digest, requires the publish job's exact attempt-bound digest receipt in the
`commandry/qualified-image` commit status, and checks source labels. The status
must come from `github-actions[bot]`, link that run attempt and contain one
unambiguous SHA-256 digest. No production SSH key or owner password is
sent to Actions. A stale or failed run cannot displace the current release.

Root-owned `/etc/commandry/rolling-policy.json` contains version `1`, repository
`iurman/commandry`, the enrolled `controls` and `migrations` SHA-256 fingerprints,
`minimumRunId`, `enabled`, `confirmSeconds` (10-300) and `retainSeconds` (300-86400).
Generate the source fingerprints with `node scripts/release-policy.mjs`; the
image contains that same generated `/app/release-policy.json`. Before first
installation, compare migrations with the actual serving image. Control changes
require reviewed host installation and a new explicit enrollment. A changed
migration tree requires a separate backward-compatibility review. Never enroll
an arbitrary candidate just to make an automatic hold disappear.

The reusable two-line owner smoke input is root-only at
`/etc/commandry/deploy-owner.input`; it never enters an approval, audit, CI log or
repository. Existing encrypted host configuration backup includes this private
configuration directory. Root-controlled state with previous environments also
remains private. The constrained deployment SSH account has no read/write access.

`commandry-deploy` retains original first-install behavior. Once policy is
installed, existing-release activation delegates under its lock to
`commandry-rolling.py`. The automatic controller invokes the same rollout
function under that lock. The two web slots share the private Compose network;
`compose.rolling.yaml` is used only by the rollout command. Do not run ordinary
`compose up web worker` against a live rolling installation: the `web` slot might
be the retained version. Use the constrained release command.

## Gates and failure handling

Candidate startup and ten seconds of native readiness/version checks overlap a
fresh R2 backup, isolated restore and host recovery check. No migration is run
by this unchanged-schema automatic path. The old web and worker remain active.
Only then is the sole business worker drained, with clean exit required, and
replaced. Its own release heartbeat and actual deployment smoke job, plus owner
login/protected read/probe sign-out, must pass against the candidate web.

Caddy validates and gracefully reloads ordered routing. It retains the old web
as health fallback, with old immutable static assets available on candidate 404.
Application writes are never replayed. Next deployment identity detects client
version mismatch. Streams have a five-minute drain allowance. The old slot is
kept until the next deployment after at least five minutes, not stopped after
confirmation. This retains one previous release, not unlimited browser versions.

A private pending journal precedes mutation. Exceptions restore previous routing,
environment, marker and worker before removing the candidate. The next host tick
recovers an interrupted journal. Two unhealthy watchdog observations restore the
retained release and hold that rejected SHA. A DB identity violation closes only
Commandry ingress and requires owner recovery. It does not try to use or migrate
a replacement cluster. Inspect `/var/lib/commandry/rolling-deployments.jsonl`,
`rolling-active.json`, `rolling-pending.json`, `automatic-rejected.json` and
systemd logs through the root-controlled operator path. State may contain secrets;
never paste it into an agent response or tracker.

## Operator and agent access

Promotion and rollback are high-impact owner operations, require host deployment
capability, and emit `succeeded`, `rejected`, `rolled_back`, `rollback_failed` and
automatic selection audit events. The owner authorized the enrolled automatic
policy; each promotion still has an expiring exact-digest approval. The existing
SSH deployment capability remains fixed and cannot edit policy or execute a
shell. No application/MCP permission grants this host authority. This is an
intentional owner-only infrastructure operation, documented for agents; a
product-facing MCP deployment action is deferred until it has scoped capability,
approval and canonical audit integration.

To pause, the root operator atomically sets policy `enabled` to false; keep the
timer running for recovery and health checks. To restore the retained release,
run `/usr/bin/python3 /opt/commandry/deploy/commandry-rolling.py rollback` as root.
This holds the rejected SHA. Diagnose it before explicitly clearing that private
hold. Do not disable the policy file or restore the legacy deploy script while
`web_next` is active. Root control installation rollback first restores the
original web routing and application state through the rolling rollback command.

The host timer is an ongoing production service, not a temporary task watcher.
Keep it and shared backup/collector timers running during task cleanup. One host,
one DB and one tunnel remain failure domains; this controls application release
handoffs and does not promise availability through host or upstream failure.
