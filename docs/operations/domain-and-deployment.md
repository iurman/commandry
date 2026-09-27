# Domain and deployment facts

**Status: Operational**

**Last updated:** 2026-09-27

## Domain

- Primary owned domain: `commandry.site`
- Registrar: not verified for `commandry.site`. The owner says Namecheap is
  their usual registrar; verify the actual registration before connecting an
  expiry source.
- Authoritative DNS provider: Cloudflare, based on the user's confirmation that
  nameservers were changed
- DNS zone/account identifiers: not recorded

## Deployment

The initial application platform was accepted in ADRs 0009 through 0012 but
has not been provisioned. The accepted topology is:

- a Docker Compose deployment on the owner's existing VPS;
- Next.js on Node.js for the web/API process;
- a separate Node.js pg-boss worker;
- PostgreSQL on the VPS, conditional on the VPS readiness inventory;
- Cloudflare Tunnel and Caddy for ingress;
- encrypted offsite backup to R2;
- separate execution runners for privileged work.

The local MVP has a PostgreSQL-backed Compose stack and synthetic sources; it
is not a production environment. Production CI/CD, storage bucket, backups,
real connectors, runner, and human login/recovery are not established. See the
[deployment strategy](../architecture/deployment-strategy.md) for the accepted
topology and the [VPS access runbook](vps-access-and-onboarding.md) for its
first evidence-gathering step.

## Before launch

Record the following once selected:

- DNS records and ownership verification;
- production/staging URLs;
- hosting project and region;
- database, object storage, queue/job runner, and secret manager;
- deployment and rollback procedure;
- monitoring and alert ownership;
- backup and restore procedure;
- certificate and domain-renewal responsibility;
- status/privacy/security contact endpoints.

Do not store credentials or secret values in this document.
