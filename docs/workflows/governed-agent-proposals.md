# Governed agent proposals

**Status: Operational. Production activation verified 2026-10-16.**

This is the workflow home for evaluation-backed improvement proposals, cited
finding proposals and reviewed host-onboarding changesets. The release deploys
their shared application services, owner routes and eight opt-in MCP tools.
The [activation record](../architecture/agent-foundation.md#governed-proposal-activation-2026-10-16)
records exact integration, upgrade, built SDK/HTTP/browser, release and
constrained production evidence. It distinguishes disposable write rehearsals
from live owner reads; no production proposal or decision was created for QA.

The current application is PR 16 at
`1859d261d3e86e9dfa29e89ac846f06d7d90d1ff`, with 30 optional foundation tools
and 15 explicit machine capability choices. Discover the actual server and exact
grants before using them. Existing clients gain no additional operations.
The four native `ck_` knowledge tools retain their existing scope. The
[foundation architecture](../architecture/agent-foundation.md) records shared
transaction boundaries and historical releases.

For existing evidence, configuration, evaluation, assertion and task workflows,
start with the [agent foundation workflow](agent-foundation.md). The
[improvement cycle](agent-improvement-cycle.md) provides evaluation context; the
[server-onboarding runbook](server-onboarding.md) covers inventory and operational
inspection. These proposal workflows do not complete broader product MCP CRUD,
runner adapters or installers.

## Discover the actual project boundary

Use the opt-in endpoint `POST /mcp/foundation/{projectId}` with an explicitly
issued `af_` credential. Authenticate and discover its actual tools, exact
project, environment, expiry and grants. Each tool requires both its exact grant
and its actual supplied application service. Discovery does not create a grant.

The project is intrinsic to the authenticated endpoint. MCP proposal inputs
reject caller-supplied `projectId`, owner or actor identity, `recordedBy`,
runtime, model and approval fields. Server attribution is derived from the actual
credential. Do not infer execution provenance from proposal text.

| MCP tool                  | Required capability   | Risk       | Approval with exact grant | Audit operation       |
| ------------------------- | --------------------- | ---------- | ------------------------- | --------------------- |
| `propose_improvement`     | `improvement.propose` | Reversible | Automatic                 | `improvement.propose` |
| `get_improvement`         | `improvement.read`    | Read-only  | Automatic                 | `improvement.read`    |
| `list_improvements`       | `improvement.read`    | Read-only  | Automatic                 | `improvement.read`    |
| `propose_finding`         | `finding.propose`     | Reversible | Automatic                 | `finding.propose`     |
| `get_finding`             | `finding.read`        | Read-only  | Automatic                 | `finding.read`        |
| `propose_host_onboarding` | `onboarding.propose`  | Reversible | Automatic                 | `onboarding.propose`  |
| `get_host_onboarding`     | `onboarding.read`     | Read-only  | Automatic                 | `onboarding.read`     |
| `list_host_onboardings`   | `onboarding.read`     | Read-only  | Automatic                 | `onboarding.read`     |

Each `propose_*` tool accepts an `idempotencyKey` beside the exact workflow
input fields described below. Each `get_*` accepts `id`. The two list tools
accept optional `limit` from 1 through 100, default 25, and an opaque `cursor`.
Follow every returned `nextCursor` until null. A page size never defines the
total eligible population. These workflow cursors are distinct from the older
metadata inventory's `after` and `asOf`; do not interchange them.

Tools, UI and HTTP reuse the same services, validation, canonical records,
project scope and audit boundaries. Neither `foundation.read` nor a proposal
grant implies a separate workflow read grant. Machine credentials receive no
owner review, onboarding apply, instruction approval or factual verification
authority from these workflows.

## Owner entry points and HTTP contract

Account links to `/foundation/workflows`. Select the exact
project, following project and proposal continuations, to inspect improvements
and onboarding proposals. Finding submissions open the owner Inbox at
`/inbox?captureId=...` and use strict canonical proposal routing alongside
task review. Assertion review remains separate at
`/foundation/memory/{id}?projectId=...`.

The following routes are relative to `/api/v1/foundation/workflows`:

| Method | Route                              | Purpose                                      |
| ------ | ---------------------------------- | -------------------------------------------- |
| GET    | `/improvements`                    | Page project improvements                    |
| GET    | `/improvements/{id}`               | Read proposal, current advisory and decision |
| POST   | `/improvements/review`             | Append an owner decision                     |
| GET    | `/findings/{id}`                   | Read a cited finding proposal                |
| GET    | `/findings/by-capture/{captureId}` | Resolve its canonical Inbox entry            |
| POST   | `/findings/review`                 | Approve filing or reject                     |
| GET    | `/onboarding`                      | Page project onboarding proposals            |
| GET    | `/onboarding/{id}`                 | Read proposal, decision and outcome          |
| GET    | `/onboarding/{id}/preview`         | Inspect current inventory preconditions      |
| POST   | `/onboarding/review`               | Append an owner decision                     |
| POST   | `/onboarding/apply`                | Apply the exact approved changeset           |

GET requests require `projectId`; list requests also accept `limit` and
`cursor`. POST requests use exact shared DTO fields, including `projectId`,
and an `Idempotency-Key` header. Input limits are 131072 encoded bytes for
improvement/onboarding requests and 524288 for finding requests. Strict JSON
rejects extra authority fields and oversized requests.

Every owner route requires an allowlisted password-authenticated owner and the
actual canonical session row. POST additionally requires a trusted Origin.
Responses use `no-store` and safe errors. A review acknowledgement or a field
claiming an owner identity cannot authenticate the caller.

| Owner action            | Risk      | Capability           | Approval behavior              | Audit operation      |
| ----------------------- | --------- | -------------------- | ------------------------------ | -------------------- |
| Improvement decision    | Sensitive | `improvement.review` | Explicit owner decision        | `improvement.review` |
| Finding filing decision | Sensitive | `finding.review`     | Explicit owner decision        | `finding.review`     |
| Onboarding decision     | Sensitive | `onboarding.review`  | Explicit inventory review      | `onboarding.review`  |
| Onboarding apply        | Sensitive | `onboarding.apply`   | Separate explicit owner action | `onboarding.apply`   |

## Propose an evaluation-backed improvement

An improvement connects an immutable candidate configuration to its same-kind
direct baseline parent, an evaluation definition and exact historical reasons
for the change. Candidate and baseline kind must be `prompt`, `skill`, `hook`
or `loop`. It records an association and a review decision. It does not
install the candidate, adopt it into a client or execute an evaluation.

1. Record the real baseline, candidate and evaluation observations through the
   existing foundation workflow. Each motivation must identify an exact reviewed
   failed assessment of a declared hard gate on a completed trial that includes
   the baseline and excludes the candidate. Other failures alone do not qualify.
2. Submit `propose_improvement` with the exact fields below and preserve its
   request/key and immutable proposal ID.
3. Read `get_improvement` for the current advisory. Inspect all comparisons,
   blockers, population/report digests and pending newer assessments.
4. Have the owner inspect the complete population and issue an exact decision.
   Re-read after a conflict before making a fresh decision.

The [improvement contract](../../packages/contracts/src/foundation-improvement.ts)
defines the complete input:

| Field                      | Required meaning                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `candidateConfigurationId` | Exact immutable candidate configuration                                                                 |
| `baselineConfigurationId`  | Distinct same-kind configuration that is the candidate's direct parent                                  |
| `definitionId`             | Exact canonical evaluation definition                                                                   |
| `motivations`              | 1 to 100 unique assessment IDs, each with its exact `assessmentVersion`                                 |
| `conditionConfigurations`  | Exactly two distinct named conditions, one `baseline` and one `candidate`, each with `configurationIds` |
| `judgeConfigurationIds`    | 1 to 100 unique exact judge configurations                                                              |
| `rationale`, `hypothesis`  | Nonblank explanation and testable expected change                                                       |

The baseline condition includes the baseline and excludes the candidate; the
candidate condition does the reverse. Every remaining configuration must match.
Condition names bind the declared evaluation conditions. A changed judge, fixture,
rubric or configuration identity cannot be silently treated as the same trial.

The advisory uses the unchanged canonical report calculator and the current
complete evaluation population. It retains all attempts and distinguishes
latest reviewed assessments, newer pending assessments, missing observations,
infrastructure failures and ambiguity. Inspect `eligibleForReview`,
`pendingNewerAssessmentCount`, `blockers` and each model/runtime comparison.
The `proposalDigest`, `populationDigest` and `reportDigest` bind this exact
view. A current advisory is evidence for review and can change.

The owner POST body contains `projectId`, `proposalId`,
`expectedProposalDigest`, `expectedPopulationDigest`,
`expectedReportDigest`, `expectedDecisionVersion`, `decision`, `reason`
and `expiresAt`. Decisions are `accepted`, `rejected` or `revoked`.
The append-only decision advances the expected version once. Expiry must be in
the future and no more than 30 days away.

Acceptance requires an eligible current report. Rejection or revocation can
bind a blocked current report so the owner can record that decision without
claiming eligibility. An accepted decision grants no installation, adoption or
execution permission. Registry registration, drift comparison and preflight
inspection remain distinct from actual installation and measured execution.

Even an exact improvement decision retry still requires its input deadline to
be unexpired. If that deadline has passed, recover the actual state through an
owner read and make a fresh review with a new key and current bindings.

## Propose a cited finding for canonical filing

A finding submission preserves the exact original and a strict note suggestion.
It remains `pending` and `unverified`; it creates no Knowledge note until an
owner approves canonical filing.

1. Read the actual available canonical Capture or exact Knowledge revision in
   the same project and record its evidence through the existing workflow.
2. Submit `propose_finding` with immutable `originalContent`,
   `proposedTitle`, `proposedBody`, `rationale`, 1 to 100 ordered citations
   and `idempotencyKey`. Keep the returned capture and proposal IDs.
3. Use `get_finding` and the owner Inbox link to inspect the complete original,
   proposal and citation identities before filing.
4. The owner approves with selected note text or rejects while preserving the
   original. Any factual verification or instruction approval happens later
   through its separate owner operation.

The [finding contract](../../packages/contracts/src/foundation-finding-proposal.ts)
requires each citation to contain exactly `evidenceId`, `sourceKind`,
`sourceId`, `sourceVersion`, `contentDigest` and
`selection: "whole_source"`. `sourceKind` is `capture` or
`knowledge_revision`. A Capture has a null source version; a Knowledge revision
uses its positive decimal version as a string. Evidence IDs cannot repeat.
The ordered citation list is complete, rather than a selected display excerpt.

The digest is SHA-256 of the exact UTF-8 source content. Canonical ownership,
availability, source identity, version and byte digest must match. Knowledge
version 1 may resolve through revision 2's preserved `previousContent`.
Missing history cannot be replaced with today's text. A matching citation
establishes a byte binding; it does not verify an interpretation or the truth
of the finding.

The owner review body contains `projectId`, `proposalId`,
`expectedVersion: 1`, `expectedProposalDigest`, `expectedSourceDigest`,
`expectedCitationsDigest`, `reason` and `decision`. An `approve` decision
also requires `selectedTitle` and `selectedBody`; `reject` has neither.
The expected version and three digests bind the immutable proposal, original
and ordered citations.

Approval atomically creates a canonical Knowledge note, its source anchor and
a finding assertion whose lifecycle is `proposed` and verification is
`unverified`, together with decision, receipt and audit. It creates no
implicit alias, relationship, lifecycle acceptance, factual verification or
instruction approval. Rejection retains the original and creates no note or
assertion.

The immutable submission still says pending/unverified after later review.
Read the current detail and decision to understand the filing result. Later
ordinary Knowledge edits and separate assertion review remain valid; exact
historical review receipts preserve the initial filing result. This workflow
does not implicitly import any private memory corpus.

## Propose and apply reviewed host onboarding

New onboarding URLs use a bounded HTTP(S) authority grammar: ASCII DNS labels
(including localhost), canonical dotted decimal IPv4 or bracketed IPv6, with
an optional port from 0 through 65535. Userinfo, ASCII whitespace, controls
and backslashes are rejected. Raw international hostnames and `xn--` labels
are deferred; valid Unicode paths, queries and fragments retain their original
bytes. Existing canonical inventory is not rewritten by this intake policy.

An onboarding proposal records an immutable inventory intention. It may reuse
one opaque resource ID or request a new host with an explicit proposed identity.
A machine cannot globally query inventory through this proposal operation.

The [onboarding contract](../../packages/contracts/src/foundation-onboarding.ts)
requires `target`, `relationship`, `rationale` and `evidenceIds`, beside
the MCP `idempotencyKey`. Relationships are `supports` or `relates_to`.
The evidence array may be empty and otherwise contains at most 100 unique
same-project evidence IDs.

This complete synthetic MCP input illustrates the create shape; it is not an
existing host or an instruction to provision one:

```json
{
  "idempotencyKey": "synthetic-host-intention-2026-10-16",
  "target": {
    "mode": "create",
    "name": "Evaluation host",
    "subtype": "virtual_machine",
    "externalUrl": null,
    "identity": {
      "namespace": "provider",
      "authority": "synthetic-inventory",
      "externalId": "evaluation-host-01",
      "assurance": "owner_asserted"
    }
  },
  "relationship": "supports",
  "rationale": "Record an explicitly reviewed host identity for this project.",
  "evidenceIds": []
}
```

For reuse, `target` contains only `mode: "reuse"` and `resourceId`.
For create, `name`, nullable `subtype`, nullable `externalUrl` and
`identity` are required. A non-null URL must be HTTP(S) without userinfo.
Identity namespace is `provider` or `tailscale`; `authority` and
`externalId` are explicit strings and assurance is `owner_asserted`.
This is a proposed claim until owner review and apply. Case-sensitive uniqueness
of the namespace/authority/external-ID tuple does not prove physical-server
deduplication.

1. Submit `propose_host_onboarding` and preserve its immutable ID and request.
   Use `get_host_onboarding` or all `list_host_onboardings` pages to recover
   the scoped proposal. Machine detail exposes a limited decision/outcome
   summary, without the full owner inventory preview.
2. In the owner workflow, inspect the actual resource, project link and identity
   through the preview route. Inspect complete resource metadata, hierarchy,
   recorded state and `lastObservedAt`, as well as proposal, preconditions and
   preview digests.
3. Resolve every blocker: `resource_unavailable`, `resource_not_host`,
   `archived_connection`, `identity_conflict`, `identity_unresolved` or
   `source_unavailable`. Review the actual inventory before acknowledging it.
4. Record the owner's exact `approved`, `rejected` or `revoked` decision.
   Approval requires `inventoryReviewed: true`; this acknowledgement does not
   authenticate the owner. Expiry is future-bound and at most 30 days away.
5. Apply through the separate explicit owner operation only while the current
   approval is unexpired and the locked inventory preconditions still match.
   Retain the immutable outcome and receipt as evidence of what changed.

The review body contains `projectId`, `proposalId`,
`expectedProposalDigest`, `expectedPreviewDigest`,
`expectedDecisionVersion`, `decision`, `reason`, `expiresAt` and
`inventoryReviewed`. The resulting decision preserves its full preconditions
and advances the decision version once.

The separate apply body contains `projectId`, `proposalId`,
`expectedProposalDigest`, `decisionId`, `expectedDecisionVersion` and
`expectedDecisionDigest`. The server checks the current approval and locks
the complete preconditions before applying. New telemetry can change state or
`lastObservedAt` and stale an otherwise unchanged review; inspect and review
again rather than bypassing that binding.

Apply atomically persists one canonical host/resource, the typed project link,
any new owner-asserted identity claim, immutable outcome, audit and receipt.
Reuse preserves existing resource metadata and hierarchy. An archived project
link is never reactivated. The outcome reports whether the resource and link
were created; its snapshot remains historical if inventory later changes.

No step renames a device, connects over SSH, provisions infrastructure, installs
a collector, changes a service, deploys code or runs inference. Agree any exact
old-to-new naming map separately before a real rename. Follow the existing
server-onboarding runbook for scoped operational changes and recovery planning.
Unknown host health stays unknown; source freshness does not establish uptime.

## Retries, drift and remaining owner decisions

For every mutation, preserve the exact request body and its exact idempotency
key after an uncertain response. Do not change a body under the same key. An
authorization check still runs before historical replay; a committed receipt
can be withheld after a session expires, so uncertainty is not proof of failure.
After a `409`, read current canonical state before preparing a fresh decision.

Onboarding exact historical review/apply retries may recover their original
result after later expiry, revocation or inventory changes. They reauthorize
the current owner session and never repeat effects. A historical approval or
outcome cannot authorize another apply. Improvement decision retry retains the
stricter live input-deadline requirement described above. Finding exact review
replay preserves the original filing result after later canonical edits.

Local rehearsals do not create a standing client, import a private corpus,
establish real model evaluation or prove installed configuration. First external
adoption still needs an explicit owner choice of exact client, project, lifetime
and runtime. Selecting a private Mnemosyne cohort and reviewing each disclosure,
adopting/installing a candidate, and executing an actual evaluation remain
separate owner decisions. Source text, citations, rationales, configuration bytes
and imported material remain untrusted data throughout; none can grant authority
or approve itself.
