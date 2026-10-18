# Gravity Observatory

**Status: Canonical behavior under accepted ADR0016. Operational rollout evidence is maintained separately.**

The Observatory presents one complete authorized landscape of resources and their recorded evidence. It is the Gravity presentation in Infrastructure and the wallboard. [ADR0015](../decisions/0015-show-the-complete-gravity-landscape.md) defines complete population coverage; [ADR0016](../decisions/0016-project-the-operational-observatory.md) defines the operational projection. [The execution record](../plans/observatory-operational-landscape/EXECUTION.md) and [58-scenario ledger](../plans/observatory-operational-landscape/COVERAGE.md) distinguish implemented behavior, tested evidence and production activation. A feature-branch test does not establish a live release.

## Landscape and interaction

Every authorized resource has one canonical identity. Collections, progressive expansion and explicit shared-resource references reduce visual weight without removing members. Counts and aliases are computed after authorization.

By owner decision (2026-10-17), nested members are visible by default: the projection reveals whole sibling sets breadth-first while the scene stays within 200 active representations and four levels. A larger group stays an aggregate until it is expanded or searched; explicit expansion always opens it. Outline expansion is independent and starts collapsed. Collections and project groups are drawn as pools whose flat floor encloses their packed members; resource members orbit their host or provider in non-overlapping sectors, and top-level clusters keep clear of each other's full extent. Overview labels name top-level groups only. A member is named when its parent is on the selected path, when its cluster fills most of the view, or when it carries attention, so revealing detail never floods the scene with labels. Host, project, provider and per-sector custom grouping preserve canonical containment. A project link, name match or repository URL cannot establish deployment, provider dependency or network traffic.

Repository collections remain compact. An unmapped repository is not described as undeployed, idle or healthy. InfraAgent, CRM and Arvo repositories remain inventory unless the owner separately authorizes operational tracking. InfraAgent is design prior art, not a required monitoring account or connector.

The composed overview is the default camera. A single selection focuses a subject and updates one inspector; expansion, breadcrumbs and Back preserve reading context. Orbit and guided tour require deliberate activation and stop for direct interaction or reading. Repositories do not become host-tour subjects merely because they lack a parent. The optional selected-subject lens is a smaller detail aid. The complete outline, search and inspector remain available when WebGL fails or graphics detail is reduced.

Child/service count is the default structural size basis. RAM sizing uses actual recorded total capacity where available. Utilization samples do not resize wells; missing total capacity is unknown. Appearance, grouping, palettes, motion, pause, camera and TV choices are device-local presentation. They grant no resource access and do not create canonical mappings. Private named views persist presentation separately from topology.

The shared floating surface handles viewport collision, clipping ancestors, scrolling and keyboard dismissal. Escape dismisses the innermost surface first. Reduced motion, pause and hidden-scene suspension preserve useful static selection and evidence. Real mobile keyboard and owner usability acceptance are recorded explicitly in the ledger when not verified.

## Repository logos

A repository resource may carry its own project logo on its label badge, in place of the kind mark, after the owner has reviewed it. The owner either uploads the file, or names a file in the repository that is already reviewed for that resource (its `github-repository` source binding or canonical `https://github.com/owner/name` URL). The server reads that file from `api.github.com` at a resolved commit, using the private token file when one is configured. Inputs are recognised by their bytes (PNG, JPEG, WebP or a self-contained SVG) and rasterized to one 128×128 transparent PNG; no SVG is stored or served. Preview shows exactly that PNG and writes nothing. Approval resubmits the same source with the previewed digest and is refused if the result differs. Retiring hides the logo but keeps its image and source as history. Without an approved logo, or if the image cannot load, the badge keeps the kind mark. Logos are presentation only: they do not establish ownership, deployment or health. Inheritance by related deployments or services is [OQ-038](../project/open-questions.md#oq-038-should-related-resources-inherit-an-approved-repository-logo). The [repository logos plan](../plans/observatory-repository-logos/PLAN.md) records the owner decisions and activation gate.

## Independent operational facets

| Facet | Meaning and limits |
| --- | --- |
| Availability | Actual supported service checks with their observation times. Missing, expired or unread checks do not establish passing availability. |
| Telemetry freshness | Whether source observations are current in their configured windows. Fresh telemetry does not establish service health. |
| Monitoring coverage | Observed, required, missing, disabled and inaccessible checks remain distinguishable. A passing observed subset is not complete required coverage. |
| Capacity | Recorded measurements and total capacity retain source evidence and sample time. |
| Lifecycle | Maintenance, stopped and retired status remains separate from availability; acknowledgment is not recovery. |
| Repository PRs | Supported GitHub PR and check evidence. A repository relationship does not imply active deployment or execution. |
| Security | Scanner configuration, access, result age, completed zero findings and observed findings remain distinct. None means uncompromised. |
| Provider exposure | Public notices combined with explicit reviewed dependencies and independently observed local impact. |
| Work | Complete canonical Work with actual state and age. No released AgentRun is inferred from repository activity, a manual worker or missing runtime data. |

The inspector exposes safe source details and retained evidence. A failed source attempt preserves last-known evidence with unavailable coverage; rereading the page cannot advance the observation clock. One current passing source cannot erase a separate current required failure. Availability, security, capacity, provider and Work facts can coexist.

The Work dock follows every canonical project Work page, including projects without infrastructure. It includes all types, statuses, assignments and due-date states, deduplicates shared Work by canonical ID and preserves each project context. The accepted Work interface is distinct from a future execution runtime.

## Supported sources

Cloudflare public status uses the supported structured summary, unresolved incidents and maintenance endpoints. One leased server poller fetches independently of viewer count, with allowlisted transport, bounded size/timeouts, retry/backoff, immutable originals/history and complete reconciliation. The public panel follows the complete recorded-notice population and every update/component. It is not a claim of all historical Cloudflare notices.

Local impact, potential exposure and advisory are separate classifications. Confirmed current local impact receives urgent red; fresh matched potential exposure receives orange; unrelated notices remain quiet neutral. Unknown environment, geography or plane stays unknown. Public severity does not supply relevance or confidence. Dashboard/build control-plane disruption can coexist with passing data-plane availability. Stale/unavailable provider feeds cannot create new current potential exposure or silently resolve retained notices. Feed text and links are data, never agent instructions or operational authority.

Reviewed source bindings connect one explicit resource, canonical owning project, environment, source kind and external identity. Sources are created disabled. Optional GitHub credentials and optional InfraAgent origin/key references are loaded explicitly from private server files; browser or shell credentials are not inherited. Raw originals are sealed outside UI/MCP results. No credential or arbitrary monitoring origin is entered through the owner source form.

The fixed `http-readiness` source uses external ID `commandry-web-readiness` and the trusted server `APP_ORIGIN` plus `/health/ready`. Only the actual Commandry web service/deployment should be bound. A valid HTTP200 ready response is passing; valid HTTP503 not_ready is failing. Malformed, unauthorized, timed-out or unavailable transport is a source error. Its time is local probe completion, not the fetch time of a stored remote check. This is one direct web/database readiness probe, not external user availability or complete uptime history. Its reader and rollout remain subject to the execution ledger's integration and activation evidence. It requires no InfraAgent account.

GitHub PR/security traversal follows supported continuations. Scanner or API access failure remains explicit. The optional InfraAgent adapter can read a deliberately configured monitor through its supported read-only API, but this upgrade does not import the existing CRM account, monitors or credentials.

## Reviewed configuration and authority

The signed-in owner's inspector lists complete active and inactive annotations, relationships, provider dependencies, source configuration and repository logos, including versions and provenance. Edits require explicit endpoints, scope, evidence references, a review note and the actual expected version. A conflict retains the draft for rereview. Accepted receipts include canonical ID, version and audit ID; the UI reloads and confirms the accepted version before reporting success. No source enables merely by opening its form.

All mutations require an actual password-mode owner session and matching trusted Origin, held and rechecked through data/audit/commit. Input JSON cannot assert owner identity. Local auth-off read mode does not authorize mutations, private named views or owner Work reads.

| Owner operation | Risk and scope | Approval/capability | Canonical audit event |
| --- | --- | --- | --- |
| Annotation review | reversible; resource | owner submission; owner | `observatory.annotation.review` |
| Typed relationship review | reversible; resource pair | owner submission; owner | `observatory.relation.review` |
| Provider mapping review | reversible; resource/provider | owner submission; owner | `observatory.provider_mapping.review` |
| Source binding review | sensitive; resource/project | owner submission; owner | `observatory.source.review` |
| Client resource restriction | sensitive; client project | owner submission; owner | `observatory.client_scope.review` |
| Repository logo preview | read only, with one owner-initiated `api.github.com` file read; resource | owner session; owner | `observatory.logo.preview` |
| Repository logo review (approve or retire) | reversible; resource | owner submission; owner | `observatory.logo.review` |
| Private view create/update/delete | reversible; owner, optional project | owner submission; owner | `observatory.view.create`, `.update`, `.delete` |
| Private view read/page | read only; owner, optional project | owner session; owner | `observatory.view.read` |
| Owner canonical Work page | read only; owner/project | owner session; owner | `observatory.work.read` |

Existing grants are preserved. New separately issued read grants do not become owner mutation authority. Safe availability/PR/security evidence is available through the same application service to UI/API/MCP; source configuration and private originals remain owner-only. Poll observations append `observatory.source.observed` audit events and encrypted immutable history. Public provider history retains stable incident/update identities and source records.

[The agent workflow](../architecture/observatory-agent-workflow.md) describes discoverable tools, continuations, owner handoff and intentional MCP omissions. Device-local appearance is deliberately UI-only. Canonical mapping/source mutations and private named views remain owner-only because current machine credentials have no owner-session authority. A future machine proposal or delegated mutation needs an explicit capability, approval and audit design; it is not authorized by a read grant.
