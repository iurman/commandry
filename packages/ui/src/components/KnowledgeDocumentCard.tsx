export interface KnowledgeDocumentCardView {
  id: string;
  projectId: string;
  projectName: string;
  sourceCaptureId: string;
  title: string;
  content: string;
  version: number;
}

export function KnowledgeDocumentCard({
  document,
}: {
  document: KnowledgeDocumentCardView;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">Local knowledge document</span>
        <span className="cmd-count">Context version {document.version}</span>
      </div>
      <h3 className="cmd-record-title">
        <a href={`/knowledge-items/${document.id}`}>{document.title}</a>
      </h3>
      {document.content && (
        <p className="cmd-record-description">
          {document.content.length > 240
            ? `${document.content.slice(0, 240)}…`
            : document.content}
        </p>
      )}
      <p className="cmd-record-identity">
        <a href={`/projects/${document.projectId}`}>{document.projectName}</a>
        <a href={`/api/v1/captures/${document.sourceCaptureId}/original-file`}>
          Download exact original file
        </a>
        <a href={`/inbox?captureId=${document.sourceCaptureId}`}>
          Source and checksum
        </a>
      </p>
    </article>
  );
}
