"use client";

import { useEffect, useState } from "react";
import type { SystemAuditEvent } from "@commandry/contracts";
import { Button } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export default function SystemAuditPanel({
  systemId,
  revision,
}: {
  systemId: string;
  revision: number;
}) {
  const path = `/api/v1/systems/${encodeURIComponent(systemId)}/audit`;
  const [events, setEvents] = useState<SystemAuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SystemAuditEvent>>(pagePath(path))
      .then((page) => {
        if (!active) return;
        setEvents(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "System history is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<SystemAuditEvent>>(
        pagePath(path, cursor),
      );
      setEvents((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more system history.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="system-audit-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Trace / Manual local changes</p>
          <h2 id="system-audit-heading">Audit history</h2>
        </div>
        <span className="cmd-count">{events.length} shown</span>
      </div>
      {loading && <p role="status">Loading system history...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      <ul
        className="cmd-automation-audit-list"
        aria-label="System audit events"
      >
        {events.map((event) => (
          <li key={event.id}>
            <strong>{event.operation}</strong>
            <p>{event.actor}</p>
            <time dateTime={event.createdAt}>{event.createdAt}</time>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={loadMore}>
          Load more audit events
        </Button>
      )}
    </section>
  );
}
