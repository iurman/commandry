import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("synthetic availability rule produces a source-linked run after a crossing", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const suffix = randomUUID().slice(0, 8);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Condition routine ${suffix}`, type: "software" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `Condition service ${suffix}`, kind: "service" },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const linkResponse = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    { data: { resourceId: resource.id, type: "supports" } },
  );
  expect(linkResponse.status()).toBe(201);

  await page.goto("/automations");
  await page.getByLabel("Name").fill(`Availability ${suffix}`);
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
  await page.getByLabel("Trigger").selectOption("synthetic_condition");
  const resourceChoice = page.getByLabel("Linked resource to watch");
  await expect(
    resourceChoice.locator(`option[value="${resource.id}"]`),
  ).toHaveCount(1);
  await resourceChoice.selectOption(resource.id);
  await page.getByLabel("At or below availability (%)").fill("50");
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
    triggerType: "synthetic_condition",
    projectId: project.id,
    condition: {
      resourceId: resource.id,
      metricName: "external_availability",
      operator: "lte",
      thresholdPercent: 50,
    },
  });
  await page.getByRole("link", { name: `Availability ${suffix}` }).click();
  await expect(
    page.getByText("Synthetic external availability at or below 50%"),
  ).toBeVisible();

  const baseTime = Date.now() - 10 * 60_000;
  async function importSample(
    scenarioId: "operations.monitor-down" | "operations.monitor-recovered",
    sequence: number,
  ) {
    const response = await request.post("/api/v1/synthetic-event-imports", {
      data: {
        scenarioId,
        projectId: project.id,
        resourceId: resource.id,
        occurrenceId: `browser-condition-automation:${randomUUID()}`,
        occurredAt: new Date(baseTime + sequence * 60_000).toISOString(),
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

  const first = await importSample("operations.monitor-down", 0);
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/automations/${definition.id}/runs?limit=10`,
        );
        return (await response.json()).items.find(
          (run: { sourceEventId: string }) =>
            run.sourceEventId === first.eventId,
        )?.state;
      },
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  const runResponse = await request.get(
    `/api/v1/automations/${definition.id}/runs?limit=10`,
  );
  const firstRun = (await runResponse.json()).items.find(
    (run: { sourceEventId: string }) => run.sourceEventId === first.eventId,
  );
  expect(firstRun.sourceMetricSampleId).toBeTruthy();
  const metricResponse = await request.get(
    `/api/v1/metrics/${firstRun.sourceMetricSampleId}`,
  );
  expect(metricResponse.status()).toBe(200);
  expect(await metricResponse.json()).toMatchObject({
    id: firstRun.sourceMetricSampleId,
    eventId: first.eventId,
    projectId: project.id,
    resourceId: resource.id,
    value: 0,
    isSynthetic: true,
  });
  expect(firstRun.result.evidence).toContainEqual(
    expect.objectContaining({
      kind: "metric_sample",
      id: firstRun.sourceMetricSampleId,
      href: `/api/v1/metrics/${firstRun.sourceMetricSampleId}`,
      isSynthetic: true,
    }),
  );
  expect(firstRun.result.externalActions).toEqual([]);
  await expect(page.getByText("Synthetic condition run")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "synthetic metric sample" }),
  ).toHaveAttribute("href", `/api/v1/metrics/${firstRun.sourceMetricSampleId}`);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
