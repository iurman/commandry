import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a scheduled local summary waits for its due time and preserves one audited occurrence", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Scheduled summary ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const definitionResponse = await request.post("/api/v1/automations", {
    data: {
      projectId: project.id,
      name: `Scheduled routine ${suffix}`,
      enabled: true,
    },
  });
  expect(definitionResponse.status()).toBe(201);
  const definition = await definitionResponse.json();
  await expect
    .poll(
      async () => {
        const page = await request.get(
          `/api/v1/automations/${definition.id}/runs?limit=1`,
        );
        return (await page.json()).items[0]?.state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/automations/${definition.id}`);
  await expect(
    page.getByRole("heading", { name: definition.name }),
  ).toBeVisible();
  const deviceTime = await page.evaluate(() => {
    const due = new Date(Date.now() + 25_000);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}:${pad(due.getSeconds())}`;
  });
  await page
    .getByLabel("Schedule one local run (device time)")
    .fill(deviceTime);
  const submission = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/automations/${definition.id}/runs`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Schedule local run" }).click();
  const response = await submission;
  expect(response.status()).toBe(202);
  const scheduled = await response.json();
  expect(scheduled).toMatchObject({
    trigger: "scheduled",
    state: "queued",
    attempts: 0,
    result: null,
  });
  expect(Date.parse(scheduled.scheduledFor) - Date.now()).toBeGreaterThan(
    10_000,
  );
  await expect(page.getByText("Scheduled local run")).toBeVisible();
  await expect(
    page.getByRole("definition").filter({ hasText: scheduled.scheduledFor }),
  ).toBeVisible();

  const queued = await request.get(
    `/api/v1/automations/${definition.id}/runs?limit=5`,
  );
  expect(
    (await queued.json()).items.find(
      (run: { id: string }) => run.id === scheduled.id,
    ),
  ).toMatchObject({ state: "queued", attempts: 0 });
  const definitionNow = await request.get(
    `/api/v1/automations/${definition.id}`,
  );
  expect((await definitionNow.json()).nextRunAt).toBe(scheduled.scheduledFor);
  await page.getByRole("button", { name: "Run now locally" }).click();
  await expect
    .poll(
      async () => {
        const runs = await request.get(
          `/api/v1/automations/${definition.id}/runs?limit=5`,
        );
        return (await runs.json()).items.find(
          (run: { trigger: string }) => run.trigger === "manual",
        )?.state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");
  await expect(
    page.getByText("Manual local run").locator("..").getByText("succeeded"),
  ).toBeVisible({ timeout: 30_000 });
  const replay = await request.post(
    `/api/v1/automations/${definition.id}/runs`,
    {
      data: {
        occurrenceId: scheduled.occurrenceId,
        scheduledFor: scheduled.scheduledFor,
      },
    },
  );
  expect(replay.status()).toBe(202);
  expect((await replay.json()).id).toBe(scheduled.id);
  const conflict = await request.post(
    `/api/v1/automations/${definition.id}/runs`,
    {
      data: {
        occurrenceId: scheduled.occurrenceId,
        scheduledFor: new Date(
          Date.parse(scheduled.scheduledFor) + 60_000,
        ).toISOString(),
      },
    },
  );
  expect(conflict.status()).toBe(409);
  const expired = await request.post(
    `/api/v1/automations/${definition.id}/runs`,
    {
      data: {
        occurrenceId: randomUUID(),
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
      },
    },
  );
  expect(expired.status()).toBe(400);

  await expect
    .poll(
      async () => {
        const run = await request.get(
          `/api/v1/automation-runs/${scheduled.id}`,
        );
        return (await run.json()).state;
      },
      { timeout: 90_000 },
    )
    .toBe("succeeded");
  const completed = await request.get(
    `/api/v1/automation-runs/${scheduled.id}`,
  );
  expect(await completed.json()).toMatchObject({
    attempts: 1,
    result: {
      isSynthetic: true,
      verificationStatus: "unverified",
      externalActions: [],
    },
  });
  await expect
    .poll(async () => {
      const current = await request.get(`/api/v1/automations/${definition.id}`);
      return (await current.json()).nextRunAt;
    })
    .toBeNull();
  const attempts = await request.get(
    `/api/v1/automation-runs/${scheduled.id}/attempts`,
  );
  expect((await attempts.json()).items).toHaveLength(1);
  const audit = await request.get(
    `/api/v1/automations/${definition.id}/audit?limit=100`,
  );
  expect(
    (await audit.json()).items.some(
      (entry: { operation: string; runId: string }) =>
        entry.operation === "automation.run_queued" &&
        entry.runId === scheduled.id,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
