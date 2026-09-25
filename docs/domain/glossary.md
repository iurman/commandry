# Glossary

**Status: Canonical**

| Term | Definition |
| --- | --- |
| Action | A normalized operation against Commandry or a connected system. |
| Agent | A registered security principal that performs bounded work through a runtime. |
| Alert | A stateful, actionable interpretation of events or observations. |
| Approval | A time- and scope-bound authorization for a proposed action. |
| Automation | A durable trigger and policy that creates a notification, action, or run. |
| Capability | Permission to perform a class of operations within a defined scope. |
| Capture | The preserved source envelope for unstructured input. |
| Command Center | The global attention, change, and next-action home view. |
| Component | A logical part of a system or project that provides a function. |
| Connector | An adapter between an external system and Commandry's normalized model. |
| Decision | Durable knowledge recording a choice, rationale, and consequences. |
| Domain | A broad area of responsibility such as Personal or Infrastructure. |
| Event | An immutable statement that something occurred. |
| Execution packet | A portable, versioned bundle of objective, context, constraints, and permissions. |
| Integration | The user-facing connection to an external service, often implemented by a connector. |
| Knowledge item | Durable project memory such as a note, decision, runbook, or research record. |
| Metric | A time-associated measurement about a subject. |
| Project | Anything with ongoing context, state, resources, activity, knowledge, or work. |
| Project brief | An evidence-backed generated view of current project context. |
| Relationship | A typed semantic edge between two entities. |
| Resource | A concrete or externally addressable thing, such as a server, repository, or domain. |
| Run | One bounded attempt to execute work. |
| Runtime | The external or internal environment that hosts an agent's execution. |
| System | A coherent set of components and resources that provides a capability. |
| System of record | The authoritative owner of data or control for a concern. |
| Triage suggestion | A reviewable proposal for turning a capture into structured records. |
| Work item | The shared actionable object behind tasks, subtasks, and initiatives. |

## Terms that must not be conflated

- **Project vs repository:** a repository may support a project; it is not the
  project itself.
- **Project vs system:** a project organizes context and change; a system
  describes an operated capability. They can coexist and relate.
- **Component vs resource:** a component is logical; a resource is concrete or
  externally addressable. A deployed API component may use several resources.
- **Event vs alert:** an event happened once; an alert tracks an actionable
  condition over time.
- **Automation vs run:** an automation is the durable rule; a run is one
  invocation.
- **Agent vs runtime:** the agent has identity, policy, and role; the runtime is
  where its work executes.
- **Knowledge vs secret:** knowledge can reference a secret capability, but must
  not contain the credential value.
