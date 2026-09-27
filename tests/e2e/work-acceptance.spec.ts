import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Work acceptance uses attached original evidence in local review, brief, packet, and completion", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Acceptance project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const taskCaptureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `Verify local release ${suffix}`,
    },
  });
  const taskCapture = await taskCaptureResponse.json();
  const taskResponse = await request.post(
    `/api/v1/captures/${taskCapture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Verify local release ${suffix}`,
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).record;
  const originalBytes = Buffer.from(`Local test evidence ${suffix}\n`);
  const upload = await request.post("/api/v1/captures/files", {
    multipart: {
      file: {
        name: `test-log-${suffix}.txt`,
        mimeType: "text/plain",
        buffer: originalBytes,
      },
    },
  });
  expect(upload.status()).toBe(201);
  const source = await upload.json();
  const filing = await request.post(`/api/v1/captures/${source.id}/file`, {
    data: {
      projectId: project.id,
      kind: "document",
      title: `Local test log ${suffix}`,
      body: "Manual source context",
    },
  });
  expect(filing.status()).toBe(201);
  const document = (await filing.json()).record;
  const attach = await request.post(
    `/api/v1/work-items/${task.id}/attachments`,
    { data: { knowledgeItemId: document.id } },
  );
  expect(attach.status()).toBe(201);
  const attachment = await attach.json();

  await page.goto(`/work-items/${task.id}`);
  await expect(
    page.getByRole("heading", {
      name: "Acceptance and completion evidence",
    }),
  ).toBeVisible();
  await page
    .getByLabel("Acceptance criteria")
    .fill("The local release has a recorded smoke test log.");
  await page.getByRole("button", { name: "Save criteria" }).click();
  await expect(page.getByText("Current criteria: version 1.")).toBeVisible();
  await expect(
    page.getByText("Acceptance criteria saved with an immutable revision."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText(/Record a current 'met' review/)).toBeVisible();
  await page.getByLabel("Evidence document").selectOption(attachment.id);
  await page
    .getByLabel("Reason and evidence summary")
    .fill("The attached original log records the local smoke test.");
  const reviewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/work-items/${task.id}/verifications`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Record manual review" }).click();
  expect((await reviewResponse).status()).toBe(201);
  await expect(
    page.getByRole("heading", { name: "Criteria claimed met" }),
  ).toBeVisible();
  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  const fact = brief.sections.work.items.find(
    (item: { id: string }) => item.id === task.id,
  );
  expect(fact.detail).toContain("Acceptance criteria v1");
  expect(fact.detail).toContain("Manual local review met");
  expect(fact.evidence).toContainEqual(
    expect.objectContaining({ kind: "work_item_verification" }),
  );
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [document.id], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  expect(packet.snapshot.acceptance.criteria).toContain("smoke test log");
  expect(packet.snapshot.acceptance.latestReview.result).toBe("met");
  await page.goto(`/execution-packets/${packet.id}`);
  await expect(
    page.getByRole("heading", { name: "Acceptance criteria" }),
  ).toBeVisible();
  await expect(page.getByText("Latest manual local review")).toBeVisible();
  await page.goto(`/work-items/${task.id}`);
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Current status: done.")).toBeVisible();
  const downloaded = await request.get(source.file.downloadHref);
  expect(await downloaded.body()).toEqual(originalBytes);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
