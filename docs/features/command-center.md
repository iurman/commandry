# Command Center

**Status: Proposed**

## Purpose

The Command Center is the default home view. It is an attention and action
surface, not a wall of undifferentiated dashboards.

It answers:

1. What needs my attention?
2. What changed meaningfully?
3. What can happen next?

## Core sections

### Attention

Ranked items that require or merit user action, such as:

- human-blocked tasks and agent approval requests;
- degraded services and capacity thresholds;
- approaching deadlines;
- failed automations or agent runs;
- stale active projects;
- untriaged captures;
- material analytics changes.

Every item should explain why it is present and expose its source evidence.

### Change

A concise activity digest across projects and systems. Repeated low-level events
should be grouped into meaningful changes. Examples include a merged pull
request, recovery from an incident, completed deployment, captured note,
finished agent run, or task completion.

### Next

Suggested or already-planned actions with enough context to decide quickly.
Examples: open an existing task, ask an agent to investigate, run an automation,
snooze, dismiss, or create work from the signal.

## Attention ranking

Ranking may consider:

- severity and time sensitivity;
- explicit priority and due date;
- number and importance of affected projects/resources;
- whether the user or an agent is blocked;
- confidence, novelty, and recurrence;
- available safe action;
- user dismissals and snooze history.

The ranking explanation must remain inspectable. AI may help rank, but the
system must not hide critical rule-based alerts because a model scores them low.

## Cards and widgets

Cards can show project health, next actions, recent decisions, deployments,
resource health, analytics, costs, approvals, and run outcomes.

Later, users may describe a widget in natural language. An agent can produce a
declarative widget definition and scheduled data query, but the UI should render
cached structured results. Generated code or queries must remain reviewable and
permission-scoped.

## Primary actions

- View the underlying entity or evidence.
- Create or link a work item.
- Ask an eligible agent to inspect or act.
- Run an existing automation.
- Approve or reject a pending action.
- Ignore/dismiss with optional feedback.
- Remind later/snooze until a time or condition.

## Acceptance conditions

- No attention item is shown without a reason and source.
- A signal related to a known project or task surfaces those relationships.
- Dismiss and snooze are distinct and reversible behaviors.
- Grouped activity can be expanded to its underlying events.
- The home view clearly distinguishes live state, historical change, and
  suggested future action.
