import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

async function importSample(
  request: APIRequestContext,
  integrationId: string,
  scenarioId: string,
  occurredAt: string,
) {
  const response = await request.post(
    `/api/v1/integrations/${integrationId}/sample`,
    { data: { scenarioId, occurrenceId: randomUUID(), occurredAt } },
  );
  expect(response.status()).toBe(202);
  const queued = await response.json();
  await expect
    .poll(
      async () => {
        const current = await request.get(
          `/api/v1/synthetic-event-imports/${queued.id}`,
        );
        expect(current.status()).toBe(200);
        return (await current.json()).state;
      },
      { timeout: 60_000 },
    )
    .toBe("succeeded");
}

test("synthetic source and trend signals retain evidence and audited local preferences", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Attention project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `Attention resource ${suffix}`, kind: "service" },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const dependentResponse = await request.post("/api/v1/resources", {
    data: { name: `Attention dependent ${suffix}`, kind: "service" },
  });
  expect(dependentResponse.status()).toBe(201);
  const dependent = await dependentResponse.json();
  const dependencyResponse = await request.post(
    `/api/v1/resources/${dependent.id}/dependencies`,
    { data: { requiredResourceId: resource.id } },
  );
  expect(dependencyResponse.status()).toBe(201);
  const linkResponse = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    { data: { resourceId: resource.id, type: "supports" } },
  );
  expect(linkResponse.status()).toBe(201);
  const dependentLinkResponse = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    { data: { resourceId: dependent.id, type: "supports" } },
  );
  expect(dependentLinkResponse.status()).toBe(201);
  const developmentResponse = await request.post("/api/v1/integrations", {
    data: {
      name: `Attention development ${suffix}`,
      kind: "synthetic-development",
      projectId: project.id,
      resourceId: null,
    },
  });
  expect(developmentResponse.status()).toBe(201);
  const development = await developmentResponse.json();
  const operationsResponse = await request.post("/api/v1/integrations", {
    data: {
      name: `Attention operations ${suffix}`,
      kind: "synthetic-operations",
      projectId: project.id,
      resourceId: resource.id,
    },
  });
  expect(operationsResponse.status()).toBe(201);
  const operations = await operationsResponse.json();
  const now = Date.now();
  await importSample(
    request,
    development.id,
    "development.pr-merged",
    new Date(now - 2 * 60 * 60_000).toISOString(),
  );
  await importSample(
    request,
    operations.id,
    "operations.monitor-recovered",
    new Date(now - 10 * 60_000).toISOString(),
  );
  await importSample(
    request,
    operations.id,
    "operations.monitor-down",
    new Date(now - 5 * 60_000).toISOString(),
  );
  const signalPath = `/api/v1/attention-signals?projectId=${project.id}&view=active&limit=10`;
  await expect
    .poll(
      async () => {
        const response = await request.get(signalPath);
        expect(response.status()).toBe(200);
        return (await response.json()).items.map(
          (item: { ruleId: string }) => item.ruleId,
        );
      },
      { timeout: 30_000 },
    )
    .toEqual(expect.arrayContaining(["source_stale", "metric_drop"]));
  const signalResponse = await request.get(signalPath);
  const signals = (await signalResponse.json()).items as Array<{
    ruleId: string;
    evidenceHref: string;
    previousEvidenceHref: string | null;
    realHealth: string;
  }>;
  expect(signals.length).toBe(2);
  expect(signals.every((item) => item.realHealth === "unknown")).toBe(true);
  for (const signal of signals) {
    expect((await request.get(signal.evidenceHref)).status()).toBe(200);
    if (signal.previousEvidenceHref)
      expect((await request.get(signal.previousEvidenceHref)).status()).toBe(
        200,
      );
  }

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`/attention-signals?projectId=${project.id}`);
  await expect(
    page.getByRole("heading", { name: "Attention signals" }),
  ).toBeVisible();
  const staleCard = page.getByRole("article", {
    name: "Synthetic attention source stale",
  });
  const metricCard = page.getByRole("article", {
    name: "Synthetic attention metric drop",
  });
  await expect(staleCard).toContainText(`Attention development ${suffix}`);
  await expect(metricCard).toContainText(`Attention resource ${suffix}`);
  const impactResponse = await request.get(
    `/api/v1/resources/${resource.id}/impact?limit=20`,
  );
  expect(impactResponse.status()).toBe(200);
  const impact = await impactResponse.json();
  expect(impact.items[0]?.resource.id).toBe(dependent.id);
  expect(impact.items[0]?.projects[0]?.id).toBe(project.id);
  expect(impact.latestSyntheticDrop?.latestValue).toBe(0);
  expect(impact.realHealth).toBe("unknown");
  await metricCard
    .getByRole("link", { name: "Review potential dependency impact" })
    .click();
  const impactSection = page.locator("#dependency-impact");
  await expect(
    impactSection.getByRole("heading", {
      name: "Potential dependency impact",
    }),
  ).toBeVisible();
  await expect(impactSection).toContainText(`Attention dependent ${suffix}`);
  await expect(impactSection).toContainText("Latest active synthetic anomaly");
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await impactSection
    .getByRole("link", { name: "Review this resource's signal history" })
    .click();
  await expect(
    page.getByRole("article", { name: "Synthetic attention metric drop" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Synthetic attention source stale" }),
  ).toHaveCount(0);
  await page.goto(`/attention-signals?projectId=${project.id}`);
  await expect(
    page.getByText("Real source and resource health remain unknown.").first(),
  ).toBeVisible();
  const rulesResponse = await request.get("/api/v1/attention-rules");
  const original = await rulesResponse.json();
  try {
    await page.getByLabel("Show stale synthetic sources").uncheck();
    await page.getByRole("button", { name: "Save local rules" }).click();
    await expect(
      page.getByText(/Local rule preferences saved and audited/),
    ).toBeVisible();
    await expect
      .poll(
        async () => {
          const response = await request.get(signalPath);
          return (await response.json()).items.map(
            (item: { ruleId: string }) => item.ruleId,
          );
        },
        { timeout: 30_000 },
      )
      .toEqual(["metric_drop"]);
    await page.getByRole("button", { name: "Refresh signals" }).click();
    await expect(staleCard).toBeHidden();
    await page.getByRole("button", { name: "All history" }).click();
    await expect(staleCard).toBeVisible();
    await expect(staleCard).toContainText("Last triggering evidence:");
    await expect(
      page.getByText("local_attention.rules_changed").first(),
    ).toBeVisible();
  } finally {
    const currentResponse = await request.get("/api/v1/attention-rules");
    const current = await currentResponse.json();
    const restore = await request.patch("/api/v1/attention-rules", {
      data: {
        expectedVersion: current.version,
        staleSourceEnabled: original.staleSourceEnabled,
        metricDropEnabled: original.metricDropEnabled,
        metricDropPoints: original.metricDropPoints,
      },
    });
    expect(restore.status()).toBe(200);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
