# Execution model

**Status: Proposed**

## Agent

An agent is a registered, purpose-specific actor that can consume context and
perform bounded work through a runtime.

Recommended properties:

- name, role, and description;
- runtime/provider and model configuration;
- skills and supported action types;
- allowed projects and resources;
- granted capabilities and secret references;
- budget, autonomy policy, and concurrency limits;
- current status and last-seen time;
- run history.

An agent is a security principal. Its memory, secrets, workspace, and tool
access do not automatically flow to other agents.

## Execution packet

A portable, versioned snapshot that turns a work item into agent-ready context.
It contains:

- objective and expected outcome;
- why the work exists;
- selected project knowledge and decisions;
- relevant repositories, resources, files, APIs, and links;
- constraints and prohibited changes;
- acceptance criteria and verification expectations;
- suggested tools/runtime;
- granted capabilities and approval rules;
- packet version and source-record references.

Packets may be rendered as Markdown, fetched through an API or MCP, or assigned
directly to a runtime. Sensitive values are never embedded; packets reference
scoped capabilities.

## Run

A bounded attempt by a human, agent, or automation to execute work.

Suggested lifecycle:

```text
queued -> preparing -> running -> waiting_for_input
                               -> waiting_for_approval
                               -> verifying
                               -> succeeded | failed | cancelled
```

A run records:

- initiator, assignee, trigger, and related work item;
- packet version and capabilities granted;
- start/end time, status, cost/usage where available;
- progress summaries, outputs, and artifacts;
- requested and resolved approvals;
- actions attempted and their results;
- verification evidence and follow-up work;
- error classification and retry lineage.

## Automation

A durable rule that initiates a notification, action, or run. Trigger families:

- one-time schedule;
- recurring schedule;
- condition or threshold;
- normalized event;
- manual invocation;
- agent routine or heartbeat.

An automation defines trigger, scope, action or work template, execution actor,
policy, next evaluation/run, enabled state, and history. The definition is not
the run; each invocation creates its own immutable run record.

## Approval request

A pause point for a proposed action that policy does not allow automatically.
It contains:

- exact proposed action and actor;
- reason and expected result;
- affected resources and data;
- risk class and policy that required approval;
- reversibility and rollback notes;
- expiration and whether parameters may change after approval.

Approval applies to the described action, scope, and version. Material changes
require a new request. Approve, reject, expire, and cancel are audited outcomes.

## Autonomy policy

Autonomy is evaluated at action time from:

```text
actor + capability + resource scope + action risk + environment + policy
```

It is not a single agent-wide “autonomous” flag. The same agent might read
production metrics automatically, create a branch under standing permission,
and require approval to deploy or restart production.

## Overnight Queue

The Overnight Queue is a view and scheduling policy over eligible work items,
not a separate task type. Eligibility considers execution profile, readiness,
dependencies, capability availability, interaction likelihood, cost/budget,
and concurrency.

The morning brief summarizes completed, failed, cancelled, and
approval-blocked runs, with links to evidence and follow-up actions.
