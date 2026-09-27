export interface LocalReleaseRehearsalCardView {
  id: string;
  outcome: "passed" | "failed";
  sourceLabel: string;
  previousRevision: string | null;
  candidateRevision: string | null;
  initialWebVerified: boolean;
  initialWorkerVerified: boolean;
  candidateWebVerified: boolean;
  candidateWorkerVerified: boolean;
  rollbackWebVerified: boolean;
  rollbackWorkerVerified: boolean;
  sourceSchemaTableCount: number;
  isolatedSchemaTableCount: number;
  errorCode: string | null;
  completedAt: string;
}

export function LocalReleaseRehearsalCard({
  rehearsal,
}: {
  rehearsal: LocalReleaseRehearsalCardView;
}) {
  const stages = [
    {
      name: "Previous image",
      web: rehearsal.initialWebVerified,
      worker: rehearsal.initialWorkerVerified,
    },
    {
      name: "Candidate image",
      web: rehearsal.candidateWebVerified,
      worker: rehearsal.candidateWorkerVerified,
    },
    {
      name: "Code rollback",
      web: rehearsal.rollbackWebVerified,
      worker: rehearsal.rollbackWorkerVerified,
    },
  ];
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">{rehearsal.sourceLabel}</span>
        <span className="cmd-count">{rehearsal.outcome}</span>
      </div>
      <h3 className="cmd-record-title">
        <time dateTime={rehearsal.completedAt}>
          {rehearsal.completedAt.slice(0, 16).replace("T", " ")} UTC
        </time>
      </h3>
      <p>
        {rehearsal.previousRevision?.slice(0, 8) ?? "unknown prior"} to{" "}
        {rehearsal.candidateRevision?.slice(0, 8) ?? "unknown candidate"} /{" "}
        {rehearsal.isolatedSchemaTableCount} of{" "}
        {rehearsal.sourceSchemaTableCount} cloned tables
      </p>
      <ul className="cmd-recovery-gates">
        {stages.map((stage) => (
          <li key={stage.name}>
            <span>{stage.name}</span>
            <span className="cmd-panel-state">
              Web {stage.web ? "verified" : "not verified"} / worker{" "}
              {stage.worker ? "verified" : "not verified"}
            </span>
          </li>
        ))}
      </ul>
      {rehearsal.errorCode && (
        <p className="cmd-inline-state cmd-error">
          Local rehearsal stopped at {rehearsal.errorCode}.
        </p>
      )}
      <p>
        <a
          href={`/api/v1/local-release-rehearsals/${encodeURIComponent(rehearsal.id)}`}
        >
          Exact local release evidence
        </a>
      </p>
    </article>
  );
}
