# Workstream 2: MCP reads, context and governed findings

**Status: Proposed dispatch brief. Not launched.**

**Model:** GPT-6.1 Sol, ultra. Depends on workstream 1's contract checkpoint.

## Goal

Let an explicitly authorized agent discover complete relevant Commandry context
and save source-backed findings or task proposals through the same services and
canonical records as the UI.

## Read first

- `AGENTS.md` and the mandatory agent documentation reading path.
- This plan's master plan, architecture and verification documents.
- The actual `CONTRACT-CHECKPOINT.md` and its pinned source declarations once
  workstream 1 publishes them.
- `apps/web/lib/knowledge-mcp.ts` and `apps/web/app/mcp/knowledge/route.ts`.
- `apps/web/lib/knowledge-access.ts` and the existing knowledge-client routes.
- `packages/application/src/knowledge-access.ts`.
- `packages/db/src/knowledge-access-repository.ts`.
- `packages/application/src/project-brief.ts` and `execution-packets.ts`.
- Existing canonical capture, Work, Knowledge and resource application services.
- `scripts/knowledge-access-smoke.mjs` and existing MCP integration tests.

The lead may locate exact related service files during scoped discovery, then
freeze each worker's read/write list in a generated manifest before dispatch.

## Proposed ownership

Own new agent-facing read/finding application modules, transport adapters,
focused tests and workflow documentation. Propose owner review controls through
existing UI patterns. Request shared exports, generated OpenAPI, navigation and
schema updates through the command center; do not edit them concurrently.

You are not alone in the codebase. Preserve owner edits and other workstreams'
changes. Never broaden grants or reset work to resolve an integration conflict.

## Deliver in small tasks

1. Add authenticated identity, effective scope and operation/workflow discovery.
   Preserve existing four-tool clients and test old-client compatibility.
2. Add complete scoped Work, Knowledge, systems, resources, evidence and identity
   resolution reads. Define eligible populations and followable continuation.
   Return ambiguity rather than guessing a repository/host identity.
3. Add working-context assembly using approved preferences and source-cited
   records. Use actual task packets for tasks and a distinct general context
   request when no task exists. Expose omissions, freshness and exact versions.
4. Implement `submit_finding` atomically: preserved source, attributed derived
   record, authorized evidence links, pending review, idempotency and audit.
5. Implement task proposals using the same evidence foundation. Reuse canonical
   Work records or the agreed proposal model; do not create a parallel tracker.
6. Add owner review, correction, rejection and instruction-promotion boundaries.
   Corrections retain history and invalidate affected current projections.
7. Expose authorized memory, skill/configuration and evaluation reads when the
   corresponding services from workstreams 3 and 4 are ready. Document every
   intentional owner-only or deferred operation.
8. Publish discoverable workflow instructions and coverage records per feature.

## Acceptance

- A real SDK client can initialize, discover, page, retrieve exact evidence and
  submit a permitted finding; UI and MCP show the same record and provenance.
- Existing read-only tokens cannot write or disclose new profile data.
- Search, counts, errors, brief previews, exact-source reads and every continuation
  page enforce scope before exposing data.
- Mixed-version chunks fail safely; expired/revoked clients fail at operation
  time; direct IDs cannot bypass scope.
- Lost-response retries return one original outcome; altered retry input conflicts.
- Actor identity is server-derived. Audit failure produces no successful write.
- Findings stay visibly proposed/unverified until the relevant review occurs.
- Embedded source instructions cannot grant authority or promote themselves.
- Tests include owner review/correction, concurrent edits, empty/partial states,
  dark/light desktop and mobile interaction, and a built-server MCP smoke run.

## Boundary

No unrestricted browser/SSH execution, runtime dispatch, production grant
issuance, billing changes or automatic instruction promotion. Use operation
names and credential behavior pinned by workstream 1. Do not select a new
endpoint or token family independently.

## Return

Write evidence to `.agent/scratch/foundation-02/RESULT.md`. Return tested commits,
tool/coverage inventory, exact service integration requests and remaining access
needs. Keep your worktree's `.agent/STATE.md` current.

You are a subagent. Follow this contract for your reply to the dispatcher:

1. Do the work the dispatch spec asked for: investigate, edit, build, or check.
2. Write your full output (the long findings, diffs, logs, file contents you read) to
   a file under the scratch path the dispatch named.
3. Reply with at most 40 lines total: what you did, what you found (headline only, no
   pasted file contents), the exact path to the scratch file, and any open questions.
4. Start your reply with a line beginning `Done:`, `Found:`, or `Result:`.
5. Never paste a diff, a log, a directory listing, or a file's contents into the
   reply; name the scratch file instead.
