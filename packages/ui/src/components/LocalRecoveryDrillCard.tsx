export interface LocalRecoveryDrillCardView {
  id: string;
  outcome: "passed" | "failed";
  sourceLabel: string;
  sourceSchemaTableCount: number;
  restoredSchemaTableCount: number;
  sourceCaptureSha256: string | null;
  restoredCaptureSha256: string | null;
  backupSha256: string | null;
  errorCode: string | null;
  startedAt: string;
  completedAt: string;
}

export function LocalRecoveryDrillCard({
  drill,
}: {
  drill: LocalRecoveryDrillCardView;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">{drill.sourceLabel}</span>
        <span className="cmd-count">{drill.outcome}</span>
      </div>
      <h3 className="cmd-record-title">
        <time dateTime={drill.completedAt}>
          {drill.completedAt.slice(0, 16).replace("T", " ")} UTC
        </time>
      </h3>
      <p>
        {drill.sourceSchemaTableCount} source tables /{" "}
        {drill.restoredSchemaTableCount} restored tables
      </p>
      {drill.outcome === "passed" ? (
        <p>Original capture bytes matched after restoring the local backup.</p>
      ) : (
        <p className="cmd-inline-state cmd-error">
          Rehearsal failed at {drill.errorCode ?? "an unknown step"}.
        </p>
      )}
      <p>
        <a
          href={`/api/v1/local-recovery-drills/${encodeURIComponent(drill.id)}`}
        >
          Exact drill evidence and digests
        </a>
      </p>
    </article>
  );
}
