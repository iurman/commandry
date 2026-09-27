"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AppShell,
  Button,
  RecordEmptyState,
  SyntheticAlertCard,
  SyntheticAttentionCard,
  SyntheticEventCard,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
  type ProjectResourceLink,
} from "../projects/api";
import {
  activityPagePath,
  syntheticImport,
  syntheticPage,
  type SyntheticAlertRecord,
  type SyntheticAttentionRecord,
  type SyntheticEventRecord,
  type SyntheticImportRecord,
  type SyntheticScenarioId,
} from "./api";

const scenarios: { id: SyntheticScenarioId; label: string }[] = [
  {
    id: "development.pr-merged",
    label: "Synthetic development: PR merged",
  },
  {
    id: "operations.monitor-down",
    label: "Synthetic operations: monitor down",
  },
  {
    id: "operations.monitor-recovered",
    label: "Synthetic operations: monitor recovered",
  },
];

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function ActivityPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [nextProjectCursor, setNextProjectCursor] = useState<string | null>(
    null,
  );
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsLoadingMore, setProjectsLoadingMore] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [links, setLinks] = useState<ProjectResourceLink[]>([]);
  const [nextLinkCursor, setNextLinkCursor] = useState<string | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksLoadingMore, setLinksLoadingMore] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState("");
  const [scenarioId, setScenarioId] = useState<SyntheticScenarioId>(
    scenarios[0]!.id,
  );
  const [occurrenceId, setOccurrenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(true);
  const [activeImport, setActiveImport] =
    useState<SyntheticImportRecord | null>(null);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [events, setEvents] = useState<SyntheticEventRecord[]>([]);
  const [nextEventCursor, setNextEventCursor] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsLoadingMore, setEventsLoadingMore] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [attention, setAttention] = useState<SyntheticAttentionRecord[]>([]);
  const [nextAttentionCursor, setNextAttentionCursor] = useState<string | null>(
    null,
  );
  const [attentionLoading, setAttentionLoading] = useState(true);
  const [attentionLoadingMore, setAttentionLoadingMore] = useState(false);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<SyntheticAlertRecord[]>([]);
  const [nextAlertCursor, setNextAlertCursor] = useState<string | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsLoadingMore, setAlertsLoadingMore] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const activeImportId = activeImport?.id;
  const activeImportState = activeImport?.state;

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects"))
      .then(async (page) => {
        if (!active) return;
        setProjects(page.items);
        setNextProjectCursor(page.nextCursor);
        setProjectsError(null);
        const requestedId = new URLSearchParams(window.location.search).get(
          "projectId",
        );
        if (!requestedId) return;
        const listed = page.items.find((project) => project.id === requestedId);
        if (listed) {
          setProjectId(listed.id);
          setLinksLoading(true);
          return;
        }
        try {
          const requested = await apiJson<ProjectRecord>(
            `/api/v1/projects/${encodeURIComponent(requestedId)}`,
          );
          if (!active) return;
          setProjects((current) => [requested, ...current]);
          setProjectId(requested.id);
          setLinksLoading(true);
        } catch (cause) {
          if (active)
            setProjectsError(message(cause, "Linked project is unavailable."));
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setProjectsError(message(cause, "Projects are unavailable."));
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
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
        setLinks(page.items);
        setNextLinkCursor(page.nextCursor);
        setLinksError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setLinksError(message(cause, "Linked resources are unavailable."));
      })
      .finally(() => {
        if (active) setLinksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticImportRecord>>(
      activityPagePath("/api/v1/synthetic-event-imports", { limit: 1 }),
    )
      .then(syntheticPage)
      .then((page) => {
        if (active) setActiveImport(page.items[0] ?? null);
      })
      .catch((cause: unknown) => {
        if (active)
          setImportError(message(cause, "Import history is unavailable."));
      })
      .finally(() => {
        if (active) setImportLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticEventRecord>>(
      activityPagePath("/api/v1/events", { projectId }),
    )
      .then(syntheticPage)
      .then((page) => {
        if (!active) return;
        setEvents(page.items);
        setNextEventCursor(page.nextCursor);
        setEventsError(null);
      })
      .catch((cause: unknown) => {
        if (active) setEventsError(message(cause, "Activity is unavailable."));
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, refreshVersion]);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticAttentionRecord>>(
      activityPagePath("/api/v1/attention", { projectId }),
    )
      .then(syntheticPage)
      .then((page) => {
        if (!active) return;
        setAttention(page.items);
        setNextAttentionCursor(page.nextCursor);
        setAttentionError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setAttentionError(message(cause, "Attention is unavailable."));
      })
      .finally(() => {
        if (active) setAttentionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, refreshVersion]);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticAlertRecord>>(
      activityPagePath("/api/v1/alerts", { projectId }),
    )
      .then(syntheticPage)
      .then((page) => {
        if (!active) return;
        setAlerts(page.items);
        setNextAlertCursor(page.nextCursor);
        setAlertsError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setAlertsError(message(cause, "Alert history is unavailable."));
      })
      .finally(() => {
        if (active) setAlertsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, refreshVersion]);

  useEffect(() => {
    if (
      !activeImportId ||
      !activeImportState ||
      !["queued", "running"].includes(activeImportState) ||
      pollAttempt >= 30
    )
      return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const record = syntheticImport(
          await apiJson<SyntheticImportRecord>(
            `/api/v1/synthetic-event-imports/${encodeURIComponent(activeImportId)}`,
          ),
        );
        if (!active) return;
        setActiveImport(record);
        setImportError(null);
        if (record.state === "succeeded") {
          setImportFeedback(
            "Synthetic import processed. Activity and attention refreshed.",
          );
          setEventsLoading(true);
          setAttentionLoading(true);
          setAlertsLoading(true);
          setRefreshVersion((current) => current + 1);
        } else if (record.state === "failed") {
          setImportError(record.error ?? "Synthetic import failed.");
        }
      } catch (cause) {
        if (active)
          setImportError(message(cause, "Import status is unavailable."));
      } finally {
        if (active) setPollAttempt((current) => current + 1);
      }
    }, 1000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeImportId, activeImportState, pollAttempt]);

  function selectProject(id: string) {
    setProjectId(id);
    setResourceId("");
    setLinks([]);
    setNextLinkCursor(null);
    setLinksError(null);
    setLinksLoading(Boolean(id));
    setEvents([]);
    setAttention([]);
    setAlerts([]);
    setNextEventCursor(null);
    setNextAttentionCursor(null);
    setNextAlertCursor(null);
    setEventsLoading(true);
    setAttentionLoading(true);
    setAlertsLoading(true);
  }

  async function loadMoreProjects() {
    if (!nextProjectCursor || projectsLoadingMore) return;
    setProjectsLoadingMore(true);
    setProjectsError(null);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", nextProjectCursor),
      );
      setProjects((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextProjectCursor(page.nextCursor);
    } catch (cause) {
      setProjectsError(message(cause, "Could not load more projects."));
    } finally {
      setProjectsLoadingMore(false);
    }
  }

  async function loadMoreLinks() {
    if (!projectId || !nextLinkCursor || linksLoadingMore) return;
    setLinksLoadingMore(true);
    setLinksError(null);
    try {
      const page = await apiJson<PageResponse<ProjectResourceLink>>(
        pagePath(
          `/api/v1/projects/${encodeURIComponent(projectId)}/resources`,
          nextLinkCursor,
        ),
      );
      setLinks((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextLinkCursor(page.nextCursor);
    } catch (cause) {
      setLinksError(message(cause, "Could not load more linked resources."));
    } finally {
      setLinksLoadingMore(false);
    }
  }

  async function loadMoreEvents() {
    if (!nextEventCursor || eventsLoadingMore) return;
    setEventsLoadingMore(true);
    setEventsError(null);
    try {
      const page = syntheticPage(
        await apiJson<PageResponse<SyntheticEventRecord>>(
          activityPagePath("/api/v1/events", {
            cursor: nextEventCursor,
            projectId,
          }),
        ),
      );
      setEvents((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextEventCursor(page.nextCursor);
    } catch (cause) {
      setEventsError(message(cause, "Could not load more events."));
    } finally {
      setEventsLoadingMore(false);
    }
  }

  async function loadMoreAttention() {
    if (!nextAttentionCursor || attentionLoadingMore) return;
    setAttentionLoadingMore(true);
    setAttentionError(null);
    try {
      const page = syntheticPage(
        await apiJson<PageResponse<SyntheticAttentionRecord>>(
          activityPagePath("/api/v1/attention", {
            cursor: nextAttentionCursor,
            projectId,
          }),
        ),
      );
      setAttention((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextAttentionCursor(page.nextCursor);
    } catch (cause) {
      setAttentionError(message(cause, "Could not load more attention."));
    } finally {
      setAttentionLoadingMore(false);
    }
  }

  async function loadMoreAlerts() {
    if (!nextAlertCursor || alertsLoadingMore) return;
    setAlertsLoadingMore(true);
    setAlertsError(null);
    try {
      const page = syntheticPage(
        await apiJson<PageResponse<SyntheticAlertRecord>>(
          activityPagePath("/api/v1/alerts", {
            cursor: nextAlertCursor,
            projectId,
          }),
        ),
      );
      setAlerts((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextAlertCursor(page.nextCursor);
    } catch (cause) {
      setAlertsError(message(cause, "Could not load more alerts."));
    } finally {
      setAlertsLoadingMore(false);
    }
  }

  async function importFixture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resourceRequired = scenarioId.startsWith("operations.");
    if (!projectId || (resourceRequired && !resourceId) || submitting) return;
    const submittedOccurrenceId = occurrenceId.trim() || crypto.randomUUID();
    setSubmitting(true);
    setImportError(null);
    setImportFeedback(null);
    try {
      const record = syntheticImport(
        await apiJson<SyntheticImportRecord>(
          "/api/v1/synthetic-event-imports",
          {
            method: "POST",
            body: JSON.stringify({
              scenarioId,
              projectId,
              ...(resourceId ? { resourceId } : {}),
              occurrenceId: submittedOccurrenceId,
            }),
          },
        ),
      );
      setActiveImport(record);
      setPollAttempt(0);
      setOccurrenceId("");
      if (record.state === "succeeded") {
        setImportFeedback(
          "Synthetic occurrence already processed. Activity refreshed.",
        );
        setEventsLoading(true);
        setAttentionLoading(true);
        setAlertsLoading(true);
        setRefreshVersion((current) => current + 1);
      } else {
        setImportFeedback("Synthetic fixture queued for the local worker.");
      }
    } catch (cause) {
      setImportError(message(cause, "Could not import synthetic fixture."));
    } finally {
      setSubmitting(false);
    }
  }

  const projectName = (id: string) =>
    projects.find((project) => project.id === id)?.name ?? id;
  const resourceName = (id: string | null) =>
    id
      ? (links.find((link) => link.resource.id === id)?.resource.name ?? id)
      : undefined;

  return (
    <AppShell current="Activity">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Evidence / Local simulation</p>
          <h1>Activity</h1>
          <p className="cmd-lead">
            Import fixed fixtures and inspect what the worker normalized, when
            it arrived, and why attention changed.
          </p>
        </div>
        <span className="cmd-headline-mark" aria-hidden="true">
          03 / Observe
        </span>
      </header>

      <div className="cmd-notice cmd-synthetic-notice">
        <h2>Synthetic data only</h2>
        <p>
          These local fixtures do not connect to GitHub or a monitor, perform
          external actions, or update real resource health. Manual resources
          remain unknown until a real source observes them.
        </p>
      </div>

      <div className="cmd-activity-layout">
        <aside
          className="cmd-create-panel cmd-activity-import"
          aria-labelledby="activity-import-heading"
        >
          <p className="cmd-eyebrow">Fixed fixture adapter</p>
          <h2 id="activity-import-heading">Import a synthetic event</h2>
          <p className="cmd-form-intro">
            Choose a project. Operational scenarios need a linked resource; the
            development scenario may use project context alone. The local worker
            normalizes the labeled source envelope.
          </p>
          <form className="cmd-form" onSubmit={importFixture}>
            <label htmlFor="activity-project">Project</label>
            <select
              disabled={projectsLoading}
              id="activity-project"
              onChange={(event) => selectProject(event.target.value)}
              value={projectId}
            >
              <option value="">All projects for viewing</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {projectsLoading && (
              <p className="cmd-form-hint" role="status">
                Loading projects...
              </p>
            )}
            {projectsError && (
              <p className="cmd-form-error" role="alert">
                {projectsError}
              </p>
            )}
            {nextProjectCursor && (
              <Button disabled={projectsLoadingMore} onClick={loadMoreProjects}>
                {projectsLoadingMore ? "Loading..." : "Load more projects"}
              </Button>
            )}
            {!projectsLoading && projects.length === 0 && !projectsError && (
              <p className="cmd-form-hint">
                No project exists. <a href="/projects">Create one first</a>.
              </p>
            )}

            <label htmlFor="activity-resource">Linked resource</label>
            <select
              disabled={!projectId || linksLoading || links.length === 0}
              id="activity-resource"
              onChange={(event) => setResourceId(event.target.value)}
              value={resourceId}
            >
              <option value="">Choose a linked resource</option>
              {links.map((link) => (
                <option key={link.id} value={link.resource.id}>
                  {link.resource.name} ({link.resource.kind})
                </option>
              ))}
            </select>
            {linksLoading && (
              <p className="cmd-form-hint" role="status">
                Loading linked resources...
              </p>
            )}
            {linksError && (
              <p className="cmd-form-error" role="alert">
                {linksError}
              </p>
            )}
            {projectId &&
              !linksLoading &&
              links.length === 0 &&
              !linksError && (
                <p className="cmd-form-hint">
                  This project has no linked resource. Development fixtures can
                  still be imported.{" "}
                  <a href={`/projects/${encodeURIComponent(projectId)}`}>
                    Link one for operational fixtures
                  </a>
                  .
                </p>
              )}
            {nextLinkCursor && (
              <Button disabled={linksLoadingMore} onClick={loadMoreLinks}>
                {linksLoadingMore ? "Loading..." : "Load more linked resources"}
              </Button>
            )}

            <label htmlFor="activity-scenario">Synthetic scenario</label>
            <select
              id="activity-scenario"
              onChange={(event) => {
                const scenario = scenarios.find(
                  (item) => item.id === event.target.value,
                );
                if (scenario) {
                  setScenarioId(scenario.id);
                  setOccurrenceId("");
                }
              }}
              value={scenarioId}
            >
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
            <label htmlFor="activity-occurrence">Synthetic occurrence ID</label>
            <input
              id="activity-occurrence"
              maxLength={160}
              onChange={(event) => setOccurrenceId(event.target.value)}
              placeholder="Automatic new ID"
              value={occurrenceId}
            />
            <p className="cmd-form-hint">
              Leave blank for a fresh browser UUID on each import. Paste a
              previous ID to replay the same occurrence safely.
            </p>
            {activeImport && (
              <Button
                onClick={() => setOccurrenceId(activeImport.occurrenceId)}
              >
                Reuse last occurrence ID
              </Button>
            )}
            <Button
              disabled={
                submitting ||
                !projectId ||
                (scenarioId.startsWith("operations.") && !resourceId)
              }
              type="submit"
              variant="primary"
            >
              {submitting
                ? "Queueing synthetic event..."
                : "Import synthetic event"}
            </Button>
          </form>

          <div
            className="cmd-activity-import-status"
            aria-labelledby="activity-import-status-heading"
          >
            <p className="cmd-eyebrow">Local worker / Receipt</p>
            <h3 id="activity-import-status-heading">Import status</h3>
            {importLoading && (
              <p className="cmd-inline-state" role="status">
                Loading import history...
              </p>
            )}
            {importError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {importError}
              </p>
            )}
            {importFeedback && (
              <p className="cmd-form-success" role="status">
                {importFeedback}
              </p>
            )}
            {!importLoading && !activeImport && !importError && (
              <p className="cmd-form-intro">
                No synthetic import has been submitted yet.
              </p>
            )}
            {activeImport && (
              <div className="cmd-activity-receipt">
                <span className="cmd-synthetic-stamp">Synthetic import</span>
                <p>
                  <strong>{activeImport.state}</strong> ·{" "}
                  {activeImport.scenarioId}
                </p>
                <p>
                  {activeImport.sourceLabel}. Attempts: {activeImport.attempts}.
                </p>
                <p>
                  Project: {projectName(activeImport.projectId)}.
                  {activeImport.resourceId
                    ? ` Resource: ${resourceName(activeImport.resourceId)}.`
                    : " Project-scoped occurrence."}
                </p>
                <p>
                  Occurred {activeImport.occurredAt}. Received{" "}
                  {activeImport.receivedAt}.
                </p>
                <p>
                  Occurrence ID: <code>{activeImport.occurrenceId}</code>
                </p>
                <a href={`/flow-replay/${activeImport.id}`}>
                  Replay persisted synthetic flow
                </a>
                <a
                  href={`/api/v1/source-envelopes/${encodeURIComponent(activeImport.sourceEnvelopeId)}`}
                >
                  Inspect submitted synthetic envelope
                </a>
                {activeImport.eventId && (
                  <a
                    href={`/api/v1/events/${encodeURIComponent(activeImport.eventId)}`}
                  >
                    Inspect normalized synthetic event
                  </a>
                )}
                {activeImport.state !== "succeeded" &&
                  activeImport.state !== "failed" &&
                  pollAttempt >= 30 && (
                    <p className="cmd-form-hint">
                      Still processing. Reload this page to resume status
                      checks.
                    </p>
                  )}
              </div>
            )}
          </div>
        </aside>

        <div className="cmd-activity-results">
          <section
            className="cmd-activity-section"
            id="attention"
            aria-labelledby="active-attention-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Rule projection / Current</p>
                <h2 id="active-attention-heading">
                  Active synthetic attention
                </h2>
              </div>
              {!attentionLoading && (
                <span className="cmd-count">{attention.length} shown</span>
              )}
            </div>
            <p className="cmd-section-intro">
              Each item names its deterministic rule and links to source
              evidence. This is simulation state, not live health.
            </p>
            {attentionLoading && (
              <p className="cmd-inline-state" role="status">
                Loading synthetic attention...
              </p>
            )}
            {attentionError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {attentionError}
              </p>
            )}
            {!attentionLoading && !attentionError && attention.length === 0 && (
              <RecordEmptyState
                title="No active synthetic attention"
                description="No imported fixture currently satisfies an attention rule in this view."
              />
            )}
            {attention.length > 0 && (
              <ul
                className="cmd-activity-list"
                aria-label="Active synthetic attention"
              >
                {attention.map((item) => (
                  <li key={item.id}>
                    <SyntheticAttentionCard
                      {...item}
                      projectName={projectName(item.projectId)}
                      resourceName={resourceName(item.resourceId)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {nextAttentionCursor && (
              <Button
                disabled={attentionLoadingMore}
                onClick={loadMoreAttention}
              >
                {attentionLoadingMore ? "Loading..." : "Load more attention"}
              </Button>
            )}
          </section>

          <section
            className="cmd-activity-section"
            aria-labelledby="alert-history-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Rule lifecycle / History</p>
                <h2 id="alert-history-heading">Synthetic alert history</h2>
              </div>
              {!alertsLoading && (
                <span className="cmd-count">{alerts.length} shown</span>
              )}
            </div>
            <p className="cmd-section-intro">
              Active and resolved conditions share one alert record. Recovery
              does not rewrite the original source event.
            </p>
            {alertsLoading && (
              <p className="cmd-inline-state" role="status">
                Loading synthetic alert history...
              </p>
            )}
            {alertsError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {alertsError}
              </p>
            )}
            {!alertsLoading && !alertsError && alerts.length === 0 && (
              <RecordEmptyState
                title="No synthetic alert history"
                description="Import a monitor-down fixture to exercise a rule and its recovery."
              />
            )}
            {alerts.length > 0 && (
              <ul
                className="cmd-activity-list"
                aria-label="Synthetic alert history"
              >
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <SyntheticAlertCard
                      {...alert}
                      evidenceHref={`/api/v1/events/${encodeURIComponent(alert.lastEventId)}`}
                      projectName={projectName(alert.projectId)}
                      resourceName={resourceName(alert.resourceId)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {nextAlertCursor && (
              <Button disabled={alertsLoadingMore} onClick={loadMoreAlerts}>
                {alertsLoadingMore ? "Loading..." : "Load more alerts"}
              </Button>
            )}
          </section>

          <section
            className="cmd-activity-section"
            id="events"
            aria-labelledby="normalized-events-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Normalized / Historical</p>
                <h2 id="normalized-events-heading">Synthetic events</h2>
              </div>
              {!eventsLoading && (
                <span className="cmd-count">{events.length} shown</span>
              )}
            </div>
            <p className="cmd-section-intro">
              Occurred and ingested times stay separate. Evidence opens the
              immutable synthetic source envelope.
            </p>
            {eventsLoading && (
              <p className="cmd-inline-state" role="status">
                Loading synthetic events...
              </p>
            )}
            {eventsError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {eventsError}
              </p>
            )}
            {!eventsLoading && !eventsError && events.length === 0 && (
              <RecordEmptyState
                title="No synthetic events"
                description="Import a fixed fixture to see the worker's normalized output here."
              />
            )}
            {events.length > 0 && (
              <ul className="cmd-activity-list" aria-label="Synthetic events">
                {events.map((event) => (
                  <li key={event.id}>
                    <SyntheticEventCard
                      {...event}
                      projectName={projectName(event.projectId)}
                      resourceName={resourceName(event.resourceId)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {nextEventCursor && (
              <Button disabled={eventsLoadingMore} onClick={loadMoreEvents}>
                {eventsLoadingMore ? "Loading..." : "Load more events"}
              </Button>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
