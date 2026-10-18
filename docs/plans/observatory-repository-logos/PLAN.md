# Observatory repository logos

**Status: Proposed. The design decisions below were made by the owner on 2026-10-18; implementation and production activation are tracked in this record.**

## Goal

Each repository resource in the Gravity Observatory can carry its own project logo on its label badge. The examples the owner named are IU Labs, Lap Fitness, ResuPals and Aviune. A logo appears only after the owner has reviewed it. Without an approved logo the badge keeps its current presentation.

## Owner decisions (2026-10-18)

| Question | Decision |
| --- | --- |
| Icon base | The Observatory icon change that this builds on (`resource-icons.ts`, `ResourceGlyph`, vendored GitHub mark) was not on `main` or any remote branch. Build the storage, review, scene, MCP and documentation now. Add an isolated logo slot to the existing badges with fallback; when the icon change lands, its resolver uses an approved logo first. |
| Logo source | Both: an owner upload, and an owner-named file in the bound GitHub repository read through the GitHub API at a pinned commit. Repository import works only when a production GitHub token is configured; `resupals`, `aviune` and `iyulabs` are private. |
| Image format | Rasterize every accepted input server-side to one 128×128 transparent PNG. No SVG is ever stored or served. |

Defaults stated with the questions, not separately decided by the owner:

- Logos apply to `repository` resources only. Whether a deployment or service should inherit its repository's logo through a reviewed `deploys` relation is [OQ-038](../../project/open-questions.md#oq-038-should-related-resources-inherit-an-approved-repository-logo).
- An explicit owner icon choice for a resource, when the icon change provides one, takes precedence over the approved logo on that badge.

Rejected sources: the deployed site's favicon (fetching an arbitrary host is an SSRF surface, and favicons are often 16–32 px ICO files) and the GitHub social preview (usually a generated card, not a logo).

## Record and authority

One versioned `observatory_resource_logo` row per canonical resource:

- the processed PNG bytes, their SHA-256 digest, width, height and `active` state;
- the source: `upload` (original file name, sniffed original media type, original byte length and SHA-256) or `repository_file` (`owner/name`, path, commit SHA, blob SHA, original byte length and SHA-256);
- provenance: owner actor, recorded time and evidence references.

Retiring sets `active:false` and keeps the image and its source as history. Approving again needs a new upload or import.

| Owner operation | Risk and scope | Approval/capability | Canonical audit event |
| --- | --- | --- | --- |
| Logo preview (upload or repository file) | read only, with an owner-initiated server fetch to `api.github.com`; one resource | owner session; owner | `observatory.logo.preview` |
| Logo review (approve or retire) | reversible; one resource | owner submission; owner | `observatory.logo.review` |

The review uses the shared owner-review path: POST `/api/v1/infrastructure/observatory/reviews/logo`, an actual password-mode owner session, a matching trusted Origin, an expected version, evidence references and a note. Preview uses POST `/api/v1/infrastructure/observatory/logo-preview`.

The owner approves exactly what is stored. Preview returns the processed PNG and its digest without writing anything. The review resubmits the same source plus `expectedDigest`; the server processes it again and rejects a different result. Processing is deterministic for identical input. A repository review must name the commit SHA the preview resolved, so the content cannot move between preview and approval.

## Fetching and processing

- Upload: base64 in the review JSON. Input is limited to 512 KiB.
- Repository file: the repository identity must match the resource's reviewed `github-repository` source binding or its canonical `https://github.com/owner/name` external URL. The owner names the path; an optional ref defaults to the repository's default branch. The server resolves the ref to a commit SHA and reads the blob at that commit. It reads only from the fixed `https://api.github.com` origin, using the existing private token file (`OBSERVATORY_GITHUB_TOKEN_FILE`) when one is configured. Redirects are refused, there is a 10 s timeout and responses are capped. A missing or unauthorized token returns an explicit error and never falls back to another source.
- Accepted inputs are recognised by their bytes, not their names: PNG, JPEG, WebP and SVG. SVG is rejected if it declares a DOCTYPE or entity, or refers to anything except same-document fragments and embedded raster data. The rasterizer receives the buffer with no base path.
- Output: sharp converts the input to a 128×128 transparent PNG with `fit: contain` and metadata stripped. The input pixel count is limited. Animated input uses its first frame.

## Scene, image route and MCP parity

- Each scene representation whose canonical resource has an active approved logo carries `logo: {digest, mediaType: "image/png", width, height, version}`; references (aliases) carry their target's logo. Absence means no approved logo. The reviewed-logo versions and digests join `viewRevision`.
- POST `/api/v1/infrastructure/observatory/logo` (owner/local read) and MCP `get_observatory_resource_logo` (`observatory.read`) share one application read. It confirms the resource is inside the authorized population and returns the PNG as base64 with its digest.
- GET `/api/v1/infrastructure/observatory/logos/{resourceId}/{digest}` serves the same read as `image/png` with `nosniff`, a restrictive CSP and private immutable caching for badge `<img>` elements. Same-origin only; the browser never hotlinks an outside URL.
- `list_observatory_reviewed_configuration` and the owner catalogue gain `kind:"logo"` with versions, source and provenance, including retired records.
- Logo preview and review remain signed-in owner operations, consistent with the existing intentional MCP omission for canonical mutations.

## UI

- Stage labels and outline rows show the approved logo in a small badge before the label text, falling back to the current presentation when there is no logo or the image fails to load.
- The inspector for a repository resource gains a logo review section: current logo, version and source; upload or repository-path preview; approve with evidence and note; retire.

## Verification

- Unit: change/preview/catalogue/scene contracts, image sniffing and rasterization limits, SVG rejection, GitHub read adapter (pinned commit, redirect refusal, size cap, unauthorized), application digest-mismatch and repository-identity checks, domain logo projection, UI badge fallback and review controls.
- PostgreSQL: review versioning, retire, audit success/denial, owner-session hold, catalogue/scene projection, scoped image read.
- `pnpm check` and `pnpm test`.

## Production activation gate

The feature is not live until a reviewed release is deployed through the constrained deployment workflow, migration `0074` is applied, and the owner has approved logos in the live inspector. Repository import in production additionally needs a configured GitHub token with contents read access to the private repositories. Owner approval cannot be supplied by an agent.
