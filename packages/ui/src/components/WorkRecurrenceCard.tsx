export interface WorkRecurrenceCardView {
  id: string;
  scheduledFor: string;
  state: "queued" | "running" | "generated" | "failed";
  generatedWorkItemId: string | null;
  attempts: number;
  lastError: string | null;
}

export function WorkRecurrenceCard({
  occurrence,
}: {
  occurrence: WorkRecurrenceCardView;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">
          Local worker task / {occurrence.state}
        </span>
        <span className="cmd-count">Attempt {occurrence.attempts}</span>
      </div>
      <h3 className="cmd-record-title">
        <time dateTime={occurrence.scheduledFor}>
          {occurrence.scheduledFor}
        </time>
      </h3>
      <p>
        <a
          href={`/api/v1/work-recurrence-occurrences/${encodeURIComponent(occurrence.id)}`}
        >
          Exact occurrence
        </a>
        {occurrence.generatedWorkItemId && (
          <>
            {" "}
            /{" "}
            <a
              href={`/work-items/${encodeURIComponent(occurrence.generatedWorkItemId)}`}
            >
              Open generated task
            </a>
          </>
        )}
      </p>
      {occurrence.lastError && (
        <p className="cmd-inline-state cmd-error">
          Last local attempt: {occurrence.lastError}
        </p>
      )}
    </article>
  );
}
