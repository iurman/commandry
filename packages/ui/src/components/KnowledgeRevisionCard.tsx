export interface KnowledgeRevisionCardView {
  id: string;
  version: number;
  previousTitle: string;
  previousContent: string;
  title: string;
  content: string;
  createdAt: string;
}

export function KnowledgeRevisionCard({
  revision,
}: {
  revision: KnowledgeRevisionCardView;
}) {
  return (
    <article className="cmd-record-card">
      <details>
        <summary>
          Version {revision.version}: {revision.title}
        </summary>
        <p className="cmd-record-identity">
          Saved locally{" "}
          <time dateTime={revision.createdAt}>{revision.createdAt}</time>
        </p>
        <h4>Previous title</h4>
        <p className="cmd-detail-body">{revision.previousTitle}</p>
        <h4>Previous content</h4>
        <div className="cmd-detail-body">
          {revision.previousContent || "No content"}
        </div>
        <h4>Saved content</h4>
        <div className="cmd-detail-body">
          {revision.content || "No content"}
        </div>
      </details>
    </article>
  );
}
