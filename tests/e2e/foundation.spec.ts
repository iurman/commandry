import { expect, test } from "@playwright/test";

test("local shell labels simulated data without claiming live health", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Command Center" }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(navigation.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Projects" }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Work" })).toHaveAttribute(
    "href",
    "/work",
  );
  await expect(
    navigation.getByRole("link", { name: "Knowledge" }),
  ).toHaveAttribute("href", "/knowledge");
  await expect(
    navigation.getByRole("link", { name: "Integrations" }),
  ).toHaveAttribute("href", "/integrations");
  await expect(
    navigation.getByRole("link", { name: "Infrastructure" }),
  ).toHaveAttribute("href", "/infrastructure");
  await expect(navigation.getByRole("link", { name: "Signals" })).toHaveAttribute(
    "href",
    "/attention-signals",
  );
  await expect(navigation.getByRole("link", { name: "Search" })).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Activity" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Agents" }),
  ).toHaveAttribute("href", "/agents");
  await expect(
    navigation.getByRole("link", { name: "Approvals" }),
  ).toHaveAttribute("href", "/approvals");
  await expect(
    navigation.getByRole("link", { name: "Automations" }),
  ).toHaveAttribute("href", "/automations");
  await expect(
    navigation.getByRole("link", { name: "Overnight" }),
  ).toHaveAttribute("href", "/overnight");
  await expect(
    navigation.getByRole("link", { name: "Notifications" }),
  ).toHaveAttribute("href", "/notifications");
  await expect(page.getByText("No live sources")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Attention", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent change" }),
  ).toBeVisible();
  await expect(
    page.getByText(/does not report live project or resource health/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
