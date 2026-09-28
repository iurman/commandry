import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

async function createResource(
  request: APIRequestContext,
  name: string,
  kind: string,
) {
  const response = await request.post("/api/v1/resources", {
    data: { name, kind },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function loadResourceOption(page: Page, selectLabel: string, id: string) {
  const select = page.getByLabel(selectLabel);
  const option = select.locator(`option[value="${id}"]`);
  const more = page.getByRole("button", {
    name: "Load more resource choices",
  });
  while ((await option.count()) === 0) {
    await expect
      .poll(
        async () => (await option.count()) > 0 || (await more.count()) > 0,
        { timeout: 15_000 },
      )
      .toBe(true);
    if ((await option.count()) > 0) break;
    const before = await select.locator("option").count();
    await more.click();
    await expect
      .poll(() => select.locator("option").count())
      .toBeGreaterThan(before);
  }
  await select.selectOption(id);
}

test("resource tree, dependency inverse, and labeled synthetic context stay distinct from real health", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const token = `Topology${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `${token} project`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  await page.goto("/infrastructure");
  await page.getByLabel("Name *").fill(`${token} provider`);
  await page.getByLabel("Kind *").fill("provider");
  const providerResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/resources") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add resource" }).click();
  const providerResponse = await providerResponsePromise;
  expect(providerResponse.status()).toBe(201);
  const provider = await providerResponse.json();
  await expect(
    page.getByRole("list", { name: "Resource hierarchy" }).getByRole("link", {
      name: provider.name,
    }),
  ).toBeVisible();
  const service = await createResource(request, `${token} service`, "service");
  const database = await createResource(
    request,
    `${token} database`,
    "database",
  );
  for (const resource of [service, database]) {
    const linked = await request.post(
      `/api/v1/projects/${project.id}/resources`,
      { data: { resourceId: resource.id, type: "supports" } },
    );
    expect(linked.status()).toBe(201);
  }

  await page.goto(`/resources/${service.id}`);
  await expect(
    page.getByText(
      "Manual record. No operational observation has been recorded.",
    ),
  ).toBeVisible();
  await loadResourceOption(page, "Contained by", provider.id);
  await page.getByRole("button", { name: "Save primary parent" }).click();
  await expect(page.getByText("Primary parent updated.")).toBeVisible();
  await loadResourceOption(page, "Depends on", database.id);
  await page.getByRole("button", { name: "Add dependency" }).click();
  await expect(
    page
      .getByRole("list", { name: "Resource dependencies" })
      .getByRole("link", {
        name: database.name,
      }),
  ).toBeVisible();

  const invalidCycle = await request.put(
    `/api/v1/resources/${provider.id}/parent`,
    { data: { expectedParentResourceId: null, parentResourceId: service.id } },
  );
  expect(invalidCycle.status()).toBe(409);
  expect((await invalidCycle.json()).code).toBe("HIERARCHY_CYCLE");
  const sharedLink = await request.get(
    `/api/v1/projects/${project.id}/resources?limit=100`,
  );
  const projectResources = await sharedLink.json();
  expect(
    projectResources.items.some(
      (link: { resource: { id: string } }) => link.resource.id === service.id,
    ),
  ).toBe(true);

  await page.goto("/infrastructure");
  const tree = page.getByRole("list", { name: "Resource hierarchy" });
  const providerLink = tree.getByRole("link", { name: provider.name });
  const moreRoots = page.getByRole("button", {
    name: "Load more root resources",
  });
  while ((await providerLink.count()) === 0) {
    await expect
      .poll(
        async () =>
          (await providerLink.count()) > 0 || (await moreRoots.count()) > 0,
        { timeout: 15_000 },
      )
      .toBe(true);
    if ((await providerLink.count()) > 0) break;
    await moreRoots.click();
  }
  await page
    .getByRole("button", { name: `Show children of ${provider.name}` })
    .click();
  await expect(
    page
      .getByRole("list", { name: `Children of ${provider.name}` })
      .getByRole("link", {
        name: service.name,
      }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.goto(`/resources/${database.id}`);
  await expect(
    page.getByRole("list", { name: "Resource dependents" }).getByRole("link", {
      name: service.name,
    }),
  ).toBeVisible();
  const impactSection = page.locator("#dependency-impact");
  await expect(
    impactSection.getByRole("heading", {
      name: "Potential dependency impact",
    }),
  ).toBeVisible();
  await expect(
    impactSection.getByRole("link", { name: service.name }).first(),
  ).toBeVisible();
  await expect(impactSection).toContainText(`${token} project`);
  await expect(impactSection).toContainText(
    "No active synthetic metric-drop signal is recorded",
  );
  const impactResponse = await request.get(
    `/api/v1/resources/${database.id}/impact?limit=1`,
  );
  expect(impactResponse.status()).toBe(200);
  const impact = await impactResponse.json();
  expect(impact.items[0]?.resource.id).toBe(service.id);
  expect(impact.items[0]?.path.map((node: { id: string }) => node.id)).toEqual([
    database.id,
    service.id,
  ]);
  expect(impact.realHealth).toBe("unknown");
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

  const importResponse = await request.post("/api/v1/synthetic-event-imports", {
    data: {
      scenarioId: "operations.monitor-down",
      projectId: project.id,
      resourceId: service.id,
      occurrenceId: randomUUID(),
    },
  });
  expect(importResponse.status()).toBe(202);
  const imported = await importResponse.json();
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/synthetic-event-imports/${imported.id}`,
        );
        return (await response.json()).state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");
  await page.goto(`/resources/${service.id}`);
  await expect(
    page.getByText("Synthetic event", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic operational fixture", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Manual record. No operational observation has been recorded.",
    ),
  ).toBeVisible();
  const savedResource = await (
    await request.get(`/api/v1/resources/${service.id}`)
  ).json();
  expect(savedResource.state).toBeNull();
  expect(savedResource.lastObservedAt).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
