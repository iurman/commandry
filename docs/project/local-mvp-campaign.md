# Local MVP campaign

**Status: Operational**

This document records temporary implementation assumptions for the local campaign on
`autonomous-commandry-mvp`. It does not set the first release cut, select live
integrations, approve production deployment, or resolve the
[open questions](open-questions.md). The target is the
[minimum coherent product](../product/scope.md#minimum-coherent-product) with
PostgreSQL, the versioned API, a separate worker, responsive screens, and the
local experience lab.

## Local assumptions

- The API and database will run on laptop loopback. The existing `test` / `pass`
  LAN preview is a review gate only, not a Commandry sign-in or recovery method.
  Production startup remains gated on OQ-003 and the accepted deployment gates.
- Project `type` will be a descriptive label, not a template or a security
  boundary. A project will not require a repository. Initial relationship
  choices will be registered with allowed entity kinds and inverse meaning;
  adding more edge types will remain possible without duplicating resources.
- Manually entered resources will have unknown operational state until an
  observation with a named source and time exists. Cached or synthetic health
  will always identify its source and freshness.
- Text and URL capture will come first. Original input will be immutable; filing,
  classification, and generated summaries will remain separate derived records.
  Local deterministic suggestions will identify their rule and rationale and
  will never be labeled as AI analysis.
- Initial manual filing will create a project task or note while retaining a
  direct link to the capture. PostgreSQL full-text search will cover these
  records and the project/resource catalog with a project filter and cursor
  continuation. This local search is not a semantic answer or an access-control
  substitute while OQ-003 remains open.
- Two fixture adapters will model development and operational signals without
  connecting to external services. Their source envelopes, normalized events,
  activity, attention, briefs, and search results will all carry a visible
  `Synthetic` label. Replaying a fixture should be idempotent.
- Briefs and execution packets will initially use deterministic assembly from
  stored records, with evidence links and generation time. This will not claim
  semantic answer quality or resolve OQ-009.
- Scoped reads, agent runs, and higher-risk action review will use a local fake
  actor and simulated action. Approval will never invoke an external system.
  The local capability representation will remain replaceable while OQ-006,
  OQ-007, and OQ-008 are unresolved.

## Evidence expected before campaign completion

- UI and API journeys persist and relate projects, resources, captures, work,
  knowledge, synthetic signals, briefs, runs, and approvals in PostgreSQL.
- The separate worker processes the asynchronous local paths, retaining
  product-visible attempts, source evidence, and audit history.
- Repository checks, meaningful unit and PostgreSQL integration tests, a
  production-shaped local Compose stack, and desktop and phone browser checks
  pass. The local Storybook lab shows actual shared components and remains out
  of the production image.
- A final audit distinguishes working local behavior from simulations and from
  the external dependencies needed for a real release.

## Questions that remain open

The existing decision queue remains authoritative: OQ-003 (human sign-in and
recovery), OQ-005 (first live connector pair), OQ-006 (external agent runtime),
OQ-007 (capability/policy representation), OQ-008 (secret broker), OQ-009
(generated-answer evaluation), OQ-010 (first release cut), OQ-012 (attention
noise controls), OQ-013 (retention/deletion), and OQ-019 (VPS and recovery
readiness). Local fixtures and defaults do not settle them.
