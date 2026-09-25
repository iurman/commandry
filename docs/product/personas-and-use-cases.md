# Personas and use cases

**Status: Proposed**

## Primary user

The first user is a technically capable individual managing a mixed personal
portfolio: software projects, work engagements, home systems, infrastructure,
events, research, and AI-assisted work. This person is comfortable connecting
services but does not want to live inside every service's dashboard.

This is a personal control plane first. Multi-user organizations, public
marketplaces, and enterprise administration are not initial assumptions.

## Operational modes

The same person moves between several modes. These are more useful than rigid
demographic personas.

### The operator

Needs to know what is unhealthy, what changed, which projects are affected, and
which safe actions are available.

Representative questions:

- Which services are unhealthy right now?
- What depends on this server?
- Did last night's automation fail?
- Can an agent inspect this without making changes?

### The builder

Needs current project state, decisions, repositories, deployments, work, and
acceptance criteria in one place.

Representative questions:

- What was I doing here three weeks ago?
- Why did we choose this architecture?
- What should happen next?
- Can I send a complete task to a coding agent?

### The planner

Needs to turn loose thoughts and obligations into coherent future work without
organizing every input up front.

Representative questions:

- Capture this now and help me classify it later.
- What deadlines are approaching?
- Which projects have stalled?
- What is waiting on me?

### The delegator

Needs to find agent-ready work, bound its scope, assign capabilities, monitor
runs, and approve higher-risk operations.

Representative questions:

- What can run unattended tonight?
- Which agents are blocked?
- What did this agent change?
- Which agents currently have production access?

## Core journeys

### Return to a dormant project

1. Open the project.
2. Read a generated brief covering current state, recent change, decisions,
   blockers, and likely next actions.
3. Inspect the evidence behind any summary.
4. Resume work or prepare an execution packet.

### Turn a loose thought into work

1. Capture text, image, link, voice transcript, file, or conversation.
2. Preserve the original payload.
3. Receive suggested project, type, priority, relationships, and actionability.
4. Confirm quickly or leave ambiguous items in the Inbox.

### Respond to an operational signal

1. A connector or monitor emits an event.
2. Commandry maps it to a resource and affected projects.
3. An alert includes history, related work, and available actions.
4. The user snoozes, creates work, requests an investigation, or executes an
   allowed action.

### Delegate autonomous work

1. Select a task whose objective and acceptance criteria are clear.
2. Generate an execution packet with relevant context and constraints.
3. Assign an eligible agent/runtime and policy.
4. Observe status, respond to approval requests, verify the result, and retain
   the run history.

### Review the morning brief

1. See completed, failed, and approval-blocked overnight runs.
2. Review material changes rather than every log line.
3. Accept results, create follow-up work, or investigate failures.
