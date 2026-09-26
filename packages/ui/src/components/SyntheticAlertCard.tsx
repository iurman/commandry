export interface SyntheticAlertCardProps {
  id: string;
  state: string;
  reason: string;
  ruleId: string;
  severity: string;
  firstObservedAt: string;
  lastObservedAt: string;
  resolvedAt: string | null;
  sourceLabel: string;
  evidenceEventIds: string[];
  projectName?: string;
  resourceName?: string | undefined;
  evidenceHref?: string | null;
}

export function SyntheticAlertCard({
  id,
  state,
  reason,
  ruleId,
  severity,
  firstObservedAt,
  lastObservedAt,
  resolvedAt,
  sourceLabel,
  evidenceEventIds,
  projectName,
  resourceName,
  evidenceHref,
}: SyntheticAlertCardProps) {
  const isResolved = state === "resolved";
  return (
    <article
      className="cmd-synthetic-alert"
      data-state={state}
      id={`alert-${id}`}
    >
      <div className="cmd-synthetic-event-top">
        <span className="cmd-synthetic-stamp">Synthetic attention</span>
        <span
          className={`cmd-synthetic-alert-state ${isResolved ? "cmd-synthetic-alert-resolved" : ""}`}
        >
          {isResolved ? "Resolved" : "Active"}
        </span>
      </div>
      <h3>{reason}</h3>
      <p className="cmd-synthetic-rule">
        Rule: <code>{ruleId}</code>. Severity: {severity}.
      </p>
      <div className="cmd-synthetic-event-context">
        {projectName && <span>Project: {projectName}</span>}
        {resourceName && <span>Resource: {resourceName}</span>}
      </div>
      <dl className="cmd-synthetic-timeline">
        <div>
          <dt>First observed</dt>
          <dd>
            <time dateTime={firstObservedAt}>{firstObservedAt}</time>
          </dd>
        </div>
        <div>
          <dt>{isResolved ? "Resolved" : "Last observed"}</dt>
          <dd>
            <time dateTime={resolvedAt ?? lastObservedAt}>
              {resolvedAt ?? lastObservedAt}
            </time>
          </dd>
        </div>
      </dl>
      <div className="cmd-synthetic-evidence">
        <span>{sourceLabel}</span>
        <span>
          {evidenceEventIds.length} linked event
          {evidenceEventIds.length === 1 ? "" : "s"}
        </span>
        {evidenceHref && (
          <a href={evidenceHref}>Inspect synthetic source evidence</a>
        )}
      </div>
    </article>
  );
}
