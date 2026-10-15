# Agent orchestration and shared context

**Status: Proposed**

**Owner discussion and source review:** 2026-10-14, America/Los_Angeles

This document preserves the owner's intended experience, explored alternatives,
research qualifications, and proposed validation sequence. Owner requirements
below are confirmed direction; architecture proposals and provider compatibility
are not accepted decisions or evidence of working integrations. No harness has
been selected. An implementation still needs an agreed scope and architectural
decision under [OQ-006](../project/open-questions.md#oq-006-which-agent-runtime-adapter-and-runner-protocol-come-first).

Discussion provenance: Commandry research chat
`01a13cf2-8579-7a51-a468-c86750fddc12`. The separate deployment chat
`01a13b68-60b4-7753-a587-6a7f181a4bf4` retains unfinished infrastructure work.
This record does not authorize deployment, credential changes, or real jobs.

## Implementation milestone

On 2026-10-15, the minimal read-only project knowledge MCP was activated and
verified with native Codex on Kronos. See the [MCP runbook](../architecture/knowledge-mcp.md)
for its exact scope, release evidence, credential lifecycle, and limitations.
This implements the independent-client context direction; subscription-backed
dispatch, runtime selection, and the broader proposals below remain open.

## Owner priorities and examples

The immediate priority is basic useful work dispatch and reusable project and
personal context. The owner wants to learn through using Commandry, rather than
design every future orchestration feature before the first useful workflow.

| Workflow | Intended experience |
| --- | --- |
| Dispatch from Commandry | Select existing work or describe a goal; an agent investigates, implements or produces a proposal, tests where applicable, and returns a reviewable result. |
| Refine vague work | Bring an unfinished thought; an agent gathers evidence, asks useful questions, and proposes actionable tasks and acceptance criteria. |
| Local development on Kronos | Open a coding agent directly on the laptop and retrieve relevant Commandry project knowledge and working preferences without launching the task in Commandry. |
| Media-server issue | Send screenshots through Claude, identify the correct system and resources from Commandry context, investigate, and perform a scoped authorized fix. A screenshot alone does not grant production access. |
| Parallel work | Progress several tasks across different repositories; isolate writers and keep outcomes attributable. |
| Return to work | Preserve enough state to reopen a task and possibly continue its conversation days later; exact native-session continuity remains to be validated. |
| Telegram | Ask questions about Commandry, receive meaningful updates, and respond to requests; use the Commandry UI for deeper management and review. |

Selected owner wording retained as source captures:

> "initially i want to be very in control of what commandry is doing"

> "run tests of how far i can let it go by itself for implementing / testing / fixing things"

> "even if im not running it directly in commandry"

These statements express intended behavior. They do not imply that the catalog,
all personal knowledge, private repositories, or connected applications have
already been continuously ingested or made available to external agents.

## Confirmed constraints and preferences

- Use existing ChatGPT/Codex and Claude subscriptions. Do not silently switch
  to API-key inference, prepaid credits, paid overage, or an included API-credit
  pool. Any billing-mode change requires an explicit owner decision. An API
  transport using an officially authorized subscription is a separate question
  from API-key or credit billing.
- Support investigation-only work, implementation ending in a PR, and approved
  work that may merge after checks. The applicable policy should vary by task,
  repository, and project; none is a universal merge authorization.
- Begin with close owner control. Expand specific capabilities only after
  reviewed evidence from fixtures, real usage, testing, failure, and recovery.
  Agents must not promote their own authority automatically.
- Be able to discover and propose useful work proactively. Authority to discover
  work and authority to execute it should be independently controlled.
- Keep eligible work moving while the owner is away. Pause the affected work
  for required input or approval while independent work can continue.
- Manage subscription usage according to owner directives, task value, and
  repository/project priority. Reserves may flex for valuable work.
- Treat "leave usage at 20%" and "use it all up today" as examples of
  configurable directives, not fixed defaults. Clarify whether a directive
  means remaining allowance, the relevant quota window, and its expiry.
- Switch to another eligible subscription, redeem an available provider-supported
  earned reset when authorized, or wait for reset as policy permits. Never
  manufacture resets, evade limits, or assume different sessions add allowance.
- Preserve useful native ecosystem capabilities, including dots, plugins,
  connectors, skills, MCP, and Claude/Claude Code features where supported.
  Runtime authentication does not establish access to every native app feature.
- Prefer incremental delivery and local/self-hosted options. Retain alternatives
  without requiring a universal harness or complete replacement agent runtime.

## Responsibilities and integration directions

| Layer | Responsibility | Proposed placement |
| --- | --- | --- |
| Model client | Authentication, model requests, responses, provider errors | Supported provider client or runtime |
| Coding-agent harness | Tool loop, editing, commands, compaction, subagents | Existing runtime; candidate still open |
| Process supervisor | Process lifecycle, isolation, resource bounds, cancellation | Separate authenticated runner and OS facilities |
| Durable job orchestrator | Dispatch, wakes, attempt lineage, retries, reconciliation | Commandry application services and accepted pg-boss transport |
| Domain and UI | Work, knowledge, identity, scope, approvals, policy, evidence, Telegram | Commandry |

Commandry should support two complementary directions:

1. Commandry dispatches an execution packet to a selected runtime and records
   progress, requests, artifacts, verification, and the outcome.
2. An independently opened agent retrieves authorized Commandry context and,
   when separately enabled, records a finding or proposed task back into it.

The second direction should not require a fake Commandry-dispatched run or a
synthetic agent assignment. It still needs an authenticated client/actor and
explicit scope. External tools remain systems of record where established.
Each execution needs one clear owner; provider schedules and Commandry schedules
must not independently execute the same logical occurrence.

## Shared knowledge and external agent access

The canonical interface direction is in [Agent interface](../architecture/agent-interface.md).
MCP is a candidate standard interface for compatible clients; plugins or
connectors may package access differently in each host. A server supplies
context and tools, not automatic synchronization of all native memories or
conversations. Client compatibility and authorization must be tested separately.
See the official [MCP architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)
and [authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

Proposed retrieval sequence:

1. Discover authorized projects and resolve repository URLs, local Git remotes,
   system/resource names, and aliases to stable Commandry identities. Return
   ambiguity instead of silently guessing from a folder or screenshot.
2. Retrieve a concise project brief plus relevant owner-approved preferences,
   decisions, instructions, work, operational context, and access runbook references.
3. Search authorized knowledge with continuation; fetch exact source records
   only when needed. Every eligible result must remain reachable.
4. Return provenance, sensitivity, timestamps, freshness, and unknown or stale
   evidence explicitly. Current state and saved execution packets are distinct.
5. Provide concise client instructions showing when to consult Commandry,
   how to resolve scope, follow citations, and refresh context before acting.

Personal context should be explicit, reviewable, correctable, and selectively
disclosed. An inferred preference is not an owner instruction. Sharing one
project must not expose unrelated personal, client, employer, or infrastructure
knowledge. The storage and editing model for owner-wide preferences is open.
Knowledge of an access path is not an execution grant; credentials remain
outside ordinary knowledge, prompts, and responses.

Start external access with read-only context. Any later write tool must declare
its risk, required capability, approval behavior, and audit event. Candidate
writes include attributed findings, original captures, and proposed work, not
generic unrestricted database or shell access. The [security model](../architecture/security-and-permissions.md)
continues to apply regardless of which app started the conversation.

## Explored runtime and orchestration alternatives

These are source-reviewed candidates, not operationally tested selections.

| Candidate | Potential value | Tradeoff or unresolved condition |
| --- | --- | --- |
| Native Codex CLI, SDK, app-server | Existing coding runtime; structured execution, sessions, approvals, events | Choose interface and verify installed-version support, auth applicability, and feature availability. |
| Native Claude Code CLI or Agent SDK | Existing tools, configuration, sessions, extensions, programmatic control | CLI/SDK/native-app features differ; preserve actual desired configuration and billing path. |
| Pi | Extensible TypeScript harness, RPC, SDK, session trees, replaceable tools | More harness ownership; direct OAuth implementations need separate provider assessment; no automatic workload isolation. |
| Pi Durable | Checkpointed harness execution and storage abstractions | Experimental execution-state owner may overlap Commandry; recovery does not make external side effects exactly once. |
| Paperclip | Existing orchestration, heartbeats, sessions, CLI adapters, quota waits | Overlaps tasks, agents, policies, schedules; review permissive defaults and explicitly divide authority. |
| Happy Agent | Shared daemon, durable sessions, tools, permissions, client protocol | Replaces harness behavior; Claude uses Agent SDK while Codex integration is implemented within Happy. |
| OpenCode | Multi-provider harness and documented ChatGPT login | Its provider page warns against Claude subscription plugins and also retains older conflicting setup text. Do not assume a two-provider subscription solution. |

Sources: [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk),
[Codex app-server](https://learn.chatgpt.com/docs/app-server),
[Claude SDK features](https://code.claude.com/docs/en/agent-sdk/claude-code-features),
[Pi](https://pi.dev/docs/latest), [Pi Durable](https://earendil.com/posts/pi-durable/),
[Paperclip Claude adapter](https://github.com/paperclipai/paperclip/blob/master/docs/adapters/claude-local.md),
[Paperclip Codex adapter](https://github.com/paperclipai/paperclip/blob/master/docs/adapters/codex-local.md),
[Happy Agent](https://github.com/slopus/happy-agent),
and [OpenCode providers](https://opencode.ai/docs/providers/).

The research initially favored direct native adapters, then broadened to a
native-first, capability-specific approach after the owner emphasized native
ecosystems. Neither recommendation was accepted as the final architecture.
Immediate dispatch/context work should not be delayed to reproduce every app
feature. Keep the adapter contract open to supported future execution paths.

## Subscription evidence and qualifications

### Codex and ChatGPT

Official [noninteractive guidance](https://learn.chatgpt.com/docs/non-interactive-mode)
documents reuse of saved CLI auth and an advanced ChatGPT-managed automation
path with restrictions. [Authentication](https://learn.chatgpt.com/docs/auth)
separates subscription and API-key access. App-server's local/open-source auth
scope must not be extended to hosted commercial services without support.

OpenAI separately documents [Sign in with ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source)
and [self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).
That flow uses client registration, consent, and a stable host identity; existing
CLI tokens are not interchangeable with a newly registered client. Preview
[limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
differ from general API and native-app capabilities.

Pi source implements both [Codex OAuth](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/openai-codex.ts)
and a newer [ChatGPT registration flow](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/openai-chatgpt.ts).
This establishes implementation intent, not verified entitlement or approval
for every deployment topology.

### Claude and Claude Code

Anthropic's [October 7 update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
explicitly retains subscription-limit use for Agent SDK, print mode, and
third-party apps. The [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
separately restricts third-party offering of claude.ai login without prior
approval. Preserve both qualifications; the earlier blanket impression that
SDK subscription use is unavailable was corrected during research.

[Claude authentication](https://code.claude.com/docs/en/authentication) documents
subscription login and script-oriented OAuth credentials. API credentials can
take precedence. [Print-mode documentation](https://code.claude.com/docs/en/headless)
says bare mode does not read subscription OAuth credentials. Pi's
[direct Claude OAuth implementation](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/anthropic.ts)
is not the same integration path as the official Agent SDK; its provider
authorization remains unestablished here.

### Usage, concurrency, resets, and exhaustion

| Concern | Evidence and remaining validation |
| --- | --- |
| Codex visibility | App-server documents account limit buckets, used percentages, reset timestamps, and updates. Missing values mean unknown. |
| Earned Codex resets | App-server documents available reset credits and idempotent redemption with eligibility outcomes. These are distinct from inference credits; verify account availability and installed-version support. |
| Claude visibility | Official status-line fields include five-hour/seven-day utilization and reset times, may be absent, and appear after a response. Reliable headless collection still needs validation. |
| Concurrency | Multiple tasks share provider account allowances with the owner's other activity. No universal account concurrency guarantee was established; measure bounded parallel operation. |
| Exhaustion | Codex documents active-turn continuation subject to fair use; Claude documents a limited, rollout-dependent wrap-up allowance. Neither guarantees task completion. |
| Recovery | Classify quota, auth expiry, transient errors, and context limits separately. Resume the same native session where supported; preserve artifacts and linked attempts otherwise. |

Sources: [Codex account interfaces](https://learn.chatgpt.com/docs/app-server),
[Codex limits](https://learn.chatgpt.com/docs/pricing),
[Claude usage data](https://code.claude.com/docs/en/statusline), and
[Claude subscription limits](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan).
Provider policies and current sources must be rechecked before implementation.

Proposed scheduling should combine provider-wide limits with project/repository
budgets, priorities, reservations for admitted work, and optional overrides for
valuable tasks. API dollar estimates and token counts are not quota percentages.
Repository attribution is an estimate where provider telemetry cannot isolate
it. Provider exhaustion must not trigger paid fallback. A switch creates a
linked continuation with scoped context and evidence, not a claim that one
provider can resume another provider's native session.

## Native ecosystem opportunities

- [Dots](https://learn.chatgpt.com/docs/dots/computers-and-apps) can use supported
  apps and a separately authorized connected computer, including managing local
  Codex tasks. A CLI login does not establish dot access. No supported external
  Commandry-to-dot control interface was established by this research.
- [Dots tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory)
  distinguish proactive research from separately authorized actions. This is a
  useful interaction reference, not an adopted runtime dependency.
- [Claude Remote Control](https://code.claude.com/docs/en/remote-control) retains
  local execution while native web/mobile clients supervise it. It does not
  establish a Commandry control API.
- [Claude Desktop](https://code.claude.com/docs/en/desktop) has capabilities that
  differ from CLI, including Dispatch integration. Native-app feature parity
  cannot be promised by a direct runtime adapter.
- [Claude routines](https://code.claude.com/docs/en/routines) expose an
  experimental native cloud trigger; its [API reference](https://platform.claude.com/docs/en/api/claude-code/routines-fire)
  distinguishes subscription usage from the Claude Platform. Any adoption needs
  explicit scheduling ownership, overage controls, and result reconciliation.
- Telegram should present the same work and approvals as Commandry. Native
  messaging integrations do not establish a Telegram-to-provider bridge.

## Current baseline and implementation gaps

As recorded in the deployment handoff, Commandry runs on Electra with Node.js
24, Next.js 16, PostgreSQL 18, and a separate pg-boss worker. Four hosts provide
telemetry; the catalog contains 60 accessible GitHub repositories. Continuous
private GitHub sync and most application connectors remain unfinished. A
catalog entry is not fresh operational knowledge or execution authorization.

Dedicated unprivileged accounts are authenticated with ChatGPT and Claude Max.
Recorded binaries are Codex 0.146.0 and Claude Code 2.1.250, with separate homes
and workspaces. Only authentication/status has been verified; inference,
production dispatch, and workload sandboxing remain unverified or unimplemented.
See `.agent/runner-authentication-verification.json` at repository root. No
credential values belong in this document. Capacity/placement remains open;
preserve existing Commandry and unrelated Ephemera services on Electra.

The [project status](../project/status.md) records a local MCP rehearsal.
The [route](../../apps/web/app/mcp/route.ts) exposes `get_project_brief` and
`get_packet_work` for short-lived packet-scoped sessions and loopback clients.
This is not production remote knowledge search or owner-wide memory access.
Production identity, client connection setup, retrieval scope, authorization,
and reliable evidence writes need separate work. Reuse the existing application
boundaries rather than exposing the database or enabling local-only routes in
production. Do not change production environment mode to bypass these gates.

## Proposed incremental delivery and evidence gates

| Slice | Useful result | Required evidence before expanding |
| --- | --- | --- |
| 1. Shared context | One independently opened local agent on Kronos retrieves relevant project knowledge through an authorized interface. | Correct identity resolution, useful cited results, pagination, stale/unknown handling, denied cross-scope reads, revocation, and client instructions that actually lead the agent to retrieve context. |
| 2. Bounded dispatch | One selected task runs on one agreed subscription runtime and returns progress, output, and verification. | Subscription billing path, scoped workspace, approval/input pause, cancellation, time/resource bounds, and truthful failure reporting. |
| 3. Supervised change | Owner-approved implementation/test/fix work, or a media-system investigation with supplied screenshots, returns a reviewable result. | Actual target access and authority, preserved source attachments, applicable tests, failed-test handling, rollback/recovery evidence, and explicit remaining production checks. |
| 4. Parallel work and recovery | Independent repositories progress concurrently; interrupted work can resume or hand off. | Exclusive writers, retained edits, duplicate-dispatch prevention, process-loss reconciliation, and quota-wait/provider-switch tests without deliberately exhausting the owner's account. |
| 5. Selective autonomy | Selected workflows gain unattended execution, merge authority, or proactive scheduling. | Owner-reviewed representative success and failure evidence; scoped policy changes, revocation, and understandable UI/Telegram controls. |

Slices 1 and 2 are the near-term priorities. They may share authentication and
context work; their final order and small prototype scope are not yet approved.
Passing fixtures alone cannot authorize broader access. Preserve the ability
to lower authority, stop a run, and inspect what happened. Full native-app
integration, sophisticated usage optimization, and a universal orchestration
backend should not become prerequisites for these first useful slices.

## Decisions still required

- Select the first runtime/interface, official subscription authentication path,
  runner placement, isolation, and one bounded dispatch task.
- Define production external-client identity, MCP transport/auth compatibility,
  and the first local client setup on Kronos; evaluate Claude app access separately.
- Decide how owner preferences are authored, reviewed, scoped, corrected, and
  disclosed; do not infer broad permissions from personal context.
- Agree initial run authority and verification for the selected task. Keep
  later proactivity and merge policies adjustable through real use.
- Define workspace retention, session/attempt recovery, capability delegation,
  and action reconciliation before external writes or cross-provider handoff.
- Choose initial usage directives, attribution, reset permissions, and treatment
  of unknown telemetry; exact per-repository provider quota accounting is not proven.
- Choose which knowledge to ingest next and how to expose freshness and coverage
  without claiming that every system or conversation is already synchronized.

These decisions belong in the existing [open questions](../project/open-questions.md).
Record durable architecture in an accepted ADR before implementation relies on
it. This document preserves explored directions and priorities without selecting
a harness, authorizing a prototype, or changing production.
