import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Inbox files a note and search reaches the same source-backed project record", async ({
  page,
  request,
}) => {
  const token = `ReviewNote${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Automated test archive ${token}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const original = `${token}: Keep the original text, including this second line.\nSecond line.`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/inbox");
  await page.getByLabel("Original text *").fill(original);
  await page.getByRole("button", { name: "Save to Inbox" }).click();
  await expect(page.getByText(original).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Capture detail" }),
  ).toBeInViewport();

  const projectSelect = page.getByLabel("Project *");
  const projectOption = projectSelect.locator(`option[value="${project.id}"]`);
  await expect(projectSelect).toBeEnabled();
  while ((await projectOption.count()) === 0) {
    const previousCount = await projectSelect.locator("option").count();
    const more = page.getByRole("button", { name: "Load more projects" });
    await expect(more).toBeVisible();
    await more.click();
    await expect
      .poll(() => projectSelect.locator("option").count())
      .toBeGreaterThan(previousCount);
  }
  await projectSelect.selectOption(project.id);
  await page.getByLabel("File as").selectOption("note");
  await page.getByLabel("Title *").fill(`${token} field note`);
  await page.getByLabel("Content Optional").fill("Retained project context.");
  await page.getByRole("button", { name: "File as note" }).click();
  await expect(
    page.getByText("Filed as a note in the selected project."),
  ).toBeVisible();

  await page.goto(`/projects/${project.id}`);
  const knowledge = page.getByRole("list", { name: "Project knowledge" });
  await expect(knowledge.getByText(`${token} field note`)).toBeVisible();
  await knowledge.getByRole("link", { name: "View original capture" }).click();
  await expect(page).toHaveURL(/\/inbox\?captureId=/);
  await expect(page.getByText(original).first()).toBeVisible();

  await page.goto(`/search?projectId=${project.id}`);
  await page.getByLabel("Words to find").fill(token);
  await page.getByRole("button", { name: "Search records" }).click();
  const results = page.getByRole("list", { name: "Search results" });
  await expect(
    results.getByRole("link", { name: `${token} field note` }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
