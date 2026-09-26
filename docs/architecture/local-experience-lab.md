# Local experience lab

**Status: Canonical**

The accepted local experience lab will be development-only tooling where humans and
agents can inspect, exercise, compare, and stress-test Commandry's design system
and interaction patterns. It is code-based documentation, not a product route.

## Boundary

The lab should be committed to Git so every contributor and agent sees the same
reference. “Local only” means it is never included in a production artifact,
uploaded as static assets, assigned a public route, or deployed as an independent
site. Uncommitted local pages would not be a dependable source of truth.

The preferred repository shape is:

```text
apps/
├── web/              production Next.js web and API application
├── worker/           production Node.js background worker
└── lab/              local-only Storybook application
packages/
├── ui/               exported components and visual/motion tokens
└── experience/       feedback intents, sound assets/manifests, haptic mappings
```

`apps/lab` imports production packages; production packages must never import
from `apps/lab`.

## Hard deployment protections

- `apps/lab/package.json` is private and has no deploy script.
- The root production `build` task excludes the lab; `pnpm lab` is its explicit
  development entrypoint.
- The production Dockerfile copies only the Next.js standalone output and
  worker artifacts, never the lab build or stories.
- No production router imports lab routes, fixtures, controls, or assets.
- CI typechecks and tests the lab source without producing or publishing a lab
  artifact.
- A dependency-boundary test fails if production code imports from the lab.
- A deployment-manifest test fails if a lab path or asset enters the production
  bundle.
- Lab fixtures use synthetic data and development credentials only.

These protections are structural. A runtime `if (development)` around a hidden
production route is not sufficient.

## Candidate initial pages

The lab should grow with real product needs rather than becoming a parallel
design product. Useful pages include:

### Foundations

- semantic color roles across light, dark, high-contrast, and status states;
- typography, spacing, density, radii, elevation, icon sizes, and data-number
  formatting;
- focus rings, touch targets, breakpoint/container behavior, and long-text
  stress cases;
- motion durations/easings with reduced-motion simulation.

### Component gallery

- actual exported components, not copies;
- every variant and interactive state;
- loading, empty, stale, disconnected, partial, failure, and permission-denied
  cases;
- responsive frames and keyboard/focus traversal;
- realistic domain compositions such as resource health, agent run, approval,
  capture, event row, and project brief.

### Sensory workbench

- soundboard grouped by semantic feedback intent;
- waveform, duration, loudness, encoding, and asset-manifest inspection;
- A/B and in-context playback with event frequency simulation;
- mute, quiet-hours, and reduced-sensory modes;
- haptic-pattern visualization and real-device trigger when a supported native
  shell is connected;
- explicit indicators showing which channel actually fired.

### Flow and state simulators

- agent-to-agent message and handoff sequences;
- queued/running/blocked/approval/complete/failure run transitions;
- project, server, connector, and resource events with adjustable rate;
- stale data, delayed delivery, duplicate events, reconnection, and replay;
- the visual/audio/haptic treatment defined in the
  [live system viewport](../features/live-system-map.md).

### Accessibility and diagnostics

- contrast and state-without-color checks;
- keyboard map and focus-order display;
- screen-reader labels and live-region event throttling;
- motion/sound/haptic preference matrix;
- render timing, animation frame pressure, and high-event-volume aggregation.

## Agent workflow

The lab is intended to help agents make evidence-based UI changes:

1. locate the relevant component, pattern, and token reference;
2. reproduce the requested state using a deterministic fixture;
3. change the shared production component or token;
4. view all affected states and themes locally;
5. run accessibility, interaction, and screenshot tests;
6. update usage rules and machine-readable references in the same change;
7. verify that the lab is absent from the production build manifest.

Agents may add temporary experiments under a clearly named scratch area. An
experiment becomes a durable example only after it uses shared tokens,
representative fixtures, accessibility behavior, and a documented purpose.
Generated screenshots or audition exports may remain ignored unless they are
intentional review artifacts.

## Commands

The root command contract should eventually include:

| Command | Contract |
| --- | --- |
| `pnpm lab` | Start the local experience lab and print its loopback URL |
| `pnpm lab:check` | Typecheck, test boundaries, and verify reference/manifest consistency without creating a deployable artifact |
| `pnpm lab:test` | Run local interaction, accessibility, screenshot, and sensory-manifest tests |

The lab must bind to loopback by default and must not silently expose itself to
the local network. Any remote sharing is a separate, explicit, authenticated
development action.

## Source-of-truth rule

The lab is a lens over production packages, not their owner. Tokens and
components live in reusable packages; domain fixtures live in test support;
event semantics live in contracts. Deleting the lab must not change production
behavior. Conversely, a component example that cannot import the real shipped
component is evidence of an architecture problem.
