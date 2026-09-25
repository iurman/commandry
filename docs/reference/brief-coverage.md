# Original working brief coverage

**Status: Operational**

This map proves that the 42 numbered sections in the
[archived initial Commandry working definition](original-product-definition.md)
have a canonical home. The original brief was an input to these docs; when
wording conflicts, follow the precedence in [`AGENTS.md`](../../AGENTS.md).

| # | Original topic | Canonical or primary documentation |
| ---: | --- | --- |
| 1 | Core philosophy | [Principles](../product/principles.md), [ADR 0001](../decisions/0001-external-systems-remain-authoritative.md) |
| 2 | Fundamental object model | [Core model](../domain/core-model.md) |
| 3 | Backstage reference | [Core model](../domain/core-model.md), [Prior art](prior-art.md) |
| 4 | Home dashboard | [Command Center](../features/command-center.md) |
| 5 | Quick Capture | [Capture and triage](../features/capture-and-triage.md) |
| 6 | Inbox and AI triage | [Capture and triage](../features/capture-and-triage.md), [Work and knowledge](../domain/work-and-knowledge.md) |
| 7 | Project workspace | [Project workspaces](../features/project-workspaces.md) |
| 8 | Project Overview | [Project workspaces](../features/project-workspaces.md), [Command Center](../features/command-center.md) |
| 9 | Work management | [Work and knowledge](../domain/work-and-knowledge.md), [Project workspaces](../features/project-workspaces.md) |
| 10 | Knowledge and project memory | [Work and knowledge](../domain/work-and-knowledge.md) |
| 11 | Execution packets | [Execution](../domain/execution.md), [Agent interface](../architecture/agent-interface.md) |
| 12 | MCP interface | [Agent interface](../architecture/agent-interface.md) |
| 13 | Infrastructure graph/tree | [Core model](../domain/core-model.md), [Infrastructure](../features/infrastructure.md) |
| 14 | Infrastructure Explorer | [Infrastructure](../features/infrastructure.md) |
| 15 | Infra Agent | [Infrastructure](../features/infrastructure.md), [Prior art](prior-art.md) |
| 16 | Beszel and Netdata | [Prior art](prior-art.md), [Operations](../domain/operations.md) |
| 17 | External monitoring | [Infrastructure](../features/infrastructure.md), [Operations](../domain/operations.md) |
| 18 | Proxmox hierarchy | [Infrastructure](../features/infrastructure.md), [Prior art](prior-art.md) |
| 19 | AMP and game hosting | [Infrastructure](../features/infrastructure.md), [Prior art](prior-art.md) |
| 20 | Service/application integrations | [Events and integrations](../architecture/events-and-integrations.md) |
| 21 | Analytics | [Command Center](../features/command-center.md), [Events and integrations](../architecture/events-and-integrations.md) |
| 22 | Events and signals | [Operations](../domain/operations.md), [Events and integrations](../architecture/events-and-integrations.md) |
| 23 | Automations | [Automations](../features/automations.md), [Execution](../domain/execution.md) |
| 24 | Overnight Queue | [Automations](../features/automations.md), [Execution](../domain/execution.md) |
| 25 | Agent orchestration | [Agents](../features/agents.md), [Execution](../domain/execution.md) |
| 26 | Paperclip | [Prior art](prior-art.md), [Agents](../features/agents.md) |
| 27 | Nerve and Asterism | [Prior art](prior-art.md), [Security](../architecture/security-and-permissions.md) |
| 28 | AI capacity management | [Agents](../features/agents.md), [Roadmap](../product/roadmap.md) |
| 29 | Approval and autonomy | [Security](../architecture/security-and-permissions.md), [ADR 0004](../decisions/0004-govern-actions-by-capability-and-risk.md) |
| 30 | Credentials/browser access | [Security](../architecture/security-and-permissions.md) |
| 31 | Screenshot-to-task | [Capture and triage](../features/capture-and-triage.md) |
| 32 | Notifications | [Search and notifications](../features/search-and-notifications.md) |
| 33 | Search and Ask Commandry | [Search and notifications](../features/search-and-notifications.md) |
| 34 | Relationships over folders | [Principles](../product/principles.md), [Core model](../domain/core-model.md), [ADR 0002](../decisions/0002-use-a-typed-relationship-model.md) |
| 35 | Reference systems | [Prior art](prior-art.md) |
| 36 | Initial non-goals | [Scope](../product/scope.md) |
| 37 | First product boundary | [Scope](../product/scope.md) |
| 38 | Initial navigation | [Information architecture](../ux/information-architecture.md) |
| 39 | Mobile philosophy | [Information architecture](../ux/information-architecture.md), [Principles](../product/principles.md) |
| 40 | Long-term loop | [Vision](../product/vision.md) |
| 41 | Long-term JARVIS behavior | [Vision](../product/vision.md), [Personas/use cases](../product/personas-and-use-cases.md) |
| 42 | Name | [Root README](../../README.md), [Domain facts](../operations/domain-and-deployment.md) |

## Important refinements made during decomposition

- The brief mixed durable decisions, proposed features, reference-product
  observations, and present-tense facts. The new structure labels each status.
- “Graph/tree” now explicitly means a typed graph plus one primary navigational
  parent; it does not prematurely choose a graph database.
- Events and alerts are separate: events are immutable facts, alerts are
  stateful actionable interpretations.
- Automations and runs are separate: definitions persist, invocations are
  historical attempts.
- Agents and runtimes are separate security/operational concepts.
- The domain purchase and Cloudflare nameserver change are recorded as current
  operational facts, not a deployment decision.
