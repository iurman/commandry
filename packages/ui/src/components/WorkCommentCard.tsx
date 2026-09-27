export interface WorkCommentCardView {
  id: string;
  body: string;
  actor: string;
  sourceLabel: string;
  createdAt: string;
}

export function WorkCommentCard({ comment }: { comment: WorkCommentCardView }) {
  return (
    <article className="cmd-record-card">
      <p className="cmd-eyebrow">{comment.sourceLabel}</p>
      <p className="cmd-detail-body">{comment.body}</p>
      <p className="cmd-form-hint">
        {comment.actor} ·{" "}
        <time dateTime={comment.createdAt}>{comment.createdAt}</time>
      </p>
    </article>
  );
}
