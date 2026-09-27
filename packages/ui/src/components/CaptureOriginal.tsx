/* eslint-disable @next/next/no-img-element -- The verified local raster is shown without framework image rewriting, and this component also runs in Storybook. */
export interface CaptureOriginalRecord {
  inputType:
    "text" | "email" | "conversation" | "voice_transcript" | "url" | "file";
  originalContent: string;
  file?: {
    originalName: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    downloadHref: string;
    previewHref?: string | null;
  } | null;
  source: string;
  author: string;
  createdAt: string;
}

function sourceLabel(source: string) {
  return source === "manual-local" ? "Manual local capture" : source;
}

const inputLabels: Record<CaptureOriginalRecord["inputType"], string> = {
  text: "Text",
  email: "Pasted email",
  conversation: "Pasted conversation",
  voice_transcript: "Entered voice transcript",
  url: "URL",
  file: "File",
};

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
          {capture.file.previewHref && (
            <figure className="cmd-capture-image-preview">
              <img
                alt={`Local preview of ${capture.file.originalName}`}
                loading="lazy"
                src={capture.file.previewHref}
              />
              <figcaption>
                Local raster preview. Download the exact original for its
                preserved bytes.
              </figcaption>
            </figure>
          )}
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
          <dd>{inputLabels[capture.inputType]}</dd>
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
