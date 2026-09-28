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

async function runOneShot(name, entrypoint, environment, input) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout = (stdout + chunk.toString()).slice(-4_000);
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4_000);
  });
  child.stdin.on("error", () => {});
  child.stdin.end(input);
  const [code, signal] = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, exitSignal) =>
      resolveExit([exitCode, exitSignal]),
    );
  });
  assert.equal(code, 0, `${name} exited with ${signal ?? code}: ${stderr}`);
  return { stdout, stderr };
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
    const eventLink = await eventLinkResponse.json();

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

    async function fileSmokeRecord(kind, title, body, originalContent) {
      const captureResponse = await fetch(`${origin}/api/v1/captures`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputType: "text", originalContent }),
      });
      assert.equal(captureResponse.status, 201);
      const capture = await captureResponse.json();
      const fileResponse = await fetch(
        `${origin}/api/v1/captures/${capture.id}/file`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: eventProject.id,
            kind,
            title,
            body,
          }),
        },
      );
      assert.equal(fileResponse.status, 201);
      return { capture, record: (await fileResponse.json()).record };
    }

    const task = await fileSmokeRecord(
      "task",
      `Smoke task ${key}`,
      "Review the labeled local event evidence.",
      `Original smoke task ${key}`,
    );
    const note = await fileSmokeRecord(
      "note",
      `Smoke note ${key}`,
      "Selected context for packet smoke.",
      `Original smoke note ${key}`,
    );
    const briefResponse = await fetch(
      `${origin}/api/v1/projects/${eventProject.id}/brief`,
    );
    assert.equal(briefResponse.status, 200);
    const brief = await briefResponse.json();
    assert.equal(brief.project.id, eventProject.id);
    assert.equal(brief.method, "deterministic-local-v1");
    assert.ok(
      brief.sections.work.items.some((item) => item.id === task.record.id),
    );
    assert.ok(brief.sections.activity.items.some((item) => item.isSynthetic));
    const citedWorkResponse = await fetch(
      `${origin}${brief.sections.work.items[0].evidence[0].href}`,
    );
    assert.equal(citedWorkResponse.status, 200);

    const packetResponse = await fetch(
      `${origin}/api/v1/work-items/${task.record.id}/execution-packets`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selectedKnowledgeIds: [note.record.id],
          selectedResourceIds: [eventResource.id],
        }),
      },
    );
    assert.equal(packetResponse.status, 201);
    const packet = await packetResponse.json();
    assert.equal(packet.packetVersion, 1);
    assert.equal(packet.workItemId, task.record.id);
    assert.equal(packet.snapshot.selectedKnowledge[0].id, note.record.id);
    assert.equal(
      packet.snapshot.authorization.externalActions,
      "not_authorized",
    );
    const savedPacketResponse = await fetch(
      `${origin}/api/v1/execution-packets/${packet.id}`,
    );
    assert.equal(savedPacketResponse.status, 200);
    assert.deepEqual(await savedPacketResponse.json(), packet);

    const recurrenceResponse = await fetch(
      `${origin}/api/v1/work-items/${task.record.id}/recurrence`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startAt: new Date(Date.now() + 3_000).toISOString(),
          everyMinutes: 5,
        }),
      },
    );
    assert.equal(recurrenceResponse.status, 201);
    const recurringDefinition = await recurrenceResponse.json();
    assert.equal(recurringDefinition.sourceWorkItemId, task.record.id);
    let generatedOccurrence;
    const recurrenceDeadline = Date.now() + 30_000;
    while (Date.now() < recurrenceDeadline) {
      const response = await fetch(
        `${origin}/api/v1/work-items/${task.record.id}/recurrence/occurrences`,
      );
      assert.equal(response.status, 200);
      const page = await response.json();
      generatedOccurrence = page.items.find(
        (occurrence) => occurrence.state === "generated",
      );
      if (generatedOccurrence) break;
      for (const service of services) {
        if (service.error || service.child.exitCode !== null)
          throw new Error(
            `${service.name} exited during recurring Work: ${service.tail}`,
          );
      }
      await delay(200);
    }
    assert.ok(generatedOccurrence, "Worker did not create a recurring task");
    assert.deepEqual(generatedOccurrence.externalActions, []);
    const generatedTaskResponse = await fetch(
      `${origin}/api/v1/work-items/${generatedOccurrence.generatedWorkItemId}`,
    );
    assert.equal(generatedTaskResponse.status, 200);
    const generatedTask = await generatedTaskResponse.json();
    assert.equal(generatedTask.generatedFromWorkItemId, task.record.id);
    assert.equal(generatedTask.sourceCaptureId, task.capture.id);
    assert.equal(generatedTask.assigneeKind, "unassigned");
    const generatedDoneResponse = await fetch(
      `${origin}/api/v1/work-items/${generatedTask.id}/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedStatus: "open", status: "done" }),
      },
    );
    assert.equal(generatedDoneResponse.status, 200);

    const agentResponse = await fetch(`${origin}/api/v1/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Smoke synthetic agent ${key}` }),
    });
    assert.equal(agentResponse.status, 201);
    const agent = await agentResponse.json();
    assert.equal(agent.isSynthetic, true);
    assert.equal(agent.runtime, "local-fake-v1");
    const assignmentResponse = await fetch(
      `${origin}/api/v1/agents/${agent.id}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: eventProject.id }),
      },
    );
    assert.equal(assignmentResponse.status, 201);
    const occurrenceId = randomUUID();
    async function submitAgentRun() {
      const response = await fetch(
        `${origin}/api/v1/execution-packets/${packet.id}/agent-runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agentId: agent.id, occurrenceId }),
        },
      );
      assert.equal(response.status, 202);
      return response.json();
    }
    const startedAgentRun = await submitAgentRun();
    assert.equal((await submitAgentRun()).id, startedAgentRun.id);
    let completedAgentRun;
    const agentDeadline = Date.now() + 20_000;
    while (Date.now() < agentDeadline) {
      const response = await fetch(
        `${origin}/api/v1/agent-runs/${startedAgentRun.id}`,
      );
      assert.equal(response.status, 200);
      completedAgentRun = await response.json();
      if (completedAgentRun.state === "succeeded") break;
      if (completedAgentRun.state === "failed") {
        throw new Error(
          `Synthetic local agent run failed: ${completedAgentRun.error}`,
        );
      }
      for (const service of services) {
        if (service.error || service.child.exitCode !== null)
          throw new Error(
            `${service.name} exited during agent run: ${service.tail}`,
          );
      }
      await delay(150);
    }
    assert.equal(completedAgentRun?.state, "succeeded");
    assert.equal(completedAgentRun?.isSynthetic, true);
    assert.equal(completedAgentRun?.verificationStatus, "unverified");
    assert.deepEqual(completedAgentRun?.externalActions, []);
    assert.ok(completedAgentRun?.result?.evidence?.length);
    assert.ok(completedAgentRun?.result?.contextReadIds?.length);
    for (const evidence of completedAgentRun.result.evidence) {
      const source = await fetch(`${origin}${evidence.href}`);
      assert.equal(source.status, 200);
    }
    const terminalContextResponse = await fetch(
      `${origin}/api/v1/agent-runs/${startedAgentRun.id}/context-reads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: eventProject.id,
          operation: "project.brief.read",
          reason: "Smoke review of cited project context",
        }),
      },
    );
    assert.equal(terminalContextResponse.status, 403);
    assert.equal((await terminalContextResponse.json()).code, "RUN_NOT_ACTIVE");
    const deniedContextResponse = await fetch(
      `${origin}/api/v1/agent-runs/${startedAgentRun.id}/context-reads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: eventProject.id,
          operation: "external.action",
          reason: "Smoke policy denial",
        }),
      },
    );
    assert.equal(deniedContextResponse.status, 403);
    assert.equal((await deniedContextResponse.json()).code, "OPERATION_DENIED");
    const auditResponse = await fetch(
      `${origin}/api/v1/agent-runs/${startedAgentRun.id}/audit`,
    );
    assert.equal(auditResponse.status, 200);
    const audit = await auditResponse.json();
    assert.ok(audit.items.length >= 3);

    const proposalResponse = await fetch(
      `${origin}/api/v1/agent-runs/${startedAgentRun.id}/simulated-actions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectResourceLinkId: eventLink.id,
          mode: "graceful",
          occurrenceId: randomUUID(),
        }),
      },
    );
    assert.equal(proposalResponse.status, 201);
    const proposal = await proposalResponse.json();
    assert.equal(proposal.state, "pending");
    assert.equal(proposal.descriptor.risk, "sensitive");
    assert.equal(
      proposal.descriptor.requiredCapability,
      "infrastructure.restart",
    );
    assert.deepEqual(proposal.descriptor.externalActions, []);
    const decisionResponse = await fetch(
      `${origin}/api/v1/approvals/${proposal.id}/decisions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          expectedDigest: proposal.descriptorDigest,
          occurrenceId: randomUUID(),
        }),
      },
    );
    assert.equal(decisionResponse.status, 200);
    assert.equal((await decisionResponse.json()).state, "approved");
    let reviewedApproval;
    const approvalDeadline = Date.now() + 20_000;
    while (Date.now() < approvalDeadline) {
      const response = await fetch(`${origin}/api/v1/approvals/${proposal.id}`);
      assert.equal(response.status, 200);
      reviewedApproval = await response.json();
      if (reviewedApproval.outcome?.kind === "simulated_only") break;
      await delay(150);
    }
    assert.equal(reviewedApproval?.outcome?.kind, "simulated_only");
    assert.equal(reviewedApproval?.outcome?.verificationStatus, "unverified");
    assert.equal(reviewedApproval?.outcome?.resourceStateChanged, false);
    assert.deepEqual(reviewedApproval?.outcome?.externalActions, []);
    const resourceAfterApproval = await fetch(
      `${origin}/api/v1/resources/${eventResource.id}`,
    );
    assert.equal(resourceAfterApproval.status, 200);
    const unchangedResource = await resourceAfterApproval.json();
    assert.equal(unchangedResource.state, null);
    assert.equal(unchangedResource.lastObservedAt, null);
    console.log(
      "Built web and worker smoke passed: health, pagination, queue processing, synthetic attention lifecycle, real health isolation, cited brief, immutable packet, scoped fake agent run, policy audit, and no-effect simulated approval.",
    );
  } finally {
    await Promise.all(services.reverse().map(stopService));
  }
}

async function runAuthSmoke(postgres, adminUrl, runtimePassword) {
  const webEntry = join(root, "apps/web/.next/standalone/apps/web/server.js");
  const bootstrapEntry = join(root, "apps/worker/dist/bootstrap-local-auth.js");
  const recoveryEntry = join(root, "apps/worker/dist/recover-local-auth.js");
  for (const entry of [webEntry, bootstrapEntry, recoveryEntry]) {
    if (!existsSync(entry))
      throw new Error(
        `Build artifact is missing: ${entry}. Run pnpm build first.`,
      );
  }
  const port = await freeLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const email = "auth-smoke-owner@commandry.test";
  const password = `Auth-Smoke-${randomBytes(16).toString("hex")}`;
  const recoveredPassword = `Recovered-${randomBytes(16).toString("hex")}`;
  const runtimeUrl = new URL(adminUrl);
  runtimeUrl.username = "commandry_app_integration";
  runtimeUrl.password = runtimePassword;
  const environment = {
    NODE_ENV: "production",
    APP_ENV: "test",
    APP_ORIGIN: origin,
    DATABASE_URL: runtimeUrl.toString(),
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    APP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    INITIAL_ADMIN_EMAIL: email,
    LOCAL_AUTH_MODE: "password",
    RELEASE_SHA: "auth-integration-smoke",
    DB_POOL_MAX: "2",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
  };
  const bootstrap = await runOneShot(
    "owner bootstrap",
    bootstrapEntry,
    environment,
    `${password}\n`,
  );
  assert.ok(!bootstrap.stdout.includes(password));
  let web = startService("auth web", webEntry, environment);
  const postAuth = (path, body, cookie) =>
    fetch(`${origin}/api/auth/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  async function signIn(candidatePassword) {
    const response = await postAuth("sign-in/email", {
      email,
      password: candidatePassword,
    });
    assert.equal(response.status, 200, await response.text());
    const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie?.includes("session_token="));
    return cookie;
  }
  try {
    await waitForReady(`${origin}/health/ready`, [web]);
    const publicSignIn = await fetch(`${origin}/sign-in`);
    assert.equal(publicSignIn.status, 200);
    const deniedRead = await fetch(`${origin}/api/v1/projects`);
    assert.equal(deniedRead.status, 401);
    assert.equal((await deniedRead.json()).code, "UNAUTHENTICATED");
    const deniedWrite = await fetch(`${origin}/api/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Unauthorized smoke", type: "software" }),
    });
    assert.equal(deniedWrite.status, 401);
    const deniedPage = await fetch(`${origin}/projects`, {
      redirect: "manual",
    });
    assert.equal(deniedPage.status, 307);
    assert.equal(
      new URL(deniedPage.headers.get("location"), origin).pathname,
      "/sign-in",
    );
    const refusedSignUp = await postAuth("sign-up/email", {
      name: "Another owner",
      email: "other@commandry.test",
      password,
    });
    assert.notEqual(refusedSignUp.status, 200);

    const cookie = await signIn(password);
    const allowedRead = await fetch(`${origin}/api/v1/projects`, {
      headers: { cookie },
    });
    assert.equal(allowedRead.status, 200);
    const allowedPage = await fetch(`${origin}/projects`, {
      headers: { cookie },
    });
    assert.equal(allowedPage.status, 200);
    const signOut = await postAuth("sign-out", {}, cookie);
    assert.equal(signOut.status, 200);
    const signedOutRead = await fetch(`${origin}/api/v1/projects`, {
      headers: { cookie },
    });
    assert.equal(signedOutRead.status, 401);

    const beforeRecoveryCookie = await signIn(password);
    await stopService(web);
    const recovered = await runOneShot(
      "owner recovery",
      recoveryEntry,
      environment,
      `${email}\n${recoveredPassword}\n`,
    );
    assert.ok(!recovered.stdout.includes(recoveredPassword));
    const evidence = JSON.parse(recovered.stdout);
    assert.equal(evidence.operation, "auth.owner_password_recovered");
    assert.equal(evidence.revokedSessionCount, 1);
    web = startService("recovered auth web", webEntry, environment);
    await waitForReady(`${origin}/health/ready`, [web]);
    const revokedRead = await fetch(`${origin}/api/v1/projects`, {
      headers: { cookie: beforeRecoveryCookie },
    });
    assert.equal(revokedRead.status, 401);
    const oldPassword = await postAuth("sign-in/email", { email, password });
    assert.notEqual(oldPassword.status, 200);
    const recoveredCookie = await signIn(recoveredPassword);
    const recoveredRead = await fetch(`${origin}/api/v1/projects`, {
      headers: { cookie: recoveredCookie },
    });
    assert.equal(recoveredRead.status, 200);
    const client = postgres.getPgClient("commandry_integration", "127.0.0.1");
    await client.connect();
    try {
      const audit = await client.query(
        "SELECT actor, details FROM audit_event WHERE id = $1 AND operation = 'auth.owner_password_recovered'",
        [evidence.auditEventId],
      );
      assert.equal(audit.rows[0]?.actor, "local-operator-cli");
      assert.equal(audit.rows[0]?.details?.revokedSessionCount, 1);
    } finally {
      await client.end();
    }
    console.log(
      "Built auth smoke passed: unauthorized page/API denial, closed sign-up, owner sign-in and sign-out, offline password recovery, old-session revocation, and recovered read.",
    );
  } finally {
    await stopService(web);
    const cleanup = postgres.getPgClient("commandry_integration", "127.0.0.1");
    await cleanup.connect();
    try {
      await cleanup.query('DELETE FROM "user" WHERE email = $1', [email]);
    } finally {
      await cleanup.end();
    }
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
  const authOnly = process.argv.includes("--auth-only");
  if (!authOnly) {
    const platformTests = (
      await readdir(resolve(root, "packages/platform/src"))
    )
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
  }
  if (process.argv.includes("--smoke")) {
    await runSmoke(postgres, connectionString, runtimePassword);
  }
  if (process.argv.includes("--smoke") || authOnly) {
    await runAuthSmoke(postgres, connectionString, runtimePassword);
  }
  if (authOnly) {
    await runTests(
      connectionString,
      runtimePassword,
      "packages/db/src/auth.integration.test.ts",
    );
  } else {
    const repositoryTests = (await readdir(resolve(root, "packages/db/src")))
      .filter((file) => file.endsWith(".integration.test.ts"))
      .sort();
    for (const file of repositoryTests)
      await runTests(
        connectionString,
        runtimePassword,
        `packages/db/src/${file}`,
      );
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
}
if (failed) throw new Error("Integration test suite failed");
