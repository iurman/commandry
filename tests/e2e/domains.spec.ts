import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a domain groups a project through a typed link and appears in the evidence-linked brief", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Domain project ${suffix}`, type: "personal" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  await page.goto("/projects");
  await page.getByRole("link", { name: "Browse portfolio domains" }).click();
  await page.getByLabel("Name").fill(`Home ${suffix}`);
  await page.getByLabel("Description").fill("Local home responsibility area");
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/domains") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create domain" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const domain = await createResponse.json();
  expect(domain).toMatchObject({
    name: `Home ${suffix}`,
    lifecycle: "active",
    version: 1,
  });
  await expect(
    page.getByRole("link", { name: `Home ${suffix}` }),
  ).toBeVisible();

  await page.goto(`/projects/${project.id}`);
  await expect(page.getByText("Current owner: Unassigned")).toBeVisible();
  const choice = page.getByLabel("Owning domain");
  const option = choice.locator(`option[value="${domain.id}"]`);
  while ((await option.count()) === 0) {
    const before = await choice.locator("option").count();
    await page
      .getByRole("button", { name: "Load more domain choices" })
      .click();
    await expect
      .poll(() => choice.locator("option").count())
      .toBeGreaterThan(before);
  }
  await choice.selectOption(domain.id);
  await page.getByRole("button", { name: "Save domain" }).click();
  await expect(
    page.getByRole("link", { name: `Home ${suffix}` }),
  ).toBeVisible();
  const membershipResponse = await request.get(
    `/api/v1/projects/${project.id}/domain`,
  );
  expect(membershipResponse.status()).toBe(200);
  const { membership } = await membershipResponse.json();
  expect(membership).toMatchObject({
    domain: { id: domain.id, name: `Home ${suffix}` },
    link: {
      projectId: project.id,
      domainId: domain.id,
      type: "owned_by",
      inverseType: "owns",
      sourceKind: "project",
      targetKind: "domain",
      provenance: "manual",
      lifecycle: "active",
    },
  });
  const linkResponse = await request.get(
    `/api/v1/project-domain-links/${membership.link.id}`,
  );
  expect(linkResponse.status()).toBe(200);
  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  expect(brief.state.text).toContain(`Owned by domain Home ${suffix}`);
  expect(brief.state.evidence).toContainEqual(
    expect.objectContaining({
      kind: "project_domain_link",
      id: membership.link.id,
      href: `/api/v1/project-domain-links/${membership.link.id}`,
    }),
  );

  await page.goto(`/domains/${domain.id}`);
  await expect(page.getByRole("link", { name: project.name })).toBeVisible();
  await page.getByLabel("Name").fill(`Household ${suffix}`);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByRole("heading", { name: `Household ${suffix}` }),
  ).toBeVisible();
  const auditResponse = await request.get(
    `/api/v1/domains/${domain.id}/audit?limit=10`,
  );
  expect(auditResponse.status()).toBe(200);
  expect(
    (await auditResponse.json()).items.map(
      (item: { operation: string }) => item.operation,
    ),
  ).toEqual(
    expect.arrayContaining([
      "domain.created",
      "domain.updated",
      "domain.project_linked",
    ]),
  );

  await page.goto(`/projects/${project.id}`);
  await expect(
    page.getByRole("link", { name: `Household ${suffix}` }),
  ).toBeVisible();
  await page.getByLabel("Owning domain").selectOption("");
  await page.getByRole("button", { name: "Save domain" }).click();
  await expect(page.getByText("Current owner: Unassigned")).toBeVisible();
  const historicalLinkResponse = await request.get(
    `/api/v1/project-domain-links/${membership.link.id}`,
  );
  expect((await historicalLinkResponse.json()).lifecycle).toBe("archived");

  await page.goto(`/domains/${domain.id}`);
  await page.getByRole("button", { name: "Archive empty domain" }).click();
  await expect(
    page.getByText("Archived domains are read-only.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
