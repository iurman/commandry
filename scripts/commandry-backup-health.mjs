import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePrivateConfig,
  retentionPolicy,
  trustedSource,
} from "./host-backup-config.mjs";
import { readStatus, validateStatusDirectory } from "./host-backup-status.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];
const production = mode === "health";
let reason = "STATUS_INVALID";

function fail(code) {
  throw new Error(code);
}

try {
  if (Number(process.versions.node.split(".")[0]) !== 24) fail("NODE_VERSION");
  let directory;
  let uid;
  let policy;
  if (production) {
    if (process.getuid?.() !== 0 || process.argv.length !== 3)
      fail("INVOCATION");
    for (const path of [root, resolve(root, "scripts")])
      trustedSource(path, true);
    for (const script of [
      "commandry-backup-health.mjs",
      "host-backup-config.mjs",
      "host-backup-status.mjs",
      "r2-repository.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    directory = "/var/lib/commandry";
    uid = 0;
    policy = retentionPolicy(parsePrivateConfig());
  } else if (mode === "health-rehearse" && process.argv.length === 3) {
    const localRoot = resolve(root, ".agent") + sep;
    const candidate = process.env.COMMANDRY_BACKUP_STATUS_DIR;
    if (!candidate || !resolve(candidate).startsWith(localRoot))
      fail("LOCAL_STATUS_DIRECTORY");
    directory = resolve(candidate);
    uid = process.getuid?.();
    policy = retentionPolicy(process.env);
  } else {
    fail("INVOCATION");
  }
  validateStatusDirectory(directory, uid);
  reason = "STATUS_FILE";
  const success = readStatus(directory, "backup-last-success.json", uid);
  const attempt = readStatus(directory, "backup-last-attempt.json", uid);
  if (
    success.kind !== "commandry_scheduled_backup" ||
    success.schemaVersion !== 1 ||
    success.outcome !== "passed" ||
    success.environment !== (production ? "production" : "local") ||
    success.repositoryCheckPassed !== true ||
    success.retainedSnapshotVerified !== true ||
    success.offsiteStored !== production ||
    attempt.kind !== "commandry_scheduled_backup" ||
    attempt.schemaVersion !== 1 ||
    attempt.environment !== success.environment ||
    !/^[0-9a-f]{64}$/.test(success.snapshotId ?? "") ||
    !/^[0-9a-f]{64}$/.test(success.dumpSha256 ?? "")
  )
    fail("STATUS_MISMATCH");
  const ageMs = Date.now() - Date.parse(success.completedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) fail("STATUS_TIME");
  if (ageMs > policy.MAX_BACKUP_AGE_HOURS * 60 * 60_000) fail("BACKUP_STALE");
  let status = "healthy";
  if (attempt.outcome === "running") {
    const runningMs = Date.now() - Date.parse(attempt.startedAt);
    if (!Number.isFinite(runningMs) || runningMs < 0 || runningMs > 90 * 60_000)
      fail("ATTEMPT_STALLED");
    status = "in_progress";
  } else if (attempt.outcome === "failed") {
    fail("LAST_ATTEMPT_FAILED");
  } else if (
    attempt.outcome !== "passed" ||
    attempt.offsiteStored !== success.offsiteStored ||
    attempt.snapshotId !== success.snapshotId ||
    attempt.completedAt !== success.completedAt
  ) {
    fail("STATUS_MISMATCH");
  }
  console.log(
    JSON.stringify({
      kind: "commandry_backup_health",
      status,
      environment: production ? "production" : "local",
      checkedAt: new Date().toISOString(),
      snapshotId: success.snapshotId,
      completedAt: success.completedAt,
      ageMs,
      maxAgeHours: policy.MAX_BACKUP_AGE_HOURS,
      offsiteStored: production,
      restoreVerified: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      kind: "commandry_backup_health",
      status: "unhealthy",
      environment: production ? "production" : "local",
      checkedAt: new Date().toISOString(),
      reason: /^[A-Z_]+$/.test(error?.message ?? "") ? error.message : reason,
    }),
  );
  process.exitCode = 1;
}
