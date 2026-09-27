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
  priority?: "low" | "normal" | "high" | null;
  dueOn?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeItem {
  id: string;
  projectId: string;
  sourceCaptureId: string;
  kind: "note" | "link" | "document";
  title: string;
  content: string;
  url?: string | null;
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
  const [workView, setWorkView] = useState<"list" | "board">("list");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

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

  async function changeStatus(item: WorkItem) {
    if (busyTaskId) return;
    setBusyTaskId(item.id);
    setError(null);
    try {
      const updated = await apiJson<WorkItem>(
        `/api/v1/work-items/${item.id}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedStatus: item.status,
            status: item.status === "open" ? "done" : "open",
          }),
        },
      );
      setWork((current) =>
        current.map((record) => (record.id === updated.id ? updated : record)),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not change task status.",
      );
    } finally {
      setBusyTaskId(null);
    }
  }

  function taskCard(item: WorkItem) {
    return (
      <li className={styles.record} key={item.id}>
        <div className={styles.recordTop}>
          <strong>{item.title}</strong>
          <span className={styles.meta}>{item.status}</span>
        </div>
        {item.description && <p>{item.description}</p>}
        {(item.priority || item.dueOn) && (
          <p>
            {item.priority ? `${item.priority} priority` : "Priority unset"}
            {item.dueOn ? ` / due ${item.dueOn} UTC` : ""}
          </p>
        )}
        <div className={styles.recordActions}>
          <a href={`/work-items/${encodeURIComponent(item.id)}`}>Open task</a>
          <a
            href={`/inbox?captureId=${encodeURIComponent(item.sourceCaptureId)}`}
          >
            Original capture
          </a>
          <Button
            disabled={busyTaskId !== null}
            onClick={() => changeStatus(item)}
          >
            {busyTaskId === item.id
              ? "Saving..."
              : item.status === "open"
                ? "Mark done"
                : "Reopen"}
          </Button>
        </div>
      </li>
    );
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
            href={`/work?projectId=${encodeURIComponent(projectId)}`}
          >
            Open project work
          </a>
          <a
            className={styles.captureLink}
            href={`/knowledge?projectId=${encodeURIComponent(projectId)}`}
          >
            Open project knowledge
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
        File a capture into this project to create a task, note, or link. Each
        record keeps a path back to its original source.
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
            <div
              className={styles.viewSwitch}
              role="group"
              aria-label="Work view"
            >
              <Button
                aria-pressed={workView === "list"}
                onClick={() => setWorkView("list")}
              >
                List
              </Button>
              <Button
                aria-pressed={workView === "board"}
                onClick={() => setWorkView("board")}
              >
                Board
              </Button>
            </div>
            {work.length === 0 && !error && (
              <RecordEmptyState
                title="No work yet"
                description="File a capture as a task to start a traceable work list."
              />
            )}
            {workView === "list" ? (
              <ul className={styles.list} aria-label="Project work">
                {work.map(taskCard)}
              </ul>
            ) : (
              <div className={styles.board} aria-label="Project work board">
                {(["open", "done"] as const).map((status) => (
                  <section
                    className={styles.boardColumn}
                    key={status}
                    aria-label={`${status} tasks`}
                  >
                    <h4>
                      {status === "open" ? "Open" : "Done"}{" "}
                      <span className="cmd-count">
                        {work.filter((item) => item.status === status).length}{" "}
                        shown
                      </span>
                    </h4>
                    <ul className={styles.list}>
                      {work
                        .filter((item) => item.status === status)
                        .map(taskCard)}
                    </ul>
                  </section>
                ))}
              </div>
            )}
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
                title="No knowledge yet"
                description="File a capture as a note, link, or document to retain its context here."
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
                  {item.kind === "link" && item.url && (
                    <p>
                      <a href={item.url} rel="noreferrer" target="_blank">
                        Open saved external link
                      </a>
                    </p>
                  )}
                  {item.kind === "document" && (
                    <p>
                      <a
                        href={`/api/v1/captures/${encodeURIComponent(item.sourceCaptureId)}/original-file`}
                      >
                        Download exact original file
                      </a>
                    </p>
                  )}
                  <a href={`/knowledge-items/${encodeURIComponent(item.id)}`}>
                    Open knowledge record
                  </a>
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
