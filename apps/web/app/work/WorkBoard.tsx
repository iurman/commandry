"use client";

import { useEffect, useState } from "react";
import type { WorkspaceWorkItem } from "@commandry/contracts";
import { Button, RecordEmptyState, WorkBoardCard } from "@commandry/ui";
import { apiJson, type PageResponse } from "../projects/api";
import { workPagePath, type WorkFocus } from "./work-query";

type ColumnStatus = "open" | "done";
type ColumnState = {
  items: WorkspaceWorkItem[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
};

const statuses: ColumnStatus[] = ["open", "done"];
const initialColumn = (): ColumnState => ({
  items: [],
  nextCursor: null,
  loading: true,
  loadingMore: false,
});

function pageFor(
  status: ColumnStatus,
  projectId: string | null,
  focus: WorkFocus,
  asOf: string,
  cursor?: string,
) {
  return apiJson<PageResponse<WorkspaceWorkItem>>(
    workPagePath({ status, projectId, focus, asOf, cursor }),
  );
}

async function loadBoardPages(
  projectId: string | null,
  focus: WorkFocus,
  asOf: string,
): Promise<Record<ColumnStatus, ColumnState>> {
  const [openPage, donePage] = await Promise.all([
    pageFor("open", projectId, focus, asOf),
    pageFor("done", projectId, focus, asOf),
  ]);
  return {
    open: {
      items: openPage.items,
      nextCursor: openPage.nextCursor,
      loading: false,
      loadingMore: false,
    },
    done: {
      items: donePage.items,
      nextCursor: donePage.nextCursor,
      loading: false,
      loadingMore: false,
    },
  };
}

export default function WorkBoard({
  projectId,
  focus,
  asOf,
}: {
  projectId: string | null;
  focus: WorkFocus;
  asOf: string;
}) {
  const [columns, setColumns] = useState<Record<ColumnStatus, ColumnState>>({
    open: initialColumn(),
    done: initialColumn(),
  });
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadBoardPages(projectId, focus, asOf)
      .then((next) => {
        if (!active) return;
        setColumns(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : "Work board is unavailable.",
        );
        setColumns((current) => ({
          open: { ...current.open, loading: false },
          done: { ...current.done, loading: false },
        }));
      });
    return () => {
      active = false;
    };
  }, [projectId, focus, asOf]);

  async function loadMore(status: ColumnStatus) {
    const column = columns[status];
    if (!column.nextCursor || column.loadingMore) return;
    setColumns((current) => ({
      ...current,
      [status]: { ...current[status], loadingMore: true },
    }));
    setError(null);
    try {
      const page = await pageFor(
        status,
        projectId,
        focus,
        asOf,
        column.nextCursor,
      );
      setColumns((current) => ({
        ...current,
        [status]: {
          ...current[status],
          items: [
            ...current[status].items,
            ...page.items.filter(
              (item) =>
                !current[status].items.some((saved) => saved.id === item.id),
            ),
          ],
          nextCursor: page.nextCursor,
          loadingMore: false,
        },
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more tasks.",
      );
      setColumns((current) => ({
        ...current,
        [status]: { ...current[status], loadingMore: false },
      }));
    }
  }

  async function changeStatus(item: WorkspaceWorkItem) {
    if (busyTaskId) return;
    setBusyTaskId(item.id);
    setError(null);
    try {
      await apiJson(
        `/api/v1/work-items/${encodeURIComponent(item.id)}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedStatus: item.status,
            status: item.status === "open" ? "done" : "open",
          }),
        },
      );
      setColumns(await loadBoardPages(projectId, focus, asOf));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update task.",
      );
    } finally {
      setBusyTaskId(null);
    }
  }

  async function retry() {
    setError(null);
    setColumns({
      open: initialColumn(),
      done: initialColumn(),
    });
    try {
      setColumns(await loadBoardPages(projectId, focus, asOf));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Work board is unavailable.",
      );
      setColumns({
        open: { ...initialColumn(), loading: false },
        done: { ...initialColumn(), loading: false },
      });
    }
  }

  return (
    <>
      {error && (
        <div className="cmd-inline-state cmd-error" role="alert">
          <p>{error}</p>
          <Button onClick={retry}>Retry board</Button>
        </div>
      )}
      <div className="cmd-work-board" aria-label="Work board">
        {statuses.map((status) => {
          const column = columns[status];
          return (
            <section
              className="cmd-work-board-column"
              aria-label={`${status === "open" ? "Open" : "Done"} tasks`}
              key={status}
            >
              <div className="cmd-section-heading">
                <h3>{status === "open" ? "Open" : "Done"}</h3>
                <span className="cmd-count">{column.items.length} shown</span>
              </div>
              {column.loading && <p role="status">Loading {status} tasks...</p>}
              {!column.loading && column.items.length === 0 && !error && (
                <RecordEmptyState
                  title={`No ${status} tasks match`}
                  description="Change the focused filters or capture a new task."
                />
              )}
              {column.items.length > 0 && (
                <ul className="cmd-record-list" aria-label={`${status} cards`}>
                  {column.items.map((item) => (
                    <li key={item.id}>
                      <WorkBoardCard
                        item={item}
                        busy={busyTaskId === item.id}
                        onChangeStatus={() => changeStatus(item)}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {column.nextCursor && (
                <Button
                  disabled={column.loadingMore || busyTaskId !== null}
                  onClick={() => loadMore(status)}
                >
                  {column.loadingMore
                    ? "Loading..."
                    : `Load more ${status} tasks`}
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
