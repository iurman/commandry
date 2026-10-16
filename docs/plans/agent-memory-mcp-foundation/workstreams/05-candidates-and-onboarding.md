# Workstream 5: workflow improvement and operational onboarding

**Status: Active research and prerequisite delivery. Canonical resource reads are the current infrastructure prerequisite. Candidate association/promotion, resumable onboarding and authorized inventory changesets remain unimplemented.**

**Model:** GPT-6.1 Sol, ultra. Independent review: GPT-6 Astra, ultra.
Depends on 2, 3 and 4 for the complete improvement loop. Isolated definition and
policy preparation can follow workstream 1's checkpoint.

## Goal

Turn reviewed lessons into testable workflow candidates and make new-server
onboarding a discoverable, resumable process with explicit permissions and
verified outcomes.

## Read first

- `AGENTS.md` and the agent, infrastructure and deployment reading paths.
- This plan's architecture and verification documents plus all published
  contract/service checkpoints from workstreams 1 through 4.
- Existing workflow/approval, resource identity/topology, integration evidence
  and overnight queue application services.
- `docs/architecture/deployment-strategy.md`,
  `docs/features/infrastructure.md` and `docs/domain/operations.md`.
- Relevant Mnemosyne loop/skill evaluation sources identified in
  MNEMOSYNE-REUSE.md; no broad corpus loading.

Resolve exact source paths in a scoped discovery task, then give each worker an
exact generated manifest. Do not use the breadth of this brief as a worker's
unrestricted write scope.

## Proposed ownership

Own candidate/promotion domain and application modules, resumable onboarding
workflow definitions, inventory changeset logic, focused tests and their UI
components/docs. Reuse existing resources, Work, approvals and source records.

Coordinate MCP exposure with 2 and configuration/evaluation references with
3 and 4. The command center owns shared integration files. You are not alone
in the codebase; preserve other work and do not broaden your scope silently.

## Deliver in small tasks

1. Generate or accept a draft candidate linked to reviewed failure evidence,
   a parent configuration and the proposed prompt/skill/hook/loop diff.
2. Define a regression plan, execute through a supported authorized runtime or
   ingest verifiable authorized trial artifacts, and produce a promotion
   recommendation only when required evidence is complete.
3. Require appropriate owner review for standing instructions or installed
   executable behavior. Preserve rejected candidates, lineage and rollback to
   prior versions. Promotion does not grant new permissions.
4. Add a versioned server-onboarding workflow with prerequisites, per-step
   capabilities, risk, approvals, resumable state and acceptance evidence.
5. Resolve existing host/source identities and aliases before proposing record
   changes. Model timestamped inventory and inferred relationships separately.
6. Implement a dry-run inventory changeset with duplicates, ambiguity, expected
   versions and an idempotent authorized apply path over canonical resources.
7. Detect available monitoring evidence, propose reuse or missing collectors,
   and record exact permission/rollback needs. Do not install anything without
   its scoped authorization. Configuration actions need a separate constrained
   adapter and review before activation.
8. Verify resource attribution, ingestion freshness and replay behavior. Keep
   application availability separate. Publish runbooks and proposed follow-up
   Work with a truthful verified/partial/blocked result.
9. Add a morning handoff view or reuse the existing Overnight Queue/digest
   services for actual linked outcomes. Do not label synthetic activity live.

## Acceptance

- A draft improvement cannot self-promote, install a hook or expand scope.
- Changed rubric/model/configuration invalidates inappropriate comparison reuse.
- Failed or incomplete mandatory regressions prevent a passing promotion gate.
- Rejected/superseded candidates and previous executable versions remain
  discoverable under their authorized scope.
- Onboarding dry run has no external effects and distinguishes observation,
  inference, intended changes and unverified steps.
- Rerunning onboarding preserves one canonical identity; ambiguous aliases
  require resolution and cannot merge unrelated hosts.
- Concurrent owner edits survive; changeset input changes invalidate approval;
  retries cannot duplicate local inventory records.
- No host rename, shell command, collector install or credential disclosure can
  hide inside inventory registration.
- Missing credentials or adapters produce a specific partial/blocked outcome
  and do not stop unrelated workstreams.
- MCP and UI expose the same workflow, changeset, capability requirements and
  evidence. Tests cover happy paths, denial, replay, stale/unknown signals,
  cancellation and dark/light review controls.

## Boundary

The existing VPS deployment controls and running workloads must remain intact.
Do not implement arbitrary SSH, use supplied access as blanket change approval,
choose host renames, introduce a paid model runner or replace infrastructure
systems. If real installation access is unavailable, finish the local workflow,
rehearsal and reviewable changeset, then record the exact remaining action.

## Return

Write evidence to `.agent/scratch/foundation-05/RESULT.md`. Return candidate and
onboarding acceptance results, actual external actions if any, exact gaps and
the minimal owner-only queue. Keep worktree handoff state current.

You are a subagent. Follow this contract for your reply to the dispatcher:

1. Do the work the dispatch spec asked for: investigate, edit, build, or check.
2. Write your full output (the long findings, diffs, logs, file contents you read) to
   a file under the scratch path the dispatch named.
3. Reply with at most 40 lines total: what you did, what you found (headline only, no
   pasted file contents), the exact path to the scratch file, and any open questions.
4. Start your reply with a line beginning `Done:`, `Found:`, or `Result:`.
5. Never paste a diff, a log, a directory listing, or a file's contents into the
   reply; name the scratch file instead.
