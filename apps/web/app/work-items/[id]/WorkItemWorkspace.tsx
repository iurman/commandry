"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell, Button, RecordEmptyState } from "@commandry/ui";
import type { ExecutionPacket } from "@commandry/contracts";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectResourceLink,
} from "../../projects/api";

interface WorkItemRecord {
  id: string;
  projectId: string;
  sourceCaptureId: string;
  title: string;
  description: string;
  status: "open" | "done";
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeChoice {
  id: string;
  projectId: string;
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

  useEffect(() => {
    let active = true;
    apiJson<WorkItemRecord>(
      `/api/v1/work-items/${encodeURIComponent(workItemId)}`,
    )
      .then((record) => {
        if (active) setItem(record);
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
                                <small>Saved note · {choice.id}</small>
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
