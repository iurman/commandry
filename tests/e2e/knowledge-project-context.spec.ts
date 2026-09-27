import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("one original Knowledge record informs a second project and keeps exact relationship history", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const originalProjectResponse = await request.post("/api/v1/projects", {
    data: { name: `Original knowledge ${suffix}`, type: "general" },
  });
  expect(originalProjectResponse.status()).toBe(201);
  const originalProject = await originalProjectResponse.json();
  const otherProjectResponse = await request.post("/api/v1/projects", {
    data: { name: `Receiving knowledge ${suffix}`, type: "general" },
  });
  expect(otherProjectResponse.status()).toBe(201);
  const otherProject = await otherProjectResponse.json();
  const original = `Exact original knowledge ${suffix}`;
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: original },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filingResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: originalProject.id,
        kind: "note",
        title: `Shared access note ${suffix}`,
        body: `West gate context ${suffix}`,
      },
    },
  );
  expect(filingResponse.status()).toBe(201);
  const note = (await filingResponse.json()).record;
  const workCaptureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: "Review shared access" },
  });
  expect(workCaptureResponse.status()).toBe(201);
  const workCapture = await workCaptureResponse.json();
  const workResponse = await request.post(
    `/api/v1/captures/${workCapture.id}/file`,
    {
      data: {
        projectId: otherProject.id,
        kind: "task",
        title: `Review shared access ${suffix}`,
      },
    },
  );
  expect(workResponse.status()).toBe(201);
  const work = (await workResponse.json()).record;

  await page.goto(`/knowledge-items/${note.id}`);
  await expect(page.getByRole("heading", { name: note.title })).toBeVisible();
  await expect(
    page.getByRole("link", { name: originalProject.name }),
  ).toBeVisible();
  await page.getByLabel("Find another project by name").fill(otherProject.name);
  await page.getByRole("button", { name: "Find projects" }).click();
  const choice = page.getByLabel("Relate to project");
  await expect(
    choice.locator(`option[value="${otherProject.id}"]`),
  ).toHaveCount(1);
  await choice.selectOption(otherProject.id);
  await page.getByRole("button", { name: "Relate project" }).click();
  await expect(
    page.getByRole("link", { name: otherProject.name }),
  ).toBeVisible();
  await expect(
    page.getByText(/primary project and exact original are unchanged/),
  ).toBeVisible();
  const linkPage = await request.get(
    `/api/v1/knowledge-items/${note.id}/projects`,
  );
  expect(linkPage.status()).toBe(200);
  const link = (await linkPage.json()).items[0].link;
  await expect(
    page.getByRole("link", { name: "Exact typed relationship" }),
  ).toHaveAttribute("href", `/api/v1/knowledge-project-links/${link.id}`);
  expect(link).toMatchObject({
    knowledgeItemId: note.id,
    projectId: otherProject.id,
    sourceKind: "knowledge_item",
    targetKind: "project",
    lifecycle: "active",
  });

  await page.goto(`/projects/${otherProject.id}`);
  await expect(
    page
      .getByRole("list", { name: "Project knowledge" })
      .getByText(note.title, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Shared from its primary project through a/),
  ).toBeVisible();
  const scopedSearch = await request.get(
    `/api/v1/search?q=${encodeURIComponent(suffix)}&projectId=${otherProject.id}`,
  );
  expect(scopedSearch.status()).toBe(200);
  expect((await scopedSearch.json()).items).toContainEqual(
    expect.objectContaining({ id: note.id }),
  );
  const briefResponse = await request.get(
    `/api/v1/projects/${otherProject.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  expect(brief.sections.knowledge.items).toContainEqual(
    expect.objectContaining({
      id: note.id,
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "knowledge_project_link",
          id: link.id,
        }),
      ]),
    }),
  );
  const packetResponse = await request.post(
    `/api/v1/work-items/${work.id}/execution-packets`,
    {
      data: {
        selectedKnowledgeIds: [note.id],
        selectedResourceIds: [],
      },
    },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  expect(packet.snapshot.selectedKnowledge[0].contextEvidence.id).toBe(link.id);

  await page.goto(`/knowledge-items/${note.id}`);
  await page.getByRole("button", { name: "Unlink project" }).click();
  await expect(
    page.getByText(/The exact relationship remains in history/),
  ).toBeVisible();
  const exactResponse = await request.get(
    `/api/v1/knowledge-project-links/${link.id}`,
  );
  expect((await exactResponse.json()).lifecycle).toBe("archived");
  const sourceResponse = await request.get(`/api/v1/captures/${capture.id}`);
  expect((await sourceResponse.json()).originalContent).toBe(original);
  const archivedPacket = await request.get(
    `/api/v1/execution-packets/${packet.id}`,
  );
  expect(
    (await archivedPacket.json()).snapshot.selectedKnowledge[0].contextEvidence
      .id,
  ).toBe(link.id);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
