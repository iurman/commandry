"use client";

import { useEffect, useState } from "react";
import type { WorkItem } from "@commandry/contracts";
import { workDueLabel } from "@commandry/domain";
import {
  AppShell,
  Button,
  RecordEmptyState,
  UpcomingWorkCard,
} from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../projects/api";

const upcomingPath = "/api/v1/work-items/upcoming";

export default function WorkPage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utcToday = new Date().toISOString().slice(0, 10);

  useEffect(() => {
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
  }, []);

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

  return (
    <AppShell current="Projects">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Command Center</a>
        <span aria-hidden="true">/</span>
        <span>Upcoming work</span>
      </nav>
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Work / Across projects</p>
          <h1>Upcoming work</h1>
          <p className="cmd-lead">
            Open tasks with a local due date, ordered by date. Overdue means
            before today in UTC. Every task links to its project and original
            capture.
          </p>
        </div>
        <span className="cmd-headline-mark">{items.length} shown</span>
      </header>
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
            const dueState = workDueLabel(item.dueOn, item.status, utcToday);
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
    </AppShell>
  );
}
