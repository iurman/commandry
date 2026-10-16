# Command center and chat dispatch

**Status: Approved coordination procedure. Launch authorized.**

The owner released the planning hold with "Ight send it" on October 15, 2026,
America/Los_Angeles, after the planning packet was delivered. The command
center may now launch the documented isolated chats and coordinate dependency
releases and bounded overnight follow-up. The private campaign ledger records
actual launch state; this document does not claim every workstream has started.

## What this chat can coordinate

This chat can create separate Codex chats, choose an explicitly requested model
and reasoning effort, inspect their progress and results, and send follow-up
prompts when the owner authorizes that coordination. Created chats appear in
the owner's sidebar. They do not automatically inherit this chat's complete
history, which is why the Markdown packet and pinned checkpoints matter.

Internal subagents are different: they are temporary workers within the current
chat. This environment has four concurrent internal-agent slots including the
coordinator. Separate native chats have their own execution lifecycle but still
share account capacity and can contend for local CPU/database/browser resources.
Do not assume unlimited concurrency or bypass provider limits.

The proposed arrangement is one command center here, five workstream chats and
an independent review chat when there is concrete code to review. Launch only
the dependency-ready subset at a time. Each workstream lead may split its
approved scope into small manifested workers, rather than creating additional
user-facing chats without authorization.

## Suggested model allocation

| Role                   | Model setting                    | Launch condition                                                |
| ---------------------- | -------------------------------- | --------------------------------------------------------------- |
| Command center         | Keep this chat's current setting | Already exists; planning only                                   |
| Workstream 1           | GPT-6.1 Sol, ultra               | Owner releases hold                                             |
| Workstreams 2, 3 and 4 | GPT-6.1 Sol, ultra               | Pinned contract checkpoint reviewed                             |
| Workstream 5           | GPT-6.1 Sol, ultra               | Inputs ready; bounded independent preparation can start earlier |
| Independent review     | GPT-6 Astra, ultra               | Exact committed revision and acceptance evidence available      |

Model names are proposed based on the owner's explicit request and this host's
listed options, not a measured claim that one model outperforms the other.
If unavailable, record the failure and continue unrelated work; do not silently
substitute a paid API path or claim an untested model configuration ran.

## Launch sequence after approval

1. Record the owner's actual launch scope: implementation, chat messaging,
   review, PR creation, merge and deployment authority as applicable. Do not
   invent additional approvals. Update the master plan's execution hold.
2. Commit the approved Markdown packet to the dedicated campaign branch so
   every chat receives the same immutable plan version. Keep the primary
   checkout and its owner edits untouched.
3. Resolve the saved Commandry project through `list_projects`. Use the actual
   project path/context, not a different project with a similar name.
4. Create each authorized implementation chat in an isolated Git worktree from
   the explicitly approved campaign checkpoint. The create-thread worktree
   option requires the owner's worktree authorization; do not fall back to
   editing the dirty primary checkout. Never edit one branch concurrently in
   two worktrees.
5. Give the chat its selected workstream brief, plan commit, assigned branch and
   scope. Save returned thread/worktree IDs in the private dispatch ledger.
   Before releasing command work, verify its actual runtime uses Full Access
   and approval policy `never`. The first native launch demonstrated that the
   app can select workspace access with approvals on request even when the
   command center and global configuration use Full Access. An opening prompt
   cannot change host permissions. Do not release an unattended chat that will
   wait for routine command approvals. Use the app's supported permissions
   control to correct a mismatch; do not edit app-owned cache files, bypass
   hooks or forge a permission grant in the prompt. Record a precise runtime
   setup dependency if the available controls cannot correct it automatically.
6. Start workstream 1 first. Independently verify its contract checkpoint before
   generating dependent task manifests. Update the shared checkpoint centrally.
7. Start 2, 3 and 4 at their dependency-ready checkpoint. Prepare 5 where safe,
   then release its dependent tasks only after their inputs exist.
8. Use compact bounded progress waits, not repeated full transcript reads.
   Validate short worker returns and review packets before relying on them.
9. Converge reviewed commits sequentially into the integration branch. Rebase
   or merge approved upstream changes according to repository policy; do not
   let feature chats race to edit common integration files.
10. Run independent review and required tests on the resulting revision. Prepare
    and attach the PR, then follow the release gates and actual owner authority.

## Workstream opening prompts

Use the following prompt after substituting the exact assigned brief, worktree,
branch and approved checkpoint. These are chat-lead prompts, not loop-worker
prompts. The lead generates exact task manifests before dispatching workers.

```text
Implement the assigned Commandry workstream from the approved planning packet.
Read AGENTS.md and your worktree's .agent/STATE.md first, then:
docs/plans/agent-memory-mcp-foundation/PLAN.md
docs/plans/agent-memory-mcp-foundation/ARCHITECTURE.md
docs/plans/agent-memory-mcp-foundation/MNEMOSYNE-REUSE.md
docs/plans/agent-memory-mcp-foundation/VERIFICATION.md
and your one assigned workstream brief listed below.

The command center will supply the actual plan commit, assigned worktree/branch
and dependency checkpoint in this chat's dispatch. If they are missing or the
planning hold is still active, do not implement; report the missing launch input.

Follow the assigned brief's scope, source-reading path, file ownership,
acceptance criteria and return contract. You are not alone in the codebase.
Preserve owner and other workers' changes. Keep shared integration files under
command-center ownership. Do not select parallel contracts independently.

Use Mnemosyne's session brief, bounded worker contracts, handoff and independent
review-packet practices. Split the workstream into small exact-file tasks,
generate manifests, and give loop-workers only their generated worker prompt.
Do not claim a broad brief is an already validated manifest.

Complete authorized local work autonomously. Record precise human-only access
or decision needs without stopping unrelated work. Do not change billing,
expand credentials, import private history or execute production changes as a
side effect. Maintain .agent/STATE.md and the assigned scratch result artifact.
```

| Chat title                                       | Assigned brief                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Commandry 1: Shared agent foundation             | [01-shared-foundation.md](workstreams/01-shared-foundation.md)                 |
| Commandry 2: MCP and governed findings           | [02-mcp-and-findings.md](workstreams/02-mcp-and-findings.md)                   |
| Commandry 3: Mnemosyne memory and skills         | [03-mnemosyne-and-skills.md](workstreams/03-mnemosyne-and-skills.md)           |
| Commandry 4: Evaluations and work loops          | [04-evaluation-and-loops.md](workstreams/04-evaluation-and-loops.md)           |
| Commandry 5: Workflow improvement and onboarding | [05-candidates-and-onboarding.md](workstreams/05-candidates-and-onboarding.md) |

Do not launch the template with missing values. The actual visible opening
message should name the resolved paths and commit rather than placeholders.
Append the complete assigned brief so its exact return contract accompanies
dispatch. A dependent chat should receive only ready task releases, not an
instruction to guess missing interfaces.

## Independent review prompt

At review time, provide a narrow written scope, exact read files/current diff,
source revision, permitted scratch path and runnable acceptance criteria. Ask
GPT-6 Astra at ultra to identify defects in authorization, disclosure,
provenance, concurrency, migration behavior and false-success claims. It should
test adversarial cases beyond the implementer's selected happy path.

The reviewer must not edit product files, widen task scope or approve deployment.
Return concrete findings with file/line evidence, impact, reproduction and
verification gaps. Save the full report under the assigned scratch path and
use the subagent-contract return format. The command center assigns fixes,
reruns checks and decides convergence based on evidence.

## Overnight continuity

Separate chats can continue their active work after dispatch. This command
center is not a permanently running daemon after its turn ends. If unattended
coordination needs later wakeups, establish an owner-authorized bounded thread
heartbeat using the app's automation tool and record its lifecycle. No heartbeat
or background monitor was created during the earlier planning hold. Record any
subsequently created watcher in the private campaign ledger.

### Verified execution adaptation

The first native chat repeatedly received workspace-only runtime permissions,
even after a fresh session with Full Access selected in the app. Its stale
approval was canceled without approving the command. Its worktree, branch and
task artifacts were preserved, and the chat is now idle as a handoff record.

The command center independently checked a bounded internal-worker probe. The
worker received `danger-full-access` and model-visible approval policy `never`,
ran its scratch command without escalation, and produced a passing review packet.
The first two implementation workers separately verified the same runtime.

Actual implementation now uses these scoped internal workers under the command
center, keeping the planned models, exact manifests, isolated task worktrees,
independent review and dependency order. Do not resume command execution in the
native chat or launch more native implementation chats through the unverified
path. This change does not fix the app's launcher or broaden action authority.
Later wakeups must verify their own runtime before dispatch and consult the
private ledger and live-agent inventory to avoid duplicate work. A completed
worker's saved artifacts can be reviewed or resumed without relying on a
user-facing chat remaining active.

The heartbeat, if authorized, should inspect only this campaign, release ready
dependencies, integrate/review tested slices and preserve the human-only queue.
It should remain quiet while state is unchanged and notify only for meaningful
completion, failure or required owner action. It must not create duplicate
workers, silently resume owner-paused work or expand authority. Stop the finite
campaign watcher when the authorized campaign completes.

Use account usage/capacity evidence to bound concurrency and retries. Provider
limits should lead to a resumable checkpoint and clear handoff rather than a
silent model/billing switch. Avoid simultaneous heavyweight builds and browser
mutations in shared local resources.

## Private dispatch ledger

When execution is authorized, keep a local-only ledger under
`.agent/campaigns/agent-memory-mcp-foundation/` with chat IDs, worktrees,
branches, plan/checkpoint commits, generated manifest paths, task status,
review evidence and dependency releases. No credentials or source transcripts
belong in that ledger. It is not an external task tracker or production record.

The morning handoff should contain the verified outcome, current release state,
remaining owner-only items and next action. Keep this command center available
while work is held, in progress or awaiting those decisions.
