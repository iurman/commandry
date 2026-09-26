"use client";

import { useEffect, useState } from "react";
import { Button, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../api";
import styles from "./ProjectContent.module.css";

interface WorkItem {
  id: string;
  projectId: string;
  sourceCaptureId: string;
  title: string;
  description: string;
  status: "open" | "done";
  createdAt: string;
}

interface KnowledgeItem {
  id: string;
  projectId: string;
  sourceCaptureId: string;
  kind: "note";
  title: string;
  content: string;
  createdAt: string;
}

export default function ProjectContent({ projectId }: { projectId: string }) {
  const workPath = `/api/v1/projects/${encodeURIComponent(projectId)}/work`;
  const knowledgePath = `/api/v1/projects/${encodeURIComponent(projectId)}/knowledge`;
  const [work, setWork] = useState<WorkItem[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [workCursor, setWorkCursor] = useState<string | null>(null);
  const [knowledgeCursor, setKnowledgeCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<"work" | "knowledge" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<WorkItem>>(pagePath(workPath)),
      apiJson<PageResponse<KnowledgeItem>>(pagePath(knowledgePath)),
    ])
      .then(([workPage, knowledgePage]) => {
        if (!active) return;
        setWork(workPage.items);
        setKnowledge(knowledgePage.items);
        setWorkCursor(workPage.nextCursor);
        setKnowledgeCursor(knowledgePage.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Project content is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workPath, knowledgePath]);

  async function loadMore(kind: "work" | "knowledge") {
    const cursor = kind === "work" ? workCursor : knowledgeCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(kind);
    setError(null);
    try {
      if (kind === "work") {
        const page = await apiJson<PageResponse<WorkItem>>(
          pagePath(workPath, cursor),
        );
        setWork((items) => [...items, ...page.items]);
        setWorkCursor(page.nextCursor);
      } else {
        const page = await apiJson<PageResponse<KnowledgeItem>>(
          pagePath(knowledgePath, cursor),
        );
        setKnowledge((items) => [...items, ...page.items]);
        setKnowledgeCursor(page.nextCursor);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more records.",
      );
    } finally {
      setLoadingMore(null);
    }
  }

  return (
    <div className={styles.content}>
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">From capture to context</p>
          <h2>Work and knowledge</h2>
        </div>
        <div className={styles.actions}>
          <a className={styles.captureLink} href="/inbox">
            Open Inbox
          </a>
          <a
            className={styles.captureLink}
            href={`/search?projectId=${encodeURIComponent(projectId)}`}
          >
            Search this project
          </a>
        </div>
      </div>
      <p className="cmd-section-intro">
        File a capture into this project to create a task or note. Each record
        keeps a path back to its original source.
      </p>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading work and knowledge...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && (
        <div className={styles.grid}>
          <section
            className="cmd-workspace-section"
            aria-labelledby="work-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Actionable</p>
                <h3 id="work-heading">Work</h3>
              </div>
              <span className="cmd-count">{work.length} shown</span>
            </div>
            {work.length === 0 && !error && (
              <RecordEmptyState
                title="No work yet"
                description="File a capture as a task to start a traceable work list."
              />
            )}
            <ul className={styles.list} aria-label="Project work">
              {work.map((item) => (
                <li className={styles.record} key={item.id}>
                  <div className={styles.recordTop}>
                    <strong>{item.title}</strong>
                    <span className={styles.meta}>{item.status}</span>
                  </div>
                  {item.description && <p>{item.description}</p>}
                  <a
                    href={`/inbox?captureId=${encodeURIComponent(item.sourceCaptureId)}`}
                  >
                    View original capture
                  </a>
                </li>
              ))}
            </ul>
            {workCursor && (
              <Button
                disabled={loadingMore !== null}
                onClick={() => loadMore("work")}
              >
                {loadingMore === "work" ? "Loading..." : "Load more work"}
              </Button>
            )}
          </section>
          <section
            className="cmd-workspace-section"
            aria-labelledby="knowledge-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Project memory</p>
                <h3 id="knowledge-heading">Knowledge</h3>
              </div>
              <span className="cmd-count">{knowledge.length} shown</span>
            </div>
            {knowledge.length === 0 && !error && (
              <RecordEmptyState
                title="No notes yet"
                description="File a capture as a note to retain its context here."
              />
            )}
            <ul className={styles.list} aria-label="Project knowledge">
              {knowledge.map((item) => (
                <li className={styles.record} key={item.id}>
                  <div className={styles.recordTop}>
                    <strong>{item.title}</strong>
                    <span className={styles.meta}>{item.kind}</span>
                  </div>
                  {item.content && <p>{item.content}</p>}
                  <a
                    href={`/inbox?captureId=${encodeURIComponent(item.sourceCaptureId)}`}
                  >
                    View original capture
                  </a>
                </li>
              ))}
            </ul>
            {knowledgeCursor && (
              <Button
                disabled={loadingMore !== null}
                onClick={() => loadMore("knowledge")}
              >
                {loadingMore === "knowledge"
                  ? "Loading..."
                  : "Load more knowledge"}
              </Button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
