# Gravity infrastructure integration

**Status: Operational implementation; verified locally, not deployed**

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
verified. Production telemetry, provisioning and deployment were not changed.
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
