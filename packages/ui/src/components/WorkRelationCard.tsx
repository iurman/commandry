export interface WorkRelationCardView {
  id: string;
  sourceWorkItemId: string;
  sourceTitle: string;
  sourceStatus: "open" | "done";
  targetWorkItemId: string;
  targetTitle: string;
  targetStatus: "open" | "done";
  type: "parent_of" | "blocks";
  sourceLabel: string;
  createdAt: string;
}

export function WorkRelationCard({
  relation,
  onArchive,
  busy = false,
}: {
  relation: WorkRelationCardView;
  onArchive?: () => void;
  busy?: boolean;
}) {
  return (
    <article className="cmd-record-card">
      <p className="cmd-eyebrow">{relation.sourceLabel}</p>
      <p className="cmd-record-description">
        <a href={`/work-items/${relation.sourceWorkItemId}`}>
          {relation.sourceTitle}
        </a>{" "}
        {relation.type === "parent_of" ? "contains subtask" : "blocks"}{" "}
        <a href={`/work-items/${relation.targetWorkItemId}`}>
          {relation.targetTitle}
        </a>
        .
      </p>
      <p className="cmd-form-hint">
        Source {relation.sourceStatus}; target {relation.targetStatus}. Recorded{" "}
        <time dateTime={relation.createdAt}>{relation.createdAt}</time>.
      </p>
      {onArchive && (
        <button
          className="cmd-button cmd-button-secondary"
          type="button"
          disabled={busy}
          onClick={onArchive}
        >
          {busy ? "Removing relationship..." : "Remove relationship"}
        </button>
      )}
    </article>
  );
}
