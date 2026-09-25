# Design system and sensory language

**Status: Proposed**

Commandry should feel like one instrument even when it presents projects,
servers, automations, and agents. Its design system therefore covers more than
color and components: it defines the visual, motion, sound, and haptic language
used to acknowledge state and explain activity.

This is a future experience direction, not a claim that the system or its
assets exist. The visual foundation and local component lab should begin with
the first interface work. Product sound, native haptics, and richer ambient
visualization should follow only after core workflows and event semantics are
stable.

## Experience principles

1. **Every meaningful interaction receives feedback.** Acknowledgement may be
   visual, motion, sound, haptic, or a combination appropriate to the device.
   This does not mean every hover, message, or telemetry event makes noise.
2. **Meaning precedes medium.** The application emits a semantic feedback intent
   such as `action.accepted` or `run.failed`; platform adapters decide whether it
   becomes animation, sound, vibration, or a silent state change.
3. **Quiet is a designed state.** Silence and stillness are preferable to
   constant ambient stimulation. Frequency, urgency, and user context determine
   whether sensory feedback is justified.
4. **No channel carries meaning alone.** Color, animation, sound, and haptics
   always have text, shape, icon, or state equivalents.
5. **Live-looking behavior must be truthful.** Pulses and sounds represent real,
   timestamped events or clearly labeled simulation—not decorative activity.
6. **The system is inspectable by agents.** Tokens, component contracts, state
   matrices, assets, and usage rules are machine-readable and linked from the
   code that ships.

## System layers

The design system should use a one-way token hierarchy:

```text
brand foundations
  -> semantic tokens
    -> component tokens and variants
      -> product patterns and views
```

### Foundations

- brand voice, iconography, and imagery;
- typography and information density;
- color spaces, themes, and contrast requirements;
- spacing, radii, elevation, and layout grids;
- focus, keyboard, pointer, and touch behavior;
- motion durations and easing families;
- sound families, loudness envelope, and silence rules;
- haptic strengths and pattern limits.

Tailwind CSS v4 should expose visual and motion foundations through CSS-first
semantic tokens. Components consume role names such as `surface`, `attention`,
`critical`, or `focus`, never an unexplained palette value. Variant definitions
should be type-safe and centralized rather than reconstructed inside features.

### Semantic state

The design language must distinguish the state dimensions defined by the
[information architecture](information-architecture.md): lifecycle, operational
health, attention, synchronization, and execution. “Red,” a shake animation,
or an alarm tone is not a state model.

Semantic feedback intents should remain small and durable. A starting vocabulary
to prototype—not yet an accepted contract—is:

| Intent | Meaning | Possible treatment |
| --- | --- | --- |
| `input.acknowledged` | a direct user action was received | restrained press motion or light haptic |
| `action.accepted` | a requested safe action began | visual confirmation; optional soft transient |
| `action.completed` | requested work finished successfully | completion state; optional resolved tone/haptic |
| `attention.required` | user input or approval is blocking work | visible persistent state; optional single cue |
| `run.handoff` | responsibility moved between agents/runtimes | edge pulse; optional directional two-part cue |
| `run.failed` | an execution attempt failed | persistent error state; distinct alert cue if enabled |
| `system.degraded` | a monitored dependency lost health | affected node/edge state; rate-limited warning cue |
| `system.recovered` | a previously surfaced condition resolved | recovery state; optional low-priority resolution cue |

The same intent can have different strength by priority, current screen, user
settings, repetition count, and platform capability.

## Component contracts

Every reusable component should document and demonstrate:

- purpose and when not to use it;
- anatomy, content rules, and supported variants;
- loading, empty, partial, stale, error, disabled, and read-only states;
- pointer, keyboard, touch, and screen-reader behavior;
- responsive behavior and container assumptions;
- light, dark, high-contrast, reduced-motion, muted, and simulated-offline modes;
- associated feedback intents rather than embedded audio or vibration calls;
- representative real data and pathological long/empty values.

The design reference must render the actual exported component. A screenshot or
copied demonstration that can drift from production is supporting material, not
the source of truth.

## Sound design

Sound should make invisible coordination legible: an agent handoff, an approval
becoming blocking, a completed run, or a system moving from degraded to healthy.
It should not turn normal background polling or message traffic into a slot
machine.

The initial sound vocabulary should be deliberately small:

- **acknowledge:** brief, dry, low-salience confirmation;
- **transfer:** two-part or directional cue for a handoff/message crossing a
  boundary;
- **complete:** resolved, non-triumphal confirmation;
- **attention:** distinct but non-alarming request for input;
- **warning:** restrained indication of degradation;
- **failure:** unmistakable terminal or blocked state;
- **recovery:** related to the warning family so cause and resolution feel
  connected.

Sound rules:

- sound is off or conservative by default until onboarding asks for preference;
- provide global mute, per-category controls, quiet hours, and a volume test;
- rate-limit repeated events and sonify aggregates rather than every message;
- never autoplay before the browser/device permits audio through user intent;
- stop sounds when the relevant state is dismissed or no longer current;
- do not use speech for ordinary feedback or imitate a person's voice;
- normalize loudness and avoid sharp, fatiguing, or startling transients;
- retain a visual history so a missed cue loses no information.

### Agent-created audio assets

Agents may generate and iterate on sounds, but generated output is a candidate
asset, not an automatically approved product asset. Each accepted sound should
have a manifest recording:

- semantic intent and intended context;
- generator/tool and version;
- prompt, seed, source inputs, and generation date where available;
- license/provenance and any usage restrictions;
- source lossless file plus optimized web/native encodings;
- duration, loudness target, trim/fade, and loop behavior;
- review status, reviewer, version, and superseded asset;
- accessibility notes and the silent fallback.

The local experience lab should support blind A/B comparison, event-rate stress
tests, loudness comparison, device-speaker checks, and audition in context. An
agent should not judge a cue only as an isolated audio file.

## Haptic language

Haptics should make direct manipulation and important transitions feel
physical, especially in later Capacitor/native clients. The web PWA may expose
only limited vibration support, so behavior must degrade to visual/motion
feedback without pretending it fired.

Begin with a compact semantic scale:

- light acknowledgement for a completed direct manipulation;
- selection/change tick for bounded controls;
- success confirmation for an explicit action the user initiated;
- warning pulse for a blocking or risky state;
- destructive confirmation only after the action is actually authorized.

Do not vibrate for passive feed updates, background telemetry, every agent
message, continuous loading, or ordinary navigation. Respect OS settings and an
in-app haptics toggle. Haptic patterns must be short, rate-limited, and tested on
real hardware because emulator behavior is not evidence.

## Accessibility and preference matrix

The design system must test at least these combinations:

| Preference/capability | Required behavior |
| --- | --- |
| Reduced motion | content is complete and immediate; no hidden content waiting for animation |
| Sound muted | all events remain visible and discoverable in history |
| Haptics unavailable | no failure or false claim; visual state remains sufficient |
| High contrast | state boundaries and focus remain legible without brand nuance |
| Screen reader | live updates are summarized and rate-limited, not streamed as event spam |
| Keyboard only | every interactive demonstration and product path remains operable |
| Quiet hours | non-critical audio/haptics are suppressed and grouped |

## Source-of-truth artifacts

The eventual system should publish from one source:

- CSS variables for runtime themes;
- JSON or TypeScript tokens for tooling and native adapters;
- typed component variants and feedback intents;
- a plain-text/Markdown reference optimized for agents;
- live local examples using the actual components and assets;
- asset manifests for icons, motion, audio, and haptic mappings.

The [local experience lab](../architecture/local-experience-lab.md) is the
interactive development surface for these artifacts. It is committed to the
repository so agents can rely on it, but excluded from production builds and
deployments.

## Owner-provided references

Use these personal projects as reference points for approach and craft, not as
an instruction to copy their visual identities:

- [Aviune design system](https://aviune.com/design) — chaptered brand, color,
  type/space, components, motion, and foundations; its machine-readable JSON,
  CSS, and plain-text references are particularly relevant to agent usability.
- [Phloom design language](https://phloom.app/design) — live shipped components
  and centralized motion guidance designed to avoid documentation drift.

Commandry should borrow the pattern of executable, machine-readable design
documentation while developing its own operational, graph-minded visual and
sensory character.
