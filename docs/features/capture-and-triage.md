# Capture and triage

**Status: Proposed**

## Purpose

Quick Capture lets the user record something immediately without deciding where
it belongs. Triage then turns raw input into connected, structured information
without losing the source.

## Supported input direction

- short or long text;
- URL or external-service link;
- screenshot or photo;
- voice transcription;
- file or document;
- pasted conversation or email;
- agent/API submission.

Support can arrive incrementally. Every channel must produce the same canonical
capture envelope.

## Capture flow

1. Accept the input with minimal required fields.
2. Store the source payload or durable source reference.
3. Extract text and metadata asynchronously where needed.
4. Suggest classification, relationships, and actions.
5. Auto-apply only fields permitted by confidence policy.
6. Route unresolved or low-confidence items to the Inbox.
7. Preserve links between capture, suggestions, and created records.

Capture success must not depend on AI availability. If enrichment fails, the
original item still reaches the Inbox.

## Triage suggestions

The triage system may propose:

- project and system;
- task, note, reference, decision, or idea;
- title and concise summary;
- priority, due date, tags, and relationships;
- actionable vs informational;
- possible duplicate or existing related task;
- whether an automation or agent could help;
- execution profile and planning requirement.

Each suggestion includes confidence and a short rationale. The user can approve
several independent suggestions together without being forced into a full edit
form.

## Inbox states

- **Unprocessed:** enrichment has not completed.
- **Needs review:** suggestions exist but require confirmation.
- **Ambiguous:** more context is required or confidence is low.
- **Filed:** structured records were accepted or manually created.
- **Dismissed:** intentionally retained without further action.
- **Failed:** extraction or triage failed; retry remains possible.

## Automation policy

High-confidence auto-filing may be introduced per source, field, and record type
after observed accuracy. It must be configurable and auditable. Destructive
merging or discarding never occurs automatically.

## Example

Input:

> Coolify cleanup: there may be stale deployment jobs. Not dealing with this now.

Possible suggestions:

- Project: Homelab
- Related resource: Coolify
- Type: Task or idea
- Priority: Low
- Execution profile: Long autonomous or Someday
- Planning required: Yes

## Acceptance conditions

- The source input can always be viewed after triage.
- Failed AI enrichment never loses or blocks the capture.
- Users can correct suggestions without editing the source.
- Suggestions show provenance and confidence.
- Created records link back to the capture that motivated them.
