# Commandry documentation

**Status: Canonical**

This is the central map for Commandry's product and system documentation. The
docs are organized by the question a reader is trying to answer.

## What are we building, and why?

- [Vision](product/vision.md) — product definition, promise, and long-term loop
- [Principles](product/principles.md) — durable rules that shape every feature
- [Personas and use cases](product/personas-and-use-cases.md) — who it serves
- [Scope](product/scope.md) — first product boundary and explicit non-goals
- [Roadmap](product/roadmap.md) — delivery sequence and phase outcomes

## What concepts does the product understand?

- [Domain overview](domain/README.md) — map of the domain documentation
- [Core model](domain/core-model.md) — canonical entities and relationships
- [Work and knowledge](domain/work-and-knowledge.md) — tasks, captures, notes,
  decisions, and project memory
- [Operations](domain/operations.md) — resources, telemetry, events, and alerts
- [Execution](domain/execution.md) — agents, runs, automations, approvals, and
  execution packets
- [Glossary](domain/glossary.md) — short definitions and disambiguation

## Feature specifications

- [Command Center](features/command-center.md)
- [Capture and triage](features/capture-and-triage.md)
- [Project workspaces](features/project-workspaces.md)
- [Infrastructure and monitoring](features/infrastructure.md)
- [Automations and Overnight Queue](features/automations.md)
- [Agents and approvals](features/agents.md)
- [Search, activity, and notifications](features/search-and-notifications.md)
- [Live system and agent-flow viewport](features/live-system-map.md) —
  exploratory visualization of agent, project, and operational flows

Feature documents describe intended user behavior. They are not proof that a
feature has been implemented.

## How should it work internally?

- [Architecture overview](architecture/overview.md) — boundaries and major layers
- [Technology stack](architecture/technology-stack.md) — proposed languages,
  frameworks, data, jobs, auth, tests, and repository shape
- [Deployment strategy](architecture/deployment-strategy.md) — VPS topology,
  scheduling, containers, runners, and native distribution
- [Agent development workflow](architecture/agent-development-workflow.md) —
  commands, previews, credentials, tests, and production gates
- [Local experience lab](architecture/local-experience-lab.md) — development-only
  component, state, sensory, and flow tooling
- [Events and integrations](architecture/events-and-integrations.md) — normalized
  connector contract and event flow
- [Agent interface](architecture/agent-interface.md) — API/MCP concepts and
  execution packets
- [Security and permissions](architecture/security-and-permissions.md) —
  capabilities, secrets, risk, approval, and audit
- [Information architecture](ux/information-architecture.md) — navigation and
  adaptive workspace behavior
- [Design system and sensory language](ux/design-system-and-sensory-language.md)
  — visual, motion, sound, haptic, and accessibility direction

## What is settled, open, or merely inspirational?

- [Project status](project/status.md) — what exists today
- [Open questions](project/open-questions.md) — decisions still required
- [Decision records](decisions/README.md) — accepted, reopened, and proposed choices
- [Prior art](reference/prior-art.md) — patterns to borrow, integrate, or avoid
- [Original working definition](reference/original-product-definition.md) —
  archived source preserved for provenance
- [Original-brief coverage](reference/brief-coverage.md) — all 42 source sections
  mapped to their canonical documentation
- [Domain and deployment facts](operations/domain-and-deployment.md)
- [Hosting and stack evaluation](research/hosting-and-stack-evaluation.md) —
  Cloudflare, Vercel, Neon, D1, VPS, Docker, and client research

## Document status key

| Status | Meaning |
| --- | --- |
| Canonical | Current product truth; changes need an explicit decision. |
| Proposed | Preferred direction, not yet validated or accepted. |
| Exploratory | Research or an option; not a requirement. |
| Operational | A current fact about the project or its environment. |
