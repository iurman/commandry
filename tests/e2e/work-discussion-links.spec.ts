import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Work discussion and Knowledge links remain source-backed across project, brief, packet and search", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Linked memory ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const originalUrl = `https://example.test/${suffix}/field-guide?token=private#chapter`;

  await page.goto("/inbox");
  await page.getByRole("button", { name: "URL", exact: true }).click();
  await page.getByLabel("Original URL *").fill(originalUrl);
  const captureResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/captures") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save to Inbox" }).click();
  const captureResponse = await captureResponsePromise;
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  await expect(page.getByText(originalUrl).first()).toBeVisible();
  const projectSelect = page.getByLabel("Project *");
  while (
    (await projectSelect.locator(`option[value="${project.id}"]`).count()) === 0
  ) {
    await page.getByRole("button", { name: "Load more projects" }).click();
  }
  await projectSelect.selectOption(project.id);
  await page.getByLabel("File as").selectOption("link");
  await page.getByLabel("Title *").fill(`Field guide ${suffix}`);
  await page
    .getByLabel("Link context Optional")
    .fill("Use this saved reference while reviewing the task.");
  const filingResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/captures/${capture.id}/file`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "File as link" }).click();
  const filingResponse = await filingResponsePromise;
  expect(filingResponse.status()).toBe(201);
  const filed = await filingResponse.json();
  expect(filed.capture.originalContent).toBe(originalUrl);
  expect(filed.capture.filedRecord).toEqual({
    kind: "link",
    id: filed.record.id,
  });
  expect(filed.record.url).toBe(`https://example.test/${suffix}/field-guide`);
  await page.getByRole("link", { name: "Open saved knowledge link" }).click();
  await expect(page).toHaveURL(`/knowledge-items/${filed.record.id}`);
  await expect(
    page.getByRole("heading", { name: `Field guide ${suffix}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open saved external link" }),
  ).toHaveAttribute("href", filed.record.url);
  await page.getByRole("link", { name: "View exact original capture" }).click();
  await expect(page.getByText(originalUrl).first()).toBeVisible();

  const taskCaptureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `Review saved guide ${suffix} as a task`,
    },
  });
  expect(taskCaptureResponse.status()).toBe(201);
  const taskCapture = await taskCaptureResponse.json();
  const taskFilingResponse = await request.post(
    `/api/v1/captures/${taskCapture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Guide review ${suffix}`,
        body: "Use the cited knowledge link.",
      },
    },
  );
  expect(taskFilingResponse.status()).toBe(201);
  const task = (await taskFilingResponse.json()).record;
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
  const packet = await packetResponse.json();
  expect(packet.snapshot.selectedKnowledge).toContainEqual(
    expect.objectContaining({
      id: filed.record.id,
      title: `Field guide ${suffix}`,
    }),
  );

  await page.goto(`/work-items/${task.id}`);
  await expect(
    page.getByRole("heading", { name: "Task discussion" }),
  ).toBeVisible();
  const commentBody = `Discussion ${suffix}: the saved guide is ready for review.`;
  await page.getByLabel("New comment").fill(commentBody);
  const commentResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/work-items/${task.id}/comments`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add comment" }).click();
  const commentResponse = await commentResponsePromise;
  expect(commentResponse.status()).toBe(201);
  const comment = await commentResponse.json();
  expect(comment.sourceLabel).toBe("Manual local work comment");
  await expect(page.getByText(commentBody)).toBeVisible();
  await page.reload();
  await expect(page.getByText(commentBody)).toBeVisible();

  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  expect(
    brief.sections.knowledge.items.some(
      (item: { id: string; sourceLabel: string }) =>
        item.id === filed.record.id &&
        item.sourceLabel === "Manual local knowledge link",
    ),
  ).toBe(true);
  await page.goto(`/knowledge?projectId=${project.id}`);
  await expect(
    page.getByRole("link", { name: `Field guide ${suffix}` }),
  ).toBeVisible();

  const search = await request.get(
    `/api/v1/search?q=${encodeURIComponent(`Discussion ${suffix}`)}&projectId=${project.id}`,
  );
  expect(search.status()).toBe(200);
  expect(
    (await search.json()).items.some(
      (item: { kind: string; id: string; href: string }) =>
        item.kind === "comment" &&
        item.id === comment.id &&
        item.href === `/work-items/${task.id}#discussion`,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
