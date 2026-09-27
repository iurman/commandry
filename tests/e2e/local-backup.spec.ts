import { expect, test } from "@playwright/test";

test("local backup evidence remains distinct from production readiness", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/v1/local-backups?limit=1");
  expect(response.status()).toBe(200);
  const history = await response.json();
  expect(Array.isArray(history.items)).toBe(true);
  expect(history.items.length).toBeLessThanOrEqual(1);
  if (history.items.length > 0) {
    const latest = history.items[0];
    expect(latest).toMatchObject({
      environment: "local",
      sourceLabel: "Encrypted local PostgreSQL archive",
      formatVersion: 1,
    });
    const exact = await request.get(`/api/v1/local-backups/${latest.id}`);
    expect(exact.status()).toBe(200);
    expect(await exact.json()).toEqual(latest);
  }
  const invalidCursor = await request.get(
    `/api/v1/local-backups?cursor=${crypto.randomUUID()}`,
  );
  expect(invalidCursor.status()).toBe(400);

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/infrastructure/recovery");
  await expect(
    page.getByRole("heading", { name: "Encrypted local backups" }),
  ).toBeVisible();
  await expect(
    page.getByText(/does not recheck the file or establish an offsite copy/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Production gates" }),
  ).toBeVisible();
  await expect(page.getByText("Not verified").first()).toBeVisible();
  if (history.items.length > 0) {
    await expect(
      page
        .locator(`a[href="/api/v1/local-backups/${history.items[0].id}"]`)
        .first(),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { name: "No local backup recorded" }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
