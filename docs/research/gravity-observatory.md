# Gravity Observatory rendering study

**Status: Exploratory**

**Date:** 2026-10-15

## Brief

The owner selected a sculpted gravity landscape with nested wells, dynamic
arrivals, orbitable views, a circular focus lens, and configurable appearance.
Hosts, projects, and custom sectors must be alternate projections of the same
resources. This study is synthetic, local-only, and does not replace the
infrastructure wallboard or decide production architecture.

## Renderer investigation

| Option | Fit for this study | Decision |
| --- | --- | --- |
| Three.js with WebGL 2 | Custom displaced surfaces, camera controls, render targets, and a small imperative rendering loop | Use for the first material and interaction study |
| Three.js WebGPU renderer | TSL shaders can target WebGPU and WebGL 2, but GLSL ShaderMaterial and EffectComposer are not compatible | Evaluate a TSL port after visual acceptance; do not claim a drop-in backend switch |
| React Three Fiber | Useful React integration, demand rendering, and a large component ecosystem | Viable later; unnecessary for one procedural surface and two camera passes |
| Babylon.js | WebGPU support and thin instances provide a credible alternative | No demonstrated requirement here that justifies its broader engine surface |
| SVG or Canvas 2D | Suitable for the existing accessible topology and fallback | Cannot directly provide the selected orbitable, lit terrain and second-camera lens |

These are engineering judgments based on the official documentation, not a
measured engine benchmark. The Three.js manual still recommends WebGLRenderer
for pure WebGL 2 applications and describes WebGPURenderer as experimental.
Package versions are pinned only in the private lab, not production packages.

Sources, accessed 2026-10-15:

- [Three.js renderer guidance and migration constraints](https://threejs.org/manual/pages/webgpurenderer)
- [Custom GLSL ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)
- [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)
- [Three.js terrain and raycasting example](https://threejs.org/examples/webgl_geometry_terrain_raycast.html)
- [React Three Fiber performance and demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [Babylon.js WebGPU support](https://doc.babylonjs.com/setup/support/webGPU/)
- [Babylon.js thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/)

## Implementation plan

1. Keep synthetic resource identities independent of layout. Compute host,
   project, and custom-sector projections without changing ownership or data.
2. Evaluate one continuous height field as a sum of smooth well contributions.
   Interpolate the contributions on arrivals and projection changes. Keep the
   surface function shared with label and particle positioning.
3. Shade actual displaced geometry with derivative normals, contour bands,
   sector washes, and separate semantic attention rims. Depth is structural,
   not a claim about load, health, or availability.
4. Use one renderer and a second camera/render target for the focus lens.
   Render a circular image of the same scene, preserving the overview context.
5. Make all activity explicitly simulated. A deliberate event produces bounded
   particles that spiral into its destination. Pause motion independently of
   resource selection and camera controls.
6. Provide DOM selection controls, labels, an equivalent inventory, reduced
   motion, context-loss/unavailable states, and complete GPU/listener cleanup.
7. Measure frame intervals and draw calls in the actual browser. Cap pixel
   ratio and stop animation in hidden tabs. Do not extrapolate this four-host
   study to production-scale performance.

## Scope and verification

The study belongs under `apps/lab/stories`, with a full-screen Storybook entry.
It should demonstrate four hosts with nested services, a new host appearing,
three grouping modes, camera presets and orbiting, a real focus camera,
Porcelain/Midnight appearance, editable sector/state colors, and motion pause.
No backend, production route, infrastructure mutation, or deployment is needed.

## Initial verification results

The local in-app browser rendered the real WebGL study with no captured shader,
console warning, or runtime errors. Browser interactions exercised the three
projections, a host arrival, custom reassignment, palette editing, save/restore,
manual orbit interrupting auto orbit, camera presets, the second-camera lens,
simulated delivery trails, and motion pause/resume. The narrow layout retained
its inventory and named controls without horizontal document overflow (observed
CSS client/scroll width: 468/468). Temporary viewport overrides were reset.

Observed UI counters sampled approximately 8.3 ms between animation frames for
the overview and 8.5 ms for the focused view on this local browser. The overview
uses one draw call, focus uses three, and event particles add two in focus.
These are sampled browser frame intervals, not GPU timer measurements or a
controlled comparison against another engine. Idle scenes do not submit new
draws. Hidden/offscreen scenes cancel their animation loop in the implementation.

- `pnpm check`: passed formatting, lint, workspace types, dependency boundaries,
  generated contracts, and lab boundaries. Two existing unused-parameter
  warnings remain in the unrelated GitHub activity tests.
- `pnpm --filter @commandry/lab test`: eight tests passed, including six new
  tests for resource identity, local arrivals, deliberate events, view/palette
  persistence, reduced motion, fallback inventory, and renderer disposal.
- Fallback and reduced-motion tests use a mocked renderer. They do not prove
  recovery from a real GPU reset or performance on a physical mobile device.

## Limits and next decision

The initial fixture started with four hosts and sixteen services; the deliberate
arrival adds Atlas and two services. Its shader budget is 64 well contributions,
with an explicit guard instead of silent truncation. Large inventories need
spatial tiling, level of detail, label collision handling, and a data texture or
other larger contribution buffer before this can become a product renderer.

The current study has three fixed sectors, editable host placement among them,
and one device-local saved grouping/appearance. Arbitrary sector creation,
multiple named views, saved cameras, shared-resource boundary placement,
historical replay, real telemetry/event ingestion, and production integration
are not implemented. The height field is a designed animation, not a physics
solver or a utilization measurement. Its materials are a first rendering pass,
not a promise of identical fidelity to generated concept artwork.

The next decision is visual acceptance of the surface, nesting, lens, and camera
feel. If accepted, benchmark representative resource counts and TV resolutions,
then compare the current GLSL material with a TSL implementation before choosing
a production backend. Keep the canonical resource projection outside the
renderer, and preserve the accessible list as the complete inspection path.

## Terrain and presentation refinement

The owner selected service count as the default size mapping. More services
reserve more footprint; total RAM capacity and uniform area remain selectable.
The fixture now has four hosts with 4, 8, 6, and 3 actual service entries, rather
than four equal counts. RAM capacity is separate synthetic fixture data and is
never inferred from percentage utilization. Ellipse area is normalized across
shape profiles so a wider storage profile does not defeat the size mapping.

Synthetic general, compute and storage profiles control well proportions,
curvature, depth and raised shoulders. Broad terrain relief connects them.
Footprint placement avoids host overlap, preserves existing host positions when
an arrival is appended, and uses an irregular cluster at narrow and wide aspects.
Profile and terrain depth remain presentation choices, not health indicators.

Three camera modes are implemented:

- **Composed:** frames all host footprints using the camera aspect and field
  of view. It refits after layout, size, arrival, or viewport changes.
- **Slow orbit:** circles the landscape with aspect-aware framing and a gently
  varying low camera elevation.
- **Guided tour:** circles while approaching a host, lingering, and receding to
  the overview before the next approach. Each host has a fourteen-second phase;
  a smooth periodic blend makes phase boundaries continuous. The inspector
  follows the featured host. Manual dragging interrupts immediately, and
  deliberate resource selection or opening the lens stops a tour.

The atmosphere is procedural: horizon haze, a restrained night star field and
nebula tint, fine terrain grain, a softer etched grid, slow light sweeps, and
bounded ambient height waves. The sky is naturally visible at low viewing
angles. These are decorative effects, separate from simulated event trails.
Ambient field can be disabled for on-demand rendering in a settled composed
view. Pause motion freezes atmosphere, events, and automatic cameras without
advancing their clocks. Reduced motion disables camera autoplay and label
transitions. Hidden/offscreen suspension and GPU disposal remain in place.

Device-local save/restore now also remembers size basis, ambient preference,
and camera mode. Earlier saved views fall back to service count and the composed
camera. Arbitrary sectors, multiple named views, and free camera-pose persistence
remain outside this study.

Twelve lab tests now cover the earlier invariants plus size semantics, collision
spacing, complete frustum fitting across aspect ratios and azimuths, tour visits
and continuous handoffs, bounded ambient displacement, and the new controls.
The sky adds one draw call per scene pass: two for overview and five with the
lens, with two more for event particles in focus. All counts and timings remain
local study evidence, not a physical-TV or large-inventory benchmark.

The follow-up browser pass confirmed all five host labels after an arrival in
Composed, a tour handoff from Electra to Pleiades, manual dragging changing the
camera mode to manual, RAM/uniform selection, and restoration of RAM sizing plus
the disabled ambient preference from device-local storage. The wide low orbit
showed stars and terrain silhouettes. Temporary viewport overrides were reset,
and the review tab remains open with service-count sizing. `pnpm check`, scoped
lint/types, and all twelve lab tests passed; the two unrelated lint warnings
described above remain. The final shader/runtime error capture was empty.

## Label and motion polish

The owner reported label names jumping vertically during camera motion. The
old screen-space collision pass moved a label in discrete 22-pixel steps,
recomputed the choice without memory, and published positions at a slower rate
than the terrain. CSS then interpolated those delayed positions. The anchor
height also sampled the animated surface away from the labelled well's center.

Labels now use a structural crest height independent of ambient displacement
and neighbouring depressions. A persistent layout measures the actual DOM
bounds, remembers each collision's separation side, and eases spacing changes.
React retains label content and controls while the renderer places the same
elements in sync with WebGL. Edge visibility fades without unmounting labels;
hidden labels leave the interaction and accessibility paths. The equivalent
resource inventory remains available throughout.

Autoplay now enters at the current camera bearing with an eased takeover.
Presets have eased acceleration and deceleration, and manual orbit has damped
release. The focus frame shares the rendered lens's progress on entry, exit,
and reversal. The focus camera eases between selected subjects and continues
settling when decorative animation is disabled. A dark-mode primary-button
hover contrast defect found during that check was also corrected.

Regression coverage exercises structural anchors, repeated crossing at a
collision threshold, measured label clearance, settled positions, edge fades,
reduced motion, retained DOM identity, focus-frame synchronization, and autoplay
bearing. The complete lab suite now contains eighteen tests. This remains a
finite synthetic experiment; the spacing solver does not establish acceptable
label density or motion comfort for a large production inventory.

The browser follow-up exercised host and grouped layouts, a five-host arrival,
orbit/tour entry, manual interruption, rapid lens reversals, resource changes
inside the lens, and pause/resume. In the settled five-host Composed view, two
DOM observations recorded identical label transforms while ambient waves kept
running. Paused label transforms also stayed identical between observations.
Porcelain and Midnight were inspected at normal and narrow sizes; the narrow
document's observed client/scroll widths were 468/468. This evidence is a local
browser check, not a frame-by-frame hardware benchmark. Temporary viewport
overrides were reset. Workspace checks and all eighteen lab tests passed;
the two pre-existing warnings in GitHub activity tests remain unrelated.

## Operational activity simulation

The owner approved a complete controlled activity study after reviewing the
terrain and motion. The earlier single-destination delivery cue is replaced by
a deterministic activity model, a terrain-following stream renderer, and a
synchronized transfer/health/trace inspector. These files remain entirely in
the local experience lab. Simulation controls affect ephemeral fixture state;
they introduce no product action capability, external job, HTTP request, audit
record, or infrastructure mutation.

### Scenarios and meaning

| Scenario | Behavior |
| --- | --- |
| Steady traffic | Health batches from Pleiades Metrics, Electra Web to Pleiades API requests, API to Maia NAS requests, occasional builds |
| Build pipeline | Electra Worker dispatches to Titan Builder, a progress ring fills around the receiving host, artifacts move to Maia NAS, and the result returns to the original requester; an arriving Atlas also accepts work |
| Failure / recovery | A repeating 48-second condition cycle slows Builder, makes it unavailable, then restores it; checks observe those changes later, and requests/jobs retry with four-second backoff and at most three attempts |
| Traffic burst | The same routes represent batches of 40 and 24 requests with explicit grouped counts, rather than one visible particle system per request |

Every transfer has stable source/destination resource IDs, a correlation ID,
kind, stage, start time, duration, result, count, and attempt. Dispatch,
processing, completion, storage, response, timeout, retry, and recovery events
share their chain. Resources keep the same identities through host, project,
custom-sector, capacity-size, and arrival transitions.

Availability begins unknown. A completed simulated batch records individual
service check results, latency or timeout, reason, and observation time. A
failing Builder does not make Registry or Runner unavailable. A host summarizes
its worst child check; fixture capacity percentages never determine availability.
The live legend, health names, timeout labels, dotted checks and dashed failures
provide meaning alongside editable healthy/degraded/unavailable colors. Saved
views predating the unavailable color receive its default when restored.

### Presentation and controls

Streams clear the current displaced terrain with directional heads and tapered
tails; they are bounded event activity, not permanent topology edges. A build
progress ring fills around the receiving host, and timed-out packets stall and
fade before completing their journey. Travel time is illustrative and does not
claim to equal measured latency. The focus camera renders the same activity
geometry as the overview.
Following a correlation chain dims unrelated flows; selected-resource emphasis
also follows sector membership in custom layouts.

The scene exposes scenario and run/pause controls without scrolling. The
inspector adds speed, five-second steps, restart, manual dispatch, counters,
transfer progress, and evidence. Activity can pause while the camera and ambient
field continue. Global motion pause freezes all clocks, with deliberate stepping
still available in reduced-motion mode. Hidden/offscreen suspension does not
advance the synthetic clock or replay a burst on return.

The recent feed contains the latest 30 events. Complete selected traces remain
available within a 120-second retention window. Disclosure controls expose every
active transfer and retained event. These finite lab policies are not a proposed
retention policy for real operational evidence. A future production adapter must
project authorized canonical events and distinguish delayed/disconnected sources
from this explicitly synthetic playback.

### Verification

Twenty-eight lab tests cover the previous terrain/motion invariants plus observed
health, individual service failure and recovery, correlated builds and return to
the requester, retry bounds, deterministic stepping, burst aggregation, arrivals,
bounded active populations, trace retention, current-terrain endpoints, sector
selection, simulation controls, and trace inspection. Workspace checks passed;
the same two unrelated GitHub activity lint warnings remain.

The browser exercised degraded Builder checks at simulation time 20 seconds,
unhealthy checks at 25 seconds, and healthy checks after recovery at 40 seconds.
A selected failed-request trace exposed dispatch, timeout, queued backoff, and
retry. The build trace showed artifact storage and response arrival back at
Electra Worker. Burst counts of 40/24 were explicit, and adding Atlas preserved
the paused clock while its new services awaited and then received checks.
With active streams the scene uses four overview draw calls and nine with the
lens. Observed local cadence remained approximately 8.3 to 8.5 ms between frames;
this is browser sampling, not GPU timing or a physical-TV benchmark.

The narrow follow-up observed matching client/scroll widths at both 276 and
393 CSS pixels. It exposed and corrected toolbar/label overlap: labels now
reserve the toolbar's measured height through a dedicated ResizeObserver.
At 393 pixels the nearest host label retained more than eleven pixels of
clearance below wrapped controls. Independent activity pause and global motion
pause both froze the simulation clock. Explicit steps publish state immediately,
including when the canvas is offscreen; the inspector reports the suspended
scene and its current clock. Unavailable rendering also reports unavailable
simulation instead of a running badge. The final scoped tests, types, formatting
and lint passed. Reduced-motion and WebGL-unavailable coverage use mocks rather
than a physical accessibility configuration or GPU interruption.

## Organic placement and activity legibility

The owner reported a portrait lineup and activity that was hard to interpret.
Both host-view seed layouts now use a two-dimensional sunflower distribution
with bounded, identity-derived angular and radial variation. Footprint packing
still prevents overlap and places only the arriving item. Narrow layouts remain
clusters instead of becoming a column. Composed and automatic cameras fit
individual occupied footprints, avoiding the empty corners of an aggregate box.
Service labels use the static parent surface beneath their structural anchors;
ambient motion and unrelated neighbours do not move those anchors.

Activity now has distinct departure, travel, processing, and receiving cues:

- A brief source pulse launches a tapered packet with a soft circular head.
  Smooth, elevated corridors clear the terrain without arbitrary spirals.
- A response retraces the same corridor in reverse. Grouped health packets are
  smaller and quieter than request, build, or artifact activity.
- A running build fills a progress ring around its host once, rather than
  endlessly circling a service. Gold packet bundles carry the resulting artifact.
- A receiving ripple lasts 1.4 seconds and comes from an explicit completion
  event. Timeouts stall and fade, then produce a broken failure ripple instead
  of a successful arrival.
- A scene caption names the current source, destination, and stage. Build
  captions expose Dispatch, Build, Store, and Reply; clicking opens the matching
  trace. The caption becomes two concise lines on small screens.

Ribbons, points, and transient lanes use three reusable geometry buffers. Their
capacity grows with active transfers and feedback rather than dropping events;
trace/resource emphasis applies to pulses and arrival feedback too. Overview
and focus use the same geometry and simulation clock. This remains synthetic
activity with illustrative travel times, not a network or physics measurement.

Thirty-three lab tests and the workspace check pass. New coverage verifies
two-dimensional spread, arrival stability under each size basis, occupied-host
framing, exact request/response corridor reversal, evidence-backed bounded
feedback, finite geometry within allocated buffers, and focused build captions.
The two pre-existing unrelated GitHub activity lint warnings remain. Browser
checks cover both themes, narrow and desktop layouts, caption clearance, all
four service labels in focus, and an unavailable Titan at 25 simulated seconds.
With activity visible, observed draw counts are five for overview and eleven
for focus. These counts and sampled browser cadence are local evidence, not a
physical-TV or large-inventory performance benchmark.
