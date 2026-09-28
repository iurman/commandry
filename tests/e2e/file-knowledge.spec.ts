import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a local file becomes source-backed Knowledge with exact download, search, brief, and packet context", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Document project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const bytes = Buffer.from([0, 13, 10, 255, 128, 1, 99]);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const originalName = `Field log ${suffix}.bin`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/inbox");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByLabel("Original file *").setInputFiles({
    name: originalName,
    mimeType: "application/octet-stream",
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
  expect(source.inputType).toBe("file");
  expect(source.file.sha256).toBe(digest);
  await expect(page.getByText(originalName).first()).toBeVisible();
  await expect(page.getByText(digest)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download exact original file" }),
  ).toHaveAttribute("href", source.file.downloadHref);

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
  await expect(page.getByLabel("File as")).toHaveValue("document");
  await page.getByLabel("Title *").fill(`Measured log ${suffix}`);
  await page
    .getByLabel("Document context Optional")
    .fill(`Local observations ${suffix}; no live device connection.`);
  const filedResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/captures/${source.id}/file`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "File as document" }).click();
  const filedResponse = await filedResponsePromise;
  expect(filedResponse.status()).toBe(201);
  const filed = await filedResponse.json();
  expect(filed.record.kind).toBe("document");
  expect(filed.capture.file.sha256).toBe(digest);

  const download = await request.get(source.file.downloadHref);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain(
    "application/octet-stream",
  );
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(download.headers()["x-commandry-sha256"]).toBe(digest);
  expect(await download.body()).toEqual(bytes);

  await page
    .getByRole("link", { name: "Open saved knowledge document" })
    .click();
  await expect(page).toHaveURL(`/knowledge-items/${filed.record.id}`);
  await expect(
    page.getByRole("heading", { name: `Measured log ${suffix}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download exact original file" }),
  ).toHaveAttribute("href", source.file.downloadHref);
  await page
    .getByRole("textbox", { name: "Document context" })
    .fill(`Reviewed local observations ${suffix}.`);
  await page.getByRole("button", { name: "Save document revision" }).click();
  await expect(
    page.getByText(
      "Knowledge document saved. The exact original file is unchanged.",
    ),
  ).toBeVisible();
  const downloadAfterRevision = await request.get(source.file.downloadHref);
  expect(await downloadAfterRevision.body()).toEqual(bytes);

  await page.goto(`/knowledge?projectId=${project.id}`);
  await expect(
    page.getByRole("link", { name: `Measured log ${suffix}` }),
  ).toBeVisible();
  await page.goto(`/search?projectId=${project.id}`);
  await page
    .getByLabel("Words to find")
    .fill(`Reviewed local observations ${suffix}`);
  await page.getByRole("button", { name: "Search records" }).click();
  await expect(
    page.getByRole("list", { name: "Search results" }).getByRole("link", {
      name: `Measured log ${suffix}`,
    }),
  ).toBeVisible();

  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  expect(brief.sections.knowledge.items).toContainEqual(
    expect.objectContaining({
      id: filed.record.id,
      sourceLabel: "Locally revised knowledge document",
      evidence: expect.arrayContaining([
        expect.objectContaining({ id: source.id, kind: "capture" }),
      ]),
    }),
  );
  const taskCaptureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `Review measured log ${suffix}`,
    },
  });
  expect(taskCaptureResponse.status()).toBe(201);
  const taskCapture = await taskCaptureResponse.json();
  const taskResponse = await request.post(
    `/api/v1/captures/${taskCapture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Review measured log ${suffix}`,
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).record;
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    {
      data: {
        selectedKnowledgeIds: [filed.record.id],
        selectedResourceIds: [],
      },
    },
  );
  expect(packetResponse.status()).toBe(201);
  expect(
    (await packetResponse.json()).snapshot.selectedKnowledge,
  ).toContainEqual(
    expect.objectContaining({
      id: filed.record.id,
      evidence: expect.objectContaining({
        sourceLabel: "Manual local knowledge document",
      }),
    }),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(pageErrors).toEqual([]);
});
