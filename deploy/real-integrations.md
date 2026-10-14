# First real source deployment

**Status: Operational**

**Updated:** 2026-10-14

Production now uses public GitHub repository activity and an unprivileged
Linux host receiver at `https://commandry.site`. The application runs reviewed
revision `e62401b03a52398644658749c39605fda4ade41e` and immutable image
`ghcr.io/iurman/commandry@sha256:d5f84d9558206044739d7c96aab1a0531f314806e4b89086ef728da8f16eda5a`.

Earlier candidate verification established the contracts before activation. Live read-only verification imported 43
actual `iurman/commandry` events and four metrics from an actual `electra`
sample into disposable local PostgreSQL. The built worker also polled the
actual repository, and the collector sender submitted that host sample through
the built HTTP receiver with its scoped token. This does not establish an active
VPS deployment. On October 14, the constrained deployment completed after
actual R2 backup/readback and isolated restore, production owner sign-in and
sign-out revocation, exact version checks, and a worker job. Authenticated API
verification then read fresh real GitHub and systemd-delivered electra evidence.
The collector runs every minute. Ephemera remains healthy. Telegram backup alert delivery is active through the separate root-controlled
host timer; its labeled firing/recovery test and quiet healthy check passed.
A full lost-VPS recovery and independent outage monitoring remain unproven.

## Source and security contract

An owner creates a source in Integrations with an active project link to a
`repository` or `host` resource. Configuration, enabling/disabling and token
rotation require the owner session in authenticated environments. Management
rejects untrusted browser origins. Every configuration change is audited.

The GitHub adapter reads only the public repository Events API. It sends no
GitHub credentials, writes nothing to GitHub, refuses redirects, honors
conditional requests, polling intervals and rate-limit backoff, and follows
only continuation pages for the configured repository. The provider exposes
up to 300 events from the last 30 days and may delay activity. It is an
activity feed, not a complete repository mirror or an immediate merge hook.
See [GitHub's Events API](https://docs.github.com/en/rest/activity/events).

The Linux collector reads `/proc/meminfo`, `/proc/uptime`, `/proc/loadavg` and
filesystem counters for `/`. It needs no root access, Docker socket, SSH key
or database credential. Its bearer token permits only submission to one host
integration. The receiver validates the exact hostname, counters, timestamp
and a 128 KiB payload limit. Rotation revokes the old token. Disabled sources
and archived project links reject new observations. Replays preserve the
original evidence; conflicting reuse of a host sample ID is refused.

Both reads require `integration.read`, have read-only external risk and run
automatically after owner configuration. Importing evidence is an audited
Commandry-owned write, with `integration.real_observation_imported` linked to
the stored event and envelope. Neither adapter executes an external action.
Host metrics describe internal capacity and uptime; they do not claim external
availability and do not trigger synthetic monitor alerts or fake automations.

Real and fixture evidence share `integration_instance`, `source_envelope`,
`normalized_event` and `metric_sample`. Their provenance and processing
versions remain distinct. Original provider payloads are retained in immutable
source envelopes. Activity, resource history and project briefs carry the
actual provenance. The real-source observation list also shows each host
metric and its evidence, with continuation for all eligible observations.

GitHub freshness uses the last successful poll separately from the last event
occurrence. Host freshness uses the observed timestamp, so receiving an old
sample cannot make old evidence look current. New sources default to a
15-minute freshness window. This is source presentation, not the unresolved
backup policy.

## VPS activation prerequisites

Follow the accepted [deployment strategy](../docs/architecture/deployment-strategy.md)
and the existing [backup intake and restore procedure](backup-and-restore.md).
Before activation, confirm private R2 credential intake and separate recovery
key custody; choose retention, recovery targets and an alert destination;
prove offsite upload/readback and an isolated restore; settle owner sign-in
and recovery; and verify the approved immutable image, constrained deployment,
application rollback and Tunnel ingress. Root-owned configuration and the initial offsite/restore gates were verified
during activation. Retain the same requirements for future changes.

Do not bypass these gates with a personal user service or rerun the one-shot
commissioner on the already commissioned host. Keep Ephemera running. The collector templates were installed after the application passed its
deployment checks. Its one-shot service delivered actual evidence before the
minute timer was enabled.

## Collector configuration and rollback

After the tested application is active, create a Linux host source for
`electra`, linked to its host resource. Rotate its host token in Integrations
and save it directly to a private root-owned collector environment file. Do
not put the token in chat, shell arguments, the repository or test reports.

The optional systemd templates reference these exact paths:

- `/opt/commandry/runtime/node`: the already commissioned Node 24 binary.
- `/opt/commandry/scripts/linux-host-collector.mjs`: the reviewed standalone collector.
- `/etc/commandry/host-collector.env`: root-owned mode 0600, containing
  `COMMANDRY_HOST_RECEIVER_URL` and `COMMANDRY_HOST_RECEIVER_TOKEN`.
- `/etc/systemd/system/commandry-host-collector.service` and
  `/etc/systemd/system/commandry-host-collector.timer`: reviewed templates.

The URL must be the active HTTPS receiver URL shown by the source. The only
cleartext exception is loopback for local verification. The service uses a
dynamic unprivileged identity and no capabilities. Install only these new
files from a verified reviewed revision; do not replace existing deployment
controls. Verify a one-shot authenticated receipt and its persisted evidence
before enabling the minute timer. Confirm the host counter interpretation
inside the systemd mount namespace; SSH sampling alone does not prove that.

Rollback of collector activation means stopping and disabling only its timer,
disabling that source in Commandry, and removing only the new collector unit
files if needed. Preserve source evidence and audit records. Do not stop,
restart or reconfigure Ephemera.

### Hosts without Node

`scripts/linux-host-collector.py` implements the same `linux-host/v1` sample
and receiver contract using Python 3.11 or later and its standard library.
It reads the host's exact hostname, `/proc` counters and root filesystem
capacity without privileged commands. This avoids installing an application
runtime on a hypervisor or game host. It does not query Proxmox guests, AMP
instances, additional storage pools or service availability.

For these hosts, install the script at
`/opt/commandry/scripts/linux-host-collector.py` and install
`deploy/systemd/commandry-host-collector-python.service` as
`/etc/systemd/system/commandry-host-collector.service`. Use the existing timer
template and a separate source and root-owned mode 0600 environment file for
each host. The service runs under a dynamic unprivileged identity with no
capabilities. Its token submits only that host's observations. HTTPS certificate
verification stays enabled, redirects are refused, and receipt parsing is
bounded to 16 KiB. Errors do not print the receiver configuration.

Before installation, inventory the target, confirm recovery SSH access and
record running workloads. Refuse to overwrite an existing collector. Stage
credentials privately, verify installed source hashes and systemd unit syntax,
then start only the new one-shot service. Read its persisted source envelope
and compare root capacity against host counters before enabling the minute
timer. Verify a second timer-delivered observation and unchanged existing
workload process start times. Rollback stops/disables only this new timer and
service, disables its Commandry source and removes the newly installed files;
retain the evidence and installation audit.

Tests are included in `scripts/linux-host-collector.test.mjs` and require
`python3`. They cover counter interpretation, invalid capacities, configuration
validation, bounded truthful receipts, actual loopback delivery, redirect
refusal and redacted CLI failures.

Migration 0056 extends provenance and allows several named metrics per event.
It preserves fixture records. Once real records exist, a fixture-only old image
is not a proven application rollback target. Select and test a compatible
rollback image against real evidence before production activation. Do not
silently delete evidence or restore an earlier database to make a downgrade
appear successful.

## Verification commands

From the repository root with Node 24 on PATH:

```bash
pnpm check
pnpm test
pnpm build
pnpm test:integration
pnpm test:smoke
node scripts/test-integration.mjs --real-browser
node scripts/test-integration.mjs --real-browser-all
node --test scripts/linux-host-collector.test.mjs
```

The browser harness uses built web/worker artifacts and disposable PostgreSQL,
copies only generated web assets, and removes its processes and database.
It batches source creation, token handling, receipt, evidence, disabling,
reloading and continuation on desktop, 390px and 320px, including light and
dark themes. It also reruns the existing fixture integration journey.

The optional live provider smoke requires
`COMMANDRY_LIVE_HOST_SAMPLE_PATH` pointing to a privately stored, freshly
collected electra JSON sample, then
`node scripts/test-integration.mjs --real-live`. It reads public GitHub activity
through both the adapter and built worker, submits the actual host sample
through the collector sender and built receiver, and writes only the disposable
test database. It never activates a VPS service.
