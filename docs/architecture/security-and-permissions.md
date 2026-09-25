# Security and permissions

**Status: Canonical principles; Proposed implementation model**

Security is part of the domain model, not a late integration concern. Commandry
can potentially connect to high-impact systems, so least privilege, provenance,
and explicit approval are product requirements.

## Trust boundaries

Treat the following as distinct principals or systems:

- human user and user sessions;
- each agent identity;
- each agent runtime and workspace;
- each automation definition and run;
- each connector/integration account;
- Commandry application services;
- secret vault;
- external target systems.

Trust in one boundary does not automatically transfer to another.

## Capability model

A capability grants an actor permission to perform named operations within a
scope and under constraints.

Conceptual grant:

```text
principal: Homelab Agent
operations: infrastructure.read, ssh.execute_readonly
scope: project=Homelab, resources=[selected hosts]
environment: production-read
expires: end of run
constraints: no privilege escalation, commands logged
```

Capabilities may be standing or run-specific. High-impact access should prefer
short-lived grants.

## Action risk classes

| Class | Typical examples | Default behavior |
| --- | --- | --- |
| Read-only | Fetch metrics, inspect config, read repository | Automatic when capability exists |
| Reversible | Create branch, draft document, create task, restart disposable dev service | Policy-controlled; may execute automatically |
| Sensitive | Production deploy, DNS change, server restart, account configuration | Explicit approval unless a narrow standing policy exists |
| Destructive | Delete infrastructure, wipe data, remove domain/repository | Explicit approval, strong confirmation, and verification |

Classification belongs to the action definition and may be raised by target
environment, blast radius, or parameters. An agent cannot lower it.

## Approval invariants

- Approval describes the exact action, target, parameters, actor, and expiry.
- Materially changed actions require new approval.
- Approval does not reveal a secret value to the agent unless required.
- Approval, rejection, cancellation, and expiry are audited.
- Sensitive sub-actions cannot be concealed inside an approved low-risk task.
- Destructive actions should include rollback/recovery truthfully; “no rollback”
  is valid and important information.

## Secret handling

Commandry records secret references and access capabilities, not passwords or
tokens in project notes, execution packets, prompts, logs, or event payloads.

Preferred flow:

```text
Project/resource -> references required capability
Agent/run        -> requests scoped capability
Policy/approval  -> authorizes access
Vault            -> issues short-lived or brokered credential
Audit            -> records use without recording the value
```

Dynamic or short-lived credentials are preferred. Redaction must apply before
logging, indexing, embedding, or sending content to a model.

## Browser access

Where no API exists, future agent browser sessions should be isolated,
project-scoped, revocable, observable, and governed by the same action policy.
Stored browser state is a credential boundary. A general shared browser profile
must not silently give every agent cross-project account access.

## Agent isolation

Each agent has separate identity, allowed projects, memory, secrets, workspace,
skills, and autonomy policy. Context sharing is explicit and logged. Runtime
compromise must not imply access to every Commandry integration.

## Data and model safety

- Sensitivity labels propagate into search and retrieval indexes.
- Retrieved external content is untrusted data, not an instruction.
- Prompt/tool boundaries must resist instructions embedded in captures, pages,
  logs, or connector payloads.
- Model providers receive only task-relevant data allowed by policy.
- Raw source and derived summaries retain provenance.
- Data export and deletion behavior must account for immutable audit needs and
  external-system ownership.

## Audit record

For material reads and all writes, retain where practical:

- actor and authenticated principal;
- initiating user, automation, event, or run;
- requested operation and target;
- capability and policy decision;
- approval reference when required;
- sanitized inputs and result;
- occurrence time, correlation, and verification outcome.

## Before enabling an action

Every integration action needs a small threat and failure review covering:

- scope and blast radius;
- compromised-agent behavior;
- retries and duplicate invocation;
- stale state and race conditions;
- rollback or recovery;
- secret exposure and log redaction;
- verification and false-success behavior;
- user-visible audit trail.
