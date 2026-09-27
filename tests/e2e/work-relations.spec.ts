import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("project tasks form audited subtasks and blockers that change brief and overnight readiness", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Work graph ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  async function task(name: string) {
    const captured = await request.post("/api/v1/captures", {
      data: {
        inputType: "text",
        originalContent: `Original source for ${name}`,
      },
    });
    expect(captured.status()).toBe(201);
    const source = await captured.json();
    const filed = await request.post(`/api/v1/captures/${source.id}/file`, {
      data: { projectId: project.id, kind: "task", title: name },
    });
    expect(filed.status()).toBe(201);
    return (await filed.json()).record;
  }
  const parent = await task(`Plan ${suffix}`);
  const child = await task(`Implement ${suffix}`);
  const blocker = await task(`Review dependency ${suffix}`);
  const packetResponse = await request.post(
    `/api/v1/work-items/${child.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  const agentResponse = await request.post("/api/v1/agents", {
    data: { name: `Graph fake agent ${suffix}` },
  });
  expect(agentResponse.status()).toBe(201);
  const agent = await agentResponse.json();
  expect(
    (
      await request.post(`/api/v1/agents/${agent.id}/projects`, {
        data: { projectId: project.id },
      })
    ).status(),
  ).toBe(201);

  await page.goto(`/work-items/${child.id}`);
  await expect(
    page.getByRole("heading", { name: "Subtasks and blockers" }),
  ).toBeVisible();
  const candidate = page.getByLabel("Project task");
  await expect(candidate.locator(`option[value="${parent.id}"]`)).toHaveCount(
    1,
  );
  await candidate.selectOption(parent.id);
  const parentCreate = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/work-item-relations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add relationship" }).click();
  expect((await parentCreate).status()).toBe(201);
  await expect(
    page
      .getByRole("list", { name: "incoming work relationships" })
      .getByText(parent.title),
  ).toBeVisible();
  await page
    .getByLabel("Relationship", { exact: true })
    .selectOption("blocked_by");
  await expect(candidate.locator(`option[value="${blocker.id}"]`)).toHaveCount(
    1,
  );
  await candidate.selectOption(blocker.id);
  const blockCreate = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/work-item-relations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add relationship" }).click();
  const blockResponse = await blockCreate;
  expect(blockResponse.status()).toBe(201);
  const relation = await blockResponse.json();
  await expect(
    page.getByText(`Visible open blockers: ${blocker.title}.`),
  ).toBeVisible();

  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  const childFact = brief.sections.work.items.find(
    (item: { id: string }) => item.id === child.id,
  );
  expect(childFact.detail).toContain(blocker.title);
  expect(childFact.evidence).toContainEqual(
    expect.objectContaining({
      kind: "work_item_relation",
      id: relation.id,
      href: `/api/v1/work-item-relations/${relation.id}`,
    }),
  );
  const blockedReadiness = await request.get(
    `/api/v1/overnight/readiness?packetId=${packet.id}&agentId=${agent.id}`,
  );
  expect(blockedReadiness.status()).toBe(200);
  const blocked = await blockedReadiness.json();
  expect(blocked.ready).toBe(false);
  expect(
    blocked.checks.find((check: { key: string }) => check.key === "blockers")
      ?.ok,
  ).toBe(false);
  const denied = await request.post("/api/v1/overnight", {
    data: {
      packetId: packet.id,
      agentId: agent.id,
      runAfter: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  expect(denied.status()).toBe(409);

  const incoming = page.getByRole("list", {
    name: "incoming work relationships",
  });
  await incoming
    .getByRole("listitem")
    .filter({ hasText: blocker.title })
    .getByRole("button", { name: "Remove relationship" })
    .click();
  await expect(
    page.getByText("Work relationship removed from active context.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    (
      await (
        await request.get(`/api/v1/work-item-relations/${relation.id}`)
      ).json()
    ).state,
  ).toBe("archived");
  const ready = await request.get(
    `/api/v1/overnight/readiness?packetId=${packet.id}&agentId=${agent.id}`,
  );
  expect((await ready.json()).ready).toBe(true);
  await page.goto(`/work-items/${parent.id}`);
  await expect(
    page
      .getByRole("list", { name: "outgoing work relationships" })
      .getByText(child.title),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
