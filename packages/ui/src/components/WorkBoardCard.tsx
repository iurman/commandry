export interface WorkBoardCardView {
  id: string;
  projectId: string;
  projectName: string;
  sourceCaptureId: string;
  title: string;
  priority?: "low" | "normal" | "high" | null | undefined;
  dueOn?: string | null | undefined;
  assigneeLabel?: string | null | undefined;
  status: "open" | "done";
  contextLink?: { id: string } | null | undefined;
  generatedFromWorkItemId?: string | null | undefined;
}

export function WorkBoardCard({
  item,
  onChangeStatus,
  busy = false,
}: {
  item: WorkBoardCardView;
  onChangeStatus?: (() => void) | undefined;
  busy?: boolean | undefined;
}) {
  return (
    <article className="cmd-record-card cmd-work-board-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">{item.status} work</span>
        <span className="cmd-count">
          {item.priority ? `${item.priority} priority` : "Priority unset"}
        </span>
      </div>
      <h4 className="cmd-record-title">
        <a href={`/work-items/${encodeURIComponent(item.id)}`}>{item.title}</a>
      </h4>
      <p>
        <a href={`/projects/${encodeURIComponent(item.projectId)}`}>
          {item.projectName}
        </a>
      </p>
      {item.dueOn && (
        <p>
          Due <time dateTime={item.dueOn}>{item.dueOn}</time> UTC
        </p>
      )}
      <p>Assigned: {item.assigneeLabel ?? "Unassigned"}</p>
      {item.contextLink && (
        <p>
          Shared through an{" "}
          <a
            href={`/api/v1/work-project-links/${encodeURIComponent(item.contextLink.id)}`}
          >
            exact project relationship
          </a>
          .
        </p>
      )}
      {item.generatedFromWorkItemId && (
        <p>
          Local worker-created task from{" "}
          <a
            href={`/work-items/${encodeURIComponent(item.generatedFromWorkItemId)}`}
          >
            its recurring source
          </a>
          .
        </p>
      )}
      <div className="cmd-work-board-actions">
        <a
          href={`/inbox?captureId=${encodeURIComponent(item.sourceCaptureId)}`}
        >
          Original capture
        </a>
        {onChangeStatus && (
          <Button disabled={busy} onClick={onChangeStatus} type="button">
            {busy
              ? "Saving..."
              : item.status === "open"
                ? "Mark done"
                : "Reopen"}
          </Button>
        )}
      </div>
    </article>
  );
}
import { Button } from "./Button";
