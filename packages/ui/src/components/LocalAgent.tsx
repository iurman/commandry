import type { ReactNode } from "react";

export interface LocalAgentProfileView {
  id: string;
  name: string;
  role: string | null;
  runtime: "local-fake-v1";
  sourceLabel: string;
  isSynthetic: true;
  createdAt: string;
}

export interface LocalAgentAssignmentView {
  id: string;
  agentId: string;
  projectId: string;
  isSynthetic: true;
  createdAt: string;
}

export function LocalAgentCard({
  agent,
  assignments,
  projectNames,
  scopeState,
  children,
}: {
  agent: LocalAgentProfileView;
  assignments: LocalAgentAssignmentView[];
  projectNames: Record<string, string>;
  scopeState?: "loading" | "ready" | "error";
  children?: ReactNode;
}) {
  return (
    <article className="cmd-local-agent-card" aria-label={agent.name}>
      <div className="cmd-local-agent-card-head">
        <div>
          <p className="cmd-eyebrow">Synthetic local agent</p>
          <h3>{agent.name}</h3>
          <p>{agent.role || "No role recorded"}</p>
        </div>
        <span className="cmd-local-agent-runtime">{agent.runtime}</span>
      </div>
      <div className="cmd-local-agent-scope">
        <h4>Assigned project scope</h4>
        {scopeState === "loading" && <p role="status">Loading scope...</p>}
        {scopeState === "error" && (
          <p role="alert">Project assignments could not be loaded.</p>
        )}
        {scopeState !== "loading" && assignments.length === 0 && (
          <p>No projects assigned. This agent cannot start a packet run.</p>
        )}
        {assignments.length > 0 && (
          <ul>
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <a
                  href={`/projects/${encodeURIComponent(assignment.projectId)}`}
                >
                  {projectNames[assignment.projectId] ?? assignment.projectId}
                </a>
                <span>Read scope only</span>
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
      <p className="cmd-local-agent-disclosure">
        Synthetic profile. No external runner, model, secret, or action
        capability is connected.
      </p>
    </article>
  );
}
