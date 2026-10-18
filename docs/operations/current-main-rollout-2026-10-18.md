# Qualified main rollout after database shutdown correction

**Status: Operational. Verified production activation on 2026-10-18.**

## Release

The owner requested all recent application work deployed before CI/deployment
restructuring. The prior [presentation rollout](observatory-presentation-rollout-2026-10-18.md)
completed first. This activation adds the [PR 41](https://github.com/iurman/commandry/pull/41)
code and migration plus the [PR 42](https://github.com/iurman/commandry/pull/42)
shutdown correction.

| Field                         | Verified value                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Source                        | `8b94c75e3157604b7940715c1510b447c28083fc`                                                         |
| Image                         | `ghcr.io/iurman/commandry@sha256:becac971a859c2f87999b229855b16b1e884fde792cb9c6b3e766f75c65715ea` |
| Image created                 | `2026-10-18T23:04:33Z`                                                                             |
| Full qualification            | [39174125292](https://github.com/iurman/commandry/actions/runs/39174125292)                        |
| Deployment completed          | `2026-10-18T23:33:59Z`                                                                             |
| Fresh backup/recovery receipt | `2026-10-18T23:33:42Z`                                                                             |
| Prior confirmed application   | `0caf1764ede2cb84d5b26c1989c226c507649365`                                                         |
| Rollback                      | Not needed; prior application remains available                                                    |

## Reliability correction and qualification

The first PR 41 qualification passed its populated upgrade assertions and then
failed during disposable PostgreSQL teardown. It published no image and did
not replace the confirmed production release. A real PostgreSQL probe showed
that `pool.end()` could resolve before both physical client connections ended.
The database wrapper now waits for those end events. Unexpected errors and
shutdown rejections still propagate.

Five lifecycle regressions pass. The close-order regression failed before the
fix, and the real probe changed from zero of two connections ended at close
return to two of two. Both actual populated upgrade audits passed three
consecutive executions each, and the complete source checks passed.

The unchanged main release then passed source/contracts, dependency audit,
unit/local tests, populated upgrades, builds, application smoke, all browsers,
governed owner workflows, exact-image production topology, image scans,
provenance, publication and registry readback. Its 207 browser identities match
the selected source exactly: 202 passes, five unchanged original skips, no
failures, flaky results or retries.

The job took 38 min 17 s. Its complete browser step took 23 min 21 s; the browser
report measured 22 min 59.723 s of execution. These are serial baseline
measurements, not results from the proposed parallel workflow.

## Controlled activation

The installed production manifest was reviewed against the qualified source.
Its only effective configuration additions were six empty optional-reader
variables and three disabled read-only mounts from `/dev/null`. All other
rendered configuration was identical. The old manifest was retained privately,
and the new manifest was installed atomically under the existing deployment
lock. The constrained deployment command itself remained unchanged.

The constrained identity deployed the exact qualified digest through fresh
encrypted offsite backup, isolated restore, host recovery, migration, readiness,
version, real owner sign-in, authenticated read, probe-session revocation and
actual worker-completion gates. No owner account was bootstrapped.

Both web and worker are healthy on the same qualified digest and source.
PostgreSQL, Caddy, Tunnel and the unrelated database retained their container
identities. No temporary running containers remain. The optional provider
readers and additional endpoint-check catalogue remain disabled.

## Live verification and data preservation

Public version, liveness and readiness passed. Protected API reads reject an
anonymous client, accept the existing owner, and reject the revoked probe
session after sign-out. Commandry's own native readiness evidence was read
through its owner API and reported a fresh, available, up/HTTP 200 observation
at `2026-10-18T23:36:44.568Z`, after activation.

Every baseline resource ID and parent, all 15 project IDs and all nine Commandry
resource bindings are unchanged. The complete paginated population remains
134 resources. The earlier 41 inventory additions belong to the separate
live-connection work; this deployment added no inventory.

In the real owner browser, pointer Stop watching returns Watch unpressed,
pointer Stop presentation returns Start presentation, and the stopped camera
remains stable. The complete landscape has 134 resources, 160 representations
and eight primary groups. The 390- and 320-pixel viewports fit without horizontal
overflow. The normal viewport and overview were restored. These checks do not
certify physical phones, TV viewing, subjective motion quality or controlled
GPU frame rate. The existing [58-scenario ledger](../plans/observatory-operational-landscape/COVERAGE.md)
retains its explicit physical-device and interpretation limits.

## Interruption and remaining work

This rollout used the existing service switch, which still interrupts ingress.
The corrected public sampler recorded 16 HTTP 502/530 samples between old-release
success at `23:33:41.551484Z` and new-release success at `23:34:00.250269Z`.
The 18.699-second enclosing window is not an exact outage duration. An initial
sampler using the default Python client was rejected with 403; that evidence
was retained separately. The normal verification client and corrected sampler
reached the old release successfully before the switch.

CI restructuring remains a [proposed implementation](../plans/ci-deploy-performance/PLAN.md)
pending the owner's requested confirmation. Automatic deployment and zero
downtime topology changes are not enabled. Recurring provider credentials and
the additional endpoint-check activation remain separate reviewed operations.
Raw logs, browser reports, screenshots, host receipts and request samples are
retained in private QA evidence; credentials and private host inventory are not
part of this record.
