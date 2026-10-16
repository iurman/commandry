# Commandry agent foundation: command center plan

**Status: Approved campaign plan. Implementation authorized.**

**Owner direction captured:** October 15, 2026, America/Los_Angeles.

**Launch authorization:** The owner released the planning hold with "Ight send
it" on October 15, 2026, America/Los_Angeles. This approves the documented
workstream chats, isolated worktrees, dependency-aware coordination and bounded
overnight follow-up. Implementation should proceed under the recorded scope;
exact production action and disclosure gates still apply. Launch evidence belongs
in the command center's private campaign ledger.

## Goal

Make Commandry a useful, source-backed second brain that separately authorized
agents can understand and update through MCP. Reuse Mnemosyne's evidence,
memory, skills and evaluation lessons. Deliver the following five workstreams
in dependency order, parallelizing independent work after shared contracts are
pinned. Aim for useful, tested vertical slices rather than claiming the entire
product can be finished in one night.

## Non-goals

- Replacing Codex, Claude Code, GitHub, Workstream or infrastructure platforms.
- Importing the entire private/client corpus or promoting inferred preferences
  into standing instructions without review.
- Adding an unrestricted shell, universal agent credential, paid inference
  fallback, new cloud platform or automatic permission expansion.
- Treating historical evaluation scores as universal model success rates.
- Renaming hosts, installing collectors, changing production services or
  selecting a new runtime as a hidden part of this campaign.
- Expanding implementation beyond the approved scope or bypassing a later
  owner-imposed hold.

## Base

- branch: feat/agent-memory-foundation
- source base: origin/main, observed at 3334c9839d33f0476a878e8c38f093d0dab103e3
- check command: node scripts/check-boundaries.mjs
- runtime: Node.js 24; pnpm version pinned in the repository
- workspace: the current isolated Commandry worktree
- production: commandry.site, currently a separate verified release

At launch the campaign branch contains the planning packet, with no product
implementation changes. The primary checkout has owner changes and must remain
untouched. Source and deployed revisions must be rechecked at dispatch and
release. No remote write probe is required.

## Interfaces

Existing boundaries to preserve:

```json
[
  {
    "file": "packages/application/src/knowledge-access.ts",
    "symbol": "KnowledgeReadPort",
    "kind": "interface"
  },
  {
    "file": "packages/application/src/knowledge-access.ts",
    "symbol": "KnowledgeAccessPort",
    "kind": "interface"
  },
  {
    "file": "packages/domain/src/knowledge-access.ts",
    "symbol": "KnowledgeAccessError",
    "kind": "class"
  }
]
```

[ARCHITECTURE.md](ARCHITECTURE.md) defines proposed new contracts. These are
design requirements, not existing exported types. Workstream 1 must implement
and pin their actual declarations before dependent implementation workers
receive generated manifests. No worker should invent a parallel memory,
permission, evidence or evaluation model.

## Tasks

| ID  | Workstream                                                                           | Result                                                                                                               | Dependency                                                             | Suggested model    |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| 1   | [Shared foundation](workstreams/01-shared-foundation.md)                             | Evidence, actors, memory, configuration and evaluation contracts; capability/coverage inventory; migrations          | None                                                                   | GPT-6.1 Sol, ultra |
| 2   | [MCP and governed findings](workstreams/02-mcp-and-findings.md)                      | Complete useful scoped reads; working context; source-backed findings and task proposals; owner review               | Contract checkpoint from 1                                             | GPT-6.1 Sol, ultra |
| 3   | [Mnemosyne import and skills](workstreams/03-mnemosyne-and-skills.md)                | Review-first import; approved preference disclosure; versioned skills registry with drift visibility                 | Contract checkpoint from 1                                             | GPT-6.1 Sol, ultra |
| 4   | [Evaluation and work loops](workstreams/04-evaluation-and-loops.md)                  | Immutable model/configuration-specific trials, independent assessments, regression comparisons and measured outcomes | Contract checkpoint from 1; final integration with 3                   | GPT-6.1 Sol, ultra |
| 5   | [Candidates and operational onboarding](workstreams/05-candidates-and-onboarding.md) | Draft workflow improvement loop; regression-gated promotion; resumable inventory onboarding                          | 2, 3 and 4 for promotion; contract checkpoint for isolated preparation | GPT-6.1 Sol, ultra |

The command center owns shared integration files, worktree coordination,
integration testing, release evidence and the morning handoff. GPT-6 Astra at
ultra is the proposed independent review model after each meaningful slice.
Review is not a substitute for running acceptance tests.

These are workstream briefs, not loop-worker manifests. Before implementation,
split each into tasks of at most six write files with exact read/write lists,
pinned interfaces, runnable acceptance checks and bounded scope. Generate
manifests using the existing plan-worker-review tooling. Do not dispatch this
whole document as one worker task or claim its broad workstreams pass the
small-task completeness checker.

## Convergence order

1. Release the owner's planning hold, save a planning checkpoint and establish
   the integration branch and exact source base.
2. Complete workstream 1's contract checkpoint. Independently review the actor,
   authorization, source-preservation and migration boundaries.
3. Run workstreams 2, 3 and 4 in parallel on isolated worktrees. They may prepare
   independently earlier only within non-overlapping, explicitly scoped tasks.
4. Integrate tested slices sequentially. The command center alone changes
   common exports, schema/migration ordering, generated OpenAPI, navigation and
   shared route composition.
5. Begin workstream 5's dependent implementation when its input services are
   real and tested. Inventory preparation can proceed earlier; applying changes
   and promoting workflows must honor the relevant gates.
6. Run independent adversarial review, full required checks, a real MCP client
   rehearsal and production-shaped migration/restore checks.
7. Prepare a PR and an exact release candidate. Merge and deploy only under
   applicable owner authorization and the existing constrained release gates.
8. Verify live behavior separately from local results and write the morning
   handoff with any remaining human-only decisions.

## Risks

The largest risks are disclosure across projects, confusing a recurring claim
with a verified fact, promoting benchmark overfit, and concurrent edits to shared
contracts. Historical Mnemosyne data also contains stale instructions, partial
sources and corrected privacy mistakes. Preserve provenance and visible unknown
states. Avoid holding database transactions during external work. Bound retries,
model calls and overnight concurrency, and pause only the dependent task when a
real owner-only decision is missing.

Existing read-only MCP clients must retain their existing authority. New grants
need explicit operations and disclosure scope. The exact credential migration
choice belongs to the foundation checkpoint; do not assume an expanded endpoint
or new token format has already been selected.

## Escalation answers

- The approved order is 1 through 5 with dependency-aware parallel work.
- Explicitly granted clients may save findings and proposals automatically.
  That does not approve instructions, task completion, execution or deployment.
- Personal preferences should use an owner-approved profile with explicit
  project disclosure. Historical recurrence alone is insufficient approval.
- The current request overrides inferred historical preferences. Preserve the
  distinction between task-specific direction and durable owner policy.
- Use native subscribed agent runtimes where available. Do not introduce
  metered API billing or switch providers silently.
- Skills may advise, commands may invoke workflows and hooks may enforce
  deterministic checks. Record which mechanism actually ran and its coverage.
- Keep memory source material local by default. Publish only reviewed,
  appropriately scoped selections, and never raw credentials.
- Unavailable access should produce a precise blocked item with the smallest
  owner action. It should not stop unrelated local work.
- No exact delivery time, all-model evaluation coverage or production readiness
  is promised by this plan.

Read [MNEMOSYNE-REUSE.md](MNEMOSYNE-REUSE.md) for the research transfer,
[VERIFICATION.md](VERIFICATION.md) for release criteria and
[DISPATCH.md](DISPATCH.md) for chat coordination and launch prompts.
