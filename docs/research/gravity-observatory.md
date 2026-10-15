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
an arrival is appended, and uses a vertical arrangement in portrait stages.
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
