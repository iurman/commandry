import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

async function waitForImport(request: APIRequestContext, id: string) {
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/v1/synthetic-event-imports/${id}`,
        );
        expect(response.status()).toBe(200);
        return (await response.json()).state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");
}

test("synthetic flow replay traces persisted source and downstream automation", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Replay project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `Replay resource ${suffix}`, kind: "service" },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  expect(
    (
      await request.post(`/api/v1/projects/${project.id}/resources`, {
        data: { resourceId: resource.id, type: "supports" },
      })
    ).status(),
  ).toBe(201);
  const integrationResponse = await request.post("/api/v1/integrations", {
    data: {
      name: `Replay source ${suffix}`,
      kind: "synthetic-operations",
      projectId: project.id,
      resourceId: resource.id,
    },
  });
  expect(integrationResponse.status()).toBe(201);
  const integration = await integrationResponse.json();
  const automationResponse = await request.post("/api/v1/automations", {
    data: {
      projectId: project.id,
      name: `Replay routine ${suffix}`,
      enabled: true,
      eventType: "monitor.down",
    },
  });
  expect(automationResponse.status()).toBe(201);
  const automation = await automationResponse.json();
  const importResponse = await request.post(
    `/api/v1/integrations/${integration.id}/sample`,
    {
      data: {
        scenarioId: "operations.monitor-down",
        occurrenceId: randomUUID(),
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      },
    },
  );
  expect(importResponse.status()).toBe(202);
  const receipt = await importResponse.json();
  await waitForImport(request, receipt.id);
  const replayPath = `/api/v1/synthetic-event-imports/${receipt.id}/replay?limit=20`;
  await expect
    .poll(
      async () => {
        const response = await request.get(replayPath);
        expect(response.status()).toBe(200);
        return (await response.json()).stages.map(
          (stage: { kind: string }) => stage.kind,
        );
      },
      { timeout: 30_000 },
    )
    .toEqual(expect.arrayContaining(["automation_queued"]));
  const replayResponse = await request.get(replayPath);
  const replay = await replayResponse.json();
  expect(replay).toMatchObject({
    mode: "historical_replay",
    importId: receipt.id,
    projectId: project.id,
    scenarioId: "operations.monitor-down",
    importState: "succeeded",
    sourceLabel: "Synthetic operational fixture",
    isSynthetic: true,
  });
  expect(replay.stages.map((stage: { kind: string }) => stage.kind)).toEqual(
    expect.arrayContaining([
      "source_received",
      "attempt_started",
      "event_projected",
      "metric_projected",
      "alert_evidence",
      "automation_queued",
    ]),
  );
  expect(
    replay.stages.every((stage: { isSynthetic: boolean }) => stage.isSynthetic),
  ).toBe(true);
  expect(
    replay.stages.every(
      (stage: { recordedAt: string }, index: number) =>
        index === 0 || replay.stages[index - 1].recordedAt <= stage.recordedAt,
    ),
  ).toBe(true);
  for (const stage of replay.stages as Array<{ href: string | null }>) {
    if (stage.href?.startsWith("/api/v1/"))
      expect((await request.get(stage.href)).status()).toBe(200);
  }
  const invalidCursorResponse = await request.get(
    `${replayPath}&cursor=${randomUUID()}`,
  );
  expect(invalidCursorResponse.status()).toBe(400);
  await page.goto(`/flow-replay/${receipt.id}`);
  await expect(
    page.getByRole("heading", { name: "Synthetic flow replay" }),
  ).toBeVisible();
  await expect(
    page.getByText(/not a live stream or proof of external delivery/),
  ).toBeVisible();
  const timeline = page.getByRole("list", {
    name: "Persisted synthetic stages",
  });
  await expect(timeline).toContainText("Original synthetic envelope retained");
  await expect(timeline).toContainText("Normalized synthetic event projected");
  await expect(timeline).toContainText("Synthetic metric sample projected");
  await expect(timeline).toContainText("Linked local automation run");
  await expect(
    timeline.locator(
      `a[href="/api/v1/source-envelopes/${receipt.sourceEnvelopeId}"]`,
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  const runsResponse = await request.get(
    `/api/v1/automations/${automation.id}/runs?limit=1`,
  );
  expect((await runsResponse.json()).items).toHaveLength(1);
});
