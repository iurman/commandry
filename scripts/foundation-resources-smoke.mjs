import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

// Synthetic records in the disposable built-server rehearsal only.
export async function foundationResourcesSmoke({
  origin,
  cookie,
  project,
  other,
  issue,
  connect,
  call,
  write,
  existingClient,
}) {
  const parent = await write("/api/v1/resources", {
    kind: "provider",
    name: "Unlinked parent stays outside resource disclosure",
  });
  const expected = new Set();
  let repeated;
  for (let index = 0; index < 32; index++) {
    const resource = await write("/api/v1/resources", {
      kind: index % 2 ? "service" : "host",
      name: index === 0 ? "Exact cafe\u0301 resource" : `Resource ${index}`,
      externalUrl: "https://example.invalid/never-fetch-this",
    });
    if (index === 0) {
      repeated = resource;
      await write(
        `/api/v1/resources/${resource.id}/parent`,
        {
          parentResourceId: parent.id,
          expectedParentResourceId: null,
        },
        200,
        undefined,
        "PUT",
      );
    }
    const link = await write(
      `/api/v1/projects/${index < 31 ? project.id : other.id}/resources`,
      {
        resourceId: resource.id,
        type: "relates_to",
      },
    );
    if (index < 31) expected.add(link.id);
  }
  assert.ok(repeated);
  const second = await write(`/api/v1/projects/${project.id}/resources`, {
    resourceId: repeated.id,
    type: "supports",
  });
  expected.add(second.id);
  assert.equal(
    (await existingClient.listTools()).tools.some(
      (tool) => tool.name === "list_project_resources",
    ),
    false,
  );
  const issued = await issue(
    ["resources.read"],
    "Explicit canonical resource reader",
  );
  const client = await connect(issued.token);
  assert.deepEqual(
    (await client.listTools()).tools.map((tool) => tool.name),
    ["list_project_resources"],
  );
  const stable = (value) =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, stable(value[key])]),
          )
        : value;
  const seen = new Set();
  const repeatedConnections = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = await call(client, "list_project_resources", {
      limit: 13,
      cursor,
    });
    const query = new URLSearchParams({
      limit: "13",
      ...(cursor ? { cursor: cursor.afterLinkId } : {}),
    });
    const response = await fetch(
      `${origin}/api/v1/projects/${project.id}/resources?${query}`,
      { headers: { cookie }, signal: AbortSignal.timeout(15_000) },
    );
    assert.equal(response.status, 200);
    const canonical = await response.json();
    assert.equal(page.consistency, "live");
    assert.equal(page.requestedProjectId, project.id);
    assert.ok(Number.isFinite(Date.parse(page.selectedAt)));
    assert.deepEqual(
      page.items.map((item) => item.connection),
      canonical.items,
    );
    for (const { connection, contentDigest } of page.items) {
      assert.equal(seen.has(connection.id), false);
      seen.add(connection.id);
      assert.notEqual(connection.resource.id, parent.id);
      assert.equal(
        contentDigest,
        createHash("sha256")
          .update(JSON.stringify(stable(connection)))
          .digest("hex"),
      );
      if (connection.resource.id === repeated.id) {
        repeatedConnections.push(connection);
        assert.equal(connection.resource.parentResourceId, parent.id);
      }
    }
    cursor = page.nextCursor;
    pages++;
  } while (cursor);
  assert.equal(pages, 3);
  assert.deepEqual(seen, expected);
  assert.equal(repeatedConnections.length, 2);
  assert.deepEqual(
    new Set(repeatedConnections.map((x) => x.type)),
    new Set(["supports", "relates_to"]),
  );
  const forged = await client.callTool({
    name: "list_project_resources",
    arguments: { projectId: other.id },
  });
  assert.equal(forged.isError, true);
  assert.deepEqual(forged.structuredContent, { code: "INVALID_INPUT" });
  const missing = await client.callTool({
    name: "list_project_resources",
    arguments: { cursor: { projectId: project.id, afterLinkId: randomUUID() } },
  });
  assert.equal(missing.isError, true);
  assert.deepEqual(missing.structuredContent, { code: "INVALID_REFERENCE" });
  const combined = await issue(
    ["foundation.read", "resources.read"],
    "Explicit combined resource reader",
  );
  const combinedClient = await connect(combined.token);
  assert.ok(
    (
      await call(combinedClient, "get_foundation_identity")
    ).supportedOperations.includes("resources.read"),
  );
  await write(`/api/v1/foundation/clients/${issued.client.id}/revoke`, {}, 200);
  await assert.rejects(
    client.callTool({ name: "list_project_resources", arguments: {} }),
  );
  console.log(
    "Canonical resource built SDK rehearsal passed: explicit isolated grant, 32 connections across three pages, exact UI/digests, repeated resource relationships, parent reference without traversal, invalid cursor restart and revocation.",
  );
}
