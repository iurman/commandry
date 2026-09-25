# Project workspaces

**Status: Proposed**

## Purpose

A project workspace provides a focused, adaptable view of everything needed to
understand and advance one concern.

## Shared workspace areas

Potential areas include:

- Overview
- Work
- Knowledge
- Activity
- Resources
- Infrastructure
- Automations
- Agents
- Integrations

Not every project shows every area. Project type and configuration define
defaults while the underlying entities remain shared.

Examples:

- a trip emphasizes overview, schedule, people, bookings, work, and notes;
- a software project emphasizes work, knowledge, repositories, deployments,
  incidents, and agents;
- a homelab emphasizes resources, health, automations, and runbooks;
- an event may emphasize tasks, schedule, people, shopping, and documents.

## Overview

The project landing page should combine a generated brief with configurable
cards for:

- project state and health;
- next actions and blocked work;
- recent decisions;
- important links and resources;
- upcoming dates;
- recent activity;
- deployment and infrastructure state;
- analytics and custom metrics;
- agent runs and pending approvals;
- costs or budget where relevant.

Each summary links to its source. Cards should state their freshness when data
comes from an external system.

## Work

Initial work capabilities:

- initiatives, tasks, and subtasks;
- status, priority, due dates, dependencies, and blocking;
- human and agent assignment;
- acceptance criteria, comments, attachments, and completion evidence;
- recurring definitions and execution history;
- list, board, and focused query views over the same items.

Calendar and timeline are later projections, not new work types.

## Knowledge and memory

Knowledge supports notes, decisions, ideas, research, requirements, runbooks,
links, documents, meeting notes, and lessons. It is linked to project context,
not stored as an isolated notebook.

The project brief is a generated projection covering state, change, decisions,
questions, blockers, next actions, and agent context. It never replaces its
source records.

## Cross-project relationships

Work, knowledge, and resources may relate to several projects. The UI should
make the primary context clear without duplicating the underlying record.

## Acceptance conditions

- A non-software project can be represented without fake repository concepts.
- Tabs/areas can be hidden without deleting their data.
- A resource linked through two paths resolves to one canonical record.
- Project briefs expose evidence and freshness.
- All work views update the same work items.
