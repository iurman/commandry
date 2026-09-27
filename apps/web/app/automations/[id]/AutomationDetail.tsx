"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  AutomationAuditEvent,
  AutomationDefinition,
  AutomationEvidenceCheck,
  AutomationExportPage,
  AutomationRun,
  AutomationRunAttempt,
} from "@commandry/contracts";
import {
  AppShell,
  AutomationEvidenceCheckCard,
  Button,
  RecordEmptyState,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
} from "../../projects/api";

export default function AutomationDetail({
  automationId,
}: {
  automationId: string;
}) {
  const path = `/api/v1/automations/${encodeURIComponent(automationId)}`;
  const [definition, setDefinition] = useState<AutomationDefinition | null>(
    null,
  );
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runCursor, setRunCursor] = useState<string | null>(null);
  const [audit, setAudit] = useState<AutomationAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [attemptRunId, setAttemptRunId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AutomationRunAttempt[]>([]);
  const [attemptCursor, setAttemptCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scheduleLocalTime, setScheduleLocalTime] = useState("");
  const [checksByRun, setChecksByRun] = useState<
    Record<string, AutomationEvidenceCheck[]>
  >({});
  const [checkCursors, setCheckCursors] = useState<
    Record<string, string | null>
  >({});

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<AutomationDefinition>(path),
      apiJson<PageResponse<AutomationRun>>(pagePath(`${path}/runs`)),
      apiJson<PageResponse<AutomationAuditEvent>>(pagePath(`${path}/audit`)),
    ])
      .then(async ([saved, runPage, auditPage]) => {
        if (!active) return;
        setDefinition(saved);
        setRuns(runPage.items);
        setRunCursor(runPage.nextCursor);
        setAudit(auditPage.items);
        setAuditCursor(auditPage.nextCursor);
        const owner = await apiJson<ProjectRecord>(
          `/api/v1/projects/${saved.projectId}`,
        );
        if (active) setProject(owner);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Automation is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  useEffect(() => {
    if (
      !runs.some((run) => run.state === "queued" || run.state === "running") &&
      !(
        definition?.enabled &&
        (definition.triggerType === "recurring_interval" ||
          definition.triggerType === "synthetic_event" ||
          definition.triggerType === "synthetic_condition")
      )
    )
      return;
    let active = true;
    const nextDue = Math.min(
      ...runs
        .filter((run) => run.state === "queued" && run.scheduledFor)
        .map((run) => Date.parse(run.scheduledFor!))
        .concat(
          definition?.nextRunAt ? [Date.parse(definition.nextRunAt)] : [],
        ),
    );
    const hasReadyRun = runs.some(
      (run) =>
        run.state === "running" ||
        (run.state === "queued" && !run.scheduledFor),
    );
    const delay =
      (definition?.triggerType === "synthetic_event" ||
        definition?.triggerType === "synthetic_condition") &&
      !hasReadyRun
        ? 5000
        : hasReadyRun || !Number.isFinite(nextDue)
          ? 1500
          : Math.max(1500, Math.min(30_000, nextDue - Date.now()));
    const timer = window.setInterval(() => {
      void Promise.all([
        apiJson<PageResponse<AutomationRun>>(pagePath(`${path}/runs`)),
        apiJson<AutomationDefinition>(path),
      ])
        .then(([page, savedDefinition]) => {
          if (!active) return;
          setDefinition(savedDefinition);
          setRuns((current) => [
            ...page.items,
            ...current.filter(
              (item) => !page.items.some((saved) => saved.id === item.id),
            ),
          ]);
          setRunCursor(page.nextCursor);
        })
        .catch(() => {
          /* Keep the last truthful state and allow manual refresh. */
        });
    }, delay);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [path, runs, definition]);

  async function setEnabled() {
    if (!definition || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await apiJson<AutomationDefinition>(`${path}/enabled`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: !definition.enabled,
          expectedEnabled: definition.enabled,
        }),
      });
      setDefinition(updated);
      setFeedback(
        updated.enabled
          ? "Enabled. Future matching synthetic events or availability crossings can create runs; the on-creation trigger does not replay. A recurring schedule resumes at its next future interval."
          : "Disabled. Pending work will be skipped if it has not started.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not change enabled state.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function trigger(scheduledFor?: string) {
    if (!definition?.enabled || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const run = await apiJson<AutomationRun>(`${path}/runs`, {
        method: "POST",
        body: JSON.stringify({
          occurrenceId: crypto.randomUUID(),
          ...(scheduledFor ? { scheduledFor } : {}),
        }),
      });
      setRuns((current) => [run, ...current]);
      if (scheduledFor) {
        try {
          setDefinition(await apiJson<AutomationDefinition>(path));
        } catch {
          setError(
            "The run was scheduled, but the next-run summary could not refresh. Reload to see its current state.",
          );
        }
        setScheduleLocalTime("");
      }
      setFeedback(
        scheduledFor
          ? "One synthetic local summary was scheduled. The worker will read the project brief at the due time; no external action was requested."
          : "A synthetic local summary was queued. No external action was requested.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not queue a local run.",
      );
    } finally {
      setBusy(false);
    }
  }

  function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduleLocalTime) return;
    const localDate = new Date(scheduleLocalTime);
    if (!Number.isFinite(localDate.getTime()) || localDate <= new Date()) {
      setError("Choose a future device time for this local run.");
      return;
    }
    const scheduledFor = localDate.toISOString();
    void trigger(scheduledFor);
  }

  async function loadMoreRuns() {
    if (!runCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<AutomationRun>>(
        pagePath(`${path}/runs`, runCursor),
      );
      setRuns((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setRunCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load older runs.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshAudit(cursor?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<AutomationAuditEvent>>(
        pagePath(`${path}/audit`, cursor),
      );
      setAudit((current) =>
        cursor ? [...current, ...page.items] : page.items,
      );
      setAuditCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load audit events.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function showAttempts(runId: string, cursor?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<AutomationRunAttempt>>(
        pagePath(`/api/v1/automation-runs/${runId}/attempts`, cursor),
      );
      setAttemptRunId(runId);
      setAttempts((current) =>
        cursor ? [...current, ...page.items] : page.items,
      );
      setAttemptCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load attempt history.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadEvidenceChecks(runId: string, cursor?: string) {
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<AutomationEvidenceCheck>>(
        pagePath(`/api/v1/automation-runs/${runId}/evidence-checks`, cursor),
      );
      setChecksByRun((current) => ({
        ...current,
        [runId]: cursor
          ? [...(current[runId] ?? []), ...page.items]
          : page.items,
      }));
      setCheckCursors((current) => ({ ...current, [runId]: page.nextCursor }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load evidence checks.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkEvidence(runId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const checked = await apiJson<AutomationEvidenceCheck>(
        `/api/v1/automation-runs/${runId}/evidence-checks`,
        { method: "POST" },
      );
      setChecksByRun((current) => ({
        ...current,
        [runId]: [checked, ...(current[runId] ?? [])],
      }));
      setFeedback(
        checked.status === "complete"
          ? "All referenced local records were found. The synthetic result remains unverified."
          : "Some referenced local records are missing. Review the check below.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not check local evidence.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadExport() {
    if (busy || !definition) return;
    setBusy(true);
    setError(null);
    try {
      const exportedRuns: AutomationRun[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      let first: AutomationExportPage | null = null;
      do {
        const page: AutomationExportPage = await apiJson<AutomationExportPage>(
          `${path}/export?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        first ??= page;
        exportedRuns.push(...page.runs);
        cursor = page.nextCursor;
        if (cursor && seen.has(cursor))
          throw new Error("Export pagination repeated a cursor");
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (!first) throw new Error("Automation export is empty");
      const content = JSON.stringify(
        {
          exportVersion: 1,
          exportedAt: first.exportedAt,
          sourceOfTruth: "local-only",
          isSynthetic: true,
          definition: first.definition,
          runs: exportedRuns,
        },
        null,
        2,
      );
      const url = URL.createObjectURL(
        new Blob([content], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `commandry-automation-${definition.id}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setFeedback(
        `Downloaded the local-only definition and ${exportedRuns.length} synthetic run records.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not export automation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Automations">
      <div className="cmd-breadcrumb">
        <a href="/automations">Automations</a>
        <span aria-hidden="true">/</span>
        <span>{definition?.name ?? "Routine"}</span>
      </div>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading local automation...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {definition && (
        <div className="cmd-automation-detail">
          <header className="cmd-page-header">
            <div>
              <p className="cmd-eyebrow">Automation / Local-only</p>
              <h1>{definition.name}</h1>
              <p className="cmd-lead">
                A bounded project brief read. An enabled definition runs once at
                creation, a recurring UTC interval, a matching synthetic fixture
                event, or a resource-specific synthetic availability crossing.
                You can also run now or schedule one local run for later. Every
                result is synthetic and unverified, with no external action.
              </p>
              <p className="cmd-record-identity">
                Definition ID <code>{definition.id}</code>
              </p>
            </div>
          </header>
          <div className="cmd-automation-detail-grid">
            <section
              className="cmd-workspace-section"
              aria-labelledby="automation-definition-heading"
            >
              <p className="cmd-eyebrow">Definition / Local source of truth</p>
              <h2 id="automation-definition-heading">Policy and trigger</h2>
              <dl className="cmd-automation-facts">
                <div>
                  <dt>Project</dt>
                  <dd>
                    {project ? (
                      <a href={`/projects/${project.id}`}>{project.name}</a>
                    ) : (
                      definition.projectId
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Enabled</dt>
                  <dd>{definition.enabled ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Trigger</dt>
                  <dd>
                    {definition.triggerType === "recurring_interval"
                      ? "Recurring local interval"
                      : definition.triggerType === "synthetic_event"
                        ? "Synthetic fixture event"
                        : definition.triggerType === "synthetic_condition"
                          ? "Synthetic availability threshold"
                          : "On creation once"}
                  </dd>
                </div>
                {definition.eventType && (
                  <div>
                    <dt>Event type</dt>
                    <dd>{definition.eventType} (synthetic only)</dd>
                  </div>
                )}
                {definition.condition && (
                  <>
                    <div>
                      <dt>Watched resource</dt>
                      <dd>
                        <a
                          href={`/resources/${definition.condition.resourceId}`}
                        >
                          {definition.condition.resourceId}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Condition</dt>
                      <dd>
                        Synthetic external availability at or below{" "}
                        {definition.condition.thresholdPercent}%
                      </dd>
                    </div>
                  </>
                )}
                {definition.recurrenceStartAt &&
                  definition.recurrenceEveryMinutes && (
                    <>
                      <div>
                        <dt>First planned run</dt>
                        <dd>
                          <time dateTime={definition.recurrenceStartAt}>
                            {definition.recurrenceStartAt} UTC
                          </time>
                        </dd>
                      </div>
                      <div>
                        <dt>Interval</dt>
                        <dd>
                          Every {definition.recurrenceEveryMinutes} minutes
                        </dd>
                      </div>
                    </>
                  )}
                <div>
                  <dt>Next run</dt>
                  <dd>
                    {definition.nextRunAt ? (
                      <time dateTime={definition.nextRunAt}>
                        {definition.nextRunAt} UTC
                      </time>
                    ) : definition.enabled &&
                      (definition.triggerType === "synthetic_event" ||
                        definition.triggerType === "synthetic_condition") ? (
                      definition.triggerType === "synthetic_condition" ? (
                        "On next synthetic below-threshold crossing"
                      ) : (
                        "On next matching synthetic event"
                      )
                    ) : definition.enabled ? (
                      "None queued"
                    ) : (
                      "Paused while disabled"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Actor</dt>
                  <dd>Local worker</dd>
                </div>
                <div>
                  <dt>Capability</dt>
                  <dd>project.brief.read</dd>
                </div>
                <div>
                  <dt>Risk and approval</dt>
                  <dd>Read-only; no approval required</dd>
                </div>
                <div>
                  <dt>Source of truth</dt>
                  <dd>Local-only</dd>
                </div>
              </dl>
              <p>
                Failure policy: three queued retries with recorded attempts and
                a dead-letter queue. This routine cannot use secrets or perform
                external actions.
              </p>
              {definition.triggerType === "recurring_interval" && (
                <p>
                  Recurrence policy: after worker downtime, at most the latest
                  due interval becomes a run; older intervals are counted in the
                  audit. A new interval is recorded as skipped while a previous
                  run is active. Disabling pauses new occurrences; enabling
                  resumes at the next future interval.
                </p>
              )}
              {definition.triggerType === "synthetic_event" && (
                <p>
                  Event policy: a newly ingested fixture event for this project
                  is evaluated once. Disabled or overlapping work is recorded as
                  skipped. Each run links to its exact normalized source event
                  and preserves the original source envelope.
                </p>
              )}
              {definition.triggerType === "synthetic_condition" && (
                <p>
                  Condition policy: only immutable, labeled synthetic external
                  availability samples for the linked resource are considered.
                  The first sample at or below the threshold creates a run;
                  another run needs a recovery above the threshold first.
                  Disabled or overlapping crossings are recorded as skipped.
                  Each run links to its exact metric sample, normalized event,
                  and original source envelope. No live monitoring connector is
                  attached.
                </p>
              )}
              <div className="cmd-decision-actions">
                <Button disabled={busy} onClick={() => void downloadExport()}>
                  Download local export
                </Button>
                <Button disabled={busy} onClick={setEnabled}>
                  {busy
                    ? "Saving..."
                    : definition.enabled
                      ? "Disable routine"
                      : "Enable routine"}
                </Button>
                <Button
                  disabled={busy || !definition.enabled}
                  onClick={() => void trigger()}
                  variant="primary"
                >
                  Run now locally
                </Button>
              </div>
              <form className="cmd-form" onSubmit={schedule}>
                <label htmlFor="automation-schedule-local">
                  Schedule one local run (device time)
                </label>
                <input
                  id="automation-schedule-local"
                  onChange={(event) => setScheduleLocalTime(event.target.value)}
                  required
                  step="1"
                  type="datetime-local"
                  value={scheduleLocalTime}
                />
                <p className="cmd-form-hint">
                  Stored and displayed as UTC. The enabled state is checked
                  again when the worker starts. This creates one extra run and
                  does not change the recurring schedule of this definition.
                </p>
                <Button
                  disabled={busy || !definition.enabled || !scheduleLocalTime}
                  type="submit"
                >
                  Schedule local run
                </Button>
              </form>
              {feedback && (
                <p className="cmd-form-success" role="status">
                  {feedback}
                </p>
              )}
            </section>
            <section
              className="cmd-workspace-section"
              aria-labelledby="automation-audit-heading"
            >
              <div className="cmd-section-heading">
                <h2 id="automation-audit-heading">Audit trail</h2>
                <Button disabled={busy} onClick={() => refreshAudit()}>
                  Refresh audit
                </Button>
              </div>
              <ul
                className="cmd-automation-audit-list"
                aria-label="Automation audit events"
              >
                {audit.map((event) => (
                  <li key={event.id}>
                    <strong>{event.operation}</strong>
                    <p>{event.actor}</p>
                    <time dateTime={event.createdAt}>{event.createdAt}</time>
                    {event.runId && (
                      <p>
                        Run <code>{event.runId}</code>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {auditCursor && (
                <Button
                  disabled={busy}
                  onClick={() => refreshAudit(auditCursor)}
                >
                  Load more audit events
                </Button>
              )}
            </section>
          </div>
          <section
            className="cmd-workspace-section"
            aria-labelledby="automation-runs-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Worker / Synthetic output</p>
                <h2 id="automation-runs-heading">Run history</h2>
              </div>
              <span className="cmd-count">{runs.length} shown</span>
            </div>
            {runs.length === 0 && (
              <RecordEmptyState
                title="No runs yet"
                description="Import a matching synthetic event or availability crossing, run this routine now, or schedule one local run."
              />
            )}
            <ul
              className="cmd-automation-run-list"
              aria-label="Automation runs"
            >
              {runs.map((run) => (
                <li key={run.id}>
                  <div className="cmd-section-heading">
                    <strong>
                      {run.trigger === "on_creation"
                        ? "On-creation run"
                        : run.trigger === "recurring"
                          ? "Recurring local run"
                          : run.trigger === "synthetic_event"
                            ? "Synthetic event run"
                            : run.trigger === "synthetic_condition"
                              ? "Synthetic condition run"
                              : run.trigger === "scheduled"
                                ? "Scheduled local run"
                                : "Manual local run"}
                    </strong>
                    <span className="cmd-count">{run.state}</span>
                  </div>
                  <p>
                    Queued <time dateTime={run.createdAt}>{run.createdAt}</time>{" "}
                    · {run.attempts} attempt(s)
                  </p>
                  {run.scheduledFor && (
                    <p>
                      Due{" "}
                      <time dateTime={run.scheduledFor}>
                        {run.scheduledFor} UTC
                      </time>
                    </p>
                  )}
                  {run.sourceEventId && (
                    <p>
                      Triggered by{" "}
                      <a href={`/api/v1/events/${run.sourceEventId}`}>
                        synthetic source event
                      </a>{" "}
                      <code>{run.sourceEventId}</code>
                    </p>
                  )}
                  {run.sourceMetricSampleId && (
                    <p>
                      Threshold evidence{" "}
                      <a href={`/api/v1/metrics/${run.sourceMetricSampleId}`}>
                        synthetic metric sample
                      </a>{" "}
                      <code>{run.sourceMetricSampleId}</code>
                    </p>
                  )}
                  {run.error && (
                    <p className="cmd-inline-state cmd-error">{run.error}</p>
                  )}
                  {run.result && (
                    <div className="cmd-automation-result">
                      <p>
                        <strong>{run.result.sourceLabel} · Unverified</strong>
                      </p>
                      <p>{run.result.summary}</p>
                      <p>
                        Brief as of{" "}
                        <time dateTime={run.result.asOf}>
                          {run.result.asOf}
                        </time>
                        . External actions: none.
                      </p>
                      <ul aria-label={`Evidence for run ${run.id}`}>
                        {run.result.evidence.map((source) => (
                          <li key={`${source.kind}:${source.id}`}>
                            <a href={source.href}>
                              {source.kind.replaceAll("_", " ")} source
                            </a>{" "}
                            ·{" "}
                            {source.isSynthetic
                              ? "Synthetic"
                              : source.sourceLabel}{" "}
                            ·{" "}
                            <time dateTime={source.recordedAt}>
                              {source.recordedAt}
                            </time>
                          </li>
                        ))}
                      </ul>
                      <div className="cmd-action-row">
                        <Button
                          disabled={busy}
                          onClick={() => void checkEvidence(run.id)}
                        >
                          Check local evidence
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => void loadEvidenceChecks(run.id)}
                        >
                          View check history
                        </Button>
                      </div>
                      {(checksByRun[run.id] ?? []).map((check) => (
                        <AutomationEvidenceCheckCard
                          key={check.id}
                          check={check}
                        />
                      ))}
                      {checkCursors[run.id] && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void loadEvidenceChecks(
                              run.id,
                              checkCursors[run.id] ?? undefined,
                            )
                          }
                        >
                          Load older checks
                        </Button>
                      )}
                    </div>
                  )}
                  <Button
                    disabled={busy}
                    onClick={() =>
                      attemptRunId === run.id
                        ? setAttemptRunId(null)
                        : showAttempts(run.id)
                    }
                  >
                    {attemptRunId === run.id
                      ? "Hide attempts"
                      : "View attempts"}
                  </Button>
                  {attemptRunId === run.id && (
                    <div>
                      <ul
                        className="cmd-automation-attempt-list"
                        aria-label={`Attempts for run ${run.id}`}
                      >
                        {attempts.map((attempt) => (
                          <li key={attempt.id}>
                            Attempt {attempt.ordinal}: {attempt.state} ·{" "}
                            <time dateTime={attempt.createdAt}>
                              {attempt.createdAt}
                            </time>
                            {attempt.error && <p>{attempt.error}</p>}
                          </li>
                        ))}
                      </ul>
                      {attemptCursor && (
                        <Button
                          disabled={busy}
                          onClick={() => showAttempts(run.id, attemptCursor)}
                        >
                          Load more attempts
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {runCursor && (
              <Button disabled={busy} onClick={loadMoreRuns}>
                Load more runs
              </Button>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
