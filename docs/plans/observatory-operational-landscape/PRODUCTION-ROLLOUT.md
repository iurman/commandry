# Production Gravity Observatory rollout

**Status: Operational. The approved release and initial Commandry monitoring are live. Five acceptance limits remain explicit.**

Verified on 2026-10-17 UTC. Open the [live Observatory](https://commandry.site/infrastructure). [Structured rollout evidence](evidence/2026-10-17-production-rollout.json) records the exact release and the limits of each observation.

## Deployed and verified

The existing constrained deployment completed at 22:12:43 UTC with exit 0 for revision `885b356876a94adfae5c2c5c5c743c3cb866845b` and image `ghcr.io/iurman/commandry@sha256:605e90004c9f596dc990faa611d4e9d189275f9bc83996df2ca5cf5bb6d4c80c`. Genuine protected approval matched the exact release and remained unexpired. The existing fresh backup, isolated restore/recovery, migration, health, real owner login, authenticated read, worker completion and session-revocation gates passed. Public `/version` identifies that exact image; `/health/ready` returned HTTP 200. Both web and worker use the approved image. PostgreSQL, Caddy, Tunnel and the unrelated Ephemera database retain their container identities.

An independent review accepted the retained release receipts and their source-backed interpretation. It did not independently replay production actions. No deployment gate was relaxed, no new grant or credential was created, and no ad hoc production SQL or DNS change was used.

## Initial operational configuration

All original 91 canonical resources, their parents and the seven original Commandry project links are preserved. Exactly two missing resources were added: the stable logical **Commandry production** deployment and **Cloudflare** provider. Both have active resource-supports-project links. Complete canonical reads now return 93 resources and nine project links with no continuation remaining.

Three active production relations were reviewed and read back at version 1: repository deploys deployment, deployment executes on Electra, and deployment provides the existing web service. The scene renders shared references to the existing repository and service, preserving their canonical IDs.

The web service has a reviewed Cloudflare **Tunnel** dependency, stable component `y98zlwj1d7zh`, for the production data plane. Geography remains unknown. The signed-in provider configuration was refreshed and still publishes `commandry.site` to `http://caddy:80`. Provider notices with unknown scope do not establish local impact or causation.

Native readiness source `fb7cf023-19a1-446b-beca-3a4c710b7bee` was staged disabled at version 1, then enabled at version 2 with its exact Commandry project binding, external ID `commandry-web-readiness`, production environment and 300-second freshness. The normal worker recorded **up / HTTP 200 / passing** at 22:22:47.176 UTC, duration 56.709 ms. The selected web service showed one of one eligible checks observed and fresh source evidence. This is a direct web/database readiness observation, not complete external availability or uptime history. Other eligible services remain explicitly unmonitored.

No InfraAgent account or monitor was configured. InfraAgent remains design prior art, and InfraAgent/CRM/Arvo repositories remain inventory only. The operational GitHub pull-request/security reader is unconfigured; existing legacy repository activity is separate. [Ephemera and ResuPals discovery](PROVIDER-DISCOVERY.md) remains available without inventing operational mappings or changing DNS.

## Verification and remaining limits

The [full main release](T43-RELEASE.md) passed all 202 executed browser cases, retaining the five original skips across 207 original identities, with zero failures, flaky results or retries. Later owner/rehearsal/provenance/security/publication gates passed. The scan reported 43 high findings with no reported fix, zero critical, zero fixable high/critical and zero secrets; this is not a vulnerability-free claim.

The actual signed-in live dark view was inspected at the default browser viewport. The Commandry project scope contained all nine linked resources, and operational grouping exposed the recorded relationships. A live screenshot was displayed, but browser URL security blocked its attempted local download. No workaround was attempted. The saved [4K](evidence/2026-10-17-ci-release-4k.png), [desktop](evidence/2026-10-17-ci-release-desktop.png) and [phone-project](evidence/2026-10-17-ci-release-phone-390.png) images remain actual hosted synthetic test captures, not live production screenshots.

The [58-scenario ledger](COVERAGE.md) retains 53 source-qualified local passes and five partial/unrun clauses: B05 incident snooze/OQ037, E07 genuine document-hidden behavior, F04 physical mobile keyboard/safe area, F06 owner interpretation, and G06 physical lower-power hardware. Production activation does not turn those into passes. No additional physical-device claim is made.

[Agent workflow documentation](../../architecture/observatory-agent-workflow.md) ships with the feature and uses the canonical application services. The existing project-scoped connector successfully read the Commandry project, brief and knowledge search, but advertises four legacy knowledge tools. Live operational MCP access under that credential remains unverified; no grant was expanded. The owner UI exposes actual review IDs, versions, actor/time and evidence references, but does not display the audit UUID or independent audit history.

## Retained execution boundaries

An initial SSH transport stopped before authentication on a missing existing host-key alias. A later deployment reached application smoke with no owner credential stdin, failed closed and restored the previous application code; the discarded internal error remains unknown and schema migrations were not reversed. A terminal helper then failed before its prompt because its path check rejected Bazzite's system `/home` symlink. Existing saved credentials were located and supplied privately to the corrected constrained invocation. No further owner command or password entry was needed.

Earlier failed CI runs, failed deployment evidence and historical unapproved candidate snapshots remain historical failures or snapshots. This completed rollout supersedes their pending-current-state wording without rewriting those observations. The temporary credential stdin copy was removed after success; its original private credential store and the owner-requested local preview remain available.
