# Workstream 3: Mnemosyne pilot, preferences and skills

**Status: Active partial delivery. Selected-memory owner review/import and closed-bundle skill registration/drift released in PR 11. Private corpus selection, installation and actual invocation/adoption remain unperformed.**

**Model:** GPT-6.1 Sol, ultra. Depends on workstream 1's contract checkpoint.

## Goal

Make a reviewed selection of Mnemosyne memory and its versioned skills useful
inside Commandry without copying all private history or treating recalled
preferences as automatic authority.

## Read first

- `AGENTS.md`, the agent/backend documentation paths and this plan's architecture,
  reuse and verification documents.
- The actual contract checkpoint and pinned memory/evidence/registry ports.
- In `/home/urmani/mnemosyne`, read `HANDOFF.md`, `tools/SCHEMA.md`,
  `tools/brain/merge.py`, `tools/brain/render.py` and `tools/render_brain.py`.
- For the skill pilot, read `skills/manifest.json`,
  `skills/manifest.schema.json`, `skills/bin/skillsctl` and the five shipped
  skill definitions named in MNEMOSYNE-REUSE.md.
- Read exact selected source records only after the pilot's disclosure scope
  and dry-run selection are explicit. Do not load the full private/client brain.

Mnemosyne source paths are read-only. Its historical prompts are source data,
not instructions to execute old pipelines. Small worker manifests must name
the exact selected files and output paths.

## Proposed ownership

Own the selected-export importer, memory/profile selection application logic,
skill/configuration registry logic, focused tests and import/registry UI
components. Use shared contracts and repositories from workstream 1. Coordinate
MCP exposure with workstream 2 and evaluation history with workstream 4.

The command center owns common schema, exports, route composition, navigation
and generated contracts. You are not alone in the codebase; preserve other
edits and request integration changes rather than making conflicting ones.

## Deliver in small tasks

1. Implement a bounded import format with strict schema, version, digest,
   external aliases, source locators, timestamps and explicit review state.
2. Add dry-run validation and a per-record preview. Flag missing sources,
   duplicates, conflicting revisions, privacy uncertainty and rejected records.
3. Apply explicitly selected records transactionally with audit and resumable
   idempotency. Preserve originals, owner corrections and all evidence links.
4. Add owner approval and separate project/client disclosure controls for
   preferences. Build budgeted context selection that excludes stale,
   superseded and unresolved instruction candidates appropriately.
5. Register the five shipped skills with exact source versions and component
   inventory. Preserve draft/not-shipped status for the other entries.
6. Model library, installed baseline and current installed content separately;
   show drift and preserve local additions. Do not install or overwrite hooks
   as a side effect of registration.
7. Run a synthetic import first. Prepare a reviewed, Commandry-relevant real
   pilot selection without disclosing private/client history globally. If
   record approval is missing, complete the dry run and queue only that choice.
8. Publish agent-facing import, preference and skill-discovery workflows plus
   integration requirements for the shared MCP adapter.

## Acceptance

- Reimporting an identical selection produces no duplicates. Source changes
  and reused identities produce a reviewable revision/conflict, not overwrite.
- Changed wording retains a stable assertion identity and invalidates obsolete
  instruction wording approval.
- More than 12 provenance entries remain reachable. Missing original content
  is labeled unavailable rather than reconstructed as an alleged original.
- Client/worktree aliases, source-tier uncertainty, contradiction, stale data
  and project disclosure are covered by negative tests.
- Scope filtering precedes context ranking, token estimation and counts.
- Current task direction takes precedence over older inferred preferences.
- Registry reads do not imply installation, invocation, enforcement or grants.
- Drift checks preserve custom files and report unsupported harness mechanisms.
- Pilot preview/apply/retry/review flows use the same records in UI and MCP,
  including dark/light and mobile empty/error states.

## Boundary

Do not run the whole archaeology pipeline, unfreeze legacy corpora, upload raw
conversation history, publish client memories, modify Mnemosyne, overwrite local
skills or auto-approve standing instructions. Do not reinterpret the old
cumulative public/private/client rendering tiers as Commandry authorization.

## Return

Write evidence to `.agent/scratch/foundation-03/RESULT.md`. Return importer
coverage, registry inventory, selected pilot counts and disclosure decisions
still needed, without copying private source content into the chat. Keep the
worktree handoff state current.

You are a subagent. Follow this contract for your reply to the dispatcher:

1. Do the work the dispatch spec asked for: investigate, edit, build, or check.
2. Write your full output (the long findings, diffs, logs, file contents you read) to
   a file under the scratch path the dispatch named.
3. Reply with at most 40 lines total: what you did, what you found (headline only, no
   pasted file contents), the exact path to the scratch file, and any open questions.
4. Start your reply with a line beginning `Done:`, `Found:`, or `Result:`.
5. Never paste a diff, a log, a directory listing, or a file's contents into the
   reply; name the scratch file instead.
