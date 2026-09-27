"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, ProjectChangeCard, RecordEmptyState } from "@commandry/ui";
import { apiJson, type ProjectRecord } from "../api";

type ChangeField = "name" | "summary" | "type" | "lifecycle";
type ChangeEvent = {
  id: string;
  projectId: string;
  version: number;
  actor: string;
  previous: Record<ChangeField, string | null>;
  current: Record<ChangeField, string | null>;
  changedFields: ChangeField[];
  createdAt: string;
};
type ChangePage = { items: ChangeEvent[]; nextCursor: number | null };

export default function ProjectDetailsEditor({
  project,
  onProjectChange,
}: {
  project: ProjectRecord;
  onProjectChange: (project: ProjectRecord) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [summary, setSummary] = useState(project.summary ?? "");
  const [type, setType] = useState(project.type);
  const [lifecycle, setLifecycle] = useState(project.lifecycle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const changesPath = `/api/v1/projects/${encodeURIComponent(project.id)}/changes`;

  useEffect(() => {
    let active = true;
    apiJson<ChangePage>(`${changesPath}?limit=20`)
      .then((page) => {
        if (!active) return;
        setEvents(page.items);
        setNextCursor(page.nextCursor);
        setHistoryError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setHistoryError(
            cause instanceof Error ? cause.message : "History unavailable.",
          );
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [changesPath]);

  async function refreshProject() {
    setBusy(true);
    setError(null);
    try {
      const current = await apiJson<ProjectRecord>(
        `/api/v1/projects/${encodeURIComponent(project.id)}`,
      );
      onProjectChange(current);
      setEditing(false);
      setFeedback("Reloaded current project details.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not reload project.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || project.version === undefined) {
      setError("Reload this project before editing its details.");
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await apiJson<ProjectRecord>(
        `/api/v1/projects/${encodeURIComponent(project.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: project.version,
            name: name.trim(),
            summary: summary.trim() || null,
            type: type.trim(),
            lifecycle,
          }),
        },
      );
      onProjectChange(updated);
      setEditing(false);
      setFeedback(
        updated.version === project.version
          ? "Project details were already current."
          : "Project details saved with an audit record.",
      );
      try {
        const history = await apiJson<ChangePage>(`${changesPath}?limit=20`);
        setEvents(history.items);
        setNextCursor(history.nextCursor);
        setHistoryError(null);
      } catch (cause) {
        setHistoryError(
          cause instanceof Error ? cause.message : "Could not refresh history.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save project.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreHistory() {
    if (nextCursor === null || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await apiJson<ChangePage>(
        `${changesPath}?limit=20&beforeVersion=${nextCursor}`,
      );
      setEvents((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setHistoryError(
        cause instanceof Error ? cause.message : "Could not load history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="project-details-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Project context</p>
          <h2 id="project-details-heading">Details and changes</h2>
        </div>
        <span className="cmd-count">
          Version {project.version ?? "unknown"}
        </span>
      </div>
      <p className="cmd-section-intro">
        Update the project&apos;s current context here. Existing captures,
        relationships, and saved packets retain their own history.
      </p>
      {!editing ? (
        <Button
          onClick={() => {
            setName(project.name);
            setSummary(project.summary ?? "");
            setType(project.type);
            setLifecycle(project.lifecycle);
            setEditing(true);
          }}
        >
          Edit project details
        </Button>
      ) : (
        <form className="cmd-form" onSubmit={save}>
          <label htmlFor="edit-project-name">Name</label>
          <input
            id="edit-project-name"
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <label htmlFor="edit-project-summary">Summary</label>
          <textarea
            id="edit-project-summary"
            maxLength={4000}
            onChange={(event) => setSummary(event.target.value)}
            rows={4}
            value={summary}
          />
          <label htmlFor="edit-project-type">Type</label>
          <input
            id="edit-project-type"
            maxLength={100}
            onChange={(event) => setType(event.target.value)}
            required
            value={type}
          />
          <label htmlFor="edit-project-lifecycle">Lifecycle</label>
          <select
            id="edit-project-lifecycle"
            onChange={(event) => setLifecycle(event.target.value)}
            value={lifecycle}
          >
            <option value="proposed">Proposed</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <div className="cmd-inline-actions">
            <Button disabled={busy} type="submit" variant="primary">
              {busy ? "Saving..." : "Save details"}
            </Button>
            <Button disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && (
        <div className="cmd-inline-state cmd-error" role="alert">
          <p>{error}</p>
          <Button disabled={busy} onClick={refreshProject}>
            Reload project
          </Button>
        </div>
      )}
      {feedback && (
        <p className="cmd-form-success" role="status">
          {feedback}
        </p>
      )}
      <div className="cmd-section-heading">
        <h3>Change history</h3>
        <span className="cmd-count">{events.length} shown</span>
      </div>
      {historyError && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {historyError}
        </p>
      )}
      {historyLoading && events.length === 0 && (
        <p className="cmd-inline-state" role="status">
          Loading changes...
        </p>
      )}
      {!historyLoading && events.length === 0 && !historyError && (
        <RecordEmptyState
          description="The first edit will add an exact, immutable change record."
          title="No changes yet"
        />
      )}
      {events.length > 0 && (
        <ul className="cmd-record-list" aria-label="Project changes">
          {events.map((event) => (
            <li key={event.id}>
              <ProjectChangeCard
                event={event}
                href={`${changesPath}/${event.version}`}
              />
            </li>
          ))}
        </ul>
      )}
      {nextCursor !== null && (
        <Button disabled={historyLoading} onClick={loadMoreHistory}>
          {historyLoading ? "Loading..." : "Load older changes"}
        </Button>
      )}
    </section>
  );
}
