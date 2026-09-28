import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  localBackupConfig,
  parsePrivateConfig,
  productionBackupEnvironment,
  trustedSource,
} from "./host-backup-config.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];
const production = mode === "predeploy";
const receiptPath = "/var/lib/commandry/predeploy-backup.receipt";
let phase = "CONFIG";

function fail(code) {
  throw new Error(code);
}

function runScript(script, args, environment, timeout) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "scripts", script), ...args],
    {
      cwd: root,
      env: environment,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout,
    },
  );
  if (result.error || result.status !== 0) fail(phase);
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    fail("INVALID_TOOL_OUTPUT");
  }
}

function validDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function releaseState(image, revision) {
  const stateDir = "/var/lib/commandry";
  const active = resolve(stateDir, "current-release");
  const pending = resolve(stateDir, "pending-first-release");
  const activeEntry = lstatSync(active, { throwIfNoEntry: false });
  const pendingEntry = lstatSync(pending, { throwIfNoEntry: false });
  const activeExists = Boolean(activeEntry);
  const pendingExists = Boolean(pendingEntry);
  if (activeExists === pendingExists) fail("RELEASE_STATE");
  const name = pendingExists ? "pending-first-release" : "current-release";
  const path = pendingExists ? pending : active;
  const entry = pendingExists ? pendingEntry : activeEntry;
  if (
    !entry.isFile() ||
    entry.uid !== 0 ||
    (entry.mode & 0o777) !== 0o600 ||
    entry.nlink !== 1
  )
    fail("RELEASE_STATE");
  const content = readFileSync(path, "utf8");
  const match = content.match(
    /^IMAGE=(ghcr\.io\/[^\s@]+@sha256:[0-9a-f]{64})\nREVISION=([0-9a-f]{40})\nVOLUME=(commandry[-_][a-z0-9_.-]{1,100})\nDB_NAME=([a-z_][a-z0-9_]{0,62})\nBOOTSTRAP_ID=([0-9a-f]{32})\nCLUSTER_ID=([1-9][0-9]{14,19})\n$/,
  );
  if (
    !match ||
    (pendingExists && (match[1] !== image || match[2] !== revision))
  )
    fail("RELEASE_STATE");
  return {
    name,
    sha256: createHash("sha256").update(content).digest("hex"),
    databaseName: match[4],
  };
}

function writeReceipt(snapshotId, dumpSha256, hostBundle, release) {
  if (existsSync(receiptPath)) fail("RECEIPT_EXISTS");
  const temporary = `${receiptPath}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(
      temporary,
      [
        `SNAPSHOT=${snapshotId}`,
        `COMPLETED_AT=${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`,
        "OFFSITE=true",
        "VERIFIED=true",
        "RESTORE_PASSED=true",
        "HOST_RECOVERY_DRILL_PASSED=true",
        `DUMP_SHA256=${dumpSha256}`,
        `GLOBALS_SNAPSHOT=${hostBundle.globals.snapshotId}`,
        `GLOBALS_SHA256=${hostBundle.globals.sha256}`,
        `CONFIG_SNAPSHOT=${hostBundle.configuration.snapshotId}`,
        `CONFIG_SHA256=${hostBundle.configuration.sha256}`,
        `RELEASE_STATE=${release.name}`,
        `RELEASE_MARKER_SHA256=${release.sha256}`,
        `DB_NAME=${release.databaseName}`,
        "",
      ].join("\n"),
      { flag: "wx", mode: 0o600 },
    );
    chmodSync(temporary, 0o600);
    renameSync(temporary, receiptPath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

try {
  if (Number(process.versions.node.split(".")[0]) !== 24) fail("NODE_VERSION");
  let config;
  let environment;
  let release = null;
  if (production) {
    if (
      process.getuid?.() !== 0 ||
      process.argv.length !== 6 ||
      process.argv[3] !== receiptPath ||
      !/^ghcr\.io\/[^\s@]+@sha256:[0-9a-f]{64}$/.test(process.argv[4]) ||
      !/^[0-9a-f]{40}$/.test(process.argv[5])
    )
      fail("INVOCATION");
    for (const path of [root, resolve(root, "scripts")])
      trustedSource(path, true);
    for (const script of [
      "commandry-backup-gate.mjs",
      "restic-postgres.mjs",
      "restic-host-bundle.mjs",
      "restic-host-recovery.mjs",
      "restic-isolated-restore.mjs",
      "r2-repository.mjs",
      "host-backup-config.mjs",
      "container-runtime.mjs",
      "stream-process.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    config = parsePrivateConfig();
    phase = "RELEASE_STATE";
    release = releaseState(process.argv[4], process.argv[5]);
    if (config.DB_NAME !== release.databaseName) fail("DATABASE_IDENTITY");
    environment = {
      ...productionBackupEnvironment(config),
      COMMANDRY_RELEASE_MARKER: release.name,
      COMMANDRY_RELEASE_MARKER_SHA256: release.sha256,
      RECOVERY_SOURCE_LABEL: "production-r2",
      RECOVERY_WEB_IMAGE: process.argv[4],
      RECOVERY_WEB_REVISION: process.argv[5],
      RECOVERY_EVIDENCE_DIR: "/var/lib/commandry/recovery-evidence",
    };
  } else if (mode === "rehearse" && process.argv.length === 3) {
    config = localBackupConfig(root);
    environment = {
      ...process.env,
      APP_ENV: "local",
      RECOVERY_SOURCE_LABEL: "synthetic-local-gate",
      ...config,
    };
  } else {
    fail("INVOCATION");
  }

  phase = "BACKUP";
  const backup = runScript(
    "restic-postgres.mjs",
    ["backup"],
    environment,
    30 * 60_000,
  );
  if (
    backup.outcome !== "passed" ||
    !validDigest(backup.snapshotId) ||
    !validDigest(backup.dumpSha256)
  )
    fail("BACKUP_RESULT");

  phase = "HOST_BUNDLE";
  const hostBundle = runScript(
    "restic-host-bundle.mjs",
    [production ? "backup" : "rehearse"],
    environment,
    30 * 60_000,
  );
  if (
    hostBundle.kind !== "commandry_host_recovery_bundle" ||
    hostBundle.outcome !== "passed" ||
    hostBundle.offsiteStored !== production ||
    hostBundle.encryptedReadbackVerified !== true ||
    hostBundle.releaseMarker !== (release?.name ?? "current-release") ||
    hostBundle.releaseMarkerSha256 !== (release?.sha256 ?? null) ||
    ![hostBundle.globals, hostBundle.configuration].every(
      (item) => validDigest(item?.snapshotId) && validDigest(item?.sha256),
    )
  )
    fail("HOST_BUNDLE_RESULT");

  phase = "ISOLATED_RESTORE";
  const restore = runScript(
    "restic-isolated-restore.mjs",
    [backup.snapshotId, backup.dumpSha256],
    environment,
    15 * 60_000,
  );
  if (
    restore.outcome !== "passed" ||
    restore.snapshotId !== backup.snapshotId ||
    restore.dumpSha256 !== backup.dumpSha256 ||
    restore.resourcesRemoved !== true ||
    restore.networkInternal !== true ||
    !["{}", "null"].includes(restore.publishedPorts) ||
    !restore.webSmoke ||
    Object.values(restore.webSmoke).some((value) => value === false) ||
    !Number.isSafeInteger(restore.publicTableCount) ||
    restore.publicTableCount < 1 ||
    (production && restore.offsiteVerified !== true)
  )
    fail("RESTORE_RESULT");
  const snapshotAgeMs = Date.now() - Date.parse(restore.snapshotTime);
  if (
    !Number.isFinite(snapshotAgeMs) ||
    snapshotAgeMs < 0 ||
    snapshotAgeMs > 30 * 60_000
  )
    fail("SNAPSHOT_STALE");

  phase = "HOST_RECOVERY";
  const hostRecovery = runScript(
    "restic-host-recovery.mjs",
    [
      production ? "verify" : "rehearse",
      hostBundle.globals.snapshotId,
      hostBundle.globals.sha256,
      hostBundle.configuration.snapshotId,
      hostBundle.configuration.sha256,
    ],
    environment,
    30 * 60_000,
  );
  if (
    hostRecovery.kind !== "commandry_host_recovery_drill" ||
    hostRecovery.outcome !== "passed" ||
    hostRecovery.globalsSnapshotId !== hostBundle.globals.snapshotId ||
    hostRecovery.configurationSnapshotId !==
      hostBundle.configuration.snapshotId ||
    hostRecovery.globalsApplied !== true ||
    hostRecovery.backupReadMembershipVerified !== true ||
    hostRecovery.configurationExtracted !== true ||
    hostRecovery.configurationInstalled !== false ||
    hostRecovery.isolatedNetwork !== true ||
    hostRecovery.resourcesRemoved !== true ||
    hostRecovery.offsiteVerified !== production ||
    hostRecovery.vpsRecoveryVerified !== false ||
    hostRecovery.releaseMarker !== (release?.name ?? "current-release") ||
    hostRecovery.releaseMarkerSha256 !== (release?.sha256 ?? null) ||
    hostRecovery.sourceLabel !== environment.RECOVERY_SOURCE_LABEL
  )
    fail("HOST_RECOVERY_RESULT");

  if (production) {
    phase = "RECEIPT";
    writeReceipt(backup.snapshotId, backup.dumpSha256, hostBundle, release);
  }
  console.log(
    JSON.stringify({
      kind: "commandry_deployment_backup_gate",
      outcome: "passed",
      mode: production ? "production" : "local_rehearsal",
      snapshotId: backup.snapshotId,
      dumpSha256: backup.dumpSha256,
      hostBundle: {
        globals: hostBundle.globals,
        configuration: hostBundle.configuration,
        encryptedReadbackVerified: true,
        globalsApplied: false,
        configurationInstalled: false,
      },
      offsiteVerified: production,
      isolatedRestorePassed: true,
      hostRecovery: {
        globalsApplied: true,
        backupReadMembershipVerified: true,
        configurationExtracted: true,
        configurationInstalled: false,
        resourcesRemoved: true,
        vpsRecoveryVerified: false,
      },
      receiptWritten: production,
      releaseState: release?.name ?? "current-release",
      restoreEvidencePath: restore.evidencePath,
      recoveryDurationMs: restore.recoveryDurationMs,
      snapshotAgeMs,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      kind: "commandry_deployment_backup_gate",
      outcome: "failed",
      phase,
      reason: /^[A-Z_]+$/.test(error?.message ?? "") ? error.message : phase,
    }),
  );
  process.exitCode = 1;
}
