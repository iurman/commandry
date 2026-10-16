# Proposed shared architecture

**Status: Proposed. No implementation or new architectural decision is recorded
as accepted by this file.**

This design extends Commandry's existing application services and PostgreSQL
model. It does not embed Mnemosyne's complete batch pipeline in web requests.
See the [master plan](PLAN.md) for scope and the execution hold.

## One canonical record, several interfaces

UI, versioned HTTP and MCP should call the same application services. Domain
policy belongs in domain/application packages. Repository adapters provide
transactions and persistence; transports provide parsing, authentication and
serialization. Commands, skills and external runtimes remain independently
versioned consumers of those services.

Preserve Project, System, Component and Resource distinctions. A personal
profile is a disclosure and preference object, not a new project that grants
access to unrelated records. A registry entry for a skill is not an installed
or enforced skill.

## Contract checkpoint

Workstream 1 must settle names and implement the following contract families
before dependent workers start. The field names below are proposed semantics;
the checkpoint will publish their exact source declarations and examples.

| Family                | Required semantics                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor context         | Server-derived principal, client/run attribution, effective capabilities, project/resource scope, environment, expiry and correlation ID                            |
| Evidence reference    | Stable source identity, source record/version or immutable artifact digest, exact locator, observed/ingested times, verification state and source availability      |
| Memory assertion      | Stable ID, version, statement, category, project/profile scope, lifecycle, evidence links, author, review history and supersession/contradiction links              |
| Working context       | Selected source IDs/versions, approved instruction references, explicit omissions, freshness, digest, budget and authorized continuation                            |
| Configuration version | Immutable content/digest and explicit parent versions for prompt, skill, hook, loop, runtime, model and relevant execution settings                                 |
| Evaluation definition | Versioned cases, fixtures, acceptance rubric, hard gates, conditions, repetition/completeness requirements and data-disclosure policy                               |
| Evaluation trial      | Unique trial/attempt IDs, exact model/runtime/configuration references, inputs, artifact references, usage when available, outcome and infrastructure failure state |
| Assessment            | Separately versioned rubric/judge identity, assessed trial/artifact digest, individual checks, hard failures, uncertainty and review status                         |
| Operation policy      | Named operation, population/scope, risk class, required capabilities, approval behavior, idempotency/concurrency behavior and audit event                           |
| Workflow/run          | Definition version, prerequisites, step states, dependencies, run/attempt lineage, bounded progress, blocked/approval states and verification evidence              |

Use explicit fields and relational constraints for identities, scope and revision
relationships. Provider-specific details may use namespaced metadata. Avoid an
untyped JSON document store that bypasses canonical Work, Knowledge, resource or
approval services. Database-level uniqueness should back identity and
idempotency invariants; application checks alone cannot prevent concurrent
duplicates.

## Evidence and memory

Keep three layers:

1. Original capture or immutable external source reference.
2. Derived assertion, finding, interpretation or proposed work.
3. Reviewed preference, instruction or decision with explicit authority.

One source may support several assertions, and one assertion may cite several
sources. Preserve the complete provenance population through pagination rather
than truncating it to a small mention cap. The source locator and source content
digest are different concepts. A missing source remains visibly unavailable.

Proposed assertion lifecycle: `proposed`, `accepted`, `rejected`, `superseded`.
Verification is an independent field such as `unverified`, `source_matched` or
`independently_verified`. An owner accepting a preference does not verify a
historical operational claim. A source quote match does not establish truth.

Correcting a statement creates a new version. Approving instruction wording
binds approval to the exact text/version/digest and disclosure scope. Changed
wording invalidates the old wording approval. Supersession and contradiction
edges must remain navigable; unresolved contradictions should prevent
authoritative instruction selection or appear explicitly as unresolved.

Use Commandry-owned stable IDs for durable records and preserve Mnemosyne IDs
as external aliases. Wording changes must not silently create unrelated memory.
Do not equate source mention time, latest ingestion time, owner review time and
independent verification time.

## Privacy and working context

Apply authorization before retrieving, ranking, counting or summarizing records.
Scopes must restrict exact-source reads and indirect evidence, search snippets,
briefs, error messages, profile fields and continuation pages. Organization
tags such as Home Lab, Work and domains are not authorization by themselves.

An owner-approved profile should disclose selected preferences separately for
each project/client context. There must be a clear distinction between
approving a preference as accurate and approving its disclosure. Imported tiers
can inform review but cannot become the complete ACL system.

Build compact, source-cited context packs with deterministic selection and an
explicit size budget. Mark estimated token counts as estimates; use a runtime
tokenizer only when available and identified. Preserve authorized continuation
for excluded records. A context pack is a snapshot, not a live guarantee.

Do not fabricate a Work item or agent run merely to generate general working
context. Reuse task execution packets for real tasks. Current task instructions
take priority over applicable approved preferences; retrieved evidence cannot
change permissions.

## MCP coverage and grants

Preserve the live four-tool knowledge client's read-only behavior and primary
project population. Decide explicitly whether new capabilities use a separate
credential class or opt-in operation grants with a safe migration. Never infer
new authority from possession of an existing credential.

The first useful expansion should cover:

- identity, effective scope and workflow/tool discovery;
- project and repository/resource identity resolution with explicit ambiguity;
- complete authorized Work, Knowledge, systems/resources and source reads;
- approved memory/profile retrieval and bounded working context;
- skills/configuration/evaluation discovery and exact records;
- source-backed finding and task-proposal submission where granted;
- resumable inventory changesets when their application services are ready.

Every new feature needs declared MCP coverage or an intentional, reviewed
deferral with a reason. Owner-only grants, policy approval and instruction
promotion must be labeled owner-only rather than exposed as an agent's
self-authorization path. UI-only presentation preferences may remain UI-only.

Read pages need stable ordering, scope/filter-bound continuation and an `asOf`
or version contract. Exact content chunks should pin versions or reject
mixed-version continuation. Return distinct empty, unavailable, partial and
not-authorized outcomes without exposing other scopes.

Mutations should use principal/operation-scoped idempotency keys plus a request
digest. Identical retries return the original result. Reusing the key with
different input conflicts. Updates use expected versions and preserve concurrent
edits. Publish the actual retry retention window.

All writes need transactional audit. Revocation and expiry apply at operation
time, including retries and continuation. Preserve the existing grant-lock and
audit ordering guarantees. Never hold a database transaction open while running
SSH, a model, a browser task or another network operation.

MCP tool annotations communicate intent; the server still enforces policy.
Return structured results and concise text equivalents. Protocol failures and
tool-execution failures are distinct. Error envelopes should carry safe codes,
retryability and correlation/recovery guidance without secret-bearing logs.

## Skills, commands, hooks and loops

Git remains the authority for executable definitions. Commandry records exact
source commits/digests, versions, supported harnesses, installation evidence,
drift and evaluation history. Reading a skill through MCP does not install its
hooks, grant tools or prove compliance.

Reuse Mnemosyne's three-way drift comparison: library version, last installed
baseline and actual installed content. Preserve local additions and escalate
conflicting edits. Require a supported adapter for each harness; report missing
enforcement rather than claiming parity.

Record recommended, selected and actually observed skill use separately.
Correlated success after a skill recommendation is not evidence it ran, and
observational success metrics are not causal A/B results.

## Evaluation and promotion

Keep raw trial evidence immutable. Regrading creates a new assessment referring
to the original artifacts and the new rubric/judge versions. A report must not
rewrite the trial to match current prompts or silently retain an obsolete grade.

Partition comparisons by model, runtime and exact configuration. Track completed,
failed, timed out, canceled, unsupported and unassessed cases separately. Missing
conditions cannot become zero-scored trials or successful comparisons. Report
sample size, denominators, repeats and uncertainty where meaningful.

Hard requirements such as no credential disclosure, correct scope and actual
verification cannot be compensated by a high average quality score. Use
mechanical checks first and calibrated independent assessment for subjective
criteria. Separate worker access from reference answers and final holdouts.

Candidate generation may draft a skill, prompt, hook or loop change from reviewed
failures. It must record its parent configuration, motivating evidence and
proposed diff. Test one meaningful change at a time. Promotion requires complete
regressions and appropriate review; it never expands capabilities, deploys code
or installs a hook as a side effect.

## Operations and runtime boundaries

The first real coding/evaluation harness remains a separate explicit runtime
choice. Native Codex chats can implement this campaign without Commandry gaining
control over all Codex sessions. Test the control plane using deterministic
fixtures and disposable real PostgreSQL before a small authorized native run.
Do not run the entire Mnemosyne corpus through model calls overnight.

Server onboarding should resolve identity, inspect under an authorized read
profile, propose a versioned resource changeset, apply allowed record changes,
plan monitoring, request any exact configuration approval, then verify evidence.
Unknown relationships remain proposals. A registered host is not a healthy host;
fresh capacity telemetry is not application availability.

Keep credentials in existing protected custody and pass opaque references. A
provider or SSH credential is separate from authorization to change that target.
Keep approval, execution and verification separate and retain uncertain outcomes
for reconciliation rather than blindly retrying an external effect.

## References

- [Commandry agent interface](../../architecture/agent-interface.md)
- [Commandry security model](../../architecture/security-and-permissions.md)
- [Existing knowledge MCP](../../architecture/knowledge-mcp.md)
- [Work and Knowledge model](../../domain/work-and-knowledge.md)
- [MCP tool specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)
- [Evaluation design and hillclimbing](https://claude.dev/blog/automating-eval-design-and-hillclimbing/)

The implementation should verify the MCP specification and installed SDK version
at its contract checkpoint rather than assuming these cited protocol revisions
are the newest supported revision.
