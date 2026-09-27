import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("one original Work item is usable in two projects with shared status and exact history", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const primaryResponse = await request.post("/api/v1/projects", {
    data: { name: `Primary work ${suffix}`, type: "general" },
  });
  expect(primaryResponse.status()).toBe(201);
  const primary = await primaryResponse.json();
  const receivingResponse = await request.post("/api/v1/projects", {
    data: { name: `Receiving work ${suffix}`, type: "general" },
  });
  expect(receivingResponse.status()).toBe(201);
  const receiving = await receivingResponse.json();
  const original = `Exact original work ${suffix}`;
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: original },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filingResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: primary.id,
        kind: "task",
        title: `Inspect shared work ${suffix}`,
        body: "Check the shared equipment",
      },
    },
  );
  expect(filingResponse.status()).toBe(201);
  const task = (await filingResponse.json()).record;

  await page.goto(`/work-items/${task.id}`);
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();
  await expect(page.getByRole("link", { name: primary.name })).toBeVisible();
  await page.getByLabel("Find another project by name").fill(receiving.name);
  await page.getByRole("button", { name: "Find projects" }).click();
  const choice = page.getByLabel("Relate to project");
  await expect(choice.locator(`option[value="${receiving.id}"]`)).toHaveCount(
    1,
  );
  await choice.selectOption(receiving.id);
  await page.getByRole("button", { name: "Relate project" }).click();
  await expect(
    page.getByText(/primary project and exact original are unchanged/),
  ).toBeVisible();
  const contextResponse = await request.get(
    `/api/v1/work-items/${task.id}/projects`,
  );
  expect(contextResponse.status()).toBe(200);
  const link = (await contextResponse.json()).items[0].link;
  expect(link).toMatchObject({
    workItemId: task.id,
    projectId: receiving.id,
    sourceKind: "work_item",
    targetKind: "project",
    lifecycle: "active",
  });
  await expect(
    page.getByRole("link", { name: "Exact typed relationship" }),
  ).toHaveAttribute("href", `/api/v1/work-project-links/${link.id}`);

  await page.goto(`/projects/${receiving.id}`);
  await expect(
    page
      .getByRole("list", { name: "Project work" })
      .getByText(task.title, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Shared from its primary project through a/),
  ).toBeVisible();
  const workResponse = await request.get(
    `/api/v1/work-items?projectId=${receiving.id}`,
  );
  expect(workResponse.status()).toBe(200);
  expect((await workResponse.json()).items).toContainEqual(
    expect.objectContaining({
      id: task.id,
      projectId: primary.id,
      contextLink: expect.objectContaining({ id: link.id }),
    }),
  );
  const scopedSearch = await request.get(
    `/api/v1/search?q=${encodeURIComponent(suffix)}&projectId=${receiving.id}`,
  );
  expect(scopedSearch.status()).toBe(200);
  expect((await scopedSearch.json()).items).toContainEqual(
    expect.objectContaining({ id: task.id }),
  );
  const briefResponse = await request.get(
    `/api/v1/projects/${receiving.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  expect((await briefResponse.json()).sections.work.items).toContainEqual(
    expect.objectContaining({
      id: task.id,
      evidence: expect.arrayContaining([
        expect.objectContaining({ kind: "work_project_link", id: link.id }),
      ]),
    }),
  );

  await page.goto(`/work-items/${task.id}`);
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByRole("button", { name: "Reopen task" })).toBeVisible();
  const receivingList = await request.get(
    `/api/v1/projects/${receiving.id}/work`,
  );
  expect((await receivingList.json()).items[0]).toMatchObject({
    id: task.id,
    status: "done",
  });
  await page.getByRole("button", { name: "Unlink project" }).click();
  await expect(
    page.getByText(/exact relationship remains in history/),
  ).toBeVisible();
  const exactResponse = await request.get(
    `/api/v1/work-project-links/${link.id}`,
  );
  expect((await exactResponse.json()).lifecycle).toBe("archived");
  expect(
    (await (await request.get(`/api/v1/projects/${receiving.id}/work`)).json())
      .items,
  ).toEqual([]);
  expect(
    (await (await request.get(`/api/v1/captures/${capture.id}`)).json())
      .originalContent,
  ).toBe(original);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
