# Observatory host platform icons and cross-device icon choices

**Status: Proposed. Owner hold is active: implementation waits for a separate Observatory icon-layer change.**

**Prepared:** 2026-10-18 against `main` at `9937991`. This plan does not authorize implementation, collector rollout or deployment. Resume only after the owner releases the hold.

## Goal

Gravity host badges should show the host operating system or platform automatically (Debian, Ubuntu, Fedora, Proxmox VE and similar), ideally as a server glyph carrying the distribution logo. Owner icon choices should follow the owner across devices, including the TV wallboard.

## Verified baseline

- The icon layer this work builds on has not landed. `main` and every remote branch lack `packages/ui/src/gravity/resource-icons.ts`, `packages/ui/src/gravity/brand-icons.ts` and `ObservatoryPresentation.icons`. The owner reports that a separate icon change is in progress. Steps 2 and 3 depend on it.
- [`scripts/linux-host-collector.py`](../../../scripts/linux-host-collector.py) and [`.mjs`](../../../scripts/linux-host-collector.mjs) report only hostname, memory, disk, uptime and load. Electra runs the Node collector. Pleiades, Maia (`iu-amp`) and Titan (`iu-ionos`) run the Python collector; see [real integrations](../../../deploy/real-integrations.md).
- `linuxHostSampleSchema` in [`packages/contracts/src/real-integrations.ts`](../../../packages/contracts/src/real-integrations.ts) is a `strictObject`. The current production receiver will reject any sample that carries a new key.
- The receiver keeps the exact original sample in the source envelope. [`collectObservatoryRecords`](../../../packages/db/src/observatory-records.ts) already re-parses each resource's latest valid host sample to derive `host_memory_total` with `sampledAt` and an `evidenceHref`. A platform observation can use the same path, so it needs no new table.
- The scene (`observatorySceneSchema`, `schemaVersion: 1`) carries `capacityObservations` gated by `observatory.signals.read` and per-resource facet access. It has no OS or software field. `resource.subtype` is free text and is not in the scene.
- Account named views store `configuration` as `jsonb` in `observatory_named_view`. `observatoryViewConfigurationSchema` (`schemaVersion: 2`) already carries a per-resource `palette` colour map. Owner-only create/update policies and the audit events `observatory.view.create` and `observatory.view.update` are already declared in `OBSERVATORY_VIEW_POLICIES`.

## Owner decision

**Recorded 2026-10-18:** owner icon choices will be stored as an optional `icons` map in the account view configuration, not as a canonical annotation. Icons will travel with a saved view the same way `palette` colours do. They apply on another device once that view is applied there, and later changes need a re-apply. Agents will not see icon choices; they are presentation, not canonical fact.

## Step 1: platform observation (independent of the icon layer)

1. **Collectors.** Both collectors should add an optional object:
   `os: { id, idLike: string[], prettyName, platform: "proxmox-ve" | null }`.
   - Parse `/etc/os-release`, falling back to `/usr/lib/os-release`, using the shell-style quoting rules. Lowercase `ID`; split `ID_LIKE` on whitespace; bound lengths.
   - Detect Proxmox VE with file checks only, such as `/usr/bin/pveversion` or `/etc/pve`. Do not run a subprocess. Proxmox reports `ID=debian`, so `platform` disambiguates it.
   - A missing or unreadable `os-release` should omit `os`, not fail the sample. Capacity telemetry must keep flowing.
2. **Contract.** Add `os` as an optional strict sub-object of `linuxHostSampleSchema`: `id` matching `^[a-z0-9._-]{1,64}$`, at most eight bounded `idLike` entries, `prettyName` at most 200 characters, `platform` from a closed enum. It stays an observation, never a role or free-text classification.
3. **Scene.** Add `platformObservations: [{ resourceId, osId, osIdLike, prettyName, platform, observedAt, evidenceRef }]`. It should be built from the same latest validated sample as `host_memory_total`, gated like `sourceObservations` (`observatory.signals.read` plus `telemetry` facet access), and included in the scene superRefine foreign-subject checks. Regenerate OpenAPI (`pnpm --filter @commandry/contracts check:generated`). The UI and MCP `get_observatory_scene` will share the field.
4. **Docs.** Update [`observatory-agent-workflow.md`](../../architecture/observatory-agent-workflow.md), [`gravity-observatory.md`](../../features/gravity-observatory.md) and [real integrations](../../../deploy/real-integrations.md), including the rollout order below.

## Step 2: default host icons (after the icon layer lands)

Icon resolution order: the owner's explicit choice, then the platform observation (Proxmox VE first, then `osId`, then the first known `osIdLike`), then the existing kind and name hints. The badge should compose the server glyph with the distribution logo from the vendored Simple Icons set. Unknown distributions fall back to a generic Linux or server glyph. Tests should cover precedence and unknown IDs.

## Step 3: cross-device icon choices (after the icon layer lands)

- Add `icons: z.record(resourceId, iconKey).default({})` to `observatoryViewConfigurationSchema`. Use the icon layer's closed key set and reject unsafe keys. Existing stored v2 rows and older payloads stay valid through the default, so no migration is needed.
- Map `ObservatoryPresentation.icons` both ways in the canonical-view save/apply path in `OperationalObservatory.tsx`, beside `palette` and `colors`.
- Named views stay owner-only with no MCP write. Record that intentional exclusion and its reason in the agent workflow doc, per AGENTS.md.

## Rollout order

1. Deploy the server release that accepts the optional `os` field first, through the existing constrained deployment gates.
2. Only then update collectors on Electra (Node) and Pleiades, Maia and Titan (Python). A collector that sends `os` to the current receiver will be rejected, and that host's telemetry will go stale.
3. Verify one fresh sample per host with `os` present, a platform observation in the scene, and an unchanged capacity cadence. Rollback replaces only the collector script; the timer is unchanged.

The cloud session that prepared this plan has no SSH or Tailscale access, so collector rollout needs a session with host access, such as Kronos.

## Done means

Hosts with collectors show their OS or platform on badges automatically. Icon choices persist across devices through account views. `pnpm check` and `pnpm test` pass. The feature and agent docs are updated.
