export const LOCAL_RELEASE_PREFLIGHT_CHECKS = [
  { key: "postgresHealthy", errorCode: "POSTGRES_UNHEALTHY" },
  { key: "webHealthy", errorCode: "WEB_UNHEALTHY" },
  { key: "workerHealthy", errorCode: "WORKER_UNHEALTHY" },
  { key: "migrationExited", errorCode: "MIGRATION_INCOMPLETE" },
  { key: "revisionKnown", errorCode: "REVISION_UNKNOWN" },
  { key: "sameImage", errorCode: "IMAGE_MISMATCH" },
  { key: "versionReachable", errorCode: "VERSION_UNAVAILABLE" },
  { key: "apiRead", errorCode: "API_READ_FAILED" },
  { key: "heartbeatFresh", errorCode: "WORKER_HEARTBEAT_STALE" },
  { key: "localEvidence", errorCode: "LOCAL_EVIDENCE_INCOMPLETE" },
] as const;

export type LocalReleasePreflightChecks = Record<
  (typeof LOCAL_RELEASE_PREFLIGHT_CHECKS)[number]["key"],
  boolean
>;

export function assessLocalReleasePreflight(
  checks: LocalReleasePreflightChecks,
): { outcome: "passed" | "failed"; errorCode: string | null } {
  const firstFailure = LOCAL_RELEASE_PREFLIGHT_CHECKS.find(
    ({ key }) => !checks[key],
  );
  return firstFailure
    ? { outcome: "failed", errorCode: firstFailure.errorCode }
    : { outcome: "passed", errorCode: null };
}
