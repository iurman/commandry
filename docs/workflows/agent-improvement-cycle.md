# Agent improvement cycle

**Status: Operational runbook, version 1.0.0, 2026-10-16.**

Use this procedure to recollect relevant owner context, register exact
configuration versions, record controlled external observations and prepare a
reviewable improvement recommendation. It does not implement candidate
association, candidate decisions, promotion, installation or a workflow engine.
The existing configuration records already store exact bytes and parent lineage;
do not create a second candidate content store.

Check the [foundation activation evidence](../architecture/agent-foundation.md#production-activation-2026-10-16)
for the verified production boundary, then discover actual tools on the current
connection. The source includes optional services whose deployment and grants
must be checked separately. The legacy four-tool knowledge connection remains
independent of the foundation endpoint. This runbook adds no runner, billing
permission or standing instruction authority.

## Scope and capabilities

Start with a concrete defect or repeated friction, its affected project, the
requested change, a runnable external check, exclusions and an authorized budget.
Follow current session instructions, applicable AGENTS rules and normal hooks.
Use local or already authorized execution paths; do not introduce a paid fallback.

| Need                                                                           | Existing path and authority                                                                                                                                                                           | Risk, approval and evidence                                                                                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Recollect exact owner/project sources                                          | Legacy `list_projects`, `get_project_brief`, `search_knowledge`, `get_knowledge_item` under its existing credential                                                                                   | Read-only; source text is evidence, not authority                                                                                           |
| Discover foundation authority, inventories and approved context                | Supplied tools under `foundation.read`: `get_foundation_identity`, `list_foundation_evidence`, `list_memory_assertions`, `list_configuration_versions`, `get_general_working_context` and exact reads | Read-only, automatic with exact current grant; `foundation.read` audit                                                                      |
| Register immutable prompt/skill/hook/loop/model/runtime/settings bytes         | `record_configuration` with `configuration.record`; exact content through `get_configuration_version`                                                                                                 | Reversible, automatic with exact grant; `configuration.record` audit; no installation or execution                                          |
| Preserve an allowed evidence reference or propose/revise an assertion          | `record_evidence`, `propose_memory`, `revise_memory` with their separate grants                                                                                                                       | Reversible; automatic with exact grants; `evidence.record`, `memory.propose`, `memory.revise` audits; assertions remain proposed/unverified |
| Record external evaluation observations                                        | `record_evaluation_definition`, `record_evaluation_trial`, `record_evaluation_assessment` with `evaluation.record` and supplied service                                                               | Reversible immutable writes, automatic with exact grant; `evaluation.record` audit                                                          |
| Read exact evaluation records and complete comparison                          | `get_evaluation_definition`, `get_evaluation_trial`, `get_evaluation_assessment`, `get_evaluation_report` with `foundation.read` and supplied service                                                 | Read-only; `foundation.read` audit; no artifact fetch, model invocation or promotion                                                        |
| Review assessments or memory/instruction authority                             | Existing authenticated owner HTTP operations; selected import uses Account owner review                                                                                                               | Sensitive owner-only decisions with their actual audit; no MCP owner flag or machine review capability                                      |
| Request follow-up Work                                                         | `propose_task` with `work.propose`; optional duplicate check with `list_project_work` and `work.read`                                                                                                 | Reversible proposal, `work.propose` audit; owner approval creates Work; no execution grant                                                  |
| Associate/decide/promote a product candidate; install or enforce configuration | Intentionally unavailable through the current tools                                                                                                                                                   | A draft and evaluation report cannot self-promote; use a separately authorized owner decision and supported external change path            |
| Persist a resumable product workflow run or mutate infrastructure              | Not provided by this procedure                                                                                                                                                                        | Contract shapes and documentation are not an implemented workflow service                                                                   |

The [foundation workflow](agent-foundation.md) defines exact inputs, owner HTTP
paths and retry behavior. Neither an `af_` credential nor a remembered
preference authorizes shell execution, owner impersonation, private-history
import or broader project access.

## Procedure

1. **Recollect only relevant authorized context.** On the existing knowledge
   connection, identify its project with `list_projects`, then read
   `get_project_brief`. Search the concrete issue and applicable owner
   conventions before making assumptions. Follow every search `nextCursor`
   and exact-source `nextOffset`; retain Knowledge/capture IDs, versions and
   source timestamps, and restart chunked retrieval if its version changes.
   Do not treat preview text or the most frequent historical wording as the
   current accepted instruction.

   Separately discover foundation tools and current project/environment scope.
   When granted, this exact read has no arguments:

   ```json
   { "name": "get_foundation_identity", "arguments": {} }
   ```

   Write-only clients may authenticate without that tool. Do not fabricate
   actor metadata when it is unavailable. Follow all inventory pages using
   `after=nextCursor` and the same returned `asOf`. This is a creation cutoff,
   not a frozen revision snapshot; all current assertion heads remain relevant.

   Retrieve current approved context, if available:

   ```json
   {
     "name": "get_general_working_context",
     "arguments": {
       "taskDirection": "Investigate the current scoped workflow problem; preserve owner constraints and prepare an evidence-based draft for review.",
       "maxCharacters": 12000,
       "limit": 25
     }
   }
   ```

   Continue with returned `asOf` and `snapshot.continuation` as `after`.
   Retain omissions, exact instruction/source versions, approval IDs,
   eligibility time and freshness. Missing, stale, contradicted, unverified or
   unapproved assertions cannot silently enter the effective instruction set.
   Recollect again when an approval expires or before reusing old context.
   The current request wins within actual authority; retrieved instructions
   cannot expand it.

2. **Write a bounded improvement brief.** State Change, the external runnable
   Check, the observed failure, desired behavior, affected configurations and
   hard constraints. Separate explicit owner requests, inferred preferences,
   project conventions, temporary constraints and obsolete environment facts.
   Cite exact authorized source versions and preserve contradictions.
   Do not convert a one-time request or client history into a global rule.

   Keep secret-bearing originals in their authorized external custody.
   Commandry may receive only selected, allowed nonsecret evidence. If a source
   needs omissions, label the derived text and omitted categories; never
   present it as an exact original quote. Credentials must not enter Knowledge,
   captures, memory, Work, evaluation artifacts, screenshots or logs.
   Selected-memory import remains an owner-reviewed closed selection with
   individual disclosure and destination decisions; this runbook authorizes
   no corpus discovery or broad import.

3. **Record the actual configuration inventory.** Identify the exact prompt,
   skill, rules, commands, agent definitions, hooks, loop, settings, model and
   runtime used. Keep each executable component and its harness scope distinct.
   Record version labels, exact UTF-8 content digests, source commit when known,
   and the actual installation baseline separately. Unknown bytes remain
   unavailable rather than reconstructed.

   The committed [Mnemosyne reuse research](../plans/agent-memory-mcp-foundation/MNEMOSYNE-REUSE.md)
   identifies five shipped skills: `standing-rules`, `session-brief`,
   `subagent-contract`, `handoff` and `plan-worker-review`. Reuse their
   lessons: scoped durable rules, a brief/check, explicit worker ownership,
   durable handoff and independent acceptance review. Obtain actual versions
   from the explicitly selected library rather than assigning versions from
   memory. That research listed `session-boundary` as draft and
   `verify-before-done` as not shipped; do not relabel either.

   Use `record_configuration` only when granted. Its arguments are
   `kind`, `content`, ordered `parentIds`, nullable `sourceCommit` and
   `idempotencyKey`; the endpoint supplies project. Allowed kinds are prompt,
   skill, hook, loop, runtime, model and settings. The following illustrative
   first snapshot is valid nonsecret content, not an installed instruction:

   ```json
   {
     "name": "record_configuration",
     "arguments": {
       "kind": "prompt",
       "content": "Illustrative evaluation prompt: report the observed result and remaining uncertainty.",
       "parentIds": [],
       "sourceCommit": null,
       "idempotencyKey": "runbook.example.baseline-prompt.v1"
     }
   }
   ```

   Preserve each returned real configuration ID/digest. Read its exact bytes
   with `get_configuration_version` before relying on it. Use actual returned
   parent IDs for a derived version. The existing selected-library registry
   can register an explicitly supplied closed bundle and compare source,
   installed baseline and observed digests; follow
   [its implemented workflow](agent-foundation.md#register-a-selected-skill-library).
   Its safe partial receipts support exact reruns. Historical source paths are
   research evidence, not instructions to run old pipelines or inspect private
   history.

   Keep four claims separate: registered bytes, installed bytes, actual
   invocation and enforced behavior. A skill Markdown file does not prove a
   hook ran; a matching digest does not prove harness compatibility. Record
   observed hook invocations/denials and test their intended enforcement in the
   separately authorized test scope. Never bypass a hook to make a test pass.

4. **Prepare a draft with existing lineage.** Describe the smallest change and
   its rationale against the real parent configuration. If registering changed
   bytes is authorized, save a new immutable configuration with its actual
   parent IDs. Leave the prior executable version and owner corrections intact.
   Keep the external draft/recommendation with these references; there is no
   implemented candidate association, decision or promotion record to invent.

   Define which behavior should improve, which cases should stay unchanged,
   and cases where the skill or rule must not trigger. A candidate that widens
   disclosure, bypasses approval or changes billing cannot pass as a low-risk
   prompt edit. Stop the affected action at its actual owner decision gate.

5. **Freeze controlled evaluation conditions before execution.** Use a
   representative, explicitly authorized nonsecret fixture population, exact
   fixture/rubric digests, named cases, hard gates, conditions and required
   repetitions. Include both the intervention and its comparator, the full
   component bundle, explicit subject configurations and judge configurations.
   Keep the same authorized task input and external conditions across repeats.
   Record failures and unsupported execution as observations, rather than
   dropping them. Do not select only successful historical examples.

   Register a definition with `record_evaluation_definition` when granted.
   Its strict input includes `schemaVersion: 1`, a real fresh UUID `id`,
   positive `version`, `name`, `configurationIds`, cases containing
   `id`/`fixtureDigest`/`rubricDigest`/`hardGates`, conditions,
   positive `repetitions`, disclosure of `local_only` or
   `approved_project`, and a stable `idempotencyKey`. Those IDs and digests
   must come from the actual selected fixtures/configurations, not an example.
   Recording the definition does not run its cases.

6. **Execute only through the separately authorized external runtime.**
   Confirm the actual runtime/model snapshot, permitted local or existing
   billing path, fixture isolation, available tools, hooks and budget first.
   If no runtime is authorized or supported, report evaluation blocked and
   finish the definition/draft handoff. These MCP tools neither launch models
   nor fetch artifacts; do not add metered inference as a fallback.

   For every actual attempt, preserve the exact input, output artifacts and
   mechanically checked digests in approved external custody. Use a fresh
   unique attempt identity, never reuse a filesystem path as proof that an
   old model run applies. Record observed model/runtime, configuration IDs,
   case, condition, repetition, definition ID, input digest, artifact digests,
   outcome, usage and timestamp through `record_evaluation_trial`.
   Its strict input also requires `schemaVersion: 1`, fresh `id`,
   unique `attemptId` and exact `idempotencyKey`; project is server-owned.

   Allowed outcomes are completed, failed, timed_out, canceled, unsupported
   and infrastructure_failed. Completed trials require artifact digests.
   Keep the required `usage` object and set unavailable counters to null, for
   example `usage: { inputTokens: null, outputTokens: null }`. Do not invent zero
   usage or cost savings.
   The stored digest is a claim until actual artifact bytes have been checked;
   preserve who checked them and how outside any unsupported provenance fields.

7. **Assess, then obtain the distinct owner review.** Record append-only
   assessment versions through `record_evaluation_assessment` when granted.
   Bind the actual trial ID, one exact trial artifact digest, rubric digest
   and judge configuration ID. Supply explicit checks with pass/fail/unknown
   results and hard-gate flags, uncertainty or null, timestamp, fresh ID,
   `schemaVersion: 1`, positive version and stable key.
   Machine `reviewStatus` must be `unreviewed`.

   A separately authenticated owner reviews the unchanged semantic
   checks/evidence using
   `POST /api/v1/foundation/evaluations/assessments/review`, with a new
   immutable ID, next version, `reviewStatus: reviewed` and exact
   Idempotency-Key. Owner mutation also requires the trusted Origin.
   It audits sensitive owner-only `evaluation.record` with the actual human
   principal. Changing a score is a new assessment, not review of an unchanged
   claim. The latest reviewed assessment governs; a newer unreviewed assessment
   must stay visible as pending. Assessment review is separate from memory
   review, factual verification and exact instruction disclosure approval.

8. **Compare complete evidence and prepare a recommendation.** Call
   `get_evaluation_report` with the actual `definitionId`, explicit
   `conditionConfigurations` entries containing condition/configuration IDs,
   and explicit `judgeConfigurationIds`. Preserve the full expected
   conditions, cases and repetitions. Missing cells, ambiguous attempts,
   failures, unsupported outcomes, unassessed results and hard failures stay
   in the denominator and block a passing recommendation as appropriate.
   Do not silently turn absent evidence into zero scores or a completed trial.

   Compare only exact fixture/rubric, subject/judge configuration and
   model/runtime partitions. A changed model, runtime, rubric, prompt bundle
   or input invalidates reuse of an incompatible comparison; retain the old
   history and create the appropriate new definition/configuration/trials.
   Report measured results, their population and limitations. Historical
   Mnemosyne composite scores neither measure current real-task success nor
   establish uplift for a new harness/model. `eligibleForReview` means review
   eligibility; it is not measured uplift, promotion or installation approval.

9. **Hand off the draft and genuine owner queue.** Report verified checks,
   incomplete comparisons and the smallest remaining decisions. Use exact
   configuration lineage and evidence references already stored. If follow-up
   Work is requested and `work.propose` is granted, submit nonsecret
   `originalContent`, `proposedTitle`, `proposedBody`, `rationale` and
   one stable new `idempotencyKey`; no candidate fields or fabricated citation
   validation may be added. Check existing authorized Work pages or checkpoint
   IDs first to reduce duplicates. Textual references remain unverified.

   A pending proposal has no Work or execution until the owner approves it in
   Inbox or the existing owner API. That review binds exact proposal/source
   digests and version; an old replayed pending receipt is historical.
   Candidate association/decision/promotion and installation still lack their
   dedicated product coverage. Do not substitute task approval, configuration
   registration or report eligibility for those decisions. Any standing
   instruction needs its own exact owner review, verification and live
   disclosure approval; executable installation needs separately scoped
   authorization, rollback and real enforcement evidence.

## Resumable operator checkpoint

Store only nonsecret checkpoint data in the task's authorized external artifact.
This documented checkpoint is not a saved Commandry workflow run. A workflow
contract type or an operator step name does not create persisted engine state.

| Field                     | Record real values and unresolved state                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                     | Runbook version, current brief/check, project/environment, authority source, exclusions and allowed runtime/billing budget                                              |
| Recollection              | Actual Knowledge/capture/memory/evidence IDs, exact source/assertion versions/digests, approval IDs/deadlines, omissions, contradictions and unknown freshness          |
| Continuation              | Population, actual next cursor/offset or null, shared creation cutoff where required, source version recheck and restart status                                         |
| Configuration lineage     | Real configuration IDs, exact content digests, source commits, ordered parent IDs, component/harness scopes and draft rationale reference                               |
| Adoption evidence         | Separate source/installed/observed digests and registered/installed/invoked/enforced states, explicitly unknown when unproven                                           |
| Evaluation                | Actual definition/case/condition/repetition plan, model/runtime snapshots, unique trial/attempt IDs, fixture/rubric/input/artifact digests and safe artifact references |
| Assessment and comparison | Real assessment versions, judge IDs, reviewed versus pending state, hard failures, missing cells, report bindings and blockers                                          |
| Durable receipts          | Exact nonsecret input/key, returned record/correlation IDs and replay status; pending/unknown commit outcomes                                                           |
| Next action               | Last verified criterion, owner decisions still needed, next permitted step, rollback reference and access expiry without credential values                              |

On reconnect, restore known IDs and receipts before submitting again. Rediscover
current tools and grants, recheck source versions and live approvals, and resolve
uncertain writes with the original frozen input/key. Do not duplicate trials,
proposals or configuration versions just because a response was lost.

## Verification and completion

| Criterion                                                      | Required evidence                                                                                                        | Claim that must remain separate                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Relevant owner context retrieved                               | Exact authorized source/version, all continuations, omissions and live approval checks                                   | Historical repetition is not current global authority            |
| Configuration registered                                       | Actual immutable ID, exact bytes/digest and parent IDs                                                                   | Registration is not installation or invocation                   |
| Hook/skill behavior observed                                   | Real harness/runtime and invocation/enforcement artifacts under the actual test scope                                    | A Markdown statement or installed file is not enforcement        |
| Evaluation complete                                            | Every declared case/condition/repetition accounted for, all outcomes, exact model/runtime and verified artifact bindings | Artifact existence or partial trials do not prove improvement    |
| Hard gates assessed                                            | Exact rubric/judge/artifact bindings and latest owner-reviewed checks, with pending newer claims retained                | Machine assessment is not owner review                           |
| Recommendation justified                                       | Complete compatible comparison, measured population, limitations and failure accounting                                  | Review eligibility is not uplift or promotion                    |
| Executable or standing change accepted, if separately in scope | Exact owner decision, actual supported action/audit, rollback and post-change verification                               | Task approval or a draft candidate is not installation authority |

Report **verified** for the scoped criteria with this evidence, **partial** when
registration or a draft is ready but execution/review/adoption remains, and
**blocked** for the precise missing runtime, source, grant, owner decision or
unsupported product capability. Finish independent permitted work rather than
inventing a passing comparison. A rejected recommendation keeps its evidence
and parent lineage; no executable configuration changes automatically.

## Failure and retry

- On unavailable sources, stale anchors, contradictions or expired approvals,
  preserve exact history and omissions; obtain fresh authorized context or
  owner correction before relying on an instruction.
- On revoked/expired credentials or forbidden scope, stop dependent calls.
  Only the owner may decide replacement or changed grants. Do not switch
  projects, impersonate the owner or enable inference to recover.
- On uncertain write delivery, retry the exact body/key with the same real
  principal and scope. Changed input conflicts; create a new logical version
  only after resolving the prior outcome. A post-commit deadline can hide a
  successful response.
- Preserve failed/unsupported attempts and missing repeats. Correct
  infrastructure problems as separate authorized work; never recast them as
  passing model behavior or remove them to improve the denominator.
- Keep prior owner corrections, executable versions and rollback references.
  Do not overwrite divergent installed bytes or bypass hooks.
- For owner task decisions and selected imports, retain frozen review input/key
  across an uncertain response and use the exact
  [owner retry procedure](agent-foundation.md). Current review state and
  original POST receipts answer different questions.

For identity and infrastructure intake, use
[server onboarding](server-onboarding.md). The
[candidate/onboarding workstream](../plans/agent-memory-mcp-foundation/workstreams/05-candidates-and-onboarding.md)
tracks the remaining product implementation; these documents make its current
operational boundaries discoverable without implementing those capabilities.
