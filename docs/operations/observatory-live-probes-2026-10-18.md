# Live endpoint probe activation, October 18, 2026

**Status: Operational. Native checks and transport evidence verified in production; the overview visibility refinement and its release receipts are tracked in PR 50.**

The owner requested actual checks and visible request/response activity committed,
pushed, merged and deployed. This date uses Pacific time. Timestamps below are UTC.
Provider account access remains a separate pending decision.

## Initial qualified transport release

| Field                           | Verified value                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Implementation                  | [PR 46](https://github.com/iurman/commandry/pull/46)                                               |
| Browser initial-load correction | [PR 48](https://github.com/iurman/commandry/pull/48)                                               |
| Source                          | `b0079608c25a5221bede9024bdc57b28d80ecfb7`                                                         |
| Image                           | `ghcr.io/iurman/commandry@sha256:c6a95b321d71fb1746e8239a374f10b25aa65d70c3b8a9411c263b24d312c294` |
| Image created                   | `2026-10-19T01:19:37Z`                                                                             |
| Full qualification              | [39184689632](https://github.com/iurman/commandry/actions/runs/39184689632)                        |
| Initial queue                   | 3 seconds                                                                                          |
| Qualification and publication   | 13 min 34 s                                                                                        |
| Image build/start step          | 112 seconds, within the overlapping 219-second image job                                           |
| Successful protected activation | 109.757 seconds                                                                                    |
| Fresh verified recovery receipt | `2026-10-19T01:35:51Z`                                                                             |
| Deployment completed            | `2026-10-19T01:36:10Z`                                                                             |

Source/contracts, dependencies, unit/local tests, populated upgrades, application
build/smoke, governed owner workflows, exact-image topology, image scans,
provenance, browser census, publication and registry readback passed. All 207
browser identities appear exactly once: 202 passes, the same five original skips,
no failures, flaky results or retries. The first run failed an existing morning
digest test race before publication: pagination was attempted before initial
project choices loaded. The correction waits for those choices without changing
the existing deadline, pagination assertions or retry policy.

The host reported the pulled manifest identifier while CI reported its image
configuration identifier. The exact registry manifest's configuration digest
matched the qualified census image. The approved immutable digest, clean-source
label and revision were also verified. No provenance guard was weakened.

## Catalogue and protected activation

Fourteen exact, previously discovered targets were enabled through disabled
owner review, version readback and enabled version 2. Fixed HTTP/TCP targets,
resource/project/environment bindings and audit receipts remain private. The
canonical catalogue is backed up as root-owned 0600 configuration. Identical
bytes are mounted from a root-owned 0640, group 1000 runtime copy outside that
private configuration tree; see the [setup and recovery procedure](../../deploy/endpoint-checks.md).

The first activation failed the unchanged backup guard because the original
worker-readable catalogue was inside the owner-only backup configuration tree.
The prior application was restored. The corrected storage arrangement then
passed fresh encrypted offsite backup, isolated restore and host recovery,
owner sign-in/protected read/probe-session revocation and actual worker job
completion. The existing owner was reused. Catalogue content and targets did
not change, and the backup guard was not relaxed.

Public version, liveness and readiness confirmed the exact release. Web and
worker were healthy on the same digest. PostgreSQL, Caddy, Tunnel and the
unrelated database retained their identities across this successful activation.
This legacy switch sampled 18 HTTP 530 responses between old-release success
at `01:35:51.236505Z` and new-release success at `01:36:11.635072Z`. The enclosing
20.399-second window is not an exact outage duration. Subsequent rollout
controls are governed separately by [ADR 0018](../decisions/0018-promote-verified-main-releases-with-two-web-slots.md).

## Recurring observations and visible paths

All 14 native sources produced current, fresh transport evidence, and all 14
later advanced their observed timestamps again. Thirteen passed; one existing
HTTP endpoint returned 502. The complete scene returned 20 eligible checks,
15 observed including existing readiness, five unmonitored and zero stale.
All 134 canonical resource IDs and parents matched the pre-release baseline;
the original 93 were independently retained during earlier inventory growth.

The verified checking-worker UUID comes from operator startup configuration.
Protocol, measured elapsed time and whether a response arrived are validated
against the actual check before being preserved in an encrypted original and
snapshot sidecar. Legacy persisted signals/details remain compatible, with no
new migration. UI/API/MCP apply the same capability and origin-scope redaction.

New observations produce outbound replay and only received responses produce a
return phase. Timeouts/refusals do not manufacture replies. HTTP failures retain
their failure color. The complete expandable list exposes measured latency and
timestamps. Startup, deduplication, hidden views, pause and reduced motion keep
their existing behavior. Native checks become due after 30 seconds plus jitter;
the single-worker queue determines actual execution cadence independently of
the 300-second freshness deadline. This is monitoring evidence, not packet
capture or a complete uptime SLA calculation.

Live overview verification found the original background-probe style too faint.
[PR 50](https://github.com/iurman/commandry/pull/50) gives recorded checks the
existing corridor/tapered-trail/larger-head treatment, preserves quiet background
probes and excludes future/expired replay phases. Two renderer regressions plus
the source-tagging assertion cover that correction. Its exact qualified image,
deployment and live rendered-request/response proof are maintained on that PR.
The canvas diagnostic counters describe replay phases, not requests in flight.

### Owner-reported visibility correction

The owner subsequently reported that the checks still were not visibly apparent.
PR 50's phase counters proved input activity, not visual acceptance. Local browser
comparison with the current landscape confirmed that world-scale trails became
very thin in overview and pins obscured short paths. The follow-up implementation
uses camera-scaled corridor widths and clearance, larger heads, staggered readable
request/response phases, and pulses on the actual endpoints' containing labels.
The check row explicitly names active replay, waiting and paused states. It
preserves the existing layout, measured data, missing-response behavior and
reduced-motion/hidden-view baselines. Local controlled replay is presentation
verification, not evidence of new production observations. Its qualified release
and actual live visual verification must be recorded separately before claiming
the owner-reported issue resolved.

### Foreground transmission follow-up

The owner again reported that resource-to-resource signals were not visible
after PR 52. Badge pulses and 3D paths still did not meet the requested visual
acceptance. The foreground implementation separates check paths from terrain
depth: persistent dashed routes represent current evidenced checks, and large
labelled arrows carry newly recorded requests and received responses between
their visible resource/group pins. It preserves the existing scene layout and
uses masks for labels and briefing controls. A contained check becomes an
explicit loop, never a fabricated second endpoint. Paused/reduced-motion views
retain static evidence without moving packets. Qualification and production
acceptance require actual packets travelling along visible paths; prior counter
and badge verification is insufficient. Exact activation receipts belong on the
follow-up pull request after the complete release gates pass.

### Owner-selected quieter presentation

On October 19, 2026, the owner rejected the prominent permanent check lines and
labelled arrowheads after verifying that signals were visible. The owner then
selected the quiet-dot and short-trail motion studies, with the existing design
language retained. The follow-up replaces that foreground treatment with small
filled/outlined request/reply dots, two diminishing tail points and local arcs.
There are no permanent check paths or travelling labels. Hover holds a mark,
selection pins its existing evidence, and only the inspected connection gains a
faint guide. The stable recorded-check list offers the same selection. Existing
source cadence, truthfulness, missing-reply, scope and pause/reduced-motion rules
remain. The exact qualified release and production visual acceptance must be
recorded on the follow-up PR; the design studies use simulated activity.

## Retained boundaries

Cloudflare recurring inventory still needs the prepared IYU Labs LLC-only read
token approval. Namecheap recurring domain/renewal reads still need API access
and the configured client-IP approval. No token or registrar API setting was
changed by this monitoring rollout. Five eligible resources lack configured
checks, and the real failing endpoint remains a separate investigation.

The [58-scenario ledger](../plans/observatory-operational-landscape/COVERAGE.md)
retains its physical-device and owner-interpretation limitations. This rollout
does not expand InfraAgent, CRM or Arvo operational tracking. Raw observations, private catalogue, audits, host receipts, request samples and screenshots remain
outside Git. The [live-connections plan](../plans/observatory-live-connections.md)
preserves the broader scope and pending account decisions.
