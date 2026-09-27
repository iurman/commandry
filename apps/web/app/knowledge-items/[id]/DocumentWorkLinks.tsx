"use client";

import { useEffect, useState } from "react";
import type { WorkItemAttachment } from "@commandry/contracts";
import { Button, RecordEmptyState, WorkAttachmentCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export default function DocumentWorkLinks({
  knowledgeItemId,
}: {
  knowledgeItemId: string;
}) {
  const path = `/api/v1/knowledge-items/${encodeURIComponent(knowledgeItemId)}/work-attachments`;
  const [links, setLinks] = useState<WorkItemAttachment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<WorkItemAttachment>>(pagePath(path))
      .then((page) => {
        if (!active) return;
        setLinks(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Linked tasks are unavailable.",
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
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<WorkItemAttachment>>(
        pagePath(path, cursor),
      );
      setLinks((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more tasks.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section
      className="cmd-detail-document"
      aria-labelledby="document-work-heading"
    >
      <p className="cmd-eyebrow">Typed links / Project work</p>
      <h2 id="document-work-heading">Tasks using this document</h2>
      <p>
        Each task link stays in project scope and can be removed from the task.
      </p>
      {loading && <p role="status">Loading linked tasks...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && links.length === 0 && !error && (
        <RecordEmptyState
          title="No tasks linked"
          description="Attach this document from a task in the same project."
        />
      )}
      {links.length > 0 && (
        <ul className="cmd-record-list" aria-label="Tasks using this document">
          {links.map((link) => (
            <li key={link.id}>
              <WorkAttachmentCard attachment={link} />
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? "Loading..." : "Load more linked tasks"}
        </Button>
      )}
    </section>
  );
}
