import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Inbox files an initiative and its typed subtask keeps one original and exact hierarchy", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Typed work ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const original = `Original initiative thought ${suffix}`;
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: original },
  });
  expect(captureResponse.status()).toBe(201);
  const initiativeCapture = await captureResponse.json();
  await page.goto(`/inbox?captureId=${initiativeCapture.id}`);
  await expect(
    page.getByRole("heading", { name: "File this capture" }),
  ).toBeVisible();
  const projectSelect = page.getByLabel("Project *");
  const projectOption = projectSelect.locator(`option[value="${project.id}"]`);
  while ((await projectOption.count()) === 0) {
    const previousCount = await projectSelect.locator("option").count();
    await page.getByRole("button", { name: "Load more projects" }).click();
    await expect
      .poll(() => projectSelect.locator("option").count())
      .toBeGreaterThan(previousCount);
  }
  await projectSelect.selectOption(project.id);
  await page.getByLabel("File as").selectOption("task");
  await page.getByLabel("Work type").selectOption("initiative");
  await page.getByLabel("Title *").fill(`Improve lab ${suffix}`);
  await page.getByLabel("Description Optional").fill("Connect several tasks");
  await page.getByRole("button", { name: "File as initiative" }).click();
  await expect(
    page.getByText("Filed as an initiative", { exact: false }),
  ).toBeVisible();
  const initiativeList = await request.get(
    `/api/v1/projects/${project.id}/work`,
  );
  const initiative = (await initiativeList.json()).items.find(
    (item: { title: string }) => item.title === `Improve lab ${suffix}`,
  );
  expect(initiative?.workType).toBe("initiative");
  await page.getByRole("link", { name: "Open saved Work item" }).click();
  await expect(
    page.getByRole("heading", { name: `Improve lab ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByText("Project work / Filed initiative")).toBeVisible();
  const taskSourceResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `Original child thought ${suffix}`,
    },
  });
  const taskSource = await taskSourceResponse.json();
  const taskResponse = await request.post(
    `/api/v1/captures/${taskSource.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Inspect child sensor ${suffix}`,
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).record;
  await page.reload();
  await page.getByLabel("Project task").selectOption(task.id);
  await page.getByRole("button", { name: "Add relationship" }).click();
  await expect(
    page.getByText("Work relationship saved and audited."),
  ).toBeVisible();
  const currentResponse = await request.get(`/api/v1/work-items/${task.id}`);
  expect((await currentResponse.json()).workType).toBe("subtask");
  const searchResponse = await request.get(
    `/api/v1/search?q=${suffix}&projectId=${project.id}`,
  );
  const search = await searchResponse.json();
  expect(search.items).toContainEqual(
    expect.objectContaining({ id: initiative.id, kind: "initiative" }),
  );
  expect(search.items).toContainEqual(
    expect.objectContaining({ id: task.id, kind: "subtask" }),
  );
  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  const brief = await briefResponse.json();
  const childFact = brief.sections.work.items.find(
    (item: { id: string }) => item.id === task.id,
  );
  expect(childFact.detail).toContain("Subtask.");
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  expect(packet.snapshot.objective.workType).toBe("subtask");
  await page.goto(`/projects/${project.id}`);
  await expect(
    page
      .getByRole("list", { name: "Project work" })
      .getByText("subtask / open"),
  ).toBeVisible();
  await page.goto(`/work-items/${initiative.id}`);
  await page
    .getByRole("list", { name: "outgoing work relationships" })
    .getByRole("listitem")
    .filter({ hasText: task.title })
    .getByRole("button", { name: "Remove relationship" })
    .click();
  await expect(
    page.getByText("Work relationship removed from active context.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/v1/work-items/${task.id}`)).json())
      .workType,
  ).toBe("task");
  expect(
    (await (await request.get(`/api/v1/execution-packets/${packet.id}`)).json())
      .snapshot.objective.workType,
  ).toBe("subtask");
  expect(
    (
      await (
        await request.get(`/api/v1/captures/${initiativeCapture.id}`)
      ).json()
    ).originalContent,
  ).toBe(original);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
