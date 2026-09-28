# VPS access and real-source onboarding

**Status: Operational handoff and provisional sequence**

This runbook records how to establish durable operator access from the Codex
machine to the existing VPS without treating the local MVP as production ready.
It complements the [deployment strategy](../architecture/deployment-strategy.md),
the [production topology template](../../deploy/README.md), and the
[local MVP readiness record](../project/mvp-readiness.md). It does not authorize
a deployment or a change to an existing VPS service.

## Verified and missing facts

- The local MVP is on `main` and runs in Docker for local review. Its external
  source observations and actions are labeled synthetic.
- The owner identified the VPS. `ssh commandry-vps` now authenticates over its
  tailnet name with a pinned host key; `ssh commandry-vps-public` is a local
  fallback alias. Both returned the same remote host and user. The local
  Tailscale interface is active, while its CLI is unavailable in this shell.
- The owner identified IONOS as the VPS provider. The exact IONOS product,
  region, recovery-console access, and provider firewall policy still require
  dashboard verification.
- A dedicated local Commandry key is outside the repository and mode `0600`.
  The initial remote account has broad host privileges. A constrained operator
  identity and provider-side host-key check remain access-hardening work
  before production deployment. Local credential details stay in the ignored
  `.agent/VPS_INVENTORY.md` note.
- An initial read-only inventory found Ubuntu 24.04, four vCPUs, about 5 GiB
  of available memory, 180 GiB of free disk, and existing Docker and user
  services. On 2026-09-27 the owner authorized removing the Hermes and
  Paperclip stacks. Their services, containers, dedicated images, network,
  data, and installed configuration were removed after encrypted local cold
  copies passed archive and database checks. Ephemera stayed running and
  healthy, with about 187 GiB of disk free afterward. The exact retirement
  record is in ignored `.agent/VPS_RETIREMENT.md`. The host now has one
  232 GiB ext4 root filesystem, about 187 GiB free, 7.7 GiB RAM, and 4 GiB
  swap. No application database backup timer appeared in inspected system or
  user timers. Ephemera PostgreSQL
  still maps port 5433 on all interfaces. Host UFW is active with default
  incoming deny; the IONOS firewall policy, recovery console, snapshot, and
  offsite backup facts remain unverified. One stale configured host UFW rule
  still allows TCP 3101 from the retired Hermes-to-Paperclip Docker bridge subnet. Nothing
  listens on that port; removal requires the owner's sudo password in their
  terminal and has not yet been verified.
- The owner usually buys domains through Namecheap, but the registrar for
  `commandry.site` and the other domains has not been verified.

Do not send a password, private key, or account token in chat or commit it to
the repository. The current SSH login is an operator bootstrap path, not the
constrained `commandry-deploy` identity in the accepted deployment strategy.

## IONOS dashboard verification

After the owner signs in, match the server entry to its known public IP before
recording a product tier, region, or recovery capability. In the IONOS Cloud
Panel, **Servers & Cloud** identifies the server and **Network > Firewall
Policies** shows the policy assigned to its IP and its inbound rules. Check
whether TCP 5433 is allowed at that external boundary; do not infer that the
host's UFW policy blocks a Docker-published port. Inspect backup and recovery
features actually attached to this server. IONOS documents a **Backup > Backup
Package** view, but activation requires an agent and may incur additional
cost. A Cloud Server snapshot article alone does not establish that this VPS
has snapshots. Verify that a remote console can be opened without rebooting
or booting a recovery image. Record account and server identifiers only in a
private operational note.

IONOS documents [VPS firewall policies](https://www.ionos.com/help/server-cloud-infrastructure/firewall-vps/overview-firewall-policies-vps-migrated-cloud-servers-and-vps/),
[editing the assigned policy](https://www.ionos.com/help/server-cloud-infrastructure/firewall-vps/editing-a-firewall-policy-vps-migrated-cloud-servers-and-vps/),
the [backup package](https://www.ionos.com/help/server-cloud-infrastructure/cloud-backup/overview-backup-package/),
and [VPS recovery-console use](https://www.ionos.com/help/server-cloud-infrastructure/default-title-1/vps-linux-using-grml-for-data-recovery/).
These are navigation references, not evidence that the corresponding options
are active on this server.

## Re-establish and harden SSH access

1. Confirm the pinned host-key fingerprint through the VPS provider console or
   another trusted channel when that access is available. The tailnet address
   presented the same key as the previously pinned public address.
   `ssh-keyscan` alone does not authenticate a new host.
2. Keep ordinary OpenSSH over the tailnet for management. Enabling Tailscale
   SSH changes how tailnet port 22 is handled and needs a separate access
   review. The public fallback is for recovery if the tailnet path fails.
3. Keep the local private key and `~/.ssh/config` outside the repository with
   mode `0600`. The remote account's broad privileges are an interim risk.
   Move future Codex access to a named,
   constrained operator account; keep the deployment identity separate. A
   replacement key may use a passphrase and local SSH agent if the owner
   prefers interactive unlocks.
4. For a replacement machine, rebuild a local `~/.ssh/config` alias using the
   verified tailnet name, pinned host key, and dedicated key:

   ```sshconfig
   Host commandry-vps
       HostName <verified-tailnet-name-or-ip>
       User <dedicated-operator-user>
       IdentityFile ~/.ssh/id_ed25519_commandry_codex
       IdentitiesOnly yes
       StrictHostKeyChecking yes
       ForwardAgent no
   ```

5. Check `ssh -G commandry-vps` for the effective host, user, and identity,
   then run `ssh -o BatchMode=yes commandry-vps 'hostname; id -un'` to verify
   non-interactive access to the expected host.

`~/.ssh/config` and the key live in the local user profile, so later Codex
chats in this workspace can call `ssh commandry-vps`; an always-open SSH
connection or repository environment variable is unnecessary. If this machine
is replaced, the identity must be re-enrolled. Standard OpenSSH host aliases,
identity files, and strict host checking are documented in the
[OpenSSH client manual](https://man.openbsd.org/ssh_config). Tailscale documents
[ordinary SSH over a tailnet](https://tailscale.com/docs/reference/ssh-over-tailscale)
and the distinct behavior of
[Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh).

## Read-only VPS inventory before any change

From the verified operator connection, record the provider, region, OS,
architecture, CPU, available RAM, swap, disks, snapshots, recovery console,
current workloads, container runtime, service owners, listening ports,
firewall, network routes, Tailscale state, DNS path, backup path, and outbound
Tunnel reachability. Begin with read-only commands such as `hostnamectl`,
`uname -m`, `free -h`, `df -h`, `ip -brief address`, `ip route`,
`ss -lntup`, `systemctl list-units --type=service --state=running`, and
`docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'` where available. Use
`podman ps` if that is the host's runtime. Record permission gaps instead of
escalating or changing group membership merely to complete the inventory.
Avoid dumping environment files, container inspect output, or logs that may
contain secrets. Map each existing service and its port owner before proposing
new routing or Compose changes.

Do not run installation, firewall, Tailscale SSH, Tunnel, Docker cleanup,
restart, or deployment commands during this inventory. A change plan must name
the exact service, expected effect, verification, and rollback. The
[deployment inventory requirements](../architecture/deployment-strategy.md#required-vps-inventory-before-provisioning)
and accepted [VPS ADR](../decisions/0009-deploy-the-initial-control-plane-to-the-vps.md)
set the production gate.

## Sequence after inventory

1. **Access and readiness.** Confirm the VPS inventory and owner-approved
   recovery targets. Set up the dedicated operator account, then prove its
   scope. Keep the separate `commandry-deploy` account limited to the
   root-owned deployment command. Decide production human sign-in and recovery
   under [OQ-003](../project/open-questions.md#oq-003-what-is-the-first-human-sign-in-and-recovery-method).
2. **Production controls.** Prove capacity, immutable image and deployment
   controls, offsite encrypted backup and a clean restore, rollback, and
   external availability monitoring before enabling production. The current
   `APP_ENV=production` guard stays in place until these gates are met.
3. **Read-only sources.** Ask which projects, repositories, accounts, servers,
   sites, and domains the owner wants first. Connect one actual development
   source and one actual operational source. Discover Cloudflare zones, DNS,
   and build status only after account access is granted. Verify each domain's
   registrar before choosing a Namecheap expiry source. Keep provider data in
   its system of record, and show source, scope, timestamp, and freshness for
   every imported observation.
4. **Monitoring.** Observe private servers over the tailnet and public sites
   from an outside vantage. Track availability, latency, renewal dates, host
   capacity, application health, and backup freshness as distinct evidence;
   no single green host signal proves a public site is reachable. Confirm
   alert thresholds and notification channels with actual data.
5. **Agent actions.** Add a separately authenticated runner for SSH, Git,
   browser, and other privileged work. Introduce one scoped capability at a
   time with target, risk, approval, expiry, audit, and verification. The
   web/API and database-connected worker do not become an unrestricted SSH
   runner. Simulated approval results remain clearly labeled until a real
   capability passes this review.

These steps are an order for evidence gathering and implementation, not a
claim that any provider account, host, or runner has been connected. The
[integration contract](../architecture/events-and-integrations.md) and
[security model](../architecture/security-and-permissions.md) govern the
real-source mappings and actions.
