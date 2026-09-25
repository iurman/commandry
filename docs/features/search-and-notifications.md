# Search, activity, and notifications

**Status: Proposed**

## Search and Ask Commandry

Commandry should support both exact structured queries and semantic retrieval.
Natural-language answers can combine the two, but must cite the underlying
records and distinguish facts from inference.

Representative queries:

- What projects have I not touched this month?
- Which services are unhealthy?
- What work can run tonight without me?
- Why did I keep separate Resend accounts?
- What depends on Atlas?
- Which domains expire in the next 60 days?
- What scheduled jobs failed this week?
- Which agents have production access?

Structured filters should remain available for users and agents that need
deterministic results.

## Search corpus

Search may cover:

- projects, systems, components, and resources;
- work and comments;
- captures and extracted text;
- knowledge, decisions, and documents;
- events, alerts, and activity;
- automations, agents, runs, outputs, and approvals;
- connector metadata and external links.

Results respect sensitivity and capability scope. Indexes must not become a
permission bypass.

## Activity

Activity is a readable projection of normalized events and audit records. It
can be filtered globally, by project, resource, agent, automation, or event
type. Repeated machine events may be grouped while retaining expansion to raw
records.

Important distinctions:

- event time vs ingestion time;
- observed external fact vs Commandry action;
- source event vs derived alert;
- current state vs historical transition.

## Notification priorities

| Priority | Use |
| --- | --- |
| Critical | Immediate material risk, such as production unavailability. |
| Action required | User input or approval blocks progress. |
| Time-sensitive | Deadline or scheduled action is approaching. |
| Opportunity | A meaningful trend or suggested improvement. |
| Informational | Useful completion or recovery update. |
| Digest | Low-priority grouped changes. |

Notifications include subject, context, reason, evidence, affected entities,
and appropriate actions. “Server alert” is insufficient; the user should know
which resource, what changed, why it matters, and what can happen next.

## Noise controls

- deduplicate by condition and subject;
- group repeated events into one alert lifecycle;
- route by priority, project, channel, and quiet hours;
- distinguish dismiss, acknowledge, and snooze;
- learn from feedback only within transparent guardrails;
- send recovery when a notified condition resolves;
- prefer digests for low-priority successful runs.

## Acceptance conditions

- Search results and answers respect the same access policy as source records.
- Natural-language answers link to evidence.
- One continuing incident does not create unlimited notifications.
- A notification's available actions are filtered by current capability policy.
- Users can understand why they were notified and tune the responsible rule.
