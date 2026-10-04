import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("real host source management, evidence, scope and continuation work in light and dark themes", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Real-source browser ${suffix}`, type: "software" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `Host ${suffix}`, kind: "host" },
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
  await page.goto(`/integrations?projectId=${project.id}`);
  const panel = page.getByRole("region", { name: "Real sources", exact: true });
  await expect(panel.getByText("Loading real sources...")).toBeHidden();
  await page.getByLabel("Real source category").selectOption("linux-host");
  await page.getByLabel("Real source resource").selectOption(resource.id);
  await page.getByLabel("Real source name").fill(`Electra ${suffix}`);
  await page.getByLabel("Exact host name").fill("electra");
  await page.getByRole("button", { name: "Connect real source" }).click();
  const card = panel.getByRole("article", {
    name: `Electra ${suffix}`,
    exact: true,
  });
  await expect(card).toContainText("unknown");
  const configured = await request.get("/api/v1/real-integrations?limit=100");
  const source = (await configured.json()).items.find(
    (item: { name: string }) => item.name === `Electra ${suffix}`,
  );
  expect(source.isSynthetic).toBe(false);
  const issuedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/${source.id}/token`) &&
      response.request().method() === "POST",
  );
  await card
    .getByRole("button", { name: `Rotate host token for Electra ${suffix}` })
    .click();
  const issued = await (await issuedResponse).json();
  await expect(
    card.getByText("Save this token privately", { exact: false }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Hide host token" }).click();
  const sample = {
    hostname: "electra",
    sampleId: randomUUID(),
    observedAt: new Date().toISOString(),
    memory: { totalBytes: 1000, availableBytes: 500 },
    disk: { totalBytes: 1000, availableBytes: 750 },
    uptimeSeconds: 10,
    load1Milli: 100,
  };
  const receiver = `/api/v1/real-integrations/${source.id}/receive`;
  expect((await request.post(receiver, { data: sample })).status()).toBe(401);
  expect(
    (
      await request.post(receiver, {
        data: sample,
        headers: { authorization: `Bearer ${issued.token}` },
      })
    ).status(),
  ).toBe(202);
  await page
    .getByRole("button", { name: "Refresh real sources", exact: true })
    .click();
  await expect(card).toContainText("fresh");
  await card
    .getByRole("button", { name: `View observations for Electra ${suffix}` })
    .click();
  await expect(card).toContainText("Memory used: 50%");
  await expect(card).toContainText("Disk used: 25%");
  await expect(card).toContainText("Host uptime: 10 seconds");
  await expect(card).toContainText("Load average (1 minute): 0.1");
  const link = card.getByRole("link", { name: "Inspect real source evidence" });
  const evidence = await request.get((await link.getAttribute("href"))!);
  expect(evidence.status()).toBe(200);
  expect((await evidence.json()).rawPayload).toEqual(sample);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(
      card.getByRole("button", { name: `Disable Electra ${suffix}` }),
    ).toBeVisible();
    const overflow = await panel.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    expect(overflow).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      ),
    ).toBe(false);
    await card.screenshot({
      path: testInfo.outputPath(`real-source-card-${colorScheme}.png`),
    });
    await page.screenshot({
      path: testInfo.outputPath(`real-source-${colorScheme}.png`),
      fullPage: true,
    });
    await card
      .getByRole("button", { name: `Disable Electra ${suffix}` })
      .click();
    await expect(card).toContainText("Disabled");
    expect(
      (
        await request.post(receiver, {
          data: sample,
          headers: { authorization: `Bearer ${issued.token}` },
        })
      ).status(),
    ).toBe(409);
    await card
      .getByRole("button", { name: `Enable Electra ${suffix}` })
      .click();
    await expect(card).toContainText("Enabled");
  }
  await page.reload();
  await expect(panel.getByText("Loading real sources...")).toBeHidden();
  while ((await card.count()) === 0) {
    const before = await panel.getByRole("article").count();
    await panel.getByRole("button", { name: "Load more real sources" }).click();
    await expect
      .poll(() => panel.getByRole("article").count())
      .toBeGreaterThan(before);
  }
  await expect(card).toContainText("fresh");
  // All eligible rows remain reachable through source continuation, with one shared project and host fixture.
  for (let index = 0; index < 21; index++)
    expect(
      (
        await request.post("/api/v1/real-integrations", {
          data: {
            name: `Continuation ${suffix} ${index}`,
            kind: "linux-host",
            identifier: "electra",
            projectId: project.id,
            resourceId: resource.id,
          },
        })
      ).status(),
    ).toBe(201);
  await page
    .getByRole("button", { name: "Refresh real sources", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  while ((await card.count()) === 0) {
    const before = await panel.getByRole("article").count();
    await panel.getByRole("button", { name: "Load more real sources" }).click();
    await expect
      .poll(() => panel.getByRole("article").count())
      .toBeGreaterThan(before);
  }
  await expect(card).toBeVisible();
  const scopedEvents = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/events?") &&
      new URL(response.url()).searchParams.get("projectId") === project.id,
  );
  await page.goto(`/activity?projectId=${project.id}`);
  await scopedEvents;
  await expect(
    page.getByRole("list", { name: "Source events" }).getByRole("article"),
  ).toHaveCount(1);
  await expect(
    page.getByText("Host telemetry reported by electra", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Source event", { exact: true })).toBeVisible();
});
