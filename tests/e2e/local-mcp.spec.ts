import { randomUUID } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";

test("packet MCP session gives a local client scoped, audited reads and can be revoked", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `MCP ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const otherResponse = await request.post("/api/v1/projects", {
    data: { name: `MCP other ${suffix}`, type: "general" },
  });
  expect(otherResponse.status()).toBe(201);
  const otherProject = await otherResponse.json();
  const captureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `MCP original ${suffix} must remain available`,
    },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filingResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `MCP work ${suffix}`,
        body: "Read the saved evidence locally.",
      },
    },
  );
  expect(filingResponse.status()).toBe(201);
  const work = (await filingResponse.json()).record;
  const packetResponse = await request.post(
    `/api/v1/work-items/${work.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  const agentResponse = await request.post("/api/v1/agents", {
    data: { name: `MCP fake agent ${suffix}` },
  });
  expect(agentResponse.status()).toBe(201);
  const agent = await agentResponse.json();
  const unassignedResponse = await request.post("/api/v1/mcp-sessions", {
    data: { packetId: packet.id, agentId: agent.id },
  });
  expect(unassignedResponse.status()).toBe(403);
  expect((await unassignedResponse.json()).code).toBe("AGENT_NOT_ASSIGNED");
  expect(
    (
      await request.post(`/api/v1/agents/${agent.id}/projects`, {
        data: { projectId: project.id },
      })
    ).status(),
  ).toBe(201);

  await page.goto(`/execution-packets/${packet.id}`);
  await expect(
    page.getByRole("heading", { name: "Open scoped MCP reads" }),
  ).toBeVisible();
  const choice = page.getByRole("combobox", {
    name: "Eligible project-scoped agent",
  });
  while ((await choice.locator(`option[value="${agent.id}"]`).count()) === 0) {
    await page.getByRole("button", { name: "Load more local agents" }).click();
  }
  await choice.selectOption(agent.id);
  const createdResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/mcp-sessions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create local MCP read session" })
    .click();
  const createdResponse = await createdResponsePromise;
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  expect(created.sourceLabel).toBe("Local read-only MCP preview");
  await expect(
    page.getByRole("heading", { name: "Token shown once" }),
  ).toBeVisible();
  await expect(page.getByLabel("One-time local MCP token")).toHaveValue(
    created.token,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const endpoint = new URL("/mcp", baseURL!);
  const missingToken = await request.post(endpoint.toString(), {
    headers: { "content-type": "application/json" },
    data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  expect(missingToken.status()).toBe(401);
  const forwarded = await request.post(endpoint.toString(), {
    headers: {
      authorization: `Bearer ${created.token}`,
      "x-forwarded-host": "outside.example",
    },
    data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  expect(forwarded.status()).toBe(403);
  const crossOrigin = await request.post(endpoint.toString(), {
    headers: {
      authorization: `Bearer ${created.token}`,
      origin: "https://outside.example",
    },
    data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  expect(crossOrigin.status()).toBe(403);

  const client = new Client({
    name: "commandry-local-mcp-test",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    authProvider: { token: async () => created.token },
  });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    expect(tools.tools.map((item) => item.name).sort()).toEqual([
      "get_packet_work",
      "get_project_brief",
    ]);
    expect(tools.tools.every((item) => item.annotations?.readOnlyHint)).toBe(
      true,
    );
    const briefRead = await client.callTool({
      name: "get_project_brief",
      arguments: { projectId: project.id, reason: "Inspect cited context" },
    });
    expect(briefRead.isError).not.toBe(true);
    expect(briefRead.structuredContent).toMatchObject({
      projectId: project.id,
      source: { kind: "project_brief", brief: { project: { id: project.id } } },
    });
    const workRead = await client.callTool({
      name: "get_packet_work",
      arguments: {
        projectId: project.id,
        workItemId: work.id,
        reason: "Inspect bound work",
      },
    });
    expect(workRead.isError).not.toBe(true);
    expect(workRead.structuredContent).toMatchObject({
      source: { kind: "work_item", id: work.id },
    });
    const wrongProject = await client.callTool({
      name: "get_project_brief",
      arguments: {
        projectId: otherProject.id,
        reason: "Check project boundary",
      },
    });
    expect(wrongProject.isError).toBe(true);
    expect(JSON.stringify(wrongProject)).toContain("PROJECT_SCOPE_DENIED");
    const wrongWork = await client.callTool({
      name: "get_packet_work",
      arguments: {
        projectId: project.id,
        workItemId: randomUUID(),
        reason: "Check packet boundary",
      },
    });
    expect(wrongWork.isError).toBe(true);
    expect(JSON.stringify(wrongWork)).toContain("WORK_SCOPE_DENIED");
  } finally {
    await client.close();
  }

  await page
    .getByRole("link", { name: "Review session scope and audit" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/mcp-sessions/${created.id}$`));
  await expect(
    page.getByRole("heading", { name: "Scoped read session" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh session" }).click();
  await expect(page.getByText("PROJECT_SCOPE_DENIED")).toBeVisible();
  await expect(page.getByText("WORK_SCOPE_DENIED")).toBeVisible();
  await expect(page.getByText("CONTEXT_READ_ALLOWED").first()).toBeVisible();
  expect(await page.getByLabel("One-time local MCP token").count()).toBe(0);
  const revokeResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/mcp-sessions/${created.id}/revoke`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Revoke read session" }).click();
  const revokeResponse = await revokeResponsePromise;
  expect(revokeResponse.status()).toBe(200);
  expect((await revokeResponse.json()).revokedAt).toBeTruthy();
  const rejected = await request.post(endpoint.toString(), {
    headers: {
      authorization: `Bearer ${created.token}`,
      accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
  });
  expect(rejected.status()).toBe(401);
  expect((await rejected.json()).code).toBe("SESSION_REVOKED");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
