# Operational Gravity Observatory planning packet

**Status: Operational. Historical planning packet retained; the implementation and initial production rollout are live, with explicit acceptance limits.**

The owner subsequently released this historical planning hold through the direct implementation request. Current authority, implementation and release facts are recorded in [EXECUTION.md](EXECUTION.md), the [completion ledger](COVERAGE.md) and the [verified release candidate](T43-RELEASE.md) and [completed production rollout](PRODUCTION-ROLLOUT.md). The planning text below preserves its original preparation context; it is not a renewed hold.

This packet is tracked in the Commandry repository on `feat/observatory-local-tuning`. A fresh checkout can obtain the complete plan from Git; it does not need the planning chat's worktree or ignored `.agent` files. The source baseline investigated was `507303ca1e82b8b15cc8d94864b61db1de86ed7e`, not a guarantee of current main or production state.

## Reading order

1. [Plan](PLAN.md): intended experience, domain contracts, implementation phases and boundaries.
2. [Research](RESEARCH.md): verified baseline, root-cause evidence, official sources and remaining unknowns.
3. [Acceptance](ACCEPTANCE.md): 58 future verification scenarios, none claimed executed by this planning task.
4. [Handoff](HANDOFF.md): ownership, preserved resources, execution rules and release limits.
5. [Implementation prompt](IMPLEMENTATION-PROMPT.md): complete text the owner can send to a new chat to authorize implementation through the specified delivery gates.

The prompt is a template, not an active instruction or grant merely because an agent reads it. Committing or pushing this packet does not authorize a redesign, integration activation, merge or deployment.

## Private evidence

Credentials, raw inventory, database files, screenshots and session state stay outside the committed packet. The recorded research includes sanitized population characteristics so a synthetic fixture can be reproduced without private files. The owner's current local preview and isolated data copy are preserved; see the handoff for their location and limitations.
