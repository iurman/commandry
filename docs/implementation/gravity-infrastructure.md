# Gravity infrastructure integration

**Status: Operational; deployed and verified in production**

The owner requested the accepted Gravity study in the actual infrastructure
overview and TV wallboard. The implementation uses the existing authenticated
`GET /api/v1/infrastructure/overview` and canonical resource records.

## Implementation

- `packages/ui/src/gravity` owns the shared surface, renderer, labels, camera,
  activity drawing and canonical-resource presentation adapter. Production
  loads the renderer dynamically; `apps/lab` injects its own separate simulator.
- Gravity is the default overview/wallboard presentation. Topology, list,
  server-side search, project filtering, full pagination, snapshot timestamps,
  source evidence, refresh errors and inventory management remain available.
- Actual containment creates nested resource wells. A parent outside the page
  does not create a phantom host. Project mode uses the first explicitly linked
  project sorted by ID for layout, without hiding other memberships in the
  inspector. Custom sectors and colors are device-local presentation only.
- The API returns a total direct-child count independent of scope/page, used
  by a bounded size mapping. Uniform size remains available. Existing host
  percentage metrics do not establish total RAM capacity; RAM-capacity sizing
  stays in the synthetic study until a real capacity measurement is available.
- Source freshness labels never claim service availability. The current API's
  `health: unknown` remains explicit even for a reporting host.
- New persisted events younger than one minute may pulse their actual resource.
  Initial loads, page/scope changes, reduced motion, pause/delay and offscreen
  periods do not create queued playback. No real event currently records an
  inter-server destination, so this release draws no simulated request traffic.
- Composed, slow orbit, guided tour, focus, motion pause, ambient preference,
  system/Porcelain/Midnight surface, custom sectors and palette controls share
  the reviewed renderer. Cached root placement survives additions and polling;
  changing layout configuration deliberately recomposes the view.
- The complete visible-page resource selector and ordinary list remain usable
  when WebGL cannot initialize or its context is lost.

The architectural decision is [ADR 0013](../decisions/0013-share-the-gravity-renderer-with-production.md).

## Verification

Verified on 2026-10-15 using Node.js 24:

- `pnpm check`: formatting, lint, workspace types, package boundaries, generated
  OpenAPI validation and lab isolation passed. Two existing unused-variable
  warnings remain in the unrelated GitHub activity test.
- `pnpm test`: 225 root tests, 33 lab regression tests and the script suites
  passed. New coverage includes canonical identity, containment cycles, complete
  child counts, stable arrivals, footprint area, preference validation,
  observation provenance, deduplication, pause/offscreen baselines, unavailable
  WebGL, selection and theme precedence.
- `pnpm test:integration`: 90 PostgreSQL integration tests passed, including
  child counts when the child is on another resource page.
- `COMMANDRY_E2E_FILES=infrastructure-overview.spec.ts pnpm test:integration --real-browser`:
  all 12 built-app browser cases passed across desktop, 390px and 320px widths.
  They cover both themes, focus-frame sizing, saved custom sectors, list/topology,
  search, complete pagination, delayed snapshots, source evidence, recorded
  observations and manual interruption. A 1920x1080 wallboard fit check passed.
- The in-app browser exercised the integrated wallboard through a disposable
  database and the normal resource/source receiver APIs. Six records are labeled
  as synthetic preview data. Host selection exposed the actual fixture metrics,
  nested service, unknown availability and original event evidence. TV/System
  used Midnight; the captured warning/error log was empty.

The WebGL failure test mocks renderer initialization failure. A physical GPU
context reset, a physical television and fleet-scale level of detail were not
verified by the local checks. Production activation is recorded below.
Real cross-server traffic and RAM-capacity sizing require observed data that
this overview contract does not currently provide.

## Release verification and MCP coverage

The first production release workflow stopped before publication on two focus
lens geometry assertions. Those checks measured the animated bounding box before
it settled on the CI runner. The geometry check now opts into reduced motion;
normal motion is restored explicitly before verifying that slow orbit can be
selected and scene motion can be paused. The completed geometry assertion and
release gates remain required.

The owner requires MCP access and agent-facing workflow documentation alongside
new or materially changed features. This requirement is recorded in the
repository agent guide and as a source-linked requirement in the live Commandry
project. The current production MCP still supplies four project knowledge read
tools. Complete inventory reads, source management, presentation preferences
and inventory writes are explicitly deferred to the comprehensive MCP planning
chat `01a141c1-739c-7cc0-8aa3-aa3b817f7bd5`; this release does not add an agent
mutation capability. That plan must define the exact scopes, risks, approvals,
audit and shared-service contracts before implementing those operations.

## Production activation, 2026-10-15

The owner-authorized production deployment completed at 2026-10-15T23:31:40Z
(16:31:40 America/Los_Angeles). Gravity is active at
[the infrastructure overview](https://commandry.site/infrastructure) and
[the wallboard](https://commandry.site/infrastructure/wallboard).

- Source revision: `3d0ff56d8335df0262e8c7286b8dbec24322ecb5`, the normal merge
  of [PR 9](https://github.com/iurman/commandry/pull/9) after
  [PR 8](https://github.com/iurman/commandry/pull/8). Both tested PR heads and
  their preceding main heads remain ancestors.
- Verified image:
  `ghcr.io/iurman/commandry@sha256:2695200f5cf3e5e9faeb54e82a5883e8a749a58e3a457a9cff79dce6a3309b57`.
  Its build timestamp is 2026-10-15T23:14:40Z.
- [Release workflow 38821718426](https://github.com/iurman/commandry/actions/runs/38821718426)
  passed source, dependency, test, build, authentication, production topology,
  image, provenance and registry gates. The complete browser run passed 195 cases
  with three explicitly skipped cases. Root and lab suites passed 225 and 33
  tests respectively.
- The existing constrained deployment identity and root-owned controls performed
  backup, isolated restore, migration, owner sign-in, protected read, worker
  completion and probe-session revocation. The final deployment receipt records
  `succeeded`, `smokeVerified: true` and `rollback: not_needed`.
- Backup snapshot
  `84d378442f0e5a26e116d196b563590963342cab820dae0b0904afea7c81f651`
  completed at 2026-10-15T23:31:24Z. Offsite, verification, isolated restore and
  isolated host-recovery-drill checks all passed. These checks do not prove
  recovery after complete loss of the VPS.

An earlier host attempt stopped at the backup gate and restored the preceding
application release. Its isolated database restore passed, but the failed host
recovery child reason was not exposed by that attempt's receipt. A separate
unmodified host-bundle/recovery verification passed before the complete
constrained deployment was retried successfully. No gate or installed deployment
control was weakened or changed.

Post-deployment `/version`, liveness and readiness matched the exact release.
The web and worker were healthy. Commandry's PostgreSQL container and the
unrelated Ephemera PostgreSQL container retained their identities. Existing
Caddy and Tunnel container identities were retained.

A complete authenticated inventory comparison preserved all 91 canonical
resources: 18 registered hosts, 13 services and 60 repositories across 15
projects. IDs, names, kinds, parents and project-resource links were unchanged;
no duplicate or demonstration inventory was imported. Complete pagination,
host search, project scopes, direct-child counts and absence of dangling parents
were verified. Registration does not establish that a machine is running.

The existing five sources were preserved. Electra, Pleiades, Maia and Titan each
had fresh host observations and four source-backed metrics. Availability remains
unknown for every resource. The signed-in live browser verified Electra's
measurements and nested services, focus lens, composed/orbit cameras,
System/Porcelain surfaces, topology/list alternatives, the TV wallboard and new
source-event updates. No warning or error was captured after the release reload.
No synthetic request traffic or lab fixtures were used in that browser check.

The owner direction is stored as source-linked requirement
`741dcce3-45b1-4e66-8fe1-b8a56d49e8b5` in the live Commandry project. A
post-deployment MCP project brief successfully read it. This preserves the
existing read-only MCP credential scope; broader access remains the separate
planning work described above.
