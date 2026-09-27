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
- This development machine has a live Tailscale network interface. The
  Tailscale CLI is not available in the current shell, so tailnet membership
  and policy have not been inventoried through that CLI.
- No `commandry-vps` SSH alias, dedicated Commandry SSH key, verified VPS
  destination, successful VPS login, or remote service inventory exists yet.
- The owner usually buys domains through Namecheap, but the registrar for
  `commandry.site` and the other domains has not been verified.

The next required input is the owner's working `ssh user@host` destination, or
the confirmed VPS tailnet name or IP and login user. Do not send a password,
private key, or account token in chat or commit it to the repository. A
historical SSH destination or a familiar hostname is not proof of VPS identity.

## Establish SSH access once the VPS is identified

1. Verify the host identity using the VPS provider console or another trusted
   existing channel. Preserve the verified host key in `~/.ssh/known_hosts`.
   `ssh-keyscan` alone does not authenticate a new host.
2. Use the owner's working SSH login for an initial read-only connection. If
   the VPS is in the tailnet, prefer its Tailscale IP or MagicDNS name for the
   management path. Keep ordinary OpenSSH initially; enabling Tailscale SSH
   changes how tailnet port 22 is handled and requires its own access review.
3. Create a dedicated `~/.ssh/id_ed25519_commandry_codex` key on the Codex
   machine with a passphrase, and install only its `.pub` key for a dedicated,
   named operator account after the host inventory and access policy are
   agreed. Do not reuse this key for an application connector or the
   `commandry-deploy` identity. A human may need to unlock the key after a
   reboot; the key and alias persist across chats.
4. Add a local `~/.ssh/config` alias. Fill the verified host and operator user
   only after they are known:

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
   then run `ssh -o BatchMode=yes commandry-vps 'hostname; id -un'`. Access is
   established only when that command succeeds against the verified VPS.

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
