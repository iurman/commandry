import { expect, test } from "@playwright/test";

test("local recovery evidence stays distinct from production readiness", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await request.get("/api/v1/local-recovery-status");
  expect(response.status()).toBe(200);
  const status = await response.json();
  expect(status.environment).toBe("local");
  expect(status.productionReady).toBe(false);
  expect(status.productionGates).toHaveLength(4);
  expect(
    status.productionGates.every(
      (gate: { status: string }) => gate.status === "unverified",
    ),
  ).toBe(true);
  const historyResponse = await request.get("/api/v1/local-recovery-drills");
  expect(historyResponse.status()).toBe(200);
  const history = await historyResponse.json();
  expect(Array.isArray(history.items)).toBe(true);
  if (status.latestDrill) {
    expect(history.items[0].id).toBe(status.latestDrill.id);
    const exact = await request.get(
      `/api/v1/local-recovery-drills/${status.latestDrill.id}`,
    );
    expect(exact.status()).toBe(200);
    expect((await exact.json()).sourceLabel).toBe(
      "Local disposable PostgreSQL restore rehearsal",
    );
  }

  await page.goto("/infrastructure");
  await page
    .getByRole("link", {
      name: "Review local recovery evidence and production gates",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Local recovery rehearsal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Production gates" }),
  ).toBeVisible();
  await expect(page.getByText("Not verified")).toBeVisible();
  await expect(
    page.getByText("Human sign-in and account recovery"),
  ).toBeVisible();
  await expect(
    page.getByText(`Latest rehearsal: ${status.localRehearsal}`),
  ).toBeVisible();
  if (status.latestDrill) {
    await expect(
      page
        .getByRole("link", { name: "Exact drill evidence and digests" })
        .first(),
    ).toHaveAttribute(
      "href",
      `/api/v1/local-recovery-drills/${status.latestDrill.id}`,
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
