import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("synthetic operations import shows source-backed attention without changing real health", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Automated test signal ${suffix}`, type: "software" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `Automated test service ${suffix}`, kind: "service" },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const linkResponse = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    { data: { resourceId: resource.id, type: "supports" } },
  );
  expect(linkResponse.status()).toBe(201);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`/activity?projectId=${project.id}`);
  await expect(page.getByRole("heading", { name: /Activity/ })).toBeVisible();

  const projectSelect = page.getByLabel("Project", { exact: true });
  const projectOption = projectSelect.locator(`option[value="${project.id}"]`);
  await expect(projectSelect).toBeEnabled();
  while ((await projectOption.count()) === 0) {
    const more = page.getByRole("button", { name: "Load more projects" });
    await expect(more).toBeVisible();
    await more.click();
  }
  if ((await projectSelect.inputValue()) !== project.id) {
    await projectSelect.selectOption(project.id);
  }

  const resourceSelect = page.getByLabel("Linked resource");
  const resourceOption = resourceSelect.locator(
    `option[value="${resource.id}"]`,
  );
  await expect(resourceSelect).toBeEnabled();
  while ((await resourceOption.count()) === 0) {
    const more = page.getByRole("button", {
      name: "Load more linked resources",
    });
    await expect(more).toBeVisible();
    await more.click();
  }
  await resourceSelect.selectOption(resource.id);
  const scenarioSelect = page.getByLabel("Synthetic scenario");

  async function importThroughUi(scenarioId: string) {
    await scenarioSelect.selectOption(scenarioId);
    await page.getByLabel("Synthetic occurrence ID").fill(randomUUID());
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/synthetic-event-imports") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Import synthetic event" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(202);
    const submitted = await response.json();
    await expect
      .poll(
        async () => {
          const status = await request.get(
            `/api/v1/synthetic-event-imports/${submitted.id}`,
          );
          if (!status.ok()) return `http-${status.status()}`;
          return (await status.json()).state;
        },
        { timeout: 30_000 },
      )
      .toBe("succeeded");
    return submitted;
  }

  const down = await importThroughUi("operations.monitor-down");
  await page.reload();
  await expect(
    page.getByText("Synthetic event", { exact: true }).first(),
  ).toBeVisible();
  const evidenceLink = page.getByRole("link", {
    name: "Inspect synthetic source envelope",
  });
  await expect(evidenceLink.first()).toBeVisible();
  await expect(evidenceLink.first()).toHaveAttribute(
    "href",
    new RegExp(`/api/v1/source-envelopes/${down.sourceEnvelopeId}$`),
  );
  await expect(
    page.getByRole("list", { name: "Active synthetic attention" }),
  ).toContainText(resource.name);

  const attentionResponse = await request.get(
    `/api/v1/attention?projectId=${project.id}`,
  );
  expect(attentionResponse.status()).toBe(200);
  const attention = await attentionResponse.json();
  expect(attention.items).toEqual([
    expect.objectContaining({ isSynthetic: true, projectId: project.id }),
  ]);

  if ((await projectSelect.inputValue()) !== project.id) {
    await projectSelect.selectOption(project.id);
  }
  await expect(resourceOption).toBeAttached();
  await resourceSelect.selectOption(resource.id);
  await importThroughUi("operations.monitor-recovered");
  await expect
    .poll(async () => {
      const response = await request.get(
        `/api/v1/attention?projectId=${project.id}`,
      );
      return (await response.json()).items.length;
    })
    .toBe(0);

  const development = await importThroughUi("development.pr-merged");
  const developmentResponse = await request.get(
    `/api/v1/synthetic-event-imports/${development.id}`,
  );
  const completedDevelopment = await developmentResponse.json();
  const developmentEnvelopeResponse = await request.get(
    `/api/v1/source-envelopes/${completedDevelopment.sourceEnvelopeId}`,
  );
  expect(developmentEnvelopeResponse.status()).toBe(200);
  const developmentEnvelope = await developmentEnvelopeResponse.json();
  expect(developmentEnvelope.sourceKind).toBe("synthetic-development");
  expect(developmentEnvelope.isSynthetic).toBe(true);

  const realResourceResponse = await request.get(
    `/api/v1/resources/${resource.id}`,
  );
  expect(realResourceResponse.status()).toBe(200);
  const realResource = await realResourceResponse.json();
  expect(realResource.state).toBeNull();
  expect(realResource.lastObservedAt).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
