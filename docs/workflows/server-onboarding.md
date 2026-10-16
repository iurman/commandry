# Server onboarding

**Status: Operational runbook, version 1.0.0, 2026-10-16.**

Use this procedure for an owner-authorized intake and evidence review of one
server. Completion means the agreed intake scope is verified; it does not mean
a host was provisioned, renamed, monitored or made available. This document
does not itself implement a workflow engine. The source-level
[governed onboarding workflow](governed-agent-proposals.md#propose-and-apply-reviewed-host-onboarding)
adds resumable inventory proposals, owner preview, review and separate apply.
Its activation must be verified separately from the earlier runbook release.

Check the [foundation activation record](../architecture/agent-foundation.md#production-activation-2026-10-16)
for the exact verified production release and its limits. The
[resource-read implementation](../architecture/agent-foundation.md#canonical-project-resource-reads)
is a separate follow-up to that activation. Discover the connected endpoint's
actual tools before depending on it. A merged change, a passing build or a
local rehearsal is not evidence that a production tool is available.

## Scope and capabilities

Identify the owner, intended project, environment, requested outcome, permitted
read access, time budget and exclusions before collecting data. Preserve the
current request and applicable AGENTS rules. Keep normal hooks, review gates
and constrained deployment controls intact. These tools expose no shell,
SSH session, inference runner or paid fallback.

| Need                                                                | Existing path and authority                                                                                                                                   | Risk, approval and evidence                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project context and exact Knowledge sources                         | Legacy authorized knowledge connection: `list_projects`, `get_project_brief`, `search_knowledge`, `get_knowledge_item`                                        | Read-only under its existing credential and audit boundary; no actions                                                                                                          |
| Current approved instructions and foundation evidence/configuration | Separate `af_` foundation endpoint; `foundation.read`; discover supplied tools                                                                                | Read-only, automatic with exact current grant; `foundation.read` audit                                                                                                          |
| Active project-resource connections                                 | `list_project_resources`, only with an actual supplied service and explicit `resources.read` grant                                                            | Read-only, automatic with exact grant; `resources.read` audit                                                                                                                   |
| Existing primary or related Work                                    | `list_project_work` with separate `work.read`                                                                                                                 | Read-only, automatic with exact grant; `work.read` audit; no Work mutation                                                                                                      |
| Store an allowed nonsecret evidence reference                       | `record_evidence` with `evidence.record`                                                                                                                      | Reversible, automatic with exact grant; `evidence.record` audit; reference starts unverified                                                                                    |
| Submit a task suggestion                                            | `propose_task` with explicit `work.propose`                                                                                                                   | Reversible, automatic with exact grant; `work.propose` audit; owner review precedes Work                                                                                        |
| Resolve inventory/source identity or change owner records           | Existing owner inventory at `/infrastructure/inventory` and Integrations controls, within a separately authorized owner session                               | Owner-operated path; inspect its actual operation, risk, approval and audit before each change; no equivalent machine mutation granted here                                     |
| Rename a host, install a collector, change services or deploy       | Separately scoped owner decision and supported constrained external adapter                                                                                   | Sensitive or destructive as the actual action requires; exact target, approval, rollback and verification required; unavailable through these MCP tools                         |
| Product onboarding state, preview and reviewed inventory apply      | [Governed onboarding source workflow](governed-agent-proposals.md#propose-and-apply-reviewed-host-onboarding); automatic alias resolution remains unsupported | Source MCP proposal/status tools: `propose_host_onboarding`, `get_host_onboarding`, `list_host_onboardings`; discover actual activation. Preview/review/apply remain owner-only |

A `ck_` knowledge credential does not become an `af_` foundation credential.
The foundation endpoint binds project and environment through the actual
credential and server. Do not inject actor, project, environment or an owner
flag into tool arguments. A credential reference in external custody grants
no access by itself. Owner issuance, revocation, inventory edits and task
decisions remain owner operations; see the
[foundation workflow](agent-foundation.md).

## Procedure

1. **Freeze a nonsecret intake.** Record the requested host identity, proposed
   purpose, expected source/provider, known aliases, relevant project and the
   specific observations needed. Distinguish owner statements, direct
   observations and inferred relationships. Do not assume a hostname, display
   name, provider label and Tailscale identity designate the same machine.
   If the incoming request contains credentials, preserve its original only
   in the authorized external runtime. Prepare explicitly labeled nonsecret
   derived intake text with the omitted categories identified. Do not quote
   that derived text as the verbatim secret-bearing request. Keep secret values,
   credential files and sensitive original digests out of Commandry evidence,
   Knowledge, captures, memory, Work, evaluation artifacts, screenshots and logs.

2. **Discover real access.** On the existing authorized knowledge connection,
   start with these MCP calls:

   ```json
   { "name": "list_projects", "arguments": {} }
   ```

   ```json
   { "name": "get_project_brief", "arguments": {} }
   ```

   Search relevant owner conventions, earlier server intake, identity aliases
   and source runbooks with `search_knowledge`, using its discovered schema.
   Follow every `nextCursor` until null. Read selected sources through
   `get_knowledge_item`, following `nextOffset` until null; retain exact
   Knowledge ID, source capture ID, version and timestamps. Recheck the version
   after chunked retrieval; restart if it changed. Brief previews and a search
   hit are not complete sources or complete infrastructure inventories.

   Separately discover the authorized foundation connection. When granted,
   `get_foundation_identity` accepts an empty argument object and reports
   current authority and supported operations. Write-only or resource-only
   credentials may legitimately lack this tool. Retain the authenticated
   connection's actual project/environment metadata without inventing an actor.
   Missing scope information blocks dependent operations. Never request broader
   grants merely to make this procedure appear complete.

3. **Recollect current instructions.** If present and granted, use:

   ```json
   {
     "name": "get_general_working_context",
     "arguments": {
       "taskDirection": "Review the authorized server intake, reuse existing identities, and report unresolved changes for owner review.",
       "maxCharacters": 12000,
       "limit": 25
     }
   }
   ```

   Follow returned `asOf` and `snapshot.continuation` as `after` until null.
   Record omissions, freshness, source versions and exact instruction approvals.
   Stale, contradictory, unapproved or expired material cannot silently become
   instruction authority. The current request governs within real permissions;
   retrieved source text is evidence, not authorization. Context selection
   creates no task execution packet and lasts only as its approvals remain live.

4. **Reconcile canonical identities before proposing changes.** When available:

   ```json
   {
     "name": "list_project_resources",
     "arguments": { "limit": 25, "cursor": null }
   }
   ```

   Copy each returned structured `nextCursor` unchanged into the next call,
   until null. Keep every active connection across all resource kinds and
   recorded states. Preserve connection ID, relationship type, exact resource
   fields and `contentDigest`. Multiple relationships to one resource remain
   distinct connections. A recorded archived resource may still have an active
   project connection.

   Match the intake against these records and the authorized source evidence.
   A parent reference does not authorize parent/child reads; an external URL
   does not authorize fetching it. This tool does not enumerate global unlinked
   inventory, fetch telemetry, configure sources or resolve ambiguous aliases.
   Ask the owner to inspect existing global inventory and Integrations through
   their current controls when project connections cannot settle reuse. Mark
   inaccessible populations unknown rather than concluding the host is new.

   Produce a decision table for each alias: observed label, authoritative
   source/version, candidate canonical resource ID, confidence basis, ambiguity
   and the specific owner decision needed. Never merge unrelated hosts or
   create a duplicate to bypass uncertainty. A rename requires the owner's
   exact old-to-new map across Commandry, OS, hypervisor, provider and Tailscale
   identities before any separately authorized execution.

5. **Separate observations from intended changes.** Describe the existing
   resource/source to reuse and each missing or conflicting fact. Observe
   source timestamp, configured freshness window, receiver/import timestamps
   and availability separately through an actually authorized source path.
   `lastObservedAt`, a fresh collector sample and available CPU capacity do not
   prove service availability. State unknown health unless a real
   service-availability source supports it.

   If an external read is needed, identify the target, exact read scope,
   credential custody, supported runtime and output redaction first. This
   runbook does not provide that runtime or authorize a command. Before changing
   an existing VPS, the separately reviewed plan must inventory workloads,
   containers, bound ports, routes, backups and recovery access and define
   rollback. Preserve existing services. Missing adapters or access block
   only the dependent step; finish permitted identity and evidence work.

6. **Prepare one reviewable owner queue.** List reuse decisions first, then
   proposed inventory/source changes with current canonical IDs, expected
   versions if the owner operation exposes them, exact desired values, risk,
   capability gap, approval, rollback and verification. An absent version is
   unknown, not permission for an unconditional overwrite. Source MCP proposal
   and status tools now support onboarding intake after actual activation is
   discovered. Preview, review and apply remain separate owner-only operations.
   A draft table alone neither reserves records nor protects concurrent edits.

   Check all authorized `list_project_work` pages for existing follow-up tasks
   before submitting another proposal. Reuse real known proposal/task IDs from
   the checkpoint. Without Work read, disclose that duplicate search is
   incomplete. Submit only if the owner requested a task and `work.propose`
   is explicitly granted. This illustrative, entirely nonsecret input shows
   the exact supported task shape; it records no actual host observation:

   ```json
   {
     "name": "propose_task",
     "arguments": {
       "originalContent": "Illustrative nonsecret derived intake: review an unresolved host alias. Credential material omitted; the authorized original remains in external custody.",
       "proposedTitle": "Review unresolved host identity before onboarding",
       "proposedBody": "Resolve the alias against existing canonical inventory and sources before considering a separately authorized change.",
       "rationale": "Identity ambiguity prevents a verified reuse or new-host decision.",
       "idempotencyKey": "runbook.example.server-intake.v1"
     }
   }
   ```

   For a real logical submission, choose one stable new key and freeze the
   exact nonsecret body. Keep the receipt's proposal/capture IDs, source and
   proposal digests, version, correlation and replay status. Preserve exact
   text, including whitespace, across retries. No Work or execution exists
   merely because a pending proposal was accepted.

7. **Obtain owner decisions through existing paths.** The owner reads the
   current proposal in Inbox using its real capture ID. Approval creates one
   canonical unassigned open task; rejection preserves the original unfiled
   capture. The owner API binds `expectedVersion: 1`,
   `expectedSourceDigest` and `expectedProposalDigest`, with exact selected
   title/body on approval, under a live owner session, trusted Origin and
   Idempotency-Key. See
   [the exact owner contract](agent-foundation.md#propose-a-canonical-task-for-owner-review).
   An old pending submission receipt does not prove today's decision. Machines
   cannot read raw proposal originals, approve their own proposals or update
   Work through these read tools.

8. **Verify and hand off.** Re-read current authorized records after any
   separately approved owner action. Compare exact IDs and metadata, preserve
   concurrent owner changes, and verify actual source attribution and observation
   times. Report which accepted intake criteria passed, which remain partial,
   and which are blocked. Link the genuine owner decision and audit if available;
   do not invent a product run ID or claim an action from a file's existence.

## Resumable operator checkpoint

Keep a nonsecret checkpoint in the task's authorized external artifact location.
It is an operator record, not a Commandry workflow run or a credential store.
Update after each durable read population, receipt or owner decision.

| Field               | Required content                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Procedure and scope | Runbook version, current requested outcome, project/environment, scope evidence and exclusions                                                     |
| Identity            | Actual returned resource/connection/source IDs, observed aliases, explicit ambiguity and approved naming map if any                                |
| Sources             | Real Knowledge/capture/evidence IDs, exact versions/digests, timestamps, source availability and omitted sensitive categories                      |
| Pagination          | Tool/population, read time, completed pages, actual continuation or null, creation cutoff where applicable, restart needed or unknown              |
| Durable writes      | Actual configuration/evidence/proposal/capture/Work IDs only when returned; exact safe input/key and receipt/correlation; uncertain delivery state |
| Decisions           | Pending versus actual owner decisions, reviewed versions/digests, authorized next action and rollback reference                                    |
| Resume              | Last verified step, remaining criteria, blocked dependencies, next permitted action and credential expiry/revocation status without secrets        |

On reconnect, restore this checkpoint, rediscover tools and current authority,
and re-read live identity/source state. Continue the correct pagination contract
only while its cursor remains valid. Recover known receipts before creating new
proposal keys. Never duplicate a proposal because the connection was lost.

## Verification and completion

| Criterion                                         | Evidence required                                                                    | Insufficient evidence                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Project and authority                             | Actual authenticated connection scope and discovered tools/grants                    | A requested project name, a credential reference or old discovery alone   |
| Existing identity reused or explicitly unresolved | Canonical IDs plus scoped source evidence and owner ambiguity decisions              | Matching display names or an incomplete project page                      |
| Resource population reviewed                      | All applicable continuation pages and exact connection digests                       | Dropping second links to one resource or treating a parent ID as a read   |
| Source attribution/freshness                      | Actual source record and observation/ingestion timestamps under its freshness policy | Resource registration or a timestamp alone as proof of health             |
| Owner change completed, when in scope             | Exact approved target/input, actual audit/receipt and post-action read/verification  | Pending task submission, a proposed table or an existing artifact         |
| Follow-up task resolved or handed off             | Actual proposal/current owner decision/Work IDs with remaining criteria              | Historical pending receipt as current state or task creation as execution |

Report **verified** only for the stated intake criteria that have this evidence.
Report **partial** when permitted discovery is complete but owner review,
unlinked-inventory access, a source check or implementation remains. Report
**blocked** for the exact dependency preventing the next required criterion,
while retaining completed work. Owner-only decisions include unresolved
identities, exact renames, credential issuance/revocation, inventory/source
changes, installations/deployments and task approval. An owner accepting the
handoff does not turn an unverified host check into a passing one.

## Failure and retry

- On `INVALID_REFERENCE` during live resource or Work continuation, mark that
  traversal invalid and restart from the beginning. `selectedAt` is not a
  frozen snapshot. Keep earlier observations as historical evidence.
- On an unavailable source or missing tool, preserve the partial checkpoint
  and identify the smallest supported owner path or future capability needed.
  Do not treat unavailable as empty or invent a shell/telemetry fallback.
- On expiry, revocation or forbidden scope, stop dependent operations. The
  owner decides whether to issue or replace a credential; no grant escalation
  or impersonation is permitted.
- After uncertain write delivery, retain the exact body/key and retry only with
  the same authorized principal and scope. Changed input conflicts. A deadline
  can withhold a response after commit, so a missing response is not proof of
  rollback. Owner decisions use the same frozen-input retry discipline.
- Never bypass a hook or enable a paid runtime to clear a blocker. Follow the
  [deployment controls](../architecture/deployment-strategy.md) for any separately
  authorized production change.

For the related configuration/evaluation procedure, use
[agent improvement](agent-improvement-cycle.md). The
[onboarding workstream](../plans/agent-memory-mcp-foundation/workstreams/05-candidates-and-onboarding.md)
tracks broader operational adapters. The
[governed onboarding source workflow](governed-agent-proposals.md#propose-and-apply-reviewed-host-onboarding)
now implements reviewed inventory changesets; automatic remote setup and
operational action capabilities remain unfinished.
