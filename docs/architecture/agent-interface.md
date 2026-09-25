# Agent interface

**Status: Proposed**

## Goal

Commandry should be a durable shared brain for many agent tools. The interface
must let agents discover authorized context, create or update work, record
knowledge, and request governed action without coupling them to the web UI.

## Interface surfaces

### API

The application API is the underlying programmatic contract for Commandry
clients, connectors, and runtime adapters.

### MCP server

MCP provides an agent-friendly discovery and tool surface over the same
application services and policy checks. It does not bypass the API's identity,
scope, audit, or approval rules.

### Runtime adapters

Adapters dispatch execution packets and ingest run state from external agent
runtimes. They translate runtime-specific sessions, workspaces, logs, artifacts,
and callbacks into the shared run model.

## Initial read tools

The first agent interface should emphasize safe retrieval:

- list/search authorized projects;
- get a project brief;
- get work item and execution context;
- list related resources, knowledge, and recent activity;
- inspect alerts, automation outcomes, and agent runs;
- resolve a repository/resource to its Commandry project context.

Read results include source references, freshness, and sensitivity metadata.

## Initial write tools

Low-risk initial mutations may include:

- create a capture;
- create or update a Commandry-owned work item;
- append a comment or run progress summary;
- record a proposed decision or knowledge item;
- mark a run blocked with a reason;
- submit an action or approval request.

External-system writes should be added action by action after capability and
verification behavior is defined.

## Execution packet contract

The packet is a point-in-time selection of context. It should include stable
record IDs and a generation timestamp so an agent or verifier can detect stale
assumptions. Large source documents may be referenced rather than embedded.

Packet assembly should minimize disclosure: include what the task needs, not
every record in the project. The agent can request additional authorized context
with an auditable reason.

## Run protocol

A runtime adapter should support, where possible:

- dispatch with packet and run-specific capability token/reference;
- status and meaningful progress updates;
- structured requests for user input or approval;
- artifact and action reporting;
- cancellation;
- completion with outcome and verification evidence;
- retry/resume lineage.

Heartbeats or schedules may wake bounded work. A run should perform a defined
piece of work, report state, and stop rather than remaining an ungoverned
permanent process.

## Example agent questions

- List my active projects.
- Give me current context for ResuPals.
- Which infrastructure work is agent-ready?
- Record that a task is blocked on a credential capability.
- What resources are associated with this repository?
- Create a task from this investigation result.

## Compatibility constraints

- UI, API, and MCP share the same object definitions and authorization logic.
- Agent-created content identifies agent, run, model/runtime where available,
  and source packet.
- Tool descriptions must state side effects and risk class.
- Tool responses should be structured enough for deterministic use and concise
  enough not to exhaust agent context.
