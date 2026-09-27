import { expect, test } from "@playwright/test";

test("project context edits update the workspace, brief, and exact history", async ({
  page,
}) => {
  const name = `Garden context ${crypto.randomUUID().slice(0, 8)}`;
  const createdResponse = await page.request.post("/api/v1/projects", {
    data: { name, summary: "Collect ideas", type: "personal" },
  });
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as {
    id: string;
    version: number;
  };
  expect(created.version).toBe(1);

  await page.goto(`/projects/${created.id}`);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit project details" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`${name} revised`);
  await page.getByLabel("Summary", { exact: true }).fill("Autumn planting");
  await page.getByLabel("Lifecycle").selectOption("paused");
  await page.getByRole("button", { name: "Save details" }).click();

  await expect(
    page.getByRole("heading", { name: `${name} revised`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Version 2", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Project changes" }),
  ).toContainText("Changed Name, Summary, Lifecycle");
  const exact = page.getByRole("link", { name: "Exact audit record" });
  const href = await exact.getAttribute("href");
  expect(href).toBe(`/api/v1/projects/${created.id}/changes/2`);
  const historyResponse = await page.request.get(href!);
  expect(historyResponse.status()).toBe(200);
  const history = (await historyResponse.json()) as {
    previous: { name: string };
    current: { name: string; lifecycle: string };
  };
  expect(history.previous.name).toBe(name);
  expect(history.current.name).toBe(`${name} revised`);
  expect(history.current.lifecycle).toBe("paused");

  const stale = await page.request.patch(`/api/v1/projects/${created.id}`, {
    data: {
      expectedVersion: 1,
      name: "Stale overwrite",
      summary: null,
      type: "personal",
      lifecycle: "active",
    },
  });
  expect(stale.status()).toBe(409);
  const briefResponse = await page.request.get(
    `/api/v1/projects/${created.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = (await briefResponse.json()) as {
    project: { name: string; lifecycle: string };
  };
  expect(brief.project.name).toBe(`${name} revised`);
  expect(brief.project.lifecycle).toBe("paused");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});
