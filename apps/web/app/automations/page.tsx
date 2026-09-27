"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AutomationDefinition, AutomationRun } from "@commandry/contracts";
import {
  AppShell,
  AutomationCard,
  Button,
  RecordEmptyState,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
  type ProjectResourceLink,
} from "../projects/api";

export default function AutomationsPage() {
  const [items, setItems] = useState<AutomationDefinition[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [latestRuns, setLatestRuns] = useState<Record<string, AutomationRun>>(
    {},
  );
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [localNoteEnabled, setLocalNoteEnabled] = useState(false);
  const [triggerType, setTriggerType] = useState<
    | "on_creation_once"
    | "recurring_interval"
    | "synthetic_event"
    | "synthetic_condition"
  >("on_creation_once");
  const [eventType, setEventType] = useState<
    "git.pull_request.merged" | "monitor.down" | "monitor.recovered"
  >("monitor.down");
  const [recurrenceLocalTime, setRecurrenceLocalTime] = useState("");
  const [everyMinutes, setEveryMinutes] = useState("60");
  const [conditionResources, setConditionResources] = useState<
    ProjectResourceLink[]
  >([]);
  const [conditionResourceCursor, setConditionResourceCursor] = useState<
    string | null
  >(null);
  const [conditionResourceId, setConditionResourceId] = useState("");
  const [thresholdPercent, setThresholdPercent] = useState("50");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function enrich(definitions: AutomationDefinition[]) {
    const uniqueProjectIds = [
      ...new Set(definitions.map((item) => item.projectId)),
    ];
    const [projectsResult, runsResult] = await Promise.all([
      Promise.allSettled(
        uniqueProjectIds.map((id) =>
          apiJson<ProjectRecord>(`/api/v1/projects/${id}`),
        ),
      ),
      Promise.allSettled(
        definitions.map((item) =>
          apiJson<PageResponse<AutomationRun>>(
            pagePath(`/api/v1/automations/${item.id}/runs`),
          ),
        ),
      ),
    ]);
    setProjectNames((current) => {
      const next = { ...current };
      projectsResult.forEach((result, index) => {
        if (result.status === "fulfilled")
          next[uniqueProjectIds[index]!] = result.value.name;
      });
      return next;
    });
    setLatestRuns((current) => {
      const next = { ...current };
      runsResult.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value.items[0])
          next[definitions[index]!.id] = result.value.items[0];
      });
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<AutomationDefinition>>(
        pagePath("/api/v1/automations"),
      ),
      apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects")),
    ])
      .then(([automations, projectPage]) => {
        if (!active) return;
        setItems(automations.items);
        setCursor(automations.nextCursor);
        setProjects(projectPage.items);
        setProjectCursor(projectPage.nextCursor);
        setProjectId(projectPage.items[0]?.id ?? "");
        void enrich(automations.items);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Automations are unavailable.",
          );
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
        const unique = page.items.filter(
          (item, index, all) =>
            all.findIndex(
              (candidate) => candidate.resource.id === item.resource.id,
            ) === index,
        );
        setConditionResources(unique);
        setConditionResourceCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load project resources.",
          );
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  async function loadMoreConditionResources() {
    if (!conditionResourceCursor || !projectId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectResourceLink>>(
        pagePath(
          `/api/v1/projects/${encodeURIComponent(projectId)}/resources`,
          conditionResourceCursor,
        ),
      );
      setConditionResources((current) => [
        ...current,
        ...page.items.filter(
          (item) =>
            !current.some((saved) => saved.resource.id === item.resource.id),
        ),
      ]);
      setConditionResourceCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more project resources.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreProjects() {
    if (!projectCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", projectCursor),
      );
      setProjects((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setProjectCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load projects.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<AutomationDefinition>>(
        pagePath("/api/v1/automations", cursor),
      );
      setItems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
      await enrich(page.items);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more automations.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !name.trim() || busy) return;
    const start = new Date(recurrenceLocalTime);
    const recurrence =
      triggerType === "recurring_interval"
        ? {
            startAt: Number.isFinite(start.getTime())
              ? start.toISOString()
              : "",
            everyMinutes: Number(everyMinutes),
          }
        : undefined;
    if (
      recurrence &&
      (!Number.isFinite(Date.parse(recurrence.startAt)) ||
        Date.parse(recurrence.startAt) <= Date.now() ||
        !Number.isInteger(recurrence.everyMinutes) ||
        recurrence.everyMinutes < 5 ||
        recurrence.everyMinutes > 10_080)
    ) {
      setError(
        "Choose a future start and an interval from 5 to 10080 minutes.",
      );
      return;
    }
    if (
      triggerType === "synthetic_condition" &&
      (!conditionResourceId ||
        !Number.isInteger(Number(thresholdPercent)) ||
        Number(thresholdPercent) < 0 ||
        Number(thresholdPercent) > 99)
    ) {
      setError("Choose a linked resource and a threshold from 0 to 99%.");
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const definition = await apiJson<AutomationDefinition>(
        "/api/v1/automations",
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            name: name.trim(),
            enabled,
            ...(localNoteEnabled
              ? {
                  localAction: {
                    kind: "create_project_note",
                    capabilityReference: "commandry.project.knowledge.create",
                  },
                }
              : {}),
            ...(recurrence ? { recurrence } : {}),
            ...(triggerType === "synthetic_event" ? { eventType } : {}),
            ...(triggerType === "synthetic_condition"
              ? {
                  condition: {
                    resourceId: conditionResourceId,
                    metricName: "external_availability",
                    operator: "lte",
                    thresholdPercent: Number(thresholdPercent),
                  },
                }
              : {}),
          }),
        },
      );
      setItems((current) => [definition, ...current]);
      setProjectNames((current) => ({
        ...current,
        [projectId]:
          projects.find((item) => item.id === projectId)?.name ?? projectId,
      }));
      setFeedback(
        localNoteEnabled
          ? "Local routine saved with an opted-in Commandry note action. Each successful worker run creates one labeled synthetic project note and records its source capture in the audit."
          : triggerType === "recurring_interval"
            ? enabled
              ? "Recurring local summary saved. The worker will create at most one due occurrence per interval; output is synthetic and unverified."
              : "Disabled recurring local summary saved. No occurrence will be created until it is enabled."
            : triggerType === "synthetic_event"
              ? enabled
                ? "Synthetic event routine saved. A new matching fixture event will queue a source-linked local summary."
                : "Disabled synthetic event routine saved. Matching events will be recorded as skipped."
              : triggerType === "synthetic_condition"
                ? enabled
                  ? "Synthetic availability condition saved. Its next eligible below-threshold crossing will queue a source-linked local summary."
                  : "Disabled synthetic condition saved. Below-threshold crossings will be recorded as skipped."
                : enabled
                  ? "Local automation created and its one-time synthetic summary queued. Open it to review the worker result."
                  : "Disabled local automation saved. It will not run until enabled and manually triggered.",
      );
      setName("");
      setLocalNoteEnabled(false);
      setRecurrenceLocalTime("");
      if (enabled && triggerType === "on_creation_once")
        void enrich([definition]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create local automation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Automations">
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Local-only / Controlled routines</p>
          <h1>Automations</h1>
          <p className="cmd-lead">
            Review definitions and worker runs. This local routine reads a
            project brief at creation, at a recurring UTC interval, after a
            matching synthetic event or availability crossing, or in a manually
            scheduled one-time run. Output is synthetic and unverified; no
            external action occurs.
          </p>
          <p>
            <a href="/morning">Open the source-linked morning run digest</a>
          </p>
        </div>
      </header>
      <div className="cmd-automation-layout">
        <section
          className="cmd-workspace-section"
          aria-labelledby="automation-list-heading"
        >
          <div className="cmd-section-heading">
            <div>
              <p className="cmd-eyebrow">Registry / local source of truth</p>
              <h2 id="automation-list-heading">Routines</h2>
            </div>
            <span className="cmd-count">{items.length} shown</span>
          </div>
          {loading && (
            <p className="cmd-inline-state" role="status">
              Loading automations...
            </p>
          )}
          {error && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {error}
            </p>
          )}
          {!loading && items.length === 0 && !error && (
            <RecordEmptyState
              title="No local automations"
              description="Create one to exercise a bounded worker summary."
            />
          )}
          <ul className="cmd-automation-list" aria-label="Local automations">
            {items.map((item) => (
              <li key={item.id}>
                <AutomationCard
                  automation={{
                    id: item.id,
                    name: item.name,
                    projectName: projectNames[item.projectId] ?? item.projectId,
                    enabled: item.enabled,
                    triggerType: item.triggerType,
                    eventType: item.eventType,
                    condition: item.condition ?? null,
                    createsLocalNote: Boolean(item.localAction),
                    latestRunState: latestRuns[item.id]?.state ?? null,
                    latestRunAt: latestRuns[item.id]?.createdAt ?? null,
                    nextRunAt: item.nextRunAt,
                  }}
                />
              </li>
            ))}
          </ul>
          {cursor && (
            <Button disabled={busy} onClick={loadMore}>
              Load more automations
            </Button>
          )}
        </section>
        <section
          className="cmd-workspace-section cmd-create-panel"
          aria-labelledby="automation-create-heading"
        >
          <p className="cmd-eyebrow">Create / Bounded local policy</p>
          <h2 id="automation-create-heading">New local routine</h2>
          <p className="cmd-form-intro">
            Choose a summary at creation, a bounded recurring schedule, a
            project-scoped synthetic fixture event, or a resource-specific
            synthetic availability condition. Open the detail page to review
            runs or schedule an extra one-time local run.
          </p>
          <form className="cmd-form" onSubmit={create}>
            <label htmlFor="automation-name">Name</label>
            <input
              id="automation-name"
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            <label htmlFor="automation-project">Project</label>
            <select
              id="automation-project"
              onChange={(event) => {
                setProjectId(event.target.value);
                setConditionResourceId("");
                setConditionResources([]);
                setConditionResourceCursor(null);
              }}
              required
              value={projectId}
            >
              {projects.length === 0 && (
                <option value="">Create a project first</option>
              )}
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {projectCursor && (
              <Button disabled={busy} onClick={loadMoreProjects} type="button">
                Load more project choices
              </Button>
            )}
            <label htmlFor="automation-trigger">Trigger</label>
            <select
              id="automation-trigger"
              onChange={(event) =>
                setTriggerType(
                  event.target.value as
                    | "on_creation_once"
                    | "recurring_interval"
                    | "synthetic_event"
                    | "synthetic_condition",
                )
              }
              value={triggerType}
            >
              <option value="on_creation_once">Once at creation</option>
              <option value="recurring_interval">
                Recurring local interval
              </option>
              <option value="synthetic_event">Synthetic fixture event</option>
              <option value="synthetic_condition">
                Synthetic availability threshold
              </option>
            </select>
            {triggerType === "synthetic_event" && (
              <>
                <label htmlFor="automation-event-type">Matching event</label>
                <select
                  id="automation-event-type"
                  onChange={(event) =>
                    setEventType(event.target.value as typeof eventType)
                  }
                  value={eventType}
                >
                  <option value="monitor.down">Synthetic monitor down</option>
                  <option value="monitor.recovered">
                    Synthetic monitor recovered
                  </option>
                  <option value="git.pull_request.merged">
                    Synthetic pull request merged
                  </option>
                </select>
                <p className="cmd-form-hint">
                  Only newly ingested fixture events for this project match.
                  Each source event is evaluated once; a disabled or busy
                  routine records a skipped run. No live connector is attached.
                </p>
              </>
            )}
            {triggerType === "synthetic_condition" && (
              <>
                <label htmlFor="automation-condition-resource">
                  Linked resource to watch
                </label>
                <select
                  id="automation-condition-resource"
                  required
                  value={conditionResourceId}
                  onChange={(event) =>
                    setConditionResourceId(event.target.value)
                  }
                >
                  <option value="">Choose a project resource</option>
                  {conditionResources.map((link) => (
                    <option key={link.resource.id} value={link.resource.id}>
                      {link.resource.name}
                    </option>
                  ))}
                </select>
                {conditionResourceCursor && (
                  <Button
                    disabled={busy}
                    onClick={loadMoreConditionResources}
                    type="button"
                  >
                    Load more resource choices
                  </Button>
                )}
                <label htmlFor="automation-condition-threshold">
                  At or below availability (%)
                </label>
                <input
                  id="automation-condition-threshold"
                  type="number"
                  min={0}
                  max={99}
                  required
                  value={thresholdPercent}
                  onChange={(event) => setThresholdPercent(event.target.value)}
                />
                <p className="cmd-form-hint">
                  This local rule watches only synthetic external availability
                  samples for one linked resource. It fires once when a sample
                  enters the below-threshold state, then waits for a recovery
                  before another crossing. It performs no external action.
                </p>
              </>
            )}
            {triggerType === "recurring_interval" && (
              <>
                <label htmlFor="automation-recurrence-start">
                  First run (device time)
                </label>
                <input
                  id="automation-recurrence-start"
                  onChange={(event) =>
                    setRecurrenceLocalTime(event.target.value)
                  }
                  required
                  step="1"
                  type="datetime-local"
                  value={recurrenceLocalTime}
                />
                <label htmlFor="automation-recurrence-interval">
                  Repeat every (minutes)
                </label>
                <input
                  id="automation-recurrence-interval"
                  max={10_080}
                  min={5}
                  onChange={(event) => setEveryMinutes(event.target.value)}
                  required
                  type="number"
                  value={everyMinutes}
                />
                <p className="cmd-form-hint">
                  Stored in UTC. After downtime, only the latest due occurrence
                  runs; earlier intervals are counted in the audit trail. A new
                  run is skipped while another is active. Disabling pauses the
                  schedule.
                </p>
              </>
            )}
            <label
              className="cmd-automation-checkbox"
              htmlFor="automation-enabled"
            >
              <input
                checked={enabled}
                id="automation-enabled"
                onChange={(event) => setEnabled(event.target.checked)}
                type="checkbox"
              />
              Enabled at creation
            </label>
            <label
              className="cmd-automation-checkbox"
              htmlFor="automation-local-note"
            >
              <input
                checked={localNoteEnabled}
                id="automation-local-note"
                onChange={(event) => setLocalNoteEnabled(event.target.checked)}
                type="checkbox"
              />
              Create a synthetic project note for each successful run
            </label>
            <p className="cmd-form-hint">
              Actor: local worker. Every run reads the project brief. The
              optional note uses capability reference
              commandry.project.knowledge.create and this definition&apos;s
              local opt-in. Its generated original and run link are retained.
              You can revise the note later. No external action occurs.
            </p>
            {feedback && (
              <p className="cmd-form-success" role="status">
                {feedback}
              </p>
            )}
            <Button
              disabled={busy || !projectId}
              type="submit"
              variant="primary"
            >
              {busy ? "Saving..." : "Create local routine"}
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
