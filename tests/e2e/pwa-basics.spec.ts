import { expect, test } from "@playwright/test";

test("local PWA keeps project data online-only and offers generic offline help", async ({
  page,
  context,
  request,
}) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: "Commandry",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.getByText("Local app reachable")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
    )
    .toBe(true);
  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name);
        return (await cache.keys()).map((item) => new URL(item.url).pathname);
      }),
    );
    return urls.flat();
  });
  expect(cachedUrls).toEqual(["/offline.html"]);

  await page.getByText("Phone and offline use").click();
  await expect(
    page.getByText(/project pages or API results for offline use/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await context.setOffline(true);
  await expect(page.getByText("Device offline")).toBeVisible();
  await page.goto("/projects");
  await expect(
    page.getByRole("heading", {
      name: "Commandry cannot load this page offline.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/Project content, actions, and API results/)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try Commandry again" }).click();
  await expect(page.getByText("Local app reachable")).toBeVisible();
  expect(errors).toEqual([]);
});
