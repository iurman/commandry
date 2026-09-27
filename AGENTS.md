# Commandry agent guide

This file is the routing layer for agents working in this repository. Do not
load every document by default. Start with the smallest reading path that fits
the task, then follow links only when needed.

## Mandatory orientation

Before changing product behavior, data structures, architecture, or UX, read:

1. [`docs/project/status.md`](docs/project/status.md)
2. [`docs/product/principles.md`](docs/product/principles.md)
3. The relevant reading path below
4. [`docs/project/open-questions.md`](docs/project/open-questions.md)
5. Any relevant ADRs in [`docs/decisions/`](docs/decisions/README.md)

## Reading paths

### Product or roadmap work

1. [`docs/product/vision.md`](docs/product/vision.md)
2. [`docs/product/personas-and-use-cases.md`](docs/product/personas-and-use-cases.md)
3. [`docs/product/scope.md`](docs/product/scope.md)
4. [`docs/product/roadmap.md`](docs/product/roadmap.md)

### Data-model or backend work

1. [`docs/domain/core-model.md`](docs/domain/core-model.md)
2. The relevant domain detail document in [`docs/domain/`](docs/domain/README.md)
3. [`docs/architecture/technology-stack.md`](docs/architecture/technology-stack.md)
4. [`docs/architecture/overview.md`](docs/architecture/overview.md)
5. [`docs/architecture/events-and-integrations.md`](docs/architecture/events-and-integrations.md)
6. [`docs/architecture/security-and-permissions.md`](docs/architecture/security-and-permissions.md)

### UI or feature work

1. [`docs/ux/information-architecture.md`](docs/ux/information-architecture.md)
2. [`docs/ux/design-system-and-sensory-language.md`](docs/ux/design-system-and-sensory-language.md)
3. The relevant specification in [`docs/features/`](docs/README.md#feature-specifications)
4. [`docs/domain/core-model.md`](docs/domain/core-model.md)
5. For shared components, states, motion, sound, haptics, or visual simulations,
   [`docs/architecture/local-experience-lab.md`](docs/architecture/local-experience-lab.md)

### Agent, automation, or MCP work

1. [`docs/features/agents.md`](docs/features/agents.md)
2. [`docs/features/automations.md`](docs/features/automations.md)
3. [`docs/architecture/agent-interface.md`](docs/architecture/agent-interface.md)
4. [`docs/architecture/security-and-permissions.md`](docs/architecture/security-and-permissions.md)
5. For collaboration visualization,
   [`docs/features/live-system-map.md`](docs/features/live-system-map.md)

### Infrastructure or monitoring work

1. [`docs/features/infrastructure.md`](docs/features/infrastructure.md)
2. [`docs/domain/operations.md`](docs/domain/operations.md)
3. [`docs/architecture/events-and-integrations.md`](docs/architecture/events-and-integrations.md)

### Application platform, deployment, or developer tooling

1. [`docs/architecture/technology-stack.md`](docs/architecture/technology-stack.md)
2. [`docs/architecture/deployment-strategy.md`](docs/architecture/deployment-strategy.md)
3. [`docs/architecture/agent-development-workflow.md`](docs/architecture/agent-development-workflow.md)
4. For local UI/code documentation tooling,
   [`docs/architecture/local-experience-lab.md`](docs/architecture/local-experience-lab.md)
5. Relevant accepted ADRs in [`docs/decisions/`](docs/decisions/README.md)
6. For rationale and provider limits only,
   [`docs/research/hosting-and-stack-evaluation.md`](docs/research/hosting-and-stack-evaluation.md)

## Authority and status

When documents conflict, use this precedence:

1. Accepted ADRs
2. Product principles and core domain model
3. Feature specifications and architecture documents
4. Roadmap and project-status documents
5. Prior-art notes and the
   [archived original working brief](docs/reference/original-product-definition.md)

Every substantive document begins with a status:

- **Canonical** — current product truth; changing it requires an ADR or an
  explicit product decision.
- **Proposed** — developed direction that still requires validation.
- **Exploratory** — research or an option, not a requirement.
- **Operational** — a fact about the current project or environment.

Future intent must use language such as “will,” “should,” or “may.” Do not write
planned behavior as though it already exists.

## Documentation update rules

- Keep one canonical definition for each concept and link to it elsewhere.
- Preserve the distinction between **project**, **system**, **component**, and
  **resource** from the core domain model.
- Preserve original captures; derived AI classification never replaces source
  content.
- Treat external services as systems of record unless an accepted ADR says
  otherwise.
- Any new action capability must declare its risk level, required capability,
  approval behavior, and audit event.
- Any new integration must map its data into the common resource, metric,
  event, alert, and action abstractions.
- Record durable architectural choices as ADRs. Add unresolved product choices
  to `docs/project/open-questions.md` instead of silently deciding them.
- Update `docs/reference/brief-coverage.md` if a section of the original brief
  moves or gains a new canonical home.
- Keep links relative inside repository Markdown.

## Implementation guardrails

Before changing the existing VPS, identify its host and inventory running
services, containers, bound ports, network routes, backups, and recovery access.
Do not stop or reconfigure an existing service without a scoped change and
rollback plan. Keep SSH private keys and production credentials outside this
repository; use a dedicated identity for Commandry operations and preserve the
constrained deployment identity in the accepted deployment strategy.

ADRs 0009 through 0012 are accepted; ADRs 0005 through 0008 are superseded.
Local application bootstrap may proceed on the accepted Node.js 24, Next.js 16,
PostgreSQL 18, and separate pg-boss worker architecture. Production provisioning
and deployment remain gated by VPS inventory, capacity, backup and restore,
deployment-control validation, and the unresolved human sign-in and recovery
decision. Do not infer production readiness from ADR acceptance.

Preserve the Node/Docker, standard PostgreSQL, versioned HTTP contract, and
domain/application package boundaries. Do not add Cloudflare Workers, Hono,
Vite as the application framework, D1, a graph database, native-first clients,
or a Vercel-only dependency without a new accepted ADR. New product logic
belongs in domain/application packages rather than Next.js handlers, React
components, job consumers, or provider adapters.

The local experience lab is committed development tooling, not a product route.
It may import production UI/experience packages; production code must not import
lab fixtures, controls, routes, or assets. Keep the lab out of production build
and deployment manifests.

Do not build an entire replacement for Netdata, Home Assistant, Proxmox, AMP,
GitHub, or a coding-agent runtime. Commandry's first advantage is contextual
connection across those categories.
