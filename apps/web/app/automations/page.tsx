"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AutomationDefinition, AutomationRun } from "@commandry/contracts";
import {
  AppShell,
  AutomationCard,
  Button,
  RecordEmptyState,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
} from "../projects/api";

export default function AutomationsPage() {
  const [items, setItems] = useState<AutomationDefinition[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [latestRuns, setLatestRuns] = useState<Record<string, AutomationRun>>(
    {},
  );
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function enrich(definitions: AutomationDefinition[]) {
    const uniqueProjectIds = [
      ...new Set(definitions.map((item) => item.projectId)),
    ];
    const [projectsResult, runsResult] = await Promise.all([
      Promise.allSettled(
        uniqueProjectIds.map((id) =>
          apiJson<ProjectRecord>(`/api/v1/projects/${id}`),
        ),
      ),
      Promise.allSettled(
        definitions.map((item) =>
          apiJson<PageResponse<AutomationRun>>(
            pagePath(`/api/v1/automations/${item.id}/runs`),
          ),
        ),
      ),
    ]);
    setProjectNames((current) => {
      const next = { ...current };
      projectsResult.forEach((result, index) => {
        if (result.status === "fulfilled")
          next[uniqueProjectIds[index]!] = result.value.name;
      });
      return next;
    });
    setLatestRuns((current) => {
      const next = { ...current };
      runsResult.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value.items[0])
          next[definitions[index]!.id] = result.value.items[0];
      });
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<AutomationDefinition>>(
        pagePath("/api/v1/automations"),
      ),
      apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects")),
    ])
      .then(([automations, projectPage]) => {
        if (!active) return;
        setItems(automations.items);
        setCursor(automations.nextCursor);
        setProjects(projectPage.items);
        setProjectCursor(projectPage.nextCursor);
        setProjectId(projectPage.items[0]?.id ?? "");
        void enrich(automations.items);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Automations are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadMoreProjects() {
    if (!projectCursor || busy) return;
    setBusy(true);
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
      setError(
        cause instanceof Error ? cause.message : "Could not load projects.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<AutomationDefinition>>(
        pagePath("/api/v1/automations", cursor),
      );
      setItems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
      await enrich(page.items);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more automations.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const definition = await apiJson<AutomationDefinition>(
        "/api/v1/automations",
        {
          method: "POST",
          body: JSON.stringify({ projectId, name: name.trim(), enabled }),
        },
      );
      setItems((current) => [definition, ...current]);
      setProjectNames((current) => ({
        ...current,
        [projectId]:
          projects.find((item) => item.id === projectId)?.name ?? projectId,
      }));
      setFeedback(
        enabled
          ? "Local automation created and its one-time synthetic summary queued. Open it to review the worker result."
          : "Disabled local automation saved. It will not run until enabled and manually triggered.",
      );
      setName("");
      if (enabled) void enrich([definition]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create local automation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Automations">
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Local-only / Controlled routines</p>
          <h1>Automations</h1>
          <p className="cmd-lead">
            Review definitions and worker runs. This first routine reads a
            project brief once at creation, produces a synthetic unverified
            summary, and performs no external action.
          </p>
        </div>
      </header>
      <div className="cmd-automation-layout">
        <section
          className="cmd-workspace-section"
          aria-labelledby="automation-list-heading"
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Registry / local source of truth</p>
              <h2 id="automation-list-heading">Routines</h2>
            </div>
            <span className="cmd-count">{items.length} shown</span>
          </div>
          {loading && (
            <p className="cmd-inline-state" role="status">
              Loading automations...
            </p>
          )}
          {error && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {error}
            </p>
          )}
          {!loading && items.length === 0 && !error && (
            <RecordEmptyState
              title="No local automations"
              description="Create one to exercise a bounded worker summary."
            />
          )}
          <ul className="cmd-automation-list" aria-label="Local automations">
            {items.map((item) => (
              <li key={item.id}>
                <AutomationCard
                  automation={{
                    id: item.id,
                    name: item.name,
                    projectName: projectNames[item.projectId] ?? item.projectId,
                    enabled: item.enabled,
                    latestRunState: latestRuns[item.id]?.state ?? null,
                    latestRunAt: latestRuns[item.id]?.createdAt ?? null,
                  }}
                />
              </li>
            ))}
          </ul>
          {cursor && (
            <Button disabled={busy} onClick={loadMore}>
              Load more automations
            </Button>
          )}
        </section>
        <section
          className="cmd-workspace-section cmd-create-panel"
          aria-labelledby="automation-create-heading"
        >
          <p className="cmd-eyebrow">Create / Read-only</p>
          <h2 id="automation-create-heading">New local routine</h2>
          <p className="cmd-form-intro">
            An enabled definition queues one summary at creation. There is no
            recurring scheduler or connection to an external system.
          </p>
          <form className="cmd-form" onSubmit={create}>
            <label htmlFor="automation-name">Name</label>
            <input
              id="automation-name"
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            <label htmlFor="automation-project">Project</label>
            <select
              id="automation-project"
              onChange={(event) => setProjectId(event.target.value)}
              required
              value={projectId}
            >
              {projects.length === 0 && (
                <option value="">Create a project first</option>
              )}
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {projectCursor && (
              <Button disabled={busy} onClick={loadMoreProjects} type="button">
                Load more project choices
              </Button>
            )}
            <label
              className="cmd-automation-checkbox"
              htmlFor="automation-enabled"
            >
              <input
                checked={enabled}
                id="automation-enabled"
                onChange={(event) => setEnabled(event.target.checked)}
                type="checkbox"
              />
              Enabled at creation
            </label>
            <p className="cmd-form-hint">
              Actor: local worker. Capability used: project.brief.read. Risk:
              read-only. Approval: not required. Output: synthetic and
              unverified.
            </p>
            {feedback && (
              <p className="cmd-form-success" role="status">
                {feedback}
              </p>
            )}
            <Button
              disabled={busy || !projectId}
              type="submit"
              variant="primary"
            >
              {busy ? "Saving..." : "Create local routine"}
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
