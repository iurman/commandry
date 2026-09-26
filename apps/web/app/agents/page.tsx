"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AppShell,
  Button,
  LocalAgentCard,
  RecordEmptyState,
  type LocalAgentAssignmentView,
  type LocalAgentProfileView,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
} from "../projects/api";

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<LocalAgentProfileView[]>([]);
  const [agentCursor, setAgentCursor] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [scopes, setScopes] = useState<
    Record<string, LocalAgentAssignmentView[]>
  >({});
  const [scopeCursors, setScopeCursors] = useState<
    Record<string, string | null>
  >({});
  const [scopeStates, setScopeStates] = useState<
    Record<string, "loading" | "ready" | "error">
  >({});
  const [scopeErrors, setScopeErrors] = useState<Record<string, string>>({});
  const [scopeSelection, setScopeSelection] = useState<Record<string, string>>(
    {},
  );
  const [scopeSaving, setScopeSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function fetchScopes(agentId: string, cursor?: string | null) {
    setScopeStates((current) => ({ ...current, [agentId]: "loading" }));
    try {
      const page = await apiJson<PageResponse<LocalAgentAssignmentView>>(
        pagePath(
          `/api/v1/agents/${encodeURIComponent(agentId)}/projects`,
          cursor,
        ),
      );
      setScopes((current) => ({
        ...current,
        [agentId]: cursor
          ? [
              ...(current[agentId] ?? []),
              ...page.items.filter(
                (item) =>
                  !(current[agentId] ?? []).some(
                    (saved) => saved.id === item.id,
                  ),
              ),
            ]
          : page.items,
      }));
      setScopeCursors((current) => ({
        ...current,
        [agentId]: page.nextCursor,
      }));
      setScopeStates((current) => ({ ...current, [agentId]: "ready" }));
      setScopeErrors((current) => ({ ...current, [agentId]: "" }));
    } catch (cause) {
      setScopeStates((current) => ({ ...current, [agentId]: "error" }));
      setScopeErrors((current) => ({
        ...current,
        [agentId]: message(cause, "Could not load project scope."),
      }));
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<LocalAgentProfileView>>(pagePath("/api/v1/agents")),
      apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects")),
    ])
      .then(([agentPage, projectPage]) => {
        if (!active) return;
        setAgents(agentPage.items);
        setAgentCursor(agentPage.nextCursor);
        setProjects(projectPage.items);
        setProjectCursor(projectPage.nextCursor);
        setError(null);
        for (const agent of agentPage.items) void fetchScopes(agent.id);
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause, "Local agents are unavailable."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadMoreAgents() {
    if (!agentCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<LocalAgentProfileView>>(
        pagePath("/api/v1/agents", agentCursor),
      );
      setAgents((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setAgentCursor(page.nextCursor);
      for (const agent of page.items) void fetchScopes(agent.id);
    } catch (cause) {
      setError(message(cause, "Could not load more local agents."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreProjects() {
    if (!projectCursor || loadingProjects) return;
    setLoadingProjects(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", projectCursor),
      );
      setProjects((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setProjectCursor(page.nextCursor);
    } catch (cause) {
      setError(message(cause, "Could not load more projects."));
    } finally {
      setLoadingProjects(false);
    }
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !selectedProject || creating) return;
    setCreating(true);
    setCreateError(null);
    setCreated(null);
    let agent: LocalAgentProfileView | null = null;
    try {
      agent = await apiJson<LocalAgentProfileView>("/api/v1/agents", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...(role.trim() ? { role: role.trim() } : {}),
        }),
      });
      setAgents((current) => [agent!, ...current]);
      const assignment = await apiJson<LocalAgentAssignmentView>(
        `/api/v1/agents/${encodeURIComponent(agent.id)}/projects`,
        {
          method: "POST",
          body: JSON.stringify({ projectId: selectedProject }),
        },
      );
      setScopes((current) => ({ ...current, [agent!.id]: [assignment] }));
      setScopeStates((current) => ({ ...current, [agent!.id]: "ready" }));
      setName("");
      setRole("");
      setSelectedProject("");
      setCreated(
        `${agent.name} was created with one project-scoped read assignment.`,
      );
    } catch (cause) {
      setCreateError(
        agent
          ? `${agent.name} was created, but its project assignment failed: ${message(cause, "Unknown error")}. Add the scope from its card.`
          : message(cause, "Could not create local agent."),
      );
    } finally {
      setCreating(false);
    }
  }

  async function assignProject(
    event: FormEvent<HTMLFormElement>,
    agentId: string,
  ) {
    event.preventDefault();
    const projectId = scopeSelection[agentId];
    if (!projectId || scopeSaving) return;
    setScopeSaving(agentId);
    setScopeErrors((current) => ({ ...current, [agentId]: "" }));
    try {
      const assignment = await apiJson<LocalAgentAssignmentView>(
        `/api/v1/agents/${encodeURIComponent(agentId)}/projects`,
        {
          method: "POST",
          body: JSON.stringify({ projectId }),
        },
      );
      setScopes((current) => ({
        ...current,
        [agentId]: [
          assignment,
          ...(current[agentId] ?? []).filter(
            (item) => item.projectId !== projectId,
          ),
        ],
      }));
      setScopeSelection((current) => ({ ...current, [agentId]: "" }));
    } catch (cause) {
      setScopeErrors((current) => ({
        ...current,
        [agentId]: message(cause, "Could not assign project."),
      }));
    } finally {
      setScopeSaving(null);
    }
  }

  const projectNames = Object.fromEntries(
    projects.map((project) => [project.id, project.name]),
  );
  return (
    <AppShell current="Agents">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Agents / Local simulation</p>
          <h1>Local agents</h1>
          <p className="cmd-lead">
            Create a synthetic profile, assign project scope, and inspect
            exactly what a fake local run may read.
          </p>
        </div>
        <span className="cmd-headline-mark" aria-hidden="true">
          05 / Bounded work
        </span>
      </header>
      <div className="cmd-notice cmd-synthetic-notice">
        <h2>Simulation boundary</h2>
        <p>
          These profiles use a deterministic local worker. No external agent
          runtime, model, project credential, or external action is connected.
          Project assignments are local read scope, not product authentication.
        </p>
      </div>
      <div className="cmd-agent-workbench">
        <section aria-labelledby="agent-list-heading">
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Registry</p>
              <h2 id="agent-list-heading">Agent profiles</h2>
            </div>
            <span className="cmd-count">{agents.length} shown</span>
          </div>
          {loading && (
            <p className="cmd-inline-state" role="status">
              Loading local agents...
            </p>
          )}
          {error && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {error}
            </p>
          )}
          {!loading && agents.length === 0 && !error && (
            <RecordEmptyState
              title="No local agents yet"
              description="Create a synthetic agent profile and assign its first project to try a fake packet run."
            />
          )}
          {agents.length > 0 && (
            <ul className="cmd-agent-list" aria-label="Local agent profiles">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <LocalAgentCard
                    agent={agent}
                    assignments={scopes[agent.id] ?? []}
                    projectNames={projectNames}
                    scopeState={scopeStates[agent.id] ?? "loading"}
                  >
                    {scopeErrors[agent.id] && (
                      <p className="cmd-form-error" role="alert">
                        {scopeErrors[agent.id]}
                      </p>
                    )}
                    {scopeCursors[agent.id] && (
                      <Button
                        disabled={scopeStates[agent.id] === "loading"}
                        onClick={() =>
                          void fetchScopes(agent.id, scopeCursors[agent.id])
                        }
                      >
                        Load more project scopes
                      </Button>
                    )}
                    <form
                      className="cmd-form cmd-local-agent-assign"
                      onSubmit={(event) => void assignProject(event, agent.id)}
                    >
                      <label htmlFor={`agent-project-${agent.id}`}>
                        Add project read scope
                      </label>
                      <select
                        id={`agent-project-${agent.id}`}
                        value={scopeSelection[agent.id] ?? ""}
                        onChange={(event) =>
                          setScopeSelection((current) => ({
                            ...current,
                            [agent.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Choose a project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        disabled={
                          !scopeSelection[agent.id] || scopeSaving === agent.id
                        }
                        type="submit"
                      >
                        {scopeSaving === agent.id
                          ? "Assigning..."
                          : "Assign project"}
                      </Button>
                    </form>
                  </LocalAgentCard>
                </li>
              ))}
            </ul>
          )}
          {agentCursor && (
            <Button
              disabled={loadingMore}
              onClick={() => void loadMoreAgents()}
            >
              {loadingMore ? "Loading..." : "Load more agents"}
            </Button>
          )}
        </section>
        <section
          className="cmd-create-panel"
          aria-labelledby="create-agent-heading"
        >
          <p className="cmd-eyebrow">New local identity</p>
          <h2 id="create-agent-heading">Create synthetic agent</h2>
          <p className="cmd-form-intro">
            Give the profile a name and one project-scoped read assignment. A
            packet run gets a separate short-lived grant.
          </p>
          {createError && (
            <p className="cmd-form-error" role="alert">
              {createError}
            </p>
          )}
          {created && (
            <p className="cmd-form-success" role="status">
              {created}
            </p>
          )}
          {projects.length === 0 && !loading && (
            <p>
              No projects to assign.{" "}
              <a href="/projects">Create a project first.</a>
            </p>
          )}
          <form
            className="cmd-form"
            onSubmit={(event) => void createAgent(event)}
          >
            <label htmlFor="agent-name">Name *</label>
            <input
              id="agent-name"
              maxLength={120}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label htmlFor="agent-role">
              Role <span className="cmd-optional">Optional</span>
            </label>
            <input
              id="agent-role"
              maxLength={160}
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Read-only project helper"
            />
            <label htmlFor="agent-first-project">Project scope *</label>
            <select
              id="agent-first-project"
              required
              value={selectedProject}
              onChange={(event) => setSelectedProject(event.target.value)}
            >
              <option value="">Choose a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {projectCursor && (
              <Button
                disabled={loadingProjects}
                onClick={() => void loadMoreProjects()}
              >
                {loadingProjects ? "Loading projects..." : "Load more projects"}
              </Button>
            )}
            <Button
              variant="primary"
              type="submit"
              disabled={creating || !selectedProject || !name.trim()}
            >
              {creating ? "Creating..." : "Create local agent"}
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
