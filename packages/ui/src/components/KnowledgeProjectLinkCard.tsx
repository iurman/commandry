export interface KnowledgeProjectLinkCardView {
  projectId: string;
  projectName: string;
  linkId: string;
  lifecycle: "active" | "archived";
  recordedAt: string;
}

export function KnowledgeProjectLinkCard({
  relation,
}: {
  relation: KnowledgeProjectLinkCardView;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">Manual Knowledge relation</span>
        <span className="cmd-count">{relation.lifecycle}</span>
      </div>
      <h3 className="cmd-record-title">
        <a href={`/projects/${relation.projectId}`}>{relation.projectName}</a>
      </h3>
      <p className="cmd-record-description">
        This project relates to the same saved Knowledge record. The original
        capture and primary project remain separate.
      </p>
      <p className="cmd-record-identity">
        <a href={`/api/v1/knowledge-project-links/${relation.linkId}`}>
          Exact typed relationship
        </a>
        <time dateTime={relation.recordedAt}>{relation.recordedAt}</time>
      </p>
    </article>
  );
}
