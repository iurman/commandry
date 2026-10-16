# Shared foundation checkpoint

**Status: Operational local checkpoint. Not production activation.**

Date: 2026-10-16 UTC. Branch: `feat/agent-memory-foundation`.

This is the concrete starting boundary for dependent campaign tasks. The
command center records exact commit IDs, worker manifests, source hashes and
test logs in its private campaign ledger. A broad workstream brief is still not
a worker manifest. Generate small exact manifests from the source at each
dispatch and verify each worker's actual Full Access / never runtime.

## Actual interfaces

The public `@commandry/contracts` barrel exports the strict schemas and types
from `packages/contracts/src/agent-foundation.ts` and `foundation-access.ts`.
The public `@commandry/domain` barrel exports the operation policies, safe error,
canonical digests, credential digest, grant/version/review predicates and their
types from `packages/domain/src/agent-foundation.ts`.

The public `@commandry/application` barrel exports the actual types and factories
in `packages/application/src/agent-foundation.ts`:

- `FoundationIdentity`, a trusted adapter input, not authentication proof;
- `FoundationServiceOptions` and server-owned environment/clock/identity inputs;
- `FoundationAnchor`, with exact source binding and explicit freshness;
- `FoundationOperationContext`, machine/owner requests and mutation receipts;
- `FoundationRecordPort`, bound to one outer project/principal transaction;
- `FoundationAccessPort`, including transactional callbacks and owner client
  creation, pagination and revocation;
- `createFoundationMachineService` and `createFoundationOwnerService`.

The public `@commandry/db` barrel exports
`createFoundationAccessRepository` and the `foundationSchema` namespace.
The database schema is defined in `packages/db/src/foundation-schema.ts`, merged
with the existing schema in the shared database client, and included in Drizzle
generation. The concrete record port lives in
`packages/db/src/foundation-record-repository.ts` and opens no second connection.
Migration 0058 adds the schema, same-project foreign keys, immutable history,
closed provenance membership and deferred revision integrity constraints.

Read the actual source declarations rather than re-creating a parallel actor,
memory, evidence, configuration, evaluation or approval model. The
[implementation document](../../architecture/agent-foundation.md) defines the
source anchoring, transaction semantics, workflow and current coverage.

## Implemented operations

Machines with explicit grants can describe their effective authority, read exact
evidence/assertion/configuration records, record unverified evidence, propose or
revise an assertion, and register immutable configuration bytes. Existing `ck_`
read-only clients retain their old four tools and scope. They cannot become
foundation clients through fallback or an endpoint change.

Trusted owner services issue/list/revoke foundation clients, review assertions,
record factual verification and approve exact instruction versions separately.
These owner services have no new public transport in this checkpoint. Current
human session validation and revocation must be integrated before exposing them.
No machine tool may accept a caller-provided owner identity.

`evaluation.record` is declared and may appear in a deliberately issued grant,
but its use case is reserved for workstream 4. This checkpoint does not pretend
it implements trial ingestion. Discovery must distinguish supported operations
from granted capabilities.

## Verified local behavior

- Application orchestration: 61 focused tests and independent adversarial
  reproduction of valid-shape replay corruption and approval expiry races.
- Full application package: 128 tests. Workspace Vitest: 375 tests in 86 files.
- Independent schema and adapter source reviews, with confirmed corrections
  preserved before convergence.
- Real disposable PostgreSQL 18: existing platform tests, eight foundation
  scenarios and a populated 0057-to-current upgrade with migration rerun.
- Restricted runtime operations, exact source version/digest, timestamp
  precision, complete static client pagination, separate authority records,
  stale sources, contradiction blocking and old-version approval nontransfer.
- Concurrent same-key requests produce one effect; concurrent revisions retain
  one winning version; actual database lock contention is observed for
  revocation and an expiring owner waiting for a memory-operation lock.
- A known callback denial rolls back partial changes before its denied audit.
  An injected audit failure rolls back record and idempotency effects.
- The prior canonical source and legacy read grant survive populated upgrade.
  A runtime role without default grants needs the explicit tested regrant step.

The command center separately ran the existing full PostgreSQL integration
population, workspace validation and generated-contract checks. Exact commands,
results and source identities belong to its ledger. These checks do not prove a
new public route, user interaction, production role state, live MCP release or
VPS recovery. Do not promote them into production evidence.

## Dependent ownership

Workstream 2 may now build transport/discovery, canonical context retrieval and
governed finding/proposal workflows against these services. It must add complete
paginated reads rather than treat exact-ID methods or brief previews as a full
inventory. The command center owns route composition, OpenAPI, shared exports,
schema ordering and public activation.

Workstream 3 may build the bounded selected import and configuration registry
against the existing assertion/configuration records. It may prepare a local
review preview; it may not approve instructions, import the entire private brain,
install hooks or overwrite local customizations.

Workstream 4 may implement immutable trial/assessment persistence and truthful
comparisons using the already exported configuration/evaluation contracts.
Measurements remain partitioned by exact model/runtime/configuration; absent
conditions, failed policy gates and missing assessments cannot imply success.

Dependent workstream 5 remains gated by actual context, import and evaluation
services. No external runtime, new inference billing, production capability,
host rename, bulk disclosure or deployment is authorized by an interface alone.
