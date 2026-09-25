# Operations model

**Status: Proposed**

This model normalizes operational data without attempting to replace every
source platform.

## Resource kinds

The resource model must be extensible. Expected kinds include:

- provider and account;
- datacenter and location;
- physical or dedicated server;
- cluster and hypervisor;
- virtual machine and LXC;
- Docker host and container;
- application, service, API, and website;
- game-server controller and instance;
- database and storage system;
- network device;
- repository, deployment, domain, and DNS zone;
- home-automation hub and device;
- custom resource defined by an integration.

Kinds influence presentation and available metrics/actions but share the common
resource contract in the [core model](core-model.md).

## Operational state

Resource lifecycle and health are separate:

- lifecycle examples: planned, active, suspended, retired;
- health examples: unknown, healthy, degraded, unhealthy, offline.

A connector observation may update health without changing lifecycle. Health
should include timestamp, source, reason, and confidence/freshness.

## Metric

A time-associated measurement about a resource or project, such as CPU,
memory, disk, network throughput, uptime, latency, player count, page views,
search impressions, deployment duration, or email bounce rate.

Metric identity includes name, subject, unit, and source. A sample includes
timestamp, value, and optional dimensions.

Commandry initially needs important current values, trends, and summaries. It
does not require a bespoke high-cardinality telemetry engine. Detailed data may
remain in Netdata, Beszel, a provider, or another system and be deep-linked.

## Event

An immutable statement that something happened. Events form the shared nervous
system for timelines, notifications, automations, analysis, and agents.

Minimum event envelope:

- stable event ID and event type;
- occurrence time and ingestion time;
- source connector or internal actor;
- subject entity and related entities;
- normalized payload plus source payload reference;
- severity and deduplication key where applicable;
- correlation/causation identifiers;
- processing version and provenance.

Representative types:

```text
monitor.down                 monitor.recovered
deployment.completed        deployment.failed
git.pull_request.merged      server.disk.threshold_crossed
agent.run.completed          agent.run.failed
work.created                 work.completed
analytics.anomaly_detected   automation.completed
secret.expiring              approval.requested
```

Event names use stable, past-tense facts. A continuing condition belongs in an
alert state rather than being represented by endlessly repeated duplicate
events.

## Alert

A stateful, actionable interpretation of one or more events or observations.
An alert includes:

- subject and affected relationships;
- severity and lifecycle: open, acknowledged, snoozed, resolved;
- first/last observed times;
- evidence and triggering policy;
- related work, knowledge, and prior incidents;
- available actions and required permissions.

Internal machine health and external availability are distinct signals. A
healthy host can still serve an inaccessible application, so both forms should
be modelled and correlated.

## Action

A normalized operation that can be proposed or invoked through an integration,
such as restart service, open provider, create task, request investigation, or
refresh data.

Every action definition declares:

- target kinds and input schema;
- risk class;
- required capability and scope;
- whether it is reversible and how;
- expected result and verification strategy;
- emitted audit and domain events.

Actions are described further in [Execution](execution.md) and
[Security and permissions](../architecture/security-and-permissions.md).
