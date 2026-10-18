# Observatory presentation release, October 18, 2026

**Status: Operational. PR 39 and its PR 40 pointer-control correction are deployed and verified. PR 41 is outside this activation.**

## Scope and owner decision

The owner requested completion and deployment of the remaining PR 39 handoff
items before the separately held deployment architecture discussion:
presentation-default confirmation, hardware-browser verification, and a complete
release run for the affected acceptance behavior. The owner explicitly selected
"Keep the current defaults" on October 18, 2026.
[ADR 0017](../decisions/0017-confirm-observatory-presentation-defaults.md)
records that decision and resolves OQ-039. No timing or density settings changed.

## Qualified and active release

- [PR 39](https://github.com/iurman/commandry/pull/39) implements the presentation,
  watch, briefing, labels and arrangement.
- [PR 40](https://github.com/iurman/commandry/pull/40) fixes pointer Stop actions
  and records the accepted defaults.
- Active revision: `0caf1764ede2cb84d5b26c1989c226c507649365`.
- Image: `ghcr.io/iurman/commandry@sha256:7683d1e902d2f6dbde55c64620294d1860540220776ba839c0dc38b4d9a6504f`.
- Image creation time: `2026-10-18T22:00:42Z`.
- [Complete release run 39169514777](https://github.com/iurman/commandry/actions/runs/39169514777)
  passed at `2026-10-18T22:26:23Z`, after exactly 37 minutes of job execution.
- The unchanged browser policy retains one worker, zero retries and all 207
  source-listed identities exactly once: 202 passes, the same five original
  skip identities, no failures or flaky results. Browser execution took
  22 minutes 41 seconds.

Source, contract, dependency, unit/local, populated upgrade, application build,
smoke, governed owner, exact-image production topology, provenance, image scan,
publication and digest readback gates passed. Both application containers run
the same qualified image with the expected revision and healthy status. Passing
the configured scan gate does not certify an image without vulnerabilities.

## Production activation

The constrained deployment completed at `2026-10-18T22:28:53Z`. The fresh
encrypted offsite backup, isolated restore and host recovery receipt completed
at `2026-10-18T22:28:36Z`. Forward migration, built-in liveness/readiness/version,
owner sign-in, authenticated read, probe-session revocation and actual worker
completion passed. The existing owner was reused and rollback was not needed.

Independent HTTPS checks verified the exact public SHA and digest, readiness,
liveness, Secure owner-session issuance, authenticated Home, Infrastructure,
Integrations and Account pages, sign-out, and protected API denial. PostgreSQL,
Caddy, Tunnel and the unrelated database retain their container identities. No
disposable migration, backup, restore or smoke containers remain. This release
introduces no schema change beyond the already-applied migration 0074.

### Canonical preservation and concurrent inventory growth

Complete paginated comparison preserves all original 93 resource IDs and
parents, all 15 project IDs and all nine Commandry resource bindings. During
qualification, the separate [live-connections work](../plans/observatory-live-connections.md)
added 41 inventory records: 19 domains, 17 DNS zones, four deployment/Worker
records and one provider. Production now returns 134 resources. These additions
are not attributed to this image activation.

The initial strict equality assertion correctly detected the larger population.
Its failure and complete observed snapshot are retained. A separate reconciliation
verified zero missing original IDs, zero original parent changes, unchanged
project/binding sets, and the exact active image. No inventory record was removed
or reverted to make the comparison pass.

## Hardware-browser and acceptance evidence

The native browser used for live verification was checked with a task-owned
loopback WebGL 2 diagnostic. It reported ANGLE with AMD Radeon 890M graphics and
no software renderer. The diagnostic tab and server were closed after evidence
capture. Live terrain rendering and changing camera/frame diagnostics were
observed in that same browser; this is environment and interaction evidence,
not a controlled frame-rate benchmark.

The deployed presentation advances naturally between successive primary host
groups, with the
primary-group roster, briefing and member callouts. Selecting a primary group
starts Watch; selecting a sub-resource leaves Watch inactive. Pause holds the
camera pose, and deliberate resume and Overview work. Midnight theme and the
390/320-pixel layouts were checked; original System theme and viewport were
restored. Those first layout checks used source 33d before the pointer-only
correction, with no intervening layout/briefing changes in PR 40.

On that 93-resource landscape, a stationary 61.873-second hardware-browser
observation across ordinary refreshes retained exact camera pose, terrain
bounds, label identities and zero CSS-pixel anchor drift. The nested group of
48 unmapped repositories showed 14 callouts, overflow counts of 15 and 19, all
48 selectable inspector names and no settled label overlap. The unchanged full
release and controlled component/renderer cases re-establish the affected
A02, D01-D04 and E05 behavior; earlier source evidence remains dated rather than
being relabeled as a new physical-device run.

On the corrected production image, actual pointer clicks now change
**Stop watching** to unpressed **Watch** and **Stop presentation** to
**Start presentation**. Camera position and target remain fixed afterward.
Overview reports the current 134-resource, eight-primary-group landscape. A
110.007-second stationary observation on this corrected release retained exact
camera pose, terrain bounds and all eight label identities at its three captured
samples, with zero measured CSS-pixel anchor drift across normal refreshes. The current inventory also fits both
390- and 320-pixel viewports without document horizontal overflow; the viewport
was reset afterward.

The [58-scenario ledger](../plans/observatory-operational-landscape/COVERAGE.md)
retains its independent physical-device and owner-interpretation limits. This
rollout does not certify a physical TV/phone, subjective pacing preference,
complete uptime history or every future integration.

## Failures retained and correction

The initial [PR 39 release 39165962511](https://github.com/iurman/commandry/actions/runs/39165962511)
passed all gates and deployed source `33d0086d5dd2efd08e9d567627cd00a77c2a5fad`
at `2026-10-18T21:40:42Z`, using
`ghcr.io/iurman/commandry@sha256:bc69ba605156696ab2febcb20d08cf141e8efc6f9b852fe5d332b60246eb8182`.
Live verification then found a pointer-specific Stop defect that the existing
click-only component tests did not reproduce.

The stage's pointerdown handler changed the mode to manual before a roster
button's click toggled it, starting automatic motion again. Enter on the same
control stopped it. Mouse and touch pointer-sequence regressions failed before
the scoped fix and passed afterward; all 94 affected component-suite tests
passed locally. Roster pointer events now remain in the roster, and actual
terrain input still interrupts motion. The existing built browser journey now
clicks Stop presentation before restarting it. No release gate was removed.

The earlier PR branch's two-worker result remains historical: 201 passes, five
skips and one population-observation timing failure that passed in isolation.
Neither that isolated pass nor an old watcher timeout replaced full qualification.

A nonblocking copy follow-up remains: the nested Unmapped repositories
inspector uses a generic "Project repositories" member-list heading while its
headline correctly says all unmapped. All names remain reachable. This wording
cleanup is separate from the deployed Stop correction.

## Source boundary and next release

While PR 40 qualified, [PR 41](https://github.com/iurman/commandry/pull/41)
advanced main to `3de025464f1b7a2e94ab1d03a9d7541dfe4405d3`. It includes
migration 0075 and production Compose changes and has its own
[release run 39171649700](https://github.com/iurman/commandry/actions/runs/39171649700).
It failed after its upgrade assertions passed, on a PostgreSQL pool shutdown
race. No PR 41 image was published or deployed by that run; the qualified
PR 39/40 image remains live. The follow-up reliability correction is described
in the performance proposal. PR 41 is not part of this activation.

The operator kept this owner-prioritized PR 39/40 correction frozen at its
qualified source, verified that it is an ancestor of the new main, and
rechecked the unchanged installed deployment/Compose controls and running
source 33d before approval. The approval remained exact-image scoped with the
existing root gates intact. No newer application release was downgraded.

Collector OS and operational-source changes described in the live-connections
record were performed by that separate work. This rollout did not alter them.
The owner was asked whether PR 41 deployment should precede the requested CI
performance work; that priority decision is separate from this completed release.

## Activation timing and remaining deployment work

The correction took about 107 seconds from operator intent to completion.
Two-second public sampling recorded nine HTTP 502/530 results between
`22:28:36.520Z` and `22:28:53.216Z`, bounded by old-release success at
`22:28:34.390Z` and new-release success at `22:28:55.297Z`. The approximately
21-second enclosing window is not an exact outage measurement. The initial
activation had a similar observed window. Current deployments still interrupt
traffic; a zero downtime traffic switch is a separate proposed change.

The [CI/deploy performance proposal](../plans/ci-deploy-performance/PLAN.md)
uses these measured runs and preserves the existing qualification and recovery
controls. No CI workflow, automatic deployment controller or production topology
was changed by this rollout. Detailed runtime receipts, canonical snapshots,
private inventory and credentials remain outside Git in their existing stores.
