# Observatory acceptance and verification plan

**Status: Proposed. All scenarios below are requirements for future implementation, not completed test results.**

Read [PLAN.md](PLAN.md) for behavior and [RESEARCH.md](RESEARCH.md) for the actual baseline. Tests must use the shared shipped component and application services. Do not create a prettier parallel lab renderer that does not ship.

## Test populations

**F1: Real mixed shape.** Preserve the actual 91-resource population shape: 60 repositories, 18 hosts, 13 services, 48 unlinked repositories, seven multi-project resources, four observed hosts and unknown availability throughout. Use private local data only in the authorized local copy. A committed deterministic fixture reproduces these characteristics with synthetic identifiers/names, not private inventory or host addresses.

**F2: Rich operational fixture.** Explicitly synthetic provider accounts, at least two environments, an application spanning a host and Cloudflare, a monorepo with several deployments, an application using two repositories, required/optional services, one shared database and repo references from several projects. Every generated relation has declared source/target kinds. Counts are independently known from fixture definitions.

**F3: Scale and awkward shape.** At least 257 active rendered representations in a GPU correctness case; a 1,000-resource mixed hierarchy; a deeply nested host/guest/container hierarchy; a wide high-child-count group; duplicate names; long labels; no-project items; missing parents; cycles in non-containment dependencies; and a zero-resource view. Larger inventory need not imply 1,000 full-detail terrain holes.

**F4: Real evidence vertical slice.** One owner-approved actual deployed service with a supported read-only availability source, explicit target/environment/provider mapping and source evidence. Verify its passing state and a safe controlled failure/recovery using a disposable endpoint/real adapter. Do not intentionally break a production service to demonstrate the UI. A synthetic event in a real database is still synthetic.

**F5: Authorization.** Owner, scoped project client, resource-only client, Work/run-denied client, security-denied client, revoked/expired client and overlapping/shared-resource visibility. Complete aggregate counts must be computed after authorization.

## A. Meaning, identity and complete access

- **A01:** F1 overview represents all 91 IDs through the union of aggregate memberships and expanded resources. The union contains no foreign IDs. Counts are exact; expanding/collapsing changes neither canonical identity nor the total.
- **A02:** Repositories, hosts and services have distinct representation kinds. A repository never enters the camera's host-tour list merely because it has no parent.
- **A03:** All 48 unlinked repositories remain reachable through their collection and global search. They are not called undeployed, inactive or healthy without evidence.
- **A04:** Multi-project/shared items have one canonical ID and explicit reference instances. Global counts do not double count aliases. Arbitrary UUID ordering cannot pick the meaning of the primary group.
- **A05:** A nested guest host retains its actual kind and parent. Physical containment is not rewritten when the user selects a project/provider view.
- **A06:** Search for any fixture member, including a collapsed member with a truncated visible name, reveals and focuses that exact identity. Clearing search restores prior grouping/selection when still authorized.
- **A07:** All host, project, provider and per-sector custom views obey the same membership-conservation and permission rules. No visible resource pages, page rotation or fixed resource cap returns.
- **A08:** An unresolved mapping is explicitly unknown. Same project, similar name, repository URL, provider proxy or container prefix cannot create a deployed-as relationship automatically.
- **A09:** A fault in a collapsed required child appears in its ancestor summary and attention rail. Expanding the chain identifies the child and evidence without duplicate incident counts.
- **A10:** At F3 scale, aggregation is explained by count and expansion path. The resource outline/search remains complete when graphics detail is reduced or WebGL is unavailable.

## B. Truthful status and coverage

- **B01:** F1 shows zero observed service-availability coverage, not 13 healthy services or 100 percent uptime. Host telemetry badges remain separate.
- **B02:** A recently refreshed page with old observation timestamps becomes stale correctly. A previously passing expired health observation does not remain green.
- **B03:** Four passing requirements plus one failing and one unmonitored yield those exact counts. All-passing observed subset plus missing required checks yields incomplete coverage, not all operational.
- **B04:** Required and optional service failures retain their declared roles. An optional development service cannot silently declare the production application down.
- **B05:** Maintenance, explicitly retired and intentionally stopped resources retain lifecycle/maintenance labels. Acknowledged/snoozed incidents do not become healthy observations.
- **B06:** Capacity pressure, failed PR checks, an agent waiting for approval, security findings and service availability can coexist without overwriting each other.
- **B07:** No scanner configured, inaccessible/disabled scanner, expired result and a completed scan with zero observed findings are distinguishable. None is labeled uncompromised.
- **B08:** Conflicting observations preserve source evidence and age. A healthy source cannot erase a separate current required failure.

## C. Provider relevance and ingestion

- **C01:** A fresh unresolved Workers incident plus an explicit relevant dependency yields potential exposure, orange, unless local impact is independently confirmed. It does not manufacture a local outage.
- **C02:** An unrelated WARP or remote-location notice remains an advisory, with no red service rim and no local incident count. Unknown geography/dependencies are relevance unknown, not proven unrelated.
- **C03:** A dashboard/build-control incident can indicate delayed deploy/administration while the application's passing availability remains visible.
- **C04:** A current failing service check produces confirmed local impact. Suspected provider causation remains separate unless established by evidence.
- **C05:** Resolution, monitoring and scheduled maintenance transitions preserve original IDs/history and correctly clear or update current exposure after fresh reconciliation.
- **C06:** Duplicate updates, out-of-order records, process restart and concurrent poll delivery do not duplicate incidents, alerts or pulses.
- **C07:** A failed, truncated, malformed, oversized, rate-limited or unauthorized feed read retains last-known notices with stale/unavailable source state. It never resolves them because the fetch returned no usable records.
- **C08:** Full successful unresolved snapshots reconcile open notices. A recent-50 RSS history is not labeled complete provider history. Separate maintenance records retain their windows/timezones.
- **C09:** One server poller handles a provider endpoint independent of viewer count. Backoff/Retry-After, response limits, allowlisted hosts and timeouts are exercised with a disposable HTTP source.
- **C10:** Embedded HTML, malicious links and agent instructions in a feed are inert. No arbitrary URL fetch, alert escalation, external notification or operational action follows from text alone.

## D. Layout, labels and geometry

- **D01:** After settling in composed mode with no input/data change, group centers remain fixed and label anchors stay within a proposed 1 CSS pixel drift over 60 seconds on the baseline viewport. Ambient lighting may change; node location/meaning may not.
- **D02:** Repeated identical snapshots and ordinary 15-second refreshes do not reset the layout/camera, replay entries, lower mesh density or flicker label admission.
- **D03:** Adding/removing one child keeps unrelated group centers stable. If a group requires expansion/reframing, use an explicit coherent transition and preserve the owner's active reading context.
- **D04:** Dense label geometry has no overlap among required overview labels, no detached labels implying the wrong subject, and no critical group hidden solely because a low-priority label was admitted first. Leader lines/aggregate text resolve ambiguity.
- **D05:** For a known circular/elliptical fixture basin, compare rendered silhouettes at overview, close-up and oblique angles against its analytic reference. Proposed visible-edge deviation target is at most 2 CSS pixels for a sufficiently sized basin; approve the sampling method before using it as an automated gate. Unintended square/hexagonal stair-step rims fail visual review.
- **D06:** Reproduce the previous/next duplicate-ID terrain planning issue on old source: an unchanged refresh cannot count 91 wells as 182 unique fields or halve terrain quality. The repaired test must preserve genuine entering/exiting IDs during transitions.
- **D07:** The localized geometry study has smooth floor joins, no depth seams/z-fighting, consistent contour antialiasing and matching pick/label positions. Final shader/GPU checks use the actual shipped material.
- **D08:** GPU correctness covers contributions beyond the old 64 limit and at least 257 active representations. A negative control dropping the final active representation fails. Aggregate membership coverage is checked separately from GPU representation count.
- **D09:** Size basis is structural and stable. Utilization updates do not resize wells; unknown total RAM is not treated as zero; repeated aliases do not increase area/count. Exact counts remain inspectable even when visual size uses a bounded scale.
- **D10:** Correct bounds/camera near/far coverage survives add/remove, focused lens, sectors, context loss and resizing. No terrain shape is hidden by another group's footprint in composed overview without a readable aggregate representation.

## E. Focus and input

- **E01:** A single keyboard/pointer/touch activation on a group focuses its next detail level and inspector. There is no mandatory hidden double-click or preliminary lens toggle.
- **E02:** Selecting another item retargets one detail surface. It neither changes canonical URLs unexpectedly nor stacks large overlays.
- **E03:** Breadcrumb/Back/Escape restores prior camera, expansion and focus appropriately. Escape first dismisses the innermost overlay. Removal/permission loss is handled without revealing stale hidden names.
- **E04:** Optional lens remains associated with its subject, fits available space and does not cover the subject/required controls. On a phone the default detail sheet is useful without the lens.
- **E05:** Tour/orbit stop on direct interaction and resume only deliberately. They visit meaningful groups; no arbitrary repository tour or camera takeover while reading.
- **E06:** Dragging the canvas does not accidentally select a node; interacting with forms, dropdowns, color controls or the inspector does not drag/zoom the scene. Keyboard operations remain usable without pointer gestures.
- **E07:** Reduced motion and pause independently preserve useful selection/status. Hidden/offscreen scenes suspend drawing and resume exactly once without replaying backlog effects.

## F. Shared overlays and responsive coverage

- **F01:** Reproduce Appearance clipping against the unchanged baseline at a wrapping-boundary layout. Assert all required controls are within the visual viewport and reachable by actual hit/keyboard checks. A screenshot or CSS z-index assertion alone is insufficient.
- **F02:** Exercise bottom/top/left/right trigger positions, nested scroll containers, transformed/clipped ancestors, active dialog, fullscreen enter/exit, text zoom and unmounting anchors. The fallback remains usable when native anchor positioning is unavailable.
- **F03:** Test 320px and 390px phones, 768px narrow desktop/tablet, the reported approximately 974px panel, 1280px laptop, 1920x1080 TV and 3840x2160 TV with appropriate scaling. Sweep widths around actual control-wrap transitions; the listed sizes are not the only cases.
- **F04:** Repeat relevant states in light/dark, high contrast where supported, 200 percent zoom, reduced motion and long content. Validate safe areas/software keyboard on a real mobile device or mark that exact check unverified.
- **F05:** Apply the shared surface to every audited floating consumer, with keyboard semantics appropriate to its role. Do not convert normal inline disclosures into dialogs. Modal focus trapping/inertness must not leak into non-modal controls.
- **F06:** The user can identify a critical affected group, its failing member and the difference between a local incident/provider advisory/missing coverage without relying on color or hover alone. Perform a short actual owner usability pass after implementation; automation cannot certify this by counting visible labels.

## G. Persistence, authorization, MCP and scale

- **G01:** Use real disposable PostgreSQL for additive migration, populated prior-schema upgrade, repeat migration, current IDs/links preservation, expected-version conflicts and audit behavior. No test runs against production SQL.
- **G02:** UI, API and separately granted MCP reads yield identical authorized group/member/signal meaning. Revoke/expire credentials, deny security/Work facets, change shared-resource visibility and verify counts/aliases do not leak denied entities.
- **G03:** Follow every membership/result continuation. Repeated cursors, changed populations, aborted scope and failed refresh cannot publish a partial scene as complete or mix projects. Preserve the old complete scene as delayed only within the same scope.
- **G04:** Named-view migrations preserve valid older preferences, ignore invalid input safely and do not widen canonical scope. Reparenting, provider mapping and private view edits require their own declared operations/audit rather than being hidden in a camera change.
- **G05:** Real work markers consume accepted run/Work records and state age. Missing runtime data does not show a pretend idle or working agent. Local fixtures/replay cannot be mistaken for live state.
- **G06:** Record actual hardware/browser/DPR, frame intervals, draw calls and memory/resource diagnostics for F1-F3, composed and focused. Proposed baseline: p95 visible frame interval at most 33.3ms during ordinary movement on the selected desktop, usable input on a lower-powered device, no accumulating geometry/textures/listeners on repeated expand/collapse, and a 30-minute TV soak. Declare contention and limitations instead of claiming a universal benchmark.
- **G07:** When graphics budget is exceeded or WebGL fails, lower decoration/detail and retain the complete outline/search/inspector. No silent last-N resource drop. A no-motion/no-ambient settled scene does not need continuous drawing.

## H. Release evidence

Run required format/lint/types/contracts/boundaries, scoped unit and actual PostgreSQL tests, actual renderer/GPU checks and built browser tests. Preserve before/after failing regressions for real defects. Batch browser QA by page/state/theme/viewport rather than rebuilding fixtures for each criterion. Run builds and previews serially when they share mutable Next.js output.

The readiness report must separate readable inventory, active monitoring, provider mapping coverage, optional work/security connectors, actual MCP parity and physical-device checks. At least one real supported operational vertical slice is required before calling the full operational view complete. Keep ordinary CI, review and release gates. Planning itself runs no tests of proposed behavior and authorizes no merge/deployment.
