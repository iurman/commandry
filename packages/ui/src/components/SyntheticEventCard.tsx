export interface SyntheticEventCardProps {
  id: string;
  type: string;
  summary: string;
  severity: string;
  occurredAt: string;
  ingestedAt: string;
  sourceLabel: string;
  evidenceHref: string;
  projectName?: string;
  resourceName?: string | undefined;
  alertId?: string | null;
}

export function SyntheticEventCard({
  id,
  type,
  summary,
  severity,
  occurredAt,
  ingestedAt,
  sourceLabel,
  evidenceHref,
  projectName,
  resourceName,
  alertId,
}: SyntheticEventCardProps) {
  return (
    <article className="cmd-synthetic-event" id={`event-${id}`}>
      <div className="cmd-synthetic-event-top">
        <span className="cmd-synthetic-stamp">Synthetic event</span>
        <span className="cmd-synthetic-event-type">{type}</span>
      </div>
      <h3>{summary}</h3>
      <div className="cmd-synthetic-event-context">
        <span>Severity: {severity}</span>
        {projectName && <span>Project: {projectName}</span>}
        {resourceName && <span>Resource: {resourceName}</span>}
      </div>
      <dl className="cmd-synthetic-timeline">
        <div>
          <dt>Occurred</dt>
          <dd>
            <time dateTime={occurredAt}>{occurredAt}</time>
          </dd>
        </div>
        <div>
          <dt>Ingested</dt>
          <dd>
            <time dateTime={ingestedAt}>{ingestedAt}</time>
          </dd>
        </div>
      </dl>
      <div className="cmd-synthetic-evidence">
        <span>{sourceLabel}</span>
        {alertId && <span>Alert {alertId}</span>}
        <a href={evidenceHref}>Inspect synthetic source envelope</a>
      </div>
    </article>
  );
}
