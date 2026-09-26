import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("morning digest reviews source-linked local worker outcomes in a chosen project window", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Morning ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const names = [`Morning summary ${suffix}`, `Second summary ${suffix}`];
  const definitions = [];
  for (const name of names) {
    const response = await request.post("/api/v1/automations", {
      data: { projectId: project.id, name, enabled: true },
    });
    expect(response.status()).toBe(201);
    definitions.push(await response.json());
  }
  await expect
    .poll(
      async () => {
        const states = await Promise.all(
          definitions.map(async (definition) => {
            const response = await request.get(
              `/api/v1/automations/${definition.id}/runs?limit=1`,
            );
            return (await response.json()).items[0]?.state;
          }),
        );
        return states;
      },
      { timeout: 45_000 },
    )
    .toEqual(["succeeded", "succeeded"]);

  await page.goto("/automations");
  await page
    .getByRole("link", { name: "Open the source-linked morning run digest" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Morning run digest" }),
  ).toBeVisible();
  const projectChoice = page.getByLabel("Project", { exact: true });
  const option = projectChoice.locator(`option[value="${project.id}"]`);
  while ((await option.count()) === 0) {
    const before = await projectChoice.locator("option").count();
    await page
      .getByRole("button", { name: "Load more project choices" })
      .click();
    await expect
      .poll(() => projectChoice.locator("option").count())
      .toBeGreaterThan(before);
  }
  await projectChoice.selectOption(project.id);
  await page.getByRole("button", { name: "Show outcomes" }).click();
  await expect(page.getByText(/2 loaded\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: names[0] })).toBeVisible();
  await expect(page.getByRole("heading", { name: names[1] })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Completed, awaiting review" }),
  ).toBeVisible();
  await expect(page.getByText("Unverified").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Run record and audit" }).first(),
  ).toHaveAttribute("href", /\/api\/v1\/automation-runs\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("link", { name: "Source evidence" }).first(),
  ).toHaveAttribute("href", `/api/v1/projects/${project.id}`);

  const from = new Date(Date.now() - 60 * 60_000).toISOString();
  const to = new Date(Date.now() + 60 * 60_000).toISOString();
  const params = new URLSearchParams({
    from,
    to,
    projectId: project.id,
    limit: "1",
  });
  const firstResponse = await request.get(`/api/v1/morning-digest?${params}`);
  expect(firstResponse.status()).toBe(200);
  const firstPage = await firstResponse.json();
  expect(firstPage.items).toHaveLength(1);
  expect(firstPage.nextCursor).toBeTruthy();
  params.set("cursor", firstPage.nextCursor);
  const secondResponse = await request.get(`/api/v1/morning-digest?${params}`);
  expect(secondResponse.status()).toBe(200);
  const secondPage = await secondResponse.json();
  expect(secondPage.items).toHaveLength(1);
  expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
  expect(secondPage.nextCursor).toBeNull();
  params.set("cursor", "invalid");
  const invalidCursor = await request.get(`/api/v1/morning-digest?${params}`);
  expect(invalidCursor.status()).toBe(400);
  expect((await invalidCursor.json()).code).toBe("INVALID_CURSOR");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
