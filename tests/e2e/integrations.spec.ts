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
  await expect(development).toContainText("No live connection");
  await development.getByRole("button", { name: "Simulate PR merge" }).click();
  await expect(
    page.getByRole("region", { name: "Latest sample receipt" }),
  ).toContainText("succeeded", { timeout: 60_000 });
  await expect(
    page.getByRole("link", { name: "Original synthetic envelope" }),
  ).toBeVisible();
  await expect(development).toContainText("Last success:");

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
