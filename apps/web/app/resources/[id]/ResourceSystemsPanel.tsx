"use client";

import { useEffect, useState } from "react";
import type { SystemResourceConnection } from "@commandry/contracts";
import { Button, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export default function ResourceSystemsPanel({
  resourceId,
}: {
  resourceId: string;
}) {
  const path = `/api/v1/resources/${encodeURIComponent(resourceId)}/systems`;
  const [connections, setConnections] = useState<SystemResourceConnection[]>(
    [],
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SystemResourceConnection>>(pagePath(path))
      .then((page) => {
        if (!active) return;
        setConnections(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Supporting systems are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function loadMore() {
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
        cause instanceof Error ? cause.message : "Could not load more systems.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="resource-systems-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Graph / Supporting role</p>
          <h2 id="resource-systems-heading">Systems supported</h2>
        </div>
        <a href="/systems">Browse systems</a>
      </div>
      <p className="cmd-section-intro">
        These are manually recorded relationships. They do not change the
        resource&apos;s primary tree position or report operational health.
      </p>
      {loading && <p role="status">Loading supported systems...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && connections.length === 0 && !error && (
        <RecordEmptyState
          title="No system links"
          description="Open a system to link this resource as supporting it."
        />
      )}
      <ul className="cmd-record-list" aria-label="Resource systems">
        {connections.map((item) => (
          <li key={item.link.id} className="cmd-record-card">
            <a href={`/systems/${item.system.id}`}>{item.system.name}</a>
            <p>{item.system.summary || "No system summary recorded."}</p>
            <p className="cmd-record-identity">
              <a href={`/api/v1/system-resource-links/${item.link.id}`}>
                View exact supports relationship
              </a>
            </p>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={loadMore}>
          Load more supported systems
        </Button>
      )}
    </section>
  );
}
