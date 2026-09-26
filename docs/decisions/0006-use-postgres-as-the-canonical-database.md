# ADR 0006: Use Postgres as the canonical database

**Status:** Superseded

**Reopened:** 2026-09-21

**Superseded:** 2026-09-25 by [0011](0011-self-host-postgres-and-preserve-a-managed-exit.md)
and [0012](0012-use-postgres-backed-background-work.md).

PostgreSQL remains the accepted canonical database. The initial provider,
version, operations, and job responsibilities below are historical; the newer
ADRs define the current implementation.

**Date:** 2026-09-15

## Context

Commandry needs transactions, relational constraints, typed relationships,
provider metadata, events, audits, lexical search, and potentially semantic
retrieval. “Graph-minded” describes the model and navigation; it does not by
itself require a graph database.

## Decision

Use standard PostgreSQL as the only canonical structured database. Neon is the
initial managed provider. Use Drizzle for typed schema/query access and reviewed
SQL migrations. Model relationships as typed relational edges and use recursive
SQL when traversals require it.

Use Postgres full-text search and `pg_trgm` first. Make `pgvector` available for
validated semantic retrieval cases, but do not make embeddings the primary
index or authorization mechanism. Store large captures, attachments, and
artifacts in object storage with Postgres metadata and integrity references.

## Consequences

- Domain invariants can be enforced with ordinary transactions and constraints.
- The database can move from Neon to another managed or self-hosted Postgres
  service without redesigning the model.
- Search, JSON metadata, and vectors can be colocated with authorization and
  provenance.
- Schema migrations require rollout discipline and real Postgres integration
  tests.
- Graph queries must be measured; a specialized graph store may be added later
  as a derived index, not assumed prematurely.

## Alternatives considered

- **D1/SQLite:** useful for isolated edge state but not selected for the product
  core because it reduces extension compatibility and increases migration cost.
- **Dedicated graph database:** not justified by known access patterns and would
  introduce another canonical store and consistency boundary.
- **Separate vector database:** deferred until Postgres vector scale or latency
  is measured to be insufficient.
- **Document database:** flexible payloads do not offset weaker relational
  constraints for capabilities, relationships, runs, and audits.

## Follow-up

Prototype the typed relationship schema, representative recursive queries, text
search, idempotent event ingestion, and capability checks before the first
feature schema is treated as stable.
