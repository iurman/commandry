import { spawnSync } from "node:child_process";
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
  validateStatusDirectory,
} from "./host-backup-status.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];
const production = mode === "nightly";
const startedAt = new Date().toISOString();
const startedMs = Date.now();
let phase = "CONFIG";
let statusDir = null;

function fail(code) {
  throw new Error(code);
}

function markStarted() {
  atomicStatus(statusDir, "backup-last-attempt.json", {
    kind: "commandry_scheduled_backup",
    schemaVersion: 1,
    outcome: "running",
    environment: production ? "production" : "local",
    sourceLabel: production ? "production-r2" : "synthetic-local-rehearsal",
    startedAt,
    completedAt: null,
    phase: "CONFIG",
  });
}

function runBackup(environment) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "scripts/restic-postgres.mjs"), "backup"],
    {
      cwd: root,
      env: environment,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 30 * 60_000,
    },
  );
  if (result.error || result.status !== 0) fail("BACKUP_FAILED");
  let output;
  try {
    output = JSON.parse(result.stdout.trim());
  } catch {
    fail("BACKUP_OUTPUT");
  }
  if (
    output.kind !== "commandry_postgres_backup" ||
    output.outcome !== "passed" ||
    output.environment !== (production ? "production" : "local") ||
    !/^[0-9a-f]{64}$/.test(output.snapshotId ?? "") ||
    !/^[0-9a-f]{64}$/.test(output.dumpSha256 ?? "")
  )
    fail("BACKUP_RESULT");
  return output;
}

function runRetention(environment, policy, snapshotId) {
  const candidates = environment.RESTIC_BINARY
    ? [{ executable: environment.RESTIC_BINARY, prefix: [] }]
    : [
        { executable: "restic", prefix: [] },
        {
          executable: "flatpak-spawn",
          prefix: ["--host", "/home/linuxbrew/.linuxbrew/bin/restic"],
        },
      ];
  const restic = candidates.find(
    ({ executable, prefix }) =>
      spawnSync(executable, [...prefix, "version"], {
        env: environment,
        stdio: "ignore",
        timeout: 10_000,
      }).status === 0,
  );
  if (!restic) fail("RESTIC_UNAVAILABLE");
  const common = [
    ...restic.prefix,
    "--repo",
    environment.RESTIC_REPOSITORY,
    "--password-file",
    environment.RESTIC_PASSWORD_FILE,
  ];
  for (const args of [
    [
      "forget",
      "--tag",
      "commandry-postgres",
      "--keep-last",
      String(policy.RETENTION_LAST),
      "--keep-daily",
      String(policy.RETENTION_DAILY),
      "--keep-weekly",
      String(policy.RETENTION_WEEKLY),
      "--keep-monthly",
      String(policy.RETENTION_MONTHLY),
      "--prune",
    ],
    ["check"],
  ]) {
    const result = spawnSync(restic.executable, [...common, ...args], {
      cwd: root,
      env: environment,
      stdio: "ignore",
      timeout: 30 * 60_000,
    });
    if (result.error || result.status !== 0) fail("RETENTION_FAILED");
  }
  const retained = spawnSync(
    restic.executable,
    [...common, "snapshots", snapshotId, "--json"],
    {
      cwd: root,
      env: environment,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
    },
  );
  if (retained.error || retained.status !== 0) fail("RETENTION_FAILED");
  try {
    if (
      !JSON.parse(retained.stdout).some(
        (snapshot) => snapshot.id === snapshotId,
      )
    )
      fail("NEW_SNAPSHOT_NOT_RETAINED");
  } catch (error) {
    if (error?.message === "NEW_SNAPSHOT_NOT_RETAINED") throw error;
    fail("RETENTION_OUTPUT");
  }
}

try {
  if (Number(process.versions.node.split(".")[0]) !== 24) fail("NODE_VERSION");
  let environment;
  if (production) {
    if (process.getuid?.() !== 0 || process.argv.length !== 3)
      fail("INVOCATION");
    for (const path of [root, resolve(root, "scripts")])
      trustedSource(path, true);
    for (const script of [
      "commandry-scheduled-backup.mjs",
      "host-backup-config.mjs",
      "host-backup-status.mjs",
      "restic-postgres.mjs",
      "r2-repository.mjs",
      "container-runtime.mjs",
      "stream-process.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    statusDir = validateStatusDirectory("/var/lib/commandry", 0);
    markStarted();
    environment = productionBackupEnvironment(parsePrivateConfig());
  } else if (mode === "rehearse" && process.argv.length === 3) {
    const localRoot = resolve(root, ".agent") + sep;
    const candidate = process.env.COMMANDRY_BACKUP_STATUS_DIR;
    if (!candidate || !resolve(candidate).startsWith(localRoot))
      fail("LOCAL_STATUS_DIRECTORY");
    statusDir = validateStatusDirectory(resolve(candidate), process.getuid?.());
    markStarted();
    environment = {
      ...process.env,
      APP_ENV: "local",
      ...localBackupConfig(root),
    };
  } else {
    fail("INVOCATION");
  }

  const policy = retentionPolicy(environment);
  phase = "BACKUP";
  const backup = runBackup(environment);
  phase = "RETENTION";
  runRetention(environment, policy, backup.snapshotId);
  phase = "STATUS";
  const record = {
    kind: "commandry_scheduled_backup",
    schemaVersion: 1,
    outcome: "passed",
    environment: production ? "production" : "local",
    sourceLabel: production ? "production-r2" : "synthetic-local-rehearsal",
    startedAt,
    completedAt: new Date().toISOString(),
    snapshotId: backup.snapshotId,
    dumpSha256: backup.dumpSha256,
    repositoryCheckPassed: true,
    retainedSnapshotVerified: true,
    retentionApplied: {
      last: policy.RETENTION_LAST,
      daily: policy.RETENTION_DAILY,
      weekly: policy.RETENTION_WEEKLY,
      monthly: policy.RETENTION_MONTHLY,
    },
    offsiteStored: production,
    restoreVerified: false,
    durationMs: Date.now() - startedMs,
  };
  atomicStatus(statusDir, "backup-last-success.json", record);
  atomicStatus(statusDir, "backup-last-attempt.json", record);
  console.log(JSON.stringify(record));
} catch (error) {
  const record = {
    kind: "commandry_scheduled_backup",
    schemaVersion: 1,
    outcome: "failed",
    environment: production ? "production" : "local",
    sourceLabel: production ? "production-r2" : "synthetic-local-rehearsal",
    startedAt,
    completedAt: new Date().toISOString(),
    phase,
    reason: /^[A-Z_]+$/.test(error?.message ?? "") ? error.message : phase,
  };
  if (statusDir) {
    try {
      atomicStatus(statusDir, "backup-last-attempt.json", record);
    } catch {
      record.reason = "STATUS_WRITE_FAILED";
    }
  }
  console.error(JSON.stringify(record));
  process.exitCode = 1;
}
