import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("packet readiness schedules a scoped fake overnight run and links its morning evidence", async ({
  page,
  request,
}) => {
  test.setTimeout(100_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Overnight ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const captureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `Overnight ${suffix} original task`,
    },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const title = `Overnight review ${suffix}`;
  const filingResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title,
        body: "Review the packet evidence in a fake local run.",
      },
    },
  );
  expect(filingResponse.status()).toBe(201);
  const task = (await filingResponse.json()).record;
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [], selectedResourceIds: [] } },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();
  const agentResponse = await request.post("/api/v1/agents", {
    data: { name: `Overnight fake agent ${suffix}` },
  });
  expect(agentResponse.status()).toBe(201);
  const agent = await agentResponse.json();

  const beforeAssignment = await request.get(
    `/api/v1/overnight/readiness?packetId=${packet.id}&agentId=${agent.id}`,
  );
  expect(beforeAssignment.status()).toBe(200);
  expect((await beforeAssignment.json()).ready).toBe(false);
  expect(
    (
      await request.post(`/api/v1/agents/${agent.id}/projects`, {
        data: { projectId: project.id },
      })
    ).status(),
  ).toBe(201);

  await page.goto(`/execution-packets/${packet.id}`);
  await expect(
    page.getByRole("heading", { name: "Queue a fake overnight run" }),
  ).toBeVisible();
  const choice = page.getByRole("combobox", {
    name: "Eligible project-scoped agent",
  });
  while ((await choice.locator(`option[value="${agent.id}"]`).count()) === 0) {
    await page.getByRole("button", { name: "Load more local agents" }).click();
  }
  await choice.selectOption(agent.id);
  await expect(
    page.getByText("Ready: Agent is assigned to the packet project"),
  ).toBeVisible();
  const due = new Date(Date.now() + 8000);
  const localDue = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}T${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}:${String(due.getSeconds()).padStart(2, "0")}`;
  await page.getByLabel("Run after (your local time)").fill(localDue);
  const scheduleResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/overnight") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Schedule fake local run" }).click();
  const scheduleResponse = await scheduleResponsePromise;
  expect(scheduleResponse.status()).toBe(201);
  const scheduled = await scheduleResponse.json();
  expect(scheduled.sourceLabel).toBe("Synthetic local overnight queue");
  await page.getByRole("link", { name: "Review Overnight Queue" }).click();
  await expect(
    page.getByRole("heading", { name: "Overnight Queue" }),
  ).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: title });
  await expect(card.getByText("scheduled", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: "Open saved overnight plan" }).click();
  await expect(page).toHaveURL(new RegExp(`/overnight/${scheduled.id}$`));
  await expect(
    page.getByRole("heading", { name: "Queue history" }),
  ).toBeVisible();
  await expect(
    page.getByText("scheduled · local-user:unattributed"),
  ).toBeVisible();

  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/v1/overnight/${scheduled.id}`);
        const current = await response.json();
        return [current.state, current.runState];
      },
      { timeout: 50_000 },
    )
    .toEqual(["dispatched", "succeeded"]);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(
    page.getByRole("link", { name: "Review succeeded" }),
  ).toBeVisible();
  await expect(page.getByText("dispatched · system:worker")).toBeVisible();
  await page.getByRole("link", { name: "Review succeeded" }).click();
  await expect(
    page.getByText(/This is a synthetic, unverified result/),
  ).toBeVisible();

  await page.goto("/morning");
  await expect(
    page.getByRole("heading", { name: "Morning run digest" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Overnight plan" }).first(),
  ).toHaveAttribute("href", `/overnight/${scheduled.id}`);

  const laterResponse = await request.post("/api/v1/overnight", {
    data: {
      packetId: packet.id,
      agentId: agent.id,
      runAfter: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  expect(laterResponse.status()).toBe(201);
  const later = await laterResponse.json();
  await page.goto(`/overnight/${later.id}`);
  await page.getByRole("button", { name: "Cancel scheduled run" }).click();
  await expect(
    page.getByText("canceled · local-user:unattributed"),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/v1/overnight/${later.id}`)).json()).state,
  ).toBe("canceled");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
