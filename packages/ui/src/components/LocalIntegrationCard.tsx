import type { ReactNode } from "react";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function LocalIntegrationCard({
  name,
  kind,
  enabled,
  projectName,
  projectHref,
  resourceName,
  resourceHref,
  activityHref,
  lastAttemptAt,
  lastSuccessAt,
  lastError,
  freshnessState,
  freshnessWindowMinutes,
  lastObservedAt,
  lastReceivedAt,
  observationEvidenceHref,
  children,
}: {
  name: string;
  kind: "synthetic-development" | "synthetic-operations";
  enabled: boolean;
  projectName: string;
  projectHref: string;
  resourceName?: string | null;
  resourceHref?: string | null;
  activityHref: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  freshnessState: "unknown" | "fresh" | "stale" | "future";
  freshnessWindowMinutes: number;
  lastObservedAt: string | null;
  lastReceivedAt: string | null;
  observationEvidenceHref: string | null;
  children?: ReactNode;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">
          {kind === "synthetic-development"
            ? "Synthetic development"
            : "Synthetic operations"}
        </span>
        <span className="cmd-count">{enabled ? "Enabled" : "Disabled"}</span>
      </div>
      <h3 className="cmd-record-title">{name}</h3>
      <p className="cmd-record-description">
        Local fixture adapter. Receiver and poll rehearsals use only synthetic
        envelopes; there is no live provider or external action.
      </p>
      <p className="cmd-record-identity">
        <a href={projectHref}>{projectName}</a>
        {resourceHref && (
          <a href={resourceHref}>{resourceName ?? "Linked resource"}</a>
        )}
        <a href={activityHref}>Activity</a>
      </p>
      <p className="cmd-form-hint">
        Last attempt: {when(lastAttemptAt)}. Last success: {when(lastSuccessAt)}
        . Next attempt: none scheduled.
      </p>
      <div className="cmd-source-freshness">
        <strong>Synthetic observation: {freshnessState}</strong>
        <p>
          Source timestamp: {when(lastObservedAt)}. Received:{" "}
          {when(lastReceivedAt)}. Freshness window: {freshnessWindowMinutes}{" "}
          minutes.
        </p>
        {observationEvidenceHref && (
          <a href={observationEvidenceHref}>Original synthetic envelope</a>
        )}
        <p>
          This classification describes fixture age. Real resource health
          remains unknown.
        </p>
      </div>
      {lastError && (
        <p className="cmd-inline-state cmd-error">Last error: {lastError}</p>
      )}
      {children && <div className="cmd-action-row">{children}</div>}
    </article>
  );
}
