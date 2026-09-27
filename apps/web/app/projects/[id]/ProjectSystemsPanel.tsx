"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  SystemProjectConnection,
  SystemProjectLink,
  SystemSummary,
} from "@commandry/contracts";
import { Button, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../api";

export default function ProjectSystemsPanel({
  projectId,
  onChange,
}: {
  projectId: string;
  onChange: () => void;
}) {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/systems`;
  const [connections, setConnections] = useState<SystemProjectConnection[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [choices, setChoices] = useState<SystemSummary[]>([]);
  const [choiceCursor, setChoiceCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<SystemProjectConnection>>(pagePath(path)),
      apiJson<PageResponse<SystemSummary>>(
        `${pagePath("/api/v1/systems")}&lifecycle=active`,
      ),
    ])
      .then(([linked, systems]) => {
        if (!active) return;
        setConnections(linked.items);
        setCursor(linked.nextCursor);
        setChoices(systems.items);
        setChoiceCursor(systems.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Related systems are unavailable.",
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
        cause instanceof Error ? cause.message : "Could not load more systems.",
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
      const page = await apiJson<PageResponse<SystemSummary>>(
        `${pagePath("/api/v1/systems", choiceCursor)}&lifecycle=active`,
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
          : "Could not load more system choices.",
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
      const saved = await apiJson<SystemProjectConnection>(
        `/api/v1/systems/${selectedId}/projects`,
        { method: "POST", body: JSON.stringify({ projectId }) },
      );
      setConnections((current) =>
        current.some((item) => item.link.id === saved.link.id)
          ? current
          : [saved, ...current],
      );
      setSelectedId("");
      setFeedback(
        `Related ${saved.system.name} to this project. The live brief can now cite the exact link.`,
      );
      onChange();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not relate system.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlink(connection: SystemProjectConnection) {
    if (busy) return;
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
        `Unlinked ${connection.system.name}. The relationship remains in history.`,
      );
      onChange();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not unlink system.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="project-systems-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Context / Operated systems</p>
          <h2 id="project-systems-heading">Related systems</h2>
        </div>
        <a href="/systems">Manage systems</a>
      </div>
      <p className="cmd-section-intro">
        Systems represent continuing capabilities. Relate this project to the
        systems it changes or uses without duplicating either record.
      </p>
      {loading && <p role="status">Loading project systems...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && connections.length === 0 && !error && (
        <RecordEmptyState
          title="No related systems"
          description="Create a system or relate an existing one to this project."
        />
      )}
      <ul className="cmd-record-list" aria-label="Project systems">
        {connections.map((item) => (
          <li key={item.link.id} className="cmd-record-card">
            <a href={`/systems/${item.system.id}`}>{item.system.name}</a>
            <p>{item.system.summary || "No system summary recorded."}</p>
            <p className="cmd-record-identity">
              <a href={`/api/v1/system-project-links/${item.link.id}`}>
                View exact relates-to relationship
              </a>
            </p>
            <Button disabled={busy} onClick={() => unlink(item)} type="button">
              Unlink system
            </Button>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={loadMoreLinks}>
          Load more related systems
        </Button>
      )}
      {!loading && (
        <form className="cmd-form" onSubmit={link}>
          <label htmlFor="project-system-choice">Add a related system</label>
          <select
            id="project-system-choice"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Choose a system</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {choiceCursor && (
            <Button disabled={busy} onClick={loadMoreChoices} type="button">
              Load more system choices
            </Button>
          )}
          <Button disabled={busy || !selectedId} type="submit">
            {busy ? "Saving..." : "Relate system"}
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
