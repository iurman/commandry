import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve(
  import.meta.dirname,
  "../deploy/commandry-backup-configure.sh",
);
const accountId = "86b423adc3fb0269c3f4a708c9c7faed";
const accessKey = "SYNTHETIC_ACCESS_KEY_1234567890";
const secretKey = "SYNTHETIC_SECRET_KEY_12345678901234567890";
const resticPassword = "SYNTHETIC_RESTIC_PASSWORD_12345678901234567890";
const input =
  [
    "CONFIGURE",
    accessKey,
    secretKey,
    resticPassword,
    resticPassword,
    "7",
    "30",
    "12",
    "6",
    "36",
  ].join("\n") + "\n";

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "commandry-backup-configure-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".commandry-backup-configure-fixture"), "\n", {
    mode: 0o600,
  });
  for (const path of ["etc/commandry", "var/lib/commandry"])
    mkdirSync(join(root, path), { recursive: true, mode: 0o700 });
  chmodSync(join(root, "etc/commandry"), 0o700);
  chmodSync(join(root, "var/lib/commandry"), 0o700);
  return root;
}

function run(root, content = input, inherited = {}) {
  const result = spawnSync("bash", [script, "--test-root", root], {
    encoding: "utf8",
    input: content,
    env: { PATH: process.env.PATH, ...inherited },
  });
  for (const value of [accessKey, secretKey, resticPassword])
    assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
  return result;
}

function audit(root) {
  const files = readdirSync(join(root, "var/lib/commandry")).filter((file) =>
    file.startsWith("backup-configure-event."),
  );
  assert.equal(files.length, 1);
  const path = join(root, "var/lib/commandry", files[0]);
  assert.equal(lstatSync(path).mode & 0o777, 0o600);
  const raw = readFileSync(path, "utf8");
  for (const value of [accessKey, secretKey, resticPassword])
    assert.ok(!raw.includes(value));
  return JSON.parse(raw);
}

test("synthetic intake saves private fixed R2 configuration and a metadata-only event", (t) => {
  const root = setup(t);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const configPath = join(root, "etc/commandry/backup.env");
  const passwordPath = join(root, "etc/commandry/restic-password");
  assert.equal(lstatSync(configPath).mode & 0o777, 0o600);
  assert.equal(lstatSync(passwordPath).mode & 0o777, 0o600);
  assert.equal(readFileSync(passwordPath, "utf8"), `${resticPassword}\n`);
  assert.equal(
    readFileSync(configPath, "utf8"),
    [
      "DB_NAME=commandry",
      `RESTIC_REPOSITORY=s3:https://${accountId}.r2.cloudflarestorage.com/commandry-backups/production`,
      `RESTIC_PASSWORD_FILE=${passwordPath}`,
      `AWS_ACCESS_KEY_ID=${accessKey}`,
      `AWS_SECRET_ACCESS_KEY=${secretKey}`,
      "RETENTION_LAST=7",
      "RETENTION_DAILY=30",
      "RETENTION_WEEKLY=12",
      "RETENTION_MONTHLY=6",
      "MAX_BACKUP_AGE_HOURS=36",
      "",
    ].join("\n"),
  );
  assert.deepEqual(readdirSync(join(root, "etc/commandry")).sort(), [
    "backup.env",
    "restic-password",
  ]);
  const event = audit(root);
  assert.match(event.occurredAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.deepEqual(
    { ...event, occurredAt: null },
    {
      schemaVersion: 1,
      occurredAt: null,
      operation: "commandry.host.backup.configure",
      capability: "commandry.host.backup.configure",
      risk: "sensitive",
      actor: "local-test-fixture",
      approval: "synthetic-fixture-confirmation",
      sourceLabel: "synthetic-test-root",
      target: "commandry-backups/production",
      outcome: "configured",
      verification: "synthetic-input-validated",
      containsSecrets: false,
    },
  );
});

test("existing backup configuration is never overwritten", (t) => {
  const root = setup(t);
  const configPath = join(root, "etc/commandry/backup.env");
  writeFileSync(configPath, "EXISTING=keep\n", { mode: 0o600 });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /refusing to overwrite/);
  assert.equal(readFileSync(configPath, "utf8"), "EXISTING=keep\n");
  assert.deepEqual(readdirSync(join(root, "etc/commandry")), ["backup.env"]);
});

test("malformed input rolls back private files and records only metadata", (t) => {
  for (const malformed of [
    input.replace("\n7\n30\n", "\n0\n30\n"),
    input.replace(
      `${resticPassword}\n${resticPassword}\n`,
      `${resticPassword}\nWRONG_PASSWORD\n`,
    ),
    input.replace(`${secretKey}\n`, "short\n"),
  ]) {
    const root = setup(t);
    const result = run(root, malformed);
    assert.equal(result.status, 1);
    assert.deepEqual(readdirSync(join(root, "etc/commandry")), []);
    assert.equal(audit(root).outcome, "failed");
  }
});

test("signals between hard links and bookkeeping leave only a failed audit event", (t) => {
  for (const stage of [
    "after-password-link",
    "after-config-link",
    "after-audit-link",
  ]) {
    const root = setup(t);
    writeFileSync(join(root, `.interrupt-${stage}`), "\n", { mode: 0o600 });
    const result = run(root);
    assert.equal(result.status, 143, `${stage}: ${result.stderr}`);
    assert.deepEqual(readdirSync(join(root, "etc/commandry")), []);
    const event = audit(root);
    assert.equal(event.outcome, "failed");
    assert.equal(event.verification, "rolled-back");
    assert.deepEqual(
      readdirSync(join(root, "var/lib/commandry")).filter((name) =>
        name.startsWith(".backup-configure-event."),
      ),
      [],
    );
  }
});

test("inherited exported lowercase names do not carry entered secrets into child processes", (t) => {
  const root = setup(t);
  writeFileSync(join(root, ".capture-child-environment"), "\n", {
    mode: 0o600,
  });
  const inherited = {
    access_key: "EXPORTED_OLD_ACCESS_KEY_123",
    secret_key: "EXPORTED_OLD_SECRET_KEY_123",
    restic_password: "EXPORTED_OLD_RESTIC_PASSWORD_123",
    restic_password_again: "EXPORTED_OLD_RESTIC_PASSWORD_AGAIN_123",
  };
  const result = run(root, input, inherited);
  assert.equal(result.status, 0, result.stderr);
  const childEnvironment = readFileSync(
    join(root, "child-environment.bin"),
    "utf8",
  );
  for (const value of [
    accessKey,
    secretKey,
    resticPassword,
    ...Object.values(inherited),
  ]) {
    assert.ok(!childEnvironment.includes(value));
    assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
  }
  for (const name of Object.keys(inherited))
    assert.ok(!childEnvironment.includes(`${name}=`));
});

test("test mode refuses a symlinked private directory outside its fixture", (t) => {
  const root = setup(t);
  const outside = mkdtempSync(join(tmpdir(), "commandry-backup-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  rmSync(join(root, "etc/commandry"), { recursive: true });
  symlinkSync(outside, join(root, "etc/commandry"));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symlinked/);
  assert.deepEqual(readdirSync(outside), []);
});
