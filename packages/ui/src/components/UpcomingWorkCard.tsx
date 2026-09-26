export interface UpcomingWorkCardView {
  id: string;
  projectId: string;
  title: string;
  dueOn: string;
  priority: "low" | "normal" | "high" | null;
  dueState: "overdue" | "today" | "upcoming";
}

export function UpcomingWorkCard({ task }: { task: UpcomingWorkCardView }) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">Local task / {task.dueState}</span>
        <span className="cmd-count">{task.priority ?? "Priority unset"}</span>
      </div>
      <h3 className="cmd-record-title">
        <a href={`/work-items/${encodeURIComponent(task.id)}`}>{task.title}</a>
      </h3>
      <p>
        Due <time dateTime={task.dueOn}>{task.dueOn}</time> UTC
      </p>
      <p className="cmd-record-identity">
        <a href={`/projects/${encodeURIComponent(task.projectId)}`}>
          Open project
        </a>
      </p>
    </article>
  );
}
