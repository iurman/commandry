# Workstream 1: shared contracts and evidence foundation

**Status: Active workstream. The first contract/domain slice is locally verified
and independently reviewed; application services and persistence remain in progress.**

**Model:** GPT-6.1 Sol, ultra. Independent checkpoint review: GPT-6 Astra, ultra.

## Goal

Establish one tested model for actors, evidence, reviewed memory, configuration
versions and evaluations so the remaining workstreams can implement against
stable application interfaces.

## Read first

- `AGENTS.md` and the mandatory agent/backend documentation reading paths.
- This plan's `PLAN.md`, `ARCHITECTURE.md`, `MNEMOSYNE-REUSE.md` and
  `VERIFICATION.md`.
- `packages/contracts/src/knowledge-access.ts`.
- `packages/application/src/knowledge-access.ts`.
- `packages/domain/src/knowledge-access.ts`.
- `packages/db/src/knowledge-access-repository.ts`.
- `packages/db/src/knowledge-revision-repository.ts`.
- `packages/application/src/execution-packets.ts`.
- Relevant schema sections, migration journal and generated OpenAPI tooling.

These are the discovery seed files for the workstream lead. Implementation
workers must receive smaller generated manifests with exact file lists.

## Proposed ownership

Own new shared contract and domain-policy modules, application ports, schema
changes and additive migrations. At this checkpoint, coordinate changes to
package exports and generated contracts with the command center. After it lands,
the command center becomes the sole writer of shared integration files.

Proposed new modules are `packages/contracts/src/agent-foundation.ts`,
`packages/domain/src/agent-foundation.ts` and
`packages/application/src/agent-foundation.ts`, with focused tests. Final names
must be pinned in a checkpoint document before other workstreams depend on them.
Do not create broad generic storage that bypasses existing canonical records.

You are not alone in the codebase. Preserve owner edits and other workstreams'
changes. Use your assigned worktree and branch; never reset shared work.

## Deliver in small tasks

1. Inventory existing feature coverage and current actor attribution gaps.
   Define operation policies with scope, risk, approval and audit semantics.
2. Implement strict versioned contracts for the families in ARCHITECTURE.md,
   including distinct source, interpretation, review and verification state.
3. Implement policy functions and transaction ports. Preserve the existing
   read-only credential behavior, fail-closed audit and revocation ordering.
4. Add reviewed additive migrations, constraints, indexes and repository
   primitives. Include stable external aliases, complete evidence relations,
   optimistic concurrency and principal/operation-bound idempotency.
5. Record durable choices in an ADR only where the approved product direction
   and evidence support them. Keep unresolved choices visibly proposed.
6. Publish `CONTRACT-CHECKPOINT.md` beside this brief with exact file/symbol
   names, versioned examples, migration order, operation matrix, reusable test
   fixtures and independently verified commands.

## Acceptance

- Invalid and excess input fields fail validation where appropriate.
- Stable records survive revisions; sources are immutable; provenance is not
  silently capped; review state cannot imply factual verification.
- Existing credential fixtures remain read-only with no expanded disclosure.
- Cross-project references, expired/revoked grants and forged actors fail.
- Concurrent creates and idempotent retries cannot produce duplicate records;
  changed input with a reused key conflicts.
- Audit failure rolls back writes. Revocation races and expected-version
  conflicts are exercised against real disposable PostgreSQL.
- Migrations apply to both a fresh schema and a previous-release database.
- Focused unit/integration checks pass, followed by the applicable root checks.
- Dependent workstreams receive actual pinned interfaces rather than prose or
  placeholders. The independent reviewer checks policy and migration risks.

## Boundary

Do not implement all feature UIs, import private history, run model benchmarks,
issue production machine grants, select a universal runtime, or alter deployment
controls. Record integration requests for the command center. A contract gap
blocks the dependent task, not unrelated preparation.

## Return

Write detailed evidence to `.agent/scratch/foundation-01/RESULT.md` and keep
`.agent/STATE.md` current in your worktree. Return the checkpoint commit,
verified commands, open risks and exact artifact paths. Do not claim deployment.

You are a subagent. Follow this contract for your reply to the dispatcher:

1. Do the work the dispatch spec asked for: investigate, edit, build, or check.
2. Write your full output (the long findings, diffs, logs, file contents you read) to
   a file under the scratch path the dispatch named.
3. Reply with at most 40 lines total: what you did, what you found (headline only, no
   pasted file contents), the exact path to the scratch file, and any open questions.
4. Start your reply with a line beginning `Done:`, `Found:`, or `Result:`.
5. Never paste a diff, a log, a directory listing, or a file's contents into the
   reply; name the scratch file instead.
