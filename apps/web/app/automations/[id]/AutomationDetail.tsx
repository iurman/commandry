"use client";

import { useEffect, useState } from "react";
import type {
  AutomationAuditEvent,
  AutomationDefinition,
  AutomationRun,
  AutomationRunAttempt,
} from "@commandry/contracts";
import { AppShell, Button, RecordEmptyState } from "@commandry/ui";
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
    if (!runs.some((run) => run.state === "queued" || run.state === "running"))
      return;
    let active = true;
    const timer = window.setInterval(() => {
      void apiJson<PageResponse<AutomationRun>>(pagePath(`${path}/runs`))
        .then((page) => {
          if (!active) return;
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
    }, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [path, runs]);

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
          ? "Enabled. The on-creation trigger does not replay; use Run now for a new local summary."
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

  async function trigger() {
    if (!definition?.enabled || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const run = await apiJson<AutomationRun>(`${path}/runs`, {
        method: "POST",
        body: JSON.stringify({ occurrenceId: crypto.randomUUID() }),
      });
      setRuns((current) => [run, ...current]);
      setFeedback(
        "A synthetic local summary was queued. No external action was requested.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not queue a local run.",
      );
    } finally {
      setBusy(false);
    }
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
                A bounded project brief read. The one-time trigger runs only
                when an enabled definition is created. Manual reruns are
                explicit.
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
                  <dd>On creation once</dd>
                </div>
                <div>
                  <dt>Next run</dt>
                  <dd>None scheduled</dd>
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
              <div className="cmd-decision-actions">
                <Button disabled={busy} onClick={setEnabled}>
                  {busy
                    ? "Saving..."
                    : definition.enabled
                      ? "Disable routine"
                      : "Enable routine"}
                </Button>
                <Button
                  disabled={busy || !definition.enabled}
                  onClick={trigger}
                  variant="primary"
                >
                  Run now locally
                </Button>
              </div>
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
                description="Disabled definitions wait for a manual run after enabling."
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
                        : "Manual local run"}
                    </strong>
                    <span className="cmd-count">{run.state}</span>
                  </div>
                  <p>
                    Queued <time dateTime={run.createdAt}>{run.createdAt}</time>{" "}
                    · {run.attempts} attempt(s)
                  </p>
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
