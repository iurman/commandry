import { expect, test } from "@playwright/test";

test("project overview settings preserve hidden Work and exact source evidence", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const createdResponse = await request.post("/api/v1/projects", {
    data: { name: `Overview ${suffix}`, type: "personal" },
  });
  expect(createdResponse.status()).toBe(201);
  const project = (await createdResponse.json()) as { id: string };
  const capturedResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `Plan the garden bed ${suffix}`,
    },
  });
  expect(capturedResponse.status()).toBe(201);
  const capture = (await capturedResponse.json()) as { id: string };
  const filedResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `Garden bed ${suffix}`,
        body: "Prepare a source-backed plan.",
      },
    },
  );
  expect(filedResponse.status()).toBe(201);
  const filed = (await filedResponse.json()) as { record: { id: string } };

  await page.goto(`/projects/${project.id}`);
  const overview = page.getByRole("region", { name: "At a glance" });
  await expect(overview.getByText(`Garden bed ${suffix}`)).toBeVisible();
  const workCard = overview.locator("article").filter({
    hasText: `Garden bed ${suffix}`,
  });
  await expect(
    workCard.getByRole("link", { name: "Exact evidence" }),
  ).toHaveAttribute("href", `/api/v1/work-items/${filed.record.id}`);
  await page.getByRole("button", { name: "Customize project view" }).click();
  await page.getByRole("checkbox", { name: "Project work" }).uncheck();
  await page.getByRole("checkbox", { name: "Knowledge", exact: true }).check();
  await page
    .getByRole("list", { name: "Selected overview cards" })
    .getByRole("listitem")
    .filter({ hasText: "Knowledge" })
    .getByRole("button", { name: "Move up" })
    .click();
  await page.getByRole("button", { name: "Save project view" }).click();
  await expect(page.locator("#work-heading")).toHaveCount(0);
  await expect(overview.getByText(`Garden bed ${suffix}`)).toBeVisible();
  await expect(
    overview.getByRole("heading", { name: "Knowledge" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Open work" })
      .getByRole("link", { name: "View all work" }),
  ).toHaveAttribute("href", `/work?projectId=${project.id}`);

  await page.reload();
  await expect(page.getByText("View version 2")).toBeVisible();
  await expect(page.locator("#work-heading")).toHaveCount(0);
  const savedView = await request.get(
    `/api/v1/projects/${project.id}/presentation`,
  );
  expect(savedView.status()).toBe(200);
  const view = (await savedView.json()) as {
    version: number;
    overviewCards: string[];
    visibleAreas: string[];
  };
  expect(view.version).toBe(2);
  expect(view.overviewCards).toContain("knowledge");
  expect(view.overviewCards.indexOf("knowledge")).toBeLessThan(
    view.overviewCards.indexOf("attention"),
  );
  expect(view.visibleAreas).not.toContain("work");
  const workResponse = await request.get(
    `/api/v1/work-items/${filed.record.id}`,
  );
  expect(workResponse.status()).toBe(200);

  const stale = await request.patch(
    `/api/v1/projects/${project.id}/presentation`,
    {
      data: {
        expectedVersion: 1,
        overviewCards: ["state"],
        visibleAreas: ["work"],
      },
    },
  );
  expect(stale.status()).toBe(409);
  await page.getByRole("button", { name: "Review view changes" }).click();
  const exact = page.getByRole("link", { name: "Exact audit record" }).last();
  await expect(exact).toHaveAttribute(
    "href",
    `/api/v1/projects/${project.id}/presentation/changes/2`,
  );
  const audit = await request.get(
    `/api/v1/projects/${project.id}/presentation/changes/2`,
  );
  expect(audit.status()).toBe(200);

  await page.getByRole("button", { name: "Customize project view" }).click();
  await page.getByRole("checkbox", { name: "Project work" }).check();
  await page.getByRole("button", { name: "Save project view" }).click();
  await expect(page.getByRole("list", { name: "Project work" })).toContainText(
    `Garden bed ${suffix}`,
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});
