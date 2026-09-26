"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell, Button, KnowledgeRevisionCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export interface KnowledgeItemRecord {
  id: string;
  projectId: string;
  sourceCaptureId: string;
  kind: "note";
  title: string;
  content: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeRevisionRecord {
  id: string;
  version: number;
  previousTitle: string;
  previousContent: string;
  title: string;
  content: string;
  createdAt: string;
}

export default function KnowledgeItemWorkspace({
  knowledgeItemId,
}: {
  knowledgeItemId: string;
}) {
  const [item, setItem] = useState<KnowledgeItemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<KnowledgeRevisionRecord[]>([]);
  const [revisionCursor, setRevisionCursor] = useState<string | null>(null);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const revisionsPath = `/api/v1/knowledge-items/${encodeURIComponent(knowledgeItemId)}/revisions`;
  const currentItemId = item?.id;

  useEffect(() => {
    let active = true;
    apiJson<KnowledgeItemRecord>(
      `/api/v1/knowledge-items/${encodeURIComponent(knowledgeItemId)}`,
    )
      .then((record) => {
        if (active) {
          setItem(record);
          setTitleDraft(record.title);
          setContentDraft(record.content);
        }
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

  useEffect(() => {
    if (!currentItemId) return;
    let active = true;
    apiJson<PageResponse<KnowledgeRevisionRecord>>(pagePath(revisionsPath))
      .then((page) => {
        if (!active) return;
        setRevisions(page.items);
        setRevisionCursor(page.nextCursor);
        setRevisionError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setRevisionError(
            cause instanceof Error
              ? cause.message
              : "Revision history is unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [currentItemId, revisionsPath]);

  async function saveRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveFeedback(null);
    try {
      const updated = await apiJson<KnowledgeItemRecord>(revisionsPath, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: item.version ?? 1,
          title: titleDraft.trim(),
          content: contentDraft,
        }),
      });
      setItem(updated);
      setTitleDraft(updated.title);
      setContentDraft(updated.content);
      setSaveFeedback(
        "Knowledge note saved. The exact original capture is unchanged.",
      );
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not save note revision.",
      );
      return;
    } finally {
      setSaving(false);
    }
    try {
      const page = await apiJson<PageResponse<KnowledgeRevisionRecord>>(
        pagePath(revisionsPath),
      );
      setRevisions(page.items);
      setRevisionCursor(page.nextCursor);
      setRevisionError(null);
    } catch (cause) {
      setRevisionError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh revision history.",
      );
    }
  }

  async function loadMoreRevisions() {
    if (!revisionCursor || revisionsLoading) return;
    setRevisionsLoading(true);
    setRevisionError(null);
    try {
      const page = await apiJson<PageResponse<KnowledgeRevisionRecord>>(
        pagePath(revisionsPath, revisionCursor),
      );
      setRevisions((current) => [...current, ...page.items]);
      setRevisionCursor(page.nextCursor);
    } catch (cause) {
      setRevisionError(
        cause instanceof Error
          ? cause.message
          : "Could not load older revisions.",
      );
    } finally {
      setRevisionsLoading(false);
    }
  }

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
                  <dt>Version</dt>
                  <dd>{item.version ?? 1}</dd>
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
          <section
            className="cmd-detail-document"
            aria-labelledby="knowledge-edit-heading"
          >
            <p className="cmd-eyebrow">Local knowledge / Audited</p>
            <h2 id="knowledge-edit-heading">Revise this note</h2>
            <p>
              Edits update the current project note, search, and live brief. The
              original capture and previously saved execution packets stay as
              recorded.
            </p>
            <form className="cmd-form" onSubmit={saveRevision}>
              <label htmlFor="knowledge-title">Title</label>
              <input
                id="knowledge-title"
                maxLength={200}
                required
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
              />
              <label htmlFor="knowledge-content">Content</label>
              <textarea
                id="knowledge-content"
                maxLength={20_000}
                rows={8}
                value={contentDraft}
                onChange={(event) => setContentDraft(event.target.value)}
              />
              <Button
                type="submit"
                disabled={
                  saving ||
                  !titleDraft.trim() ||
                  (titleDraft.trim() === item.title &&
                    contentDraft === item.content)
                }
              >
                {saving ? "Saving note..." : "Save note revision"}
              </Button>
            </form>
            {saveFeedback && (
              <p className="cmd-form-success" role="status">
                {saveFeedback}
              </p>
            )}
            {saveError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {saveError}
              </p>
            )}
            <h3>Revision history</h3>
            {revisionError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {revisionError}
              </p>
            )}
            {revisions.length === 0 && !revisionError && (
              <p>No note revisions yet.</p>
            )}
            {revisions.length > 0 && (
              <ol className="cmd-record-list" aria-label="Note revisions">
                {revisions.map((revision) => (
                  <li key={revision.id}>
                    <KnowledgeRevisionCard revision={revision} />
                  </li>
                ))}
              </ol>
            )}
            {revisionCursor && (
              <Button disabled={revisionsLoading} onClick={loadMoreRevisions}>
                {revisionsLoading ? "Loading..." : "Load older revisions"}
              </Button>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
