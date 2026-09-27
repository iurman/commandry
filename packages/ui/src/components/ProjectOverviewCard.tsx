export type ProjectOverviewFact = {
  title: string;
  detail: string;
  evidenceHref: string;
  sourceLabel: string;
  recordedAt: string;
  isSynthetic: boolean;
};

export function ProjectOverviewCard({
  title,
  facts,
  emptyState,
  sourceListHref,
  generatedAt,
}: {
  title: string;
  facts: ProjectOverviewFact[];
  emptyState: string | null;
  sourceListHref: string;
  generatedAt: string;
}) {
  return (
    <article className="cmd-project-overview-card">
      <div className="cmd-project-overview-heading">
        <h3>{title}</h3>
        <span>{facts.length} recent</span>
      </div>
      {facts.length === 0 ? (
        <p className="cmd-project-overview-empty">
          {emptyState ?? "No source-backed facts are available yet."}
        </p>
      ) : (
        <ul>
          {facts.map((fact) => (
            <li key={`${fact.evidenceHref}:${fact.title}`}>
              <strong>{fact.title}</strong>
              <p>{fact.detail}</p>
              <div className="cmd-project-overview-source">
                <span>
                  {fact.isSynthetic
                    ? `Synthetic source: ${fact.sourceLabel}`
                    : fact.sourceLabel}
                </span>
                <a href={fact.evidenceHref}>Exact evidence</a>
              </div>
              <time dateTime={fact.recordedAt}>
                Recorded {new Date(fact.recordedAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
      <div className="cmd-project-overview-footer">
        <a href={sourceListHref}>Source records</a>
        <time dateTime={generatedAt}>
          Brief as of {new Date(generatedAt).toLocaleString()}
        </time>
      </div>
    </article>
  );
}
