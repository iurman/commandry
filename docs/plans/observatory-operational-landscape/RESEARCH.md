# Observatory planning evidence

**Status: Operational research record. Recommendations remain Proposed.**

**Date:** 2026-10-16. **Examined Commandry source:** `507303ca1e82b8b15cc8d94864b61db1de86ed7e` on `feat/observatory-local-tuning`.

## Scope of inspection

Read the owner screenshots, current local wallboard, shared renderer/projection/styles, existing completeness/GPU browser tests, canonical domain/security documents, original rendering study, local InfraAgent source and current primary documentation for relevant browser/provider APIs. No product fixes, migrations, source activation, production writes or implementation dispatch were performed.

The local wallboard is the actual production UI running in development mode against a recorded isolated data copy. Its observations are not continuously refreshed from production. The native Commandry MCP brief was also read, with its normal stored-evidence limitation. A knowledge search for Gravity returned no matching primary-project knowledge records; that is not a claim that all repository documentation or prior chat history is absent.

Retained private artifacts are under `.agent/research/observatory-operational-landscape` in the planning checkout. They include the five supplied images and a sanitized `baseline.json`. Original private inventory and local credentials remain outside the repository. Do not commit raw screenshots or private inventory automatically with the plan.

## Verified inventory facts

The source snapshot was captured at `2026-10-16T21:59:21Z`, from the same deployed revision as the examined source. It contains:

- 91 canonical resources: 60 repositories, 18 hosts, 13 services.
- 70 resources without a primary parent, and 21 nested resources.
- 48 resources without project links, all of them repositories.
- Seven resources with more than one project association.
- 21 containment edges and no recorded dependency edges in the captured overview.
- Null structured resource state for every resource. Historical/device descriptions in subtype text are not structured role or lifecycle evidence.
- Four Linux host sources and one GitHub repository-activity source.
- Four hosts with four recorded measurements each. Every infrastructure availability value is `unknown`.

Consequences: absence of a deployment edge does not prove a repository is undeployed; no existing data justifies green service-availability summaries; provider discovery, scan coverage and true run state cannot be inferred from this inventory.

The inventory confirms an Ephemera database record under Electra, and Commandry-related service records under Electra. It does not confirm the owner's hypothetical Merope hosting example or a complete Ephemera application topology. ResuPals has a repository/project association but no established Cloudflare deployment mapping in this snapshot.

## Projection findings

See [infrastructure projection](../../../packages/ui/src/gravity/infrastructure.ts).

- `projectInfrastructure` sorts resource UUIDs and uses the first project UUID for its default sector.
- Every root becomes a `Well` with `kind: "host"`, regardless of canonical resource kind.
- In host mode root placement uses a global golden-angle spiral; no provider/application hierarchy is involved.
- Nested presentation wells use `kind: "service"`, even for nested records whose canonical kind differs. This is a renderer vocabulary, not an adequate product-kind vocabulary.
- Project/custom views add broad sector wells whose radii affect global terrain bounds. Those views are not an independent source of verified logical deployment groups.
- Default colors mostly identify sectors. Attention comes from source telemetry states, not availability, work or security.

An offline call to the current production projection with the complete captured population produced the following calculations:

```text
Hosts:    91 field wells, 70 root wells, 16 sector identities.
Projects: 107 field wells, 71 roots and 16 broad sector wells.
Custom with no custom assignments: the same 107-well project fallback.

Host single-population field plan:
  extent about 115.11 x 98.45 world units
  195 x 167 segments, 32,928 vertices
  nominal inner spacing about 0.59 world units

Project single-population field plan:
  extent about 462.54 x 462.54 world units
  166 x 166 segments, 27,889 vertices
  nominal inner spacing about 2.79 world units

Smallest nested radius: 0.18 world units.
Median radius: 1.8 world units.
```

These are source calculations, not a frame-rate benchmark. Nominal spacing excludes the outer-apron deformation, which can reduce sampling further near the field edge. A small well can receive too few vertices to preserve curvature. This is consistent with the supplied polygon screenshots, but a controlled geometry/silhouette comparison is still required to prove the contribution of each factor.

## Renderer and label findings

See [field budget](../../../packages/ui/src/gravity/field.ts), [renderer](../../../packages/ui/src/gravity/renderer.ts), [label layout](../../../packages/ui/src/gravity/labels.ts), [presentation](../../../packages/ui/src/gravity/presentation.ts) and [materials](../../../packages/ui/src/gravity/materials.ts).

The scene evaluates a sum of well contributions at plane vertices. Contour fragments shade the interpolated surface; a smooth mathematical function cannot restore geometry that was never sampled.

`update` calls `coverLandscape([...this.wells, ...wells])`. Terrain planning uses this combined array's population, including duplicated unchanged IDs. A settled scene of 91 contributions can therefore plan as 182 population entries. The actual inspected browser reported 91 GPU field contributions but 16,422 terrain vertices, consistent with the doubled-budget calculation. The previous/current union is useful for transitions; it needs identity-aware treatment rather than counting every array entry as a separate field.

Label collision handling iterates repulsion, clamping, persistent separation choices and admission. Root labels can be displaced from their anchors. Children are largely exposed through the selected host's lens rather than a general semantic expansion path. Label non-overlap does not prove that labels remain close enough to correctly identify their wells.

Orbit/tour fit the landscape with a low viewing elevation, making many groups overlap in depth. Tour candidates are all renderer `host` wells, so repositories can be treated as hosts. The lens center is fixed near 43 percent of stage width and 48 percent of stage height; radius is based on viewport fractions. The selected detail camera follows the overview direction. These are design choices to reconsider, not independent technical impossibilities in Three.js.

The [master-scene browser test](../../../tests/e2e/gravity-master-scene.spec.ts) uses 103 resources arranged as hosts/services in one project. It checks inventory continuation, GPU contribution count, complete selection, focus and accessible layout. The [GPU field test](../../../tests/e2e/gravity-field-gpu.spec.ts) proves shader evaluation beyond 256 contributions. Neither test establishes a legible 60-repository mixed operational portfolio. Preserve their substantive guarantees and add the missing cohort/usability assertions.

## Appearance clipping

See [shared Gravity styles](../../../packages/ui/src/gravity/infrastructure.css) and [Appearance form](../../../packages/ui/src/components/GravityInfrastructure.tsx).

The card uses `overflow: hidden`. Appearance is a positioned disclosure whose absolute child has `right: 0`, a 270px maximum width and no collision-aware placement. When the control wraps toward the left edge, its form extends leftward outside the clipping card. A high z-index cannot escape an ancestor clipping boundary.

The supplied second screenshot is direct reported evidence of clipping. At the inspected 870px CSS viewport, the same panel happened to fit: panel left about 64.28px, width 270px; card left about 14.30px, width 822.66px. That particular geometry is not a reproduced clipping failure. The implementation regression must exercise wrapping boundaries and the screenshot-equivalent placement, rather than claim the 870px sample failed. The form was opened for measurement and restored closed. No appearance preference was changed.

Source inspection found no established reusable Popover/Menu/Dialog component in the current UI component directory; ordinary disclosures are widespread and must not all be treated as floating menus. The accepted stack permits accessible interaction primitives; verify actual dependencies before selecting a library.

## Lessons from InfraAgent

The local reference source is `apps/dashboard/src/components/dashboard/monitor-org-map.tsx` in `/home/urmani/Documents/Work/infra-agent`.

Its `groupApps` forms application summaries from actual monitors, orders monitor state within groups and derives an application status. The supplied screenshot's useful property is a coherent application card with a service count and summary, rather than a label for every check. Its scene/inspector also associates an incident with a particular application.

Adopt explicit grouping, compact summary counts, useful incident focus and progressive detail. Do not copy its status fall-through, averaging semantics, constant route decoration or assumptions about available monitoring data into Commandry. Commandry's source contract currently has no equivalent actual service-health coverage. Visual inspiration does not authorize importing account data or copying an implementation wholesale.

## Primary-source verification

Sources were checked on 2026-10-16. Technical recommendations are engineering judgments; documentation establishes available mechanisms, not measured performance or account access.

- [Three.js PlaneGeometry](https://threejs.org/docs/pages/PlaneGeometry.html) exposes independent width/height subdivisions. This supports the sampling diagnosis; it does not prescribe the right adaptive mesh.
- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) supports shared geometry/material objects with distinct transforms. Use it where repeated markers actually benefit.
- [Three.js LOD](https://threejs.org/docs/pages/LOD.html) supports detail levels and hysteresis. Semantic aggregation still belongs outside the engine.
- [MDN Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) documents non-modal top-layer content. [Anchor fallback positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-try-fallbacks) provides placement alternatives, but failed fallbacks can still return to the initial overflowing position. A viewport-sized fallback remains necessary.
- [WAI dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) describes focus entry, Escape and focus restoration for modal dialogs. Do not apply modal semantics to every inspector/popover.
- [Cloudflare Status API](https://www.cloudflarestatus.com/api) provides structured provider status, incidents and maintenance; [Cloudflare support](https://developers.cloudflare.com/support/cloudflare-status/) lists separate incident/maintenance feeds. A read-only summary request returned stable component IDs and component/update lists. The overall indicator and a local dependency's state are not interchangeable. No account-specific impact was verified.
- [Cloudflare Worker deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/) can provide deployment records. Their existence does not prove endpoint health or repo mapping.
- [GitHub deployments](https://docs.github.com/en/rest/deployments/deployments), [pull requests](https://docs.github.com/en/rest/pulls/pulls), [secret scanning](https://docs.github.com/en/rest/secret-scanning/secret-scanning) and [code scanning](https://docs.github.com/en/rest/code-scanning/code-scanning) have distinct records and permissions. No private account adapter, scan coverage or new access was activated during research.
- [Grafana node graph](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/node-graph/) illustrates summary stats and state arcs. Its hidden-node limits are not appropriate for Commandry's complete-population requirement; it is interaction reference only.

## Unverified or explicitly not performed

No new geometry, aggregation, overlay primitive, provider adapter, health connector, security scanner or MCP tool was implemented or tested. No physical TV/mobile benchmark, controlled silhouette test, 30-minute soak or observed outage/recovery test was performed. No complete Cloudflare deployment inventory or security posture is established. The planning packet specifies how these gaps must be closed; it does not relabel them as passing results.
