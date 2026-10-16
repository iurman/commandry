import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
  async function write(path, body, status = 201, key = randomUUID()) {
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
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
      ].sort(),
    );
    const identity = await call(client, "get_foundation_identity");
    assert.equal(identity.actor.projectId, project.id);
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
    await write(
      `/api/v1/foundation/clients/${issued.client.id}/revoke`,
      {},
      200,
    );
    await assert.rejects(
      client.callTool({ name: "get_foundation_identity", arguments: {} }),
    );
    console.log(
      "Foundation built-app MCP rehearsal passed: live owner issuance, strict SDK discovery, scoped reads and writes, exact replay, write-only authentication, separate review/verification/approval, revision reset, pagination and revocation.",
    );
  } finally {
    await Promise.allSettled(transports.map((client) => client.close()));
    for (const id of clients)
      await write(`/api/v1/foundation/clients/${id}/revoke`, {}, 200);
  }
}
