export interface LocalBackupCardView {
  id: string;
  outcome: "passed" | "failed";
  sourceLabel: string;
  archiveBytes: number;
  sourceSchemaTableCount: number;
  restoredSchemaTableCount: number;
  captureId: string | null;
  errorCode: string | null;
  completedAt: string;
}

export function LocalBackupCard({ backup }: { backup: LocalBackupCardView }) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">{backup.sourceLabel}</span>
        <span className="cmd-count">{backup.outcome}</span>
      </div>
      <h3 className="cmd-record-title">
        <time dateTime={backup.completedAt}>
          {backup.completedAt.slice(0, 16).replace("T", " ")} UTC
        </time>
      </h3>
      {backup.outcome === "passed" ? (
        <>
          <p>
            {backup.archiveBytes.toLocaleString()} encrypted bytes /{" "}
            {backup.sourceSchemaTableCount} source tables /{" "}
            {backup.restoredSchemaTableCount} restored tables
          </p>
          <p>
            {backup.captureId
              ? "One original capture matched after disposable restore."
              : "No original capture existed to compare; schema restore passed."}
          </p>
        </>
      ) : (
        <p className="cmd-inline-state cmd-error">
          Local backup failed at {backup.errorCode ?? "an unknown step"}.
        </p>
      )}
      <p>
        <a href={`/api/v1/local-backups/${encodeURIComponent(backup.id)}`}>
          Exact local backup evidence
        </a>
      </p>
    </article>
  );
}
