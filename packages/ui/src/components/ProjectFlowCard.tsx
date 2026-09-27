export interface ProjectFlowCardView {
  id: string;
  kind: string;
  occurredAt: string;
  recordedAt: string;
  title: string;
  state: string;
  detail: string | null;
  sourceHref: string;
  sourceLabel: string;
  isSynthetic: boolean;
  related: Array<{
    kind: string;
    id: string;
    name: string;
    href: string;
  }>;
}

export function ProjectFlowCard({ item }: { item: ProjectFlowCardView }) {
  return (
    <article
      className="cmd-record-card"
      aria-label={`${item.kind.replaceAll("_", " ")} flow record`}
    >
      <p className="cmd-eyebrow">
        {item.isSynthetic ? "Synthetic" : "Recorded"} historical flow /{" "}
        {item.kind.replaceAll("_", " ")}
      </p>
      <h3 className="cmd-record-title">{item.title}</h3>
      <p>
        Current recorded state: {item.state}
        {item.detail ? ` / ${item.detail}` : ""}.
      </p>
      <p>
        Occurred <time dateTime={item.occurredAt}>{item.occurredAt}</time>;
        recorded <time dateTime={item.recordedAt}>{item.recordedAt}</time>.
      </p>
      <p>Source: {item.sourceLabel}.</p>
      {item.related.length > 0 && (
        <p>
          Related records:{" "}
          {item.related.map((record, index) => (
            <span key={`${record.kind}:${record.id}`}>
              {index > 0 ? ", " : ""}
              <a href={record.href}>{record.name}</a> ({record.kind})
            </span>
          ))}
          .
        </p>
      )}
      <p>
        <a href={item.sourceHref}>Inspect source record</a>
      </p>
    </article>
  );
}
