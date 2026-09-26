import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a source-linked task can be planned and appears in upcoming work", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Upcoming project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const original = `  Plan this local task ${suffix}. Preserve this exact source.  `;
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: original },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filedResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Scheduled work ${suffix}`,
        body: "Do the bounded local task.",
      },
    },
  );
  expect(filedResponse.status()).toBe(201);
  const filed = await filedResponse.json();
  const taskId = filed.record.id;
  expect(filed.record).toMatchObject({
    priority: null,
    dueOn: null,
    sourceCaptureId: capture.id,
  });

  await page.goto(`/work-items/${taskId}`);
  await expect(
    page.getByRole("heading", { name: `Scheduled work ${suffix}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View exact original capture" }),
  ).toHaveAttribute("href", `/inbox?captureId=${capture.id}`);
  const dueOn = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await page.getByRole("combobox", { name: "Priority" }).selectOption("high");
  await page.getByLabel("Due date (UTC)").fill(dueOn);
  await page.getByRole("button", { name: "Save planning" }).click();
  await expect(
    page.getByText("Local task planning saved. Original capture preserved."),
  ).toBeVisible();
  await expect(page.getByText(`Upcoming: ${dueOn} UTC`)).toBeVisible();
  await expect(
    page.getByText(/priority unset to high; due unset to/),
  ).toBeVisible();
  const exact = await request.get(`/api/v1/work-items/${taskId}`);
  expect((await exact.json()).dueOn).toBe(dueOn);
  const source = await request.get(`/api/v1/captures/${capture.id}`);
  expect((await source.json()).originalContent).toBe(original);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Upcoming work" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review all upcoming work" }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByText("Loading upcoming work...")).toBeHidden();
  const targetTask = page
    .getByRole("list", { name: "Upcoming work" })
    .getByRole("link", { name: `Scheduled work ${suffix}` });
  for (
    let pageIndex = 0;
    pageIndex < 10 && (await targetTask.count()) === 0;
    pageIndex += 1
  ) {
    const more = page.getByRole("button", { name: "Load more work" });
    await expect(more).toBeVisible();
    await more.click();
  }
  await expect(targetTask).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(horizontalOverflow).toBe(false);

  const stale = await request.put(`/api/v1/work-items/${taskId}/planning`, {
    data: {
      expectedUpdatedAt: filed.record.updatedAt,
      priority: "low",
      dueOn: null,
    },
  });
  expect(stale.status()).toBe(409);
  const completion = await request.post(`/api/v1/work-items/${taskId}/status`, {
    data: { expectedStatus: "open", status: "done" },
  });
  expect(completion.status()).toBe(200);
  const upcoming = await request.get("/api/v1/work-items/upcoming?limit=100");
  expect(
    (await upcoming.json()).items.some(
      (item: { id: string }) => item.id === taskId,
    ),
  ).toBe(false);
});
