# Commandry

**Your personal control plane.**

Commandry connects projects, knowledge, infrastructure, services, automations,
monitoring, and AI agents into one system of understanding and control. It is
designed to answer three questions:

1. What is going on?
2. What should happen next?
3. Can I or an agent do something about it?

Commandry sits above existing tools rather than replacing them. GitHub can
remain the source of truth for repositories, Proxmox for virtual machines, Home
Assistant for the smart home, and so on. Commandry links their data to the
projects and decisions that give it meaning.

## Current status

Commandry is in the **architecture review, pre-implementation phase**. The
product direction is documented, while the proposed technology and deployment
architecture is awaiting owner review. No production application exists in this
repository yet.

The domain `commandry.site` is owned, and its nameservers point to Cloudflare.
The current proposal is a VPS-first Docker Compose deployment with Next.js on
Node.js, self-hosted PostgreSQL, and a separate PostgreSQL-backed worker.
Cloudflare provides DNS and ingress; Vercel and Neon remain optional managed
paths. See the proposed ADRs before starting implementation.

## Start here

- [Documentation map](docs/README.md) — entry point for all readers
- [Product vision](docs/product/vision.md) — purpose, promise, and boundaries
- [Product principles](docs/product/principles.md) — durable design rules
- [Product scope](docs/product/scope.md) — first boundary and non-goals
- [Core domain model](docs/domain/core-model.md) — canonical entity graph
- [Architecture overview](docs/architecture/overview.md) — conceptual system design
- [Technology stack](docs/architecture/technology-stack.md) — proposed initial stack
- [Deployment strategy](docs/architecture/deployment-strategy.md) — proposed hosting and runtime topology
- [Agent workflow](docs/architecture/agent-development-workflow.md) — how agents build and deploy it
- [Stack research](docs/research/hosting-and-stack-evaluation.md) — evaluated alternatives and current constraints
- [Roadmap](docs/product/roadmap.md) — phased delivery strategy
- [Open questions](docs/project/open-questions.md) — unresolved decisions
- [Agent guide](AGENTS.md) — how agents should navigate and update this repository

## Product loop

```text
Observe -> Understand -> Surface -> Decide -> Plan -> Execute -> Verify -> Record
    ^                                                                         |
    +-------------------------------------------------------------------------+
```

That loop—not a single dashboard, chatbot, or task list—is the product.

## Repository map

```text
docs/
├── product/       Product intent, users, scope, and roadmap
├── domain/        Canonical vocabulary, entities, and relationships
├── features/      User-facing capability specifications
├── architecture/  System boundaries, flows, integrations, and security
├── ux/            Navigation and interaction principles
├── operations/    Domain and deployment facts
├── decisions/     Architecture decision records (ADRs)
├── project/       Status, open questions, and documentation governance
├── research/      Time-bounded platform and technology evaluations
└── reference/     Prior art and source-brief traceability
```

## Naming

- **Name:** Commandry
- **Short tagline:** Your personal control plane.
- **Long tagline:** Projects, knowledge, infrastructure, automations, and agents.
  One command center.
- **Domain:** `commandry.site`
