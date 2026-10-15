# Local experience lab

This private Storybook application renders the exported UI and experience
packages using synthetic examples. It is development tooling, not a product
route or a deployable site.

From the repository root, run `pnpm lab`. Storybook binds to
`http://127.0.0.1:6006` with an exact port. `pnpm lab:check` checks types and
the production boundary, and `pnpm lab:test` runs the local component tests.

The State panel stories cover normal, loading, empty, error, disabled, and
permission-denied states. The feedback preference story simulates channel
availability without playing sound or triggering haptics.

## Gravity Observatory study

Open [the rendering study](http://127.0.0.1:6006/iframe.html?id=experiments-gravity-observatory--study&viewMode=story)
after starting `pnpm lab`. It uses synthetic data and a lab-only Three.js
dependency. It does not access the running application or infrastructure.

Try Hosts, Projects, and Custom view; drag to orbit, scroll to zoom, or use the
camera presets. Select a host and open its focus lens. Spawn a host to watch a
new depression form, and Dispatch job to follow a simulated build and result.
Settings expose Porcelain/Midnight materials, sector and signal colors, custom
sector assignments, and device-local save/restore. Pause motion freezes the
simulation while leaving inspection and camera presets available.

The refined study defaults to service-count sizing, with RAM capacity and
uniform sizing in Settings. Host profiles vary the well proportions and raised
terrain. Composed frames the complete layout, Slow orbit circles it, and Guided
tour approaches each host in turn. Dragging interrupts automatic cameras.
Ambient field controls decorative floor waves, light sweeps and star shimmer;
it is independent of event activity. Disable it for a still composed field, or
Pause motion to freeze the atmosphere, events and automatic camera together.

Labels follow structural crests independently of the ambient waves. Their
measured bounds ease apart with persistent collision sides instead of jumping
between vertical slots. Label placement and the focus frame share the render
clock. Camera autoplay begins at the current bearing, manual orbit has damped
release, and selecting another resource eases the lens to its new subject.

The [renderer investigation](../../docs/research/gravity-observatory.md) records
the implementation choice, verification, and limits. This is a finite material
and interaction study, not production-scale monitoring or a public lab build.

## Operational activity

The scene starts a deterministic synthetic simulation. Choose Steady traffic,
Build pipeline, Failure / recovery, or Traffic burst from the scene toolbar or
the inspector's Activity simulator. Pause activity independently of camera and
atmosphere; Step +5s, Restart, and 0.5x through 4x speed support inspection.
Global Pause motion freezes the simulation too. Stepping remains available with
reduced motion. Hidden/offscreen scenes freeze their synthetic clock.

Dotted streams are grouped health checks, blue streams are requests, violet
orbits are running jobs, and gold streams carry artifacts. Return streams have
the reverse direction. Slow and timed-out transfers use attention colors plus
explicit result labels. Bursts group requests into counted streams. Health
starts unknown and changes only after checks complete, independently of fixture
memory and disk utilization.

Select a transfer or timeline event to follow its correlation chain across
dispatch, processing, artifact storage, responses, timeouts, and retries. Other
traffic dims; Clear trace restores it. Emphasize selected resource also supports
hosts, services, and sector basins. The recent feed shows the latest 30 events;
selected traces retain their complete history for a 120-second window. Disclosure
controls expose every active transfer and retained event. No real requests are
sent to the named infrastructure.
