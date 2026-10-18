# Provider account inventory

**Status: Implemented locally. Recurring production access and release activation remain pending.**

These optional readers extend the existing leased Observatory source worker.
They use fixed official read endpoints, validate account identity, preserve
encrypted originals, and project complete supported inventory into canonical
resources. They never renew domains, change DNS, publish deployments or infer
availability from inventory. Native uptime checks are configured separately in
[endpoint checks](endpoint-checks.md).

## Cloudflare

Set `OBSERVATORY_CLOUDFLARE_ACCOUNT_ID` to the explicitly approved account ID and
`OBSERVATORY_CLOUDFLARE_TOKEN_FILE` to an absolute private token file. Both are
required together. The fixed reads cover zones filtered to that account, Workers
script metadata, Pages projects, undeleted Tunnels and Registrar domains. All
paginated sections follow continuation to completion. Workers script metadata
uses its unpaginated list endpoint; no script content, bindings or secrets are read.

The reviewed token needs these read permissions on that account only: Workers
Metadata Read-Only, Pages Read, Registrar Domains Read and Cloudflare Tunnel Read;
Zone Read and DNS Read are scoped to zones within that same account. The current
implementation lists zone metadata rather than individual DNS records. DNS Read
does not imply that record inventory is already implemented. R2, D1, KV, billing,
analytics and certificates are also outside this supported inventory.

Permission failures remain `inaccessible` sections, never complete empty lists.
Transport, invalid pagination or account mismatch remain unavailable sections.
A partial read can retain independently complete sections; a wholly failed read
fails the source and retains prior evidence with its original time. All requests
use normal TLS, reject redirects, and have bounded time and response size.

## Namecheap

Set `OBSERVATORY_NAMECHEAP_USERNAME`, `OBSERVATORY_NAMECHEAP_KEY_FILE` and
`OBSERVATORY_NAMECHEAP_CLIENT_IP` together. The configured IPv4 must be allowed in
the owner's Namecheap API settings. API activation is a separate account-access
decision. A Namecheap API key has broader vendor authority than this reader uses;
keep it private. The reader only issues `namecheap.domains.getList` to the official
production XML endpoint, following every page. It cannot choose a write command.

Strict XML parsing rejects DTDs, unexpected response commands, malformed domains,
duplicate identities and inconsistent page populations. Expiration is the exact
provider date, not an invented midnight instant. Auto-renew is the reported flag,
not proof of sufficient funds, an upcoming invoice or successful renewal. No
payment, renewal, registration, contact or DNS action is implemented.

## Installation and review

Deploy migration 0075 and the exact reviewed application image through the
existing constrained release and recovery gates. Secrets remain outside Git.
Each token/key file must be a regular, non-symlink ASCII file, at most 4096 bytes,
with mode 0400 or 0600. Its owner must allow the existing container worker UID
1000 to read it, for example UID 1000 with mode 0400 under an operator-owned
private host directory. Compose mounts only each exact file read-only and refuses
to create a missing configured path. Startup reload is required after rotation.
Absent optional settings leave that reader unconstructed; partially configured
settings fail closed rather than using another account or public fallback.

Create an explicit provider resource and active project/resource link. Stage a
disabled `cloudflare-account` or `namecheap-account` source with the exact configured
account identity, canonical provider/project/environment and actual evidence
references. Read back the source version and explicitly enable its next version.
Owner review is sensitive, owner-only and audited as `observatory.source.review`.

Check the provider inspector's inventory facet and the same owner API read. Verify
complete pagination, section access qualifiers, original observation times and
a second independently scheduled observation before claiming recurring operation.
Successful reads append `observatory.source.observed`; inventory reconciliation
and `observatory.inventory.reconciled` occur in that same leased transaction.
Canonical identity mappings prevent duplicate resources on later reads. A unique
matching kind/external URL adopts an existing resource; ambiguous matches fail
for reconciliation. Existing parent mappings and owner-renamed fields remain.
Missing inventory is never deleted and does not become a health incident.

## Agent access and rollback

Machine reads require `observatory.read` plus a separately issued
`observatory.inventory.read` capability on the authorized provider resource and
project. The explicit grant exposes that configured account's supported inventory.
It grants no provider writes or operational access to child resources. Existing
`observatory.providers.read` grants continue to expose public status only. The
read policy is read-only, automatic with the grant, audited as
`observatory.inventory.read`, and uses the same safe application DTO as the UI.
Raw originals, credential files and source configuration remain excluded.

Disable the exact versioned source to stop future reads without erasing history.
Remove startup configuration through the controlled rollout if needed. Revoke a
provider credential through the provider only with authorization. A code rollback
does not reverse migrations or remove canonical inventory already observed.

References: [Cloudflare metadata list](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/),
[Namecheap API access](https://www.namecheap.com/support/api/intro/) and
[domain list fields and pagination](https://www.namecheap.com/support/api/methods/domains/get-list/).

The first release's automatic rollback gates run before any new-kind source is
created. After native or account sources have been created, a pre-0075 application
cannot validate those new source-kind records even when disabled. Keep a compatible
0075-or-later image as the rollback target, or roll forward with a reviewed fix.
Do not delete observations or manufacture a down migration to make an older binary
accept them. The populated upgrade rehearsal verifies data preservation and repeated
migration, not old-binary reads of newly activated source kinds.
