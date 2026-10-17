# ADR 0015: Show the complete Gravity landscape

**Status:** Accepted

**Date:** 2026-10-16

**Amended by:** [ADR 0016](0016-project-the-operational-observatory.md) supersedes only the per-resource GPU-well implication. Complete authorized membership and all other guarantees remain.

## Context

The owner rejected visible pages in Gravity and approved one continuous master
scene as the first real coding-agent pilot. ADR 0013 used six/twelve-resource
pages to bound a shader with 64 uniform contributions. Removing only the page
controls would leave incomplete data or exceed that renderer boundary.

## Decision

Gravity will collect every continuation of the existing authorized overview
scope before replacing its scene. API, list and topology pagination remain
available. A resource keeps its canonical identity, explicit project membership
and actual containment. Scene grouping and detail remain presentation choices.

A complete client collection replaces the prior complete collection together.
Failed, aborted or inconsistent collections cannot publish a partial fleet as
complete. Refresh failure retains a delayed prior scene; a different project or
search clears the old scope. These are live paginated reads, not a new database
snapshot transaction. Source observation times remain attached to each metric.

Replace the fixed uniform contribution array with texture-backed field records
using the existing Three.js/WebGL2 renderer. All resources and presentation
contributions must participate. Adapt terrain extent, camera/sky coverage and
geometric detail to the landscape and actual graphics capabilities. Detail may
reduce with scale; a fixed resource cap or silently missing identities is not
an acceptable level of detail. Genuine GPU failure retains complete accessible
resource inspection and the ordinary list alternative.

Preserve the shared lab/production boundary, stable organic placement, nesting,
focus, camera modes, reduced motion and truthful source/event semantics. No
monitoring provider, dependency upgrade, new machine mutation or data migration
is implied. Project-scoped MCP resource continuation already exposes canonical
inventory; presentation preferences remain device-local. The real pilot uses
existing task/context/evidence/configuration/evaluation services with temporary
project-only clients and separately governed owner actions.

## Consequences

The visible-page requirement and 64-contribution consequence of
[ADR 0013](0013-share-the-gravity-renderer-with-production.md) are superseded.
Its shared renderer, evidence, deployment and isolation boundaries remain.
Large-fleet completeness, stale refreshes, scope cancellation, actual shader
compilation, focus and desktop/phone/TV views require verification. A single
manually launched agent pilot is not autonomous dispatch or a model benchmark.

The existing Three.js [data texture](https://threejs.org/docs/pages/DataTexture.html)
and [WebGL2 renderer](https://threejs.org/docs/pages/WebGLRenderer.html) support
the selected storage mechanism. Actual project version, resource limits and
performance must be checked locally; documentation alone is not render proof.

## Alternatives considered

Keeping pages contradicts the owner-approved experience. Loading only the first
API page, raising one arbitrary resource limit or dropping extra shader records
would misrepresent the fleet. Replacing the rendering library or adding a new
infrastructure backend is unnecessary for this presentation change.
