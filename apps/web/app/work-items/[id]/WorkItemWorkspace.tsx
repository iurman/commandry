"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell, Button, RecordEmptyState } from "@commandry/ui";
import type { ExecutionPacket } from "@commandry/contracts";
import { workDueLabel } from "@commandry/domain";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectResourceLink,
} from "../../projects/api";
import WorkDiscussion from "./WorkDiscussion";
import WorkAttachments from "./WorkAttachments";
import WorkAcceptance from "./WorkAcceptance";
import WorkRelationships from "./WorkRelationships";

interface WorkItemRecord {
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

interface WorkItemStatusEvent {
  id: string;
  workItemId: string;
  previousStatus: "open" | "done";
  nextStatus: "open" | "done";
  actor: "local-user:unattributed";
  createdAt: string;
}

interface WorkItemPlanningEvent {
  id: string;
  previousPriority: "low" | "normal" | "high" | null;
  nextPriority: "low" | "normal" | "high" | null;
  previousDueOn: string | null;
  nextDueOn: string | null;
  createdAt: string;
}

interface KnowledgeChoice {
  id: string;
  projectId: string;
  kind: "note" | "link" | "document";
  contextLink?: { id: string; projectId: string; createdAt: string } | null;
  title: string;
  content: string;
  sourceCaptureId: string;
}

type PacketReference = Pick<
  ExecutionPacket,
  "id" | "packetVersion" | "generatedAt"
>;

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function WorkItemWorkspace({
  workItemId,
}: {
  workItemId: string;
}) {
  const [item, setItem] = useState<WorkItemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [priorityDraft, setPriorityDraft] = useState("");
  const [dueOnDraft, setDueOnDraft] = useState("");
  const [planningSaving, setPlanningSaving] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [planningFeedback, setPlanningFeedback] = useState<string | null>(null);
  const [planningHistory, setPlanningHistory] = useState<
    WorkItemPlanningEvent[]
  >([]);
  const [planningCursor, setPlanningCursor] = useState<string | null>(null);
  const [planningHistoryLoading, setPlanningHistoryLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<WorkItemStatusEvent[]>([]);
  const [statusHistoryCursor, setStatusHistoryCursor] = useState<string | null>(
    null,
  );
  const [statusHistoryLoading, setStatusHistoryLoading] = useState(false);
  const [statusHistoryError, setStatusHistoryError] = useState<string | null>(
    null,
  );
  const [knowledge, setKnowledge] = useState<KnowledgeChoice[]>([]);
  const [resources, setResources] = useState<ProjectResourceLink[]>([]);
  const [knowledgeCursor, setKnowledgeCursor] = useState<string | null>(null);
  const [resourceCursor, setResourceCursor] = useState<string | null>(null);
  const [choicesLoading, setChoicesLoading] = useState(true);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<
    "knowledge" | "resources" | null
  >(null);
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>(
    [],
  );
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [packets, setPackets] = useState<PacketReference[]>([]);
  const [packetsCursor, setPacketsCursor] = useState<string | null>(null);
  const [packetsLoading, setPacketsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdPacket, setCreatedPacket] = useState<PacketReference | null>(
    null,
  );
  const packetPath = `/api/v1/work-items/${encodeURIComponent(workItemId)}/execution-packets`;
  const statusPath = `/api/v1/work-items/${encodeURIComponent(workItemId)}/status`;
  const statusHistoryPath = `/api/v1/work-items/${encodeURIComponent(workItemId)}/status-events`;
  const planningPath = `/api/v1/work-items/${encodeURIComponent(workItemId)}/planning`;
  const planningHistoryPath = `/api/v1/work-items/${encodeURIComponent(workItemId)}/planning-events`;
  const currentItemId = item?.id;

  useEffect(() => {
    let active = true;
    apiJson<WorkItemRecord>(
      `/api/v1/work-items/${encodeURIComponent(workItemId)}`,
    )
      .then((record) => {
        if (active) {
          setItem(record);
          setPriorityDraft(record.priority ?? "");
          setDueOnDraft(record.dueOn ?? "");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, "Work item is unavailable."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workItemId]);

  useEffect(() => {
    if (!currentItemId) return;
    let active = true;
    apiJson<PageResponse<WorkItemStatusEvent>>(pagePath(statusHistoryPath))
      .then((page) => {
        if (!active) return;
        setStatusHistory(page.items);
        setStatusHistoryCursor(page.nextCursor);
        setStatusHistoryError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setStatusHistoryError(
            errorMessage(cause, "Status history is unavailable."),
          );
      });
    return () => {
      active = false;
    };
  }, [currentItemId, statusHistoryPath]);

  useEffect(() => {
    if (!currentItemId) return;
    let active = true;
    apiJson<PageResponse<WorkItemPlanningEvent>>(pagePath(planningHistoryPath))
      .then((page) => {
        if (!active) return;
        setPlanningHistory(page.items);
        setPlanningCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setPlanningError(
            errorMessage(cause, "Planning history is unavailable."),
          );
      });
    return () => {
      active = false;
    };
  }, [currentItemId, planningHistoryPath]);

  async function savePlanning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || planningSaving) return;
    setPlanningSaving(true);
    setPlanningError(null);
    setPlanningFeedback(null);
    try {
      const updated = await apiJson<WorkItemRecord>(planningPath, {
        method: "PUT",
        body: JSON.stringify({
          expectedUpdatedAt: item.updatedAt,
          priority: priorityDraft || null,
          dueOn: dueOnDraft || null,
        }),
      });
      setItem(updated);
      setPriorityDraft(updated.priority ?? "");
      setDueOnDraft(updated.dueOn ?? "");
      setPlanningFeedback(
        "Local task planning saved. Original capture preserved.",
      );
      const page = await apiJson<PageResponse<WorkItemPlanningEvent>>(
        pagePath(planningHistoryPath),
      );
      setPlanningHistory(page.items);
      setPlanningCursor(page.nextCursor);
    } catch (cause) {
      setPlanningError(errorMessage(cause, "Could not save task planning."));
    } finally {
      setPlanningSaving(false);
    }
  }

  async function loadMorePlanningHistory() {
    if (!planningCursor || planningHistoryLoading) return;
    setPlanningHistoryLoading(true);
    setPlanningError(null);
    try {
      const page = await apiJson<PageResponse<WorkItemPlanningEvent>>(
        pagePath(planningHistoryPath, planningCursor),
      );
      setPlanningHistory((current) => [...current, ...page.items]);
      setPlanningCursor(page.nextCursor);
    } catch (cause) {
      setPlanningError(errorMessage(cause, "Could not load planning history."));
    } finally {
      setPlanningHistoryLoading(false);
    }
  }

  async function changeStatus() {
    if (!item || statusUpdating) return;
    const nextStatus = item.status === "open" ? "done" : "open";
    setStatusUpdating(true);
    setStatusError(null);
    try {
      const updated = await apiJson<WorkItemRecord>(statusPath, {
        method: "POST",
        body: JSON.stringify({
          status: nextStatus,
          expectedStatus: item.status,
        }),
      });
      setItem(updated);
    } catch (cause) {
      setStatusError(errorMessage(cause, "Could not change task status."));
      try {
        setItem(
          await apiJson<WorkItemRecord>(
            `/api/v1/work-items/${encodeURIComponent(workItemId)}`,
          ),
        );
      } catch {
        // Keep the last displayed record while the user can refresh.
      }
      setStatusUpdating(false);
      return;
    }
    try {
      const page = await apiJson<PageResponse<WorkItemStatusEvent>>(
        pagePath(statusHistoryPath),
      );
      setStatusHistory(page.items);
      setStatusHistoryCursor(page.nextCursor);
      setStatusHistoryError(null);
    } catch (cause) {
      setStatusHistoryError(
        errorMessage(cause, "Could not refresh task status history."),
      );
    } finally {
      setStatusUpdating(false);
    }
  }

  async function loadMoreStatusHistory() {
    if (!statusHistoryCursor || statusHistoryLoading) return;
    setStatusHistoryLoading(true);
    setStatusHistoryError(null);
    try {
      const page = await apiJson<PageResponse<WorkItemStatusEvent>>(
        pagePath(statusHistoryPath, statusHistoryCursor),
      );
      setStatusHistory((current) => [...current, ...page.items]);
      setStatusHistoryCursor(page.nextCursor);
    } catch (cause) {
      setStatusHistoryError(
        errorMessage(cause, "Could not load older status changes."),
      );
    } finally {
      setStatusHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!item) return;
    let active = true;
    const projectId = encodeURIComponent(item.projectId);
    Promise.all([
      apiJson<PageResponse<KnowledgeChoice>>(
        pagePath(`/api/v1/projects/${projectId}/knowledge`),
      ),
      apiJson<PageResponse<ProjectResourceLink>>(
        pagePath(`/api/v1/projects/${projectId}/resources`),
      ),
      apiJson<PageResponse<PacketReference>>(pagePath(packetPath)),
    ])
      .then(([knowledgePage, resourcePage, packetPage]) => {
        if (!active) return;
        setKnowledge(knowledgePage.items);
        setKnowledgeCursor(knowledgePage.nextCursor);
        setResources(resourcePage.items);
        setResourceCursor(resourcePage.nextCursor);
        setPackets(packetPage.items);
        setPacketsCursor(packetPage.nextCursor);
        setChoicesError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setChoicesError(
            errorMessage(cause, "Packet context is unavailable."),
          );
      })
      .finally(() => {
        if (active) setChoicesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item, packetPath]);

  async function loadMore(kind: "knowledge" | "resources") {
    const cursor = kind === "knowledge" ? knowledgeCursor : resourceCursor;
    if (!cursor || !item || loadingMore) return;
    setLoadingMore(kind);
    setChoicesError(null);
    try {
      if (kind === "knowledge") {
        const page = await apiJson<PageResponse<KnowledgeChoice>>(
          pagePath(
            `/api/v1/projects/${encodeURIComponent(item.projectId)}/knowledge`,
            cursor,
          ),
        );
        setKnowledge((current) => [
          ...current,
          ...page.items.filter(
            (choice) => !current.some((known) => known.id === choice.id),
          ),
        ]);
        setKnowledgeCursor(page.nextCursor);
      } else {
        const page = await apiJson<PageResponse<ProjectResourceLink>>(
          pagePath(
            `/api/v1/projects/${encodeURIComponent(item.projectId)}/resources`,
            cursor,
          ),
        );
        setResources((current) => [
          ...current,
          ...page.items.filter(
            (choice) => !current.some((known) => known.id === choice.id),
          ),
        ]);
        setResourceCursor(page.nextCursor);
      }
    } catch (cause) {
      setChoicesError(
        errorMessage(cause, "Could not load more packet context."),
      );
    } finally {
      setLoadingMore(null);
    }
  }

  async function loadMorePackets() {
    if (!packetsCursor || packetsLoading) return;
    setPacketsLoading(true);
    try {
      const page = await apiJson<PageResponse<PacketReference>>(
        pagePath(packetPath, packetsCursor),
      );
      setPackets((current) => [
        ...current,
        ...page.items.filter(
          (packet) => !current.some((known) => known.id === packet.id),
        ),
      ]);
      setPacketsCursor(page.nextCursor);
    } catch (cause) {
      setChoicesError(errorMessage(cause, "Could not load more packets."));
    } finally {
      setPacketsLoading(false);
    }
  }

  function toggle(
    id: string,
    selected: string[],
    update: (ids: string[]) => void,
  ) {
    if (selected.includes(id))
      update(selected.filter((candidate) => candidate !== id));
    else if (selected.length < 10) update([...selected, id]);
  }

  async function createPacket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || creating) return;
    setCreating(true);
    setCreateError(null);
    setCreatedPacket(null);
    try {
      const packet = await apiJson<PacketReference>(packetPath, {
        method: "POST",
        body: JSON.stringify({ selectedKnowledgeIds, selectedResourceIds }),
      });
      setCreatedPacket(packet);
      setPackets((current) => [
        packet,
        ...current.filter((known) => known.id !== packet.id),
      ]);
    } catch (cause) {
      setCreateError(errorMessage(cause, "Could not create execution packet."));
    } finally {
      setCreating(false);
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
        <span>Work item</span>
      </nav>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading work item...
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
              <p className="cmd-eyebrow">Project work / Filed task</p>
              <h1>{item.title}</h1>
              <p className="cmd-lead">
                This saved task links to the original capture that motivated it.
              </p>
            </div>
            <span className="cmd-headline-mark">{item.status}</span>
          </header>
          <div className="cmd-detail-layout">
            <article
              className="cmd-detail-document"
              aria-labelledby="work-body-heading"
            >
              <p className="cmd-eyebrow">Saved work</p>
              <h2 id="work-body-heading">Task description</h2>
              {item.description ? (
                <div className="cmd-detail-body">{item.description}</div>
              ) : (
                <p className="cmd-inline-state">
                  No task description was recorded.
                </p>
              )}
            </article>
            <aside
              className="cmd-detail-source"
              aria-labelledby="work-source-heading"
            >
              <p className="cmd-eyebrow">Provenance</p>
              <h2 id="work-source-heading">Source and identity</h2>
              <p>
                <a
                  href={`/inbox?captureId=${encodeURIComponent(item.sourceCaptureId)}`}
                >
                  View exact original capture
                </a>
              </p>
              <dl className="cmd-detail-facts">
                <div>
                  <dt>Status</dt>
                  <dd>{item.status}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{item.priority ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Due date</dt>
                  <dd>{item.dueOn ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Work item ID</dt>
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

          <WorkRelationships workItemId={item.id} projectId={item.projectId} />
          <WorkAttachments workItemId={item.id} projectId={item.projectId} />
          <WorkAcceptance workItemId={item.id} status={item.status} />
          <WorkDiscussion workItemId={item.id} />

          <section
            className="cmd-detail-document"
            aria-labelledby="work-planning-heading"
          >
            <p className="cmd-eyebrow">Local work planning / Audited</p>
            <h2 id="work-planning-heading">Priority and due date</h2>
            <p>
              Optional planning fields for this task. Dates are calendar days in
              UTC. Completed tasks are excluded from upcoming work.
            </p>
            {item.dueOn && item.status === "open" && (
              <p role="status">
                {workDueLabel(
                  item.dueOn,
                  item.status,
                  new Date().toISOString().slice(0, 10),
                ) === "overdue"
                  ? "Overdue"
                  : workDueLabel(
                        item.dueOn,
                        item.status,
                        new Date().toISOString().slice(0, 10),
                      ) === "today"
                    ? "Due today"
                    : "Upcoming"}
                : {item.dueOn} UTC
              </p>
            )}
            <form className="cmd-form" onSubmit={savePlanning}>
              <label htmlFor="work-priority">Priority</label>
              <select
                id="work-priority"
                value={priorityDraft}
                onChange={(event) => setPriorityDraft(event.target.value)}
              >
                <option value="">Not set</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <label htmlFor="work-due-on">Due date (UTC)</label>
              <input
                id="work-due-on"
                type="date"
                value={dueOnDraft}
                onChange={(event) => setDueOnDraft(event.target.value)}
              />
              <Button
                type="submit"
                disabled={
                  planningSaving ||
                  (priorityDraft === (item.priority ?? "") &&
                    dueOnDraft === (item.dueOn ?? ""))
                }
              >
                {planningSaving ? "Saving planning..." : "Save planning"}
              </Button>
            </form>
            {planningFeedback && (
              <p className="cmd-form-success" role="status">
                {planningFeedback}
              </p>
            )}
            {planningError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {planningError}
              </p>
            )}
            <h3>Planning history</h3>
            {planningHistory.length === 0 && !planningError && (
              <p>No planning changes recorded.</p>
            )}
            {planningHistory.length > 0 && (
              <ol className="cmd-detail-facts">
                {planningHistory.map((entry) => (
                  <li key={entry.id}>
                    <time dateTime={entry.createdAt}>{entry.createdAt}</time>:
                    priority {entry.previousPriority ?? "unset"} to{" "}
                    {entry.nextPriority ?? "unset"}; due{" "}
                    {entry.previousDueOn ?? "unset"} to{" "}
                    {entry.nextDueOn ?? "unset"}.
                  </li>
                ))}
              </ol>
            )}
            {planningCursor && (
              <Button
                disabled={planningHistoryLoading}
                onClick={loadMorePlanningHistory}
              >
                {planningHistoryLoading
                  ? "Loading..."
                  : "Load older planning changes"}
              </Button>
            )}
          </section>

          <section
            className="cmd-detail-document"
            aria-labelledby="work-status-heading"
          >
            <p className="cmd-eyebrow">Local work state / Audited</p>
            <h2 id="work-status-heading">Task status</h2>
            <p>
              Current status: <strong>{item.status}</strong>. Changing it
              updates the live project brief; existing execution packets keep
              their saved snapshot.
            </p>
            <Button disabled={statusUpdating} onClick={changeStatus}>
              {statusUpdating
                ? "Saving status..."
                : item.status === "open"
                  ? "Mark done"
                  : "Reopen task"}
            </Button>
            {statusError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {statusError}
              </p>
            )}
            <h3>Status history</h3>
            {statusHistory.length === 0 && !statusHistoryError && (
              <p>No status changes have been recorded.</p>
            )}
            {statusHistory.length > 0 && (
              <ol>
                {statusHistory.map((event) => (
                  <li key={event.id}>
                    {event.previousStatus} to {event.nextStatus} by{" "}
                    {event.actor} at{" "}
                    <time dateTime={event.createdAt}>{event.createdAt}</time>
                  </li>
                ))}
              </ol>
            )}
            {statusHistoryError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {statusHistoryError}
              </p>
            )}
            {statusHistoryCursor && (
              <Button
                disabled={statusHistoryLoading}
                onClick={loadMoreStatusHistory}
              >
                {statusHistoryLoading
                  ? "Loading..."
                  : "Load more status changes"}
              </Button>
            )}
          </section>

          <section
            className="cmd-packet-builder"
            aria-labelledby="packet-builder-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">
                  Explicit context / Local preparation
                </p>
                <h2 id="packet-builder-heading">Create execution packet</h2>
              </div>
            </div>
            <p className="cmd-section-intro">
              Select only the project records this task needs. The packet
              snapshots the task, selected record references, and source links
              at creation time. This does not start an agent run or verify the
              work.
            </p>
            {choicesLoading && (
              <p className="cmd-inline-state" role="status">
                Loading packet context...
              </p>
            )}
            {choicesError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {choicesError}
              </p>
            )}
            {!choicesLoading && !choicesError && (
              <form onSubmit={createPacket}>
                <div className="cmd-packet-choice-grid">
                  <fieldset className="cmd-packet-choice-group">
                    <legend>Selected knowledge</legend>
                    {knowledge.length === 0 ? (
                      <p>No project knowledge is recorded.</p>
                    ) : (
                      <ul className="cmd-packet-choice-list">
                        {knowledge.map((choice) => (
                          <li key={choice.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedKnowledgeIds.includes(
                                  choice.id,
                                )}
                                disabled={
                                  selectedKnowledgeIds.length >= 10 &&
                                  !selectedKnowledgeIds.includes(choice.id)
                                }
                                onChange={() =>
                                  toggle(
                                    choice.id,
                                    selectedKnowledgeIds,
                                    setSelectedKnowledgeIds,
                                  )
                                }
                              />
                              <span>
                                <strong>{choice.title}</strong>
                                <small>
                                  Saved {choice.kind}
                                  {choice.contextLink
                                    ? " · Shared project context"
                                    : ""}{" "}
                                  · {choice.id}
                                </small>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
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
                  </fieldset>
                  <fieldset className="cmd-packet-choice-group">
                    <legend>Selected linked resources</legend>
                    {resources.length === 0 ? (
                      <p>No resources are linked to this project.</p>
                    ) : (
                      <ul className="cmd-packet-choice-list">
                        {resources.map((choice) => (
                          <li key={choice.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedResourceIds.includes(
                                  choice.resource.id,
                                )}
                                disabled={
                                  selectedResourceIds.length >= 10 &&
                                  !selectedResourceIds.includes(
                                    choice.resource.id,
                                  )
                                }
                                onChange={() =>
                                  toggle(
                                    choice.resource.id,
                                    selectedResourceIds,
                                    setSelectedResourceIds,
                                  )
                                }
                              />
                              <span>
                                <strong>{choice.resource.name}</strong>
                                <small>
                                  {choice.resource.kind} · {choice.resource.id}
                                </small>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    {resourceCursor && (
                      <Button
                        disabled={loadingMore !== null}
                        onClick={() => loadMore("resources")}
                      >
                        {loadingMore === "resources"
                          ? "Loading..."
                          : "Load more linked resources"}
                      </Button>
                    )}
                  </fieldset>
                </div>
                <p className="cmd-form-hint">
                  {selectedKnowledgeIds.length} knowledge records and{" "}
                  {selectedResourceIds.length} linked resources selected. Up to
                  10 of each kind.
                </p>
                {createError && (
                  <p className="cmd-form-error" role="alert">
                    {createError}
                  </p>
                )}
                {createdPacket && (
                  <p className="cmd-form-success" role="status">
                    Packet version {createdPacket.packetVersion} saved.{" "}
                    <a
                      href={`/execution-packets/${encodeURIComponent(createdPacket.id)}`}
                    >
                      Review execution packet
                    </a>
                  </p>
                )}
                <Button disabled={creating} type="submit" variant="primary">
                  {creating ? "Creating packet..." : "Create execution packet"}
                </Button>
              </form>
            )}
          </section>

          <section
            className="cmd-packet-history"
            aria-labelledby="packet-history-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Saved snapshots</p>
                <h2 id="packet-history-heading">Execution packets</h2>
              </div>
              <span className="cmd-count">{packets.length} shown</span>
            </div>
            {!choicesLoading && packets.length === 0 && !choicesError && (
              <RecordEmptyState
                title="No packets yet"
                description="Create a packet to preserve selected task context at a point in time."
              />
            )}
            {packets.length > 0 && (
              <ul className="cmd-packet-history-list">
                {packets.map((packet) => (
                  <li key={packet.id}>
                    <a
                      href={`/execution-packets/${encodeURIComponent(packet.id)}`}
                    >
                      Version {packet.packetVersion}
                    </a>
                    <time dateTime={packet.generatedAt}>
                      {packet.generatedAt}
                    </time>
                  </li>
                ))}
              </ul>
            )}
            {packetsCursor && (
              <Button disabled={packetsLoading} onClick={loadMorePackets}>
                {packetsLoading ? "Loading..." : "Load more packets"}
              </Button>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
