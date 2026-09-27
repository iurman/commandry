export interface WorkProjectLinkCardView {
  projectId: string;
  projectName: string;
  linkId: string;
  lifecycle: "active" | "archived";
  recordedAt: string;
}

export function WorkProjectLinkCard({
  relation,
}: {
  relation: WorkProjectLinkCardView;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">Manual Work relation</span>
        <span className="cmd-count">{relation.lifecycle}</span>
      </div>
      <h3 className="cmd-record-title">
        <a href={`/projects/${relation.projectId}`}>{relation.projectName}</a>
      </h3>
      <p className="cmd-record-description">
        This project relates to the same saved Work record. The original capture
        and primary project remain unchanged.
      </p>
      <p className="cmd-record-identity">
        <a href={`/api/v1/work-project-links/${relation.linkId}`}>
          Exact typed relationship
        </a>
        <time dateTime={relation.recordedAt}>{relation.recordedAt}</time>
      </p>
    </article>
  );
}
