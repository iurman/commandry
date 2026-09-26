import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a recurring local summary can be created in the UI and yields an audited synthetic run", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Recurring summary ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/automations");
  await expect(
    page.getByRole("heading", { name: "New local routine" }),
  ).toBeVisible();
  await page.getByLabel("Name").fill(`Recurring routine ${suffix}`);
  await page.getByLabel("Trigger").selectOption("recurring_interval");
  const localStart = await page.evaluate(() => {
    const due = new Date(Date.now() + 25_000);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}:${pad(due.getSeconds())}`;
  });
  await page.getByLabel("First run (device time)").fill(localStart);
  await page.getByLabel("Repeat every (minutes)").fill("5");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/automations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create local routine" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const definition = await response.json();
  expect(definition).toMatchObject({
    triggerType: "recurring_interval",
    recurrenceEveryMinutes: 5,
    enabled: true,
    sourceOfTruth: "local-only",
  });
  expect(definition.nextRunAt).toBe(definition.recurrenceStartAt);
  await expect(page.getByRole("link", { name: definition.name })).toBeVisible();
  await page.getByRole("link", { name: definition.name }).click();
  await expect(
    page
      .getByRole("definition")
      .filter({ hasText: "Recurring local interval" }),
  ).toBeVisible();
  await expect(page.getByText("Every 5 minutes")).toBeVisible();
  await expect(
    page.getByText(/at most the latest due interval becomes a run/),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        const runs = await request.get(
          `/api/v1/automations/${definition.id}/runs?limit=10`,
        );
        return (await runs.json()).items.find(
          (run: { trigger: string }) => run.trigger === "recurring",
        )?.state;
      },
      { timeout: 65_000 },
    )
    .toBe("succeeded");
  await expect(page.getByText("Recurring local run")).toBeVisible({
    timeout: 20_000,
  });
  const runs = await request.get(
    `/api/v1/automations/${definition.id}/runs?limit=10`,
  );
  const recurring = (await runs.json()).items.find(
    (run: { trigger: string }) => run.trigger === "recurring",
  );
  expect(recurring).toMatchObject({
    attempts: 1,
    result: {
      isSynthetic: true,
      verificationStatus: "unverified",
      externalActions: [],
    },
  });
  const audit = await request.get(
    `/api/v1/automations/${definition.id}/audit?limit=100`,
  );
  expect(
    (await audit.json()).items.some(
      (event: { operation: string; runId: string }) =>
        event.operation === "automation.run_queued" &&
        event.runId === recurring.id,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
