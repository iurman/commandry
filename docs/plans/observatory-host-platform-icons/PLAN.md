# Observatory host platform icons and cross-device icon choices

**Status: Operational record. The owner released the planning hold on 2026-10-18 and asked for implementation through merge. The implementation is merged but not deployed, and no collector has been updated on a host.**

## Goal

Gravity host badges should show the host operating system or platform automatically (Debian, Ubuntu, Fedora, Proxmox VE and similar), as a server glyph carrying the distribution logo. Owner icon choices should follow the owner across devices, including the TV wallboard.

## Baseline

The first draft of this plan (2026-10-18, against `9937991`) found that the Observatory icon layer had not landed. By the time the owner released the hold, `main` (`da44fcb`) carried:

- the icon layer: `resource-icons.ts`, `brand-icons.ts` with vendored Simple Icons, the device-local `ObservatoryPresentation.icons` and the shared `ObservatoryResourceMark` badge;
- owner-reviewed [repository logos](../observatory-repository-logos/PLAN.md), with the badge order "explicit choice, then approved logo, then automatic icon".

What was still missing: structured OS data from the Linux host collector, a scene field to carry it, and a way for icon choices to leave the device. Account views (`observatoryViewConfigurationSchema`, `schemaVersion: 2`) carried colours but not icons.

## Owner decisions

| Question | Decision |
| --- | --- |
| Where cross-device icon choices live (2026-10-18) | An optional `icons` map in the account view configuration, not a canonical annotation. It reuses the owner-only view policies and audits. Icons are presentation, not canonical fact, so agents do not read the choices. |
| Badge order (agreed with the logo work) | 1. explicit icon choice; 2. the approved logo for repositories, or the detected OS for hosts; 3. name hints; 4. kind glyph. |

Defaults chosen during implementation, not separately decided by the owner:

- **Older views.** `icons` is optional, with no default. A view saved before the field existed leaves the applying device's choices unchanged, instead of wiping them. A view saved now always carries its exact map, which may be empty.
- **Distribution derivatives.** A distribution without a vendored logo uses its closest `ID_LIKE` family that has one, for example Kali shows Debian and Rocky shows CentOS. With no match it shows the generic Linux mark. The inspector always names the exact `PRETTY_NAME`.
- **Server glyph.** A host badge showing any technology (OS, name hint or owner choice) keeps a small server glyph on its lower edge. Compact nested labels omit it.

## Design

### Collector and contract

- Both collectors (`scripts/linux-host-collector.py` and `.mjs`) add an optional `os: {id, idLike, prettyName, platform}`.
  - They parse os-release with its shell quoting rules: `/etc/os-release`, else `/usr/lib/os-release`.
  - Proxmox VE is detected from `/usr/bin/pveversion` (a file) or `/etc/pve` (a directory), without running a command.
  - Values are clamped to the contract: an invalid `ID` becomes `linux`; `ID_LIKE` is filtered, de-duplicated and capped at 8; `PRETTY_NAME` drops control characters, stops at 200 UTF-16 units and falls back to `Linux`.
  - An unreadable os-release omits `os`, so capacity telemetry never stops for it.
- `linuxHostOsSchema` in `packages/contracts/src/real-integrations.ts` validates the identity strictly, and `linuxHostSampleSchema.os` is optional.
  - The server checks `prettyName` only for length and control characters. Python and JavaScript trim different whitespace, and a trim rule could reject a valid sample.

### Storage and scene

- **Storage.** There is no new table. The receiver already keeps the exact original sample in its source envelope. `collectObservatoryRecords` derives one platform per host from the same latest validated sample that supplies `host_memory_total`, with the same envelope as `evidenceRef`.
- **Scene.** `platformObservations: [{resourceId, osId, osIdLike, prettyName, platform, observedAt, evidenceRef}]`.
  - The application read includes it only with `observatory.signals.read`, inside the authorized population, validated and unique per resource.
  - The domain projection includes it only while the resource's telemetry facet is available.
  - The scene superRefine rejects foreign or duplicate subjects. It does not change `projectionRevision`.
- **MCP.** `get_observatory_scene` returns the same field through the shared read service. OpenAPI is regenerated.

### UI

- `platformIconId` maps Proxmox VE first, then the exact `ID`, then `ID_LIKE` families, else `linux`. `defaultResourceIconId` applies it to hosts before name hints. An explicit choice still wins through `resolveResourceIcon`.
- The inspector shows the reported operating system and its observation time. Telemetry evidence lists the platform observation with its envelope link. The picker's automatic option says when it comes from the reported operating system.
- The account view save path stores `observatoryViewIcons(preferences.icons)`: canonical resource IDs naming a known icon, sorted, at most 1000. Apply uses `appliedObservatoryIcons`, which keeps device choices for older views and drops icon keys this client does not vendor. The contract accepts UUID keys and icon keys matching `^[a-z0-9][a-z0-9-]{0,39}$`.

### Authority

| Operation | Risk and scope | Approval/capability | Audit |
| --- | --- | --- | --- |
| Host sample with `os` | existing token-scoped receive; one host integration | host receiver token | existing `integration.real_observation_imported` |
| Scene platform read | read only; authorized population, telemetry facet | `observatory.read` + `observatory.signals.read` (MCP) or owner session | existing scene read audit |
| Account view create/update carrying `icons` | reversible; owner, optional project | owner session; owner | existing `observatory.view.create`, `observatory.view.update` |

No new action capability is introduced. Icon choices stay outside MCP, like the rest of the private view. The [agent workflow](../../architecture/observatory-agent-workflow.md) records that omission and its reason.

## Implementation record (2026-10-18)

| Layer | Where |
| --- | --- |
| Collectors | `scripts/linux-host-collector.py`, `scripts/linux-host-collector.mjs`, with tests in `scripts/linux-host-collector_test.py` and `scripts/linux-host-collector.test.mjs` |
| Contracts | `linuxHostOsSchema`, optional `linuxHostSampleSchema.os`; `observatoryPlatformObservationSchema` and `platformObservations` on the scene; optional `icons` on `observatoryViewConfigurationSchema`; regenerated OpenAPI with scene and receiver descriptions |
| Domain | `ObservatoryPlatformObservation`, `platforms` input, telemetry-gated `platformObservations` projection |
| Application | `platforms` validation and the signals grant in the authorized read |
| Persistence | `collectObservatoryRecords` derives platforms from the latest validated host sample |
| MCP | `get_observatory_scene` description; parity test in `apps/web/lib/observatory-mcp.test.ts` |
| UI | `platformIconId` and the host precedence in `resource-icons.ts`; the server glyph in `ObservatoryResourceMark`; the inspector OS row, telemetry evidence and picker hint in `OperationalObservatory.tsx`; `normalizeObservatoryIcons`, `observatoryViewIcons` and `appliedObservatoryIcons` in `observatory-preferences.ts` |
| Fixtures | Operational fixture and synthetic preview seed a Proxmox VE host and an Ubuntu host |

## Verification

The verification results are recorded in the pull request. They cover:

- the Python and Node collector suites;
- live runs of both collectors on an Ubuntu container, which produced identical `os` output;
- the contract, domain, application, UI and MCP vitest suites;
- PostgreSQL 18 integration tests for Observatory access isolation, named views, real integrations and the infrastructure overview, including a real receive of a sample with `os` through the authorized scene and project isolation of the platform;
- `pnpm check` and `pnpm test`.

Not verified: a browser screenshot of the new badges, physical TV or phone rendering, and any production read.

## Production activation gate

Hosts will show their OS only after both steps below, in this order. The [real integrations notes](../../../deploy/real-integrations.md#operating-system-identity-rollout) give the full procedure.

1. A reviewed release that accepts `os` is deployed through the constrained deployment workflow.
2. The collector script is replaced on Electra (Node) and on Pleiades, Maia and Titan (Python). The units, timers, environment files and tokens stay unchanged. Then one sample per host is verified.

The current receiver rejects unknown sample keys, so updating a collector first would make that host's telemetry go stale. The cloud session that implemented this had no SSH or Tailscale access to the hosts. The rollout needs a session with host access, such as Kronos.
