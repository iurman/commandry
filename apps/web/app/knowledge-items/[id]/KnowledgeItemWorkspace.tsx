"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@commandry/ui";
import { apiJson } from "../../projects/api";

export interface KnowledgeItemRecord {
  id: string;
  projectId: string;
  sourceCaptureId: string;
  kind: "note";
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function KnowledgeItemWorkspace({
  knowledgeItemId,
}: {
  knowledgeItemId: string;
}) {
  const [item, setItem] = useState<KnowledgeItemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<KnowledgeItemRecord>(
      `/api/v1/knowledge-items/${encodeURIComponent(knowledgeItemId)}`,
    )
      .then((record) => {
        if (active) setItem(record);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Knowledge note is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [knowledgeItemId]);

  return (
    <AppShell current="Projects">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/projects">Projects</a>
        <span aria-hidden="true">/</span>
        {item && (
          <a href={`/projects/${encodeURIComponent(item.projectId)}`}>
            Project
          </a>
        )}
        {item && <span aria-hidden="true">/</span>}
        <span>Knowledge note</span>
      </nav>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading knowledge note...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {item && (
        <>
          <header className="cmd-page-header cmd-workspace-heading">
            <div>
              <p className="cmd-eyebrow">Project knowledge / Filed note</p>
              <h1>{item.title}</h1>
              <p className="cmd-lead">
                This saved note links to the original capture that motivated it.
              </p>
            </div>
            <span className="cmd-headline-mark" aria-hidden="true">
              Exact record
            </span>
          </header>
          <div className="cmd-detail-layout">
            <article
              className="cmd-detail-document"
              aria-labelledby="knowledge-body-heading"
            >
              <p className="cmd-eyebrow">Saved knowledge</p>
              <h2 id="knowledge-body-heading">Note body</h2>
              {item.content ? (
                <div className="cmd-detail-body">{item.content}</div>
              ) : (
                <p className="cmd-inline-state">No note body was recorded.</p>
              )}
            </article>
            <aside
              className="cmd-detail-source"
              aria-labelledby="knowledge-source-heading"
            >
              <p className="cmd-eyebrow">Provenance</p>
              <h2 id="knowledge-source-heading">Source and identity</h2>
              <p>
                <a
                  href={`/inbox?captureId=${encodeURIComponent(item.sourceCaptureId)}`}
                >
                  View exact original capture
                </a>
              </p>
              <dl className="cmd-detail-facts">
                <div>
                  <dt>Kind</dt>
                  <dd>Knowledge note</dd>
                </div>
                <div>
                  <dt>Record ID</dt>
                  <dd>
                    <code>{item.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Project ID</dt>
                  <dd>
                    <code>{item.projectId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    <time dateTime={item.createdAt}>{item.createdAt}</time>
                  </dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>
                    <time dateTime={item.updatedAt}>{item.updatedAt}</time>
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
}
