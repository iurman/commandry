import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

async function choosePagedOption(
  page: Page,
  label: string,
  id: string,
  more: string,
) {
  const choice = page.getByLabel(label);
  const option = choice.locator(`option[value="${id}"]`);
  await expect.poll(() => choice.locator("option").count()).toBeGreaterThan(1);
  while ((await option.count()) === 0) {
    const before = await choice.locator("option").count();
    const loadMore = page.getByRole("button", { name: more });
    await expect(loadMore).toBeVisible();
    await loadMore.click();
    await expect
      .poll(() => choice.locator("option").count())
      .toBeGreaterThan(before);
  }
  await expect(option).toHaveCount(1);
  await choice.selectOption(id);
}

test("a local system joins domain, project, and resource context without claiming live health", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const domainResponse = await request.post("/api/v1/domains", {
    data: { name: `System domain ${suffix}` },
  });
  expect(domainResponse.status()).toBe(201);
  const domain = await domainResponse.json();
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `System project ${suffix}` },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { kind: "service", name: `System service ${suffix}` },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();

  await page.goto("/infrastructure");
  await page
    .getByRole("link", {
      name: "Browse operated systems and their supporting resources",
    })
    .click();
  await page.getByLabel("Summary").fill("A continuing local capability");
  const createSystemButton = page.getByRole("button", {
    name: "Create system",
  });
  await expect
    .poll(async () => {
      await page.getByLabel("Name").fill(`Home operations ${suffix}`);
      return createSystemButton.isEnabled();
    })
    .toBe(true);
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/systems") &&
      response.request().method() === "POST",
  );
  await createSystemButton.click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const system = await createResponse.json();
  await page.getByRole("link", { name: system.name }).click();
  await expect(page.getByRole("heading", { name: system.name })).toBeVisible();
  await expect(
    page.getByText("Operational health is unknown until observed by a source."),
  ).toBeVisible();

  await choosePagedOption(
    page,
    "Owning domain",
    domain.id,
    "Load more domain choices",
  );
  await page.getByRole("button", { name: "Save domain" }).click();
  await expect(page.getByRole("link", { name: domain.name })).toBeVisible();
  await page.getByLabel("Find a project by name").fill(project.name);
  await page.getByRole("button", { name: "Find projects" }).click();
  const projectChoice = page.getByLabel("Add a related project");
  await expect(
    projectChoice.locator(`option[value="${project.id}"]`),
  ).toHaveCount(1);
  await projectChoice.selectOption(project.id);
  await page.getByRole("button", { name: "Relate project" }).click();
  await expect(page.getByRole("link", { name: project.name })).toBeVisible();
  await page.getByLabel("Find a resource by name").fill(resource.name);
  await page.getByRole("button", { name: "Find resources" }).click();
  const resourceChoice = page.getByLabel("Add a supporting resource");
  await expect(
    resourceChoice.locator(`option[value="${resource.id}"]`),
  ).toHaveCount(1);
  await resourceChoice.selectOption(resource.id);
  await page.getByRole("button", { name: "Link supporting resource" }).click();
  await expect(page.getByRole("link", { name: resource.name })).toBeVisible();

  const membership = await (
    await request.get(`/api/v1/systems/${system.id}/domain`)
  ).json();
  expect(membership.membership.link).toMatchObject({
    domainId: domain.id,
    type: "owned_by",
    sourceKind: "system",
    targetKind: "domain",
  });
  const projects = await (
    await request.get(`/api/v1/systems/${system.id}/projects`)
  ).json();
  expect(projects.items[0].link).toMatchObject({
    projectId: project.id,
    type: "relates_to",
  });
  const resources = await (
    await request.get(`/api/v1/systems/${system.id}/resources`)
  ).json();
  expect(resources.items[0].link).toMatchObject({
    resourceId: resource.id,
    type: "supports",
    sourceKind: "resource",
    targetKind: "system",
  });
  expect(resources.items[0].resource).toMatchObject({
    state: null,
    lastObservedAt: null,
  });
  const brief = await (
    await request.get(`/api/v1/projects/${project.id}/brief`)
  ).json();
  expect(brief.sections.systems.items).toContainEqual(
    expect.objectContaining({
      id: system.id,
      title: system.name,
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "system_project_link",
          id: projects.items[0].link.id,
          href: `/api/v1/system-project-links/${projects.items[0].link.id}`,
        }),
      ]),
    }),
  );
  const search = await (
    await request.get(
      `/api/v1/search?q=${encodeURIComponent(system.name)}&projectId=${project.id}`,
    )
  ).json();
  expect(search.items).toContainEqual(
    expect.objectContaining({ kind: "system", id: system.id }),
  );

  await page.goto(`/domains/${domain.id}`);
  await expect(page.getByRole("link", { name: system.name })).toBeVisible();
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("link", { name: system.name })).toBeVisible();
  await page.getByRole("link", { name: "Review project flow history" }).click();
  await expect(
    page.getByRole("heading", { name: "Project flow" }),
  ).toBeVisible();
  await expect(page.getByText(/paged history, not live traffic/)).toBeVisible();
  await expect(
    page.getByRole("article", { name: "system link flow record" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "system resource link flow record" }),
  ).toBeVisible();
  const flowIds = new Set<string>();
  let flowCursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "1" });
    if (flowCursor) query.set("cursor", flowCursor);
    const response = await request.get(
      `/api/v1/projects/${project.id}/flow?${query}`,
    );
    expect(response.status()).toBe(200);
    const flow = await response.json();
    expect(flow.mode).toBe("historical-local-snapshot");
    for (const item of flow.items) {
      flowIds.add(item.id);
      expect((await request.get(item.sourceHref)).status()).toBe(200);
    }
    flowCursor = flow.nextCursor;
  } while (flowCursor);
  expect(flowIds.size).toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto(`/resources/${resource.id}`);
  await expect(page.getByRole("link", { name: system.name })).toBeVisible();

  await page.goto(`/systems/${system.id}`);
  await page.getByRole("button", { name: "Unlink project" }).click();
  await expect(page.getByRole("link", { name: project.name })).toHaveCount(0);
  await page.getByRole("button", { name: "Unlink resource" }).click();
  await expect(page.getByRole("link", { name: resource.name })).toHaveCount(0);
  await page.getByLabel("Owning domain").selectOption("");
  await page.getByRole("button", { name: "Save domain" }).click();
  await page.getByRole("button", { name: "Archive empty system" }).click();
  await expect(
    page.getByText("Archived systems are read-only.", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await (
        await request.get(
          `/api/v1/system-project-links/${projects.items[0].link.id}`,
        )
      ).json()
    ).lifecycle,
  ).toBe("archived");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
