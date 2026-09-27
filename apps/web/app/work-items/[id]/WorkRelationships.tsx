"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { WorkItemRelation } from "@commandry/contracts";
import { Button, WorkRelationCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

type Direction = "incoming" | "outgoing";
type Mode = "parent" | "child" | "blocked_by" | "blocks";
type Choice = {
  id: string;
  projectId: string;
  title: string;
  workType?: "task" | "initiative" | "subtask";
  status: "open" | "done";
};

function relationPath(
  workItemId: string,
  direction: Direction,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ direction, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/work-items/${encodeURIComponent(workItemId)}/relations?${params}`;
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function WorkRelationships({
  workItemId,
  projectId,
  workType,
  onStructureChanged,
}: {
  workItemId: string;
  projectId: string;
  workType: "task" | "initiative" | "subtask";
  onStructureChanged: () => Promise<void>;
}) {
  const [incoming, setIncoming] = useState<WorkItemRelation[]>([]);
  const [outgoing, setOutgoing] = useState<WorkItemRelation[]>([]);
  const [incomingCursor, setIncomingCursor] = useState<string | null>(null);
  const [outgoingCursor, setOutgoingCursor] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [choiceCursor, setChoiceCursor] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(
    workType === "initiative" ? "child" : "parent",
  );
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState<Direction | "choices" | null>(
    null,
  );
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const choicesPath = `/api/v1/projects/${encodeURIComponent(projectId)}/work`;

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<WorkItemRelation>>(
        relationPath(workItemId, "incoming"),
      ),
      apiJson<PageResponse<WorkItemRelation>>(
        relationPath(workItemId, "outgoing"),
      ),
      apiJson<PageResponse<Choice>>(pagePath(choicesPath)),
    ])
      .then(([incomingPage, outgoingPage, choicePage]) => {
        if (!active) return;
        setIncoming(incomingPage.items);
        setIncomingCursor(incomingPage.nextCursor);
        setOutgoing(outgoingPage.items);
        setOutgoingCursor(outgoingPage.nextCursor);
        setChoices(
          choicePage.items.filter(
            (item) => item.id !== workItemId && item.projectId === projectId,
          ),
        );
        setChoiceCursor(choicePage.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(message(cause, "Could not load work relationships."));
      });
    return () => {
      active = false;
    };
  }, [workItemId, projectId, choicesPath]);

  async function refresh() {
    const [incomingPage, outgoingPage] = await Promise.all([
      apiJson<PageResponse<WorkItemRelation>>(
        relationPath(workItemId, "incoming"),
      ),
      apiJson<PageResponse<WorkItemRelation>>(
        relationPath(workItemId, "outgoing"),
      ),
    ]);
    setIncoming(incomingPage.items);
    setIncomingCursor(incomingPage.nextCursor);
    setOutgoing(outgoingPage.items);
    setOutgoingCursor(outgoingPage.nextCursor);
  }

  async function loadMore(direction: Direction | "choices") {
    const cursor =
      direction === "incoming"
        ? incomingCursor
        : direction === "outgoing"
          ? outgoingCursor
          : choiceCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(direction);
    setError(null);
    try {
      if (direction === "choices") {
        const page = await apiJson<PageResponse<Choice>>(
          pagePath(choicesPath, cursor),
        );
        setChoices((current) => [
          ...current,
          ...page.items.filter(
            (item) =>
              item.id !== workItemId &&
              item.projectId === projectId &&
              !current.some((saved) => saved.id === item.id),
          ),
        ]);
        setChoiceCursor(page.nextCursor);
      } else {
        const page = await apiJson<PageResponse<WorkItemRelation>>(
          relationPath(workItemId, direction, cursor),
        );
        const append = (current: WorkItemRelation[]) => [
          ...current,
          ...page.items.filter(
            (item) => !current.some((saved) => saved.id === item.id),
          ),
        ];
        if (direction === "incoming") {
          setIncoming(append);
          setIncomingCursor(page.nextCursor);
        } else {
          setOutgoing(append);
          setOutgoingCursor(page.nextCursor);
        }
      }
    } catch (cause) {
      setError(message(cause, "Could not load more work records."));
    } finally {
      setLoadingMore(null);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    const selectedIsSource = mode === "parent" || mode === "blocked_by";
    try {
      await apiJson<WorkItemRelation>("/api/v1/work-item-relations", {
        method: "POST",
        body: JSON.stringify({
          sourceWorkItemId: selectedIsSource ? selectedId : workItemId,
          targetWorkItemId: selectedIsSource ? workItemId : selectedId,
          type: mode === "parent" || mode === "child" ? "parent_of" : "blocks",
        }),
      });
      await refresh();
      await onStructureChanged();
      setSelectedId("");
      setFeedback("Work relationship saved and audited.");
    } catch (cause) {
      setError(message(cause, "Could not save work relationship."));
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (archivingId) return;
    setArchivingId(id);
    setError(null);
    setFeedback(null);
    try {
      await apiJson<WorkItemRelation>(
        `/api/v1/work-item-relations/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      await refresh();
      await onStructureChanged();
      setFeedback(
        "Work relationship removed from active context. Its audit history remains.",
      );
    } catch (cause) {
      setError(message(cause, "Could not remove work relationship."));
    } finally {
      setArchivingId(null);
    }
  }

  const openBlockers = incoming.filter(
    (relation) =>
      relation.type === "blocks" && relation.sourceStatus === "open",
  );
  return (
    <section
      className="cmd-detail-document"
      aria-labelledby="work-relations-heading"
    >
      <p className="cmd-eyebrow">Project work graph / Manual local links</p>
      <h2 id="work-relations-heading">Subtasks and blockers</h2>
      <p>
        Relate Work records whose primary project is this project. A subtask has
        one active parent. Blocking links affect overnight readiness while the
        blocker is open.
      </p>
      {openBlockers.length > 0 && (
        <p role="status">
          Visible open blockers:{" "}
          {openBlockers.map((item) => item.sourceTitle).join(", ")}.
        </p>
      )}
      <form className="cmd-form" onSubmit={(event) => void create(event)}>
        <label htmlFor="work-relation-mode">Relationship</label>
        <select
          id="work-relation-mode"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as Mode);
            setSelectedId("");
          }}
        >
          <option value="parent" disabled={workType === "initiative"}>
            This Work item is a subtask of selected item
          </option>
          <option value="child">Selected item is a subtask of this item</option>
          <option value="blocked_by">Selected item blocks this item</option>
          <option value="blocks">This item blocks selected item</option>
        </select>
        <label htmlFor="work-relation-choice">Project task</label>
        <select
          id="work-relation-choice"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Select a Work item</option>
          {choices
            .filter(
              (choice) => mode !== "child" || choice.workType !== "initiative",
            )
            .map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title} ({choice.workType ?? "task"}, {choice.status})
              </option>
            ))}
        </select>
        {choiceCursor && (
          <Button
            type="button"
            disabled={loadingMore !== null}
            onClick={() => void loadMore("choices")}
          >
            Load more project tasks
          </Button>
        )}
        <Button type="submit" disabled={busy || !selectedId}>
          {busy ? "Saving relationship..." : "Add relationship"}
        </Button>
      </form>
      {error && (
        <p className="cmd-form-error" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="cmd-form-success" role="status">
          {feedback}
        </p>
      )}
      {(["incoming", "outgoing"] as const).map((direction) => {
        const records = direction === "incoming" ? incoming : outgoing;
        const cursor =
          direction === "incoming" ? incomingCursor : outgoingCursor;
        return (
          <div key={direction}>
            <h3>
              {direction === "incoming"
                ? "Incoming relationships"
                : "Outgoing relationships"}
            </h3>
            {records.length === 0 && (
              <p>No {direction} relationships recorded.</p>
            )}
            <ul
              className="cmd-record-list"
              aria-label={`${direction} work relationships`}
            >
              {records.map((relation) => (
                <li key={relation.id}>
                  <WorkRelationCard
                    relation={relation}
                    busy={archivingId === relation.id}
                    onArchive={() => void archive(relation.id)}
                  />
                </li>
              ))}
            </ul>
            {cursor && (
              <Button
                disabled={loadingMore !== null}
                onClick={() => void loadMore(direction)}
              >
                Load more {direction} relationships
              </Button>
            )}
          </div>
        );
      })}
    </section>
  );
}
