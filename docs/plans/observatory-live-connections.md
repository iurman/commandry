# Observatory live connections

**Status: Operational discovery and implementation in progress.**

**Owner request:** October 18, 2026. Connect actual infrastructure checks,
source-backed visual activity, and Cloudflare domains/Workers and domain renewals.

## Verified starting point

Production revision `33d0086` has 93 canonical resources, four host collectors,
one Commandry readiness check and the public Cloudflare status poller. The scene
reports one monitored and 12 unmonitored eligible services. The connected MCP
credential advertises only four knowledge tools; it cannot configure monitoring.
Owner-authenticated API operations retain their own authority and audit.

The Commandry public repository source was staged disabled and enabled after
version readback through the owner source-review API. Source identity and audit
receipts are retained in the completion evidence below.

The saved Cloudflare token exposes the Commandry DNS zone and one Tunnel, but
does not establish account-wide completeness. Pages and Registrar reads return 403. Signed-in discovery is complete for the single owner-approved Cloudflare account only; all other accounts are excluded. Registry RDAP identifies
Namecheap as the registrar for commandry.site, with expiration on September 15, 2027. Registry expiration is not a billing date or proof of auto-renewal.

## Native endpoint checks

Extend the existing leased operational-source pipeline with `endpoint-check`.
An operator-controlled private startup file supplies exact check IDs, canonical
resource IDs, environment, HTTP URL/accepted status codes or TCP host/port, and
vantage description. Owner source review selects only a check ID. It cannot
supply a URL, credential, command or network destination. Each read must match
the configured resource and environment. HTTP uses no credentials, refuses
redirect following, retains TLS verification, and discards response bodies.
TCP establishes only port reachability. Timed-out probes are actual failures;
missing configuration and invalid evidence remain source errors.

The common availability contract exposes check type and vantage. UI/API and
separately granted MCP share the same records and evidence. Source review is
sensitive, owner-only, versioned and audited as `observatory.source.review`;
read-only checks run under the configured worker and append
`observatory.source.observed`. No SSH runner or new monitoring platform is added.

## Activation and verification

1. Verify first repository observations and independently qualify scanner access.
2. Update existing host collector scripts only after confirming the deployed
   receiver accepts OS identity. Preserve timers, tokens and existing workloads.
3. Test endpoint validation, wrong-resource/environment rejection, HTTP status,
   TCP refusal/timeout, cancellation, safe errors and immutable persistence.
4. Pass normal repository and release gates before native-check production
   activation. Inventory the existing VPS and retain constrained deployment,
   backup/restore and rollback controls. Do not replace another chat's rollout.
5. Discover all authorized Cloudflare account continuations and Namecheap domain
   inventory after owner sign-in. Preserve separate registrar, DNS, deployment,
   renewal, expiration, auto-renewal and permission/freshness facts. Never
   interpret an inaccessible account as empty or purchase/renew a domain.
6. Verify actual new observations in the owner scene and inspector. Existing
   persisted host/repository events may pulse; static dependencies never imply
   measured application-to-application traffic.

## Completion evidence

- Repository source: `0d8871d0-a784-4169-b615-ff55b1fa5fe1`, enabled version 2.
- Staging audit: `9a322bc5-981d-46b9-adf1-a121ed0637d3`.
- Activation audit: `e4ce6ac4-a8f4-4b85-999c-a1d9faa04a08`.
- Production inventory now contains 134 resources. All original 93 IDs and parent
  mappings were verified unchanged. Added: one registrar provider, 19 registrations,
  17 distinct Cloudflare DNS zones and four Workers. The dated browser capture
  and filed note remain in private Commandry knowledge, not in Git.
- Four collector timers successfully delivered OS identity after the compatible
  production receiver was verified. Electra, Pleiades, Maia and Titan reported
  actual Linux OS identity; Pleiades additionally reported Proxmox VE. Before/after
  hashes, workload preservation and rollback copies are retained privately.
- Prepared 14 exact HTTP/TCP probes against existing project/resource bindings.
  Production-worker preflights verified nine accepted HTTP 200 responses and one
  actual HTTP 502 response, plus four accepted TCP connections. These are one-shot
  preflights, not recurring production observations. Unmapped Docker, worker and
  Tunnel services remain unknown rather than acquiring invented checks.
- The new native-check, account readers, canonical reconciliation, inventory
  inspector and new-observation pulses are implemented locally. Inventory has
  the separate `observatory.inventory.read` capability; existing public-status
  grants remain unchanged. See [endpoint setup](../../deploy/endpoint-checks.md),
  [provider setup](../../deploy/provider-inventory.md) and
  [agent workflow](../architecture/observatory-agent-workflow.md).

## Remaining activation gates

- The prepared Cloudflare token review has not been submitted. Creating persistent
  read access requires the pending action-time account-access confirmation.
- Namecheap API access is currently off. Enabling it and restricting its allowed
  IPv4 require the pending account-access decision. Its vendor key is broader
  than the fixed read-only command used by the connector. No API key exists yet.
- Release checks, exact-image review, constrained deployment, source review and
  two successful scheduled reads must precede any claim that the new adapters
  operate in production. The prepared private endpoint catalogue is outside Git.
- Actual measured communication is limited to recorded checks and provider/host
  events. Dependency edges do not prove application-to-application traffic.
- The original A-F workflow and all 58 acceptance scenarios remain in the
  [existing ledger](observatory-operational-landscape/COVERAGE.md). This follow-up
  does not close its physical-device or owner-interpretation limits.

## Verification checkpoint

- Production build passed for web and the separate worker.
- Focused PostgreSQL 18 tests passed native HTTP failure/recovery and both provider
  inventories, including canonical adoption, repeated reads and preserved owner names.
- Scoped access integration tests passed project/resource isolation, separate grants,
  expiry/revocation and audit rollback.
- Populated 0067-to-0075 upgrade and repeat passed with 91 original resources, 16
  metric rows and the unchanged legacy machine grant; runtime DDL was denied.
- Provider inspector tests retain all 137 fixture registrations, date precision,
  auto-renew flags and inaccessible-section disclosure. These are synthetic local
  checks, not real provider access.
- Browser read verified the live 134-resource scene, Namecheap group with 20 unique
  resources and Cloudflare group with 22. New reader/pulse UI remains undeployed
  and needs browser verification after activation.
- First activation must retain a compatible 0075-or-later rollback image: old
  binaries cannot validate the new source-kind records. Normal initial deployment
  rollback gates precede source creation. No historical records are deleted.

- Full `pnpm check` passed: formatting, lint (existing warnings), types, package
  boundaries, generated OpenAPI and lab boundaries.
- Full `pnpm test` passed: 3,129 main tests, 33 lab tests, 114 deployment/crypto/
  collector helpers, 11 registry tests and both four-test preview suites.
- Production Compose template validation passed; placeholder configuration is not
  a deployment approval.
- Prepared private catalogue SHA-256:
  `decd4a1faf4775c3b01bac53e9fcfae0260dd8576af173500c1c1edf00f81b9d`.
  Reusable evidence and the private catalogue are retained outside the repository
  under the owner's Commandry evidence directory.

- Synced the feature branch to main `0caf176`, retaining ADR 0017 and the pointer
  Stop fix. All 95 operational layout tests passed after the sync, and the web/
  worker production build passed again.
- The initial built-app smoke caught a missing direct XML-parser dependency in
  the externalized worker bundle. Adding the pinned parser to worker runtime
  dependencies fixed it. The repeated built web/worker, real-host API, Knowledge
  MCP, Foundation MCP and owner-authentication smoke rehearsals passed.
- Fourteen disabled source-review payloads and their catalogue passed the exact
  contracts locally. They remain private and unsubmitted until release activation.
- A separate main presentation release was already in progress during this work;
  this follow-up did not interrupt its release workflow or change deployment controls.
