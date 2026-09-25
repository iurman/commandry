# ADR 0002: Use a typed relationship model

**Status:** Accepted

**Date:** 2026-09-15

## Context

Folders and strict trees cannot represent resources that belong to several
projects, cross-system dependencies, or notes and decisions relevant to more
than one concern. A completely unstructured graph, however, is difficult to
navigate and govern.

## Decision

The canonical domain model will use stable entities connected by typed
relationships. Entities may also have one primary parent for common tree
navigation. The graph semantics are independent of the eventual database
technology.

## Consequences

- Relationship types require a registry, inverse semantics, and validation.
- Tree views remain simple while dependency and impact queries are possible.
- Views must not duplicate an entity merely because it appears in two contexts.
- Storage technology remains an open decision; a relational implementation is
  valid if it preserves the model.

## Alternatives considered

- Folder-only organization: rejected because it loses cross-context meaning.
- Graph-only navigation: rejected as unnecessarily complex for common browsing.
