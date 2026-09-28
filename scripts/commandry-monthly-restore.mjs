import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  localBackupConfig,
  parsePrivateConfig,
  productionBackupEnvironment,
  retentionPolicy,
  trustedSource,
} from "./host-backup-config.mjs";
import {
  atomicStatus,
  readStatus,
  validateStatusDirectory,
} from "./host-backup-status.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];
const production = mode === "monthly";
const sourceLabel = production
  ? "production-r2-monthly"
  : "synthetic-local-monthly";
const startedAt = new Date().toISOString();
const startedMs = Date.now();
let phase = "CONFIG";
let statusDir = null;

function fail(code) {
  throw new Error(code);
}

function currentRelease() {
  const path = "/var/lib/commandry/current-release";
  const entry = lstatSync(path);
  if (
    !entry.isFile() ||
    entry.uid !== 0 ||
    (entry.mode & 0o777) !== 0o600 ||
    entry.size > 512
  )
    fail("CURRENT_RELEASE");
  const match =
    /^IMAGE=(ghcr\.io\/[^\s@]+@sha256:[0-9a-f]{64})\nREVISION=([0-9a-f]{40})\n$/.exec(
      readFileSync(path, "utf8"),
    );
  if (!match) fail("CURRENT_RELEASE");
  const environmentPath = "/etc/commandry/commandry.env";
  const environmentEntry = lstatSync(environmentPath);
  if (
    !environmentEntry.isFile() ||
    environmentEntry.uid !== 0 ||
    (environmentEntry.mode & 0o777) !== 0o600 ||
    environmentEntry.size > 65536
  )
    fail("CURRENT_RELEASE");
  const environment = readFileSync(environmentPath, "utf8");
  const images = [...environment.matchAll(/^COMMANDRY_IMAGE=(.+)$/gm)];
  const revisions = [...environment.matchAll(/^RELEASE_SHA=(.+)$/gm)];
  if (
    images.length !== 1 ||
    revisions.length !== 1 ||
    images[0][1] !== match[1] ||
    revisions[0][1] !== match[2]
  )
    fail("CURRENT_RELEASE");
  return { image: match[1], revision: match[2] };
}

function checkedSnapshot(uid, maxAgeHours) {
  const status = readStatus(statusDir, "backup-last-success.json", uid);
  if (
    status.kind !== "commandry_scheduled_backup" ||
    status.schemaVersion !== 2 ||
    status.outcome !== "passed" ||
    status.environment !== (production ? "production" : "local") ||
    status.offsiteStored !== production ||
    status.repositoryCheckPassed !== true ||
    status.retainedSnapshotVerified !== true ||
    !/^[0-9a-f]{64}$/.test(status.snapshotId ?? "") ||
    !/^[0-9a-f]{64}$/.test(status.dumpSha256 ?? "")
  )
    fail("BACKUP_STATUS");
  const ageMs = Date.now() - Date.parse(status.completedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeHours * 60 * 60_000)
    fail("BACKUP_STALE");
  return status;
}

function restore(snapshot, environment) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "scripts/restic-isolated-restore.mjs"),
      snapshot.snapshotId,
      snapshot.dumpSha256,
    ],
    {
      cwd: root,
      env: environment,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: 45 * 60_000,
    },
  );
  if (result.error || result.status !== 0) fail("ISOLATED_RESTORE_FAILED");
  let output;
  try {
    output = JSON.parse(result.stdout.trim());
  } catch {
    fail("ISOLATED_RESTORE_OUTPUT");
  }
  if (
    output.kind !== "commandry_restic_isolated_restore" ||
    output.outcome !== "passed" ||
    output.snapshotId !== snapshot.snapshotId ||
    output.dumpSha256 !== snapshot.dumpSha256 ||
    output.resourcesRemoved !== true ||
    output.networkInternal !== true ||
    !["{}", "null"].includes(output.publishedPorts) ||
    !output.webSmoke ||
    Object.values(output.webSmoke).some((value) => value === false) ||
    !Number.isSafeInteger(output.publicTableCount) ||
    output.publicTableCount < 1 ||
    output.sourceLabel !== sourceLabel ||
    output.offsiteVerified !== production ||
    output.authenticatedReadVerified !== false ||
    typeof output.evidencePath !== "string"
  )
    fail("ISOLATED_RESTORE_RESULT");
  return output;
}

function recoverHostBundle(snapshot, environment) {
  const bundle = snapshot.hostBundle;
  if (
    bundle?.encryptedReadbackVerified !== true ||
    ![bundle.globals, bundle.configuration].every(
      (item) =>
        /^[0-9a-f]{64}$/.test(item?.snapshotId ?? "") &&
        /^[0-9a-f]{64}$/.test(item?.sha256 ?? ""),
    )
  )
    fail("HOST_BUNDLE_STATUS");
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "scripts/restic-host-recovery.mjs"),
      production ? "verify" : "rehearse",
      bundle.globals.snapshotId,
      bundle.globals.sha256,
      bundle.configuration.snapshotId,
      bundle.configuration.sha256,
    ],
    {
      cwd: root,
      env: environment,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 30 * 60_000,
    },
  );
  if (result.error || result.status !== 0) fail("HOST_RECOVERY_FAILED");
  let output;
  try {
    output = JSON.parse(result.stdout.trim());
  } catch {
    fail("HOST_RECOVERY_OUTPUT");
  }
  if (
    output.kind !== "commandry_host_recovery_drill" ||
    output.outcome !== "passed" ||
    output.globalsSnapshotId !== bundle.globals.snapshotId ||
    output.configurationSnapshotId !== bundle.configuration.snapshotId ||
    output.globalsApplied !== true ||
    output.backupReadMembershipVerified !== true ||
    output.configurationExtracted !== true ||
    output.configurationInstalled !== false ||
    output.isolatedNetwork !== true ||
    output.resourcesRemoved !== true ||
    output.offsiteVerified !== production ||
    output.vpsRecoveryVerified !== false ||
    output.sourceLabel !== sourceLabel
  )
    fail("HOST_RECOVERY_RESULT");
  return output;
}

try {
  if (Number(process.versions.node.split(".")[0]) !== 24) fail("NODE_VERSION");
  let environment;
  let uid;
  if (production) {
    if (process.getuid?.() !== 0 || process.argv.length !== 3)
      fail("INVOCATION");
    for (const path of [root, resolve(root, "scripts")])
      trustedSource(path, true);
    for (const script of [
      "commandry-monthly-restore.mjs",
      "host-backup-config.mjs",
      "host-backup-status.mjs",
      "restic-isolated-restore.mjs",
      "restic-host-bundle.mjs",
      "restic-host-recovery.mjs",
      "r2-repository.mjs",
      "container-runtime.mjs",
      "stream-process.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    uid = 0;
    statusDir = validateStatusDirectory("/var/lib/commandry", uid);
    atomicStatus(statusDir, "backup-monthly-last-attempt.json", {
      kind: "commandry_monthly_restore",
      schemaVersion: 3,
      outcome: "running",
      environment: "production",
      startedAt,
    });
    const config = parsePrivateConfig();
    const release = currentRelease();
    environment = {
      ...productionBackupEnvironment(config),
      RECOVERY_SOURCE_LABEL: sourceLabel,
      RECOVERY_WEB_IMAGE: release.image,
      RECOVERY_WEB_REVISION: release.revision,
      RECOVERY_EVIDENCE_DIR: "/var/lib/commandry/recovery-evidence",
    };
  } else if (mode === "monthly-rehearse" && process.argv.length === 3) {
    const localRoot = resolve(root, ".agent") + sep;
    const candidate = process.env.COMMANDRY_BACKUP_STATUS_DIR;
    if (!candidate || !resolve(candidate).startsWith(localRoot))
      fail("LOCAL_STATUS_DIRECTORY");
    uid = process.getuid?.();
    statusDir = validateStatusDirectory(resolve(candidate), uid);
    atomicStatus(statusDir, "backup-monthly-last-attempt.json", {
      kind: "commandry_monthly_restore",
      schemaVersion: 3,
      outcome: "running",
      environment: "local",
      startedAt,
    });
    environment = {
      ...process.env,
      APP_ENV: "local",
      RECOVERY_SOURCE_LABEL: sourceLabel,
      ...localBackupConfig(root),
    };
  } else {
    fail("INVOCATION");
  }
  const policy = retentionPolicy(environment);
  phase = "SNAPSHOT";
  const snapshot = checkedSnapshot(uid, policy.MAX_BACKUP_AGE_HOURS);
  phase = "HOST_RECOVERY";
  const hostRecovery = recoverHostBundle(snapshot, environment);
  phase = "ISOLATED_RESTORE";
  const restored = restore(snapshot, environment);
  phase = "STATUS";
  const record = {
    kind: "commandry_monthly_restore",
    schemaVersion: 3,
    outcome: "passed",
    environment: production ? "production" : "local",
    sourceLabel,
    startedAt,
    completedAt: new Date().toISOString(),
    snapshotId: snapshot.snapshotId,
    dumpSha256: snapshot.dumpSha256,
    hostBundle: snapshot.hostBundle,
    hostRecovery,
    offsiteVerified: production,
    isolatedRestorePassed: true,
    authenticatedReadVerified: false,
    vpsRecoveryVerified: false,
    resourcesRemoved: true,
    recoveryDurationMs: restored.recoveryDurationMs,
    restoreEvidencePath: restored.evidencePath,
    durationMs: Date.now() - startedMs,
  };
  atomicStatus(statusDir, "backup-monthly-last-success.json", record);
  atomicStatus(statusDir, "backup-monthly-last-attempt.json", record);
  console.log(JSON.stringify(record));
} catch (error) {
  const record = {
    kind: "commandry_monthly_restore",
    schemaVersion: 3,
    outcome: "failed",
    environment: production ? "production" : "local",
    sourceLabel,
    startedAt,
    completedAt: new Date().toISOString(),
    phase,
    reason: /^[A-Z_]+$/.test(error?.message ?? "") ? error.message : phase,
  };
  if (statusDir) {
    try {
      atomicStatus(statusDir, "backup-monthly-last-attempt.json", record);
    } catch {
      record.reason = "STATUS_WRITE_FAILED";
    }
  }
  console.error(JSON.stringify(record));
  process.exitCode = 1;
}
