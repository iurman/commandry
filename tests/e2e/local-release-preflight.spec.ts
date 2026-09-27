import { expect, test } from "@playwright/test";

test("Recovery shows persisted local preflight evidence without claiming VPS readiness", async ({
  page,
  request,
}) => {
  const listResponse = await request.get(
    "/api/v1/local-release-preflights?limit=1",
  );
  expect(listResponse.status()).toBe(200);
  const list = (await listResponse.json()) as {
    items: Array<{ id: string; outcome: "passed" | "failed" }>;
  };
  const statusResponse = await request.get("/api/v1/local-recovery-status");
  expect(statusResponse.status()).toBe(200);
  const status = (await statusResponse.json()) as { productionReady: boolean };
  expect(status.productionReady).toBe(false);

  await page.goto("/infrastructure/recovery");
  await expect(
    page.getByRole("heading", { name: "Local release preflight" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Production gates" }),
  ).toBeVisible();
  const latest = list.items[0];
  if (latest) {
    const evidenceLink = page.locator(
      `a[href="/api/v1/local-release-preflights/${latest.id}"]`,
    );
    await expect(evidenceLink).toBeVisible();
    const detailResponse = await request.get(
      `/api/v1/local-release-preflights/${latest.id}`,
    );
    expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()) as {
      id: string;
      outcome: string;
      sourceLabel: string;
      backupEvidenceId: string | null;
      recoveryEvidenceId: string | null;
      releaseEvidenceId: string | null;
    };
    expect(detail.id).toBe(latest.id);
    expect(detail.outcome).toBe(latest.outcome);
    expect(detail.sourceLabel).toBe("Local Compose release preflight");
    if (latest.outcome === "passed") {
      expect(detail.backupEvidenceId).toBeTruthy();
      expect(detail.recoveryEvidenceId).toBeTruthy();
      expect(detail.releaseEvidenceId).toBeTruthy();
    }
  } else {
    await expect(page.getByText("No local preflight recorded")).toBeVisible();
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});
