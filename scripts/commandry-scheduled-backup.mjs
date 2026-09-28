import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  localBackupConfig,
  parsePrivateConfig,
  productionBackupEnvironment,
  trustedSource,
} from "./host-backup-config.mjs";

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

function validateStatusDirectory(path, uid) {
  const entry = lstatSync(path);
  if (
    !entry.isDirectory() ||
    entry.uid !== uid ||
    (entry.mode & 0o777) !== 0o700
  )
    fail("STATUS_DIRECTORY");
  return path;
}

function atomicStatus(name, record) {
  const target = resolve(statusDir, name);
  const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  let handle;
  try {
    handle = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    writeFileSync(handle, `${JSON.stringify(record)}\n`);
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    renameSync(temporary, target);
    const directory = openSync(
      statusDir,
      constants.O_RDONLY | constants.O_DIRECTORY,
    );
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } finally {
    if (handle !== undefined) closeSync(handle);
    rmSync(temporary, { force: true });
  }
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
      "restic-postgres.mjs",
      "r2-repository.mjs",
      "container-runtime.mjs",
      "stream-process.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    statusDir = validateStatusDirectory("/var/lib/commandry", 0);
    environment = productionBackupEnvironment(parsePrivateConfig());
  } else if (mode === "rehearse" && process.argv.length === 3) {
    const localRoot = resolve(root, ".agent") + sep;
    const candidate = process.env.COMMANDRY_BACKUP_STATUS_DIR;
    if (!candidate || !resolve(candidate).startsWith(localRoot))
      fail("LOCAL_STATUS_DIRECTORY");
    statusDir = validateStatusDirectory(resolve(candidate), process.getuid?.());
    environment = {
      ...process.env,
      APP_ENV: "local",
      ...localBackupConfig(root),
    };
  } else {
    fail("INVOCATION");
  }

  phase = "BACKUP";
  const backup = runBackup(environment);
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
    offsiteStored: production,
    restoreVerified: false,
    durationMs: Date.now() - startedMs,
  };
  atomicStatus("backup-last-success.json", record);
  atomicStatus("backup-last-attempt.json", record);
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
      atomicStatus("backup-last-attempt.json", record);
    } catch {
      record.reason = "STATUS_WRITE_FAILED";
    }
  }
  console.error(JSON.stringify(record));
  process.exitCode = 1;
}
