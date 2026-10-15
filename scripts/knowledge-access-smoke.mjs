import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

// Invoked only by the disposable built-app integration harness.
export async function knowledgeAccessSmoke(origin, cookie, trustedOrigin) {
  const ownerHeaders = {
    cookie,
    origin: trustedOrigin,
    "content-type": "application/json",
  };
  async function write(path, body, status = 201) {
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify(body),
    });
    assert.equal(response.status, status, await response.clone().text());
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  const project = await write("/api/v1/projects", {
    name: "MCP context smoke",
    type: "software",
  });
  const other = await write("/api/v1/projects", {
    name: "MCP private project",
    type: "software",
  });
  async function note(projectId, title, body) {
    const capture = await write("/api/v1/captures", {
      inputType: "text",
      originalContent: body,
    });
    return (
      await write(`/api/v1/captures/${capture.id}/file`, {
        projectId,
        kind: "note",
        title,
        body,
      })
    ).record;
  }
  const first = await note(
    project.id,
    "Kronos conventions",
    "Prefer local tools. ".repeat(1000),
  );
  await note(project.id, "Kronos testing", "Run the appropriate checks.");
  const privateNote = await note(
    other.id,
    "Private evidence",
    "Unrelated personal context",
  );
  assert.equal((await fetch(`${origin}/api/v1/knowledge-clients`)).status, 401);
  assert.equal(
    (
      await fetch(`${origin}/mcp/knowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    401,
  );
  const issued = await write("/api/v1/knowledge-clients", {
    name: "Disposable MCP client",
    projectId: project.id,
    ttlSeconds: 60,
  });
  const client = new Client({
    name: "commandry-knowledge-smoke",
    version: "1.0.0",
  });
  try {
    const list = await fetch(`${origin}/api/v1/knowledge-clients?limit=1`, {
      headers: ownerHeaders,
    });
    assert.equal(list.status, 200);
    assert.equal((await list.text()).includes(issued.token), false);
    const hostile = await fetch(`${origin}/mcp/knowledge`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.token}`,
        origin: "https://untrusted.test",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(hostile.status, 403);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp/knowledge`), {
        requestInit: { headers: { authorization: `Bearer ${issued.token}` } },
      }),
    );
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
      "get_knowledge_item",
      "get_project_brief",
      "list_projects",
      "search_knowledge",
    ]);
    assert.ok(tools.tools.every((t) => t.annotations?.readOnlyHint));
    async function call(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      return result.structuredContent;
    }
    assert.deepEqual(
      (await call("list_projects")).items.map((p) => p.id),
      [project.id],
    );
    assert.equal(
      (await call("get_project_brief")).brief.project.id,
      project.id,
    );
    const page = await call("search_knowledge", { q: "Kronos", limit: 1 });
    assert.equal(page.items.length, 1);
    assert.ok(page.nextCursor);
    const next = await call("search_knowledge", {
      q: "Kronos",
      limit: 1,
      cursor: page.nextCursor,
    });
    assert.equal(next.items.length, 1);
    assert.equal(next.nextCursor, null);
    assert.notEqual(next.items[0].id, page.items[0].id);
    const read = await call("get_knowledge_item", { id: first.id, limit: 40 });
    assert.equal(read.content.length, 40);
    assert.equal(read.nextOffset, 40);
    assert.equal(
      (
        await call("get_knowledge_item", {
          id: first.id,
          offset: 40,
          limit: 40,
        })
      ).version,
      read.version,
    );
    assert.equal(
      (
        await client.callTool({
          name: "get_knowledge_item",
          arguments: { id: privateNote.id },
        })
      ).isError,
      true,
    );
    const ordinaryApi = await fetch(`${origin}/api/v1/projects`, {
      headers: { authorization: `Bearer ${issued.token}` },
    });
    assert.equal(ordinaryApi.status, 401);
    await write(
      `/api/v1/knowledge-clients/${issued.client.id}/revoke`,
      {},
      200,
    );
    await assert.rejects(
      client.callTool({ name: "list_projects", arguments: {} }),
    );
    console.log(
      "Knowledge MCP built-app smoke passed: owner issuance, SDK discovery/tools, scoped reads, pagination, content chunks, origin denial, and immediate revocation.",
    );
  } finally {
    await client.close();
    await write(
      `/api/v1/knowledge-clients/${issued.client.id}/revoke`,
      {},
      200,
    );
  }
}
