# Infrastructure and monitoring

**Status: Proposed**

## Purpose

Commandry gives infrastructure operational context: what exists, how it is
related, what is healthy, what changed, which projects are affected, and what
actions are available. It does not aim to reproduce a full observability or
provider console.

## Resource explorer

The primary experience is a collapsible hierarchy backed by the resource graph.
Examples:

```text
OVH
└── Atlas
    ├── Proxmox
    │   ├── VM 102
    │   │   └── Coolify
    │   │       ├── Website A
    │   │       └── Database
    │   └── LXC 104
    └── Storage
```

```text
Game Hosting
└── Dedicated Server
    └── AMP Controller
        ├── Minecraft Production
        └── Palworld
```

Users can choose default expansion behavior. The tree is navigational; typed
relationships provide dependency, project, and cross-provider views.

## Resource summary

Depending on kind and available data, a resource may show:

- lifecycle and current health;
- uptime and last observation;
- CPU, memory, storage, disk I/O, network, and temperature;
- operating system, addresses, provider, and location;
- containers, processes, players, or child counts;
- available updates and active alerts;
- parent, children, dependencies, and dependent projects;
- recent events and linked runbooks/work;
- source-system deep link.

Missing or stale data must display as unknown, not healthy.

## Monitoring layers

### Local/host telemetry

A lightweight collector or integration can provide machine and container
metrics. The existing Infra Agent idea may evolve into a Commandry Collector or
remain an adapter beneath Commandry.

### External availability

HTTP/S, ping, port, keyword/content, DNS, and API assertion checks represent the
outside-in view. External availability is not inferred from host health.

### Specialized systems

- Proxmox: cluster, node, VM/LXC hierarchy and summary metrics.
- AMP: controller, instance, state, players, uptime, disk, CPU, and memory.
- Beszel/Netdata: telemetry and alert sources with deep drill-down retained in
  the source tool.
- Deployment/hosting providers: deployment, service, and domain health.

## Incidents and actions

A state change creates normalized events. Rules may open or resolve an alert.
The alert should connect the affected resource to projects, prior events,
existing work, and safe actions.

Possible actions include open source console, view logs, create/link task, ask
an agent for a read-only investigation, run a documented automation, or restart
a service. Every external action follows capability and approval policy.

## Acceptance conditions

- The model supports provider → host → hypervisor → guest → service nesting.
- The same resource can appear in project and infrastructure contexts.
- Staleness and source are visible for operational data.
- Internal health and external reachability can disagree without one overwriting
  the other.
- Detailed telemetry can remain in an external system while Commandry preserves
  summary, context, alerts, and history.
