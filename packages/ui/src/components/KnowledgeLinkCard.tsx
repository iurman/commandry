export interface KnowledgeLinkCardView {
  id: string;
  projectId: string;
  projectName: string;
  sourceCaptureId: string;
  title: string;
  content: string;
  url: string;
}

export function KnowledgeLinkCard({ link }: { link: KnowledgeLinkCardView }) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">Saved knowledge link</span>
        <span className="cmd-count">Manual local source</span>
      </div>
      <h3 className="cmd-record-title">
        <a href={`/knowledge-items/${link.id}`}>{link.title}</a>
      </h3>
      {link.content && <p className="cmd-record-description">{link.content}</p>}
      <p className="cmd-record-description">
        <a href={link.url} rel="noreferrer" target="_blank">
          Open saved external link
        </a>
      </p>
      <p className="cmd-record-identity">
        <a href={`/projects/${link.projectId}`}>{link.projectName}</a>
        <a href={`/inbox?captureId=${link.sourceCaptureId}`}>
          Exact original capture
        </a>
      </p>
    </article>
  );
}
