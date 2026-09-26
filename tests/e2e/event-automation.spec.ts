import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("synthetic event routine creates a source-linked worker run and records disabled skips", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Event routine ${suffix}`, type: "software" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `Event service ${suffix}`, kind: "service" },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const linkResponse = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    { data: { resourceId: resource.id, type: "supports" } },
  );
  expect(linkResponse.status()).toBe(201);

  await page.goto("/automations");
  await page.getByLabel("Name").fill(`Investigate ${suffix}`);
  const projectChoice = page.getByLabel("Project", { exact: true });
  const option = projectChoice.locator(`option[value="${project.id}"]`);
  while ((await option.count()) === 0) {
    const before = await projectChoice.locator("option").count();
    await page
      .getByRole("button", { name: "Load more project choices" })
      .click();
    await expect
      .poll(() => projectChoice.locator("option").count())
      .toBeGreaterThan(before);
  }
  await projectChoice.selectOption(project.id);
  await page.getByLabel("Trigger").selectOption("synthetic_event");
  await page.getByLabel("Matching event").selectOption("monitor.down");
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/automations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create local routine" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const definition = await createResponse.json();
  expect(definition).toMatchObject({
    projectId: project.id,
    triggerType: "synthetic_event",
    eventType: "monitor.down",
    enabled: true,
  });
  await page.getByRole("link", { name: `Investigate ${suffix}` }).click();
  await expect(page.getByText("monitor.down (synthetic only)")).toBeVisible();
  const emptyRuns = await request.get(
    `/api/v1/automations/${definition.id}/runs`,
  );
  expect((await emptyRuns.json()).items).toHaveLength(0);

  async function importDown() {
    const response = await request.post("/api/v1/synthetic-event-imports", {
      data: {
        scenarioId: "operations.monitor-down",
        projectId: project.id,
        resourceId: resource.id,
        occurrenceId: `browser-event-automation:${randomUUID()}`,
      },
    });
    expect(response.status()).toBe(202);
    const queued = await response.json();
    await expect
      .poll(
        async () => {
          const status = await request.get(
            `/api/v1/synthetic-event-imports/${queued.id}`,
          );
          return (await status.json()).state;
        },
        { timeout: 60_000 },
      )
      .toBe("succeeded");
    const status = await request.get(
      `/api/v1/synthetic-event-imports/${queued.id}`,
    );
    return status.json();
  }

  const firstImport = await importDown();
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/automations/${definition.id}/runs?limit=10`,
        );
        const runs = (await response.json()).items;
        return runs.find(
          (run: { sourceEventId: string }) =>
            run.sourceEventId === firstImport.eventId,
        )?.state;
      },
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  const runsResponse = await request.get(
    `/api/v1/automations/${definition.id}/runs`,
  );
  const firstRun = (await runsResponse.json()).items.find(
    (run: { sourceEventId: string }) =>
      run.sourceEventId === firstImport.eventId,
  );
  expect(firstRun).toMatchObject({
    trigger: "synthetic_event",
    sourceEventId: firstImport.eventId,
    state: "succeeded",
  });
  expect(firstRun.result.evidence).toContainEqual(
    expect.objectContaining({
      kind: "event",
      id: firstImport.eventId,
      isSynthetic: true,
    }),
  );
  expect(firstRun.result.externalActions).toEqual([]);
  await expect(page.getByText("Synthetic event run")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "synthetic source event" }),
  ).toHaveAttribute("href", `/api/v1/events/${firstImport.eventId}`);

  await page.getByRole("button", { name: "Disable routine" }).click();
  const disabledImport = await importDown();
  await expect
    .poll(async () => {
      const response = await request.get(
        `/api/v1/automations/${definition.id}/runs?limit=10`,
      );
      return (await response.json()).items.find(
        (run: { sourceEventId: string }) =>
          run.sourceEventId === disabledImport.eventId,
      )?.state;
    })
    .toBe("skipped");
  await page.reload();
  await expect(
    page.getByText("Disabled when synthetic event was processed"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
