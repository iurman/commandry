import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("local capture suggestion is corrected and approved, then its task changes the live brief", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const token = `Triage${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `${token} project`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const original = `  Need to fix ${token} timer.\nPreserve this second line.  `;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/inbox");
  await page.getByLabel("Original text *").fill(original);
  const captureResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/captures") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save to Inbox" }).click();
  const captureResponse = await captureResponsePromise;
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  await expect(page.getByText(original).first()).toBeVisible();
  await expect(page.getByText("Local deterministic rule")).toBeVisible({
    timeout: 70_000,
  });
  await expect(page.getByText("Rule confidence: 60%")).toBeVisible();

  const projectSelect = page.getByLabel("Project *");
  const projectOption = projectSelect.locator(`option[value="${project.id}"]`);
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
  await page.getByLabel("Title *").fill(`${token} corrected task`);
  await page
    .getByRole("button", { name: "Approve reviewed suggestion" })
    .click();
  await expect(page.getByText("Reviewed as approve")).toBeVisible();
  await expect(page.getByText(original).first()).toBeVisible();
  const savedCaptureResponse = await request.get(
    `/api/v1/captures/${capture.id}`,
  );
  expect(savedCaptureResponse.status()).toBe(200);
  const savedCapture = await savedCaptureResponse.json();
  expect(savedCapture.originalContent).toBe(original);
  expect(savedCapture.filedRecord.kind).toBe("task");

  const taskId = savedCapture.filedRecord.id;
  const beforeBriefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(beforeBriefResponse.status()).toBe(200);
  const beforeBrief = await beforeBriefResponse.json();
  expect(beforeBrief.sections.work.items).toEqual([
    expect.objectContaining({ id: taskId }),
  ]);
  const packetResponse = await request.post(
    `/api/v1/work-items/${taskId}/execution-packets`,
    { data: { selectedKnowledgeIds: [], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  expect(packet.snapshot.objective.status).toBe("open");

  await page.goto(`/work-items/${taskId}`);
  await expect(
    page.getByRole("heading", { name: "Task status" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByRole("button", { name: "Reopen task" })).toBeVisible();
  await expect(
    page.getByText(/open to done by local-user:unattributed/),
  ).toBeVisible();
  const afterBriefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(afterBriefResponse.status()).toBe(200);
  const afterBrief = await afterBriefResponse.json();
  expect(afterBrief.sections.work.items).toEqual([]);
  const savedPacketResponse = await request.get(
    `/api/v1/execution-packets/${packet.id}`,
  );
  expect((await savedPacketResponse.json()).snapshot.objective.status).toBe(
    "open",
  );
  await page.getByRole("button", { name: "Reopen task" }).click();
  await expect(page.getByRole("button", { name: "Mark done" })).toBeVisible();
  const restoredBriefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect((await restoredBriefResponse.json()).sections.work.items).toEqual([
    expect.objectContaining({ id: taskId }),
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
