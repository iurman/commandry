import { randomBytes } from "node:crypto";
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
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseR2Repository } from "./r2-repository.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];
const production = mode === "predeploy";
const receiptPath = "/var/lib/commandry/predeploy-backup.receipt";
const configPath = "/etc/commandry/backup.env";
let phase = "CONFIG";

function fail(code) {
  throw new Error(code);
}

function privateFile(path, minimumSize = 1) {
  if (!isAbsolute(path)) fail("PRIVATE_FILE");
  const entry = lstatSync(path);
  if (
    !entry.isFile() ||
    entry.uid !== 0 ||
    (entry.mode & 0o777) !== 0o600 ||
    entry.size < minimumSize
  )
    fail("PRIVATE_FILE");
}

function trustedSource(path, directory = false) {
  const entry = lstatSync(path);
  if (
    (directory ? !entry.isDirectory() : !entry.isFile()) ||
    entry.uid !== 0 ||
    (entry.mode & 0o022) !== 0
  )
    fail("SOURCE_TRUST");
}

function parsePrivateConfig() {
  privateFile(configPath);
  const allowed = new Set([
    "DB_NAME",
    "RESTIC_REPOSITORY",
    "RESTIC_PASSWORD_FILE",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
  ]);
  const values = {};
  for (const raw of readFileSync(configPath, "utf8").split("\n")) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (
      separator < 1 ||
      !allowed.has(key) ||
      Object.hasOwn(values, key) ||
      !value ||
      /[\r\n\0]/.test(value)
    )
      fail("BACKUP_CONFIG");
    values[key] = value;
  }
  if ([...allowed].some((key) => !values[key])) fail("BACKUP_CONFIG");
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(values.DB_NAME)) fail("BACKUP_CONFIG");
  if (!parseR2Repository(values.RESTIC_REPOSITORY)) fail("R2_REPOSITORY");
  if (
    !/^[^\s]{8,}$/.test(values.AWS_ACCESS_KEY_ID) ||
    !/^[^\s]{16,}$/.test(values.AWS_SECRET_ACCESS_KEY)
  )
    fail("R2_CREDENTIALS");
  privateFile(values.RESTIC_PASSWORD_FILE, 32);
  return values;
}

function localConfig() {
  if (!process.env.DB_NAME && existsSync(resolve(root, ".env.local")))
    process.loadEnvFile(resolve(root, ".env.local"));
  const repository = process.env.RESTIC_REPOSITORY;
  const passwordFile = process.env.RESTIC_PASSWORD_FILE;
  const localRoot = resolve(root, ".agent") + sep;
  if (
    process.env.APP_ENV !== "local" ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(process.env.DB_NAME ?? "") ||
    !repository ||
    !isAbsolute(repository) ||
    !resolve(repository).startsWith(localRoot) ||
    !passwordFile ||
    !isAbsolute(passwordFile) ||
    !resolve(passwordFile).startsWith(localRoot)
  )
    fail("LOCAL_REHEARSAL_CONFIG");
  const passwordEntry = lstatSync(passwordFile);
  if (
    !passwordEntry.isFile() ||
    passwordEntry.size < 32 ||
    (passwordEntry.mode & 0o077) !== 0
  )
    fail("LOCAL_REHEARSAL_CONFIG");
  return {
    DB_NAME: process.env.DB_NAME,
    RESTIC_REPOSITORY: repository,
    RESTIC_PASSWORD_FILE: passwordFile,
  };
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

function writeReceipt(snapshotId, dumpSha256) {
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
        `DUMP_SHA256=${dumpSha256}`,
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
      "restic-isolated-restore.mjs",
      "r2-repository.mjs",
      "container-runtime.mjs",
      "stream-process.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    config = parsePrivateConfig();
    environment = {
      HOME: "/root",
      PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
      DOCKER_HOST: "unix:///var/run/docker.sock",
      APP_ENV: "production",
      AWS_DEFAULT_REGION: "auto",
      RESTIC_BINARY: "/opt/commandry/runtime/restic",
      RECOVERY_SOURCE_LABEL: "production-r2",
      RECOVERY_WEB_IMAGE: process.argv[4],
      RECOVERY_WEB_REVISION: process.argv[5],
      RECOVERY_EVIDENCE_DIR: "/var/lib/commandry/recovery-evidence",
      ...config,
    };
  } else if (mode === "rehearse" && process.argv.length === 3) {
    config = localConfig();
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

  if (production) {
    phase = "RECEIPT";
    writeReceipt(backup.snapshotId, backup.dumpSha256);
  }
  console.log(
    JSON.stringify({
      kind: "commandry_deployment_backup_gate",
      outcome: "passed",
      mode: production ? "production" : "local_rehearsal",
      snapshotId: backup.snapshotId,
      dumpSha256: backup.dumpSha256,
      offsiteVerified: production,
      isolatedRestorePassed: true,
      receiptWritten: production,
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
