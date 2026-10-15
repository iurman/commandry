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

## Verification results

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

This finite fixture starts with four hosts and sixteen services; the deliberate
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
