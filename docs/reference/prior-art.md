# Prior art and integration references

**Status: Exploratory**

These products are references, not dependencies or endorsements. Their role is
to make patterns concrete and to prevent Commandry from rebuilding specialized
systems without reason. Product capabilities and licensing must be revalidated
against official sources before implementation decisions.

## Strategy references

### Everview

**Relevant pattern:** an understanding and execution layer above existing work
systems while those tools remain authoritative.

**Use in Commandry:** reinforces the system-of-understanding philosophy.

### Backstage

**Relevant patterns:** software catalog, domains, systems, components, APIs,
resources, typed ownership/relationships, and plugin architecture.

**Use in Commandry:** strongest conceptual reference for the project/resource
catalog and graph, generalized beyond software.

**Do not copy:** a developer-portal-first end-user experience.

## Work and knowledge references

### Plane

**Relevant patterns:** projects, work items, cycles/modules, intake, multiple
views, pages, APIs/webhooks, MCP, and reviewable AI actions.

**Use in Commandry:** work model, triage, and one object across multiple views.

**Do not copy:** the complete team project-management feature surface.

### AppFlowy

**Relevant patterns:** one structured dataset represented as table, board, or
calendar; blending documents with structured data; local/self-hosted posture.

**Use in Commandry:** flexible project knowledge and view projections.

## Agent execution references

### Paperclip

**Relevant patterns:** goals, projects, tasks, agent hierarchy, budgets,
approvals, blocking relationships, workspaces, bounded heartbeats, and run
history.

**Use in Commandry:** likely execution-backend candidate. Commandry would own
personal context and portfolio while Paperclip could own worker execution.

### Nerve

**Relevant patterns:** agent cockpit combining agents, Kanban work, scheduled
jobs, executions, memory, and workspace visibility.

**Use in Commandry:** agent/run visibility and operator UX.

### Asterism

**Relevant patterns:** separate agent identities, memory, secrets, workspaces,
skills, and autonomy levels.

**Use in Commandry:** agent isolation and explicit security boundaries.

### Lodestar

**Relevant patterns:** natural-language creation of scheduled dashboard widgets,
agent access to connected tools, and cached widget results.

**Use in Commandry:** later agent-generated project and Command Center widgets.

## Monitoring and infrastructure references

### Beszel

**Relevant patterns:** lightweight hub/agent collection, host and container
metrics, history, alerts, and API.

**Use in Commandry:** integration target or architectural reference for a small
Commandry Collector.

### Netdata

**Relevant patterns:** deep live telemetry, node views, charts, logs, alerts,
events, and historical metrics.

**Use in Commandry:** external telemetry/detail layer. Commandry provides
cross-project summary and actions rather than reproducing the engine.

### UptimeRobot

**Relevant patterns:** simple monitor creation; HTTP/S, ping, port, keyword,
DNS, and API checks; incidents and recovery.

**Use in Commandry:** outside-in monitoring model and simple state presentation.

### Homepage

**Relevant patterns:** compact API-backed cards across heterogeneous homelab
services, including Proxmox summaries.

**Use in Commandry:** proof that lightweight summaries and deep links can be
valuable without recreating provider consoles.

### Proxmox

**Integration shape:** cluster → node → QEMU VM/LXC → guest services, with node
and guest state, CPU, memory, storage, uptime, and network summaries.

### CubeCoders AMP

**Integration shape:** server → controller → instance → game service, including
application state, players, uptime, disk, CPU, memory, and permission-gated
instance actions.

### Infra Agent

**Existing concept:** lightweight uptime, telemetry, machine information,
service health, and traffic visualization. The source implementation has not
been inspected in this repository.

**Open direction:** preserve as an integration/collector concept, rename to
Commandry Collector, or replace most collection with Beszel/Netdata adapters.

## Security reference

### Infisical

**Relevant patterns:** machine identities, short-lived access tokens, dynamic
secrets, and identity-specific access.

**Use in Commandry:** one candidate for capability-mediated vault access. The
choice of vault remains open.

## Evaluation rule

Before adopting any reference:

1. Revalidate the current official capability and license.
2. Identify whether to borrow a pattern, integrate the product, or do neither.
3. Define system-of-record ownership and data flow.
4. Evaluate security, self-hosting, maintenance, API quality, and failure mode.
5. Record a durable adoption choice in an ADR.
