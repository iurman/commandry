# Native runtime comparison

**Status: Operational tooling; adoption remains proposed**

**Owner-authorized comparison:** 2026-10-16, America/Los_Angeles.

The owner requested trying multiple runtimes before choosing a default and
confirmed paid overage is disabled on both existing subscriptions. This
supersedes the temporary request to choose one runtime before any local trial.
It does not select a production harness, resolve runner placement under
[OQ-006](../project/open-questions.md#oq-006-which-agent-runtime-adapter-and-runner-protocol-come-first),
change inference billing, or authorize deployment or wider autonomy.

## Candidates and recommendation

Compare native Codex and native Claude Code first, behind replaceable adapters.
Both are already installed and authenticated locally. Keep the runtime,
integration interface, model, effort, configuration and task population separate
in each observation. A model result is not a harness ranking.

Codex app-server is the initial supervision candidate because it exposes
structured thread/turn lifecycle and native interrupt acknowledgement. The
SDK and CLI are other interfaces to the same native runtime, not independent
runtime candidates. [Official integration guidance](https://developers.openai.com/blog/codex-as-a-platform)
distinguishes those interfaces.

Claude Code provides an independently useful second runtime. The initial print
interface offers structured streaming and explicit tool configuration; richer
input/approval and restart supervision need a separate control-protocol trial.
[Official programmatic guidance](https://code.claude.com/docs/en/headless)
describes that boundary. Claude's [subscription guidance](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
retains subscription-limit usage separately from included API credits. A native
login does not imply entitlement to offer a hosted login product.

The alternatives in [orchestration research](agent-orchestration-and-shared-context.md)
remain available. Add another harness when its proposed benefit has a concrete
comparison case. Do not duplicate Commandry's Work, policy and scheduling merely
to add an orchestrator to the shortlist.

## Reproducible local trial

The committed tooling lives in `scripts/runtime-comparison/`. From the repository
root, with Node 24 and the repository's pinned pnpm:

```sh
node scripts/runtime-comparison/run.mjs --runtime=codex
node scripts/runtime-comparison/run.mjs --runtime=claude
pnpm test:runtime-comparison
```

The first two commands inspect native subscription authentication without
inference. Account emails, organization identifiers, credentials and raw stderr
are excluded from reports. Conflicting API-key/provider environment overrides
fail admission. Native saved credentials stay in their existing locations;
the tool does not copy credentials or import private memory.

Only use the following after confirming that paid overage remains disabled:

```sh
node scripts/runtime-comparison/run.mjs --runtime=codex --live --subscription-overage-disabled
node scripts/runtime-comparison/run.mjs --runtime=claude --live --subscription-overage-disabled
```

The explicit flag records an owner attestation. It does not inspect or change
the providers' overage settings. A later invoker must recheck them. Codex also
checks the backend's ordinary-usage permission; false blocks admission.
Unavailable usage is unknown, not evidence that allowance recovered.

The task-local standalone Codex installation is pinned to `@openai/codex@0.163.0`.
It was installed under the ignored trial directory, without replacing desktop
Codex or changing the repository lockfile. To select an already installed
standalone binary, set `COMMANDRY_CODEX_BINARY` to its absolute executable path.
The chosen executable and its observed version are included in new readiness
reports. No installer is run automatically by the comparison tool.

Each invocation creates an exclusive private directory under
`.agent/scratch/runtime-comparison/`. Its exact dispatch spec, fixture digest,
report, tool-event evidence, final reply and summary remain there, including
failed attempts. No Commandry AgentRun or production record is fabricated.

The trial server exposes exactly two tools:

| Tool | Scope, capability and risk | Approval and evidence |
| --- | --- | --- |
| `read_context` | Invocation-scoped read of three explicit synthetic pages; read-only | Local invocation grants this fixed read; `context_read` event records each page |
| `submit_report` | Invocation-scoped, reversible write to one fixed private report path | Local invocation grants this exact bounded write; complete context is required; `report_submitted` or `report_denied` records the result |

No arbitrary report path, shell, browser, production data or product mutation
is available through this fixture. Identical retries retain the original bytes;
changed retries fail. Shape validation and independent scoring reject fabricated
automatic dispatch, verified outcomes and incomplete source lists.

The runtimes retain normal hooks. No hook trust hash, shared approval setting,
configuration file or global permission is changed. Claude's initial trial
exposes only the explicit MCP tools and denies unresolved permission prompts.
Codex disables command/app/browser tools for this invocation and selects a
named profile scoped to the trial directory. Actual returned policy/profile is
checked before inference; mismatches fail. This remains a tool-policy rehearsal,
not proof of OS workload isolation or permission to run implementation commands.

The installed Codex 0.159.2 rejects the older `readOnly.access` turn field even
though its generated legacy schema and documentation describe it. Restricted
reads use the beta named permission-profile interface on this version. The
adapter opts into that interface explicitly and checks the returned profile;
it does not recover by widening access. [Permission-profile documentation](https://learn.chatgpt.com/docs/permissions)
labels that interface beta. This compatibility observation must be rechecked
when selecting the production protocol.

## Initial observed results

Both candidates passed the corrected v2 synthetic context/report contract on
2026-10-16. Their returned models were `gpt-6.1-sol` and `claude-opus-5-5`.
Both fetched every page, retained the manual/synthetic boundary, wrote one
bounded report and passed the concise return contract. Codex also emitted a
native `interrupted` terminal event after an explicit interrupt. Claude's
cancellation is deliberately recorded as not run in this initial print adapter;
process exit alone would not prove provider cancellation.

A separate paired coding experiment gave both runtimes the same small array
function and acceptance criteria. The original failed the fixed independent
tests; a reference fix passed. Both generated candidates then passed those same
four tests in disposable Bubblewrap filesystem/network namespaces with Node
permission mode. No repository edit or production action was delegated.

Separate one-off restart experiments also passed for both candidates: each
original runtime process exited, a new process resumed the exact native session,
remembered a unique marker absent from the resumed prompt, reconnected to the
MCP fixture and retained the original report bytes. Codex's trial session was
recoverably archived afterward; no history or credential was deleted. These
experiments do not test provider outage, quota exhaustion, a lost host or
production job reconciliation. Their sources and receipts are retained in the
task's private scratch evidence. The reusable committed command currently runs
the context/report case; it does not claim those one-off coding/recovery probes
as additional CLI modes.

The initial setup failures remain in private task evidence. These include a
buffering issue, an adapter variable-shadowing bug, the rejected legacy Codex
read policy, a browser bridge outside the selected tool set, and a grading
contract that allowed explanatory status text while expecting one exact token.
The latter was corrected by declaring explicit status values in v2 and rerunning
both candidates. No original failed report or score was rewritten.

The Codex browser bridge required a complete disabled transport entry in the
child configuration; a partial `enabled=false` entry failed parsing. The final
admission inventory contained only the two trial tools. This setting is confined
to the child invocation and leaves native desktop configuration intact.

These observations recommend retaining both native candidates. They do not
establish which is best for coding, which has better model quality or which
should run production work. The adapter records end-to-end setup/turn time, and
Codex's initial duration also includes its cancellation probe, so those values
must not be ranked as equivalent inference latency measurements.

## Evaluation stages

1. Context and evidence: complete pagination, useful source attribution,
   structured output and truthful synthetic/manual/automatic distinctions.
2. Coding: the same bounded bug and acceptance criteria in separate disposable
   repositories; independently run the same tests and inspect the actual diff.
3. Governance: exact denied tools, input/approval requests, revoked context and
   hostile retrieved content. Passing fixtures never grants additional authority.
4. Lifecycle: cancellation, quota/auth failure, process loss, resume by exact
   native session, retained edits and duplicate-dispatch prevention.
5. Operational fit: native skills/plugins/MCP coverage, maintenance burden,
   startup/recovery behavior, latency and available subscription telemetry.

For quality comparisons use multiple representative cases and repeated runs.
For harness comparisons hold the model constant where provider support permits.
Run candidates sequentially before exploring concurrency, since they share the
owner's subscription activity. Do not deliberately exhaust allowance.

A successful provider result is awaiting verification until its report and
artifact have been checked independently. A successful context fixture alone
cannot establish coding quality, production readiness, a success-rate estimate
or a default runtime. Estimated API-equivalent cost is not a subscription charge
or quota percentage. Missing revision/usage remains unknown.

## Current delivery boundary

This is local development tooling. It is excluded from production execution and
does not add product dispatch, a runner service, a schedule or new machine
grants. Product MCP dispatch and cancellation remain deferred until the real
shared application services and runner protocol are implemented. They must not
wrap these local scripts or bypass the existing policy/credential boundaries.
The original completed manual pilot and its unreviewed assessment remain intact.
