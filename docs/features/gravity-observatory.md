# Gravity Observatory

**Status: Canonical behavior under accepted ADR0016. Operational rollout evidence is maintained separately.**

The Observatory presents one complete authorized landscape of resources and their recorded evidence. It is the Gravity presentation in Infrastructure and the wallboard. [ADR0015](../decisions/0015-show-the-complete-gravity-landscape.md) defines complete population coverage; [ADR0016](../decisions/0016-project-the-operational-observatory.md) defines the operational projection. [The execution record](../plans/observatory-operational-landscape/EXECUTION.md) and [58-scenario ledger](../plans/observatory-operational-landscape/COVERAGE.md) distinguish implemented behavior, tested evidence and production activation. A feature-branch test does not establish a live release.

## Landscape and interaction

Every authorized resource has one canonical identity. Collections, progressive expansion and explicit shared-resource references reduce visual weight without removing members. Counts and aliases are computed after authorization.

By owner decision (2026-10-17), nested members are visible by default: the projection reveals whole sibling sets breadth-first while the scene stays within 200 active representations and four levels. A larger group stays an aggregate until it is expanded or searched; explicit expansion always opens it. **Collapse all** and **Expand all** on the stage switch the scene query's `reveal` between `groups` (root groups plus explicit expansions) and `members` (the default reveal); the choice is remembered on the device and restored on reload. Outline expansion is independent and starts collapsed. Members sit on concentric rings around their host, provider or pool: a ring's members share one distance and equal gaps between neighbours, each taking the angle its own size needs, small populations stay on one ring, and a nested cluster's ring leaves the side facing its own parent open. A pool keeps its centre open, or holds its dominant nested pool there. Thin tethers tie every visible member to its parent at every zoom: spokes from the parent's rim (or a pool's hub) to the innermost ring, and orbit arcs between ring neighbours.

By owner request (2026-10-18), top-level groups sit around one central viewpoint: a group at least 1.6 times the size of the next anchors the centre, and the others circle it in family order (hosts, providers, other operational kinds, repositories, collections and projects, references), each clearing its neighbours' full extent. A fresh root set is arranged this way; a group added later in the same scope takes the nearest free position, so ordinary refreshes never move landmarks. The [presentation plan](../plans/observatory-presentation/PLAN.md) records the options explored and the defaults chosen.

Labels follow the camera. An overview names top-level groups only, each as a one-line pin of badge, name and member count. A group's members are named once its members are about a label width apart on screen (a larger share on big screens), or while a group stays framed by direct focus, a presentation stop or a watch, including a nested ring inside a closed parent. Services and deployments are named like other members. Zooming out again returns to top-level names, and an open group's own label, or a pool's label around a framed nested ring, steps back to a compact form on its rim. Attention and the selected subject are always named. A label that loses its room keeps it for 0.3 seconds before fading out, and once released needs room for 0.2 seconds before it returns, so brief contacts while the camera moves never blink a name off and on. Labels step out from under the stage's briefing card and roster rather than hiding behind them, and the camera fits subjects into the band above the roster. Labels that only settle or change size move over the frame already drawn; the terrain is redrawn only when the camera, scene or lens changes.

When a framed group's members are closer on screen than 0.9 of a compact label width (leaving above 1.2), its direct members are named in two callout columns beside it, each with an elbow leader line to its basin. Left-half members are named on the left, the rest on the right, stacked by height. A full column lends the members nearest the centre to the other column, and a member changing sides fades out and back in. Members that still do not fit are counted below the column; the inspector briefing lists every member. A stage too narrow for two columns uses one, on the roomier side. Such a group is framed in the centre 62 percent of the stage width to leave room for the columns. Host, project, provider and per-sector custom grouping preserve canonical containment. A project link, name match or repository URL cannot establish deployment, provider dependency or network traffic.

Each label badge shows a recognised technology or the resource kind. In order:

1. An icon the owner chose for the resource.
2. A repository's approved logo (below), or a host's reported operating system (below).
3. A logo for a whole-word technology in the resource's name, for example Home Assistant or Minecraft.
4. The kind: the GitHub mark for repositories, a provider's logo such as Cloudflare, otherwise a server, service, deployment, provider, collection, project or reference glyph.

A host showing a technology keeps a small server glyph on the badge's lower edge, so it still reads as a machine. The owner may choose any listed platform, operating-system or service logo for a resource in its inspector. The choice is stored on the device, like colours, and carries into local named views. Saving an account (private named) view also stores the device's choices, so applying that view on another device, such as the wallboard, shows the same icons. A view saved before icon choices existed leaves the applying device's own choices unchanged. A choice is presentation, never a canonical mapping, role or placement input. Brand logos are vendored from Simple Icons and identify software only.

Repository collections remain compact. An unmapped repository is not described as undeployed, idle or healthy. InfraAgent, CRM and Arvo repositories remain inventory unless the owner separately authorizes operational tracking. InfraAgent is design prior art, not a required monitoring account or connector.

The composed overview is the default camera. A single selection focuses a subject and updates one inspector; expansion, breadcrumbs and Back preserve reading context. The optional selected-subject lens is a smaller detail aid. The complete outline, search and inspector remain available when WebGL fails or graphics detail is reduced.

## Presentation, watch and briefing

By owner request (2026-10-18):

- **Primary groups.** The presentation visits the visible top-level hosts, providers, collections and projects, in arrangement order: the central group first, then around the ring. Individual root repositories, references, services and deployments are not stops, so a repository never becomes one merely because it lacks a parent.
- **Presentation.** **Start presentation** travels to each group in 4.5 seconds, then dwells for 24 seconds (36 with attention) while the camera orbits at 0.03 radians per second at one constant distance. The camera lifts during long moves, so they read as travel across the landscape. When a group's impact or exposure is newly raised while the presentation runs, it moves there at once, gives it the longer dwell, and continues after it. Attention present at the start only decides where the presentation begins. **Slow orbit** in Appearance still circles the whole landscape instead.
- **Watch.** Selecting a primary group, from the terrain, a pin, the roster, the outline or search, focuses it and orbits it the same slow way until direct interaction. Selecting any other subject focuses it with a still camera; **Watch** orbits it and **Stop watching** holds the camera still again. **Start presentation** returns to the whole tour, and **Overview** to the still composed overview.
- **Interruption.** Drag, wheel, search, inspector reading, pause and Escape stop automatic motion as before. Reduced motion and pause disable presentation and watching. Selecting a primary group is itself the deliberate activation for its watch.
- **Briefing card.** The stage's briefing card names the framed subject: whether it is a presentation stop (with its position and reason), watched or selected. Its headline and up to three facts resolve from code glyphs, left to right; the complete text is in the accessible tree from the start, and reduced motion or pause shows it at once. Up to three issues follow, each naming the member that carries it.
- **Inspector briefing.** The inspector's briefing lists every member group in full, each member selectable, with the three most recent recorded events. A repository collection lists repositories with a reviewed `deploys` relation, then project repositories, then each nested collection.
- **Roster.** A rail along the stage bottom names every primary group in visiting order with its badge, member count and attention text. It marks the active group, shows the current stop's progress, and holds the stage controls. Hovering or focusing a chip highlights its pin.

The briefing restates the scene's evaluated summaries, reviewed relations and recorded events; it adds no evidence of its own. Missing monitoring reads as "No availability checks observed", never as healthy. An unmapped repository is named as unmapped, never as undeployed or idle. The owner confirmed the current pacing, preemption, ring order and callout thresholds on October 18, 2026; [ADR 0017](../decisions/0017-confirm-observatory-presentation-defaults.md) records the accepted settings and resolves OQ-039.

Child/service count is the default structural size basis. RAM sizing uses actual recorded total capacity where available. Utilization samples do not resize wells; missing total capacity is unknown. Appearance, grouping, palettes, icons, motion, pause, camera and TV choices are device-local presentation. They grant no resource access and do not create canonical mappings. Private named views persist presentation, including icon choices, separately from topology.

The shared floating surface handles viewport collision, clipping ancestors, scrolling and keyboard dismissal. Escape dismisses the innermost surface first. Reduced motion, pause and hidden-scene suspension preserve useful static selection and evidence. Real mobile keyboard and owner usability acceptance are recorded explicitly in the ledger when not verified.

## Host operating systems

A host with the Commandry Linux collector reports its operating system with each sample: os-release `ID`, `ID_LIKE` and `PRETTY_NAME`, and Proxmox VE when its tooling (`/usr/bin/pveversion` or `/etc/pve`) is present, because Proxmox VE itself reports `ID=debian`. The receiver validates the bounded identity in the strict sample contract and keeps the original sample as evidence. The scene's `platformObservations` carry the latest reported identity per host, with its observation time and source envelope, under the same disclosure as telemetry. The badge shows Proxmox VE, then the distribution's logo, then the closest `ID_LIKE` family with a vendored logo (for example Debian for Kali), else the generic Linux mark. The inspector names the reported operating system and its evidence. A reported identity is an observation, never a role, mapping or placement input. A host whose collector predates the field shows its other automatic icon until it reports. Collector rollout order and rollback are in the [real integrations](../../deploy/real-integrations.md) notes.

## Repository logos

A repository resource may carry its own project logo on its label badge, in place of its automatic icon, after the owner has reviewed it. The owner either uploads the file, or names a file in the repository that is already reviewed for that resource (its `github-repository` source binding or canonical `https://github.com/owner/name` URL). The server reads that file from `api.github.com` at a resolved commit, using the private token file when one is configured. Inputs are recognised by their bytes (PNG, JPEG, WebP or a self-contained SVG) and rasterized to one 128×128 transparent PNG; no SVG is stored or served. Preview shows exactly that PNG and writes nothing. Approval resubmits the same source with the previewed digest and is refused if the result differs. Retiring hides the logo but keeps its image and source as history. An icon the owner explicitly chose on the device still takes precedence. Without an approved logo, or if the image cannot load, the badge keeps its resolved icon. Logos are presentation only: they do not establish ownership, deployment or health. Inheritance by related deployments or services is [OQ-038](../project/open-questions.md#oq-038-should-related-resources-inherit-an-approved-repository-logo). The [repository logos plan](../plans/observatory-repository-logos/PLAN.md) records the owner decisions and activation gate.

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
