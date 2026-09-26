import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function freeLoopbackPort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not allocate a loopback port");
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}

async function runTests(connectionString, runtimePassword, testPath) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--test", testPath],
    {
      cwd: root,
      env: {
        ...process.env,
        COMMANDRY_TEST_DATABASE_URL: connectionString,
        COMMANDRY_TEST_RUNTIME_PASSWORD: runtimePassword,
      },
      stdio: "inherit",
    },
  );
  const [code, signal] = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, exitSignal) =>
      resolveExit([exitCode, exitSignal]),
    );
  });
  if (code !== 0)
    throw new Error(`Integration tests exited with ${signal ?? code}`);
}

function startService(name, entrypoint, environment) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const service = { name, child, tail: "", error: null };
  const append = (chunk) => {
    service.tail = (service.tail + chunk.toString()).slice(-4_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("error", (error) => {
    service.error = error;
  });
  return service;
}

async function stopService(service) {
  if (!service || !service.child.pid || service.child.exitCode !== null) return;
  const exited = new Promise((resolveExit) =>
    service.child.once("exit", resolveExit),
  );
  service.child.kill("SIGTERM");
  await Promise.race([
    exited,
    delay(5_000).then(async () => {
      if (service.child.exitCode === null) service.child.kill("SIGKILL");
      await exited;
    }),
  ]);
}

async function waitForReady(url, services) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    for (const service of services) {
      if (service.error || service.child.exitCode !== null) {
        throw new Error(
          `${service.name} exited before readiness: ${service.tail}`,
        );
      }
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The web process may still be starting.
    }
    await delay(150);
  }
  throw new Error(
    `Web readiness timed out: ${services.map((service) => service.tail).join("\n")}`,
  );
}

async function runSmoke(postgres, adminUrl, runtimePassword) {
  const webEntry = join(root, "apps/web/.next/standalone/apps/web/server.js");
  const workerEntry = join(root, "apps/worker/dist/index.js");
  for (const entry of [webEntry, workerEntry]) {
    if (!existsSync(entry))
      throw new Error(
        `Build artifact is missing: ${entry}. Run pnpm build first.`,
      );
  }

  const webPort = await freeLoopbackPort();
  const runtimeUrl = new URL(adminUrl);
  runtimeUrl.username = "commandry_app_integration";
  runtimeUrl.password = runtimePassword;
  const environment = {
    NODE_ENV: "production",
    APP_ENV: "test",
    APP_ORIGIN: `http://127.0.0.1:${webPort}`,
    DATABASE_URL: runtimeUrl.toString(),
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    APP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    RELEASE_SHA: "integration-smoke",
    DB_POOL_MAX: "2",
    BOSS_POOL_MAX: "3",
  };
  const services = [];
  try {
    services.push(startService("worker", workerEntry, environment));
    services.push(
      startService("web", webEntry, {
        ...environment,
        PORT: String(webPort),
        HOSTNAME: "127.0.0.1",
      }),
    );

    const origin = environment.APP_ORIGIN;
    await waitForReady(`${origin}/health/ready`, services);
    const live = await fetch(`${origin}/health/live`);
    assert.equal(live.status, 200);

    const key = `smoke-${randomBytes(8).toString("hex")}`;
    async function submit() {
      const response = await fetch(`${origin}/api/v1/synthetic-runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key }),
      });
      assert.equal(response.status, 202);
      return response.json();
    }
    const first = await submit();
    const repeated = await submit();
    assert.equal(repeated.id, first.id);

    let completed;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const response = await fetch(
        `${origin}/api/v1/synthetic-runs/${first.id}`,
      );
      assert.equal(response.status, 200);
      completed = await response.json();
      if (completed.state === "succeeded") break;
      if (completed.state === "failed")
        throw new Error(`Worker reported failure for ${first.id}`);
      for (const service of services) {
        if (service.error || service.child.exitCode !== null) {
          throw new Error(
            `${service.name} exited during processing: ${service.tail}`,
          );
        }
      }
      await delay(150);
    }
    assert.equal(
      completed?.state,
      "succeeded",
      `Worker did not finish: ${services[0]?.tail}`,
    );
    assert.equal(completed.attempts, 1);
    assert.equal(completed.result, `Processed synthetic:v1:${key}`);

    const client = postgres.getPgClient("commandry_integration", "127.0.0.1");
    await client.connect();
    try {
      const resourceIds = [randomUUID(), randomUUID()].sort();
      for (const [index, id] of resourceIds.entries()) {
        await client.query(
          "INSERT INTO resource (id, kind, name) VALUES ($1, $2, $3)",
          [id, "synthetic", `Smoke resource ${index + 1}`],
        );
      }
      const firstPage = await fetch(`${origin}/api/v1/resources?limit=1`);
      assert.equal(firstPage.status, 200);
      const firstResources = await firstPage.json();
      assert.equal(firstResources.items.length, 1);
      assert.equal(firstResources.nextCursor, firstResources.items[0].id);
      const secondPage = await fetch(
        `${origin}/api/v1/resources?limit=1&cursor=${firstResources.nextCursor}`,
      );
      assert.equal(secondPage.status, 200);
      const secondResources = await secondPage.json();
      assert.equal(secondResources.items.length, 1);
      assert.notEqual(secondResources.items[0].id, firstResources.items[0].id);
      for (const id of resourceIds) {
        const resourceResponse = await fetch(
          `${origin}/api/v1/resources/${id}`,
        );
        assert.equal(resourceResponse.status, 200);
      }

      const result = await client.query(
        "SELECT (SELECT count(*) FROM synthetic_run_effect WHERE run_id = $1) AS effects, (SELECT count(*) FROM audit_event WHERE target_run_id = $1 AND operation = 'synthetic_run.succeeded') AS audits, (SELECT count(*) FROM worker_heartbeat) AS heartbeats",
        [first.id],
      );
      assert.equal(Number(result.rows[0]?.effects), 1);
      assert.equal(Number(result.rows[0]?.audits), 1);
      assert.ok(Number(result.rows[0]?.heartbeats) >= 1);
    } finally {
      await client.end();
    }
    const eventProjectResponse = await fetch(`${origin}/api/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `Smoke event project ${key}`,
        type: "software",
      }),
    });
    assert.equal(eventProjectResponse.status, 201);
    const eventProject = await eventProjectResponse.json();
    const eventResourceResponse = await fetch(`${origin}/api/v1/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Smoke monitor ${key}`, kind: "service" }),
    });
    assert.equal(eventResourceResponse.status, 201);
    const eventResource = await eventResourceResponse.json();
    const eventLinkResponse = await fetch(
      `${origin}/api/v1/projects/${eventProject.id}/resources`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId: eventResource.id,
          type: "supports",
        }),
      },
    );
    assert.equal(eventLinkResponse.status, 201);

    async function importEvent(scenarioId, occurrenceId) {
      const response = await fetch(`${origin}/api/v1/synthetic-event-imports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          occurrenceId,
          projectId: eventProject.id,
          resourceId: eventResource.id,
        }),
      });
      assert.equal(response.status, 202);
      return response.json();
    }
    async function awaitImport(id) {
      const importDeadline = Date.now() + 30_000;
      while (Date.now() < importDeadline) {
        const response = await fetch(
          `${origin}/api/v1/synthetic-event-imports/${id}`,
        );
        assert.equal(response.status, 200);
        const current = await response.json();
        if (current.state === "succeeded") return current;
        if (current.state === "failed")
          throw new Error(`Event import failed: ${current.error}`);
        for (const service of services) {
          if (service.error || service.child.exitCode !== null)
            throw new Error(
              `${service.name} exited during event import: ${service.tail}`,
            );
        }
        await delay(150);
      }
      throw new Error(`Event import timed out: ${id}`);
    }

    const downOccurrenceId = randomUUID();
    const down = await importEvent("operations.monitor-down", downOccurrenceId);
    const duplicateDown = await importEvent(
      "operations.monitor-down",
      downOccurrenceId,
    );
    assert.equal(duplicateDown.id, down.id);
    const completedDown = await awaitImport(down.id);
    assert.equal(completedDown.isSynthetic, true);
    assert.ok(completedDown.sourceEnvelopeId);
    assert.ok(completedDown.eventId);

    const envelopeResponse = await fetch(
      `${origin}/api/v1/source-envelopes/${completedDown.sourceEnvelopeId}`,
    );
    assert.equal(envelopeResponse.status, 200);
    const envelope = await envelopeResponse.json();
    assert.equal(envelope.isSynthetic, true);

    const eventsResponse = await fetch(
      `${origin}/api/v1/events?projectId=${eventProject.id}`,
    );
    assert.equal(eventsResponse.status, 200);
    const eventPage = await eventsResponse.json();
    assert.ok(
      eventPage.items.some((event) => event.id === completedDown.eventId),
    );

    const alertsResponse = await fetch(
      `${origin}/api/v1/alerts?projectId=${eventProject.id}`,
    );
    assert.equal(alertsResponse.status, 200);
    const alerts = await alertsResponse.json();
    assert.ok(alerts.items.length >= 1);
    const activeAlert = alerts.items.find((alert) => alert.state === "open");
    assert.ok(activeAlert);
    assert.equal(activeAlert.isSynthetic, true);
    assert.ok(activeAlert.reason);
    assert.ok(activeAlert.ruleId);
    const attentionResponse = await fetch(
      `${origin}/api/v1/attention?projectId=${eventProject.id}`,
    );
    assert.equal(attentionResponse.status, 200);
    const attention = await attentionResponse.json();
    assert.ok(attention.items.length >= 1);

    const recovery = await importEvent(
      "operations.monitor-recovered",
      randomUUID(),
    );
    await awaitImport(recovery.id);
    const recoveredAttentionResponse = await fetch(
      `${origin}/api/v1/attention?projectId=${eventProject.id}`,
    );
    assert.equal(recoveredAttentionResponse.status, 200);
    const recoveredAttention = await recoveredAttentionResponse.json();
    assert.equal(recoveredAttention.items.length, 0);
    const resolvedAlertResponse = await fetch(
      `${origin}/api/v1/alerts/${activeAlert.id}`,
    );
    assert.equal(resolvedAlertResponse.status, 200);
    const resolvedAlert = await resolvedAlertResponse.json();
    assert.equal(resolvedAlert.state, "resolved");
    const realResourceResponse = await fetch(
      `${origin}/api/v1/resources/${eventResource.id}`,
    );
    assert.equal(realResourceResponse.status, 200);
    const realResource = await realResourceResponse.json();
    assert.equal(realResource.state, null);
    assert.equal(realResource.lastObservedAt, null);
    console.log(
      "Built web and worker smoke passed: health, resource pages, queue processing, synthetic event evidence, attention lifecycle, and real health isolation.",
    );
  } finally {
    await Promise.all(services.reverse().map(stopService));
  }
}

const directory = await mkdtemp(join(tmpdir(), "commandry-pg18-"));
const password = randomBytes(24).toString("hex");
const runtimePassword = randomBytes(24).toString("hex");
const port = await freeLoopbackPort();
const postgres = new EmbeddedPostgres({
  databaseDir: join(directory, "data"),
  port,
  user: "postgres",
  password,
  authMethod: "scram-sha-256",
  persistent: false,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});

let started = false;
let failed = false;
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase("commandry_integration");
  const connectionString = `postgresql://postgres:${password}@127.0.0.1:${port}/commandry_integration`;
  await runTests(
    connectionString,
    runtimePassword,
    "packages/platform/src/foundation.integration.test.ts",
  );
  const platformTests = (await readdir(resolve(root, "packages/platform/src")))
    .filter(
      (file) =>
        file.endsWith(".integration.test.ts") &&
        file !== "foundation.integration.test.ts",
    )
    .sort();
  for (const file of platformTests)
    await runTests(
      connectionString,
      runtimePassword,
      `packages/platform/src/${file}`,
    );
  if (process.argv.includes("--smoke"))
    await runSmoke(postgres, connectionString, runtimePassword);
  const repositoryTests = (await readdir(resolve(root, "packages/db/src")))
    .filter((file) => file.endsWith(".integration.test.ts"))
    .sort();
  for (const file of repositoryTests)
    await runTests(
      connectionString,
      runtimePassword,
      `packages/db/src/${file}`,
    );
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
