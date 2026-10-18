# Observatory presentation, labels and primary-group arrangement

**Status: Operational record. The owner asked on 2026-10-18 for this work from plan through merge, without a planning hold. It is not deployed.**

## Owner request (2026-10-18)

Reviewing production, the owner reported that:

- in the overview, label cards take a lot of the screen, cover each other and the terrain, and sometimes vanish and fade back in as the camera angle changes;
- only some member names appear in a large group, so a ring of 60 repositories cannot be read, even zoomed in;
- the presentation feels random: it should dwell on one main group, orbit it slowly while its information loads on screen, then move smoothly to the next;
- the overview should name every main group without blocking anything, perhaps on the ground or in a banner along the bottom;
- a summary should load for each group: for repositories, grouped (live versus other repositories), with recent activity, and anything wrong highlighted;
- when an issue appears in another main group during the presentation, the camera should move to it straight away;
- focusing a main group should start a slow orbit around it; focusing a sub-resource should not, but there should be a way to watch any resource; and it should be easy to leave that and return to the presentation of every group;
- the arrangement of the main groups could be better organized, for example from a central viewpoint.

The owner asked for options to be explored, then for the work to be built, merged and reported.

## Options explored

| Concern | Option | Assessment |
| --- | --- | --- |
| Overview names | **A. Ground-painted names** (text decals on the terrain beside each group) | Rotates with the scene and never covers it, but is unreadable at the low presentation angle, needs world-space text rendering (canvas or SDF textures) on a 4K software-GPU budget that has already failed a release once, and still needs DOM buttons for access. Not chosen. |
| | **B. Bottom roster banner** (every main group as a chip in a strip along the stage bottom) | Always readable, never overlaps, works as navigation and as the presentation's progress indicator. Association with the terrain is indirect. **Chosen, with C.** |
| | **C. Compact attached pins** (one-line icon, name and count instead of the two-line card) | Keeps names on what they name, at about half the area. **Chosen, with B.** |
| | D. Edge callouts for top-level groups | Leader lines crossing the whole scene while it orbits are busy. Kept for dense members only (below). |
| Flicker | Hysteresis on admission, eased fade-out instead of an instant hide, and a constant camera distance while dwelling | The instant `0.04` opacity drop on a lost collision and the old tour's continuous zoom in and out (which crossed the member-disclosure threshold) caused the vanish-and-refade. **Chosen.** |
| All member names | E. Rotate which subset is named over time | Reproduces the "random disappearing" complaint. Rejected. |
| | F. Allow longer collision displacement | Cannot fit 48 names packed into one pool. Rejected. |
| | **G. Callout columns** (members of a dense focused group named in two columns beside it, sorted by height, with leader lines) | Names every member without overlap, by construction; D04 already anticipates leader lines. **Chosen** for dense groups; sparse groups keep in-place names. |
| | **H. Complete grouped member list** in the inspector briefing | Accessible complete fallback when columns overflow. **Chosen, with G.** |
| Arrangement | I. Keep the hashed scattered spiral | Tour order across scattered groups jumps back and forth. |
| | **J. Hub and ring** (the dominant group anchors the centre, the others circle it in family order) | A central overview sees every group, neighbours on the ring are consecutive presentation stops, and families stay together. **Chosen.** |
| | K. One row or arc | Wide, wastes height, and dwarfs small groups beside large ones. Not chosen. |
| Summary text | **Decode-style reveal** (characters resolve from code glyphs, left to right) | Matches the "matrixy" request. Full text is in the accessible tree immediately, and reduced motion or pause shows it at once. **Chosen.** |

## Design

### Primary groups and arrangement

A *primary group* is a visible root representation of kind host, provider, collection or project. Individual root repositories, references, services and deployments are not primary groups. This keeps A02: a repository never becomes a presentation stop just because it has no parent.

`OperationalLayout` arranges the roots, replacing the hashed spiral:

1. Roots sort by family (hosts, providers, other operational kinds, repositories, collections and projects, references), then layout key.
2. If the largest root's extent is at least 1.6 times the next, it anchors the centre.
3. The rest fill rings around it in family order with the existing `memberRings` geometry, keeping caller order and the 2.4-unit root clearance. Each member takes the angle its own extent needs, and a small remainder widens one ring. Without a dominant group, up to eight share one ring around an open centre.
4. A fresh root set (none of whose slots are cached for the scope, grouping and size basis) is arranged this way. Roots then keep their slots for the scope, and a root added later takes the nearest free spiral position as before. Ordinary refreshes therefore never move landmarks (D01, D02).
5. `primaryGroupIds` lists the visible primary groups in visiting order: the central group, then around the ring from the side the arrangement starts on.

### Presentation tour

`PresentationTour` (`packages/ui/src/gravity/tour.ts`) is a pure state machine the renderer advances each frame:

- **Stops** are the primary groups in arrangement order: the hub first, then around the ring.
- Each stop has a **travel** phase (4.5 s, eased) and a **dwell** phase (24 s; 36 s for a group with attention).
- The camera keeps one slowly increasing azimuth (0.03 rad/s, about 3.5 minutes per revolution) through travel and dwell. During the dwell, target, distance and elevation are constant, so the camera only rotates. Distance is fitted once per stop over several azimuths, so the group does not breathe while it turns.
- **Attention preemption.** When a stop's attention changes from none to impact or exposure, or a new stop arrives with attention, the tour starts travelling to it immediately and gives it the attention dwell. It then continues from the stop after it. Attention that was already present when the tour started is not a preemption; those groups simply come first.
- The renderer reports each stop through the existing `featured` hook and a new `tour` hook carrying the stop, its timings and the reason (`sequence` or `attention`).

### Focus and watch

- **Selecting a primary group** (terrain, pin, roster chip, outline or search) focuses it and starts its **watch orbit**: the same slow orbit as a tour dwell, held on that group. Reduced motion, pause and reading keep the camera still, as before.
- **Selecting a sub-resource** focuses it without orbiting. **Watch** in the stage controls orbits whatever is selected; **Stop watching** returns to a still camera.
- **Start presentation** works from any focus or watch. **Overview** returns to the still composed overview. Drag, wheel, search, inspector reading and Escape stop automatic motion, as before. This amends E05's "resume only deliberately": selecting a primary group is the deliberate activation.
- `CameraMode` gains `watch`. `RendererSettings.watch` names the subject. In watch mode `focusSubject` for that subject records the focus without tweening, because the orbit owns the camera.

### Labels

- **Primary-group pins** are one line: badge, name, and a count chip. Kind stays in the badge shape and the accessible name. Attention adds a text chip ("Impact" or "Exposure") as well as colour.
- **Admission hysteresis.** A visible label that loses its room keeps its place for 300 ms before fading out at the normal easing, instead of dropping to near-zero opacity at once. Once released, it must have room for 200 ms before it returns. A first appearance is immediate, and a label whose subject leaves view fades at once. Reduced motion skips the holds.
- **Panels.** The briefing card and the roster are marked `data-gravity-obstacle`. Labels step out from under them along the shorter way and are not admitted over them; this replaces the global top inset that a taller card would push down across the whole width. A panel spanning most of the stage bottom (the roster) narrows the band the camera fits subjects into, and a camera view offset centres that band.
- **Framed groups.** A tour stop or watched subject opens its direct members' names exactly as a direct focus does, even inside a closed parent, so zooming into a nested ring names that ring. A pool around a framed nested ring moves its own label to its rim. Services and deployments are named like other members once their host is open or framed (previously only the optional lens named them). A member gets a label element only once its group opens (or while its name is still fading out), so the stage holds elements only for names it can show.
- **Label-only frames.** Label settling, label measurements and callout motion re-place the DOM labels over the frame already drawn. They do not redraw the terrain, because the camera has not moved; under software rendering each WebGL frame costs hundreds of milliseconds.
- **Callout columns.** When a framed group's members are closer on screen than 0.9 of a compact label width (leaving at 1.2), its direct members are named in two columns beside the group's screen footprint: left-half members on the left and right-half members on the right. Rows are compact (about 24 px), stack by height, and each has an elbow leader line to its basin. A panel overlapping a column shortens it. A full column lends the members nearest the centre to the other column; anything still left over is counted in a "+N more" row (its accessible text adds "in the inspector briefing"), placed below the last row using its measured size, attention kept first. A stage too narrow for two columns beside the group, such as a 320-pixel phone, uses one column on the roomier side so the columns never meet. A member changes sides only after crossing the centre by a margin, fading out and back in rather than sliding across the group. A dense framed group is fitted into the centre 62 percent of the stage width. Zoom into a nested ring (for example **Unmapped repositories**) and its members get their own callouts.

### Briefing and roster

- `observatoryBriefing` (`packages/ui/src/gravity/briefing.ts`) derives a briefing from the scene and recorded events alone. It covers the headline, facts (availability, telemetry, capacity, security, provider, work), issues (each naming its member), member groups and recent activity.
  - It states only what the evidence supports. No monitoring is "No availability checks observed", never healthy. An unmapped repository is never described as undeployed or idle.
  - Repository collections group as *Deployed (reviewed relation)* (repositories with a reviewed `deploys` relation), *Project repositories*, and each nested collection with every name. Other groups list direct members, attention first, by kind.
  - Recent activity is the three most recent recorded events among the members.
- The **stage briefing card** replaces the stage caption: eyebrow, name, decode-revealed headline and up to three facts, and up to three issues. Without a subject it shows only the landscape headline, so the overview stays clear. On phones it keeps one fact and one issue. A group's summary includes its members, so an issue is named only on the deepest resource carrying it.
- The **inspector briefing** lists every member group in full, each member selectable.
- The **roster rail** along the stage bottom names every primary group in arrangement order: badge, name, count and attention text.
  - The active group is marked `aria-current`, and during the tour a progress bar runs for the stop.
  - Selecting a chip selects that group (and so watches it). Hovering or focusing a chip highlights its pin.
  - The stage controls sit at the rail's start. Chips wrap to a second row rather than scroll (the camera band adjusts); on phones they form one scrolling row.

### Authority and MCP

No new canonical data, mutation, capability or audit event is introduced. Tour, watch, callouts, briefing, roster and arrangement are device-local presentation computed from the scene and overview records that `get_observatory_scene` and the overview read already return to agents. Camera control stays UI-only, like the rest of the device-local camera, and the [agent workflow](../../architecture/observatory-agent-workflow.md) records the omission and its reason. Attention preemption follows the same `operationalAttention` classification the UI already shows; it grants nothing.

## Defaults chosen during implementation

The owner explicitly confirmed the current defaults on October 18, 2026.
[ADR 0017](../../decisions/0017-confirm-observatory-presentation-defaults.md)
records the decision and resolves OQ-039:

- dwell 24 s, attention dwell 36 s, travel 4.5 s, orbit 0.03 rad/s;
- preemption only on a newly raised attention, once per raise;
- the hub-and-ring order (hosts, providers, operational, collections and projects, references);
- callout trigger at 0.9 of a label width, with a 62 percent framing width for dense groups.

## Verification

- Unit tests for root arrangement (determinism, clearance, family order, refresh stability), the tour state machine (order, dwell, preemption, continuation), callout layout (no overlap, side hysteresis, overflow), admission hysteresis, briefing derivation (truthful wording, repository grouping, recent activity) and the component (primary-group watch, sub-resource still focus, Watch/Stop watching, roster, briefing).
- `pnpm check` and the vitest workspace.
- The desktop master-scene browser test (103 resources at 1920 by 1080). An earlier branch build exceeded its 300-second budget: every label settle and measurement redrew the terrain, about nine software-rendered WebGL frames per outline click. It now passes in about 3 minutes (main: about 3.7), with three frames per click.
- Browser screenshots of the overview, a tour stop, a dense callout group and a watched sub-resource, desktop and phone, light and dark, against the 91-resource mixed fixture.

The COVERAGE rows this change touches (A02, D01 to D04, E05) must be re-established by the next full release run; see the [coverage note](../observatory-operational-landscape/COVERAGE.md).

## Implementation record

| Layer | Where |
| --- | --- |
| Arrangement | `arrangeRoots`, `isPrimaryGroupKind`, the `ordered` and `gap` options of `memberRings`, and `primaryGroupIds` in `packages/ui/src/gravity/operational-layout.ts` |
| Tour | `PresentationTour` and `tourTiming` in `packages/ui/src/gravity/tour.ts` |
| Camera | `orbitFrame`, `orbitPose`, `travelFrame`, `frameOfPose`, `hostTourStops` and the `band` fitting parameter in `presentation.ts`; the `watch` camera mode in `model.ts`; `RendererSettings.watch` and `stops`, the `tour` hook, program poses, panel measurement and the view offset in `renderer.ts` |
| Labels | Admission hysteresis, obstacles, fixed anchors and `CalloutLayout` in `labels.ts`; callout placement, framed disclosure and rim labels in `renderer.ts` |
| Briefing | `observatoryBriefing` and `briefingAge` in `packages/ui/src/gravity/briefing.ts` |
| UI | `DecodeText`, `ObservatoryBriefingCard`, `ObservatoryBriefingDetails` and `ObservatoryRoster` in `packages/ui/src/components/ObservatoryPresentation.tsx`; activation, watch, roster, briefing and callout rendering in `OperationalObservatory.tsx`; styles in `operational-observatory.css` |
| Lab | The lab keeps its own controls; its tour now uses the shared director with top-level hosts as stops |
| Docs | [Feature spec](../../features/gravity-observatory.md#presentation-watch-and-briefing), [agent workflow omission](../../architecture/observatory-agent-workflow.md), [accepted owner defaults](../../decisions/0017-confirm-observatory-presentation-defaults.md), [status](../../project/status.md), and the coverage and execution notes |

Changed tests, deliberately:

- Renderer tour windows now follow `tourTiming` (a stop is 28.5 seconds, not 14).
- Breadcrumb restoration tests model the pan as the interruption it is, because selecting a primary host now watches it.
- Tour interruption tests expect a primary-group selection to watch that group, while search, drag and reading still stop motion.
- The lab tour test exercises the shared director and travel frames instead of the removed time-sliced host tour.
