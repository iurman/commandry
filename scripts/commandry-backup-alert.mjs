import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { trustedSource } from "./host-backup-config.mjs";
import {
  atomicStatus,
  readStatus,
  validateStatusDirectory,
} from "./host-backup-status.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];
const production = mode === "alert";
const environment = production ? "production" : "local";
const stateName = "backup-alert-state.json";
const attemptName = "backup-alert-last-attempt.json";

function fail(code, details = {}) {
  throw Object.assign(new Error(code), details);
}

function privateFile(path, uid, boundary) {
  if (!isAbsolute(path) || !resolve(path).startsWith(boundary))
    fail("ALERT_PRIVATE_FILE");
  const entry = lstatSync(path);
  if (
    !entry.isFile() ||
    entry.uid !== uid ||
    (entry.mode & 0o777) !== 0o600 ||
    entry.size < 1 ||
    entry.size > 4096 ||
    !realpathSync(path).startsWith(boundary)
  )
    fail("ALERT_PRIVATE_FILE");
  return readFileSync(path, "utf8");
}

function configuration(path, uid, boundary) {
  const values = {};
  const allowed = new Set(["WEBHOOK_URL", "BEARER_TOKEN_FILE"]);
  for (const raw of privateFile(path, uid, boundary).split("\n")) {
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
      fail("ALERT_CONFIG");
    values[key] = value;
  }
  if ([...allowed].some((key) => !values[key])) fail("ALERT_CONFIG");
  let url;
  try {
    url = new URL(values.WEBHOOK_URL);
  } catch {
    fail("ALERT_URL");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (production
      ? url.protocol !== "https:"
      : url.protocol !== "http:" || url.hostname !== "127.0.0.1")
  )
    fail("ALERT_URL");
  const token = privateFile(values.BEARER_TOKEN_FILE, uid, boundary).trim();
  if (!/^[A-Za-z0-9._~-]{16,256}$/.test(token)) fail("ALERT_TOKEN");
  return { url: url.toString(), token };
}

function backupHealth() {
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "scripts/commandry-backup-health.mjs"),
      production ? "health" : "health-rehearse",
    ],
    { encoding: "utf8", timeout: 10_000, maxBuffer: 8192 },
  );
  if (result.error || ![0, 1].includes(result.status))
    fail("HEALTH_CHECK_FAILED");
  let record;
  try {
    record = JSON.parse(
      (result.status === 0 ? result.stdout : result.stderr).trim(),
    );
  } catch {
    fail("HEALTH_CHECK_FAILED");
  }
  if (
    record?.kind !== "commandry_backup_health" ||
    record.environment !== environment ||
    (result.status === 0 &&
      !["healthy", "in_progress"].includes(record.status)) ||
    (result.status === 1 &&
      (record.status !== "unhealthy" || !/^[A-Z_]+$/.test(record.reason ?? "")))
  )
    fail("HEALTH_CHECK_FAILED");
  return record;
}

function previousState(directory, uid) {
  if (!existsSync(resolve(directory, stateName)))
    return { sequence: 0, activeReason: null, lastDeliveredAt: null };
  const state = readStatus(directory, stateName, uid);
  if (
    state.kind !== "commandry_backup_alert_state" ||
    state.schemaVersion !== 1 ||
    state.environment !== environment ||
    !Number.isSafeInteger(state.sequence) ||
    state.sequence < 1 ||
    (state.activeReason !== null &&
      !/^[A-Z_]+$/.test(state.activeReason ?? "")) ||
    !Number.isFinite(Date.parse(state.lastDeliveredAt))
  )
    fail("ALERT_STATE");
  return state;
}

function audit(directory, record) {
  atomicStatus(directory, attemptName, {
    kind: "commandry_backup_alert_attempt",
    schemaVersion: 1,
    environment,
    simulated: !production,
    at: new Date().toISOString(),
    ...record,
  });
}

async function run() {
  if (
    Number(process.versions.node.split(".")[0]) !== 24 ||
    process.argv.length !== 3
  )
    fail("INVOCATION");
  let directory;
  let configPath;
  let boundary;
  let uid;
  if (production) {
    if (process.getuid?.() !== 0) fail("INVOCATION");
    for (const path of [root, resolve(root, "scripts")])
      trustedSource(path, true);
    for (const script of [
      "commandry-backup-alert.mjs",
      "commandry-backup-health.mjs",
      "host-backup-config.mjs",
      "host-backup-status.mjs",
      "r2-repository.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    directory = "/var/lib/commandry";
    configPath = "/etc/commandry/alert.env";
    boundary = "/etc/commandry/";
    uid = 0;
  } else if (mode === "alert-rehearse") {
    boundary = realpathSync(resolve(root, ".agent")) + sep;
    directory = process.env.COMMANDRY_BACKUP_STATUS_DIR;
    configPath = process.env.COMMANDRY_ALERT_CONFIG;
    if (
      !directory ||
      !configPath ||
      !resolve(directory).startsWith(boundary) ||
      !resolve(configPath).startsWith(boundary) ||
      !realpathSync(directory).startsWith(boundary)
    )
      fail("LOCAL_ALERT_DIRECTORY");
    uid = process.getuid?.();
  } else {
    fail("INVOCATION");
  }
  validateStatusDirectory(directory, uid);
  const { url, token } = configuration(configPath, uid, boundary);
  const health = backupHealth();
  const prior = previousState(directory, uid);
  const condition =
    health.status === "unhealthy"
      ? "firing"
      : health.status === "healthy" && prior.activeReason
        ? "resolved"
        : null;
  const reason = condition === "resolved" ? prior.activeReason : health.reason;
  if (!condition || (condition === "firing" && prior.activeReason === reason)) {
    console.log(
      JSON.stringify({
        kind: "commandry_backup_alert",
        outcome: "skipped",
        simulated: !production,
      }),
    );
    return;
  }
  const sequence = prior.sequence + 1;
  const eventId = createHash("sha256")
    .update(
      `commandry-backup:${environment}:${sequence}:${condition}:${reason}`,
    )
    .digest("hex");
  const payload = {
    kind: "commandry_backup_alert",
    schemaVersion: 1,
    eventId,
    condition,
    reason,
    environment,
    simulated: !production,
    sourceLabel: production
      ? "Commandry VPS offsite backup health"
      : "Synthetic local backup health rehearsal",
    checkedAt: health.checkedAt,
  };
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-commandry-event-id": eventId,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    audit(directory, {
      outcome: "failed",
      eventId,
      condition,
      reason,
      failure: "DELIVERY_FAILED",
    });
    fail("DELIVERY_FAILED", { eventId, condition });
  }
  if (!response.ok) {
    audit(directory, {
      outcome: "failed",
      eventId,
      condition,
      reason,
      failure: "HTTP_REJECTED",
      httpStatus: response.status,
    });
    fail("HTTP_REJECTED", { eventId, condition });
  }
  const deliveredAt = new Date().toISOString();
  atomicStatus(directory, stateName, {
    kind: "commandry_backup_alert_state",
    schemaVersion: 1,
    environment,
    sequence,
    activeReason: condition === "firing" ? reason : null,
    lastDeliveredAt: deliveredAt,
  });
  audit(directory, { outcome: "delivered", eventId, condition, reason });
  console.log(
    JSON.stringify({
      kind: "commandry_backup_alert",
      outcome: "delivered",
      eventId,
      condition,
      simulated: !production,
    }),
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      kind: "commandry_backup_alert",
      outcome: "failed",
      simulated: !production,
      eventId: /^[0-9a-f]{64}$/.test(error?.eventId ?? "")
        ? error.eventId
        : undefined,
      condition: ["firing", "resolved"].includes(error?.condition)
        ? error.condition
        : undefined,
      reason: /^[A-Z_]+$/.test(error?.message ?? "")
        ? error.message
        : "ALERT_FAILED",
    }),
  );
  process.exitCode = 1;
});
