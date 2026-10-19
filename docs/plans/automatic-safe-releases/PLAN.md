# Automatic verified releases

**Status: Operational. Implemented, merged and automatically promoted in production 2026-10-19.**

**Owner authorization:** 2026-10-19, automatic zero downtime deployment with a
verified candidate before traffic and further latency reductions.

## Completion contract

1. Every main commit starts complete release qualification. Build once off the
   production host. Publish only the qualified image, bound to SHA/run/attempt.
2. Independent host automation selects only current main with all twelve
   successful jobs. Failed, stale, skipped or missing evidence keeps the current
   release. No broad production credentials enter CI.
3. Verify candidate web and fresh recovery in parallel while old web and worker
   remain active. Then require a clean single-worker handover and existing owner
   authentication/read/session-revocation/real-job proof before traffic.
4. Reload stable Caddy routing, preserve the old web, confirm the candidate and
   journal a confirmed release. Roll back failures and interrupted mutations.
5. Test failure handling and a real proxy switch before installation. Observe a
   production rollout continuously; record actual timings, errors, data identity
   and supporting-service preservation. Retain the prior image and web.
6. Enroll only unchanged migration trees and reviewed host controls. Record holds
   honestly. Preserve the single-host limitation and physical-device QA limits.

[ADR 0018](../../decisions/0018-promote-verified-main-releases-with-two-web-slots.md)
is the decision. [The runbook](../../../deploy/rolling-releases.md) defines
operator and agent behavior. The
[production execution record](../../operations/automatic-safe-releases-2026-10-19.md)
records the completed automatic promotion, exact image, rejected candidate,
recovery correction, preserved data and measured request continuity.

## Delivery order

- Implement two-slot transaction, durable recovery journal and candidate smoke.
- Implement attempt-bound main qualification selection and a host health timer.
- Run focused fault tests and a disposable real Caddy/HTTP/stream/static rehearsal.
- Pass source checks, hooks and required hosted CI, then normal merge.
- Inventory host and preserve root control rollback copies. Compare the old and
  new image migration trees before enrolling policy. Install reviewed controls
  without reconciling supporting services.
- Activate the exact qualified main digest through the new path. Sample public
  health/version and authenticated reads across activation. Verify native self
  readiness and canonical IDs. Enable and prove the automatic timer against an
  actual qualified current main revision, then retain normal unattended service.

## Latency and build placement

The measured baseline is 38m17s serial qualification. Parallel CI on main already
completed qualification/publication in 9m51s with all 207 browser identities,
202 passes and five original skips. See the
[CI execution record](../../operations/ci-performance-2026-10-19.md).
The previous production activation took 107.977 seconds and interrupted ingress;
most of that time was fresh recovery verification while old code was available.

This change overlaps independent candidate startup/stability with that recovery
gate and removes the ingress stop. It polls Git refs every fifteen seconds after
an idle controller run. It checks a public registry readiness hint before querying
the workflow API, then verifies all evidence independently. Builds still running
or failing before publication consume no controller GitHub REST calls. A settled
canceled publication is held until a new registry signal. GitHub or
registry unavailability delays promotion. Report queue, CI, pull, candidate,
recovery, confirmation and public error observations separately. No new speed
claim is valid until measured.

Superseded qualification runs on the same branch are canceled rather than
blocking the latest main behind obsolete checks. A canceled run cannot meet
the host's complete-success contract, including one canceled after an upload.
The live cancellation drill and ordinary main run are recorded separately.

The verified current-main run completed in 10m59s, plus two seconds of initial
queue time, with the complete 207-identity census. Its automatic activation took
121.153 seconds, including 89.836 seconds of fresh recovery verification, with
3,495 sampled public requests and no observed failures. This activation is not
faster than the earlier 107.977-second run; recovery duration varies. Candidate
startup and stability overlapped recovery, the clean worker drain took 0.589
seconds, and the proxy reload took 0.707 seconds. The production host builds no
application image. Further performance claims require comparable measurements.

Keep GitHub-hosted builds initially: they are already qualified and avoid load on
production. Local builds remain an operator fallback, not an unattended release
source. A dedicated owned builder with persistent caches remains an option after
measurement. Neither buying a builder nor building on Commandry itself fixes
proxy, database or worker handoff correctness. The
[official GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
and [Docker remote builder documentation](https://docs.docker.com/build/builders/drivers/remote/)
are the relevant provider contracts. No self-hosted runner is provisioned here.
