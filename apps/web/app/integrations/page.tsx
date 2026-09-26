"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  LocalIntegration,
  SyntheticEventImportRecord,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
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
          fixture mode makes no network call and stores no credential.
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
              >
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
