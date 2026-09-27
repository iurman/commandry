"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ListProjectFlowResponse,
  ProjectFlowItem,
} from "@commandry/contracts";
import { AppShell, Button, ProjectFlowCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../projects/api";

type ProjectChoice = { id: string; name: string };

function flowPath(projectId: string, cursor?: string | null) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/projects/${encodeURIComponent(projectId)}/flow?${params}`;
}

export default function ProjectFlowPage() {
  const [projects, setProjects] = useState<ProjectChoice[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [items, setItems] = useState<ProjectFlowItem[]>([]);
  const [flowCursor, setFlowCursor] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingFlow, setLoadingFlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flowRequestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const initialId = new URLSearchParams(window.location.search).get(
      "projectId",
    );
    apiJson<PageResponse<ProjectChoice>>("/api/v1/projects?limit=25")
      .then((page) => {
        if (!active) return;
        setProjects(page.items);
        setProjectCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load projects.",
          );
      })
      .finally(() => {
        if (active) setLoadingProjects(false);
      });
    if (initialId) {
      const initialRequestVersion = flowRequestVersion.current;
      apiJson<ListProjectFlowResponse>(flowPath(initialId))
        .then((page) => {
          if (!active || flowRequestVersion.current !== initialRequestVersion)
            return;
          setSelectedProjectId(initialId);
          setProjectName(page.projectName);
          setItems(page.items);
          setFlowCursor(page.nextCursor);
          setAsOf(page.asOf);
        })
        .catch((cause: unknown) => {
          if (active && flowRequestVersion.current === initialRequestVersion) {
            setSelectedProjectId(initialId);
            setError(
              cause instanceof Error ? cause.message : "Could not load flow.",
            );
          }
        })
        .finally(() => {
          if (active && flowRequestVersion.current === initialRequestVersion)
            setLoadingFlow(false);
        });
    }
    return () => {
      active = false;
    };
  }, []);

  async function loadProjects() {
    if (!projectCursor || loadingProjects) return;
    setLoadingProjects(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectChoice>>(
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
      setError(
        cause instanceof Error ? cause.message : "Could not load projects.",
      );
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadFlow(projectId: string, cursor?: string | null) {
    const requestVersion = flowRequestVersion.current;
    setLoadingFlow(true);
    setError(null);
    try {
      const page = await apiJson<ListProjectFlowResponse>(
        flowPath(projectId, cursor),
      );
      if (requestVersion !== flowRequestVersion.current) return;
      setProjectName(page.projectName);
      setItems((current) =>
        cursor
          ? [
              ...current,
              ...page.items.filter(
                (item) =>
                  !current.some(
                    (saved) => saved.id === item.id && saved.kind === item.kind,
                  ),
              ),
            ]
          : page.items,
      );
      setFlowCursor(page.nextCursor);
      setAsOf(page.asOf);
    } catch (cause) {
      if (requestVersion === flowRequestVersion.current)
        setError(
          cause instanceof Error ? cause.message : "Could not load flow.",
        );
    } finally {
      if (requestVersion === flowRequestVersion.current) setLoadingFlow(false);
    }
  }

  function selectProject(projectId: string) {
    flowRequestVersion.current += 1;
    setSelectedProjectId(projectId);
    setProjectName("");
    setItems([]);
    setFlowCursor(null);
    setAsOf(null);
    const url = new URL(window.location.href);
    if (projectId) url.searchParams.set("projectId", projectId);
    else url.searchParams.delete("projectId");
    window.history.replaceState(null, "", url);
    if (projectId) void loadFlow(projectId);
  }

  return (
    <AppShell current="Flow">
      <header className="cmd-page-header">
        <p className="cmd-eyebrow">Read-only local projection</p>
        <h1>Project flow</h1>
        <p>
          Follow recorded relationships, synthetic source events, fake agent
          runs, local automation runs, and simulated approvals for one project.
          This is paged history, not live traffic or a health claim.
        </p>
      </header>
      <section
        className="cmd-local-run-assignment"
        aria-label="Project selection"
      >
        <label htmlFor="flow-project">Project</label>
        <select
          id="flow-project"
          value={selectedProjectId}
          onChange={(event) => selectProject(event.target.value)}
        >
          <option value="">Choose a project</option>
          {selectedProjectId &&
            !projects.some((project) => project.id === selectedProjectId) && (
              <option value={selectedProjectId}>
                {projectName || selectedProjectId}
              </option>
            )}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {projectCursor && (
          <Button
            disabled={loadingProjects}
            onClick={() => void loadProjects()}
          >
            Load more projects
          </Button>
        )}
        {loadingProjects && <p role="status">Loading projects...</p>}
      </section>
      {error && <p role="alert">{error}</p>}
      {selectedProjectId && (
        <section
          className="cmd-local-run-audit"
          aria-label="Project flow history"
        >
          <h2>{projectName || "Project"} history</h2>
          <p>
            Each page is read from PostgreSQL. Current recorded states are shown
            beside their original timestamps and source links.
            {asOf && <> Last page read at {asOf}.</>}
          </p>
          <p>
            <a href={`/projects/${encodeURIComponent(selectedProjectId)}`}>
              Open project workspace
            </a>
          </p>
          <Button
            disabled={loadingFlow}
            onClick={() => void loadFlow(selectedProjectId)}
          >
            Refresh flow
          </Button>
          {loadingFlow && <p role="status">Loading project flow...</p>}
          {!loadingFlow && !error && items.length === 0 && (
            <p>No related flow records are stored for this project yet.</p>
          )}
          <ol className="cmd-notification-list">
            {items.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <ProjectFlowCard item={item} />
              </li>
            ))}
          </ol>
          {flowCursor && (
            <Button
              disabled={loadingFlow}
              onClick={() => void loadFlow(selectedProjectId, flowCursor)}
            >
              Load more flow records
            </Button>
          )}
        </section>
      )}
    </AppShell>
  );
}
