export interface LocalReleasePreflightCardView {
  id: string;
  sourceLabel: string;
  outcome: "passed" | "failed";
  checkoutRevision: string | null;
  imageId: string | null;
  versionSha: string | null;
  checks: {
    postgresHealthy: boolean;
    webHealthy: boolean;
    workerHealthy: boolean;
    migrationExited: boolean;
    revisionKnown: boolean;
    sameImage: boolean;
    versionReachable: boolean;
    apiRead: boolean;
    heartbeatFresh: boolean;
    localEvidence: boolean;
  };
  backupEvidenceId: string | null;
  recoveryEvidenceId: string | null;
  releaseEvidenceId: string | null;
  errorCode: string | null;
  completedAt: string;
}

const checkLabels = {
  postgresHealthy: "PostgreSQL healthy",
  webHealthy: "Web container healthy",
  workerHealthy: "Worker container healthy",
  migrationExited: "Migrator exited successfully",
  revisionKnown: "Checkout revision identified",
  sameImage: "Web and worker use one image",
  versionReachable: "Live, ready, and version reads",
  apiRead: "Versioned project read",
  heartbeatFresh: "Recent worker heartbeat",
  localEvidence: "Backup, restore, rollback evidence",
} as const;

export function LocalReleasePreflightCard({
  preflight,
}: {
  preflight: LocalReleasePreflightCardView;
}) {
  return (
    <article className="cmd-record-card">
      <div className="cmd-record-topline">
        <span className="cmd-record-kind">{preflight.sourceLabel}</span>
        <span className="cmd-count">{preflight.outcome}</span>
      </div>
      <h3 className="cmd-record-title">
        <time dateTime={preflight.completedAt}>
          {preflight.completedAt.slice(0, 16).replace("T", " ")} UTC
        </time>
      </h3>
      <p>
        Checkout {preflight.checkoutRevision?.slice(0, 8) ?? "unknown"} / local
        image {preflight.imageId?.slice(7, 19) ?? "unknown"} / version label{" "}
        {preflight.versionSha ?? "unknown"}. The local image is not proven to
        contain that checkout revision.
      </p>
      <ul className="cmd-recovery-gates">
        {(Object.keys(checkLabels) as Array<keyof typeof checkLabels>).map(
          (key) => (
            <li key={key}>
              <span>{checkLabels[key]}</span>
              <span className="cmd-panel-state">
                {preflight.checks[key] ? "passed" : "failed"}
              </span>
            </li>
          ),
        )}
      </ul>
      {preflight.errorCode && (
        <p className="cmd-inline-state cmd-error">
          First failed local check: {preflight.errorCode}.
        </p>
      )}
      <p>
        Local source evidence:{" "}
        {preflight.backupEvidenceId ? (
          <a href={`/api/v1/local-backups/${preflight.backupEvidenceId}`}>
            backup
          </a>
        ) : (
          "backup missing"
        )}
        {", "}
        {preflight.recoveryEvidenceId ? (
          <a
            href={`/api/v1/local-recovery-drills/${preflight.recoveryEvidenceId}`}
          >
            restore
          </a>
        ) : (
          "restore missing"
        )}
        {", "}
        {preflight.releaseEvidenceId ? (
          <a
            href={`/api/v1/local-release-rehearsals/${preflight.releaseEvidenceId}`}
          >
            rollback
          </a>
        ) : (
          "rollback missing"
        )}
        .
      </p>
      <p>
        <a href={`/api/v1/local-release-preflights/${preflight.id}`}>
          Exact local preflight record
        </a>
      </p>
    </article>
  );
}
