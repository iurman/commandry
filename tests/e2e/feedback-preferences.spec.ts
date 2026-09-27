import { expect, test } from "@playwright/test";

test("device feedback stays silent by default, persists locally, and gates a direct cue", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (duration: number) => {
        window.sessionStorage.setItem("feedback-vibration", String(duration));
        return true;
      },
    });
  });
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Feedback on this device" }),
  ).toBeVisible();
  const sound = page.getByRole("checkbox", {
    name: "Enable soft acknowledgement sound",
  });
  const haptics = page.getByRole("checkbox", {
    name: "Enable supported-device vibration",
  });
  await expect(sound).not.toBeChecked();
  await expect(haptics).not.toBeChecked();
  await page.getByRole("button", { name: "Preview acknowledgement" }).click();
  await expect(
    page.getByText("Visual confirmation available. Sound off; vibration off."),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: "Reduce motion" }).check();
  await sound.check();
  await haptics.check();
  await page.getByRole("checkbox", { name: "Enable quiet hours" }).check();
  await page.getByLabel("Start").fill("09:00");
  await page.getByLabel("End").fill("09:00");
  await expect(page.getByText("Quiet hours are active now.")).toBeVisible();
  await page.getByRole("button", { name: "Preview acknowledgement" }).click();
  await expect(
    page.getByText(
      "Visual confirmation available. Sound suppressed; vibration suppressed.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.dataset.reducedMotion),
  ).toBe("true");

  await page.getByRole("checkbox", { name: "Enable quiet hours" }).uncheck();
  await sound.uncheck();
  await page.getByRole("button", { name: "Preview acknowledgement" }).click();
  await expect(
    page.getByText(
      "Visual confirmation available. Sound off; vibration requested.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.sessionStorage.getItem("feedback-vibration"),
    ),
  ).toBe("12");

  await page.reload();
  await expect(haptics).toBeChecked();
  await expect(sound).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Reduce motion" }),
  ).toBeChecked();
  expect(
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("commandry.feedback-settings.v1");
      return raw ? JSON.parse(raw) : null;
    }),
  ).toMatchObject({
    version: 1,
    preferences: {
      reducedMotion: true,
      soundEnabled: false,
      hapticsEnabled: true,
    },
    quietHours: { enabled: false, start: "09:00", end: "09:00" },
  });
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.dataset.reducedMotion),
  ).toBe("true");
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Feedback on this device" }),
  ).toBeVisible();
  await haptics.uncheck();
  await sound.check();
  await page.getByRole("button", { name: "Preview acknowledgement" }).click();
  await expect(
    page.getByText(
      "Visual confirmation available. Sound scheduled; vibration off.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
