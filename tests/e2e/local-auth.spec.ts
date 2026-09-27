import { expect, test } from "@playwright/test";

const password = process.env.LOCAL_AUTH_TEST_PASSWORD;
const email = process.env.LOCAL_AUTH_TEST_EMAIL;

test("provisional owner can sign in, use a protected API, and sign out", async ({
  page,
}) => {
  test.skip(!password || !email, "Opt-in local auth smoke only");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  const denied = await page.request.get("/api/v1/projects");
  expect(denied.status()).toBe(401);

  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Command Center" }),
  ).toBeVisible();
  const allowed = await page.evaluate(async () =>
    fetch("/api/v1/projects").then((response) => response.status),
  );
  expect(allowed).toBe(200);

  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByText(email!)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const expired = await page.request.get("/api/v1/projects");
  expect(expired.status()).toBe(401);
});
