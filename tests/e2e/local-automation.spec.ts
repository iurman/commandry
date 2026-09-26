import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("local automation queues one worker summary, records evidence, and gates disabled runs", async ({ page, request }) => {
  test.setTimeout(90_000);
  const token = `Routine${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `${token} project`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: `${token} original source` },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filedResponse = await request.post(`/api/v1/captures/${capture.id}/file`, {
    data: { projectId: project.id, kind: "task", title: `${token} task`, body: "Review local context" },
  });
  expect(filedResponse.status()).toBe(201);
  const task = (await filedResponse.json()).record;

  await page.goto("/automations");
  await page.getByLabel("Name").fill(`${token} summary`);
  const projectChoice = page.getByLabel("Project", { exact: true });
  const option = projectChoice.locator(`option[value="${project.id}"]`);
  while ((await option.count()) === 0) {
    const before = await projectChoice.locator("option").count();
    await page.getByRole("button", { name: "Load more project choices" }).click();
    await expect.poll(() => projectChoice.locator("option").count()).toBeGreaterThan(before);
  }
  await projectChoice.selectOption(project.id);
  const createResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/automations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create local routine" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const definition = await createResponse.json();
  await expect(page.getByRole("link", { name: `${token} summary` })).toBeVisible();
  await page.getByRole("link", { name: `${token} summary` }).click();
  await expect(page.getByRole("heading", { name: `${token} summary` })).toBeVisible();

  await expect.poll(async () => {
    const response = await request.get(`/api/v1/automations/${definition.id}/runs?limit=1`);
    const body = await response.json();
    return body.items[0]?.state;
  }, { timeout: 30_000 }).toBe("succeeded");
  await expect(page.getByText("Synthetic local automation · Unverified")).toBeVisible();
  await expect(page.getByText(/External actions: none/)).toBeVisible();
  const runsResponse = await request.get(`/api/v1/automations/${definition.id}/runs`);
  const firstRun = (await runsResponse.json()).items[0];
  expect(firstRun.trigger).toBe("on_creation");
  expect(firstRun.result).toMatchObject({ isSynthetic: true, verificationStatus: "unverified", externalActions: [] });
  expect(firstRun.result.evidence.some((source: { id: string }) => source.id === task.id)).toBe(true);
  const attemptsResponse = await request.get(`/api/v1/automation-runs/${firstRun.id}/attempts`);
  expect((await attemptsResponse.json()).items[0].state).toBe("succeeded");

  await page.getByRole("button", { name: "Disable routine" }).click();
  await expect(page.getByText("Disabled. Pending work will be skipped", { exact: false })).toBeVisible();
  const denied = await request.post(`/api/v1/automations/${definition.id}/runs`, { data: { occurrenceId: randomUUID() } });
  expect(denied.status()).toBe(409);
  expect((await denied.json()).code).toBe("AUTOMATION_DISABLED");
  await page.getByRole("button", { name: "Enable routine" }).click();
  const occurrenceId = randomUUID();
  const firstManual = await request.post(`/api/v1/automations/${definition.id}/runs`, { data: { occurrenceId } });
  expect(firstManual.status()).toBe(202);
  const replay = await request.post(`/api/v1/automations/${definition.id}/runs`, { data: { occurrenceId } });
  expect(replay.status()).toBe(202);
  expect((await replay.json()).id).toBe((await firstManual.json()).id);
  await expect.poll(async () => {
    const response = await request.get(`/api/v1/automation-runs/${(await firstManual.json()).id}`);
    return (await response.json()).state;
  }, { timeout: 30_000 }).toBe("succeeded");
  const auditResponse = await request.get(`/api/v1/automations/${definition.id}/audit?limit=100`);
  const audit = (await auditResponse.json()).items;
  expect(audit.some((event: { operation: string }) => event.operation === "automation.project_brief_read")).toBe(true);
  expect(audit.some((event: { operation: string }) => event.operation === "automation.enabled_changed")).toBe(true);
  await page.getByRole("button", { name: "Refresh audit" }).click();
  await expect(page.getByText("automation.project_brief_read").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
