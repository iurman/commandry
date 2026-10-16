import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Only called by the disposable built-server rehearsal with synthetic records.
export async function foundationWorkSmoke({
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
  const expected = new Set();
  let related;
  let link;
  for (let index = 0; index < 33; index++) {
    const primary = index < 31 ? project : other;
    const source = await write("/api/v1/captures", {
      inputType: "text",
      originalContent: `Private synthetic original Work source ${index}`,
    });
    const { record } = await write(`/api/v1/captures/${source.id}/file`, {
      projectId: primary.id,
      kind: "task",
      title: `Rehearsal Work ${index}`,
      body:
        index === 0
          ? " cafe\u0301\r\n Exact selected description "
          : "Selected task description",
    });
    if (index < 32) expected.add(record.id);
    if (index === 31) {
      related = record;
      const connected = await write(
        `/api/v1/work-items/${record.id}/projects`,
        { projectId: project.id },
        200,
      );
      link = connected.link;
    }
  }
  assert.ok(related && link && typeof link.id === "string");
  assert.equal(
    (await existingClient.listTools()).tools.some(
      (tool) => tool.name === "list_project_work",
    ),
    false,
  );
  const issued = await issue(["work.read"], "Explicit canonical Work reader");
  const client = await connect(issued.token);
  assert.deepEqual(
    (await client.listTools()).tools.map((tool) => tool.name),
    ["list_project_work"],
  );
  const seen = new Set();
  let cursor = null;
  let pages = 0;
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
  do {
    const page = await call(client, "list_project_work", { limit: 13, cursor });
    assert.equal(page.consistency, "live");
    assert.equal(page.requestedProjectId, project.id);
    assert.ok(Number.isFinite(Date.parse(page.selectedAt)));
    const query = new URLSearchParams({
      limit: "13",
      ...(cursor ? { cursor: cursor.afterId } : {}),
    });
    const response = await fetch(
      `${origin}/api/v1/projects/${project.id}/work?${query}`,
      { headers: { cookie }, signal: AbortSignal.timeout(15_000) },
    );
    assert.equal(response.status, 200);
    const canonical = await response.json();
    assert.deepEqual(
      page.items.map(({ work }) => work),
      canonical.items,
    );
    for (const item of page.items) {
      assert.equal(seen.has(item.work.id), false);
      seen.add(item.work.id);
      assert.equal(
        item.contentDigest,
        createHash("sha256")
          .update(JSON.stringify(stable(item.work)))
          .digest("hex"),
      );
      if (item.work.id === related.id) {
        assert.equal(item.work.projectId, other.id);
        assert.equal(item.work.contextLink.projectId, project.id);
      }
    }
    assert.equal(
      JSON.stringify(page).includes("Private synthetic original Work source"),
      false,
    );
    cursor = page.nextCursor;
    pages++;
  } while (cursor);
  assert.equal(pages, 3);
  assert.deepEqual(seen, expected);
  const forged = await client.callTool({
    name: "list_project_work",
    arguments: { projectId: other.id },
  });
  assert.equal(forged.isError, true);
  assert.deepEqual(forged.structuredContent, { code: "INVALID_INPUT" });
  const combined = await issue(
    ["foundation.read", "work.read"],
    "Explicit combined Work reader",
  );
  const combinedClient = await connect(combined.token);
  assert.ok(
    (
      await call(combinedClient, "get_foundation_identity")
    ).supportedOperations.includes("work.read"),
  );
  await write(
    `/api/v1/work-project-links/${link.id}/archive`,
    {},
    200,
    undefined,
    "PUT",
  );
  const invalidated = await client.callTool({
    name: "list_project_work",
    arguments: { cursor: { projectId: project.id, afterId: related.id } },
  });
  assert.equal(invalidated.isError, true);
  assert.deepEqual(invalidated.structuredContent, {
    code: "INVALID_REFERENCE",
  });
  await write(`/api/v1/foundation/clients/${issued.client.id}/revoke`, {}, 200);
  await assert.rejects(
    client.callTool({ name: "list_project_work", arguments: {} }),
  );
  console.log(
    "Canonical Work built SDK rehearsal passed: explicit isolated grant, 32 canonical records across three pages, linked primary ownership, exact digests, UI equivalence, no raw originals, cursor restart and revocation.",
  );
}
