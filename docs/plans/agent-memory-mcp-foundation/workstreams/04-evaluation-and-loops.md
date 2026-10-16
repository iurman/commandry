# Workstream 4: evaluations and measurable work loops

**Status: Active partial delivery. Immutable evaluation definitions/trials/assessments, separate owner assessment review and advisory reports released in PR 11. Native runtime execution and candidate promotion remain unfinished; no paid inference fallback was introduced.**

**Model:** GPT-6.1 Sol, ultra. Independent review: GPT-6 Astra, ultra.
Depends on workstream 1's contract checkpoint; registry integration uses 3.

## Goal

Measure real outcomes for exact prompt, skill, hook, loop and model configurations
while preserving immutable evidence and independently assessed success.

## Read first

- `AGENTS.md`, the agent/backend reading paths and this plan's architecture,
  Mnemosyne reuse and verification documents.
- The actual contract checkpoint's configuration, evaluation, artifact, actor
  and run contracts.
- Existing agent context, execution packet, fake run and callback services.
- In `/home/urmani/mnemosyne`, read `phase4/tasks/_AB_PROTOCOL.md`,
  `phase4/scripts/ab_run.py`, `orchestration/loop/DESIGN.md`,
  `phase5/results/ab/plan-worker-review/summary.md` and `skills/DESIGN.md`.
- Read the installed plan-worker-review and subagent-contract skill workflows
  before dispatching implementation subtasks. Freeze exact read/write lists.

Keep Mnemosyne read-only. Its existing benchmark outputs are historical evidence,
not proof of effectiveness on GPT-6.1 Sol or GPT-6 Astra.

## Proposed ownership

Own evaluation policy, trial/assessment application logic, result ingestion,
reports, focused tests and evaluation UI components. Use the shared contracts
and storage boundaries from 1, registry versions from 3 and MCP transport from 2.

The command center owns shared exports, schema/migration ordering, worker
registration, navigation, route composition and generated contracts. You are
not alone in the codebase. Do not revert others' edits or write shared files
concurrently.

## Deliver in small tasks

1. Implement immutable configuration snapshots/digests for model, runtime,
   prompt, skills, rules, hooks, loop and relevant execution settings.
2. Implement versioned case definitions, representative fixtures, with/without
   conditions, repetitions, mechanical checks and mandatory policy gates.
3. Implement trial/attempt ingestion with unique IDs, immutable artifacts,
   usage/latency where measured, and explicit infrastructure failure states.
4. Store assessments separately with exact rubric and grader versions.
   Reassessment must preserve raw trials and older assessments.
5. Produce complete-condition comparisons partitioned by model/runtime/config.
   Show sample sizes, denominators and incomplete/unassessed outcomes. Use
   uncertainty estimates only where their method and sample support them.
6. Adapt the existing plan/manifest/worker/review artifact chain so Commandry
   can link planned acceptance, worker result and independently rerun evidence.
   Keep the underlying coding runtime external.
7. Distinguish recommended, selected and observed skill invocation. Report
   observational task success separately from controlled benchmark results.
8. Provide case/result/report UI and API workflows, with MCP discovery/access
   through the shared transport. Start with deterministic fixtures and an
   authorized-result importer; add a native runtime adapter only under an
   explicit supported execution and credential contract.

## Initial case families

- Resume a project with relevant approved preferences and exact citations.
- Reject cross-project evidence and embedded instruction escalation.
- Follow complete pagination and version-pinned source chunks.
- Preserve owner corrections on an import retry.
- Find a real implementation defect, demonstrate it, fix it and rerun its test.
- Use a bounded worker manifest and independently validate its review packet.
- Avoid invoking the heavyweight loop for a trivial scoped task.
- Refuse a success verdict when mandatory checks fail or evidence is missing.
- Handle timeout, cancellation, unsupported harness and partial trial upload.

Build a small truthful fixture set first and expand toward representative
real-task coverage. Do not fabricate a large benchmark population or claim
all-model validation because test records exist.

## Acceptance

- A changed model/configuration cannot overwrite another model's trial.
- Regrading creates a new assessment tied to exact existing evidence.
- Missing conditions/repeats, infrastructure failure and unassessed results
  cannot produce a successful promotion comparison.
- Hard privacy, authority and verification failures block a passing verdict
  regardless of average rubric scores.
- Holdout answers and judge-only data are inaccessible to the subject worker.
- Reports expose actual invocation evidence, sample sizes, failure categories
  and assessed configuration; a composite score is not labeled success rate.
- API/MCP/UI read the same records and obey project/artifact disclosure scope.
- Duplicate callbacks, changed payload retries, artifact substitution,
  cancellation and unauthorized reassessment are tested.
- A real disposable database and built MCP rehearsal exercise persistence and
  discovery, alongside unit tests and applicable root checks.

## Boundary

No API key requirement, inference billing change, unrestricted model runner,
automatic hook installation, permission expansion or production deployment.
Do not run expensive corpus-scale evaluations or claim a native runtime adapter
works when only fake result ingestion was tested.

## Return

Write evidence to `.agent/scratch/foundation-04/RESULT.md`. Return tested commits,
case matrix, actual runtime support, invocation evidence, result completeness
and any owner-only access needed for a small native trial. Keep handoff state
current and do not paste raw evaluation traces into chat.

You are a subagent. Follow this contract for your reply to the dispatcher:

1. Do the work the dispatch spec asked for: investigate, edit, build, or check.
2. Write your full output (the long findings, diffs, logs, file contents you read) to
   a file under the scratch path the dispatch named.
3. Reply with at most 40 lines total: what you did, what you found (headline only, no
   pasted file contents), the exact path to the scratch file, and any open questions.
4. Start your reply with a line beginning `Done:`, `Found:`, or `Result:`.
5. Never paste a diff, a log, a directory listing, or a file's contents into the
   reply; name the scratch file instead.
