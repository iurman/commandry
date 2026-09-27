import { expect, test } from "@playwright/test";

test("local release evidence shows a code rollback without claiming production readiness", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "/api/v1/local-release-rehearsals?limit=1",
  );
  expect(response.status()).toBe(200);
  const history = await response.json();
  expect(Array.isArray(history.items)).toBe(true);
  expect(history.items.length).toBeLessThanOrEqual(1);
  if (history.items.length > 0) {
    const latest = history.items[0];
    expect(latest).toMatchObject({
      environment: "local",
      sourceLabel: "Isolated local application rollback rehearsal",
    });
    const exact = await request.get(
      `/api/v1/local-release-rehearsals/${latest.id}`,
    );
    expect(exact.status()).toBe(200);
    expect(await exact.json()).toEqual(latest);
  }
  const invalidCursor = await request.get(
    `/api/v1/local-release-rehearsals?cursor=${crypto.randomUUID()}`,
  );
  expect(invalidCursor.status()).toBe(400);

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/infrastructure/recovery");
  await expect(
    page.getByRole("heading", { name: "Local release and rollback" }),
  ).toBeVisible();
  await expect(page.getByText(/does not rehearse a VPS deploy/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Production gates" }),
  ).toBeVisible();
  if (history.items.length > 0) {
    await expect(
      page.locator(
        `a[href="/api/v1/local-release-rehearsals/${history.items[0].id}"]`,
      ),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", {
        name: "No local release rehearsal recorded",
      }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
