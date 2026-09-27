import { Button } from "./Button";

export interface WorkAttachmentCardView {
  id: string;
  workItemId: string;
  workTitle: string;
  knowledgeItemId: string;
  contextLinkId?: string | null;
  documentTitle: string;
  sourceCaptureId: string;
  originalName: string;
  byteSize: number;
  sha256: string;
  downloadHref: string;
  createdAt: string;
}

export function WorkAttachmentCard({
  attachment,
  showWorkLink = true,
  archiving = false,
  onArchive,
}: {
  attachment: WorkAttachmentCardView;
  showWorkLink?: boolean;
  archiving?: boolean;
  onArchive?: () => void;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">Manual local task attachment</span>
        <span className="cmd-count">
          {attachment.byteSize.toLocaleString()} bytes
        </span>
      </div>
      <h3 className="cmd-record-title">
        <a href={`/knowledge-items/${attachment.knowledgeItemId}`}>
          {attachment.documentTitle}
        </a>
      </h3>
      <p className="cmd-record-description">
        Original file: {attachment.originalName}.
        {showWorkLink && (
          <>
            {" "}
            Attached to{" "}
            <a href={`/work-items/${attachment.workItemId}`}>
              {attachment.workTitle}
            </a>
            .
          </>
        )}
      </p>
      <p className="cmd-record-identity">
        <a href={attachment.downloadHref}>Download exact original file</a>
        {attachment.contextLinkId && (
          <a
            href={`/api/v1/knowledge-project-links/${attachment.contextLinkId}`}
          >
            Shared project relationship
          </a>
        )}
        <a href={`/inbox?captureId=${attachment.sourceCaptureId}`}>
          Source and checksum
        </a>
        <span>
          Linked{" "}
          <time dateTime={attachment.createdAt}>{attachment.createdAt}</time>
        </span>
      </p>
      {onArchive && (
        <Button disabled={archiving} onClick={onArchive} type="button">
          {archiving ? "Removing link..." : "Remove from task"}
        </Button>
      )}
    </article>
  );
}
