import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("configured local sources carry synthetic development and operations samples into project activity", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Integration project ${suffix}`, type: "software" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `Integration service ${suffix}`, kind: "service" },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const linkResponse = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    {
      data: { resourceId: resource.id, type: "supports" },
    },
  );
  expect(linkResponse.status()).toBe(201);

  await page.goto("/integrations");
  await expect(
    page.getByRole("heading", { name: "Integrations" }),
  ).toBeVisible();
  await expect(
    page.getByText("Live providers and credentials are not configured."),
  ).toBeVisible();
  await expect(page.getByText("Loading integrations...")).toBeHidden();
  const projectSelect = page.getByLabel("Project", { exact: true });
  const projectOption = projectSelect.locator(`option[value="${project.id}"]`);
  while ((await projectOption.count()) === 0) {
    await page.getByRole("button", { name: "Load more projects" }).click();
  }
  await projectSelect.selectOption(project.id);

  await page.getByLabel("Source name").fill(`Repository fixture ${suffix}`);
  await page.getByRole("button", { name: "Add local source" }).click();
  const development = page
    .getByRole("article")
    .filter({ hasText: `Repository fixture ${suffix}` });
  await expect(development).toContainText("Synthetic development");
  await expect(development).toContainText("no live provider");
  await development.getByRole("button", { name: "Simulate PR merge" }).click();
  await expect(
    page.getByRole("region", { name: "Latest sample receipt" }),
  ).toContainText("succeeded", { timeout: 60_000 });
  await expect(
    page
      .getByRole("region", { name: "Latest sample receipt" })
      .getByRole("link", { name: "Original synthetic envelope" }),
  ).toBeVisible();
  await expect(development).toContainText("Last success:");

  const connector = development.getByRole("region", {
    name: "Local synthetic connector rehearsal",
  });
  await connector.getByRole("button", { name: "Create local token" }).click();
  await expect(connector).toContainText(
    "Local synthetic receiver token, shown once",
  );
  const configured = await request.get("/api/v1/integrations");
  const developmentId = (await configured.json()).items.find(
    (item: { name: string }) => item.name === `Repository fixture ${suffix}`,
  ).id;
  const receiverDenied = await request.post(
    `/api/v1/integrations/${developmentId}/receive`,
    {
      data: {
        scenarioId: "development.pr-merged",
        occurrenceId: `missing-token-${suffix}`,
      },
    },
  );
  expect(receiverDenied.status()).toBe(401);
  const receiverResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/receive") &&
      response.request().method() === "POST",
  );
  await connector
    .getByRole("button", { name: "Send PR merge to receiver" })
    .click();
  const received = await (await receiverResponse).json();
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/synthetic-event-imports/${received.id}`,
        );
        return (await response.json()).state;
      },
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  const receiverEnvelope = await request.get(
    `/api/v1/source-envelopes/${received.sourceEnvelopeId}`,
  );
  expect((await receiverEnvelope.json()).rawPayload.ingressMode).toBe(
    "local-receiver",
  );

  await connector
    .getByRole("button", { name: "Queue PR merge for local poll" })
    .click();
  let feedImportId: string | null = null;
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/integrations/${developmentId}/poll-feed`,
        );
        const first = (await response.json()).items[0];
        if (!first) return "pending";
        feedImportId = first.importId;
        return first.state;
      },
      { timeout: 60_000 },
    )
    .toBe("submitted");
  expect(feedImportId).not.toBeNull();
  await connector.getByRole("button", { name: "Refresh feed" }).click();
  await expect(connector).toContainText("submitted");
  const pollReceipt = await request.get(
    `/api/v1/synthetic-event-imports/${feedImportId}`,
  );
  const pollEnvelope = await request.get(
    `/api/v1/source-envelopes/${(await pollReceipt.json()).sourceEnvelopeId}`,
  );
  expect((await pollEnvelope.json()).rawPayload.ingressMode).toBe(
    "local-poll-feed",
  );

  await page.getByLabel("Source category").selectOption("synthetic-operations");
  await page.getByLabel("Source name").fill(`Operations fixture ${suffix}`);
  const resourceSelect = page.getByLabel("Linked resource");
  const resourceOption = resourceSelect.locator(
    `option[value="${resource.id}"]`,
  );
  await expect(resourceOption).toBeAttached();
  await resourceSelect.selectOption(resource.id);
  await page.getByRole("button", { name: "Add local source" }).click();
  const operations = page
    .getByRole("article")
    .filter({ hasText: `Operations fixture ${suffix}` });
  await expect(operations).toContainText(resource.name);
  const sourcePage = await request.get(
    `/api/v1/integrations?projectId=${project.id}`,
  );
  const operationsId = (await sourcePage.json()).items.find(
    (item: { name: string }) => item.name === `Operations fixture ${suffix}`,
  ).id;
  const oldObservation = await request.post(
    `/api/v1/integrations/${operationsId}/sample`,
    {
      data: {
        scenarioId: "operations.monitor-down",
        occurrenceId: `old-monitor-${suffix}`,
        occurredAt: new Date(Date.now() - 120 * 60_000).toISOString(),
      },
    },
  );
  expect(oldObservation.status()).toBe(202);
  const oldImport = await oldObservation.json();
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/synthetic-event-imports/${oldImport.id}`,
        );
        return (await response.json()).state;
      },
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  await page.reload();
  await expect(operations).toContainText("Synthetic observation: stale");
  await operations
    .getByLabel("Synthetic freshness window, minutes")
    .fill("180");
  await operations.getByRole("button", { name: "Save window" }).click();
  await expect(operations).toContainText("Synthetic observation: fresh");
  await operations.getByRole("button", { name: "Load recent imports" }).click();
  await expect(
    operations.getByRole("region", {
      name: `Synthetic source history for Operations fixture ${suffix}`,
    }),
  ).toContainText("operations.monitor-down");
  const scopedImports = await request.get(
    `/api/v1/synthetic-event-imports?integrationInstanceId=${operationsId}`,
  );
  const scopedItems = (await scopedImports.json()).items;
  expect(scopedItems.length).toBeGreaterThan(0);
  expect(
    scopedItems.every(
      (entry: { integrationInstanceId: string }) =>
        entry.integrationInstanceId === operationsId,
    ),
  ).toBe(true);
  const sampleResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/sample") &&
      response.request().method() === "POST",
  );
  await operations
    .getByRole("button", { name: "Simulate monitor down" })
    .click();
  const queued = await (await sampleResponse).json();
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/synthetic-event-imports/${queued.id}`,
        );
        return (await response.json()).state;
      },
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  await expect(
    page.getByRole("region", { name: "Latest sample receipt" }),
  ).toContainText("succeeded", { timeout: 60_000 });
  const activityLink = operations.getByRole("link", { name: "Activity" });
  await expect(activityLink).toHaveAttribute(
    "href",
    `/activity?projectId=${project.id}`,
  );
  const attention = await request.get(
    `/api/v1/attention?projectId=${project.id}`,
  );
  expect(attention.status()).toBe(200);
  expect((await attention.json()).items).toEqual([
    expect.objectContaining({ resourceId: resource.id, isSynthetic: true }),
  ]);
  await operations.getByRole("button", { name: "Disable source" }).click();
  await expect(
    operations.getByRole("button", { name: "Simulate monitor down" }),
  ).toBeDisabled();
  await expect(operations).toContainText("Disabled");
  await page.goto(`/activity?projectId=${project.id}`);
  await expect(
    page.getByRole("list", { name: "Active synthetic attention" }),
  ).toContainText(resource.name);
  await page.goto(`/resources/${resource.id}`);
  await expect(
    page.getByRole("region", { name: "Synthetic source freshness" }),
  ).toContainText(`Operations fixture ${suffix}`);
  await expect(
    page.getByRole("region", { name: "Synthetic source freshness" }),
  ).toContainText("Real resource health remains unknown");
  await page.goto(`/projects/${project.id}`);
  await page.getByRole("link", { name: "Configure local sources" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/integrations\\?projectId=${project.id}$`),
  );
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(
    project.id,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
