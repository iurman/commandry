# Product principles

**Status: Canonical**

These principles are durable constraints, not a feature wish list.

## 1. Be the system of understanding and control

External services remain systems of record where they are strongest. Commandry
ingests, normalizes, links, summarizes, and acts through them. It replaces an
underlying tool only when doing so is a deliberate product decision.

## 2. Model the user's world, not just software projects

A project is anything with ongoing context, state, resources, activity,
knowledge, or work. A trip, event, home system, client engagement, application,
and server environment are all valid. The model must not assume every project
has a repository or sprint.

## 3. Relationships matter more than folders

Folders can organize a view, but the source model is a graph. One repository,
server, note, domain, or decision may relate to several projects and resources.
Relationships are typed, queryable, and allowed to cross hierarchies.

## 4. Preserve evidence

AI organization never destroys the raw thought or source payload. Captures,
external events, and agent outputs retain provenance. Structured interpretation
is derived data that can be corrected without rewriting history.

## 5. Surface work, not just data

Dashboards must connect a signal to its context and available next actions.
“Disk usage is 86%” is less useful than “Disk usage grew 13 points; it relates
to an existing cleanup task; a read-only investigation is available.”

## 6. One object, many views

A task shown in a list, board, calendar, timeline, or agent queue remains one
task. A resource shown under both a project and a provider remains one resource.
Views do not create parallel sources of truth.

## 7. Context should be portable

Humans and agents must be able to retrieve a concise, current project brief or
execution packet through UI, API, or MCP. The underlying system, not a chat
transcript, owns durable context.

## 8. Autonomy is bounded by capability and risk

Read access, reversible changes, sensitive actions, and destructive actions are
not equivalent. Agents receive least-privilege capabilities, and action policy
determines whether execution is automatic, proposed, or explicitly approved.

## 9. Prefer specialized execution over reinvention

Commandry should integrate with established telemetry, infrastructure,
deployment, home-automation, and agent runtimes. Its advantage is connecting
their outputs to personal context and governed action.

## 10. Make activity explainable

Every automated or agent-driven change should answer: what happened, who or
what initiated it, why, which resources were affected, which permission allowed
it, and whether it succeeded.

## 11. Adapt presentation without fragmenting the model

An event workspace may emphasize schedule, people, and shopping; an
infrastructure workspace may emphasize resources and health. Both use shared
primitives underneath. Project type changes defaults, not the integrity of the
model.

## 12. Optimize mobile for response and capture

The product is web-first and responsive. Mobile emphasizes capture,
notifications, approvals, task updates, quick status, and incidents. Dense
configuration and investigation can remain desktop-oriented until native needs
justify a dedicated application.
