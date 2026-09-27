export interface LocalFileTextCardView {
  captureId: string;
  sourceSha256: string;
  status: "pending" | "extracted" | "unsupported" | "failed";
  extractor: "local-utf8-v1";
  extractedText: string | null;
  truncated: boolean;
  message: string | null;
  updatedAt: string;
}

export function LocalFileTextCard({
  projection,
}: {
  projection: LocalFileTextCardView;
}) {
  return (
    <article className="cmd-record-card" aria-label="Derived local file text">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">Derived local file text</span>
        <span className="cmd-count">{projection.status}</span>
      </div>
      <h3 className="cmd-record-title">File content projection</h3>
      <p>
        Deterministic {projection.extractor} extraction from the exact local
        original. This is a search aid, not the original file or an AI summary.
      </p>
      {projection.status === "pending" && (
        <p role="status">Waiting for the local worker to read this file.</p>
      )}
      {projection.message && <p role="status">{projection.message}</p>}
      {projection.status === "extracted" && projection.extractedText && (
        <>
          {projection.truncated && (
            <p role="status">
              Only the first 200,000 characters were indexed. Download the
              original for the complete file.
            </p>
          )}
          <details>
            <summary>Read extracted text</summary>
            <pre className="cmd-derived-text">{projection.extractedText}</pre>
          </details>
        </>
      )}
      <p className="cmd-record-identity">
        Source SHA-256 <code>{projection.sourceSha256}</code>
      </p>
      <p className="cmd-record-identity">
        Projection updated{" "}
        <time dateTime={projection.updatedAt}>{projection.updatedAt}</time>
      </p>
      <p className="cmd-record-identity">
        <a
          href={`/api/v1/captures/${encodeURIComponent(projection.captureId)}/original-file`}
        >
          Download exact original
        </a>
        <a
          href={`/inbox?captureId=${encodeURIComponent(projection.captureId)}`}
        >
          Capture provenance
        </a>
      </p>
    </article>
  );
}
