# Information architecture

**Status: Proposed**

## Global navigation

Initial top-level destinations:

- Home
- Inbox
- Projects
- Work
- Infrastructure
- Automations
- Agents
- Knowledge
- Activity
- Search

This navigation reflects user questions rather than database tables. It may be
refined through prototyping, but the distinctions between capture, portfolio,
operations, and execution should remain clear.

## Persistent command bar

A global command bar (for example, `Cmd/Ctrl + K`) should support navigation and
explicit commands:

- create task;
- capture note;
- ask Commandry;
- open project or resource;
- run an agent or automation;
- add monitor;
- schedule work.

Search results, commands, and AI answers must look distinct so the user knows
whether selection will navigate, create data, or execute an action.

## Adaptive project navigation

The shared workspace areas are Overview, Work, Knowledge, Activity, Resources,
Infrastructure, Automations, Agents, and Integrations. Project templates choose
relevant labels, order, and default visibility.

Templates alter presentation and defaults, not entity semantics. For example,
an event template may label a view “Schedule” while using shared date-bearing
work items and knowledge records underneath.

## Hierarchy and graph presentation

Use trees for containment and progressive drill-down. Use relationship panels,
impact views, and graph visualizations only when cross-links matter. A graph
should not be the default visualization for simple lists or navigation.

A later [live system and agent-flow viewport](../features/live-system-map.md)
may use a graph when agent handoffs, information flow, cross-project impact, or
operational processing paths are the question being answered. It must retain a
list/timeline equivalent and distinguish live, delayed, grouped, and replayed
activity.

Every entity page should make these questions easy to answer:

- What is this?
- Where does it sit in the primary hierarchy?
- What else is it related to?
- What is its current state and freshness?
- What changed recently?
- What can I do?

## State communication

Do not overload one “status” field. Visually distinguish:

- lifecycle: active, paused, completed, retired;
- operational health: healthy, degraded, offline, unknown;
- attention: normal, needs review, action required, critical;
- synchronization: current, stale, disconnected, error;
- execution: queued, running, blocked, waiting approval, complete, failed.

Unknown or stale is not healthy.

## Action design

Actions disclose effect before execution. Sensitive and destructive actions show
target, blast radius, approval requirement, and reversibility. Agent-generated
actions remain proposals until policy allows them.

Common contextual actions:

- View details or source system
- Create/link task
- Ask agent
- Run automation
- Approve/reject
- Ignore/dismiss
- Snooze/remind later

## Responsive and mobile priorities

Web/PWA comes first. Small-screen experiences prioritize:

- rapid capture;
- notification response and snooze;
- approval review;
- task updates;
- Command Center summary;
- agent/run status;
- incident acknowledgement.

Dense infrastructure graphs, broad configuration, and deep observability may
remain desktop-oriented.

## Accessibility and clarity

- Never use color as the only state indicator.
- Support keyboard navigation and predictable focus.
- Provide text equivalents for metric trends and visual health.
- Use plain-language action labels and disclose side effects.
- Keep AI confidence and provenance visible without making every screen noisy.
- Treat sound and haptics as optional reinforcement, never the only state
  channel; respect independent reduced-motion, mute, haptic, and quiet-hour
  preferences.

Shared visual, motion, sound, and haptic rules are developed in the
[design system and sensory language](design-system-and-sensory-language.md).
