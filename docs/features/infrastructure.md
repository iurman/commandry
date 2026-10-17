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

## Implemented read-only overview (2026-10-15)

The infrastructure overview at `/infrastructure` projects canonical resources,
active project links, containment, dependencies, real source freshness, latest
host capacity, and recent normalized events. The same records appear in its map
and list. `/infrastructure/inventory` retains the manual hierarchy editor;
`/infrastructure/wallboard` provides a separate TV presentation with optional
fullscreen, pause/resume and attention focus. Topology and list also support
page rotation in the wallboard.

The population is all recorded resources, including unlinked resources. A
project scope selects explicit active project-resource links, without inferring
membership or permissions from containment. Search operates across that complete
population. Gravity collects every overview API continuation into one complete
scene with no visible pages. Topology and list show 12 resources normally and
six in the wallboard, with matching totals and previous/next controls. Project
choices follow all API pages. The event rail is the latest eight real events
across Gravity's complete scope, or the visible resource page in topology/list,
with an ordinary event-history link. Synthetic events do not enter this rail.

Reporting means the connected sources are current within their configured
freshness windows. It does not mean a service is operational. Health remains
unknown because the current real adapters do not observe service availability.
Capacity measurements keep their exact source evidence and timestamps. Source
errors, future timestamps, stale observations, missing observations, and disabled
sources remain distinct. Refresh failure retains a clearly delayed snapshot.

The overview uses 15-second polling, not streaming transport. A short visual
cue may mark a newly seen persisted event less than a minute old; initial loads,
page changes, and reduced-motion mode do not produce animated traffic. Background
sound is silent. New provider monitoring and alert suppression are outside this
read-only slice. Existing signal review keeps its existing development-only
policy. Implementation evidence and remaining limits are recorded in the
[implementation and verification record](../implementation/infrastructure-network.md).

## Operational Observatory upgrade

The [Gravity Observatory specification](gravity-observatory.md) is the canonical definition of the operational landscape under ADR0016. It defines complete grouping, separate operational facets, reviewed configuration and source meaning. [Agent access](../architecture/observatory-agent-workflow.md) uses the same application services and explicitly records owner-only operations. [Execution and activation evidence](../plans/observatory-operational-landscape/EXECUTION.md) remains separate from the historical production slice below.

## Gravity presentation (2026-10-15)

The approved Gravity renderer is deployed in production using
the same canonical overview API. It adds host/project/custom layouts, nested
resource wells, focus and automatic cameras, source-backed event pulses,
complete direct-child counts and device-local appearance. It preserves source
freshness versus unknown service availability and the paginated topology/list
alternatives. See the [implementation record](../implementation/gravity-infrastructure.md)
and [ADR 0013](../decisions/0013-share-the-gravity-renderer-with-production.md).
The [production activation record](../implementation/gravity-infrastructure.md#production-activation-2026-10-15)
records the validated release and live inventory checks.

[ADR 0015](../decisions/0015-show-the-complete-gravity-landscape.md) replaces
Gravity's visible pages with a master landscape. All continuations must complete
before a new scene replaces the previous complete scene. A later-page failure
retains delayed prior evidence; changing project, search or presentation clears
the previous scope and cancels its collection. The displayed read beginning is
the earliest page read time. Pages are live reads, not an atomic database snapshot.

Texture-backed field records replace the old 64-contribution uniform array.
Terrain, camera and sky coverage scale with the landscape; geometric detail may
adapt while every resource remains represented and selectable. Actual device
graphics limits can still prevent rendering. Complete resource selection and
the list alternative remain available in that case. Grouping, colors, camera
and sector assignments remain device-local presentation preferences.
Screen labels adapt to their measured available space, prioritizing selected
resources and attention. Suppressing a crowded label never removes its well or
its entry in the complete resource picker.

Canonical inventory is already available through project-scoped MCP resource
continuation. The UI and agents read the same canonical identities; a scene does
not widen membership or client capabilities. See the
[real coding-agent pilot workflow](../workflows/gravity-master-scene-agent-pilot.md)
for task discovery, evidence and the remaining runtime boundaries.
