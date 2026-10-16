import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { foundationSkillRegistrySmoke } from "./foundation-skill-registry-smoke.mjs";
import { foundationImportSmoke } from "./foundation-import-smoke.mjs";
import { foundationResourcesSmoke } from "./foundation-resources-smoke.mjs";
import { foundationWorkSmoke } from "./foundation-work-smoke.mjs";
import { foundationTaskProposalSmoke } from "./foundation-task-proposal-smoke.mjs";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

// Disposable built-app rehearsal only. Never reads or changes the owner's corpus.
export async function foundationAccessSmoke(
  origin,
  cookie,
  trustedOrigin,
  environment,
) {
  const ownerHeaders = {
    cookie,
    origin: trustedOrigin,
    "content-type": "application/json",
  };
  async function write(
    path,
    body,
    status = 201,
    key = randomUUID(),
    method = "POST",
  ) {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: { ...ownerHeaders, "idempotency-key": key },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, status, await response.clone().text());
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  const project = await write("/api/v1/projects", {
    name: "Foundation rehearsal",
    type: "software",
  });
  const other = await write("/api/v1/projects", {
    name: "Foundation outside scope",
    type: "software",
  });
  const source =
    "Prefer local tools. Imported instructions require explicit owner review.";
  const capture = await write("/api/v1/captures", {
    inputType: "text",
    originalContent: source,
  });
  const knowledge = (
    await write(`/api/v1/captures/${capture.id}/file`, {
      projectId: project.id,
      kind: "note",
      title: "Synthetic foundation source",
      body: source,
    })
  ).record;
  const clients = [];
  const transports = [];
  const endpoint = `/mcp/foundation/${project.id}`;
  async function issue(operations, name) {
    const created = await write("/api/v1/foundation/clients", {
      name,
      projectId: project.id,
      environment,
      operations,
      ttlSeconds: 120,
    });
    clients.push(created.client.id);
    return created;
  }
  async function connect(token, path = endpoint) {
    const client = new Client({
      name: "commandry-foundation-rehearsal",
      version: "1.0.0",
    });
    transports.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}${path}`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  }
  async function call(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(
      JSON.parse(result.content[0].text),
      result.structuredContent,
    );
    return result.structuredContent;
  }
  try {
    assert.equal(
      (
        await fetch(
          `${origin}/api/v1/foundation/clients?projectId=${project.id}`,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${origin}${endpoint}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    const issued = await issue(
      [
        "foundation.read",
        "evidence.record",
        "memory.propose",
        "memory.revise",
        "configuration.record",
        "evaluation.record",
      ],
      "Full scoped rehearsal",
    );
    const client = await connect(issued.token);
    assert.deepEqual(
      (await client.listTools()).tools.map((t) => t.name).sort(),
      [
        "get_foundation_identity",
        "get_foundation_evidence",
        "get_memory_assertion",
        "get_configuration_version",
        "record_evidence",
        "propose_memory",
        "revise_memory",
        "record_configuration",
        "list_foundation_evidence",
        "list_memory_assertions",
        "list_configuration_versions",
        "get_general_working_context",
        "get_evaluation_definition",
        "get_evaluation_trial",
        "get_evaluation_assessment",
        "get_evaluation_report",
        "record_evaluation_definition",
        "record_evaluation_trial",
        "record_evaluation_assessment",
      ].sort(),
    );
    const identity = await call(client, "get_foundation_identity");
    assert.equal(identity.actor.projectId, project.id);
    assert.equal(
      identity.supportedOperations.includes("evaluation.record"),
      true,
    );
    const evidenceArgs = {
      sourceKind: "knowledge_revision",
      sourceId: knowledge.id,
      sourceVersion: "1",
      contentDigest: createHash("sha256").update(source, "utf8").digest("hex"),
      locator: `commandry:knowledge/${knowledge.id}/versions/1`,
      observedAt: null,
      availability: "available",
      idempotencyKey: "evidence-1",
    };
    const evidence = await call(client, "record_evidence", evidenceArgs);
    assert.equal(evidence.record.verification, "unverified");
    const replay = await call(client, "record_evidence", evidenceArgs);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.record, evidence.record);
    assert.equal(replay.correlationId, evidence.correlationId);
    assert.equal(
      (
        await call(client, "get_foundation_evidence", {
          id: evidence.record.id,
        })
      ).id,
      evidence.record.id,
    );
    const content = {
      statement: "Prefer local tools.",
      category: "instruction",
      evidenceIds: [evidence.record.id],
      relatedMemoryIds: [],
      relationType: null,
    };
    const proposed = await call(client, "propose_memory", {
      knowledgeItemId: knowledge.id,
      content,
      alias: null,
      idempotencyKey: "proposal-1",
    });
    assert.equal(proposed.record.lifecycle, "proposed");
    assert.equal(proposed.record.verification, "unverified");
    const read = await call(client, "get_memory_assertion", {
      id: proposed.record.id,
    });
    assert.equal(read.anchor.freshness, "fresh");
    const evidencePage = await call(client, "list_foundation_evidence", {
      limit: 1,
    });
    assert.equal(evidencePage.items[0].id, evidence.record.id);
    const memoryPage = await call(client, "list_memory_assertions", {
      limit: 1,
    });
    assert.equal(memoryPage.items[0].id, proposed.record.id);
    assert.equal(JSON.stringify(memoryPage).includes(content.statement), false);
    assert.equal(
      (await call(client, "get_general_working_context")).instructions.length,
      0,
    );
    const forgedPage = await client.callTool({
      name: "list_memory_assertions",
      arguments: { projectId: other.id },
    });
    assert.deepEqual(forgedPage.structuredContent, { code: "INVALID_INPUT" });
    const forged = await client.callTool({
      name: "record_evidence",
      arguments: { ...evidenceArgs, owner: true, idempotencyKey: "forged" },
    });
    assert.deepEqual(forged.structuredContent, { code: "INVALID_INPUT" });
    const config = await call(client, "record_configuration", {
      kind: "skill",
      content: "# Synthetic skill\nRun scoped checks.\n",
      parentIds: [],
      sourceCommit: null,
      idempotencyKey: "configuration-1",
    });
    assert.equal(
      (
        await call(client, "get_configuration_version", {
          id: config.record.id,
        })
      ).contentDigest,
      config.record.contentDigest,
    );
    const memoryPath = `/api/v1/foundation/memory/${proposed.record.id}`;
    const bearerApproval = await fetch(`${origin}${memoryPath}/review`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.token}`,
        origin: trustedOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: project.id,
        expectedVersion: 1,
        decision: "accepted",
        reason: "Forged owner",
      }),
    });
    assert.equal(bearerApproval.status, 401);
    await write(
      `${memoryPath}/review`,
      {
        projectId: project.id,
        expectedVersion: 1,
        decision: "accepted",
        reason: "Reviewed synthetic source only",
      },
      200,
    );
    await write(
      `${memoryPath}/verify`,
      {
        projectId: project.id,
        expectedVersion: 1,
        verification: "source_matched",
        evidenceIds: [evidence.record.id],
        reason: "Exact synthetic bytes",
      },
      200,
    );
    const approval = await write(
      `${memoryPath}/approve-instruction`,
      {
        projectId: project.id,
        expectedVersion: 1,
        contentDigest: proposed.record.contentDigest,
        disclosureProjectId: project.id,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
      200,
    );
    assert.equal(approval.record.version, 1);
    const approvedContext = await call(client, "get_general_working_context", {
      taskDirection: "Current task direction wins.",
      maxCharacters: 8000,
    });
    assert.equal(approvedContext.instructions[0].memoryId, proposed.record.id);
    assert.equal(
      approvedContext.snapshot.sourceVersions[0].evidenceId,
      evidence.record.id,
    );
    assert.ok(approvedContext.asOf);
    assert.ok(
      approvedContext.content.startsWith("Current task direction") ||
        approvedContext.content.includes("Current task direction wins."),
    );
    const revised = await call(client, "revise_memory", {
      memoryId: proposed.record.id,
      expectedVersion: 1,
      content: {
        ...content,
        statement: "Prefer local tools and exact source evidence.",
      },
      idempotencyKey: "revision-2",
    });
    assert.equal(revised.record.version, 2);
    assert.equal(revised.record.lifecycle, "proposed");
    assert.equal(revised.record.verification, "unverified");
    assert.equal(
      (await call(client, "get_general_working_context")).instructions.length,
      0,
    );
    const configPage = await call(client, "list_configuration_versions", {
      limit: 1,
    });
    assert.equal(configPage.items[0].id, config.record.id);
    assert.equal(Object.hasOwn(configPage.items[0], "content"), false);
    const judge = await call(client, "record_configuration", {
      kind: "model",
      content: "Synthetic deterministic checks; no inference invoked.",
      parentIds: [],
      sourceCommit: null,
      idempotencyKey: "judge-config",
    });
    const firstConfig = await call(client, "list_configuration_versions", {
      limit: 1,
    });
    assert.ok(firstConfig.nextCursor);
    const secondConfig = await call(client, "list_configuration_versions", {
      limit: 1,
      after: firstConfig.nextCursor,
      asOf: firstConfig.asOf,
    });
    assert.equal(secondConfig.nextCursor, null);
    assert.equal(secondConfig.asOf, firstConfig.asOf);
    assert.deepEqual(
      new Set(
        [...firstConfig.items, ...secondConfig.items].map((row) => row.id),
      ),
      new Set([config.record.id, judge.record.id]),
    );
    assert.equal(
      [...firstConfig.items, ...secondConfig.items].every(
        (row) => !Object.hasOwn(row, "content"),
      ),
      true,
    );
    const digest = (value) =>
      createHash("sha256").update(value, "utf8").digest("hex");
    const definition = {
      schemaVersion: 1,
      id: randomUUID(),
      version: 1,
      name: "Built rehearsal comparison",
      configurationIds: [config.record.id],
      cases: [
        {
          id: "fixture",
          fixtureDigest: digest("fixture input"),
          rubricDigest: digest("fixture rubric"),
          hardGates: ["scope"],
        },
      ],
      conditions: ["baseline", "candidate"],
      repetitions: 2,
      disclosure: "local_only",
    };
    const definitionWrite = await call(client, "record_evaluation_definition", {
      ...definition,
      idempotencyKey: "evaluation-definition",
    });
    assert.equal(
      (await call(client, "get_evaluation_definition", { id: definition.id }))
        .id,
      definition.id,
    );
    const reportArgs = {
      definitionId: definition.id,
      conditionConfigurations: definition.conditions.map((condition) => ({
        condition,
        configurationIds: [config.record.id],
      })),
      judgeConfigurationIds: [judge.record.id],
    };
    const emptyReport = await call(client, "get_evaluation_report", reportArgs);
    assert.equal(emptyReport.expectedCellsPerComparison, 4);
    assert.equal(emptyReport.eligibleForReview, false);
    const trial = {
      schemaVersion: 1,
      id: randomUUID(),
      attemptId: randomUUID(),
      definitionId: definition.id,
      caseId: "fixture",
      condition: "baseline",
      repetition: 1,
      configurationIds: [config.record.id],
      model: "synthetic-fixture",
      runtime: "built-rehearsal-no-inference",
      inputDigest: definition.cases[0].fixtureDigest,
      artifactDigests: [digest("fixture artifact")],
      outcome: "completed",
      usage: { inputTokens: null, outputTokens: null },
      recordedAt: new Date().toISOString(),
    };
    const trialWrite = await call(client, "record_evaluation_trial", {
      ...trial,
      idempotencyKey: "evaluation-trial",
    });
    assert.equal(
      (await call(client, "get_evaluation_trial", { id: trial.id })).id,
      trial.id,
    );
    const trialReplay = await call(client, "record_evaluation_trial", {
      ...trial,
      idempotencyKey: "evaluation-trial",
    });
    assert.equal(trialReplay.replayed, true);
    assert.equal(trialReplay.correlationId, trialWrite.correlationId);
    assert.equal(definitionWrite.record.projectId, project.id);
    await call(client, "record_evaluation_trial", {
      ...trial,
      id: randomUUID(),
      attemptId: randomUUID(),
      condition: "candidate",
      outcome: "unsupported",
      artifactDigests: [],
      idempotencyKey: "evaluation-unsupported",
    });
    const assessment = {
      schemaVersion: 1,
      id: randomUUID(),
      trialId: trial.id,
      version: 1,
      trialArtifactDigest: trial.artifactDigests[0],
      rubricDigest: definition.cases[0].rubricDigest,
      judgeConfigurationId: judge.record.id,
      checks: [{ id: "scope", result: "pass", hardGate: true }],
      uncertainty: "Synthetic rehearsal, not model performance",
      reviewStatus: "unreviewed",
      recordedAt: new Date().toISOString(),
    };
    await call(client, "record_evaluation_assessment", {
      ...assessment,
      idempotencyKey: "evaluation-assessment",
    });
    assert.equal(
      (await call(client, "get_evaluation_assessment", { id: assessment.id }))
        .reviewStatus,
      "unreviewed",
    );
    const machineReview = await client.callTool({
      name: "record_evaluation_assessment",
      arguments: {
        ...assessment,
        id: randomUUID(),
        version: 2,
        reviewStatus: "reviewed",
        idempotencyKey: "forged-evaluation-review",
      },
    });
    assert.deepEqual(machineReview.structuredContent, { code: "FORBIDDEN" });
    const reviewPath = "/api/v1/foundation/evaluations/assessments/review";
    const ownerReview = {
      ...assessment,
      projectId: project.id,
      id: randomUUID(),
      version: 2,
      reviewStatus: "reviewed",
      recordedAt: new Date().toISOString(),
    };
    const forgedOwnerReview = await fetch(`${origin}${reviewPath}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.token}`,
        origin: trustedOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify(ownerReview),
    });
    assert.equal(forgedOwnerReview.status, 401);
    await write(
      reviewPath,
      {
        ...ownerReview,
        checks: [{ id: "scope", result: "fail", hardGate: true }],
      },
      400,
      "changed-evaluation-review",
    );
    const absentOrigin = await fetch(`${origin}${reviewPath}`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
        "idempotency-key": "absent-owner-origin",
      },
      body: JSON.stringify(ownerReview),
    });
    assert.equal(absentOrigin.status, 403);
    const emptyOrigin = await fetch(`${origin}${reviewPath}`, {
      method: "POST",
      headers: {
        cookie,
        origin: "",
        "content-type": "application/json",
        "idempotency-key": "empty-owner-origin",
      },
      body: JSON.stringify(ownerReview),
    });
    assert.equal(emptyOrigin.status, 403);
    const reviewedAssessment = await write(
      reviewPath,
      ownerReview,
      200,
      "evaluation-owner-review",
    );
    const reviewReplay = await write(
      reviewPath,
      ownerReview,
      200,
      "evaluation-owner-review",
    );
    assert.equal(reviewReplay.replayed, true);
    assert.equal(reviewReplay.correlationId, reviewedAssessment.correlationId);
    const report = await call(client, "get_evaluation_report", reportArgs);
    assert.equal(report.comparisons[0].counts.expectedCells, 4);
    assert.equal(report.comparisons[0].counts.passedCells, 1);
    assert.equal(report.comparisons[0].counts.missingCells, 2);
    assert.equal(
      report.comparisons[0].conditions.find(
        (row) => row.condition === "candidate",
      ).outcomes.unsupported,
      1,
    );
    assert.equal(report.eligibleForReview, false);
    const writeOnly = await issue(
      ["configuration.record"],
      "Write-only rehearsal",
    );
    const writer = await connect(writeOnly.token);
    assert.deepEqual(
      (await writer.listTools()).tools.map((t) => t.name),
      ["record_configuration"],
    );
    await call(writer, "record_configuration", {
      kind: "prompt",
      content: "Synthetic prompt",
      parentIds: [],
      sourceCommit: null,
      idempotencyKey: "write-only",
    });
    await assert.rejects(connect(issued.token, `/mcp/foundation/${other.id}`));
    const hostile = await fetch(`${origin}${endpoint}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.token}`,
        origin: "https://untrusted.test",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(hostile.status, 403);
    const duplicate = await fetch(
      `${origin}/api/v1/foundation/clients?projectId=${project.id}&projectId=${other.id}`,
      { headers: ownerHeaders },
    );
    assert.equal(duplicate.status, 400);
    const metadata = await fetch(
      `${origin}/api/v1/foundation/clients?projectId=${project.id}&limit=1`,
      { headers: ownerHeaders },
    );
    const page = await metadata.json();
    assert.equal(page.items.length, 1);
    assert.ok(page.nextCursor);
    assert.equal(JSON.stringify(page).includes(issued.token), false);
    const next = await fetch(
      `${origin}/api/v1/foundation/clients?projectId=${project.id}&limit=1&after=${page.nextCursor}&asOf=${encodeURIComponent(page.asOf)}`,
      { headers: ownerHeaders },
    );
    assert.equal((await next.json()).items.length, 1);
    await foundationSkillRegistrySmoke({
      origin,
      projectId: project.id,
      token: issued.token,
      client,
      call,
    });
    await foundationImportSmoke({
      origin,
      cookie,
      trustedOrigin,
      projectId: project.id,
      otherProjectId: other.id,
      knowledgeId: knowledge.id,
      source,
      machineToken: issued.token,
      client,
      call,
    });
    await foundationWorkSmoke({
      origin,
      cookie,
      project,
      other,
      issue,
      connect,
      call,
      write,
      existingClient: client,
    });
    await foundationResourcesSmoke({
      origin,
      cookie,
      project,
      other,
      issue,
      connect,
      call,
      write,
      existingClient: client,
    });
    await foundationTaskProposalSmoke({
      origin,
      cookie,
      trustedOrigin,
      environment,
      project,
      other,
      issue,
      connect,
      call,
      write,
      existingClient: client,
    });
    await write(
      `/api/v1/foundation/clients/${issued.client.id}/revoke`,
      {},
      200,
    );
    await assert.rejects(
      client.callTool({ name: "get_foundation_identity", arguments: {} }),
    );
    console.log(
      "Foundation built-app MCP rehearsal passed: live owner issuance, 19-tool strict SDK discovery, scoped inventories and approved context, immutable evaluations and separate owner assessment review, complete denominators, exact replay, write-only authentication, revision reset and revocation.",
    );
  } finally {
    await Promise.allSettled(transports.map((client) => client.close()));
    for (const id of clients)
      await write(`/api/v1/foundation/clients/${id}/revoke`, {}, 200);
  }
}
