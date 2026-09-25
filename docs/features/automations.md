# Automations and the Overnight Queue

**Status: Proposed**

## Purpose

Automations centralize awareness and governance of scheduled, recurring,
conditional, event-driven, and delegated routines that might otherwise be
scattered across services.

## Automation types

| Type | Example |
| --- | --- |
| One-time | Remind me Friday. |
| Recurring | Summarize infrastructure health every Sunday. |
| Condition-based | Alert when a price or metric crosses a threshold. |
| Monitoring | Open an alert if a service is offline for three minutes. |
| Agent routine | Inspect active projects for stale work every Monday. |
| Overnight work | Run selected research and audit tasks after midnight. |
| Event-based | Collect context and open an investigation after deployment failure. |

An integration may remain the scheduler of record. Commandry can mirror its
definition and runs if ownership and synchronization are explicit.

## Automation registry

The Automations screen should show:

- name, project, trigger, and enabled state;
- next evaluation or run;
- last outcome and duration;
- execution actor and required capabilities;
- recent history, outputs, and errors;
- cost or usage when available;
- source of truth and external deep link;
- policy and approval behavior.

## Overnight Queue

Overnight is an execution profile and queue view for ready work expected to need
little interaction. Candidate work may include repository audits, research,
log inspection, documentation generation, analytics reviews, infrastructure
inventory, and refactor proposals.

Before scheduling, Commandry should evaluate:

- objective and acceptance-criteria completeness;
- unresolved dependencies and required user input;
- eligible agent/runtime and capabilities;
- risk/approval policy;
- expected duration, budget, and concurrency;
- whether the work can stop safely.

## Morning brief

The morning brief groups overnight outcomes:

- completed and verified;
- completed but awaiting user review;
- failed or timed out;
- blocked by missing input;
- awaiting approval;
- skipped because readiness or capacity changed.

Each item links to the run, artifacts, verification evidence, and suggested
follow-up. The brief summarizes outcomes rather than replaying logs.

## Failure and overlap behavior

Every automation must declare retry behavior, timeout, concurrency policy, and
what happens if the previous run is still active. Retries create linked attempts
and must not conceal the initial failure.

## Acceptance conditions

- Automation definition and individual runs are distinct.
- A user can tell which system owns scheduling and which actor will execute.
- Disabled automations do not evaluate or run.
- Approval-required work pauses before the governed action, not after it.
- Overnight results are reviewable from one brief with full evidence available.
