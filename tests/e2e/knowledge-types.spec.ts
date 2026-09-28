import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Inbox files a typed runbook into project memory, search, brief, and a saved packet", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Typed memory ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const original = `Original restart procedure ${suffix}`;
  const sourceResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: original },
  });
  expect(sourceResponse.status()).toBe(201);
  const source = await sourceResponse.json();

  await page.goto(`/inbox?captureId=${source.id}`);
  await expect(
    page.getByRole("heading", { name: "File this capture" }),
  ).toBeVisible();
  const projectSelect = page.getByLabel("Project *");
  const projectOption = projectSelect.locator(`option[value="${project.id}"]`);
  await expect(projectSelect).toBeEnabled();
  while ((await projectOption.count()) === 0) {
    const previousCount = await projectSelect.locator("option").count();
    const more = page.getByRole("button", { name: "Load more projects" });
    await expect(more).toBeVisible();
    await more.click();
    await expect
      .poll(() => projectSelect.locator("option").count())
      .toBeGreaterThan(previousCount);
  }
  await projectSelect.selectOption(project.id);
  await page.getByLabel("File as").selectOption("note");
  await page.getByLabel("Knowledge type").selectOption("runbook");
  await page.getByLabel("Title *").fill(`Restart runbook ${suffix}`);
  await page
    .getByLabel("Content Optional")
    .fill("Check the local service first");
  await page.getByRole("button", { name: "File as runbook" }).click();
  await expect(
    page.getByText("Filed as a runbook", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open saved Knowledge" }).click();
  await expect(
    page.getByRole("heading", { name: `Restart runbook ${suffix}` }),
  ).toBeVisible();
  await expect(
    page.getByText("Project knowledge / Filed Runbook"),
  ).toBeVisible();
  await page
    .getByLabel("Content", { exact: true })
    .fill("Check the service and restart safely");
  await page.getByRole("button", { name: "Save runbook revision" }).click();
  await expect(
    page.getByText(
      "Knowledge runbook saved. The exact original capture is unchanged.",
    ),
  ).toBeVisible();

  const projectKnowledge = await request.get(
    `/api/v1/projects/${project.id}/knowledge`,
  );
  expect(projectKnowledge.status()).toBe(200);
  const runbook = (await projectKnowledge.json()).items.find(
    (item: { sourceCaptureId: string }) => item.sourceCaptureId === source.id,
  );
  expect(runbook).toMatchObject({ kind: "runbook", version: 2 });
  const search = await request.get(
    `/api/v1/search?q=${suffix}&projectId=${project.id}`,
  );
  expect(search.status()).toBe(200);
  expect((await search.json()).items).toContainEqual(
    expect.objectContaining({ id: runbook.id, kind: "runbook" }),
  );
  const brief = await request.get(`/api/v1/projects/${project.id}/brief`);
  expect(brief.status()).toBe(200);
  const fact = (await brief.json()).sections.knowledge.items.find(
    (item: { id: string }) => item.id === runbook.id,
  );
  expect(fact.detail).toContain("Runbook.");
  expect(fact.evidence).toContainEqual(
    expect.objectContaining({ kind: "capture", id: source.id }),
  );

  const taskSourceResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: `Apply runbook ${suffix}` },
  });
  const taskSource = await taskSourceResponse.json();
  const taskResponse = await request.post(
    `/api/v1/captures/${taskSource.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Apply runbook ${suffix}`,
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).record;
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [runbook.id], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  expect(packet.snapshot.selectedKnowledge[0].kind).toBe("runbook");
  await page.goto(`/execution-packets/${packet.id}`);
  await expect(page.getByText("Saved type: Runbook")).toBeVisible();
  expect(
    (await (await request.get(`/api/v1/captures/${source.id}`)).json())
      .originalContent,
  ).toBe(original);

  await page.goto(`/projects/${project.id}`);
  await expect(
    page
      .getByRole("list", { name: "Project knowledge" })
      .getByText("Runbook", { exact: true }),
  ).toBeVisible();
  await page.goto(`/knowledge?projectId=${project.id}`);
  await expect(page.getByText("Local Runbook")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(pageErrors).toEqual([]);
});
