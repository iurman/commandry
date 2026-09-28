import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const token = "SYNTHETIC_BACKUP_ALERT_TOKEN_123456";
const snapshotId = "a".repeat(64);
const digest = "b".repeat(64);

function privateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function statuses(directory, outcome) {
  const completedAt = new Date().toISOString();
  const base = {
    kind: "commandry_scheduled_backup",
    schemaVersion: 2,
    environment: "local",
    snapshotId,
    dumpSha256: digest,
    offsiteStored: false,
    completedAt,
  };
  privateJson(resolve(directory, "backup-last-success.json"), {
    ...base,
    outcome: "passed",
    repositoryCheckPassed: true,
    retainedSnapshotVerified: true,
    hostBundle: {
      encryptedReadbackVerified: true,
      globals: { snapshotId, sha256: digest },
      configuration: { snapshotId, sha256: digest },
    },
  });
  privateJson(resolve(directory, "backup-last-attempt.json"), {
    ...base,
    outcome,
  });
}

async function runAlert(environment) {
  const child = spawn(
    process.execPath,
    ["scripts/commandry-backup-alert.mjs", "alert-rehearse"],
    { cwd: root, env: { ...process.env, ...environment } },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (value) => {
    stdout += value;
  });
  child.stderr.setEncoding("utf8").on("data", (value) => {
    stderr += value;
  });
  const status = await new Promise((accept, reject) => {
    child.on("error", reject);
    child.on("close", accept);
  });
  return { status, stdout, stderr };
}

test("synthetic backup alert sends once, retries rejection, and resolves", async () => {
  mkdirSync(resolve(root, ".agent"), { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(resolve(root, ".agent/backup-alert-test-"));
  const received = [];
  let responseStatus = 200;
  const server = createServer(async (request, response) => {
    const parts = [];
    for await (const part of request) parts.push(part);
    received.push({
      authorization: request.headers.authorization,
      eventId: request.headers["x-commandry-event-id"],
      body: JSON.parse(Buffer.concat(parts).toString("utf8")),
    });
    response.writeHead(responseStatus);
    response.end("synthetic receiver");
  });
  try {
    await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
    statuses(directory, "passed");
    const tokenPath = resolve(directory, "alert-token");
    const configPath = resolve(directory, "alert.env");
    writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
    writeFileSync(
      configPath,
      `WEBHOOK_URL=http://127.0.0.1:${server.address().port}/backup\nBEARER_TOKEN_FILE=${tokenPath}\n`,
      { mode: 0o600 },
    );
    const environment = {
      COMMANDRY_BACKUP_STATUS_DIR: directory,
      COMMANDRY_ALERT_CONFIG: configPath,
      RETENTION_LAST: "1",
      RETENTION_DAILY: "1",
      RETENTION_WEEKLY: "1",
      RETENTION_MONTHLY: "1",
      MAX_BACKUP_AGE_HOURS: "24",
    };
    const healthy = await runAlert(environment);
    assert.equal(healthy.status, 0, healthy.stderr);
    assert.equal(JSON.parse(healthy.stdout).outcome, "skipped");
    assert.equal(received.length, 0);

    statuses(directory, "failed");
    const firing = await runAlert(environment);
    assert.equal(firing.status, 0, firing.stderr);
    assert.equal(received.length, 1);
    assert.equal(received[0].authorization, `Bearer ${token}`);
    assert.equal(received[0].body.condition, "firing");
    assert.equal(received[0].body.reason, "LAST_ATTEMPT_FAILED");
    assert.equal(received[0].body.simulated, true);
    assert.match(received[0].body.sourceLabel, /Synthetic local/);
    assert.equal(received[0].body.eventId, received[0].eventId);
    assert.equal(
      statSync(resolve(directory, "backup-alert-state.json")).mode & 0o777,
      0o600,
    );
    assert.equal((await runAlert(environment)).status, 0);
    assert.equal(received.length, 1);
    assert.equal(
      JSON.parse(
        readFileSync(
          resolve(directory, "backup-alert-last-attempt.json"),
          "utf8",
        ),
      ).outcome,
      "delivered",
    );

    statuses(directory, "passed");
    responseStatus = 503;
    const rejected = await runAlert(environment);
    assert.equal(rejected.status, 1);
    assert.equal(JSON.parse(rejected.stderr).reason, "HTTP_REJECTED");
    assert.equal(JSON.parse(rejected.stderr).eventId, received[1].eventId);
    assert.doesNotMatch(rejected.stderr, /SYNTHETIC_BACKUP_ALERT_TOKEN/);
    assert.equal(received.length, 2);
    assert.equal(received[1].body.condition, "resolved");
    assert.equal(
      JSON.parse(
        readFileSync(resolve(directory, "backup-alert-state.json"), "utf8"),
      ).activeReason,
      "LAST_ATTEMPT_FAILED",
    );
    responseStatus = 200;
    const resolved = await runAlert(environment);
    assert.equal(resolved.status, 0, resolved.stderr);
    assert.equal(received.length, 3);
    assert.equal(received[2].body.condition, "resolved");
    assert.equal(received[2].eventId, received[1].eventId);

    statuses(directory, "failed");
    assert.equal((await runAlert(environment)).status, 0);
    assert.equal(received.length, 4);
    assert.notEqual(received[3].eventId, received[0].eventId);
    assert.equal(received[3].body.condition, "firing");

    writeFileSync(
      configPath,
      `WEBHOOK_URL=http://example.com/backup\nBEARER_TOKEN_FILE=${tokenPath}\n`,
      { mode: 0o600 },
    );
    const untrustedUrl = await runAlert(environment);
    assert.equal(untrustedUrl.status, 1);
    assert.equal(JSON.parse(untrustedUrl.stderr).reason, "ALERT_URL");
    assert.equal(received.length, 4);
    assert.doesNotMatch(
      untrustedUrl.stdout + untrustedUrl.stderr,
      /example\.com|SYNTHETIC_BACKUP_ALERT_TOKEN/,
    );
    writeFileSync(
      configPath,
      `WEBHOOK_URL=http://127.0.0.1:${server.address().port}/backup\nBEARER_TOKEN_FILE=${tokenPath}\n`,
      { mode: 0o600 },
    );
    chmodSync(tokenPath, 0o644);
    const untrustedToken = await runAlert(environment);
    assert.equal(untrustedToken.status, 1);
    assert.equal(
      JSON.parse(untrustedToken.stderr).reason,
      "ALERT_PRIVATE_FILE",
    );
    assert.equal(received.length, 4);
  } finally {
    await new Promise((accept) => server.close(accept));
    rmSync(directory, { recursive: true, force: true });
  }
});
