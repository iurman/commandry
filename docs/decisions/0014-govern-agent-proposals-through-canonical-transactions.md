# ADR 0014: Govern agent proposals through canonical transactions

**Status:** Accepted

**Date:** 2026-10-16

## Context

The owner approved the agent-memory-MCP foundation campaign and resumed its
remaining engineering. Mnemosyne's source preservation, explicit memory review,
versioned configurations and measured evaluation workflows should apply through
Commandry's shared application services. A machine proposal must not become an
owner decision or a second canonical task, Knowledge or inventory store.

## Decision

Keep improvement, cited finding and host-onboarding proposals in the existing
Node/PostgreSQL modular monolith. UI, versioned owner HTTP and opt-in MCP call
the same application services and strict contracts. Separate machine read and
proposal capabilities from owner review and inventory apply. Actual live owner
sessions, current grants and environment/project scope remain prerequisites on
every request, including receipt replay.

A cited finding preserves original Capture bytes, exact whole-source citations
and an immutable proposal. Owner filing creates canonical Knowledge and a
proposed, unverified assertion in one transaction. Filing does not accept the
assertion, verify its factual content or promote standing instructions.

An improvement associates a same-kind baseline and its direct candidate child,
exact reviewed motivating assessments and a declared evaluation population.
A complete current report and exact population/report digests bind a separate
owner decision. Reports remain advisory. No decision installs a skill, changes
a running client or executes inference.

An onboarding proposal carries either an opaque existing resource UUID or a
nonsecret proposed host and exact typed provider/Tailscale identity tuple.
Only authenticated owner preview resolves global inventory. New identity claims
are explicitly owner-asserted and case-sensitive; names and tuple absence do
not establish physical uniqueness or provider verification. Separate expiring
owner review and apply bind the full canonical resource/link/identity snapshot.
Apply creates one canonical host/link as needed, identity claim, historical
outcome, idempotency receipt and allowed audit atomically. It never renames,
reparents, reactivates archived links, provisions or invokes a shell.

Use the supplied PostgreSQL transaction for source validation, scope/session
locks, feature records, canonical writes, receipt and audit. Lock ordinary
resource/link writers consistently, recheck deadlines after waits and enforce
closed membership and immutable historical records in SQL as well as services.
Exact historical receipts describe prior effects; they do not grant new action
authority. Workflow-specific input expiry still applies where the contract
requires it.

## Consequences

- Legacy knowledge clients keep four read tools and their prior scope. Existing
  foundation grants gain no new capability automatically.
- New source-level tools require both an explicit capability and the actual
  supplied application service. Every action declares risk, approval and audit.
- All eligible project records remain reachable through bounded continuation;
  page size never silently defines the product population.
- Raw private import, standing-client issuance, disclosure selection, candidate
  installation and real runtime evaluation retain their separate owner gates.
- A merged feature or disposable rehearsal is not production activation proof.
  Release still requires reviewed migrations, populated upgrades, normal checks,
  constrained backup/restore, deployment and exact live readback.
- See the [governed proposal workflow](../workflows/governed-agent-proposals.md)
  for precise DTOs, bounded URL intake, owner controls and retry differences.

## Alternatives considered

- Give proposal clients owner review/apply: collapses the capability boundary.
- Store filed Knowledge or hosts in an agent-specific inventory: fragments the
  canonical model and can duplicate resources across projects.
- Treat passing fixture trials as measured model improvement: loses execution
  provenance, population denominators and human assessment boundaries.
- Infer identity from names or auto-install operational adapters: exceeds the
  approved reviewed inventory action and the constrained execution boundary.

## Follow-up

Verify the exact production artifact independently. Select a first external
client/runtime and any private Mnemosyne cohort explicitly before adoption.
Broader feature MCP coverage and constrained operational adapters remain separate
work; these proposals do not implement universal CRUD or a coding-agent runtime.
