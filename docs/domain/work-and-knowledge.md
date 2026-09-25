# Work and knowledge model

**Status: Proposed**

## Capture

A capture is the immutable source envelope for something sent to Commandry
before the user decides how it should be organized.

Inputs may include text, image, screenshot, photo, URL, voice transcript, file,
email, conversation, service link, or agent submission.

Minimum properties:

- original payload or durable reference to it;
- input type, source, author, and received timestamp;
- processing state and provenance;
- extracted text and metadata as derived fields;
- zero or more triage suggestions;
- links to records created from the capture.

The original payload is never overwritten by extraction, summarization, or
classification.

## Triage suggestion

A reviewable proposal produced by a human rule, model, or agent. Suggested
fields can include:

- project, system, and relationships;
- record type: task, note, reference, decision, or idea;
- title and summary;
- priority, due date, and tags;
- actionability and possible duplicate;
- execution suitability and required planning;
- confidence and rationale.

Applying a suggestion creates or updates structured records and records who
approved it. Rejection should provide feedback without altering the capture.

## Work item

The shared actionable object behind tasks, subtasks, initiatives, and recurring
work definitions.

Recommended properties:

- type: initiative, task, or subtask;
- title, description, and acceptance criteria;
- lifecycle status;
- priority, start date, due date, and estimate where useful;
- project and typed relationships;
- assignee: human or agent;
- execution profile;
- dependencies and blocking relationships;
- source system and synchronization ownership;
- comments, attachments, and activity;
- completion evidence.

Execution profiles:

| Profile | Meaning |
| --- | --- |
| Interactive | Likely to require questions or user decisions. |
| Short autonomous | Safe, bounded work suitable to run now. |
| Long autonomous | Substantial work that needs little interaction. |
| Overnight | Intended for unattended execution and morning review. |
| Scheduled | Must begin or become due at a defined time. |
| Watch | Activates when a condition becomes true. |

One work item may appear in list, board, table, calendar, timeline, Today,
Waiting, Agent Ready, Overnight, or Someday views.

## Knowledge item

A durable piece of project memory. Initial types include:

- note;
- decision;
- idea;
- research;
- requirement;
- architecture note;
- runbook;
- meeting note;
- lesson learned;
- reference or link;
- instruction;
- document.

Knowledge may belong to more than one project and should retain provenance.
Credentials are not knowledge items; only a reference to a vault capability may
be stored.

## Decision

A specialized knowledge item containing:

- the question or context;
- chosen outcome;
- alternatives considered;
- rationale and consequences;
- decision status and date;
- related projects, work, resources, and evidence;
- superseding decision, when applicable.

Repository architecture choices may also be mirrored as ADRs, but the product
concept is broader and covers personal or operational decisions.

## Project brief

A generated, evidence-backed projection of project memory, not an independent
source of truth. It should cover:

- current state;
- meaningful recent changes;
- important decisions and rationale;
- open questions;
- blockers and waiting items;
- likely next actions;
- agent-specific context and constraints.

Every generated statement should be traceable to records or explicitly marked
as inference. Brief generation must not silently create facts.
