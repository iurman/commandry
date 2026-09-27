# Product scope

**Status: Proposed**

## Initial product boundary

The initial Commandry product is six connected modules over one shared model.

### 1. Command Center

An attention-oriented home view containing current concerns, meaningful recent
change, upcoming work, and available next actions.

### 2. Projects

Flexible workspaces that connect status, tasks, notes, decisions, activity,
resources, and integrations. “Project” is intentionally broader than software.

### 3. Capture

Low-friction ingestion of unstructured information with preserved source
content, an Inbox, and reviewable AI classification.

### 4. Infrastructure

A linked resource graph with health, important metrics, alerts, external
monitoring, and drill-down into specialized systems.

### 5. Automations

Central visibility into one-time, recurring, conditional, event-based, and
agent routines, including an Overnight Queue and execution history.

### 6. Agents

An agent registry, assignments, bounded permissions, runs, approvals, outputs,
and audit history. External execution runtimes may perform the work.

## Cross-cutting capabilities

The six modules share:

- a global activity and event stream;
- search across structured and semantic data;
- notifications tied to context and actions;
- an API and MCP interface;
- integrations normalized into common primitives;
- capabilities, approvals, secret references, and audit records.

## Explicit initial non-goals

Do not initially build:

- a complete Netdata or metrics-storage replacement;
- a complete Home Assistant, Proxmox, AMP, GitHub, or deployment interface;
- another full coding-agent runtime;
- a general browser-automation platform;
- every project-management view or methodology;
- a universal credentials vault;
- a native mobile application before responsive web usage proves the need;
- enterprise multi-tenancy, billing, or organization administration;
- unrestricted autonomous control of production systems.

## Scope test

A candidate feature belongs in the first product boundary when it strengthens
at least one part of the observe-understand-act loop **and** gains meaningful
value from Commandry's cross-category context.

If it is primarily a deeper version of an existing specialized tool, prefer an
integration and a contextual summary with a deep link.

## Minimum coherent product

The smallest experience that proves the thesis should let a user:

1. define projects and resources with typed relationships;
2. capture a thought and preserve its original form;
3. create and view work and project knowledge;
4. connect at least one development source and one operational source;
5. see normalized activity and attention items;
6. generate a project brief and execution packet;
7. allow an agent to read scoped context and report a run result;
8. require approval for an action above the configured risk threshold.

Breadth should be proven with a narrow vertical slice, not dozens of shallow
connectors.

## Expanded MVP campaign

The current local campaign includes every planned module and cross-cutting
capability at the smallest useful depth, rather than treating roadmap phases as
release deferrals. Work and Knowledge should be usable persistent project
surfaces with list, board, focused query, original source, relationship, and
evidence paths. Infrastructure, activity, attention, notifications,
automations, and agents should connect through the same projects, resources,
events, and audit records.

Locally feasible adapters and fixtures may stand in for unavailable external
systems, but their provenance must remain visible in every view. A fake run or
simulated action never counts as live execution. Real development and
operational source connections, privileged actions, offsite recovery, and
production sign-in remain separate validation work when the required
credentials, VPS facts, and product decisions exist.

The campaign also attempts MVP-depth versions of later roadmap ideas such as
proactive rules, saved views, accessible responsive feedback, and a truthful
agent/system timeline where they can be driven by local persisted evidence.
Open product questions remain configurable or explicitly unresolved. This
expanded target does not override the initial non-goals or the accepted
deployment and security gates.
