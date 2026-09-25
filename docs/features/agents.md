# Agents and approvals

**Status: Proposed**

## Purpose

Commandry treats agents as bounded workers with identity, role, context,
permissions, budget, and run history. It coordinates them without requiring one
unrestricted “JARVIS” agent or initially replacing specialized runtimes.

## Agent registry

Each agent profile should show:

- role, runtime/provider, and model;
- skills, tools, and supported work;
- assigned projects and resource scope;
- capabilities and referenced secret namespaces;
- autonomy policy and action restrictions;
- budget/usage and concurrency limits;
- current run, status, and schedule;
- run, action, approval, and failure history.

Examples include a Homelab Agent with read-only infrastructure and selected SSH
capabilities, or a coding agent allowed to create branches and run tests while
production deployment requires approval.

## Assignment flow

1. Select or create a ready work item.
2. Generate and review an execution packet.
3. Match agents by skill, runtime, capability, availability, and budget.
4. Apply a run-specific capability grant and approval policy.
5. Dispatch to the selected runtime.
6. Ingest progress, requests, outputs, and actions.
7. Verify the result and record completion or follow-up.

## Agent cockpit

The UI should expose:

- idle, queued, running, blocked, and unavailable agents;
- current objective and elapsed time;
- latest meaningful progress rather than raw token streams by default;
- waiting-for-input and waiting-for-approval states;
- scheduled/heartbeat work;
- workspace/artifacts where the runtime supports them;
- usage, cost, and errors;
- stop/cancel controls.

A later [live system and agent-flow viewport](live-system-map.md) may project
agent messages, delegations, handoffs, artifacts, approvals, and run state as an
inspectable graph/timeline. It must summarize useful coordination without
exposing private reasoning, secrets, or unfiltered token streams.

## Approval experience

Approval requests describe the exact proposed action, reason, affected
resources, expected result, risk, capability, and rollback possibility.

The user may approve, reject, or allow the request to expire. Approval is not a
blanket elevation: changed targets, parameters, or action type require a new
request.

## Runtime strategy

Commandry may integrate an execution backend such as Paperclip or direct
adapters to coding/research agents. Commandry owns personal context, portfolio,
policy, and cross-system history; the runtime may own task execution, workspace,
heartbeats, and low-level logs.

## Capacity management

A later scheduler may consider subscription/API limits, model capabilities,
latency, cost, local vs cloud execution, tool requirements, and interaction
needs. Provider routing remains a policy decision visible to the user.

## Acceptance conditions

- Agents cannot inherit another agent's secret, memory, or workspace by default.
- Every run identifies the packet and capabilities it received.
- Users can see why an agent was eligible for an assignment.
- Sensitive and destructive actions cannot be hidden inside a broader approved
  task.
- Completion includes verification evidence or is explicitly marked unverified.
