# Core domain model

**Status: Canonical**

## Model summary

Commandry uses a graph with an optional navigational hierarchy:

```text
Domain
  └─ Project or System
       ├─ Component
       ├─ Resource
       ├─ Work Item
       ├─ Knowledge Item
       └─ Activity

Any entity ──typed relationship──> Any compatible entity
```

The hierarchy makes common browsing easy. Typed relationships preserve the
real-world cases where one entity has several contexts or dependencies.

## Context entities

### Domain

A broad, durable area of responsibility, such as Personal, Software, Work,
Home, or Infrastructure.

Recommended properties:

- name and description;
- lifecycle state;
- display order and visual identity;
- owner, initially the single Commandry user.

Domains organize the portfolio. They are not security boundaries by default.

### Project

Something with ongoing context, state, resources, activity, knowledge, or work.
A project may represent an application, event, trip, research effort, home
improvement, or client engagement. It does not require a repository or deadline.

Recommended properties:

- name, summary, and type;
- lifecycle: proposed, active, paused, completed, archived;
- health or attention state;
- start, target, and completion dates where relevant;
- owning domain and additional relationships;
- briefing configuration and workspace layout.

### System

A coherent set of cooperating components and resources that provides a
capability. Examples include Game Hosting, Home Automation, or a production
application system.

A system differs from a project by emphasis: a system is generally operated
over time, while a project organizes purposeful change. One real-world concern
may be represented by both and related explicitly.

### Component

A logical part of a project or system, such as an API, website, AMP controller,
event plan, decorations workstream, or email pipeline. Components describe
functional composition and may depend on resources.

### Resource

A concrete or externally addressable thing: repository, domain, server, VM,
container, service, database, document, deployment, account, network device, or
game-server instance.

Resources can be nested for browsing and also related across the graph. A
Vercel deployment may appear beneath a provider account and also support a
project. Both views refer to the same resource.

Recommended properties:

- kind and subtype;
- lifecycle and operational state;
- parent for the primary navigational hierarchy;
- source connector and external identifier;
- external URL or deep link;
- ownership, location, environment, and metadata;
- sensitivity classification;
- last observed timestamp.

## Relationship

A relationship is a first-class, typed edge between two entities. It should
carry meaning rather than merely co-location.

Initial relationship vocabulary:

| Type | Example |
| --- | --- |
| `contains` / `contained_by` | Proxmox node contains VM 102 |
| `depends_on` / `required_by` | Website depends on database |
| `supports` / `supported_by` | Vercel deployment supports ResuPals |
| `deploys` / `deployed_as` | Repository deploys as web service |
| `owned_by` / `owns` | Resource owned by provider account |
| `relates_to` | Note relates to several projects |
| `blocks` / `blocked_by` | Task blocks release task |
| `implements` / `implemented_by` | Component implements requirement |
| `triggered_by` / `triggered` | Run triggered by event |
| `produced` / `produced_by` | Agent run produced document |

Relationship types should be centrally registered with:

- allowed source and target kinds;
- inverse relationship;
- cardinality guidance, if any;
- whether the edge participates in dependency or containment traversal.

Do not encode every relationship as a loose tag. Tags are useful labels;
relationships have semantics.

## Identity and external ownership

Commandry assigns every entity an internal stable ID. Externally owned entities
also store a source tuple such as:

```text
(connector instance, external object type, external object ID)
```

This supports idempotent synchronization and prevents display-name changes from
creating duplicates.

For mirrored entities, Commandry must distinguish:

- fields owned by the external system;
- Commandry-owned annotations and relationships;
- cached or derived fields;
- synchronization state and last successful observation.

## Hierarchy rules

- An entity has at most one primary parent for tree navigation.
- An entity may have any number of non-hierarchical relationships.
- Moving an entity in a tree does not silently remove its graph relationships.
- Cycles are prohibited in the primary parent chain but valid in general graph
  relationships when semantically meaningful.
- Deleting an externally sourced entity should normally tombstone or disconnect
  it rather than erase historical events and run records.

## Derived views

The model should support views such as:

- domain and project portfolio;
- project workspace;
- infrastructure tree;
- dependency and impact graph;
- task list, board, calendar, and timeline;
- activity stream;
- agent-ready and overnight work queues.

These are projections over shared objects, not separate storage models.
