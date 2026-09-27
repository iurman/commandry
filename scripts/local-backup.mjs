import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";
import {
  maximumLocalBackupBytes,
  openLocalBackup,
  sealLocalBackup,
} from "./local-backup-crypto.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run pnpm setup first.");
  process.exit(1);
}
process.loadEnvFile(".env.local");
if (process.env.APP_ENV !== "local") {
  console.error("Local backups require APP_ENV=local.");
  process.exit(1);
}
const appDatabase = process.env.DB_NAME;
const secret = process.env.APP_ENCRYPTION_KEY;
if (!appDatabase || !/^[a-z_][a-z0-9_]{0,62}$/.test(appDatabase)) {
  console.error("DB_NAME must be a simple local PostgreSQL identifier.");
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error("APP_ENCRYPTION_KEY is required for local backup encryption.");
  process.exit(1);
}
const runtime = detectContainerRuntime();
if (!runtime) {
  console.error("A local Docker-compatible Compose runtime is unavailable.");
  process.exit(1);
}

const backupDirectory = resolve(root, ".agent/local-backups");
const compose = [
  "compose",
  "--env-file",
  ".env.local",
  "-f",
  "compose.yaml",
  "exec",
  "-T",
  "postgres",
];
const command = process.argv[2] ?? "create";
let phase = "PREPARE";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function nullable(value) {
  return value === null ? "null" : quote(value);
}

function execute(args, input) {
  const result = runContainer(runtime, [...compose, ...args], {
    input,
    maxBuffer: maximumLocalBackupBytes + 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(phase);
  return result.stdout;
}

function query(database, statement) {
  return execute([
    "psql",
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    database,
    "-c",
    statement,
  ])
    .toString("utf8")
    .trim();
}

function tableCount(database) {
  const count = Number(
    query(
      database,
      "select count(*) from pg_tables where schemaname = 'public'",
    ),
  );
  if (!Number.isInteger(count) || count < 1) throw new Error(phase);
  return count;
}

function sampleCapture() {
  const sample = query(
    appDatabase,
    "select id::text || '|' || encode(convert_to(original_content, 'UTF8'), 'hex') from capture order by id limit 1",
  );
  if (!sample) return { id: null, digest: null };
  const divider = sample.indexOf("|");
  if (divider < 0) throw new Error(phase);
  const id = sample.slice(0, divider);
  const hex = sample.slice(divider + 1);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^(?:[0-9a-f]{2})*$/.test(hex))
    throw new Error(phase);
  return { id, digest: sha256(Buffer.from(hex, "hex")) };
}

function captureDigest(database, id) {
  if (!id) return null;
  const value = query(
    database,
    `select 'present:' || encode(convert_to(original_content, 'UTF8'), 'hex') from capture where id = ${quote(id)}::uuid`,
  );
  if (!value.startsWith("present:")) throw new Error(phase);
  const hex = value.slice("present:".length);
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) throw new Error(phase);
  return sha256(Buffer.from(hex, "hex"));
}

async function safeBackupDirectory() {
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const entry = await lstat(backupDirectory);
  if (!entry.isDirectory() || (entry.mode & 0o077) !== 0)
    throw new Error("Local backup directory must be private");
}

function archivePath(id) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    )
  )
    throw new Error("A valid local backup ID is required");
  return resolve(backupDirectory, `${id}.cdbk`);
}

async function readPrivateArchive(id) {
  const file = archivePath(id);
  const entry = await lstat(file);
  if (
    !entry.isFile() ||
    (entry.mode & 0o077) !== 0 ||
    entry.size === 0 ||
    entry.size > maximumLocalBackupBytes + 64
  )
    throw new Error("Local backup archive is not a bounded private file");
  return readFile(file);
}

async function restoreAndInspect(dump, expected) {
  const restoredDatabase = `commandry_backup_verify_${randomBytes(6).toString("hex")}`;
  let created = false;
  try {
    phase = "RESTORED_CREATE";
    execute([
      "createdb",
      "-U",
      "postgres",
      "-T",
      "template0",
      restoredDatabase,
    ]);
    created = true;
    phase = "BACKUP_RESTORE";
    execute(
      [
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        restoredDatabase,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ],
      dump,
    );
    phase = "RESTORED_VERIFY";
    const restoredSchemaTableCount = tableCount(restoredDatabase);
    const restoredCaptureSha256 = captureDigest(
      restoredDatabase,
      expected.captureId,
    );
    if (
      restoredSchemaTableCount !== expected.sourceSchemaTableCount ||
      restoredCaptureSha256 !== expected.sourceCaptureSha256
    )
      throw new Error(phase);
    return { restoredSchemaTableCount, restoredCaptureSha256 };
  } finally {
    if (created) {
      const preceding = phase;
      phase = "CLEANUP";
      execute([
        "dropdb",
        "-U",
        "postgres",
        "--if-exists",
        "--force",
        restoredDatabase,
      ]);
      phase = preceding;
    }
  }
}

function recordEvidence(evidence) {
  phase = "RECORD_EVIDENCE";
  query(
    appDatabase,
    `insert into local_backup_evidence
      (id, outcome, archive_sha256, archive_bytes, source_schema_table_count,
       restored_schema_table_count, capture_id, source_capture_sha256,
       restored_capture_sha256, error_code, started_at, completed_at)
     values (
       ${quote(evidence.id)}, ${quote(evidence.outcome)},
       ${nullable(evidence.archiveSha256)}, ${evidence.archiveBytes},
       ${evidence.sourceSchemaTableCount}, ${evidence.restoredSchemaTableCount},
       ${nullable(evidence.captureId)},
       ${nullable(evidence.sourceCaptureSha256)},
       ${nullable(evidence.restoredCaptureSha256)},
       ${nullable(evidence.errorCode)},
       ${quote(evidence.startedAt)}, ${quote(evidence.completedAt)}
     )`,
  );
}

async function createBackup() {
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  let sourceSchemaTableCount = 0;
  let restoredSchemaTableCount = 0;
  let captureId = null;
  let sourceCaptureSha256 = null;
  let restoredCaptureSha256 = null;
  let archiveSha256 = null;
  let archiveBytes = 0;
  let failureCode = null;
  let wroteArchive = false;
  const file = archivePath(id);
  try {
    phase = "DIRECTORY_CHECK";
    await safeBackupDirectory();
    phase = "SOURCE_INSPECT";
    sourceSchemaTableCount = tableCount(appDatabase);
    const sample = sampleCapture();
    captureId = sample.id;
    sourceCaptureSha256 = sample.digest;
    phase = "BACKUP_EXPORT";
    const dump = execute([
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      appDatabase,
      "--no-owner",
      "--no-acl",
      "-Fc",
    ]);
    phase = "ARCHIVE_ENCRYPT";
    const archive = sealLocalBackup(dump, secret);
    archiveSha256 = sha256(archive);
    archiveBytes = archive.length;
    phase = "ARCHIVE_WRITE";
    try {
      await writeFile(file, archive, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error?.code !== "EEXIST") await unlink(file).catch(() => undefined);
      throw error;
    }
    wroteArchive = true;
    phase = "ARCHIVE_REOPEN";
    const stored = await readPrivateArchive(id);
    if (sha256(stored) !== archiveSha256) throw new Error(phase);
    const opened = openLocalBackup(stored, secret);
    const restored = await restoreAndInspect(opened, {
      sourceSchemaTableCount,
      captureId,
      sourceCaptureSha256,
    });
    restoredSchemaTableCount = restored.restoredSchemaTableCount;
    restoredCaptureSha256 = restored.restoredCaptureSha256;
    opened.fill(0);
    dump.fill(0);
  } catch {
    failureCode = phase;
    if (wroteArchive) {
      try {
        await unlink(file);
      } catch {
        failureCode = "ARCHIVE_CLEANUP";
      }
    }
    archiveSha256 = null;
    archiveBytes = 0;
  }
  const completedAt = new Date().toISOString();
  try {
    recordEvidence({
      id,
      outcome: failureCode ? "failed" : "passed",
      archiveSha256,
      archiveBytes,
      sourceSchemaTableCount,
      restoredSchemaTableCount,
      captureId,
      sourceCaptureSha256,
      restoredCaptureSha256,
      errorCode: failureCode,
      startedAt,
      completedAt,
    });
  } catch {
    if (!failureCode && wroteArchive) await unlink(file).catch(() => undefined);
    console.error("Could not record local backup evidence in PostgreSQL.");
    process.exitCode = 1;
    return;
  }
  if (failureCode) {
    console.error(`Local backup ${id} failed at ${failureCode}.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Local backup ${id} passed: ${archiveBytes} encrypted bytes and ${restoredSchemaTableCount} restored public tables. Production recovery remains unverified.`,
  );
}

async function verifyBackup(id) {
  try {
    phase = "DIRECTORY_CHECK";
    await safeBackupDirectory();
    phase = "EVIDENCE_READ";
    const evidence = query(
      appDatabase,
      `select archive_sha256 || '|' || source_schema_table_count || '|' || coalesce(capture_id::text, '') || '|' || coalesce(source_capture_sha256, '') from local_backup_evidence where id = ${quote(id)}::uuid and outcome = 'passed'`,
    );
    if (!evidence) throw new Error(phase);
    const [expectedSha256, countText, captureId, sourceCaptureSha256] =
      evidence.split("|");
    const sourceSchemaTableCount = Number(countText);
    if (
      !/^[0-9a-f]{64}$/.test(expectedSha256 ?? "") ||
      !Number.isInteger(sourceSchemaTableCount) ||
      sourceSchemaTableCount < 1 ||
      Boolean(captureId) !== Boolean(sourceCaptureSha256)
    )
      throw new Error(phase);
    phase = "ARCHIVE_REOPEN";
    const stored = await readPrivateArchive(id);
    if (sha256(stored) !== expectedSha256) throw new Error(phase);
    phase = "ARCHIVE_DECRYPT";
    const opened = openLocalBackup(stored, secret);
    const restored = await restoreAndInspect(opened, {
      sourceSchemaTableCount,
      captureId: captureId || null,
      sourceCaptureSha256: sourceCaptureSha256 || null,
    });
    opened.fill(0);
    console.log(
      `Local backup ${id} verified again: ${restored.restoredSchemaTableCount} restored public tables. Production recovery remains unverified.`,
    );
  } catch {
    console.error(`Local backup ${id} verification failed at ${phase}.`);
    process.exitCode = 1;
  }
}

if (command === "create" && process.argv.length === 3) {
  await createBackup();
} else if (command === "verify" && process.argv.length === 4) {
  const id = process.argv[3];
  try {
    archivePath(id);
  } catch {
    console.error("A valid local backup ID is required.");
    process.exit(1);
  }
  await verifyBackup(id);
} else {
  console.error(
    "Usage: pnpm backup:local or pnpm backup:local:verify <backup-id>",
  );
  process.exitCode = 1;
}
