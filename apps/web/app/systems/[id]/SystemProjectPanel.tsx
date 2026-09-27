"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  ProjectSummary,
  SystemProjectConnection,
  SystemProjectLink,
} from "@commandry/contracts";
import { Button, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";
import { searchNamedChoices } from "./searchChoices";

export default function SystemProjectPanel({
  systemId,
  archived,
  onChange,
}: {
  systemId: string;
  archived: boolean;
  onChange: () => void;
}) {
  const path = `/api/v1/systems/${encodeURIComponent(systemId)}/projects`;
  const [connections, setConnections] = useState<SystemProjectConnection[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [choices, setChoices] = useState<Pick<ProjectSummary, "id" | "name">[]>(
    [],
  );
  const [choiceCursor, setChoiceCursor] = useState<string | null>(null);
  const [choiceQuery, setChoiceQuery] = useState("");
  const [appliedChoiceQuery, setAppliedChoiceQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<SystemProjectConnection>>(pagePath(path)),
      apiJson<PageResponse<ProjectSummary>>(pagePath("/api/v1/projects")),
    ])
      .then(([linked, projects]) => {
        if (!active) return;
        setConnections(linked.items);
        setCursor(linked.nextCursor);
        setChoices(projects.items);
        setChoiceCursor(projects.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Related projects are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function loadMoreLinks() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<SystemProjectConnection>>(
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
          : "Could not load more related projects.",
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
      const page = appliedChoiceQuery
        ? await searchNamedChoices("project", appliedChoiceQuery, choiceCursor)
        : await apiJson<PageResponse<ProjectSummary>>(
            pagePath("/api/v1/projects", choiceCursor),
          );
      setChoices((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setChoiceCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more project choices.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function findChoices() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const query = choiceQuery.trim();
      const page = query
        ? await searchNamedChoices("project", query)
        : await apiJson<PageResponse<ProjectSummary>>(
            pagePath("/api/v1/projects"),
          );
      setChoices(page.items);
      setChoiceCursor(page.nextCursor);
      setAppliedChoiceQuery(query);
      setSelectedId("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not find projects.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || busy || archived) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<SystemProjectConnection>(path, {
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
        `Related ${saved.project.name} to this system. Its project record is unchanged.`,
      );
      onChange();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not relate project.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlink(connection: SystemProjectConnection) {
    if (busy || archived) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await apiJson<SystemProjectLink>(
        `/api/v1/system-project-links/${connection.link.id}/archive`,
        { method: "PUT" },
      );
      setConnections((current) =>
        current.filter((item) => item.link.id !== connection.link.id),
      );
      setFeedback(
        `Unlinked ${connection.project.name}. The exact relationship remains in history.`,
      );
      onChange();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not unlink project.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="system-projects-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Purpose / Work context</p>
          <h2 id="system-projects-heading">Related projects</h2>
        </div>
        <span className="cmd-count">{connections.length} shown</span>
      </div>
      <p className="cmd-section-intro">
        Projects organize change; this system models a capability operated over
        time. The local relates-to edge is independent of domain ownership.
      </p>
      {loading && <p role="status">Loading related projects...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && connections.length === 0 && !error && (
        <RecordEmptyState
          title="No related projects"
          description="Link a project whose work changes or uses this system."
        />
      )}
      <ul className="cmd-record-list" aria-label="System projects">
        {connections.map((item) => (
          <li key={item.link.id} className="cmd-record-card">
            <a href={`/projects/${item.project.id}`}>{item.project.name}</a>
            <p>{item.project.summary || "No project summary recorded."}</p>
            <p className="cmd-record-identity">
              <a href={`/api/v1/system-project-links/${item.link.id}`}>
                View exact relates-to relationship
              </a>
            </p>
            {!archived && (
              <Button
                disabled={busy}
                onClick={() => unlink(item)}
                type="button"
              >
                Unlink project
              </Button>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={loadMoreLinks}>
          Load more related projects
        </Button>
      )}
      {!archived && !loading && (
        <form className="cmd-form" onSubmit={link}>
          <label htmlFor="system-project-query">Find a project by name</label>
          <input
            id="system-project-query"
            maxLength={200}
            value={choiceQuery}
            onChange={(event) => setChoiceQuery(event.target.value)}
          />
          <Button disabled={busy} onClick={findChoices} type="button">
            Find projects
          </Button>
          <label htmlFor="system-project-choice">Add a related project</label>
          <select
            id="system-project-choice"
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
          {appliedChoiceQuery && choices.length === 0 && !choiceCursor && (
            <p>No matching projects. Try another name.</p>
          )}
          {choiceCursor && (
            <Button disabled={busy} onClick={loadMoreChoices} type="button">
              Load more project choices
            </Button>
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
    </section>
  );
}
