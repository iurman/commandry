export interface CaptureOriginalRecord {
  inputType: "text" | "url" | "file";
  originalContent: string;
  file?: {
    originalName: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    downloadHref: string;
  } | null;
  source: string;
  author: string;
  createdAt: string;
}

function sourceLabel(source: string) {
  return source === "manual-local" ? "Manual local capture" : source;
}

export function CaptureOriginal({
  capture,
}: {
  capture: CaptureOriginalRecord;
}) {
  return (
    <article
      className="cmd-capture-original"
      aria-labelledby="capture-original-heading"
    >
      <div className="cmd-capture-original-heading">
        <div>
          <p className="cmd-eyebrow">Preserved evidence</p>
          <h3 id="capture-original-heading">Original input</h3>
        </div>
        <span className="cmd-capture-lock">Read only</span>
      </div>
      {capture.inputType === "file" && capture.file ? (
        <div className="cmd-capture-content">
          <p>
            <strong>{capture.file.originalName}</strong>
          </p>
          <p>
            {capture.file.byteSize.toLocaleString()} bytes /{" "}
            {capture.file.mediaType}
          </p>
          <p>
            SHA-256: <code>{capture.file.sha256}</code>
          </p>
          <p>
            <a href={capture.file.downloadHref}>Download exact original file</a>
          </p>
        </div>
      ) : (
        <pre className="cmd-capture-content">{capture.originalContent}</pre>
      )}
      <dl className="cmd-capture-provenance">
        <div>
          <dt>Input</dt>
          <dd>
            {capture.inputType === "url"
              ? "URL"
              : capture.inputType === "file"
                ? "File"
                : "Text"}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{sourceLabel(capture.source)}</dd>
        </div>
        <div>
          <dt>Author</dt>
          <dd>{capture.author}</dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>
            <time dateTime={capture.createdAt}>{capture.createdAt}</time>
          </dd>
        </div>
      </dl>
    </article>
  );
}
