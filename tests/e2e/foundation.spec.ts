import { expect, test } from "@playwright/test";

test("local shell identifies unavailable data without claiming system health", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Command Center" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveCount(1);
  await expect(page.getByText("Not connected")).toBeVisible();
  await expect(page.getByText("No data")).toHaveCount(3);
  await expect(
    page.getByText(/does not report project or system health/),
  ).toBeVisible();
});

test("liveness and version endpoints expose local operational metadata", async ({
  request,
}) => {
  const live = await request.get("/health/live", {
    headers: { "x-correlation-id": "e2e-live" },
  });
  expect(live.status()).toBe(200);
  expect(live.headers()["x-correlation-id"]).toBe("e2e-live");
  expect(await live.json()).toEqual({ status: "alive", service: "web" });

  const version = await request.get("/version");
  expect(version.status()).toBe(200);
  expect(await version.json()).toEqual(
    expect.objectContaining({
      environment: "local",
      schemaCompatibility: "1",
    }),
  );
});
