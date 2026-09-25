# Product vision

**Status: Canonical**

## Definition

Commandry is a personal operations system that connects projects, knowledge,
infrastructure, services, automations, monitoring, and AI agents into one
central control plane.

It exists to answer three questions exceptionally well:

1. **What is going on?** — current state, recent change, and emerging risk.
2. **What should happen next?** — relevant work, decisions, and opportunities.
3. **Can I or an agent do something about it?** — available actions, permissions,
   context, and approval requirements.

## The problem

A person's digital world is split across repositories, task managers, notes,
servers, deployment platforms, monitoring tools, home systems, analytics, and
AI-agent sessions. Each service knows its own state but usually lacks the
project context and history needed to explain why that state matters.

This fragmentation causes four recurring failures:

- important signals are buried in separate dashboards;
- context is lost between work sessions and agent runs;
- scheduled and delegated work is hard to see or govern centrally;
- knowing that something changed does not naturally produce the next action.

## Product promise

Commandry builds a persistent model of the user's digital world. It links
external state to projects, work, knowledge, infrastructure, and execution
history, then turns that context into useful attention and safe action.

It is not merely a project manager, second brain, monitoring dashboard, or
agent orchestrator. It combines the understanding required by all four while
allowing specialized tools to remain authoritative.

## Long-term experience

The destination resembles a practical personal JARVIS, but not one omnipotent
agent with unrestricted access. It is one control plane coordinating many
purpose-specific agents, each with bounded context and permissions.

A mature Commandry can:

- explain what changed across the user's projects and systems;
- recall the decision or capture that makes a signal relevant;
- identify work that is safe to perform autonomously;
- prepare or dispatch a context-rich execution packet;
- request approval before sensitive or destructive actions;
- verify and record the result so future work starts with better context.

## The operating loop

1. **Observe** — receive state, metrics, and events from connected services.
2. **Understand** — attach those signals to projects, resources, knowledge, and
   history.
3. **Surface** — present only what deserves attention.
4. **Decide** — let a human or bounded agent select a response.
5. **Plan** — create contextual, structured work.
6. **Execute** — a human, automation, or agent performs the work.
7. **Verify** — evaluate the outcome against acceptance criteria.
8. **Record** — update state, knowledge, and audit history.

The result feeds observation again. This closed loop is Commandry's core product.

## Success characteristics

Commandry succeeds when:

- returning to a project after weeks requires minutes, not hours, of recovery;
- meaningful operational changes are visible without dashboard hunting;
- captures can be made immediately without premature filing decisions;
- an agent receives sufficient context without manual prompt assembly;
- the user can see what ran, why it ran, what it changed, and what needs approval;
- external tools retain their strengths while Commandry makes them coherent.
