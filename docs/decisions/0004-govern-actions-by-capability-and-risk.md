# ADR 0004: Govern actions by capability and risk

**Status:** Accepted

**Date:** 2026-09-15

## Context

Commandry may coordinate agents and automations across production systems,
accounts, DNS, servers, and personal data. A single autonomy toggle or blanket
credential grant cannot express safe boundaries.

## Decision

Every external or material internal action will declare a risk class and
required capability. Policy evaluates the actor, capability, target scope,
environment, action risk, and current constraints to allow, deny, or request
approval. Approvals are exact, scoped, expiring, and audited.

## Consequences

- Agents are distinct security principals with isolated access.
- Actions must be registered rather than hidden inside generic tools.
- Secrets are brokered through capabilities and are not normal project data.
- Sensitive and destructive sub-actions cannot inherit approval merely from a
  broad task assignment.
- Policy and audit become early platform capabilities.

## Alternatives considered

- Per-agent autonomous/manual toggle: rejected as too coarse.
- Human approval for every action: rejected because it prevents useful safe
  automation and creates approval fatigue.
