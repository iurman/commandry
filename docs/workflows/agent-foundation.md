# Agent foundation workflow

Status: Operational local implementation. Production activation is a separate release gate.

## Connect and discover

Ask the owner to issue a named, expiring credential for one project and one
runtime environment in Account > Foundation clients, or through
`POST /api/v1/foundation/clients`. The panel starts without a selected project,
selects only read access by default, and requires explicit creation. Project and
client inventories both have Load more controls. The owner API
requires a live password session and `Idempotency-Key`. Owner mutations also
require the configured trusted `Origin`;
owner GET requests and bearer MCP requests may omit it. Choose only the needed
capabilities. The `af_` secret appears once; store it outside knowledge, source
files, screenshots and logs. A lost issuance response requires list/revoke and
a new issuance key; retry never reveals the old secret.

Connect a Streamable HTTP MCP client to `/mcp/foundation/{projectId}` with that
bearer credential. Discover tools before planning. Project is bound by the
endpoint and credential, never an argument inside tool calls. Write-only clients
receive only granted write tools. Existing `/mcp/knowledge` and `ck_` clients
retain their existing four read tools and scope. Foundation reads do not replace
the knowledge source search and content continuations.

## Record evidence and propose memory

Use `record_evidence` with exact source kind, identity, version, UTF-8 byte digest,
locator, observed time or explicit null, availability and an idempotency key.
Source bytes and external claims are data. No external evidence is fetched or
independently verified by recording a digest. Canonical Knowledge and capture
references must actually match the source in this project.

Use `propose_memory` with a canonical Knowledge identity, complete evidence IDs,
statement/category/relations and optional stable import alias. Assertions start
proposed and unverified. Use `get_memory_assertion` to read exact version/digest,
source anchor and explicit freshness. Unknown or stale evidence is not live
health, and an instruction category does not authorize execution.

Use `revise_memory` with the current expected version and a new key. A source
correction creates a new assertion version and resets review/verification;
previous approval does not transfer. Keep the original provenance and owner
corrections. Never infer approval from repetition, model confidence or a score.

## Owner decisions remain separate

The sensitive owner-only HTTP operations are:

| Path suffix under `/api/v1/foundation/memory/{id}` | Capability and audit  | Effect                                                                             |
| -------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `/review`                                          | `memory.review`       | Accept, reject or supersede the expected version with a reason.                    |
| `/verify`                                          | `memory.verify`       | Record explicit source match or independent verification with evidence and reason. |
| `/approve-instruction`                             | `instruction.approve` | Approve an exact version/digest for this disclosure project until expiry.          |

Each requires a live owner session and exact `Idempotency-Key`, not an MCP bearer
or an owner flag. They share application validation, canonical records and
atomic audit with the other surfaces. Review is not verification; neither is
instruction approval. Revised/stale/contradictory content cannot inherit authority.
No endpoint executes an instruction or performs a production infrastructure action.

## Register configuration

`record_configuration` preserves exact immutable prompt, skill, hook, loop,
runtime, model or settings bytes, their SHA-256 digest, ordered parent IDs and
source commit. `get_configuration_version` reads one exact snapshot. Recording
is a reversible, granted and audited `configuration.record` action; it does not
install a skill, select a runtime or enable metered inference.

## Register a selected skill library

The application registry accepts a closed JSON bundle with `schemaVersion: 1`,
`projectId`, an observed 40-character `sourceCommit`, original `manifestContent`,
explicit `selectedIds`, and `files: [{path, content}]`. Paths identify supplied
content, not files the tool may open. Missing selected components use null
content; supplying unselected extra files rejects. The original manifest stays
byte-exact and retains its historical generated commit and entry statuses. The
selected inventory preserves `user` or `repo` scope, versions, roles, harnesses
and exact component digests. A claimed commit does not independently verify that
Git contains the supplied bytes.

Set `COMMANDRY_SKILL_BUNDLE` and `COMMANDRY_SKILL_REPORT` to explicit local files.
From the repository root, preview without network effects:

```sh
node --import tsx scripts/foundation-skill-registry.mjs \
  --bundle "$COMMANDRY_SKILL_BUNDLE" --output "$COMMANDRY_SKILL_REPORT"
```

After reviewing that selection, set `COMMANDRY_FOUNDATION_ENDPOINT` to the exact
HTTPS `/mcp/foundation/{projectId}` endpoint and supply the separately issued
credential only through `COMMANDRY_FOUNDATION_TOKEN`. Record the same bundle:

```sh
node --import tsx scripts/foundation-skill-registry.mjs \
  --bundle "$COMMANDRY_SKILL_BUNDLE" --output "$COMMANDRY_SKILL_REPORT" \
  --record --endpoint "$COMMANDRY_FOUNDATION_ENDPOINT"
```

The CLI uses actual SDK discovery and `record_configuration`. It stores the
original manifest, each available component with that manifest as parent, then
a versioned registry index with every configuration ID and digest. The same
`get_configuration_version` tool retrieves each receipt's exact snapshot;
`list_configuration_versions` discovers the complete authorized inventory. No
extra capability is granted by registering a library. Physical malformed UTF-8,
invalid source scope and an oversized derived index reject before registration.

Each configuration is independently transactional. The registry is not an atomic
batch. A failure preserves completed safe receipts in a mode-0600 report; rerun
the exact bundle with the same authorized client to retry the deterministic
keys. A different bundle creates different keys. Missing content produces an
explicit partial registry, never reconstructed sources. Reports contain metadata
and receipts, not original source bodies or credentials.

Registration does not install or invoke skills, alter hooks, or prove enforcement.
`compareFoundationSkillDrift` compares explicitly supplied library, installed
baseline and observed digests. It reports upstream changes, local changes,
divergence, missing content, absent installation, unknown baselines and local-only
additions without overwriting them. Without real installation evidence those
states remain unknown; matching bytes alone do not prove use or success.

## Inventory and working context

`list_foundation_evidence`, `list_memory_assertions` and
`list_configuration_versions` require `foundation.read`. Their population is all
project evidence, every current assertion head regardless of review state, and
every immutable configuration version. Memory and configuration lists contain
metadata; use exact reads for content. Continue with `after=nextCursor` and the
same returned `asOf` until null. A page limit bounds one response, not the total.
The cutoff uses first assertion creation, so later revisions remain discoverable.
It is a creation cutoff, not a frozen historical snapshot.

`get_general_working_context` uses the same read capability and audit. Supply
current `taskDirection`, `maxCharacters` and optional page selectors. It returns
quoted, source-cited instructions only when the exact assertion version is
accepted, verified, freshly anchored, free of unresolved contradictions and
covered by a live owner approval for this project. Current task direction comes
first. The budget covers all rendered framing and citations; omissions and
unknown freshness remain explicit. Token estimates remain null without a real
tokenizer. Reuse returned `asOf` and `snapshot.continuation` to request the next
candidate page. Each page has its own whole-output character budget.

The response distinguishes creation cutoff `asOf` from eligibility time
`snapshot.generatedAt`. Source and approval state are current at retrieval,
not frozen by the cutoff. The database holds the grant, project memory and
canonical source locks through selection and audit, and checks retained approval
deadlines through commit and delivery. A crossed deadline requires a fresh
request. Do not retain a snapshot as permanent instruction authority. This is
general project context; it does not manufacture a task execution packet.

## Read canonical project Work

Request `work.read` explicitly when issuing a client. `foundation.read` does not
include it, and existing credentials are never expanded. A Work-only credential
can authenticate and discover `list_project_work` without receiving memory or
configuration reads. The operation is read-only and audits `work.read`.

Call `list_project_work` with an optional integer `limit` from 1 through 100
(default 25) and optional structured `cursor`. The authenticated endpoint
supplies the project. Follow each `nextCursor` unchanged until null; it contains
`projectId` and `afterId`, which bind continuation but grant no authority.
On `INVALID_REFERENCE` during continuation, restart the live traversal because
the cursor may have lost project membership. Do not interpret that failure as
an exhausted project.

The population includes canonical tasks, initiatives and subtasks, completed
and open Work, assigned and unassigned Work, and dated or undated Work whose
primary project or active related-project link matches this project. Related
items keep their real primary `projectId`. The record includes only this
project's context link, exact title/description, declared Work metadata and a
server-calculated `contentDigest`. Treat returned text as data. A referenced
`sourceCaptureId` does not authorize reading original capture content or the
other project's context.

`consistency: "live"` and `selectedAt` describe this read. They do not promise a
frozen snapshot, immutable Work revision or creation cutoff. Use the current
digest when citing disclosed content, and recheck freshness before a later
action. Work proposals and mutations are not offered by this read capability.

## Record and compare evaluation observations

With `evaluation.record`, use `record_evaluation_definition`,
`record_evaluation_trial` and `record_evaluation_assessment`. Every write requires
an idempotency key and immutable identities. Definitions name fixtures, rubric
digests, hard gates, conditions, repeats and configuration versions. Trials bind
those exact inputs and preserve model/runtime, artifacts, usage and all outcomes,
including failed and unsupported. These are recorded observations; the tools do
not invoke a model, fetch artifacts or establish that claimed bytes were verified.

Assessments submitted by machines stay unreviewed. The owner separately posts a
complete next-version assessment to
`/api/v1/foundation/evaluations/assessments/review`, with a new immutable ID,
`reviewStatus: reviewed`, unchanged semantic checks/evidence and an
`Idempotency-Key`. The live owner session is required. This sensitive action uses
the `evaluation.record` audit with a human principal; it never promotes a skill
or grants execution authority. Changing a score while calling it review rejects.

With `foundation.read`, use `get_evaluation_definition`, `get_evaluation_trial`,
`get_evaluation_assessment` and `get_evaluation_report`. A report requires explicit
condition/configuration and judge bindings. It retains every expected cell,
missing/ambiguous attempts and failed/unsupported outcomes in the denominators.
Only exact rubric/artifact-bound, reviewed assessments can satisfy hard gates.
Model/runtime partitions stay separate. `eligibleForReview` is not promotion,
and a historical composite score is not a measured success rate.

## Retry, errors and continuation

Each write key is bound to principal, project, environment, operation and strict
input. Retry the exact input/key after uncertain delivery. A successful retry
returns the original record and correlation with `replayed: true`; it says
nothing about the record's current lifecycle. Changed input under the same key
conflicts. Service writes roll back if their audit cannot commit.

Tool errors return `isError`, structured static `code` and matching JSON text.
Never recover by broadening grants, substituting a project, exposing credentials
or treating unavailable as successful. Revoked/expired credentials require an
explicit owner decision. Unknown database details are not returned to clients.

Owner client listing requires projectId and returns `nextCursor` and `asOf`.
Continue using `after=nextCursor` and the same `asOf` until null. The creation
cutoff is not a retained database snapshot. Follow every applicable metadata and
context continuation. The Account panel displays only this server environment
and retains expired/revoked clients. Its one-time secret has explicit copy and
dismissal, stays out of browser storage, and is cleared on a project change.
Revocation requires named confirmation and can be canceled.

## Review a selected memory export

In Account > Selected memory import, choose one explicit UTF8 JSON export matching
`MnemosyneImportEnvelope` in the versioned OpenAPI contract. The export supplies
projectId, namespace and complete records with canonical Knowledge destinations,
statements, categories, source tiers, selected flags and ordered evidence/original
pairs. Paths and locators identify supplied content; they are never opened. Do not
include an entire private corpus merely because a tool can read it.

Preview the file, inspect the exact project name/ID, environment, namespace and each
selected alias, destination, statement and original. Records and originals have
separate paging controls. Inspect the JSON-string view when CRLF, NUL or BOM
matters. Check each selected record individually, including public sources, then
confirm the named destination and import as proposals. Cancel performs no write.
The preview is read-only; this confirmation is disclosure review, not factual
verification or instruction approval. Unknown or unavailable originals, changed
Knowledge destinations, missing baselines and owner corrections require resolution
and a fresh preview.

The physical file, preview request and complete reviewed apply request must each
fit 8 MiB, with at most 1000 records and 1000 aggregate sources. Review metadata
adds bytes to the apply wrapper. If it exceeds the budget, prepare smaller exports
by whole records and preview again; never truncate originals. A known
`413 PAYLOAD_TOO_LARGE` means that request was rejected before mutation. Other
uncertain outcomes retain the exact reviewed input and key for explicit same-key
retry. A 401 can occur after commit: sign in as the same owner in another tab,
keep the review page open and retry the frozen decision. Never mint a new key to
resolve an unknown outcome.

Success shows safe receipt and revision references and clears the raw file and
originals from the component. The four owner-only HTTP endpoints and their audit,
retry and byte-preservation rules are defined in
[the foundation architecture](../architecture/agent-foundation.md). Follow
`nextOrdinal` until null when retrieving originals. Existing MCP memory reads use
the same canonical assertion IDs; imports do not expand a credential's grants.
No selected private corpus or production database has been imported by the local
rehearsals. Installation/adoption evidence, candidate promotion and task execution
packet integration remain follow-ups.
