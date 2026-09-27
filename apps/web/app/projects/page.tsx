"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AppShell,
  Button,
  RecordCard,
  RecordEmptyState,
  StatusBadge,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
} from "./api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects"))
      .then((page) => {
        if (!active) return;
        setProjects(page.items);
        setNextCursor(page.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Projects are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", nextCursor),
      );
      setProjects((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more projects.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    setCreated(null);
    try {
      const project = await apiJson<ProjectRecord>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...(summary.trim() ? { summary: summary.trim() } : {}),
          ...(type.trim() ? { type: type.trim() } : {}),
        }),
      });
      setProjects((current) => [project, ...current]);
      setName("");
      setSummary("");
      setType("");
      setCreated(project.name);
    } catch (cause) {
      setCreateError(
        cause instanceof Error ? cause.message : "Could not create project.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell current="Projects">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Portfolio / Projects</p>
          <h1>Projects</h1>
          <p className="cmd-lead">
            Keep one home for a concern, whether it is an application, a trip,
            or a system you operate.
          </p>
          <p>
            <a href="/domains">Browse portfolio domains</a>
          </p>
        </div>
        <span className="cmd-headline-mark" aria-hidden="true">
          01 / Context
        </span>
      </header>

      <div className="cmd-workspace-grid">
        <section
          className="cmd-workspace-section"
          aria-labelledby="project-list-heading"
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Your records</p>
              <h2 id="project-list-heading">Project index</h2>
            </div>
            {!loading && !error && (
              <span className="cmd-count">{projects.length} shown</span>
            )}
          </div>
          {loading && (
            <p className="cmd-inline-state" role="status">
              Loading projects...
            </p>
          )}
          {error && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {error}
            </p>
          )}
          {!loading && projects.length === 0 && !error && (
            <RecordEmptyState
              description="Create a project to start connecting resources, work, and knowledge."
              title="No projects yet"
            />
          )}
          {projects.length > 0 && (
            <ul className="cmd-record-list" aria-label="Projects">
              {projects.map((project) => (
                <li key={project.id}>
                  <RecordCard
                    aside={
                      <StatusBadge
                        dimension="lifecycle"
                        label={project.lifecycle}
                        tone="neutral"
                      />
                    }
                    description={
                      project.domain
                        ? `${project.summary ? `${project.summary} ` : ""}Domain: ${project.domain.name}`
                        : project.summary
                    }
                    href={`/projects/${encodeURIComponent(project.id)}`}
                    id={project.id}
                    kind={project.type}
                    name={project.name}
                  />
                </li>
              ))}
            </ul>
          )}
          {nextCursor && (
            <Button disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading..." : "Load more projects"}
            </Button>
          )}
        </section>

        <section
          className="cmd-workspace-section cmd-create-panel"
          aria-labelledby="create-project-heading"
        >
          <p className="cmd-eyebrow">New context</p>
          <h2 id="create-project-heading">Create a project</h2>
          <p className="cmd-form-intro">
            A project needs only a name. Add structure as its context grows.
          </p>
          <form className="cmd-form" onSubmit={createProject}>
            <label htmlFor="project-name">
              Name <span aria-hidden="true">*</span>
            </label>
            <input
              autoComplete="off"
              id="project-name"
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            <label htmlFor="project-summary">
              Summary <span className="cmd-optional">Optional</span>
            </label>
            <textarea
              id="project-summary"
              maxLength={2000}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              value={summary}
            />
            <label htmlFor="project-type">
              Type <span className="cmd-optional">Optional</span>
            </label>
            <input
              id="project-type"
              list="project-types"
              maxLength={80}
              onChange={(event) => setType(event.target.value)}
              placeholder="General"
              value={type}
            />
            <datalist id="project-types">
              <option value="software" />
              <option value="infrastructure" />
              <option value="event" />
              <option value="personal" />
            </datalist>
            <p className="cmd-form-hint">
              Type changes the label here; it does not require a repository.
            </p>
            {createError && (
              <p className="cmd-form-error" role="alert">
                {createError}
              </p>
            )}
            {created && (
              <p className="cmd-form-success" role="status">
                Created {created}. Open it from the index.
              </p>
            )}
            <Button disabled={creating} type="submit" variant="primary">
              {creating ? "Creating..." : "Create project"}
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
