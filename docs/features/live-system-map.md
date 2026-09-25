# Live system and agent-flow viewport

**Status: Exploratory**

Commandry may provide an interactive viewport that makes activity across
agents, projects, systems, resources, and servers understandable as it happens.
Its purpose is explanation and control—not an ornamental graph or an unfiltered
stream of glowing dots.

This feature belongs after the underlying event, run, message, and relationship
models are trustworthy. The local experience lab can prototype it earlier with
synthetic events.

## Questions the viewport answers

- Which agents are working, waiting, blocked, or handing work to another agent?
- What message, execution packet, artifact, or approval crossed a boundary?
- Which project and resources does that activity affect?
- Where did an event originate, which processing stages handled it, and where
  is it delayed or failing?
- Is the view live, delayed, sampled, grouped, or replaying history?
- What can the user inspect or safely do next?

## Lenses

The same underlying records may support several focused views:

### Agent collaboration

Agents and runtimes are nodes. Assignment, message, delegation, artifact,
approval, and handoff events travel across typed edges. The default view shows
meaningful progress and boundaries, not raw token streams or private reasoning.

### Project activity

A selected project anchors its agents, tasks, integrations, deployments,
resources, recent events, and blocked decisions. Cross-project edges are shown
only when they explain dependency or impact.

### Operational flow

External source, webhook/poller, ingestion, queue, workflow, resource, alert,
and notification stages show how information moves through the control plane.
Freshness and backlog are visible so animation cannot imply health falsely.

### Replay and incident explanation

A timeline can replay a bounded correlation chain: triggering event, normalized
records, automation decision, agent work, requested action, approval, execution,
verification, and outcome. Replay is visually and audibly distinct from live
mode.

## Data contract

The viewport is a projection of canonical relationships, normalized events,
messages, run transitions, and audit records. It does not create a second
collaboration protocol.

Each visible flow should be traceable to fields such as:

```text
event_id, event_type, occurred_at, ingested_at
source_actor, destination_actor, subject, related_entities
correlation_id, causation_id, run_id, message_id
priority, sensitivity, freshness, delivery_state
source_reference, payload_summary, capability_or_policy_decision
```

Agent-to-agent communication is recorded as safe envelopes and user-visible
summaries. Private reasoning, secrets, unrestricted prompts, and sensitive
payloads are not exposed merely because the viewport can draw an edge.

## Visual grammar

- stable positions and restrained motion preserve the user's mental map;
- node shape/icon identifies kind; color is a secondary state channel;
- edge style identifies relationship or delivery kind;
- a pulse represents a real bounded event, not continuous decorative traffic;
- aggregation indicates count and rate when event volume is high;
- selection pauses or de-emphasizes unrelated activity;
- timestamps, freshness, sampling, and replay state remain visible;
- every graph has a synchronized list/timeline representation.

The view should begin with accessible SVG or Canvas and a level-of-detail plan.
WebGL is justified only by measured scale. Trees, tables, and timelines remain
the default when they answer the question more clearly than a graph.

## Sound and haptic behavior

The viewport consumes semantic intents from the
[sensory language](../ux/design-system-and-sensory-language.md), not custom sounds
hardcoded into graph elements.

Possible treatments to prototype:

- a quiet directional cue when work is handed between agents;
- a soft grouped texture when a burst of related messages crosses a boundary;
- an attention cue when the selected run becomes blocked or awaits approval;
- a completion/recovery cue when a followed correlation chain resolves;
- a haptic acknowledgement when the user selects, approves, cancels, or focuses
  an item on a supported device.

Background traffic does not produce one sound per event. Sonification is
optional, rate-limited, focus-aware, muted during replay by default, and subject
to quiet hours. Audio spatialization must not be the only way to locate source
or direction.

## Interaction

Users should be able to:

- focus an agent, project, system, resource, run, or correlation chain;
- filter event/message types, priority, time range, and live versus replay;
- pause visual updates without stopping ingestion;
- inspect the source evidence and freshness of an edge or pulse;
- open the associated work, run, approval, resource, or audit record;
- request an allowed action through the ordinary capability/approval path;
- reduce, mute, or disable motion, sound, and haptic feedback independently.

## Privacy, safety, and truthfulness

- authorization is evaluated before projection; the graph is not a permission
  bypass;
- secret values and hidden reasoning never become labels, tooltips, audio, or
  downloadable traces;
- message previews follow sensitivity and retention policy;
- sampled or grouped flows state that they are sampled or grouped;
- offline/disconnected sources freeze with a stale indicator rather than
  continuing simulated motion;
- a destructive control never becomes safer merely because it is presented on
  a visual node.

## Staged delivery

1. Build deterministic synthetic scenarios in the local experience lab.
2. Render a read-only run/message timeline from real canonical events.
3. Add focused agent-collaboration and operational-flow views.
4. Add live streaming only after ordering, reconnect, duplication, and
   aggregation behavior are proven.
5. Add optional sound and supported-device haptics after preference, rate-limit,
   and accessibility behavior pass testing.
6. Add governed actions last, reusing existing action and approval components.

## Acceptance conditions

- every visible pulse can be inspected to a real event or labeled simulation;
- the view remains useful with motion, sound, and haptics disabled;
- high-volume traffic aggregates without freezing the interface or creating
  notification noise;
- live, delayed, sampled, and replay modes cannot be confused;
- agent messages expose useful summaries without leaking secrets or reasoning;
- a list/timeline alternative preserves the same inspectable information;
- all actions pass through the same capability, approval, and audit controls as
  the rest of Commandry.
