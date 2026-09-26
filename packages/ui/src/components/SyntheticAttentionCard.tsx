export interface SyntheticAttentionCardProps {
  id: string;
  title: string;
  reason: string;
  ruleId: string;
  priority: string;
  lastObservedAt: string;
  sourceLabel: string;
  evidenceHref: string;
  projectName?: string;
  resourceName?: string | undefined;
}

export function SyntheticAttentionCard({
  id,
  title,
  reason,
  ruleId,
  priority,
  lastObservedAt,
  sourceLabel,
  evidenceHref,
  projectName,
  resourceName,
}: SyntheticAttentionCardProps) {
  return (
    <article className="cmd-synthetic-attention" id={`attention-${id}`}>
      <div className="cmd-synthetic-event-top">
        <span className="cmd-synthetic-stamp">Synthetic attention</span>
        <span className="cmd-synthetic-alert-state">Active</span>
      </div>
      <h3>{title}</h3>
      <p>{reason}</p>
      <p className="cmd-synthetic-rule">
        Rule: <code>{ruleId}</code>. Priority: {priority}.
      </p>
      <div className="cmd-synthetic-event-context">
        {projectName && <span>Project: {projectName}</span>}
        {resourceName && <span>Resource: {resourceName}</span>}
        <span>
          <time dateTime={lastObservedAt}>Last observed {lastObservedAt}</time>
        </span>
      </div>
      <div className="cmd-synthetic-evidence">
        <span>{sourceLabel}</span>
        <a href={evidenceHref}>Inspect synthetic source evidence</a>
      </div>
    </article>
  );
}
