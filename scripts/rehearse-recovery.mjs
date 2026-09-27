import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Run pnpm setup first.");
  process.exit(1);
}
process.loadEnvFile(".env.local");
if (process.env.APP_ENV !== "local") {
  console.error("The recovery rehearsal is limited to APP_ENV=local.");
  process.exit(1);
}
const appDatabase = process.env.DB_NAME;
if (!appDatabase || !/^[a-z_][a-z0-9_]{0,62}$/.test(appDatabase)) {
  console.error("DB_NAME must be a simple local PostgreSQL identifier.");
  process.exit(1);
}
const runtime = detectContainerRuntime();
if (!runtime) {
  console.error("A local Docker-compatible Compose runtime is unavailable.");
  process.exit(1);
}

const drillId = randomUUID();
const suffix = randomBytes(6).toString("hex");
const sourceDatabase = `commandry_rehearsal_source_${suffix}`;
const restoredDatabase = `commandry_rehearsal_restored_${suffix}`;
const captureId = randomUUID();
const fixture = Buffer.from(
  `Original capture\nLocal restore rehearsal ${drillId}\n`,
  "utf8",
);
const expectedCaptureSha256 = sha256(fixture);
const startedAt = new Date().toISOString();
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
const limit = 64 * 1024 * 1024;
let phase = "SCHEMA_EXPORT";
let sourceTableCount = 0;
let restoredTableCount = 0;
let sourceCaptureSha256 = null;
let restoredCaptureSha256 = null;
let backupSha256 = null;
let failureCode = null;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function execute(args, input) {
  const result = runContainer(runtime, [...compose, ...args], {
    input,
    maxBuffer: limit,
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

function captureDigest(database) {
  const hex = query(
    database,
    `select encode(convert_to(original_content, 'UTF8'), 'hex') from capture where id = ${quote(captureId)}`,
  );
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error(phase);
  return sha256(Buffer.from(hex, "hex"));
}

try {
  const schema = execute([
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    appDatabase,
    "--schema-only",
    "--no-owner",
    "--no-acl",
    "-Fc",
  ]);
  phase = "SOURCE_CREATE";
  execute(["createdb", "-U", "postgres", "-T", "template0", sourceDatabase]);
  phase = "SOURCE_SCHEMA_RESTORE";
  execute(
    [
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      sourceDatabase,
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
    ],
    schema,
  );
  phase = "SOURCE_FIXTURE";
  query(
    sourceDatabase,
    `insert into capture (id, input_type, original_content) values (${quote(captureId)}, 'text', convert_from(decode(${quote(fixture.toString("hex"))}, 'hex'), 'UTF8'))`,
  );
  sourceTableCount = tableCount(sourceDatabase);
  sourceCaptureSha256 = captureDigest(sourceDatabase);
  if (sourceCaptureSha256 !== expectedCaptureSha256) throw new Error(phase);
  phase = "BACKUP_EXPORT";
  const backup = execute([
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    sourceDatabase,
    "--no-owner",
    "--no-acl",
    "-Fc",
  ]);
  backupSha256 = sha256(backup);
  phase = "RESTORED_CREATE";
  execute(["createdb", "-U", "postgres", "-T", "template0", restoredDatabase]);
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
    backup,
  );
  phase = "RESTORED_VERIFY";
  restoredTableCount = tableCount(restoredDatabase);
  restoredCaptureSha256 = captureDigest(restoredDatabase);
  if (
    restoredTableCount !== sourceTableCount ||
    restoredCaptureSha256 !== sourceCaptureSha256
  )
    throw new Error(phase);
} catch {
  failureCode = phase;
} finally {
  phase = "CLEANUP";
  for (const database of [restoredDatabase, sourceDatabase]) {
    try {
      execute(["dropdb", "-U", "postgres", "--if-exists", "--force", database]);
    } catch {
      failureCode ??= phase;
    }
  }
}

const completedAt = new Date().toISOString();
const outcome = failureCode ? "failed" : "passed";
phase = "RECORD_EVIDENCE";
try {
  query(
    appDatabase,
    `insert into local_recovery_drill
      (id, outcome, source_schema_table_count, restored_schema_table_count,
       source_capture_sha256, restored_capture_sha256, backup_sha256,
       error_code, started_at, completed_at)
     values (
       ${quote(drillId)}, ${quote(outcome)}, ${sourceTableCount}, ${restoredTableCount},
       ${sourceCaptureSha256 ? quote(sourceCaptureSha256) : "null"},
       ${restoredCaptureSha256 ? quote(restoredCaptureSha256) : "null"},
       ${backupSha256 ? quote(backupSha256) : "null"},
       ${failureCode ? quote(failureCode) : "null"},
       ${quote(startedAt)}, ${quote(completedAt)}
     )`,
  );
} catch {
  console.error("Could not record the local recovery rehearsal in PostgreSQL.");
  process.exit(1);
}

if (failureCode) {
  console.error(
    `Local recovery rehearsal ${drillId} failed at ${failureCode}.`,
  );
  process.exit(1);
}
console.log(
  `Local recovery rehearsal ${drillId} passed: ${sourceTableCount} public tables and original capture bytes match after restore. Production gates remain unverified.`,
);
