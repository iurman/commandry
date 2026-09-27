import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("recurring Work creates a source-linked task through the local worker", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Recurring Work ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const original = `Original recurring Work source ${suffix}`;
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: original },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filedResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Inspect recurring source ${suffix}`,
        body: "Use the preserved local source",
      },
    },
  );
  expect(filedResponse.status()).toBe(201);
  const task = (await filedResponse.json()).record;

  await page.goto(`/work-items/${task.id}`);
  const recurrence = page.getByRole("region", { name: "Recurrence" });
  await expect(
    recurrence.getByRole("heading", { name: "Recurrence" }),
  ).toBeVisible();
  await recurrence
    .getByLabel("Start at (UTC)")
    .fill(new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 16));
  await recurrence.getByLabel("Repeat every (minutes)").fill("5");
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/work-items/${task.id}/recurrence`) &&
      response.request().method() === "POST",
  );
  await recurrence.getByRole("button", { name: "Create recurrence" }).click();
  expect((await createdResponse).status()).toBe(201);
  await expect(
    recurrence.getByText("Local recurring Work scheduled", { exact: false }),
  ).toBeVisible();
  const definition = await (
    await request.get(`/api/v1/work-items/${task.id}/recurrence`)
  ).json();
  expect(definition.definition.sourceOfTruth).toBe("local-only");
  const accelerated = await request.put(
    `/api/v1/work-items/${task.id}/recurrence`,
    {
      data: {
        expectedUpdatedAt: definition.definition.updatedAt,
        startAt: new Date(Date.now() + 3_000).toISOString(),
        everyMinutes: 5,
        enabled: true,
      },
    },
  );
  expect(accelerated.status()).toBe(200);
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/work-items/${task.id}/recurrence/occurrences`,
        );
        return (await response.json()).items[0]?.state;
      },
      { timeout: 45_000 },
    )
    .toBe("generated");
  const occurrences = await (
    await request.get(`/api/v1/work-items/${task.id}/recurrence/occurrences`)
  ).json();
  const occurrence = occurrences.items[0];
  expect(occurrence).toMatchObject({
    sourceLabel: "Local worker-created task",
    attempts: 1,
    externalActions: [],
  });
  const generated = await (
    await request.get(`/api/v1/work-items/${occurrence.generatedWorkItemId}`)
  ).json();
  expect(generated.generatedFromWorkItemId).toBe(task.id);
  expect(generated.sourceCaptureId).toBe(capture.id);
  expect(generated.projectId).toBe(project.id);
  expect(generated.assigneeKind).toBe("unassigned");
  expect(
    (await (await request.get(`/api/v1/captures/${capture.id}`)).json())
      .originalContent,
  ).toBe(original);
  const brief = await (
    await request.get(`/api/v1/projects/${project.id}/brief`)
  ).json();
  const fact = brief.sections.work.items.find(
    (item: { id: string }) => item.id === generated.id,
  );
  expect(fact.sourceLabel).toBe("Local worker-created task");
  expect(fact.evidence).toContainEqual(
    expect.objectContaining({
      kind: "work_recurrence_occurrence",
      id: occurrence.id,
    }),
  );

  await page.reload();
  const history = page.getByRole("region", { name: "Recurrence" });
  await expect(
    history.getByRole("link", { name: "Open generated task" }),
  ).toHaveAttribute("href", `/work-items/${generated.id}`);
  await history.getByLabel("Enabled").uncheck();
  await history.getByRole("button", { name: "Save recurrence" }).click();
  await expect(
    history.getByText("Current state: paused", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  await page.goto(`/work-items/${generated.id}`);
  await expect(page.getByText(/local worker-created task/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View recurring source task" }),
  ).toHaveAttribute("href", `/work-items/${task.id}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(
    (
      await request.post(`/api/v1/work-items/${generated.id}/status`, {
        data: { expectedStatus: "open", status: "done" },
      })
    ).status(),
  ).toBe(200);
  expect(errors).toEqual([]);
});
