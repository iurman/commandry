import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";
import { detectContainerRuntime } from "./container-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

if (!process.env.APP_ENV && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
for (const name of [
  "DB_ROOT_PASSWORD",
  "DB_APP_PASSWORD",
  "DB_MIGRATION_PASSWORD",
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "BETTER_AUTH_SECRET",
  "APP_ENCRYPTION_KEY",
  "INITIAL_ADMIN_EMAIL",
]) {
  delete process.env[name];
}

const phaseNames = {
  backup: "BACKUP",
  verify: "VERIFY",
};
const command = process.argv[2];
let phase = "CONFIG";

function fail(message) {
  throw new Error(message);
}

function validateConfig() {
  if (!Object.hasOwn(phaseNames, command))
    fail(
      "Usage: restic-postgres.mjs backup | verify <snapshot-id> [dump-sha256]",
    );
  const appEnv = process.env.APP_ENV;
  if (appEnv !== "local" && appEnv !== "production")
    fail("APP_ENV must be local or production");
  const database = process.env.DB_NAME;
  if (!database || !/^[a-z_][a-z0-9_]{0,62}$/.test(database))
    fail("DB_NAME must be a simple PostgreSQL identifier");
  if (!process.env.RESTIC_REPOSITORY) fail("RESTIC_REPOSITORY is required");
  const passwordFile = process.env.RESTIC_PASSWORD_FILE;
  if (!passwordFile || !isAbsolute(passwordFile) || process.env.RESTIC_PASSWORD)
    fail("A dedicated absolute RESTIC_PASSWORD_FILE is required");
  const passwordEntry = lstatSync(passwordFile);
  if (
    !passwordEntry.isFile() ||
    passwordEntry.size < 32 ||
    (passwordEntry.mode & 0o077) !== 0 ||
    (appEnv === "production" && passwordEntry.uid !== 0)
  )
    fail("RESTIC_PASSWORD_FILE must be a private regular file");
  const composeEnvFile =
    appEnv === "production"
      ? "/etc/commandry/commandry.env"
      : resolve(root, ".env.local");
  if (!existsSync(composeEnvFile)) fail("Compose environment file is missing");
  if (appEnv === "production") {
    const composeEnvEntry = lstatSync(composeEnvFile);
    if (
      !composeEnvEntry.isFile() ||
      composeEnvEntry.uid !== 0 ||
      (composeEnvEntry.mode & 0o077) !== 0
    )
      fail(
        "Production Compose environment file must be root-owned and private",
      );
  }
  const runtime = detectContainerRuntime();
  if (!runtime) fail("A Docker-compatible Compose runtime is unavailable");
  const resticCandidates = process.env.RESTIC_BINARY
    ? [{ executable: process.env.RESTIC_BINARY, prefix: [] }]
    : [
        { executable: "restic", prefix: [] },
        {
          executable: "flatpak-spawn",
          prefix: ["--host", "/home/linuxbrew/.linuxbrew/bin/restic"],
        },
      ];
  const restic = resticCandidates.find(
    (candidate) =>
      spawnSync(candidate.executable, [...candidate.prefix, "version"], {
        stdio: "ignore",
      }).status === 0,
  );
  if (!restic) fail("restic is unavailable");
  const compose = [
    ...runtime.prefix,
    "compose",
    "--env-file",
    composeEnvFile,
    "-f",
    appEnv === "production" ? "compose.production.yaml" : "compose.yaml",
    "exec",
    "-T",
    "postgres",
  ];
  return {
    database,
    runtime,
    compose,
    restic: {
      executable: restic.executable,
      args: [
        ...restic.prefix,
        "--repo",
        process.env.RESTIC_REPOSITORY,
        "--password-file",
        passwordFile,
      ],
    },
  };
}

function run(commandName, args) {
  const result = spawnSync(commandName, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail(phase);
  return result.stdout.trim();
}

function container(config, args) {
  return [config.runtime.command, [...config.compose, ...args]];
}

function databaseQuery(config, database, sql) {
  const [executable, args] = container(config, [
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
    sql,
  ]);
  return run(executable, args);
}

function onClose(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
}

async function pipeAndHash(sourceCommand, targetCommand, onTargetLine) {
  const source = spawn(sourceCommand[0], sourceCommand[1], { cwd: root });
  const target = spawn(targetCommand[0], targetCommand[1], { cwd: root });
  const hash = createHash("sha256");
  const hasher = new Transform({
    transform(chunk, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
  let pending = "";
  target.stdout.setEncoding("utf8");
  target.stdout.on("data", (chunk) => {
    pending += chunk;
    if (pending.length > 128 * 1024) {
      target.kill();
      return;
    }
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      onTargetLine?.(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  });
  source.stderr.resume();
  target.stderr.resume();
  const results = await Promise.allSettled([
    pipeline(source.stdout, hasher, target.stdin),
    onClose(source),
    onClose(target),
  ]);
  if (
    results.some(
      (result, index) =>
        result.status === "rejected" || (index > 0 && result.value !== 0),
    )
  )
    fail(phase);
  if (pending) onTargetLine?.(pending);
  return hash.digest("hex");
}

function checkedSnapshotId(value) {
  if (!/^[0-9a-f]{64}$/.test(value || ""))
    fail("A full restic snapshot ID is required");
  return value;
}

async function backup(config) {
  phase = "BACKUP_ROLE";
  const [roleExecutable, roleArgs] = container(config, [
    "psql",
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "commandry_backup",
    "-d",
    config.database,
    "-c",
    "select current_user",
  ]);
  if (run(roleExecutable, roleArgs) !== "commandry_backup") fail(phase);
  phase = "DUMP_UPLOAD";
  const dump = container(config, [
    "pg_dump",
    "-U",
    "commandry_backup",
    "-d",
    config.database,
    "--lock-wait-timeout=30s",
    "--no-owner",
    "--no-acl",
    "-Fc",
  ]);
  let snapshotId = null;
  let invalidResticOutput = false;
  const dumpSha256 = await pipeAndHash(
    dump,
    [
      config.restic.executable,
      [
        ...config.restic.args,
        "backup",
        "--stdin",
        "--stdin-filename",
        "commandry.dump",
        "--tag",
        "commandry-postgres",
        "--json",
      ],
    ],
    (line) => {
      try {
        const data = JSON.parse(line);
        if (data.message_type === "summary") snapshotId = data.snapshot_id;
      } catch {
        invalidResticOutput = true;
      }
    },
  );
  if (invalidResticOutput) fail("RESTIC_OUTPUT");
  checkedSnapshotId(snapshotId);
  phase = "REPOSITORY_CHECK";
  run(config.restic.executable, [...config.restic.args, "check", "--json"]);
  return { snapshotId, dumpSha256 };
}

async function verify(config, snapshotId, expectedSha256) {
  checkedSnapshotId(snapshotId);
  if (expectedSha256 && !/^[0-9a-f]{64}$/.test(expectedSha256))
    fail("Expected dump SHA-256 must be a full digest");
  const restoredDatabase = `commandry_restore_${randomBytes(6).toString("hex")}`;
  let created = false;
  try {
    phase = "RESTORE_CREATE";
    const [createExecutable, createArgs] = container(config, [
      "createdb",
      "-U",
      "postgres",
      "-T",
      "template0",
      restoredDatabase,
    ]);
    run(createExecutable, createArgs);
    created = true;
    phase = "RESTORE_STREAM";
    const restoredSha256 = await pipeAndHash(
      [
        config.restic.executable,
        [...config.restic.args, "dump", snapshotId, "/commandry.dump"],
      ],
      container(config, [
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        restoredDatabase,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ]),
    );
    if (expectedSha256 && restoredSha256 !== expectedSha256)
      fail("RESTORE_DIGEST");
    phase = "RESTORE_QUERY";
    const result = databaseQuery(
      config,
      restoredDatabase,
      "select (select count(*) from pg_tables where schemaname = 'public') || '|' || (select count(*) from project) || '|' || (select count(*) from capture) || '|' || (select count(*) from work_item)",
    );
    const [tableCount, projectCount, captureCount, workCount] = result
      .split("|")
      .map(Number);
    if (
      ![tableCount, projectCount, captureCount, workCount].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ) ||
      tableCount < 1
    )
      fail(phase);
    return {
      snapshotId,
      dumpSha256: restoredSha256,
      tableCount,
      projectCount,
      captureCount,
      workCount,
      target: "disposable database in the active PostgreSQL container",
    };
  } finally {
    if (created) {
      const previous = phase;
      phase = "RESTORE_CLEANUP";
      const [dropExecutable, dropArgs] = container(config, [
        "dropdb",
        "-U",
        "postgres",
        "--if-exists",
        "--force",
        restoredDatabase,
      ]);
      run(dropExecutable, dropArgs);
      phase = previous;
    }
  }
}

try {
  const config = validateConfig();
  const started = Date.now();
  if (command === "backup" && process.argv.length === 3) {
    const result = await backup(config);
    console.log(
      JSON.stringify({
        kind: "commandry_postgres_backup",
        outcome: "passed",
        environment: process.env.APP_ENV,
        ...result,
        durationMs: Date.now() - started,
      }),
    );
  } else if (command === "verify" && [4, 5].includes(process.argv.length)) {
    const result = await verify(config, process.argv[3], process.argv[4]);
    console.log(
      JSON.stringify({
        kind: "commandry_postgres_restore",
        outcome: "passed",
        environment: process.env.APP_ENV,
        ...result,
        durationMs: Date.now() - started,
      }),
    );
  } else {
    fail(
      "Usage: restic-postgres.mjs backup | verify <snapshot-id> [dump-sha256]",
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      kind: "commandry_postgres_backup_tool",
      outcome: "failed",
      phase,
      reason: error.message === phase ? phase : error.message,
    }),
  );
  process.exitCode = 1;
}
