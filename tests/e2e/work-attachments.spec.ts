import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a project document attaches to Work with inverse links, brief evidence, and preserved packet selection", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Attachment project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const taskCaptureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `Review survey ${suffix}`,
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
        title: `Review survey ${suffix}`,
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).record;
  const originalBytes = Buffer.from(`Exact field survey ${suffix}\n`);
  const upload = await request.post("/api/v1/captures/files", {
    multipart: {
      file: {
        name: `Survey ${suffix}.txt`,
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
      title: `Field survey ${suffix}`,
      body: "Local source context",
    },
  });
  expect(filing.status()).toBe(201);
  const document = (await filing.json()).record;

  await page.goto(`/work-items/${task.id}`);
  await expect(
    page.getByRole("heading", { name: "Task attachments" }),
  ).toBeVisible();
  const documentSelect = page.getByLabel("Project document");
  await expect(documentSelect).toBeEnabled();
  while (
    (await documentSelect.locator(`option[value="${document.id}"]`).count()) ===
    0
  ) {
    await page
      .getByRole("button", { name: "Load more Knowledge choices" })
      .click();
  }
  await documentSelect.selectOption(document.id);
  const attachResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/work-items/${task.id}/attachments`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Attach document" }).click();
  const attachResponse = await attachResponsePromise;
  expect(attachResponse.status()).toBe(201);
  const linked = await attachResponse.json();
  expect(linked.knowledgeItemId).toBe(document.id);
  expect(linked.sourceCaptureId).toBe(source.id);
  const card = page.getByRole("list", { name: "Task attachments" });
  await expect(
    card.getByRole("link", { name: `Field survey ${suffix}` }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Download exact original file" }),
  ).toHaveAttribute("href", source.file.downloadHref);

  await page.goto(`/knowledge-items/${document.id}`);
  const inverse = page.getByRole("list", {
    name: "Tasks using this document",
  });
  await expect(
    inverse.getByRole("link", { name: `Review survey ${suffix}` }),
  ).toHaveAttribute("href", `/work-items/${task.id}`);
  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  const fact = brief.sections.work.items.find(
    (item: { id: string }) => item.id === task.id,
  );
  expect(fact.detail).toContain(`Field survey ${suffix}`);
  expect(fact.evidence).toContainEqual(
    expect.objectContaining({
      kind: "work_item_attachment",
      id: linked.id,
      href: `/api/v1/work-item-attachments/${linked.id}`,
    }),
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
  expect(packet.snapshot.selectedKnowledge[0].id).toBe(document.id);

  await page.goto(`/work-items/${task.id}`);
  await expect(
    page.getByRole("list", { name: "Task attachments" }).getByRole("button", {
      name: "Remove from task",
    }),
  ).toBeVisible();
  const archiveResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/work-item-attachments/${linked.id}`) &&
      response.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "Remove from task" }).click();
  const archiveResponse = await archiveResponsePromise;
  expect(archiveResponse.status()).toBe(200);
  expect((await archiveResponse.json()).state).toBe("archived");
  await expect(page.getByText("No documents attached")).toBeVisible();
  const exactLink = await request.get(
    `/api/v1/work-item-attachments/${linked.id}`,
  );
  expect((await exactLink.json()).state).toBe("archived");
  const inverseAfter = await request.get(
    `/api/v1/knowledge-items/${document.id}/work-attachments`,
  );
  expect((await inverseAfter.json()).items).toEqual([]);
  const briefAfter = await request.get(`/api/v1/projects/${project.id}/brief`);
  const afterFact = (await briefAfter.json()).sections.work.items.find(
    (item: { id: string }) => item.id === task.id,
  );
  expect(
    afterFact.evidence.some((item: { id: string }) => item.id === linked.id),
  ).toBe(false);
  const storedPacket = await request.get(
    `/api/v1/execution-packets/${packet.id}`,
  );
  expect((await storedPacket.json()).snapshot.selectedKnowledge[0].id).toBe(
    document.id,
  );
  const downloaded = await request.get(source.file.downloadHref);
  expect(await downloaded.body()).toEqual(originalBytes);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
