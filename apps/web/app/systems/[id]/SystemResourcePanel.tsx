"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  ResourceSummary,
  SystemResourceConnection,
  SystemResourceLink,
} from "@commandry/contracts";
import { Button, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";
import { searchNamedChoices } from "../../projects/searchChoices";

export default function SystemResourcePanel({
  systemId,
  archived,
  onChange,
}: {
  systemId: string;
  archived: boolean;
  onChange: () => void;
}) {
  const path = `/api/v1/systems/${encodeURIComponent(systemId)}/resources`;
  const [connections, setConnections] = useState<SystemResourceConnection[]>(
    [],
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [choices, setChoices] = useState<
    Pick<ResourceSummary, "id" | "name">[]
  >([]);
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
      apiJson<PageResponse<SystemResourceConnection>>(pagePath(path)),
      apiJson<PageResponse<ResourceSummary>>(pagePath("/api/v1/resources")),
    ])
      .then(([linked, resources]) => {
        if (!active) return;
        setConnections(linked.items);
        setCursor(linked.nextCursor);
        setChoices(resources.items);
        setChoiceCursor(resources.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Supporting resources are unavailable.",
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
      const page = await apiJson<PageResponse<SystemResourceConnection>>(
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
          : "Could not load more supporting resources.",
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
        ? await searchNamedChoices("resource", appliedChoiceQuery, choiceCursor)
        : await apiJson<PageResponse<ResourceSummary>>(
            pagePath("/api/v1/resources", choiceCursor),
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
          : "Could not load more resource choices.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function findChoices() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSelectedId("");
    try {
      const query = choiceQuery.trim();
      const page = query
        ? await searchNamedChoices("resource", query)
        : await apiJson<PageResponse<ResourceSummary>>(
            pagePath("/api/v1/resources"),
          );
      setChoices(page.items);
      setChoiceCursor(page.nextCursor);
      setAppliedChoiceQuery(query);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not find resources.",
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
      const saved = await apiJson<SystemResourceConnection>(path, {
        method: "POST",
        body: JSON.stringify({ resourceId: selectedId }),
      });
      setConnections((current) =>
        current.some((item) => item.link.id === saved.link.id)
          ? current
          : [saved, ...current],
      );
      setSelectedId("");
      setFeedback(
        `Linked ${saved.resource.name} as supporting this system. Its health remains unknown until observed.`,
      );
      onChange();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not link resource.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlink(connection: SystemResourceConnection) {
    if (busy || archived) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await apiJson<SystemResourceLink>(
        `/api/v1/system-resource-links/${connection.link.id}/archive`,
        { method: "PUT" },
      );
      setConnections((current) =>
        current.filter((item) => item.link.id !== connection.link.id),
      );
      setFeedback(
        `Unlinked ${connection.resource.name}. The resource and exact relationship history remain.`,
      );
      onChange();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not unlink resource.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="system-resources-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Composition / Concrete things</p>
          <h2 id="system-resources-heading">Supporting resources</h2>
        </div>
        <span className="cmd-count">{connections.length} shown</span>
      </div>
      <p className="cmd-section-intro">
        A resource can support more than one system or project. This link does
        not change its primary resource hierarchy or assert live health.
      </p>
      {loading && <p role="status">Loading supporting resources...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && connections.length === 0 && !error && (
        <RecordEmptyState
          title="No supporting resources"
          description="Link a concrete resource that helps provide this system's capability."
        />
      )}
      <ul className="cmd-record-list" aria-label="System resources">
        {connections.map((item) => (
          <li key={item.link.id} className="cmd-record-card">
            <a href={`/resources/${item.resource.id}`}>{item.resource.name}</a>
            <p>
              {item.resource.kind}.{" "}
              {item.resource.lastObservedAt
                ? `Last observed ${item.resource.lastObservedAt}.`
                : "No operational observation recorded."}
            </p>
            <p className="cmd-record-identity">
              <a href={`/api/v1/system-resource-links/${item.link.id}`}>
                View exact supports relationship
              </a>
            </p>
            {!archived && (
              <Button
                disabled={busy}
                onClick={() => unlink(item)}
                type="button"
              >
                Unlink resource
              </Button>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={loadMoreLinks}>
          Load more supporting resources
        </Button>
      )}
      {!archived && !loading && (
        <form className="cmd-form" onSubmit={link}>
          <label htmlFor="system-resource-query">Find a resource by name</label>
          <input
            id="system-resource-query"
            maxLength={200}
            value={choiceQuery}
            onChange={(event) => setChoiceQuery(event.target.value)}
          />
          <Button disabled={busy} onClick={findChoices} type="button">
            Find resources
          </Button>
          <label htmlFor="system-resource-choice">
            Add a supporting resource
          </label>
          <select
            id="system-resource-choice"
            value={selectedId}
            disabled={busy}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Choose a resource</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {appliedChoiceQuery && choices.length === 0 && !choiceCursor && (
            <p>No matching resources. Try another name.</p>
          )}
          {choiceCursor && (
            <Button disabled={busy} onClick={loadMoreChoices} type="button">
              Load more resource choices
            </Button>
          )}
          <Button disabled={busy || !selectedId} type="submit">
            {busy ? "Saving..." : "Link supporting resource"}
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
