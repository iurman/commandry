import { expect, test } from "@playwright/test";

test("Appearance controls fit and remain hittable across actual wrap boundaries", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One continuous desktop width sweep includes phone sizes.",
  );
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const seeded = await request.post("/api/v1/resources", {
    data: { name: "Observatory overlay baseline", kind: "host" },
  });
  expect(seeded.status()).toBe(201);
  await page.goto("/infrastructure/wallboard");
  const appearance = page.locator(".cmd-op-toolbar").getByRole("button", {
    name: "Appearance and views",
    exact: true,
  });
  await expect(appearance).toBeVisible();
  const failures: unknown[] = [];
  for (const width of [
    320, 360, 390, 440, 480, 520, 560, 600, 640, 680, 720, 768, 820, 870, 920,
    954, 974, 994, 1040, 1100, 1180, 1280,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await appearance.scrollIntoViewIfNeeded();
    await appearance.click();
    const surface = page.getByRole("combobox", {
      name: /^(Gravity surface|Surface theme)$/,
    });
    await expect(surface).toBeVisible();
    const result = await surface.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const bounds = {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth),
        bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight),
      };
      const x = Math.max(
        bounds.left + 1,
        Math.min(bounds.right - 1, rect.left + rect.width / 2),
      );
      const y = Math.max(
        bounds.top + 1,
        Math.min(bounds.bottom - 1, rect.top + rect.height / 2),
      );
      const hit = document.elementFromPoint(x, y);
      return {
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        },
        bounds,
        hittable: !!hit && (hit === element || element.contains(hit)),
        fit:
          rect.left >= bounds.left &&
          rect.right <= bounds.right &&
          rect.top >= bounds.top &&
          rect.bottom <= bounds.bottom,
      };
    });
    if (!result.fit || !result.hittable) {
      failures.push({ width, ...result });
      if (failures.length === 1)
        await page.screenshot({
          path: testInfo.outputPath("appearance-clipped.png"),
          fullPage: true,
        });
    }
    await page.keyboard.press("Escape");
    await expect(appearance).toBeFocused();
    await expect(page).toHaveURL(/\/infrastructure\/wallboard/);
  }
  await testInfo.attach("wrap-boundary-bounds", {
    body: JSON.stringify(failures, null, 2),
    contentType: "application/json",
  });
  expect(
    failures,
    "Every tested width must keep the actual select control inside the visual viewport and hit-testable",
  ).toEqual([]);
});
