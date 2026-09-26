export interface CaptureOriginalRecord {
  inputType: "text" | "url";
  originalContent: string;
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
      <pre className="cmd-capture-content">{capture.originalContent}</pre>
      <dl className="cmd-capture-provenance">
        <div>
          <dt>Input</dt>
          <dd>{capture.inputType === "url" ? "URL" : "Text"}</dd>
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
