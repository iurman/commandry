"use client";

import { useEffect, useState } from "react";
import type { WorkItem, WorkspaceWorkItem } from "@commandry/contracts";
import { workDueLabel } from "@commandry/domain";
import {
  AppShell,
  Button,
  RecordEmptyState,
  UpcomingWorkCard,
  WorkTypeBadge,
} from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../projects/api";

const upcomingPath = "/api/v1/work-items/upcoming";
const workPath = "/api/v1/work-items";
type WorkFilter = "open" | "done" | "all";

function workPagePath(
  filter: WorkFilter,
  projectId: string | null,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: "20" });
  if (filter !== "all") params.set("status", filter);
  if (projectId) params.set("projectId", projectId);
  if (cursor) params.set("cursor", cursor);
  return `${workPath}?${params}`;
}

export default function WorkWorkspace({
  projectId,
}: {
  projectId: string | null;
}) {
  const [filter, setFilter] = useState<WorkFilter>("open");
  const [work, setWork] = useState<WorkspaceWorkItem[]>([]);
  const [workCursor, setWorkCursor] = useState<string | null>(null);
  const [workLoading, setWorkLoading] = useState(true);
  const [workLoadingMore, setWorkLoadingMore] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utcToday = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<WorkspaceWorkItem>>(workPagePath(filter, projectId))
      .then((page) => {
        if (!active) return;
        setWork(page.items);
        setWorkCursor(page.nextCursor);
        setWorkError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setWorkError(
            cause instanceof Error ? cause.message : "Work is unavailable.",
          );
      })
      .finally(() => {
        if (active) setWorkLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, projectId]);

  useEffect(() => {
    if (projectId) return;
    let active = true;
    apiJson<PageResponse<WorkItem>>(pagePath(upcomingPath))
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Upcoming work is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<WorkItem>>(
        pagePath(upcomingPath, cursor),
      );
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more work.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreWork() {
    if (!workCursor || workLoadingMore) return;
    setWorkLoadingMore(true);
    setWorkError(null);
    try {
      const page = await apiJson<PageResponse<WorkspaceWorkItem>>(
        workPagePath(filter, projectId, workCursor),
      );
      setWork((current) => [...current, ...page.items]);
      setWorkCursor(page.nextCursor);
    } catch (cause) {
      setWorkError(
        cause instanceof Error ? cause.message : "Could not load more tasks.",
      );
    } finally {
      setWorkLoadingMore(false);
    }
  }

  async function changeStatus(item: WorkspaceWorkItem) {
    if (busyTaskId) return;
    setBusyTaskId(item.id);
    setWorkError(null);
    try {
      const updated = await apiJson<WorkItem>(
        `/api/v1/work-items/${encodeURIComponent(item.id)}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedStatus: item.status,
            status: item.status === "open" ? "done" : "open",
          }),
        },
      );
      setWork((current) =>
        filter === "all"
          ? current.map((record) =>
              record.id === updated.id ? { ...record, ...updated } : record,
            )
          : current.filter((record) => record.id !== updated.id),
      );
      if (updated.status === "done")
        setItems((current) =>
          current.filter((record) => record.id !== item.id),
        );
    } catch (cause) {
      setWorkError(
        cause instanceof Error ? cause.message : "Could not update task.",
      );
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <AppShell current="Work">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Command Center</a>
        <span aria-hidden="true">/</span>
        <span>Work</span>
      </nav>
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Work / Across projects</p>
          <h1>Work</h1>
          <p className="cmd-lead">
            Review every local task, its project, planning, and exact original
            capture. Changes here update the same task shown in its project.
          </p>
        </div>
        <a className="cmd-headline-mark" href="/inbox">
          Capture new work
        </a>
      </header>
      {projectId && (
        <p className="cmd-section-intro">
          Showing tasks for{" "}
          <a href={`/projects/${encodeURIComponent(projectId)}`}>
            this project
          </a>
          . <a href="/work">Show all projects</a>.
        </p>
      )}
      <section
        className="cmd-workspace-section cmd-global-work-section"
        aria-labelledby="all-work-heading"
      >
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">One task / Many views</p>
            <h2 id="all-work-heading">All work</h2>
          </div>
          <span className="cmd-count">{work.length} shown</span>
        </div>
        <div
          role="group"
          aria-label="Task status"
          className="cmd-workspace-filters"
        >
          {(["open", "done", "all"] as const).map((choice) => (
            <Button
              aria-pressed={filter === choice}
              disabled={workLoadingMore || busyTaskId !== null}
              key={choice}
              onClick={() => {
                setWorkLoading(true);
                setWork([]);
                setWorkCursor(null);
                setFilter(choice);
              }}
            >
              {choice === "all"
                ? "All tasks"
                : choice === "open"
                  ? "Open"
                  : "Done"}
            </Button>
          ))}
        </div>
        {workLoading && (
          <p className="cmd-inline-state" role="status">
            Loading work...
          </p>
        )}
        {workError && (
          <p className="cmd-inline-state cmd-error" role="alert">
            {workError}
          </p>
        )}
        {!workLoading && work.length === 0 && !workError && (
          <RecordEmptyState
            title="No tasks in this view"
            description="Capture a thought in the Inbox and file it as a task. Its original remains available."
          />
        )}
        {!workLoading && work.length > 0 && (
          <ul className="cmd-record-list" aria-label="All work">
            {work.map((item) => (
              <li key={item.id}>
                <article className="cmd-record-card">
                  <div className="cmd-record-topline">
                    <WorkTypeBadge
                      type={item.workType ?? "task"}
                      status={item.status}
                    />
                    <span className="cmd-count">
                      {item.priority
                        ? `${item.priority} priority`
                        : "Priority unset"}
                    </span>
                  </div>
                  <h3 className="cmd-record-title">
                    <a href={`/work-items/${encodeURIComponent(item.id)}`}>
                      {item.title}
                    </a>
                  </h3>
                  {item.description && (
                    <p className="cmd-record-description">{item.description}</p>
                  )}
                  {item.contextLink && (
                    <p className="cmd-record-identity">
                      Shared into this project through a{" "}
                      <a
                        href={`/api/v1/work-project-links/${item.contextLink.id}`}
                      >
                        typed relationship
                      </a>
                      .
                    </p>
                  )}
                  {item.generatedFromWorkItemId && (
                    <p className="cmd-record-identity">
                      Local worker-created task from{" "}
                      <a
                        href={`/work-items/${encodeURIComponent(item.generatedFromWorkItemId)}`}
                      >
                        its recurring source
                      </a>
                      .
                    </p>
                  )}
                  {item.dueOn && (
                    <p>
                      Due <time dateTime={item.dueOn}>{item.dueOn}</time> UTC
                    </p>
                  )}
                  <p>Assigned: {item.assigneeLabel ?? "Unassigned"}</p>
                  <p className="cmd-record-identity">
                    <a href={`/projects/${encodeURIComponent(item.projectId)}`}>
                      {item.projectName}
                    </a>
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
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
        {workCursor && (
          <Button disabled={workLoadingMore} onClick={loadMoreWork}>
            {workLoadingMore ? "Loading..." : "Load more tasks"}
          </Button>
        )}
      </section>
      {!projectId && (
        <section
          className="cmd-workspace-section"
          aria-labelledby="upcoming-work-heading"
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Due dates / UTC</p>
              <h2 id="upcoming-work-heading">Upcoming work</h2>
            </div>
            <span className="cmd-count">{items.length} shown</span>
          </div>
          <p className="cmd-section-intro">
            Open dated tasks ordered by due date. Overdue means before today in
            UTC.
          </p>
          {loading && (
            <p className="cmd-inline-state" role="status">
              Loading upcoming work...
            </p>
          )}
          {error && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {error}
            </p>
          )}
          {!loading && items.length === 0 && !error && (
            <RecordEmptyState
              title="No dated open tasks"
              description="File a capture as a task, then set a due date from its task page."
            />
          )}
          {items.length > 0 && (
            <ul className="cmd-record-list" aria-label="Upcoming work">
              {items.map((item) => {
                if (!item.dueOn) return null;
                const dueState = workDueLabel(
                  item.dueOn,
                  item.status,
                  utcToday,
                );
                if (dueState === "none") return null;
                return (
                  <li key={item.id}>
                    <UpcomingWorkCard
                      task={{
                        id: item.id,
                        projectId: item.projectId,
                        title: item.title,
                        priority: item.priority ?? null,
                        dueOn: item.dueOn,
                        dueState,
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {cursor && (
            <Button disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading..." : "Load more work"}
            </Button>
          )}
        </section>
      )}
    </AppShell>
  );
}
