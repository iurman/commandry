import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a local Markdown original gains labeled worker text and project-scoped search", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const suffix = randomUUID().slice(0, 8);
  const phrase = `cedarstar${suffix}`;
  const bytes = Buffer.from(
    `# Local operations note\nThe ${phrase} observation came from this exact Markdown file.`,
  );
  const digest = createHash("sha256").update(bytes).digest("hex");
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Text projection ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/inbox");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByLabel("Original file *").setInputFiles({
    name: `operations-${suffix}.md`,
    mimeType: "text/markdown",
    buffer: bytes,
  });
  const savedResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/captures/files") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save to Inbox" }).click();
  const savedResponse = await savedResponsePromise;
  expect(savedResponse.status()).toBe(201);
  const source = await savedResponse.json();
  expect(source.file.sha256).toBe(digest);

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
  await page.getByLabel("Title *").fill(`Operations note ${suffix}`);
  await page
    .getByLabel("Document context Optional")
    .fill("Manually filed local operations context.");
  const filedResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/captures/${source.id}/file`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "File as document" }).click();
  const filedResponse = await filedResponsePromise;
  expect(filedResponse.status()).toBe(201);
  const filed = await filedResponse.json();

  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/captures/${source.id}/derived-text`,
        );
        return response.status() === 200
          ? (await response.json()).status
          : `HTTP ${response.status()}`;
      },
      { timeout: 20_000 },
    )
    .toBe("extracted");
  await page
    .getByRole("link", { name: "Open saved knowledge document" })
    .click();
  await expect(page).toHaveURL(`/knowledge-items/${filed.record.id}`);
  await page.getByRole("button", { name: "Refresh status" }).click();
  const projection = page.getByRole("article", {
    name: "Derived local file text",
  });
  await expect(projection.getByText("Derived local file text")).toBeVisible();
  await expect(projection.getByText(digest)).toBeVisible();
  await projection.getByText("Read extracted text").click();
  await expect(projection.getByText(new RegExp(phrase))).toBeVisible();

  await page.goto(`/search?projectId=${project.id}`);
  await page.getByLabel("Words to find").fill(phrase);
  await page.getByRole("button", { name: "Search records" }).click();
  await expect(
    page.getByRole("list", { name: "Search results" }).getByRole("link", {
      name: `Operations note ${suffix}`,
    }),
  ).toBeVisible();
  const download = await request.get(source.file.downloadHref);
  expect(await download.body()).toEqual(bytes);
  expect(download.headers()["x-commandry-sha256"]).toBe(digest);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(pageErrors).toEqual([]);
});
