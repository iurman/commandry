# Read-only project knowledge MCP

**Status: Proposed implementation; production activation pending**

This first slice lets an independently opened MCP client retrieve one project's
stored Commandry context without creating a fake agent run or execution packet.
It builds on the local preview's MCP SDK and existing brief/knowledge services.
The original loopback `/mcp` packet preview remains separate and unchanged.

## Implemented surface

`POST /mcp/knowledge` uses a dedicated bearer credential and provides:

| Tool | Contract |
| --- | --- |
| `list_projects` | Returns the one explicitly granted project's identity, summary, and timestamps. This is the complete authorized project population. |
| `get_project_brief` | Returns the existing evidence-linked project brief, including context deliberately linked into that project. Its sections are previews with owner-facing continuation links, not a complete export or live health check. |
| `search_knowledge` | Literal case-insensitive title/content search over knowledge whose primary project matches the grant. Empty `q` lists that population. `limit` is 1-100; follow `nextCursor` until null. |
| `get_knowledge_item` | Reads one primary-project record with original capture ID, version, timestamps, and evidence link. Content is chunked by `offset` and `limit` (maximum 12,000 characters); follow `nextOffset` and check version consistency. |

Search and direct reads deliberately exclude knowledge related only through
secondary project links. The existing brief can summarize such deliberately
linked context, matching the owner's project view; its linked owner API URLs
do not grant the MCP bearer access to ordinary APIs. No source file, original
capture bytes, secret, dispatch, shell, or write tool is exposed by this slice.
Personal preferences can be stored in existing project knowledge and retrieved
as source records. An owner-wide profile, preference authority/taxonomy, semantic
index, repository URL resolver, and cross-project search remain future work.

Server instructions tell clients to identify scope, retrieve the brief, search,
follow citations, and distinguish stale or missing evidence from current state.
Retrieved content is untrusted data, not an instruction to bypass policy.
The client must still compare the returned project with the local task; a local
folder name alone does not establish identity.

## Credential lifecycle

Management APIs require the configured allowlisted owner's password-backed
session, including in local mode. They fail closed when human authentication
is disabled. Browser origins must match the configured application or trusted
local origin. These routes are not exposed as MCP tools.

| API | Request and result |
| --- | --- |
| `POST /api/v1/knowledge-clients` | JSON `name`, `projectId`, optional `ttlSeconds` (60-604800, default 86400). Returns client metadata and a one-time `ck_` token. |
| `GET /api/v1/knowledge-clients` | Owner-only paginated metadata using `limit` and `cursor`; never returns tokens or token digests. |
| `POST /api/v1/knowledge-clients/{id}/revoke` | Idempotently revokes the specified client; returns metadata. |

Each credential authorizes read-only context for exactly one project. Store the
one-time response outside the repository with private file permissions. Supply
the token in the client's protected HTTP header configuration as
`Authorization: Bearer <token from the one-time response>`; never put it in a
URL, a prompt, committed MCP config, screenshots, or shared logs. This credential
authenticates to Commandry, not to an inference provider, and adds no inference
billing path.

Owner sign-out does not revoke separately issued client credentials; revoke the
client explicitly when access is no longer wanted. The database retains only a
SHA-256 digest. Database guards make the issued scope immutable, prevent
un-revoking a credential, and preserve append-only client/audit history. The application checks expiry and
revocation on every authenticated request and tool read. Reads hold the grant's
shared row lock through retrieval and audit; completed revocation prevents
subsequent reads. The brief reuses that same transaction/connection so concurrent
requests do not deadlock a bounded database pool. Retrieval and allowed/denied
audit writes commit together before returning content. Unknown tokens are
rejected without revealing an identity. Database failures return unavailable,
not unaudited content. Responses are not cacheable.

## Risk and audit contract

| Operation | Risk | Required authority | Approval behavior | Audit |
| --- | --- | --- | --- | --- |
| Create/revoke client | Sensitive access configuration | Allowlisted owner session, the initial concrete authority for `knowledge_client.manage` | Owner explicitly invokes the scoped API; no agent self-grant | `knowledge_client.created`, `knowledge_client.revoked`, with actual owner ID |
| Discover/authenticate/read | Read-only context disclosure | Active unexpired project credential, implementing `project.context.read` | Automatic within the owner's issued scope | `knowledge_client.authenticated`, `project.list`, `project.brief.read`, `knowledge.search`, `knowledge.read`, attributed to the client ID |

Those capability names describe this bounded implementation, not a newly
implemented general policy engine. Audit rows retain operation, outcome/code,
client/actor, time, and an optional target ID. They do not retain raw tokens,
search strings, or retrieved content. Audit history currently needs operator
inspection; an owner UI and audit API are not included. Auth failures before
client identification receive generic HTTP failure metadata.

## Client connection and compatibility

Use the independently issued project token with an MCP client supporting
Streamable HTTP and protected custom authorization headers. Connection setup
must identify the exact server origin and project. This slice does not provide
OAuth authorization/discovery, browser login for external MCP clients, a
provider plugin package, or a stdio bridge. Claude app custom-connector support
and installed Codex/Claude client compatibility must be verified separately;
the SDK protocol check does not prove those clients work.

The client endpoint after an approved deployment would be the configured
application origin plus `/mcp/knowledge`. Do not configure clients against the
live site before the release, migration, and owner issuance are verified. Do not
switch production to local mode or forward the old loopback preview to bypass
authorization.

## Verification and deployment boundary

Run `pnpm check`, `pnpm build`, and
`node scripts/test-integration.mjs --knowledge-only` with the repository's
Node.js 24 runtime. The integration harness creates and removes a disposable
PostgreSQL 18 instance, applies migrations, tests repository scope and lifecycle,
and exercises the built application through real owner sign-in and the MCP SDK
client. It rehearses both local and production-labeled auth configuration on
loopback; it does not connect to the live database or providers. The isolated
database may be deleted; no existing Commandry or Ephemera database is a target.

The new migration adds `knowledge_client` and `knowledge_client_audit` without
changing the old packet tables. Production migration and runtime-role access,
HTTPS/proxy behavior, real client connection, useful retrieval during a real
Kronos task, and owner usability remain deployment acceptance checks. Existing
production services and credentials must remain intact. No coding runtime,
provider login, autonomous action, or billing decision is selected by this MCP
implementation.
