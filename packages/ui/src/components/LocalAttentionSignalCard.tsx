export interface LocalAttentionSignalView {
  id: string;
  ruleId: "source_stale" | "metric_drop";
  state: "active" | "resolved";
  projectName: string;
  integrationName: string | null;
  resourceName: string | null;
  evidenceHref: string;
  previousEvidenceHref: string | null;
  reason: string;
  observedAt: string;
  previousObservedAt: string | null;
  changedAt: string;
  evaluatedAt: string;
}

export function LocalAttentionSignalCard({
  signal,
}: {
  signal: LocalAttentionSignalView;
}) {
  return (
    <article
      className="cmd-notification-card"
      aria-label={`Synthetic attention ${signal.ruleId.replaceAll("_", " ")}`}
      data-state={signal.state}
    >
      <div className="cmd-notification-card-top">
        <div>
          <p className="cmd-eyebrow">
            Synthetic local attention / {signal.state}
          </p>
          <h3>
            {signal.ruleId === "source_stale"
              ? "Source observation is stale"
              : "Synthetic metric dropped"}
          </h3>
        </div>
      </div>
      <p>{signal.reason}</p>
      <p>
        {signal.projectName}
        {signal.integrationName ? ` / ${signal.integrationName}` : ""}
        {signal.resourceName ? ` / ${signal.resourceName}` : ""}
      </p>
      <p>
        Latest synthetic observation:{" "}
        <time dateTime={signal.observedAt}>{signal.observedAt}</time>
      </p>
      {signal.previousObservedAt && (
        <p>
          Comparison observation:{" "}
          <time dateTime={signal.previousObservedAt}>
            {signal.previousObservedAt}
          </time>
        </p>
      )}
      <p>
        {signal.state === "resolved"
          ? "Last triggering evidence: "
          : "Evidence: "}
        <a href={signal.evidenceHref}>Latest source record</a>
        {signal.previousEvidenceHref && (
          <>
            {" / "}
            <a href={signal.previousEvidenceHref}>Comparison source record</a>
          </>
        )}
      </p>
      <p>
        Last evaluated:{" "}
        <time dateTime={signal.evaluatedAt}>{signal.evaluatedAt}</time>. Real
        source and resource health remain unknown.
      </p>
    </article>
  );
}
