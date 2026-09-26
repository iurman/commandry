import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("projects UI persists a shared resource and truthful manual state", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const firstName = `Automated test garden event ${suffix}`;
  const secondName = `Automated test home plan ${suffix}`;
  const resourceName = `Automated test shared guide ${suffix}`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.locator("#project-name").fill(firstName);
  await page.locator("#project-summary").fill("A non-software local project.");
  await page.locator("#project-type").fill("event");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("link", { name: firstName })).toBeVisible();
  await page.getByRole("link", { name: firstName }).click();
  await expect(page.getByRole("heading", { name: firstName })).toBeVisible();

  await page.locator("#resource-name").fill(resourceName);
  await page.locator("#resource-kind").fill("document");
  await page.locator("#create-relationship-type").selectOption("relates_to");
  await page.getByRole("button", { name: "Create and link resource" }).click();
  const firstLinks = page.getByRole("list", { name: "Linked resources" });
  await expect(firstLinks).toContainText(resourceName);
  await expect(firstLinks).toContainText("Unknown");
  await expect(firstLinks).toContainText("No operational observation");
  const resourceId = await firstLinks.locator("code").first().textContent();
  expect(resourceId).toMatch(/^[0-9a-f-]{36}$/);

  await page.reload();
  await expect(page.getByRole("heading", { name: firstName })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Linked resources" }),
  ).toContainText(resourceName);

  const createdSecond = await request.post("/api/v1/projects", {
    data: { name: secondName, type: "home" },
  });
  expect(createdSecond.status()).toBe(201);
  const second = await createdSecond.json();
  await page.goto(`/projects/${second.id}`);
  await expect(page.getByRole("heading", { name: secondName })).toBeVisible();
  await page
    .getByRole("button", { name: "Choose an existing resource" })
    .click();
  const resourceSelect = page.locator("#existing-resource");
  await expect(resourceSelect).toBeVisible();
  const option = resourceSelect.locator(`option[value="${resourceId}"]`);
  while ((await option.count()) === 0) {
    const more = page.getByRole("button", { name: "Load more resources" });
    await expect(more).toBeVisible();
    await more.click();
    await expect
      .poll(async () => (await option.count()) + (await more.count()))
      .toBeGreaterThan(0);
  }
  await resourceSelect.selectOption(resourceId!);
  await page.locator("#existing-relationship-type").selectOption("supports");
  await page
    .getByRole("button", { name: "Link resource", exact: true })
    .click();
  const secondLinks = page.getByRole("list", { name: "Linked resources" });
  await expect(secondLinks).toContainText(resourceName);
  await expect(secondLinks).toContainText(resourceId!);
  await expect(secondLinks).toContainText("Resource supports project");
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Linked resources" }),
  ).toContainText(resourceId!);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
