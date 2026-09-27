"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  LocalAgentProfile,
  WorkItem,
  WorkItemAssignmentEvent,
} from "@commandry/contracts";
import { Button, WorkAssigneeBadge } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

type AssignmentKind = "unassigned" | "local_user" | "agent";

export default function WorkAssignmentPanel({
  item,
  onChanged,
}: {
  item: WorkItem;
  onChanged: (updated: WorkItem) => void;
}) {
  const [draft, setDraft] = useState<{
    baseUpdatedAt: string;
    kind: AssignmentKind;
    agentId: string;
  } | null>(null);
  const kind =
    draft?.baseUpdatedAt === item.updatedAt
      ? draft.kind
      : (item.assigneeKind ?? "unassigned");
  const agentId =
    draft?.baseUpdatedAt === item.updatedAt
      ? draft.agentId
      : (item.assigneeAgentId ?? "");
  const [agents, setAgents] = useState<LocalAgentProfile[]>([]);
  const [agentsCursor, setAgentsCursor] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [history, setHistory] = useState<WorkItemAssignmentEvent[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const assignmentPath = `/api/v1/work-items/${encodeURIComponent(item.id)}/assignment`;
  const historyPath = `/api/v1/work-items/${encodeURIComponent(item.id)}/assignment-events`;
  const agentsPath = `/api/v1/projects/${encodeURIComponent(item.projectId)}/eligible-agents`;

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<LocalAgentProfile>>(pagePath(agentsPath))
      .then((page) => {
        if (!active) return;
        setAgents(page.items);
        setAgentsCursor(page.nextCursor);
        setAgentsError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setAgentsError(
            cause instanceof Error ? cause.message : "Agents are unavailable.",
          );
      })
      .finally(() => {
        if (active) setAgentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentsPath]);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<WorkItemAssignmentEvent>>(pagePath(historyPath))
      .then((page) => {
        if (!active) return;
        setHistory(page.items);
        setHistoryCursor(page.nextCursor);
        setHistoryError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setHistoryError(
            cause instanceof Error
              ? cause.message
              : "Assignment history is unavailable.",
          );
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [historyPath]);

  async function loadMoreAgents() {
    if (!agentsCursor || agentsLoading) return;
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const page = await apiJson<PageResponse<LocalAgentProfile>>(
        pagePath(agentsPath, agentsCursor),
      );
      setAgents((current) => [...current, ...page.items]);
      setAgentsCursor(page.nextCursor);
    } catch (cause) {
      setAgentsError(
        cause instanceof Error ? cause.message : "Could not load agents.",
      );
    } finally {
      setAgentsLoading(false);
    }
  }

  async function loadMoreHistory() {
    if (!historyCursor || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await apiJson<PageResponse<WorkItemAssignmentEvent>>(
        pagePath(historyPath, historyCursor),
      );
      setHistory((current) => [...current, ...page.items]);
      setHistoryCursor(page.nextCursor);
    } catch (cause) {
      setHistoryError(
        cause instanceof Error ? cause.message : "Could not load history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || (kind === "agent" && !agentId)) return;
    setSaving(true);
    setSaveError(null);
    setFeedback(null);
    try {
      const updated = await apiJson<WorkItem>(assignmentPath, {
        method: "PUT",
        body: JSON.stringify({
          expectedUpdatedAt: item.updatedAt,
          assigneeKind: kind,
          agentId: kind === "agent" ? agentId : null,
        }),
      });
      onChanged(updated);
      setDraft(null);
      setFeedback("Local assignment saved with an immutable history event.");
      try {
        const page = await apiJson<PageResponse<WorkItemAssignmentEvent>>(
          pagePath(historyPath),
        );
        setHistory(page.items);
        setHistoryCursor(page.nextCursor);
        setHistoryError(null);
      } catch (cause) {
        setHistoryError(
          cause instanceof Error
            ? cause.message
            : "Assignment saved, but history could not be refreshed.",
        );
      }
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Could not save assignment.",
      );
    } finally {
      setSaving(false);
    }
  }

  const changed =
    kind !== (item.assigneeKind ?? "unassigned") ||
    (kind === "agent" && agentId !== (item.assigneeAgentId ?? ""));
  const assignedAgentMissing =
    item.assigneeKind === "agent" &&
    item.assigneeAgentId &&
    !agents.some((agent) => agent.id === item.assigneeAgentId);

  return (
    <section
      className="cmd-detail-document"
      aria-labelledby="work-assignment-heading"
    >
      <p className="cmd-eyebrow">Local Work assignment / Audited</p>
      <h2 id="work-assignment-heading">Assigned to</h2>
      <p>
        Assign this task to the unattributed local user or a synthetic agent
        with primary project scope. Assignment organizes Work; it does not
        authorize a run or an external action.
      </p>
      <WorkAssigneeBadge
        kind={item.assigneeKind ?? "unassigned"}
        label={item.assigneeLabel ?? null}
      />
      <form className="cmd-form" onSubmit={save}>
        <label htmlFor="work-assignee-kind">Assignee</label>
        <select
          id="work-assignee-kind"
          value={kind}
          onChange={(event) =>
            setDraft({
              baseUpdatedAt: item.updatedAt,
              kind: event.target.value as AssignmentKind,
              agentId,
            })
          }
        >
          <option value="unassigned">Unassigned</option>
          <option value="local_user">Local user (unattributed)</option>
          <option value="agent">Synthetic local agent</option>
        </select>
        {kind === "agent" && (
          <>
            <label htmlFor="work-assignee-agent">Project-scoped agent</label>
            <select
              id="work-assignee-agent"
              value={agentId}
              onChange={(event) =>
                setDraft({
                  baseUpdatedAt: item.updatedAt,
                  kind,
                  agentId: event.target.value,
                })
              }
            >
              <option value="">Select a synthetic agent</option>
              {assignedAgentMissing && (
                <option value={item.assigneeAgentId!}>
                  {item.assigneeLabel ?? "Current synthetic agent"}
                </option>
              )}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} (synthetic)
                </option>
              ))}
            </select>
            {agentsLoading && <p role="status">Loading project agents...</p>}
            {agentsError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {agentsError}
              </p>
            )}
            {agentsCursor && (
              <Button
                type="button"
                disabled={agentsLoading}
                onClick={loadMoreAgents}
              >
                Load more project agents
              </Button>
            )}
            {!agentsLoading && agents.length === 0 && !agentsError && (
              <p>
                No agent has this project scope.{" "}
                <a href="/agents">Register and scope a synthetic agent</a>{" "}
                first.
              </p>
            )}
          </>
        )}
        <Button
          type="submit"
          disabled={saving || !changed || (kind === "agent" && !agentId)}
        >
          {saving ? "Saving assignment..." : "Save assignment"}
        </Button>
      </form>
      {feedback && (
        <p className="cmd-form-success" role="status">
          {feedback}
        </p>
      )}
      {saveError && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {saveError}
        </p>
      )}
      <h3>Assignment history</h3>
      {historyLoading && history.length === 0 && (
        <p role="status">Loading history...</p>
      )}
      {!historyLoading && history.length === 0 && !historyError && (
        <p>No assignment changes recorded.</p>
      )}
      {history.length > 0 && (
        <ol className="cmd-detail-facts">
          {history.map((entry) => (
            <li key={entry.id}>
              {entry.previousLabel ?? "Unassigned"} to{" "}
              {entry.nextLabel ?? "Unassigned"} by {entry.actor} at{" "}
              <time dateTime={entry.createdAt}>{entry.createdAt}</time>.{" "}
              <a
                href={`/api/v1/work-item-assignment-events/${encodeURIComponent(entry.id)}`}
              >
                Exact event
              </a>
            </li>
          ))}
        </ol>
      )}
      {historyError && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {historyError}
        </p>
      )}
      {historyCursor && (
        <Button disabled={historyLoading} onClick={loadMoreHistory}>
          {historyLoading ? "Loading..." : "Load older assignment changes"}
        </Button>
      )}
    </section>
  );
}
