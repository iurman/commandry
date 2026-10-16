# Verification and release gates

**Status: Proposed acceptance plan. No checks listed here are claimed passed
for an implementation that has not been written.**

## Evidence levels

Track these independently: planned, implemented, locally verified, independently
reviewed, merged, deployed and live verified. A passing unit test or a merged PR
does not imply the production service is running that revision. Synthetic
fixtures must be labeled synthetic in records, UI and reports.

## Shared acceptance matrix

| Area                | Required positive evidence                                      | Required negative/adversarial evidence                                                |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Identity and policy | Server-derived actor, effective scope, explicit operation grant | Forged actor, cross-project IDs, expired/revoked grant, read-only write attempt       |
| Disclosure          | Authorized profile/evidence in search, context and exact reads  | No indirect leaks in counts, snippets, rankings, errors or continuation               |
| Evidence            | Immutable source, exact version/digest, reachable provenance    | Changed source, unavailable original, injected instructions, mixed-version chunks     |
| Memory              | Review/correction/supersession retains history                  | Accepted preference is not verified fact; stale/contradictory instruction exclusion   |
| Import              | Dry run, selected apply, stable IDs and resumable retry         | Alias ambiguity, client-tier mistake, changed input retry, owner correction preserved |
| Registry            | Exact version/components and installed/drift evidence           | Read does not install; unsupported hook and local modification remain visible         |
| Findings/proposals  | One source-linked canonical result with audit                   | Audit failure rollback; duplicate/lost-response retry; unauthorized evidence link     |
| Evaluation          | Exact model/configuration, immutable trial, separate assessment | Missing conditions/repeats, artifact substitution, hidden hard failure, holdout leak  |
| Improvement         | Candidate lineage and complete reviewed regression result       | Self-promotion, permission expansion, failed mandatory regression                     |
| Inventory           | Stable identity and reviewed versioned changeset                | Ambiguous aliases, concurrent edit, duplicate apply, concealed rename/install         |
| Transport parity    | UI, HTTP and real MCP client use identical records              | Tool hint alone cannot authorize; malformed/oversized inputs fail safely              |
| Operations          | Restart/retry/cancel/partial behavior and cleanup               | Worker loss, audit/storage failure, uncertain external effect and token revocation    |

## Per-task review

Before dispatch, generate a manifest with exact read/write lists, pinned
interfaces and real runnable acceptance commands. No placeholder checks or
tests that simply mirror an implementation. For policy and persistence, include
meaningful denied and race paths. Keep tests proportionate to the change.

The worker builds its review packet. The command center reruns the packet
checker before trusting its result, then obtains independent source review for
material boundaries. A source reviewer can find defects beyond the worker's
chosen checks; acceptance commands alone are not a comprehensive audit.

Store command, source revision, configuration, outcome and evidence location.
State whether a result was measured, inferred, unsupported or unverified. Run
checks on the merged integration revision after convergence, not only on
isolated worker branches.

## Repository checks

Use the repository's pinned Node.js 24 and pnpm runtime. The existing runtime
on this machine is available at
`/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`.
Do not install packages into system Python or alter the host OS to run tests.

Run applicable focused tests first, then the existing required checks:

```bash
cd /home/urmani/.codex/worktrees/f541/commandry
export PATH="/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
pnpm check
pnpm test
pnpm test:integration
pnpm build
```

Use the existing Playwright setup for changed UI journeys and the repository's
built-app smoke harness for MCP/auth verification. Read the actual harness
contract before selecting flags or environment values. Do not point tests at
production or invent a command that the repository does not provide.

Required database evidence includes a fresh migration, upgrade from the prior
release schema, scope/revision/idempotency constraints, audit rollback and
revocation/concurrency behavior. Use disposable real PostgreSQL, not a mocked
repository as the only persistence check.

## UI and real-client checks

Batch QA by page and reuse fixtures/personas across criteria. Check dark and
light appearance, narrow and desktop viewports, keyboard access, meaningful
loading/empty/error/partial states, source inspection and review confirmations.
Keep synthetic lab fixtures out of production bundles.

The MCP rehearsal must use the built server and a real supported SDK client.
Test initialization, discovery, scope, pagination, exact source chunks,
authorized mutation, retry and revocation. Test at least the existing client
contract and one explicitly granted new client. Codex compatibility does not
automatically establish Claude or every other client's compatibility.

A small native evaluation can follow only after runtime support, authorized
data and credential custody are established. Preserve exact invocation and
model settings. If only deterministic fixtures ran, report that limit.

## Integration and release

1. Keep each tested slice in its assigned worktree. Converge through the command
   center's integration branch; do not concurrently edit the same branch from
   another worktree.
2. Resolve contract and migration conflicts centrally, then rerun affected tests
   and required integration checks. Never skip hooks.
3. Prepare a PR with concrete behavior, scope, verification, residual gaps and
   migration risk. Attach every created PR to this chat.
4. Honor the owner's execution hold and any later merge/deployment scope.
   Authorization to implement a feature does not fabricate an exact production
   action approval or permit bypassing deployment gates.
5. Merge latest target changes and pass required CI. Retain the previous target
   and reviewed source ancestry under the normal merge policy.
6. Deploy only a verified immutable image through the existing constrained
   identity and root-owned controls. Recheck current host inventory, backup,
   clean restore, capacity, recovery access and rollback requirements. Preserve
   unrelated services and private credentials outside the repository.
7. Verify deployed revision, authenticated reads, worker health, old/new MCP
   behavior and real source freshness. Record local and live results separately.
8. Do not issue expanded standing grants, install hooks or apply a private
   import merely because the application code was released.

## Morning handoff

Produce one concise handoff with links to full evidence:

- Verified deliveries, their commits/PRs and deployment state.
- Checks actually run, results and environment limits.
- Human-only items, each with the exact smallest decision/access needed and
  which dependent step it blocks.
- Failed, partial, unsupported and deferred work, with recovery or next action.
- Resources/watchers left running and their purpose; clean up only task-owned
  temporary resources after they are no longer needed.

Potential human-only items include disclosure of a selected private memory
record, exact client grants, native runtime sign-in, installation approval or a
production action approval. These are possibilities, not a preemptive checklist
the owner must complete before local work can begin.
