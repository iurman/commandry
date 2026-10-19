# CI performance verification, October 19, 2026

**Status: Operational. Branch and main qualification/publication verified on 2026-10-19.**

The owner set a 10-15 minute release qualification target. The implementation
in [PR 44](https://github.com/iurman/commandry/pull/44) uses six isolated browser
shards and overlaps source, unit, host integration and image work. No existing
browser case, assertion, deadline or deployment recovery gate was removed.

## Serial baseline and branch result

| Measurement                      |                                                        Serial main baseline |                                                  Corrected branch benchmark |
| -------------------------------- | --------------------------------------------------------------------------: | --------------------------------------------------------------------------: |
| Run                              | [39174125292](https://github.com/iurman/commandry/actions/runs/39174125292) | [39180830864](https://github.com/iurman/commandry/actions/runs/39180830864) |
| Qualification execution          |                                                                 38 min 17 s |                                                                 11 min 34 s |
| Initial queue                    |                                                         Reported separately |                                                                        66 s |
| Browser coverage                 |                                                              207 identities |                                                         Same 207 identities |
| Browser results                  |                                             202 passed, five original skips |                                                 202 passed, same five skips |
| Failures, flaky results, retries |                                                                        Zero |                                                                        Zero |
| Publication                      |                                             Exact image published/read back |                                                    Disabled for branch runs |

Execution is measured from the first job starting through the final relevant
job completing. Initial queue time is separate. Waiting between dependent jobs
is included. The branch result includes all qualification gates and the final
coverage census, but has no publication job. It is not a main publication
benchmark or a stable performance percentile.

## Verified main qualification and publication

The normal merge is `85f38fe79d730890dec60d761394881464be4bd2`.
[Main run 39181854634](https://github.com/iurman/commandry/actions/runs/39181854634)
started its first job at `00:40:45Z` and completed publication/readback at
`00:50:36Z`: **9 min 51 s**, plus three seconds of initial queue time. This is
74.3 percent less execution time than the 38 min 17 s serial baseline. Both the
11 min 34 s branch result and this main result meet the owner's latency target.

All 207 identities are present exactly once: 202 passes, the same five skips,
zero failures, flaky results or retries. Source, unit, host integration,
image/topology/scans, six browser jobs and the aggregate census passed before
publication. The same loaded image was pushed and pulled back with matching
image ID. The qualified immutable reference is:

`ghcr.io/iurman/commandry@sha256:2eb21f4800b1bb6ae29f14ec119bc8624830b82cca9a96962647dcd493b980b6`

Main source checks took 191 seconds, unit/local tests 130, host integration 416,
and image/topology/scans/export 176. Browser jobs took 354, 251, 291, 254, 294
and 252 seconds; the aggregate census took 15 and publication/readback 39.
These are overlapping jobs, so their durations must not be added as elapsed
qualification time. Two successful runs are evidence of the improvement, not a
stable percentile or a guarantee against future runner/queue variance.

## What reduced the critical path

The branch source job took 189 seconds, unit/local tests 193 seconds, populated
upgrade/build/owner checks 412 seconds, and image construction/topology/scans/
export 204 seconds. Those jobs overlap. The six browser jobs took 472, 264,
292, 249, 289 and 227 seconds, including their own setup, image load, tests,
verification and cleanup. The complete census took 14 seconds.

The browser critical path is now the longest isolated shard rather than the
sum of all desktop and phone checks. The image is built once, exported with
checksums and source/run/attempt identity, and loaded into each independent
stack with `--no-build`. Every stack has one browser worker and its own database.
The producer's image ID and checksums bind consumers independently of downloaded
metadata. The final census requires every selected-source identity exactly once
and rejects new skips, failures, retries and changed execution settings.

Only the separate main publication job receives package-write access. It loads
the same already tested image, validates its original identity, publishes and
compares the pulled digest's image ID. Source, unit, host integration, image,
all six browser jobs and the aggregate census must pass first.

## Correction found during the benchmark

The [first run](https://github.com/iurman/commandry/actions/runs/39180400814)
passed source, unit, host integration, topology and scan checks, then the new
clean-source export guard rejected Trivy's cache under the checkout. Browsers
and publication did not run. Both scan cache directories now use runner
temporary storage. The clean-source requirement and both scans remain intact.
The corrected complete branch run passed.

## Scope and remaining work

This work changes release qualification tooling. It introduces no application
behavior, production secret access, MCP capability, production deployment or
traffic switch. The existing verified application release remains independent
of this CI adoption. A public version/liveness/readiness read after the main
run confirmed production still on `8b94c75`, with health passing. No application
code or installed deployment control changed. Main qualification is still
manually dispatched; automatic main-commit promotion and zero downtime remain separate design work.

The [implementation plan](../plans/ci-deploy-performance/PLAN.md) records the
10-15 minute target, self-hosted alternatives and failure boundaries. The current
207 browser cases are 69 journeys at three screen sizes. Source enumeration
extends the census when future tests are added; the original five skips have an
explicit reviewed policy.

Image transport artifacts have one-day retention and diagnostics seven days.
A complete rerun uses a fresh workflow attempt; mixing partial reports or image
artifacts across attempts is rejected. Production backup, restore, migration,
owner-auth and worker verification requirements are unchanged. Raw job metadata, reports and logs are
retained in private QA evidence as well as the linked GitHub runs.

Focused failure tests exercised artifact/provenance and report mutations. A
deliberate cancellation/registry failure drill and fully controlled cold/warm
cache comparison were not performed; they remain follow-up validation before
automatic promotion. They are not inferred from these passing runs.
