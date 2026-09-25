# Domain and deployment facts

**Status: Operational**

**Last updated:** 2026-09-21

## Domain

- Primary owned domain: `commandry.site`
- Registrar: not recorded in this repository
- Authoritative DNS provider: Cloudflare, based on the user's confirmation that
  nameservers were changed
- DNS zone/account identifiers: not recorded

## Deployment

The initial application platform is proposed but not accepted or provisioned.
The current proposal is:

- a Docker Compose deployment on the owner's existing VPS;
- Next.js on Node.js for the web/API process;
- a separate Node.js pg-boss worker;
- PostgreSQL on the VPS, conditional on the VPS readiness inventory;
- Cloudflare Tunnel and Caddy for ingress;
- encrypted offsite backup to R2;
- optional external execution runners for privileged work.

No production environment, CI/CD pipeline, database, storage bucket, queue, or
email setup exists yet. See [Deployment strategy](../architecture/deployment-strategy.md)
for the proposal; this document records only provisioned facts.

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
