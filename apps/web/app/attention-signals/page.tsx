"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  LocalAttentionAuditEvent,
  LocalAttentionSettings,
  LocalAttentionSignal,
} from "@commandry/contracts";
import { AppShell, Button, LocalAttentionSignalCard } from "@commandry/ui";
import { apiJson, type PageResponse } from "../projects/api";

function signalPath(
  view: "active" | "all",
  cursor?: string | null,
  projectId?: string | null,
) {
  const params = new URLSearchParams({ limit: "20", view });
  if (cursor) params.set("cursor", cursor);
  if (projectId) params.set("projectId", projectId);
  return `/api/v1/attention-signals?${params}`;
}

function auditPath(cursor?: string | null) {
  const params = new URLSearchParams({ limit: "10" });
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/attention-rules/audit?${params}`;
}

export default function AttentionSignalsPage() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [settings, setSettings] = useState<LocalAttentionSettings | null>(null);
  const [staleSourceEnabled, setStaleSourceEnabled] = useState(true);
  const [metricDropEnabled, setMetricDropEnabled] = useState(true);
  const [metricDropPoints, setMetricDropPoints] = useState(25);
  const [view, setView] = useState<"active" | "all">("active");
  const [signals, setSignals] = useState<LocalAttentionSignal[]>([]);
  const [signalCursor, setSignalCursor] = useState<string | null>(null);
  const [audit, setAudit] = useState<LocalAttentionAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const projectScope = new URLSearchParams(window.location.search).get(
      "projectId",
    );
    Promise.all([
      apiJson<LocalAttentionSettings>("/api/v1/attention-rules"),
      apiJson<PageResponse<LocalAttentionSignal>>(
        signalPath("active", null, projectScope),
      ),
      apiJson<PageResponse<LocalAttentionAuditEvent>>(auditPath()),
    ])
      .then(([rules, signalPage, auditPage]) => {
        if (!active) return;
        setProjectId(projectScope);
        setSettings(rules);
        setStaleSourceEnabled(rules.staleSourceEnabled);
        setMetricDropEnabled(rules.metricDropEnabled);
        setMetricDropPoints(rules.metricDropPoints);
        setSignals(signalPage.items);
        setSignalCursor(signalPage.nextCursor);
        setAudit(auditPage.items);
        setAuditCursor(auditPage.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Local attention signals are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadSignals(nextView: "active" | "all", cursor?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<LocalAttentionSignal>>(
        signalPath(nextView, cursor, projectId),
      );
      setView(nextView);
      setSignals((current) =>
        cursor ? [...current, ...page.items] : page.items,
      );
      setSignalCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load signals.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadAudit(cursor?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<LocalAttentionAuditEvent>>(
        auditPath(cursor),
      );
      setAudit((current) =>
        cursor ? [...current, ...page.items] : page.items,
      );
      setAuditCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load rule audit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<LocalAttentionSettings>(
        "/api/v1/attention-rules",
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: settings.version,
            staleSourceEnabled,
            metricDropEnabled,
            metricDropPoints,
          }),
        },
      );
      setSettings(saved);
      setFeedback(
        "Local rule preferences saved and audited. The worker reevaluates synthetic evidence within 10 seconds; refresh signals to review the result.",
      );
      const page =
        await apiJson<PageResponse<LocalAttentionAuditEvent>>(auditPath());
      setAudit(page.items);
      setAuditCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save local rules.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Signals">
      <header className="cmd-page-header">
        <p className="cmd-eyebrow">Local synthetic evidence</p>
        <h1>Attention signals</h1>
        <p>
          Source freshness and metric trends are computed from stored synthetic
          observations. Their reasons and records are inspectable. Real source
          and resource health remain unknown.
        </p>
      </header>
      {loading && <p role="status">Loading local attention...</p>}
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
      <section
        className="cmd-local-run-audit"
        aria-labelledby="signal-rules-title"
      >
        <h2 id="signal-rules-title">Local rule preferences</h2>
        <p>
          These provisional choices affect only the local synthetic projection.
          No external notification or action is sent.
        </p>
        {settings && (
          <form
            className="cmd-form"
            onSubmit={(event) => void saveSettings(event)}
          >
            <label className="cmd-attention-check">
              <input
                type="checkbox"
                checked={staleSourceEnabled}
                onChange={(event) =>
                  setStaleSourceEnabled(event.target.checked)
                }
              />
              Show stale synthetic sources
            </label>
            <label className="cmd-attention-check">
              <input
                type="checkbox"
                checked={metricDropEnabled}
                onChange={(event) => setMetricDropEnabled(event.target.checked)}
              />
              Show material synthetic metric drops
            </label>
            <label htmlFor="metric-drop-points">
              Metric drop threshold, percentage points
            </label>
            <input
              id="metric-drop-points"
              type="number"
              min={1}
              max={100}
              required
              value={metricDropPoints}
              onChange={(event) =>
                setMetricDropPoints(Number(event.target.value))
              }
            />
            <p>
              Rule version {settings.version}. Freshness windows are set per
              integration.
            </p>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save local rules"}
            </Button>
          </form>
        )}
      </section>
      <section className="cmd-local-run-audit" aria-labelledby="signals-title">
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">Explainable projection</p>
            <h2 id="signals-title">Synthetic signals</h2>
          </div>
          <span className="cmd-count">{signals.length} shown</span>
        </div>
        {projectId && (
          <p>
            Showing signals for project <code>{projectId}</code>.{" "}
            <a href="/attention-signals">Show all projects</a>
          </p>
        )}
        <div className="cmd-attention-actions">
          <Button disabled={busy} onClick={() => void loadSignals("active")}>
            Active
          </Button>
          <Button disabled={busy} onClick={() => void loadSignals("all")}>
            All history
          </Button>
          <Button disabled={busy} onClick={() => void loadSignals(view)}>
            Refresh signals
          </Button>
        </div>
        {!loading && signals.length === 0 && (
          <p>
            No {view === "active" ? "active" : "recorded"} synthetic source or
            metric signal. This does not establish real health.
          </p>
        )}
        {signals.length > 0 && (
          <ul className="cmd-notification-list">
            {signals.map((signal) => (
              <li key={signal.id}>
                <LocalAttentionSignalCard signal={signal} />
              </li>
            ))}
          </ul>
        )}
        {signalCursor && (
          <Button
            disabled={busy}
            onClick={() => void loadSignals(view, signalCursor)}
          >
            Load more signals
          </Button>
        )}
      </section>
      <section
        className="cmd-local-run-audit"
        aria-labelledby="signal-audit-title"
      >
        <h2 id="signal-audit-title">Rule and transition audit</h2>
        {audit.length === 0 && (
          <p>No local rule or signal changes are recorded.</p>
        )}
        {audit.length > 0 && (
          <ol>
            {audit.map((item) => (
              <li key={item.id}>
                <strong>{item.operation}</strong>
                <p>
                  {item.actor} / {item.signalId ?? "Rule settings"}
                </p>
                <time dateTime={item.createdAt}>{item.createdAt}</time>
              </li>
            ))}
          </ol>
        )}
        {auditCursor && (
          <Button disabled={busy} onClick={() => void loadAudit(auditCursor)}>
            Load more audit
          </Button>
        )}
      </section>
    </AppShell>
  );
}
