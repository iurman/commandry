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
const deliveryTest = ["alert-test-firing", "alert-test-resolved"].includes(
  mode,
);
const production = mode === "alert" || deliveryTest;
const simulated = !production || deliveryTest;
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
  const allowed = new Set([
    "TRANSPORT",
    "WEBHOOK_URL",
    "BEARER_TOKEN_FILE",
    "TELEGRAM_BOT_TOKEN_FILE",
    "TELEGRAM_CHAT_ID",
    "TELEGRAM_API_ORIGIN",
  ]);
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
  const transport = values.TRANSPORT ?? "webhook";
  const required =
    transport === "webhook"
      ? ["WEBHOOK_URL", "BEARER_TOKEN_FILE"]
      : transport === "telegram"
        ? [
            "TELEGRAM_BOT_TOKEN_FILE",
            "TELEGRAM_CHAT_ID",
            ...(!production ? ["TELEGRAM_API_ORIGIN"] : []),
          ]
        : null;
  if (
    !required ||
    required.some((key) => !values[key]) ||
    Object.keys(values).some(
      (key) => key !== "TRANSPORT" && !required.includes(key),
    )
  )
    fail("ALERT_CONFIG");
  if (transport === "telegram") {
    const token = privateFile(
      values.TELEGRAM_BOT_TOKEN_FILE,
      uid,
      boundary,
    ).trim();
    if (!/^[1-9][0-9]{4,15}:[A-Za-z0-9_-]{20,128}$/.test(token))
      fail("ALERT_TOKEN");
    if (
      !/^-?[1-9][0-9]{0,15}$/.test(values.TELEGRAM_CHAT_ID) ||
      !Number.isSafeInteger(Number(values.TELEGRAM_CHAT_ID))
    )
      fail("ALERT_CHAT");
    let origin = "https://api.telegram.org";
    if (!production) {
      let candidate;
      try {
        candidate = new URL(values.TELEGRAM_API_ORIGIN);
      } catch {
        fail("ALERT_URL");
      }
      if (
        candidate.protocol !== "http:" ||
        candidate.hostname !== "127.0.0.1" ||
        candidate.username ||
        candidate.password ||
        candidate.search ||
        candidate.hash ||
        candidate.pathname !== "/"
      )
        fail("ALERT_URL");
      origin = candidate.origin;
    }
    return {
      transport,
      url: `${origin}/bot${token}/sendMessage`,
      chatId: values.TELEGRAM_CHAT_ID,
    };
  }
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
  return { transport, url: url.toString(), token };
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
    simulated,
    at: new Date().toISOString(),
    ...record,
  });
}

function telegramText(payload) {
  const reasons = {
    LAST_ATTEMPT_FAILED: "The latest backup attempt failed.",
    BACKUP_STALE:
      "The last verified backup is older than the configured limit.",
    ATTEMPT_STALLED: "A backup attempt exceeded its allowed running time.",
    DELIVERY_TEST: "Delivery test only. No actual backup has failed.",
  };
  const title = `${payload.simulated ? "TEST: " : ""}Commandry backup ${payload.condition === "resolved" ? "recovered" : "needs attention"}`;
  return [
    title,
    payload.condition === "resolved" && payload.reason !== "DELIVERY_TEST"
      ? "Backup health is healthy again."
      : (reasons[payload.reason] ??
        `Backup health could not be confirmed (${payload.reason}).`),
    `Checked: ${payload.checkedAt}`,
    "https://commandry.site",
  ].join("\n");
}

async function telegramReceipt(response, chatId) {
  const reader = response.body?.getReader();
  if (!reader) fail("PROVIDER_RESPONSE_INVALID");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        fail("PROVIDER_RESPONSE_INVALID");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    body?.ok !== true ||
    !Number.isSafeInteger(body.result?.message_id) ||
    body.result.message_id < 1 ||
    String(body.result.chat?.id) !== chatId
  )
    fail("PROVIDER_RESPONSE_INVALID");
  return body.result.message_id;
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
    directory = deliveryTest
      ? "/var/lib/commandry/backup-alert-delivery-test"
      : "/var/lib/commandry";
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
  const config = configuration(configPath, uid, boundary);
  const health = deliveryTest
    ? {
        status: mode === "alert-test-firing" ? "unhealthy" : "healthy",
        reason: "DELIVERY_TEST",
        checkedAt: new Date().toISOString(),
      }
    : backupHealth();
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
        simulated,
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
    simulated,
    sourceLabel: deliveryTest
      ? "Commandry backup alert delivery test; no actual backup failure"
      : production
        ? "Commandry VPS offsite backup health"
        : "Synthetic local backup health rehearsal",
    checkedAt: health.checkedAt,
  };
  const request =
    config.transport === "telegram"
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: config.chatId,
            text: telegramText(payload),
            link_preview_options: { is_disabled: true },
          }),
        }
      : {
          headers: {
            authorization: `Bearer ${config.token}`,
            "content-type": "application/json",
            "x-commandry-event-id": eventId,
          },
          body: JSON.stringify(payload),
        };
  let response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      ...request,
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
  let providerMessageId;
  if (config.transport === "telegram") {
    try {
      providerMessageId = await telegramReceipt(response, config.chatId);
    } catch {
      audit(directory, {
        outcome: "failed",
        eventId,
        condition,
        reason,
        transport: config.transport,
        failure: "PROVIDER_RESPONSE_INVALID",
      });
      fail("PROVIDER_RESPONSE_INVALID", { eventId, condition });
    }
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
  audit(directory, {
    outcome: "delivered",
    eventId,
    condition,
    reason,
    transport: config.transport,
    providerMessageId,
  });
  console.log(
    JSON.stringify({
      kind: "commandry_backup_alert",
      outcome: "delivered",
      eventId,
      condition,
      simulated,
    }),
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      kind: "commandry_backup_alert",
      outcome: "failed",
      simulated,
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
