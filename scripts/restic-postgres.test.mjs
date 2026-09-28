import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { detectContainerRuntime } from "./container-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function execute(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${executable} exited ${result.status}: ${result.stderr?.slice(-500)}`,
  );
  return result.stdout;
}

test("streamed restic backup restores synthetic data in an isolated app and rejects bad digests", async () => {
  assert.ok(existsSync(resolve(root, ".env.local")));
  if (!process.env.APP_ENV) process.loadEnvFile(resolve(root, ".env.local"));
  assert.equal(process.env.APP_ENV, "local");
  const sourceDatabase = process.env.DB_NAME;
  assert.match(sourceDatabase, /^[a-z_][a-z0-9_]{0,62}$/);
  const runtime = detectContainerRuntime();
  assert.ok(runtime);
  const restic = [
    { executable: "restic", prefix: [] },
    {
      executable: "flatpak-spawn",
      prefix: ["--host", "/home/linuxbrew/.linuxbrew/bin/restic"],
    },
  ].find(
    ({ executable, prefix }) =>
      spawnSync(executable, [...prefix, "version"], {
        stdio: "ignore",
      }).status === 0,
  );
  assert.ok(restic);
  const database = `commandry_restic_test_${randomBytes(4).toString("hex")}`;
  const projectId = randomUUID();
  const captureId = randomUUID();
  const fixture = `Synthetic restic test capture ${captureId}`;
  const directory = await mkdtemp(resolve(root, ".agent/restic-test-"));
  const repository = resolve(directory, "repository");
  const configDirectory = resolve(directory, "commandry");
  const passwordFile = resolve(configDirectory, "restic-password");
  const stateDirectory = resolve(directory, "state");
  await mkdir(configDirectory, { mode: 0o700 });
  await mkdir(stateDirectory, { mode: 0o700 });
  await writeFile(
    resolve(configDirectory, "commandry.env"),
    "SYNTHETIC_CONFIG=true\n",
    {
      mode: 0o600,
    },
  );
  await writeFile(
    resolve(configDirectory, "backup.env"),
    "SYNTHETIC_BACKUP=true\n",
    {
      mode: 0o600,
    },
  );
  await writeFile(
    resolve(stateDirectory, "current-release"),
    `IMAGE=ghcr.io/example/commandry@sha256:${"a".repeat(64)}\nREVISION=${"b".repeat(40)}\n`,
    { mode: 0o600 },
  );
  await writeFile(passwordFile, randomBytes(48).toString("base64url"), {
    mode: 0o600,
  });
  const resticArgs = [
    ...restic.prefix,
    "--repo",
    repository,
    "--password-file",
    passwordFile,
  ];
  const compose = [
    ...runtime.prefix,
    "compose",
    "--env-file",
    ".env.local",
    "-f",
    "compose.yaml",
    "exec",
    "-T",
    "postgres",
  ];
  const inDatabase = (args, options) =>
    execute(runtime.command, [...compose, ...args], options);
  const scriptEnvironment = {
    ...process.env,
    APP_ENV: "local",
    DB_NAME: database,
    RESTIC_REPOSITORY: repository,
    RESTIC_PASSWORD_FILE: passwordFile,
    COMMANDRY_BACKUP_CONFIG_DIR: configDirectory,
    COMMANDRY_BACKUP_STATE_DIR: stateDirectory,
    RETENTION_LAST: "3",
    RETENTION_DAILY: "7",
    RETENTION_WEEKLY: "4",
    RETENTION_MONTHLY: "3",
    MAX_BACKUP_AGE_HOURS: "36",
    RECOVERY_SOURCE_LABEL: "synthetic-local-test",
  };
  let created = false;
  try {
    execute(restic.executable, [...resticArgs, "init"]);
    inDatabase([
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      sourceDatabase,
      "-f",
      "/docker-entrypoint-initdb.d/20-backup-role.sql",
    ]);
    inDatabase(["createdb", "-U", "postgres", "-T", "template0", database]);
    created = true;
    const schema = inDatabase(
      [
        "pg_dump",
        "-U",
        "postgres",
        "-d",
        sourceDatabase,
        "--schema-only",
        "--no-owner",
        "--no-acl",
        "-Fc",
      ],
      { encoding: null },
    );
    inDatabase(
      [
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        database,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ],
      { input: schema },
    );
    inDatabase([
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
      "-c",
      `insert into project (id, name, type) values ('${projectId}', 'Synthetic restic project ${projectId}', 'general')`,
    ]);
    inDatabase([
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
      "-c",
      `insert into capture (id, input_type, original_content, project_id) values ('${captureId}', 'text', '${fixture}', '${projectId}')`,
    ]);
    inDatabase([
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
      "-c",
      `grant connect on database ${database} to commandry_backup`,
    ]);
    const rolePrivileges = inDatabase([
      "psql",
      "-X",
      "-A",
      "-t",
      "-U",
      "commandry_backup",
      "-d",
      database,
      "-c",
      "select has_table_privilege(current_user, 'public.capture', 'SELECT'), has_table_privilege(current_user, 'public.capture', 'INSERT')",
    ]).trim();
    assert.equal(rolePrivileges, "t|f");
    const backup = JSON.parse(
      execute(process.execPath, ["scripts/restic-postgres.mjs", "backup"], {
        env: scriptEnvironment,
      }),
    );
    assert.equal(backup.outcome, "passed");
    assert.match(backup.snapshotId, /^[0-9a-f]{64}$/);
    assert.match(backup.dumpSha256, /^[0-9a-f]{64}$/);
    const restored = JSON.parse(
      execute(
        process.execPath,
        [
          "scripts/restic-postgres.mjs",
          "verify",
          backup.snapshotId,
          backup.dumpSha256,
        ],
        { env: scriptEnvironment },
      ),
    );
    assert.equal(restored.outcome, "passed");
    assert.equal(restored.projectCount, 1);
    assert.equal(restored.captureCount, 1);
    assert.equal(restored.dumpSha256, backup.dumpSha256);
    assert.ok(restored.tableCount > 0);
    const badDigest = spawnSync(
      process.execPath,
      [
        "scripts/restic-postgres.mjs",
        "verify",
        backup.snapshotId,
        "0".repeat(64),
      ],
      { cwd: root, encoding: "utf8", env: scriptEnvironment },
    );
    assert.equal(badDigest.status, 1);
    assert.equal(JSON.parse(badDigest.stderr).reason, "RESTORE_DIGEST");
    const isolated = JSON.parse(
      execute(
        process.execPath,
        [
          "scripts/restic-isolated-restore.mjs",
          backup.snapshotId,
          backup.dumpSha256,
        ],
        { env: scriptEnvironment },
      ),
    );
    assert.equal(isolated.outcome, "passed");
    assert.equal(isolated.sourceLabel, "synthetic-local-test");
    assert.equal(isolated.projectCount, 1);
    assert.equal(isolated.captureCount, 1);
    assert.equal(isolated.webSmoke.projectRead, true);
    assert.equal(isolated.webSmoke.captureRead, true);
    assert.equal(isolated.authenticatedReadVerified, false);
    assert.equal(
      isolated.isolatedWebAuthMode,
      "off-for-read-only-restore-check",
    );
    assert.equal(isolated.networkInternal, true);
    assert.ok(["{}", "null"].includes(isolated.publishedPorts));
    assert.equal(isolated.resourcesRemoved, true);
    assert.equal(isolated.offsiteVerified, false);
    assert.ok(Date.parse(isolated.snapshotTime) > 0);
    assert.ok(isolated.snapshotAgeAtStartMs >= 0);
    assert.ok(isolated.recoveryDurationMs > 0);
    const saved = JSON.parse(await readFile(isolated.evidencePath, "utf8"));
    assert.equal(saved.id, isolated.id);
    assert.equal(saved.outcome, "passed");
    const directBundle = JSON.parse(
      execute(
        process.execPath,
        ["scripts/restic-host-bundle.mjs", "rehearse"],
        {
          env: scriptEnvironment,
        },
      ),
    );
    assert.equal(directBundle.outcome, "passed");
    assert.equal(directBundle.encryptedReadbackVerified, true);
    assert.equal(directBundle.offsiteStored, false);
    const configArchive = execute(
      restic.executable,
      [
        ...resticArgs,
        "dump",
        directBundle.configuration.snapshotId,
        "/commandry-config.tar",
      ],
      { encoding: null },
    );
    const archivePaths = execute(
      "/usr/bin/tar",
      ["--ignore-zeros", "-tf", "-"],
      {
        input: configArchive,
      },
    );
    assert.match(archivePaths, /commandry\/commandry\.env/);
    assert.match(archivePaths, /current-release/);
    assert.doesNotMatch(archivePaths, /commandry\/restic-password/);
    const extractedDirectory = resolve(directory, "restored-host-bundle");
    await mkdir(extractedDirectory, { mode: 0o700 });
    execute("/usr/bin/tar", ["-xf", "-", "-C", extractedDirectory], {
      input: configArchive,
    });
    assert.equal(
      await readFile(
        resolve(extractedDirectory, "commandry/commandry.env"),
        "utf8",
      ),
      "SYNTHETIC_CONFIG=true\n",
    );
    assert.match(
      await readFile(resolve(extractedDirectory, "current-release"), "utf8"),
      /^IMAGE=ghcr\.io\/example\/commandry@sha256:/,
    );
    const hostRecovery = JSON.parse(
      execute(
        process.execPath,
        [
          "scripts/restic-host-recovery.mjs",
          "rehearse",
          directBundle.globals.snapshotId,
          directBundle.globals.sha256,
          directBundle.configuration.snapshotId,
          directBundle.configuration.sha256,
        ],
        { env: scriptEnvironment },
      ),
    );
    assert.equal(hostRecovery.outcome, "passed");
    assert.equal(hostRecovery.globalsApplied, true);
    assert.equal(hostRecovery.backupReadMembershipVerified, true);
    assert.equal(hostRecovery.configurationExtracted, true);
    assert.equal(hostRecovery.configurationInstalled, false);
    assert.equal(hostRecovery.postgresRoleCount, 2);
    assert.equal(hostRecovery.isolatedNetwork, true);
    assert.equal(hostRecovery.resourcesRemoved, true);
    assert.equal(hostRecovery.offsiteVerified, false);
    assert.equal(hostRecovery.vpsRecoveryVerified, false);
    const passwordAlias = resolve(configDirectory, "password-alias");
    await link(passwordFile, passwordAlias);
    try {
      const linkedPassword = spawnSync(
        process.execPath,
        ["scripts/restic-host-bundle.mjs", "rehearse"],
        { cwd: root, encoding: "utf8", env: scriptEnvironment },
      );
      assert.equal(linkedPassword.status, 1);
      assert.equal(JSON.parse(linkedPassword.stderr).reason, "SOURCE_LINKS");
    } finally {
      await unlink(passwordAlias);
    }
    const gate = JSON.parse(
      execute(
        process.execPath,
        ["scripts/commandry-backup-gate.mjs", "rehearse"],
        {
          env: scriptEnvironment,
        },
      ),
    );
    assert.equal(gate.outcome, "passed");
    assert.equal(gate.mode, "local_rehearsal");
    assert.equal(gate.offsiteVerified, false);
    assert.equal(gate.isolatedRestorePassed, true);
    assert.equal(gate.receiptWritten, false);
    assert.equal(gate.hostBundle.encryptedReadbackVerified, true);
    assert.equal(gate.hostRecovery.globalsApplied, true);
    assert.equal(gate.hostRecovery.backupReadMembershipVerified, true);
    assert.equal(gate.hostRecovery.configurationExtracted, true);
    assert.equal(gate.hostRecovery.resourcesRemoved, true);
    assert.match(gate.hostBundle.globals.snapshotId, /^[0-9a-f]{64}$/);
    assert.match(gate.hostBundle.configuration.sha256, /^[0-9a-f]{64}$/);
    assert.match(gate.snapshotId, /^[0-9a-f]{64}$/);
    const bundleWrongDigest = spawnSync(
      process.execPath,
      [
        "scripts/restic-host-bundle.mjs",
        "verify-rehearse",
        gate.hostBundle.globals.snapshotId,
        "0".repeat(64),
        gate.hostBundle.configuration.snapshotId,
        gate.hostBundle.configuration.sha256,
      ],
      { cwd: root, encoding: "utf8", env: scriptEnvironment },
    );
    assert.equal(bundleWrongDigest.status, 1);
    assert.equal(
      JSON.parse(bundleWrongDigest.stderr).reason,
      "READBACK_DIGEST",
    );
    const gateEvidence = JSON.parse(
      await readFile(gate.restoreEvidencePath, "utf8"),
    );
    assert.equal(gateEvidence.outcome, "passed");
    assert.equal(gateEvidence.sourceLabel, "synthetic-local-gate");
    assert.equal(gateEvidence.offsiteVerified, false);
    assert.equal(gateEvidence.resourcesRemoved, true);
    const statusDir = resolve(directory, "scheduled-status");
    await mkdir(statusDir, { mode: 0o700 });
    const scheduledEnvironment = {
      ...scriptEnvironment,
      COMMANDRY_BACKUP_STATUS_DIR: statusDir,
    };
    const scheduled = JSON.parse(
      execute(
        process.execPath,
        ["scripts/commandry-scheduled-backup.mjs", "rehearse"],
        { env: scheduledEnvironment },
      ),
    );
    assert.equal(scheduled.outcome, "passed");
    assert.equal(scheduled.schemaVersion, 2);
    assert.equal(scheduled.sourceLabel, "synthetic-local-rehearsal");
    assert.equal(scheduled.repositoryCheckPassed, true);
    assert.equal(scheduled.retainedSnapshotVerified, true);
    assert.equal(scheduled.hostBundle.encryptedReadbackVerified, true);
    assert.match(scheduled.hostBundle.globals.snapshotId, /^[0-9a-f]{64}$/);
    assert.match(
      scheduled.hostBundle.configuration.snapshotId,
      /^[0-9a-f]{64}$/,
    );
    assert.equal(scheduled.offsiteStored, false);
    assert.equal(scheduled.restoreVerified, false);
    assert.deepEqual(scheduled.retentionApplied, {
      last: 3,
      daily: 7,
      weekly: 4,
      monthly: 3,
    });
    assert.match(scheduled.snapshotId, /^[0-9a-f]{64}$/);
    const lastSuccessPath = resolve(statusDir, "backup-last-success.json");
    const lastAttemptPath = resolve(statusDir, "backup-last-attempt.json");
    const lastSuccess = JSON.parse(await readFile(lastSuccessPath, "utf8"));
    assert.deepEqual(lastSuccess, scheduled);
    assert.equal((await stat(lastSuccessPath)).mode & 0o777, 0o600);
    const healthy = JSON.parse(
      execute(
        process.execPath,
        ["scripts/commandry-backup-health.mjs", "health-rehearse"],
        { env: scheduledEnvironment },
      ),
    );
    assert.equal(healthy.status, "healthy");
    assert.equal(healthy.offsiteStored, false);
    assert.equal(healthy.restoreVerified, false);
    const monthly = JSON.parse(
      execute(
        process.execPath,
        ["scripts/commandry-monthly-restore.mjs", "monthly-rehearse"],
        { env: scheduledEnvironment },
      ),
    );
    assert.equal(monthly.outcome, "passed");
    assert.equal(monthly.schemaVersion, 3);
    assert.equal(monthly.sourceLabel, "synthetic-local-monthly");
    assert.equal(monthly.snapshotId, scheduled.snapshotId);
    assert.equal(monthly.isolatedRestorePassed, true);
    assert.equal(monthly.offsiteVerified, false);
    assert.equal(monthly.authenticatedReadVerified, false);
    assert.equal(monthly.vpsRecoveryVerified, false);
    assert.equal(monthly.hostBundle.encryptedReadbackVerified, true);
    assert.equal(monthly.hostRecovery.globalsApplied, true);
    assert.equal(monthly.hostRecovery.backupReadMembershipVerified, true);
    assert.equal(monthly.hostRecovery.configurationExtracted, true);
    assert.equal(monthly.hostRecovery.resourcesRemoved, true);
    const monthlySuccessPath = resolve(
      statusDir,
      "backup-monthly-last-success.json",
    );
    assert.equal((await stat(monthlySuccessPath)).mode & 0o777, 0o600);
    assert.deepEqual(
      JSON.parse(await readFile(monthlySuccessPath, "utf8")),
      monthly,
    );
    await writeFile(
      lastAttemptPath,
      `${JSON.stringify({ ...scheduled, outcome: "running", completedAt: null })}\n`,
    );
    const inProgress = JSON.parse(
      execute(
        process.execPath,
        ["scripts/commandry-backup-health.mjs", "health-rehearse"],
        { env: scheduledEnvironment },
      ),
    );
    assert.equal(inProgress.status, "in_progress");
    await writeFile(
      lastAttemptPath,
      `${JSON.stringify({
        ...scheduled,
        outcome: "running",
        completedAt: null,
        startedAt: new Date(Date.now() - 91 * 60_000).toISOString(),
      })}\n`,
    );
    const interruptedHealth = spawnSync(
      process.execPath,
      ["scripts/commandry-backup-health.mjs", "health-rehearse"],
      { cwd: root, encoding: "utf8", env: scheduledEnvironment },
    );
    assert.equal(interruptedHealth.status, 1);
    assert.equal(
      JSON.parse(interruptedHealth.stderr).reason,
      "ATTEMPT_STALLED",
    );
    await writeFile(lastAttemptPath, `${JSON.stringify(scheduled)}\n`);
    const rejectedPolicy = spawnSync(
      process.execPath,
      ["scripts/commandry-scheduled-backup.mjs", "rehearse"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...scheduledEnvironment, RETENTION_DAILY: "0" },
      },
    );
    assert.equal(rejectedPolicy.status, 1);
    assert.equal(JSON.parse(rejectedPolicy.stderr).reason, "BACKUP_POLICY");
    const scheduledFailure = spawnSync(
      process.execPath,
      ["scripts/commandry-scheduled-backup.mjs", "rehearse"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...scheduledEnvironment,
          RESTIC_REPOSITORY: "/tmp/outside-commandry-test",
        },
      },
    );
    assert.equal(scheduledFailure.status, 1);
    assert.equal(
      JSON.parse(scheduledFailure.stderr).reason,
      "LOCAL_REHEARSAL_CONFIG",
    );
    assert.equal(
      JSON.parse(await readFile(lastAttemptPath, "utf8")).outcome,
      "failed",
    );
    const failedDatabase = spawnSync(
      process.execPath,
      ["scripts/commandry-scheduled-backup.mjs", "rehearse"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...scheduledEnvironment,
          DB_NAME: "commandry_nonexistent_backup_test",
        },
      },
    );
    assert.equal(failedDatabase.status, 1);
    assert.equal(JSON.parse(failedDatabase.stderr).reason, "BACKUP_FAILED");
    assert.equal(
      JSON.parse(await readFile(lastAttemptPath, "utf8")).phase,
      "BACKUP",
    );
    const failedHealth = spawnSync(
      process.execPath,
      ["scripts/commandry-backup-health.mjs", "health-rehearse"],
      { cwd: root, encoding: "utf8", env: scheduledEnvironment },
    );
    assert.equal(failedHealth.status, 1);
    assert.equal(JSON.parse(failedHealth.stderr).reason, "LAST_ATTEMPT_FAILED");
    assert.deepEqual(
      JSON.parse(await readFile(lastSuccessPath, "utf8")),
      scheduled,
    );
    const stale = {
      ...scheduled,
      completedAt: new Date(Date.now() - 37 * 60 * 60_000).toISOString(),
    };
    await writeFile(lastSuccessPath, `${JSON.stringify(stale)}\n`);
    await writeFile(lastAttemptPath, `${JSON.stringify(stale)}\n`);
    const staleHealth = spawnSync(
      process.execPath,
      ["scripts/commandry-backup-health.mjs", "health-rehearse"],
      { cwd: root, encoding: "utf8", env: scheduledEnvironment },
    );
    assert.equal(staleHealth.status, 1);
    assert.equal(JSON.parse(staleHealth.stderr).reason, "BACKUP_STALE");
    const staleMonthly = spawnSync(
      process.execPath,
      ["scripts/commandry-monthly-restore.mjs", "monthly-rehearse"],
      { cwd: root, encoding: "utf8", env: scheduledEnvironment },
    );
    assert.equal(staleMonthly.status, 1);
    assert.equal(JSON.parse(staleMonthly.stderr).reason, "BACKUP_STALE");
    assert.deepEqual(
      JSON.parse(await readFile(monthlySuccessPath, "utf8")),
      monthly,
    );
    const absent = (args) =>
      spawnSync(runtime.command, [...runtime.prefix, ...args], {
        cwd: root,
        stdio: "ignore",
      }).status !== 0;
    assert.ok(absent(["inspect", isolated.resources.web]));
    assert.ok(absent(["inspect", isolated.resources.postgres]));
    assert.ok(absent(["network", "inspect", isolated.resources.network]));
    assert.ok(absent(["volume", "inspect", isolated.resources.volume]));
    const isolatedBadDigest = spawnSync(
      process.execPath,
      [
        "scripts/restic-isolated-restore.mjs",
        backup.snapshotId,
        "0".repeat(64),
      ],
      { cwd: root, encoding: "utf8", env: scriptEnvironment },
    );
    assert.equal(isolatedBadDigest.status, 1);
    const rejected = JSON.parse(isolatedBadDigest.stderr);
    assert.equal(rejected.failureCode, "RESTORE_DIGEST");
    assert.equal(rejected.resourcesRemoved, true);
    assert.ok(absent(["inspect", rejected.resources.postgres]));
    assert.ok(absent(["network", "inspect", rejected.resources.network]));
    assert.ok(absent(["volume", "inspect", rejected.resources.volume]));
    const residualDatabases = inDatabase([
      "psql",
      "-X",
      "-A",
      "-t",
      "-U",
      "postgres",
      "-d",
      sourceDatabase,
      "-c",
      "select count(*) from pg_database where datname like 'commandry_restore_%'",
    ]).trim();
    assert.equal(residualDatabases, "0");
  } finally {
    if (created) {
      inDatabase([
        "dropdb",
        "-U",
        "postgres",
        "--if-exists",
        "--force",
        database,
      ]);
    }
    await rm(directory, { recursive: true, force: true });
  }
});
