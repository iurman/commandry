# Security upgrade campaign, October 22, 2026

**Status: Operational. Owner-authorized implementation in progress.**

The owner authorized remediation of the October 21 security audit across personal
repositories and accessible infrastructure. Organization repositories remain outside
scope. Private inventory, credentials and server receipts remain outside Git.

The owner subsequently paused server maintenance. The active scope is repository
fixes and application deployments only, including application runtime images.
Host package changes, Portainer and Proxmox upgrades remain held. No such upgrade
was applied before the hold.

## Commandry changes

1. Verify current vendor releases and pin patched Node 24, Next 16, MCP SDK and
   Storybook versions. Retain the accepted architecture and package boundaries.
2. Configure MCP body and input-element limits as required by the SDK advisory.
   Preserve authentication before parsing and per-request server construction.
3. Regenerate the lockfile and retain fixed Sharp resolutions. Review other
   dependency advisories and apply compatible fixes with evidence.
4. Run normal formatting, lint, type, unit, integration, build and release checks.
   Keep hooks and all deployment qualification controls intact.
5. Merge normally only after required checks pass. Verify the immutable candidate,
   owner-authenticated application reads and real worker completion through the
   existing rolling controller before confirming the upgrade.

## Cross-project execution

Maintain separate isolated checkouts and normal commits for affected personal
repositories. Read each repository's instructions and deployment workflow before
changing it. Use supported fixed versions and project-specific checks. A changed
manifest or a successful build does not establish a deployed fix.

Preserve the confirmed Commandry release until its candidate passes qualification.
Application deploys retain their existing backup, recovery and rollout gates.
Server maintenance preflight records remain historical evidence; no maintenance
command may run while the owner's hold is active.

The Proxmox major upgrade requires the vendor preflight, compatible guest and
storage state, verified backups and recovery access. Record any failed prerequisite
and continue independent upgrades; never bypass the recovery gate.

## Completion evidence

Commandry's local source checks, full unit suite, production dependency audit and
production build passed with Node 24.22.1. The unit suite includes rejection of an
oversized MCP body and excessive tool-input elements before service execution.
Remote release qualification and deployed-version verification remain pending.

The development-only `braces` advisory requires version 3.0.4, which was absent
from the public npm registry at verification time. The available version remains
3.0.3. Do not claim that advisory is resolved or invent an unavailable override.

Record each affected target as verified, rolled back, or blocked with an exact
reason and remaining action. Preserve vendor advisories, source commits, check
results, deployed identities and rollback evidence. Keep this tracked plan current
at handoff; private operational evidence is maintained separately.
