import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a shared original document attaches to Work and keeps exact project context until the task link is archived", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const primaryResponse = await request.post("/api/v1/projects", {
    data: { name: `Original files ${suffix}`, type: "general" },
  });
  expect(primaryResponse.status()).toBe(201);
  const primary = await primaryResponse.json();
  const receivingResponse = await request.post("/api/v1/projects", {
    data: { name: `Receiving work ${suffix}`, type: "general" },
  });
  expect(receivingResponse.status()).toBe(201);
  const receiving = await receivingResponse.json();
  const taskCaptureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `Review shared file ${suffix}`,
    },
  });
  expect(taskCaptureResponse.status()).toBe(201);
  const taskCapture = await taskCaptureResponse.json();
  const taskResponse = await request.post(
    `/api/v1/captures/${taskCapture.id}/file`,
    {
      data: {
        projectId: receiving.id,
        kind: "task",
        title: `Review shared file ${suffix}`,
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).record;
  const originalBytes = Buffer.from(`Shared exact original ${suffix}\n`);
  const uploadResponse = await request.post("/api/v1/captures/files", {
    multipart: {
      file: {
        name: `Shared ${suffix}.txt`,
        mimeType: "text/plain",
        buffer: originalBytes,
      },
    },
  });
  expect(uploadResponse.status()).toBe(201);
  const source = await uploadResponse.json();
  const filingResponse = await request.post(
    `/api/v1/captures/${source.id}/file`,
    {
      data: {
        projectId: primary.id,
        kind: "document",
        title: `Shared survey ${suffix}`,
        body: "Filed once and related to another project",
      },
    },
  );
  expect(filingResponse.status()).toBe(201);
  const document = (await filingResponse.json()).record;
  const contextResponse = await request.post(
    `/api/v1/knowledge-items/${document.id}/projects`,
    { data: { projectId: receiving.id } },
  );
  expect(contextResponse.status()).toBe(200);
  const context = await contextResponse.json();

  await page.goto(`/work-items/${task.id}`);
  const choices = page.getByLabel("Project document");
  await expect(choices.locator(`option[value="${document.id}"]`)).toHaveCount(
    1,
  );
  await expect(choices.locator(`option[value="${document.id}"]`)).toHaveText(
    `${document.title} (shared)`,
  );
  await choices.selectOption(document.id);
  const attachmentResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/work-items/${task.id}/attachments`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Attach document" }).click();
  const attachmentResponse = await attachmentResponsePromise;
  expect(attachmentResponse.status()).toBe(201);
  const attachment = await attachmentResponse.json();
  expect(attachment.contextLinkId).toBe(context.link.id);
  await expect(
    page.getByRole("link", { name: "Shared project relationship" }),
  ).toHaveAttribute(
    "href",
    `/api/v1/knowledge-project-links/${context.link.id}`,
  );
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    {
      data: {
        selectedKnowledgeIds: [document.id],
        selectedResourceIds: [],
      },
    },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  expect(packet.snapshot.selectedKnowledge[0].contextEvidence.id).toBe(
    context.link.id,
  );

  await page.goto(`/knowledge-items/${document.id}`);
  await page.getByRole("button", { name: "Unlink project" }).click();
  await expect(
    page.getByRole("alert").getByText(/Archive task attachments/),
  ).toBeVisible();
  await page.goto(`/work-items/${task.id}`);
  await page.getByRole("button", { name: "Remove from task" }).click();
  await expect(page.getByText("No documents attached")).toBeVisible();
  await page.goto(`/knowledge-items/${document.id}`);
  await page.getByRole("button", { name: "Unlink project" }).click();
  await expect(
    page.getByText(/The exact relationship remains in history/),
  ).toBeVisible();
  const exactContext = await request.get(
    `/api/v1/knowledge-project-links/${context.link.id}`,
  );
  expect((await exactContext.json()).lifecycle).toBe("archived");
  const exactAttachment = await request.get(
    `/api/v1/work-item-attachments/${attachment.id}`,
  );
  expect((await exactAttachment.json()).contextLinkId).toBe(context.link.id);
  const savedPacket = await request.get(
    `/api/v1/execution-packets/${packet.id}`,
  );
  expect(
    (await savedPacket.json()).snapshot.selectedKnowledge[0].contextEvidence.id,
  ).toBe(context.link.id);
  const downloaded = await request.get(source.file.downloadHref);
  expect(await downloaded.body()).toEqual(originalBytes);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
