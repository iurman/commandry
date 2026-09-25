# ADR 0003: Preserve source captures

**Status:** Accepted

**Date:** 2026-09-15

## Context

AI extraction and classification can be useful but uncertain. Replacing a raw
thought, image, transcript, or imported payload with a summary would destroy
evidence and make correction difficult.

## Decision

Commandry will retain the original capture payload or a durable immutable
reference to it. Extraction, classification, summaries, and created records are
derived artifacts linked to the source. They do not overwrite it.

## Consequences

- Storage and retention policy must cover source payloads and privacy.
- Users can audit, correct, or reprocess AI interpretations.
- Failed enrichment never loses the input.
- Deletion/export behavior must include both source and derived records.

## Alternatives considered

- Retain only extracted text or summaries: rejected because it loses evidence.
- Retain sources temporarily: deferred until a retention policy defines safe,
  user-visible expiration without breaking provenance.
