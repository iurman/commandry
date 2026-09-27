export interface WorkVerificationCardView {
  id: string;
  acceptanceVersion: number;
  result: "met" | "not_met";
  note: string;
  documentTitle: string;
  sourceCaptureId: string;
  downloadHref: string;
  createdAt: string;
}

export function WorkVerificationCard({
  review,
  currentVersion,
}: {
  review: WorkVerificationCardView;
  currentVersion: number;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">Manual local acceptance review</span>
        <span className="cmd-count">
          {review.acceptanceVersion === currentVersion
            ? "Current criteria"
            : "Earlier criteria"}
        </span>
      </div>
      <h3 className="cmd-record-title">
        {review.result === "met" ? "Criteria claimed met" : "Criteria not met"}
      </h3>
      <p className="cmd-record-description">{review.note}</p>
      <p>
        Evidence: {review.documentTitle}. This is a recorded local review claim,
        not an independent or automated verification.
      </p>
      <p className="cmd-record-identity">
        <a href={review.downloadHref}>Download exact original file</a>
        <a href={`/inbox?captureId=${review.sourceCaptureId}`}>
          Source and checksum
        </a>
        <a href={`/api/v1/work-item-verifications/${review.id}`}>
          Exact review record
        </a>
        <time dateTime={review.createdAt}>{review.createdAt}</time>
      </p>
    </article>
  );
}
