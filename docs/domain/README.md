# Domain documentation

**Status: Canonical**

Commandry models a connected world rather than a collection of isolated lists.
The documents in this directory define its shared language.

- [Core model](core-model.md) — identity, hierarchy, and relationship rules
- [Work and knowledge](work-and-knowledge.md) — what the user knows and intends
- [Operations](operations.md) — what exists and what is happening externally
- [Execution](execution.md) — how work is delegated, governed, and recorded
- [Glossary](glossary.md) — concise definitions and terms to avoid conflating

## Four conceptual layers

| Layer | Primary concepts | Question answered |
| --- | --- | --- |
| Context | Domain, project, system, relationship | Where does this belong? |
| Intent | Capture, work item, knowledge item, decision | What is known or desired? |
| Reality | Resource, metric, event, alert | What exists or happened? |
| Execution | Automation, agent, run, action, approval | What will act, and under what policy? |

These layers are conceptual, not necessarily database boundaries.

## Shared conventions

All durable records should support:

- stable internal identity;
- created and updated timestamps;
- lifecycle state rather than hard deletion where history matters;
- provenance identifying user, connector, automation, or agent origin;
- typed relationships to other records;
- source-system identity when mirrored from elsewhere;
- visibility and sensitivity classification where applicable.
