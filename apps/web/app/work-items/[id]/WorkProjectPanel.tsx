"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  WorkProjectAuditEvent,
  WorkProjectConnection,
  WorkProjectLink,
  ProjectSummary,
} from "@commandry/contracts";
import { Button, WorkProjectLinkCard, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";
import { searchNamedChoices } from "../../projects/searchChoices";

export default function WorkProjectPanel({
  workItemId,
  primaryProjectId,
}: {
  workItemId: string;
  primaryProjectId: string;
}) {
  const path = `/api/v1/work-items/${workItemId}/projects`;
  const auditPath = `/api/v1/work-items/${workItemId}/project-audit`;
  const [primary, setPrimary] = useState<ProjectSummary | null>(null);
  const [connections, setConnections] = useState<WorkProjectConnection[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [audit, setAudit] = useState<WorkProjectAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [choices, setChoices] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [choiceCursor, setChoiceCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<ProjectSummary>(`/api/v1/projects/${primaryProjectId}`),
      apiJson<PageResponse<WorkProjectConnection>>(pagePath(path)),
      apiJson<PageResponse<WorkProjectAuditEvent>>(pagePath(auditPath)),
    ])
      .then(([savedPrimary, linked, events]) => {
        if (!active) return;
        setPrimary(savedPrimary);
        setConnections(linked.items);
        setCursor(linked.nextCursor);
        setAudit(events.items);
        setAuditCursor(events.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Project context is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auditPath, path, primaryProjectId]);

  async function refreshAudit() {
    try {
      const page = await apiJson<PageResponse<WorkProjectAuditEvent>>(
        pagePath(auditPath),
      );
      setAudit(page.items);
      setAuditCursor(page.nextCursor);
    } catch {
      setError(
        "The relationship changed, but its history could not be refreshed.",
      );
    }
  }

  async function loadMoreConnections() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<WorkProjectConnection>>(
        pagePath(path, cursor),
      );
      setConnections((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.link.id === item.link.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load related projects.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function findProjects() {
    if (busy || !query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const searched = query.trim();
      const page = await searchNamedChoices("project", searched);
      setChoices(page.items.filter((item) => item.id !== primaryProjectId));
      setChoiceCursor(page.nextCursor);
      setAppliedQuery(searched);
      setSelectedId("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not search projects.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreChoices() {
    if (!choiceCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await searchNamedChoices(
        "project",
        appliedQuery,
        choiceCursor,
      );
      setChoices((current) => [
        ...current,
        ...page.items.filter(
          (item) =>
            item.id !== primaryProjectId &&
            !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setChoiceCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more project matches.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<WorkProjectConnection>(path, {
        method: "POST",
        body: JSON.stringify({ projectId: selectedId }),
      });
      setConnections((current) =>
        current.some((item) => item.link.id === saved.link.id)
          ? current
          : [saved, ...current],
      );
      setSelectedId("");
      setFeedback(
        `Related this Work record to ${saved.project.name}. Its primary project and exact original are unchanged.`,
      );
      await refreshAudit();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not relate project.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlink(connection: WorkProjectConnection) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await apiJson<WorkProjectLink>(
        `/api/v1/work-project-links/${connection.link.id}/archive`,
        { method: "PUT" },
      );
      setConnections((current) =>
        current.filter((item) => item.link.id !== connection.link.id),
      );
      setFeedback(
        `Unlinked ${connection.project.name}. The exact relationship remains in history.`,
      );
      await refreshAudit();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not unlink project.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreAudit() {
    if (!auditCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<WorkProjectAuditEvent>>(
        pagePath(auditPath, auditCursor),
      );
      setAudit((current) => [...current, ...page.items]);
      setAuditCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load relationship history.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="work-projects-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Context / Typed relationships</p>
          <h2 id="work-projects-heading">Project context</h2>
        </div>
        <span className="cmd-count">{connections.length} additional shown</span>
      </div>
      <p className="cmd-section-intro">
        One source-backed task can appear in several projects with one shared
        status. A related project brief includes this task. New execution
        packets and direct agent work reads still use its primary project. These
        manual links do not grant capabilities or copy the original capture.
      </p>
      {loading && <p role="status">Loading project context...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {primary && (
        <p>
          Primary project:{" "}
          <a href={`/projects/${primary.id}`}>{primary.name}</a>
        </p>
      )}
      {!loading && connections.length === 0 && !error && (
        <RecordEmptyState
          title="No additional projects"
          description="Find another project to connect this record without duplicating it."
        />
      )}
      <ul className="cmd-record-list" aria-label="Additional Work projects">
        {connections.map((item) => (
          <li key={item.link.id}>
            <WorkProjectLinkCard
              relation={{
                projectId: item.project.id,
                projectName: item.project.name,
                linkId: item.link.id,
                lifecycle: item.link.lifecycle,
                recordedAt: item.link.createdAt,
              }}
            />
            <Button disabled={busy} onClick={() => unlink(item)} type="button">
              Unlink project
            </Button>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={loadMoreConnections}>
          Load more related projects
        </Button>
      )}
      {!loading && (
        <form className="cmd-form" onSubmit={link}>
          <label htmlFor="work-project-query">
            Find another project by name
          </label>
          <input
            id="work-project-query"
            maxLength={200}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            disabled={busy || !query.trim()}
            onClick={findProjects}
            type="button"
          >
            Find projects
          </Button>
          <label htmlFor="work-project-choice">Relate to project</label>
          <select
            id="work-project-choice"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Choose a project</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {choiceCursor && (
            <Button disabled={busy} onClick={loadMoreChoices} type="button">
              Load more project matches
            </Button>
          )}
          {appliedQuery && choices.length === 0 && !choiceCursor && (
            <p>No matching secondary projects. Try another name.</p>
          )}
          <Button disabled={busy || !selectedId} type="submit">
            {busy ? "Saving..." : "Relate project"}
          </Button>
        </form>
      )}
      {feedback && (
        <p className="cmd-form-success" role="status">
          {feedback}
        </p>
      )}
      <div className="cmd-section-heading">
        <h3>Relationship history</h3>
        <span className="cmd-count">{audit.length} shown</span>
      </div>
      <ol
        className="cmd-record-list"
        aria-label="Work project relationship history"
      >
        {audit.map((event) => (
          <li key={event.id} className="cmd-record-card">
            <span>
              {event.operation === "work.project_linked"
                ? "Related project"
                : "Unlinked project"}
            </span>{" "}
            <a href={`/projects/${event.projectId}`}>{event.projectId}</a>
            <p className="cmd-record-identity">
              <a href={`/api/v1/work-project-links/${event.linkId}`}>
                Exact relationship
              </a>{" "}
              · {event.actor} ·{" "}
              <time dateTime={event.createdAt}>{event.createdAt}</time>
            </p>
          </li>
        ))}
      </ol>
      {auditCursor && (
        <Button disabled={busy} onClick={loadMoreAudit}>
          Load older relationship history
        </Button>
      )}
    </section>
  );
}
