"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  LocalConnectorFeedItem,
  LocalConnectorToken,
  LocalIntegration,
  SyntheticEventImportRecord,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  LocalConnectorPanel,
  LocalIntegrationCard,
  RecordEmptyState,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
  type ProjectResourceLink,
} from "../projects/api";

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request did not complete.";
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<LocalIntegration[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [resourceLinks, setResourceLinks] = useState<ProjectResourceLink[]>([]);
  const [resourceCursor, setResourceCursor] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LocalIntegration["kind"]>(
    "synthetic-development",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SyntheticEventImportRecord | null>(
    null,
  );
  const [receiverTokens, setReceiverTokens] = useState<Record<string, string>>(
    {},
  );
  const [feed, setFeed] = useState<Record<string, LocalConnectorFeedItem[]>>(
    {},
  );
  const [feedCursors, setFeedCursors] = useState<Record<string, string | null>>(
    {},
  );
  const [history, setHistory] = useState<
    Record<string, SyntheticEventImportRecord[]>
  >({});
  const [historyCursors, setHistoryCursors] = useState<
    Record<string, string | null>
  >({});

  async function refreshIntegration(id: string) {
    const updated = await apiJson<LocalIntegration>(
      `/api/v1/integrations/${id}`,
    );
    setItems((current) =>
      current.map((item) => (item.id === id ? updated : item)),
    );
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<LocalIntegration>>(pagePath("/api/v1/integrations")),
      apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects")),
    ])
      .then(async ([integrations, projectPage]) => {
        const requestedId = new URLSearchParams(window.location.search).get(
          "projectId",
        );
        const requestedProject = requestedId
          ? (projectPage.items.find((project) => project.id === requestedId) ??
            (await apiJson<ProjectRecord>(
              `/api/v1/projects/${encodeURIComponent(requestedId)}`,
            )))
          : null;
        if (!active) return;
        setItems(integrations.items);
        setCursor(integrations.nextCursor);
        setProjects(
          requestedProject &&
            !projectPage.items.some(
              (project) => project.id === requestedProject.id,
            )
            ? [requestedProject, ...projectPage.items]
            : projectPage.items,
        );
        setProjectCursor(projectPage.nextCursor);
        setProjectId(requestedProject?.id ?? projectPage.items[0]?.id ?? "");
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    apiJson<PageResponse<ProjectResourceLink>>(
      pagePath(`/api/v1/projects/${encodeURIComponent(projectId)}/resources`),
    )
      .then((page) => {
        if (!active) return;
        setResourceLinks(page.items);
        setResourceCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause));
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!receipt || receipt.state === "succeeded" || receipt.state === "failed")
      return;
    let active = true;
    const timer = window.setInterval(() => {
      void apiJson<SyntheticEventImportRecord>(
        `/api/v1/synthetic-event-imports/${receipt.id}`,
      )
        .then((updated) => {
          if (!active) return;
          setReceipt(updated);
          if (
            updated.integrationInstanceId &&
            (updated.state === "succeeded" || updated.state === "failed")
          ) {
            void refreshIntegration(updated.integrationInstanceId);
          }
        })
        .catch((cause: unknown) => {
          if (active) setError(message(cause));
        });
    }, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [receipt]);

  async function loadMoreProjects() {
    if (!projectCursor || busy) return;
    setBusy(true);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", projectCursor),
      );
      setProjects((current) => [...current, ...page.items]);
      setProjectCursor(page.nextCursor);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreResources() {
    if (!resourceCursor || !projectId || busy) return;
    setBusy(true);
    try {
      const page = await apiJson<PageResponse<ProjectResourceLink>>(
        pagePath(
          `/api/v1/projects/${encodeURIComponent(projectId)}/resources`,
          resourceCursor,
        ),
      );
      setResourceLinks((current) => [...current, ...page.items]);
      setResourceCursor(page.nextCursor);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const page = await apiJson<PageResponse<LocalIntegration>>(
        pagePath("/api/v1/integrations", cursor),
      );
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !name.trim() || busy) return;
    if (kind === "synthetic-operations" && !resourceId) {
      setError("Choose a project-linked resource for the operational fixture.");
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const created = await apiJson<LocalIntegration>("/api/v1/integrations", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          kind,
          projectId,
          resourceId: resourceId || null,
        }),
      });
      setItems((current) => [created, ...current]);
      setName("");
      setFeedback(`Created ${created.name} as a local synthetic source.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(item: LocalIntegration) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await apiJson<LocalIntegration>(
        `/api/v1/integrations/${item.id}/enabled`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled: !item.enabled }),
        },
      );
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? updated : entry)),
      );
      setFeedback(
        `${updated.name} ${updated.enabled ? "enabled" : "disabled"}.`,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function runSample(item: LocalIntegration, scenarioId: string) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    setFeedback(null);
    setReceipt(null);
    try {
      const submitted = await apiJson<SyntheticEventImportRecord>(
        `/api/v1/integrations/${item.id}/sample`,
        {
          method: "POST",
          body: JSON.stringify({
            scenarioId,
            occurrenceId: `local-fixture:${crypto.randomUUID()}`,
          }),
        },
      );
      setReceipt(submitted);
      await refreshIntegration(item.id);
      setFeedback(
        `Synthetic sample queued for ${item.name}. No external source was contacted.`,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function refreshFeed(id: string, cursor?: string) {
    const page = await apiJson<PageResponse<LocalConnectorFeedItem>>(
      pagePath(`/api/v1/integrations/${id}/poll-feed`, cursor),
    );
    setFeed((current) => ({
      ...current,
      [id]: cursor ? [...(current[id] ?? []), ...page.items] : page.items,
    }));
    setFeedCursors((current) => ({ ...current, [id]: page.nextCursor }));
  }

  async function rotateReceiverToken(item: LocalIntegration) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const result = await apiJson<LocalConnectorToken>(
        `/api/v1/integrations/${item.id}/receiver-token`,
        { method: "POST" },
      );
      setReceiverTokens((current) => ({ ...current, [item.id]: result.token }));
      await refreshIntegration(item.id);
      setFeedback(
        `Local synthetic receiver token created for ${item.name}. It is shown once.`,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function receiveFixture(
    item: LocalIntegration,
    scenarioId: LocalConnectorFeedItem["scenarioId"],
  ) {
    const token = receiverTokens[item.id];
    if (!token || busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const submitted = await apiJson<SyntheticEventImportRecord>(
        `/api/v1/integrations/${item.id}/receive`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({
            scenarioId,
            occurrenceId: `local-receiver:${crypto.randomUUID()}`,
          }),
        },
      );
      setReceipt(submitted);
      await refreshIntegration(item.id);
      setFeedback(
        `Synthetic receiver envelope queued for ${item.name}. No live provider was contacted.`,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function enqueuePollFixture(
    item: LocalIntegration,
    scenarioId: LocalConnectorFeedItem["scenarioId"],
  ) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await apiJson<LocalConnectorFeedItem>(
        `/api/v1/integrations/${item.id}/poll-feed`,
        {
          method: "POST",
          body: JSON.stringify({
            scenarioId,
            occurrenceId: `local-poll:${crypto.randomUUID()}`,
          }),
        },
      );
      await refreshFeed(item.id);
      setFeedback(
        `Synthetic poll row queued for ${item.name}. The local worker will submit it.`,
      );
      window.setTimeout(() => {
        void refreshFeed(item.id).catch((cause: unknown) =>
          setError(message(cause)),
        );
      }, 6000);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function saveFreshnessWindow(
    item: LocalIntegration,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (busyId) return;
    const windowMinutes = Number(
      new FormData(event.currentTarget).get("windowMinutes"),
    );
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await apiJson<LocalIntegration>(
        `/api/v1/integrations/${item.id}/freshness`,
        {
          method: "PUT",
          body: JSON.stringify({ windowMinutes }),
        },
      );
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? updated : entry)),
      );
      setFeedback(
        `Synthetic observation window for ${item.name} set to ${windowMinutes} minutes.`,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function loadHistory(id: string, cursor?: string) {
    const page = await apiJson<PageResponse<SyntheticEventImportRecord>>(
      `${pagePath("/api/v1/synthetic-event-imports", cursor)}&integrationInstanceId=${encodeURIComponent(id)}`,
    );
    setHistory((current) => ({
      ...current,
      [id]: cursor ? [...(current[id] ?? []), ...page.items] : page.items,
    }));
    setHistoryCursors((current) => ({ ...current, [id]: page.nextCursor }));
  }

  return (
    <AppShell current="Integrations">
      <header className="cmd-page-header">
        <p className="cmd-eyebrow">Configured sources</p>
        <h1>Integrations</h1>
        <p>
          Connect local development and operations fixtures to projects and
          resources. Every sample here is synthetic. Live providers and
          credentials are not configured.
        </p>
      </header>
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="cmd-form-success" role="status">
          {feedback}
        </p>
      )}
      {receipt && (
        <section
          className="cmd-workspace-section"
          aria-label="Latest sample receipt"
        >
          <p className="cmd-eyebrow">Synthetic import receipt</p>
          <p>
            State: {receipt.state}. Worker attempts: {receipt.attempts}.
          </p>
          {receipt.error && (
            <p className="cmd-inline-state cmd-error">{receipt.error}</p>
          )}
          <p className="cmd-record-identity">
            <a href={`/flow-replay/${receipt.id}`}>
              Replay persisted synthetic flow
            </a>
            <a href={`/api/v1/source-envelopes/${receipt.sourceEnvelopeId}`}>
              Original synthetic envelope
            </a>
            {receipt.eventId && (
              <a href={`/api/v1/events/${receipt.eventId}`}>Normalized event</a>
            )}
            <a href={`/activity?projectId=${receipt.projectId}`}>
              Project activity
            </a>
          </p>
        </section>
      )}
      <section
        className="cmd-workspace-section"
        aria-labelledby="integration-create-heading"
      >
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">Local adapter</p>
            <h2 id="integration-create-heading">Add a source</h2>
          </div>
        </div>
        <p className="cmd-form-intro">
          A source instance owns its project and optional resource binding. This
          fixture mode makes no external network call. A local receiver token
          can be minted for a synthetic webhook rehearsal; only its digest is
          stored.
        </p>
        <form className="cmd-form" onSubmit={create}>
          <label htmlFor="integration-name">Source name</label>
          <input
            id="integration-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
            placeholder="Example: Demo repository feed"
          />
          <label htmlFor="integration-kind">Source category</label>
          <select
            id="integration-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as LocalIntegration["kind"]);
              setResourceId("");
            }}
          >
            <option value="synthetic-development">
              Synthetic development fixture
            </option>
            <option value="synthetic-operations">
              Synthetic operational fixture
            </option>
          </select>
          <label htmlFor="integration-project">Project</label>
          <select
            id="integration-project"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setResourceId("");
              setResourceLinks([]);
              setResourceCursor(null);
            }}
            required
          >
            {projects.length === 0 && (
              <option value="">Create a project first</option>
            )}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {projectCursor && (
            <Button type="button" onClick={loadMoreProjects} disabled={busy}>
              Load more projects
            </Button>
          )}
          {kind === "synthetic-operations" && (
            <>
              <label htmlFor="integration-resource">Linked resource</label>
              <select
                id="integration-resource"
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
                required
              >
                <option value="">Choose a resource</option>
                {resourceLinks.map((link) => (
                  <option key={link.id} value={link.resource.id}>
                    {link.resource.name}
                  </option>
                ))}
              </select>
              {resourceCursor && (
                <Button
                  type="button"
                  onClick={loadMoreResources}
                  disabled={busy}
                >
                  Load more resources
                </Button>
              )}
              {resourceLinks.length === 0 && (
                <p className="cmd-form-hint">
                  Link a resource from the project workspace before adding an
                  operational source.
                </p>
              )}
            </>
          )}
          <Button type="submit" disabled={busy || !projectId}>
            {busy ? "Saving..." : "Add local source"}
          </Button>
        </form>
      </section>
      <section
        className="cmd-workspace-section"
        aria-labelledby="integration-list-heading"
      >
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">Source inventory</p>
            <h2 id="integration-list-heading">Configured local sources</h2>
          </div>
          <span className="cmd-count">{items.length} shown</span>
        </div>
        {loading && (
          <p className="cmd-inline-state" role="status">
            Loading integrations...
          </p>
        )}
        {!loading && items.length === 0 && (
          <RecordEmptyState
            title="No local sources yet"
            description="Add a development or operational fixture to exercise the project activity path."
          />
        )}
        <ul className="cmd-record-list" aria-label="Configured integrations">
          {items.map((item) => (
            <li key={item.id}>
              <LocalIntegrationCard
                name={item.name}
                kind={item.kind}
                enabled={item.enabled}
                projectName={item.projectName}
                projectHref={`/projects/${item.projectId}`}
                resourceName={item.resourceName}
                resourceHref={
                  item.resourceId ? `/resources/${item.resourceId}` : null
                }
                activityHref={`/activity?projectId=${item.projectId}`}
                lastAttemptAt={item.lastAttemptAt}
                lastSuccessAt={item.lastSuccessAt}
                lastError={item.lastError}
                freshnessState={item.freshnessState}
                freshnessWindowMinutes={item.freshnessWindowMinutes}
                lastObservedAt={item.lastObservedAt}
                lastReceivedAt={item.lastReceivedAt}
                observationEvidenceHref={item.observationEvidenceHref}
              >
                <form
                  className="cmd-freshness-form"
                  onSubmit={(event) => void saveFreshnessWindow(item, event)}
                >
                  <label htmlFor={`freshness-${item.id}`}>
                    Synthetic freshness window, minutes
                  </label>
                  <input
                    key={`${item.id}-${item.freshnessWindowMinutes}`}
                    id={`freshness-${item.id}`}
                    name="windowMinutes"
                    type="number"
                    min={1}
                    max={10080}
                    defaultValue={item.freshnessWindowMinutes}
                    required
                  />
                  <Button type="submit" disabled={busyId !== null}>
                    Save window
                  </Button>
                </form>
                <Button
                  type="button"
                  onClick={() => setEnabled(item)}
                  disabled={busyId !== null}
                >
                  {item.enabled ? "Disable source" : "Enable source"}
                </Button>
                {item.kind === "synthetic-development" ? (
                  <Button
                    type="button"
                    onClick={() => runSample(item, "development.pr-merged")}
                    disabled={!item.enabled || busyId !== null}
                  >
                    Simulate PR merge
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      onClick={() => runSample(item, "operations.monitor-down")}
                      disabled={!item.enabled || busyId !== null}
                    >
                      Simulate monitor down
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        runSample(item, "operations.monitor-recovered")
                      }
                      disabled={!item.enabled || busyId !== null}
                    >
                      Simulate recovery
                    </Button>
                  </>
                )}
                <LocalConnectorPanel
                  enabled={item.enabled}
                  receiverConfigured={item.receiverConfigured}
                  token={receiverTokens[item.id] ?? null}
                  feed={feed[item.id] ?? []}
                  nextCursor={feedCursors[item.id] ?? null}
                  busy={busyId !== null}
                  onRotate={() => void rotateReceiverToken(item)}
                  onReceive={(scenarioId) =>
                    void receiveFixture(item, scenarioId)
                  }
                  onQueue={(scenarioId) =>
                    void enqueuePollFixture(item, scenarioId)
                  }
                  onRefresh={() =>
                    void refreshFeed(item.id).catch((cause: unknown) =>
                      setError(message(cause)),
                    )
                  }
                  onLoadMore={() =>
                    void refreshFeed(
                      item.id,
                      feedCursors[item.id] ?? undefined,
                    ).catch((cause: unknown) => setError(message(cause)))
                  }
                  scenarios={
                    item.kind === "synthetic-development"
                      ? [{ id: "development.pr-merged", label: "PR merge" }]
                      : [
                          {
                            id: "operations.monitor-down",
                            label: "monitor down",
                          },
                          {
                            id: "operations.monitor-recovered",
                            label: "recovery",
                          },
                        ]
                  }
                />
                <section
                  className="cmd-local-connector"
                  aria-label={`Synthetic source history for ${item.name}`}
                >
                  <h4>Import history</h4>
                  <p>
                    Worker receipts remain linked to their original synthetic
                    envelopes.
                  </p>
                  <Button
                    type="button"
                    onClick={() =>
                      void loadHistory(item.id).catch((cause: unknown) =>
                        setError(message(cause)),
                      )
                    }
                  >
                    Load recent imports
                  </Button>
                  {(history[item.id] ?? []).length === 0 && (
                    <p>No imports loaded.</p>
                  )}
                  <ol className="cmd-connector-feed">
                    {(history[item.id] ?? []).map((entry) => (
                      <li key={entry.id}>
                        {entry.scenarioId} / {entry.state} / observed{" "}
                        {new Date(entry.occurredAt).toLocaleString()} / received{" "}
                        {new Date(entry.receivedAt).toLocaleString()}
                        {" · "}
                        <a href={`/flow-replay/${entry.id}`}>
                          Replay synthetic flow
                        </a>
                        {" · "}
                        <a
                          href={`/api/v1/source-envelopes/${entry.sourceEnvelopeId}`}
                        >
                          Original synthetic envelope
                        </a>
                        {entry.eventId && (
                          <>
                            {" · "}
                            <a href={`/api/v1/events/${entry.eventId}`}>
                              Normalized event
                            </a>
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                  {historyCursors[item.id] && (
                    <Button
                      type="button"
                      onClick={() =>
                        void loadHistory(
                          item.id,
                          historyCursors[item.id] ?? undefined,
                        ).catch((cause: unknown) => setError(message(cause)))
                      }
                    >
                      Load older imports
                    </Button>
                  )}
                </section>
              </LocalIntegrationCard>
            </li>
          ))}
        </ul>
        {cursor && (
          <Button onClick={loadMore} disabled={busy}>
            Load more sources
          </Button>
        )}
      </section>
    </AppShell>
  );
}
