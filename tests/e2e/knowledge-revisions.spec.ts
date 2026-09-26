import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a filed note can be revised without rewriting its original capture", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Knowledge revision ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const original = `  Original local note ${suffix}.  `;
  const sourceResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: original },
  });
  expect(sourceResponse.status()).toBe(201);
  const source = await sourceResponse.json();
  const filing = await request.post(`/api/v1/captures/${source.id}/file`, {
    data: {
      projectId: project.id,
      kind: "note",
      title: `Garden note ${suffix}`,
      body: "Check the old timer",
    },
  });
  expect(filing.status()).toBe(201);
  const filed = await filing.json();
  expect(filed.record.version).toBe(1);
  const noteId = filed.record.id;

  await page.goto(`/knowledge-items/${noteId}`);
  await expect(
    page.getByRole("heading", { name: `Garden note ${suffix}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View exact original capture" }),
  ).toHaveAttribute("href", `/inbox?captureId=${source.id}`);
  await page
    .getByLabel("Title", { exact: true })
    .fill(`Garden options ${suffix}`);
  await page
    .getByLabel("Content", { exact: true })
    .fill(`Compare an orchid timer ${suffix}`);
  await page.getByRole("button", { name: "Save note revision" }).click();
  await expect(
    page.getByText(
      "Knowledge note saved. The exact original capture is unchanged.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `Garden options ${suffix}` }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("article", { name: "Note body" })
      .getByText(`Compare an orchid timer ${suffix}`),
  ).toBeVisible();
  await expect(
    page.getByText(`Version 2: Garden options ${suffix}`),
  ).toBeVisible();
  await page.getByText(`Version 2: Garden options ${suffix}`).click();
  await expect(page.getByText("Check the old timer")).toBeVisible();

  const note = await request.get(`/api/v1/knowledge-items/${noteId}`);
  expect((await note.json()).version).toBe(2);
  const sourceNow = await request.get(`/api/v1/captures/${source.id}`);
  expect((await sourceNow.json()).originalContent).toBe(original);
  const stale = await request.post(
    `/api/v1/knowledge-items/${noteId}/revisions`,
    {
      data: {
        expectedVersion: 1,
        title: "Stale edit",
        content: "Stale content",
      },
    },
  );
  expect(stale.status()).toBe(409);
  const search = await request.get(
    `/api/v1/search?q=orchid&projectId=${project.id}&limit=10`,
  );
  expect(search.status()).toBe(200);
  expect(
    (await search.json()).items.some(
      (item: { id: string }) => item.id === noteId,
    ),
  ).toBe(true);
  const brief = await request.get(`/api/v1/projects/${project.id}/brief`);
  expect(brief.status()).toBe(200);
  expect(JSON.stringify(await brief.json())).toContain(
    `Garden options ${suffix}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
});
