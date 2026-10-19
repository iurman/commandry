# Automatic verified production releases, October 19, 2026

**Status: Operational. Automatic production promotion verified.**

The owner requested automatic main releases that retain the confirmed version
until a candidate passes verification, plus a 10-15 minute qualification target.
[PR 47](https://github.com/iurman/commandry/pull/47) implements the transaction;
[PR 49](https://github.com/iurman/commandry/pull/49) pins the host Docker endpoint.
Both merged normally. [ADR 0018](../decisions/0018-promote-verified-main-releases-with-two-web-slots.md)
and the [operator runbook](../../deploy/rolling-releases.md) define the contract.

## Exact release and qualification

The automatically promoted source is
`939ab0da2b0d4bed5e61f10d2a21546e15eda0ec`, the normal merge of
[PR 50](https://github.com/iurman/commandry/pull/50), including the live-probe
overview refinement. [Run 39187369917, attempt 1](https://github.com/iurman/commandry/actions/runs/39187369917)
passed all twelve jobs. Its first job started at `01:53:14Z`; immutable
publication/readback completed at `02:04:13Z`: **10m59s**, plus two seconds of
initial queue time. All 207 browser identities remain: 202 passes, five original
skips, zero failures, flaky results or retries. No production credentials enter
Actions, and the production VPS builds no application image.

The qualified and serving immutable reference is:

`ghcr.io/iurman/commandry@sha256:76ff25325ac23848c659d52631b0c2eae75b93997cd23f83d19fac67023fc4d1`

The host independently required current main, the successful run attempt and
all jobs, bot-created exact-digest commit status, registry digest readback,
clean source labels and matching enrolled migration/control fingerprints.
The public registry hint avoids spending the anonymous GitHub API allowance on
every unfinished build. It does not authorize deployment by itself.

The earlier qualified `8b55420` main run took 13m38s plus 77 seconds of initial
queue time. Main advanced before activation; it was not promoted. The complete
branch rehearsal took 12m14s plus 39 seconds of initial queue time. These results
support the target but do not establish a steady percentile or a cold/warm
cache benchmark. The earlier [CI record](ci-performance-2026-10-19.md) preserves
the 38m17s serial baseline and initial parallelization measurements.

## Rejection and correction before promotion

A deliberately mismatched enrolled control fingerprint exercised the actual
automatic selector. It rejected the qualified current-main image at provenance
verification in 10.538 seconds. The confirmed environment and release marker,
all six existing container IDs/start times, worker and traffic remained
unchanged. No candidate application started. The genuine enrollment was then
restored and only that intentional test hold cleared.

The first genuine candidate passed private startup, liveness, readiness,
version and stability checks, but its fresh recovery gate failed. The systemd
service's `ProtectHome=read-only` made Restic's existing `/root/.cache/restic`
read-only. The controller restored routing/environment/marker and stopped the
candidate, retaining the old web and worker. It held that rejected SHA for
diagnosis. No traffic switched and public samples remained successful.

Under the deployment lock with Restic idle, the existing cache was moved to
private `/var/cache/commandry-restic`, preserving a compatibility symlink at the
old path and mode `0700`. The same snapshots command failed before the change
and succeeded afterward under the exact service sandbox. No recovery check or
filesystem protection was disabled. The runbook records setup and reversal for
a new or recovered host. Only the diagnosed current-source hold was cleared.

Earlier image construction also failed on an excluded Compose manifest; it
never qualified or published. The corrected actual Docker build context
reproduced the source policy fingerprint. Superseded workflows were canceled;
canceled runs could not meet the host's complete-success requirement.

## Successful automatic handoff

The genuine retry was selected by the host service, without a manual production
image activation. At `02:15:36Z`, the new private web was healthy with the exact
source/digest while the old web still served and the recovery gate ran.
Fresh R2 backup, isolated database restore and host recovery all passed at
`02:16:09Z`. The sole old worker drained cleanly before its replacement started.
The candidate passed owner login, protected read, probe-session revocation and
an actual worker job before traffic changed. No owner was bootstrapped.

Caddy validated and gracefully reloaded routing. Public sampling first observed
the new source at `02:16:22.581Z`. Confirmation completed at
`02:16:34Z`, with `web_next` active and the previous `b007960` web still running.
The durable pending journal was removed after the confirmed audit succeeded.
Genuine policy is enabled and the host timer is enabled and active.

| Measured stage | Duration |
| --- | ---: |
| Automatic selection/promotion transaction | 121.153 s |
| Image pull, already cached after rejection drill | 1.264 s |
| Candidate startup | 7.240 s |
| Candidate native stability | 12.166 s |
| Complete fresh recovery, overlapping candidate work | 89.836 s |
| Remaining wait for recovery after candidate stability | 70.977 s |
| Clean old-worker drain | 0.589 s |
| New-worker startup/readiness | 6.317 s |
| Candidate authenticated read and real-job smoke | 5.230 s |
| Validated proxy switch | 0.707 s |
| Confirmation checks | 12.376 s |

The overlapping recovery and candidate measurements must not be added together.
This activation was longer than the historical 107.977-second activation;
recovery duration varies, so no comparable total-duration improvement is claimed.
The improvement is continuous HTTP serving and overlapped independent work.

## Public continuity, data and cleanup

From `02:03:44.729Z` through `02:17:09.813Z`, 3,495 sampled public readiness,
version and authenticated project-read requests returned HTTP 200 with zero
observed errors. The series spans both rejection paths, diagnosis and successful
promotion, and observes the exact old-to-new version transition. Sampling has
finite intervals; it does not prove every request or external service was healthy.
The sampler signed out its own session and verified protected access returned 401.

Post-release owner login, four protected page responses, session revocation and
Commandry's existing native self-readiness evidence passed. All 134 canonical
resource IDs/parents, 15 project IDs and nine Commandry resource links matched
the baseline. PostgreSQL, old web, Caddy, Tunnel and the unrelated database kept
the same container IDs and start times. Only the business worker was replaced.
Existing provider/reader configuration was preserved by updating only the three
release identity fields. Optional provider credentials remain separate work.

Twenty focused fault cases and a real disposable Caddy rehearsal supplement the
hosted qualification. The rehearsal passed 98 requests, in-flight HTTP and SSE
completion, both generations of static assets and rollback, then removed its
containers, network and fixtures. Post-switch failure, watchdog and crash recovery
were exercised with controlled transports; an intentional post-switch production
failure was not injected. The real recovery failure proves pre-switch production
rollback. Long-term uptime and physical-device motion QA are separate limits.

Private source/run receipts, request samples, container identity comparisons,
recovery evidence and authenticated probe details remain outside Git. The live
timer, enrolled controls, private reusable smoke input, prior release and root
rollback copies are production resources and intentionally retained. Temporary
public samplers and disposable test runtimes are stopped. One VPS, database and
tunnel remain shared failure domains. Changed schema/control fingerprints hold
for operator review instead of automatically accepting incompatible releases.
