import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";

async function fixture(request: APIRequestContext) {
  const name = `Network ${randomUUID().slice(0, 8)}`;
  const project = await (
    await request.post("/api/v1/projects", { data: { name } })
  ).json();
  const host = await (
    await request.post("/api/v1/resources", {
      data: { name: `${name} host`, kind: "host" },
    })
  ).json();
  const web = await (
    await request.post("/api/v1/resources", {
      data: { name: `${name} web`, kind: "service" },
    })
  ).json();
  for (const resource of [host, web])
    expect(
      (
        await request.post(`/api/v1/projects/${project.id}/resources`, {
          data: { resourceId: resource.id, type: "supports" },
        })
      ).status(),
    ).toBe(201);
  expect(
    (
      await request.put(`/api/v1/resources/${web.id}/parent`, {
        data: { parentResourceId: host.id, expectedParentResourceId: null },
      })
    ).status(),
  ).toBe(200);
  const sourceResponse = await request.post("/api/v1/real-integrations", {
    data: {
      name: `${name} telemetry`,
      kind: "linux-host",
      projectId: project.id,
      resourceId: host.id,
      identifier: "network-fixture",
      freshnessWindowMinutes: 5,
    },
  });
  expect(sourceResponse.status()).toBe(201);
  const source = await sourceResponse.json();
  const token = await (
    await request.post(`/api/v1/real-integrations/${source.id}/token`)
  ).json();
  const sample = {
    hostname: "network-fixture",
    sampleId: randomUUID(),
    observedAt: new Date(Date.now() - 1000).toISOString(),
    memory: { totalBytes: 1000, availableBytes: 600 },
    disk: { totalBytes: 1000, availableBytes: 750 },
    uptimeSeconds: 1800,
    load1Milli: 100,
  };
  const send = () =>
    request.post(`/api/v1/real-integrations/${source.id}/receive`, {
      data: {
        ...sample,
        sampleId: randomUUID(),
        observedAt: new Date(Date.now() - 1000).toISOString(),
      },
      headers: { authorization: `Bearer ${token.token}` },
    });
  expect((await send()).status()).toBe(202);
  return { name, project, host, web, source, send };
}

test("map, list, evidence, project focus and wallboard work across themes and viewports", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const f = await fixture(request);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(`/infrastructure?projectId=${f.project.id}`);
    await expect(
      page.getByRole("heading", {
        name: "Infrastructure overview",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("2 of 2 matching resources / one complete scene", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Topology", exact: true }).click();
    await page
      .getByRole("button", {
        name: `Inspect ${f.host.name}, Reporting`,
        exact: true,
      })
      .click();
    const inspector = page.getByRole("region", {
      name: `Selected resource ${f.host.name}`,
      exact: true,
    });
    await expect(inspector).toContainText("40%");
    await expect(inspector).toContainText("25%");
    await expect(inspector).toContainText("Service health: unknown");
    await inspector.getByText("Measurement evidence", { exact: true }).click();
    const source = inspector.getByRole("link", {
      name: "host_memory_used: 40 percent",
    });
    expect(
      (await request.get((await source.getAttribute("href"))!)).status(),
    ).toBe(200);
    await page.getByRole("button", { name: "List", exact: true }).click();
    const list = page.getByRole("region", {
      name: "Resource list",
      exact: true,
    });
    await expect(list).toContainText(f.host.name);
    await expect(list).toContainText(f.web.name);
    await list.getByRole("button", { name: new RegExp(f.web.name) }).click();
    await expect(
      page.getByRole("region", {
        name: `Selected resource ${f.web.name}`,
        exact: true,
      }),
    ).toContainText("No real source is connected");
    await page.getByRole("button", { name: "Topology", exact: true }).click();
    await page
      .getByRole("button", { name: `Focus project ${f.name}`, exact: true })
      .click();
    await expect(page.getByLabel("Infrastructure project")).toHaveValue(
      f.project.id,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`overview-${colorScheme}.png`),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Open wallboard", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Exit wallboard" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "TV style" }),
    ).toHaveAttribute("aria-pressed", "true");
    const labelsFit = await page
      .locator(".cmd-network-node strong")
      .evaluateAll((labels) =>
        labels.every(
          (label) =>
            label.getBoundingClientRect().height >=
            parseFloat(getComputedStyle(label).lineHeight) - 1,
        ),
      );
    expect(labelsFit).toBe(true);
    await page
      .getByRole("button", { name: "Pause updates", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resume updates", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Resume updates", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause updates", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`wallboard-${colorScheme}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Exit wallboard" }).click();
    await expect(page.getByLabel("Infrastructure project")).toHaveValue(
      f.project.id,
    );
  }
  await page.getByLabel("Find a resource").fill("does-not-exist");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No matching resources" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("scope is complete beyond the first page and delayed refresh retains labeled evidence", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const f = await fixture(request);
  for (let index = 0; index < 13; index++) {
    const resource = await (
      await request.post("/api/v1/resources", {
        data: { kind: "service", name: `${f.name} extra ${index}` },
      })
    ).json();
    expect(
      (
        await request.post(`/api/v1/projects/${f.project.id}/resources`, {
          data: { resourceId: resource.id, type: "supports" },
        })
      ).status(),
    ).toBe(201);
  }
  await page.goto(`/infrastructure?projectId=${f.project.id}`);
  await expect(
    page.getByText("15 of 15 matching resources / one complete scene", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByText("12 of 15 matching resources / page 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByText("3 of 15 matching resources / page 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(
    page.getByText("12 of 15 matching resources / page 1", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/infrastructure/overview?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Test source offline" }),
    }),
  );
  await page.getByRole("button", { name: "Refresh now", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Refresh delayed" }),
  ).toContainText("Showing the last successful snapshot");
  await expect(
    page.getByText("12 of 15 matching resources / page 1", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/v1/infrastructure/overview?**");
  await page.getByRole("button", { name: "Retry overview" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Refresh delayed" }),
  ).toBeHidden();
  await page.getByLabel("Find a resource").fill(f.host.name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("1 of 1 matching resources / page 1", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await request.get("/api/v1/infrastructure/overview?projectId=bad")
    ).status(),
  ).toBe(400);
  expect(
    (await request.get("/api/v1/infrastructure/overview?limit=51")).status(),
  ).toBe(400);
});

test("new persisted observations cue once and wallboard rotation stops for manual inspection", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const f = await fixture(request);
  for (let index = 0; index < 5; index++) {
    const resource = await (
      await request.post("/api/v1/resources", {
        data: { kind: "service", name: `${f.name} rotation ${index}` },
      })
    ).json();
    await request.post(`/api/v1/projects/${f.project.id}/resources`, {
      data: { resourceId: resource.id, type: "supports" },
    });
  }
  await page.clock.install();
  await page.goto(`/infrastructure/wallboard?projectId=${f.project.id}`);
  await page.getByRole("button", { name: "Topology", exact: true }).click();
  await expect(
    page.getByText("6 of 7 matching resources / page 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rotate pages (30s)", exact: true })
    .click();
  await page.clock.fastForward(31000);
  await expect(
    page.getByText("1 of 7 matching resources / page 2", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Inspect / })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Rotate pages (30s)", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  // A search makes the same source reachable irrespective of its UUID page.
  await page.getByLabel("Find a resource").fill(f.host.name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const host = page.getByRole("button", {
    name: `Inspect ${f.host.name}, Reporting`,
    exact: true,
  });
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("data-arriving", "false");
  expect((await f.send()).status()).toBe(202);
  await page.getByRole("button", { name: "Refresh now", exact: true }).click();
  await expect(host).toHaveAttribute("data-arriving", "true");
  await page
    .getByRole("button", { name: "Pause updates", exact: true })
    .click();
  await expect(host).toHaveAttribute("data-arriving", "false");
  await page.clock.fastForward(16000);
  await expect(
    page.getByRole("button", { name: "Resume updates", exact: true }),
  ).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByLabel("Find a resource").fill("");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByText("6 of 7 matching resources / page 1", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("wallboard-1920.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 3840, height: 2160 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("wallboard-4k.png"),
      fullPage: true,
    });
  }
});

test("Gravity uses canonical resources, persisted appearance, focus and truthful source evidence", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const f = await fixture(request);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Geometry assertions measure the settled view independently of GPU cadence.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/infrastructure?projectId=${f.project.id}`);
  const gravity = page.getByRole("region", {
    name: "Gravity Observatory",
    exact: true,
  });
  await expect(
    gravity.getByRole("combobox", { name: "Gravity grouping" }),
  ).toBeVisible();
  const host = gravity.getByRole("button", {
    name: `Select ${f.host.name}, host, Reporting`,
    exact: true,
  });
  await host.click();
  await expect(
    page.getByRole("region", {
      name: `Selected resource ${f.host.name}`,
      exact: true,
    }),
  ).toContainText("Service health: unknown");
  await expect(
    gravity.getByText("Reporting / Service health: unknown", { exact: true }),
  ).toBeVisible();
  await expect(gravity.locator("canvas")).toBeVisible();
  await gravity
    .getByRole("button", { name: "Open focus lens", exact: true })
    .click();
  await expect(
    gravity.getByRole("button", { name: "Close focus lens", exact: true }),
  ).toBeVisible();
  await gravity.locator("canvas").scrollIntoViewIfNeeded();
  let lastLensGeometry: unknown;
  try {
    await expect
      .poll(async () => {
        const geometry = await gravity
          .locator(".cmd-gravity-lens")
          .evaluate((element) => {
            const parent = element.parentElement!;
            const stage = parent.getBoundingClientRect();
            const container = parent.querySelector(".cmd-gravity-canvas");
            const renderedWidth = element.getBoundingClientRect().width;
            const expectedWidth = Math.min(
              stage.height * 0.72,
              stage.width * 0.62,
            );
            const delta = Math.abs(renderedWidth - expectedWidth);
            const style = getComputedStyle(element);
            return {
              settled: delta < 1,
              renderedWidth,
              expectedWidth,
              delta,
              stageWidth: stage.width,
              stageHeight: stage.height,
              containerWidth: container?.clientWidth ?? null,
              containerHeight: container?.clientHeight ?? null,
              inlineWidth: (element as HTMLElement).style.width,
              computedWidth: style.width,
              transform: style.transform,
              opacity: style.opacity,
              documentHidden: document.hidden,
            };
          });
        lastLensGeometry = geometry;
        return geometry.settled;
      })
      .toBe(true);
  } catch (error) {
    console.error(
      "Focus lens geometry at failure:",
      JSON.stringify(lastLensGeometry),
    );
    throw error;
  }
  await gravity
    .getByRole("button", { name: "Close focus lens", exact: true })
    .click();
  await gravity.getByLabel("Gravity grouping").selectOption("custom");
  await gravity.getByLabel("Custom layout sector").fill("Home lab");
  await gravity.getByText("Appearance", { exact: true }).click();
  await gravity.getByLabel("Gravity surface").selectOption("midnight");
  await gravity.getByText("Appearance", { exact: true }).click();
  await page.reload();
  await expect(gravity.getByLabel("Gravity grouping")).toHaveValue("custom");
  await gravity
    .getByRole("button", {
      name: `Select ${f.host.name}, host, Reporting`,
      exact: true,
    })
    .click();
  await expect(gravity.getByLabel("Custom layout sector")).toHaveValue(
    "Home lab",
  );
  await gravity.getByLabel("Gravity grouping").selectOption("projects");
  await expect(
    gravity.getByText(/inspector shows every membership/),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(
    gravity.getByRole("option", { name: "Slow orbit", exact: true }),
  ).toBeEnabled();
  await gravity.getByLabel("Gravity camera").selectOption("orbit");
  await expect(gravity.getByLabel("Gravity camera")).toHaveValue("orbit");
  await gravity
    .getByRole("button", { name: "Pause scene motion", exact: true })
    .click();
  await expect(
    gravity.getByRole("button", { name: "Resume scene motion", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Resource list", exact: true }),
  ).toContainText(f.web.name);
  await page.getByRole("button", { name: "Gravity", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Open wallboard", exact: true }).click();
  await expect(page.getByLabel("Gravity grouping")).toHaveValue("projects");
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1920, height: 1080 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".cmd-gravity-stage")
        .evaluate((element) => element.getBoundingClientRect().height >= 160),
    ).toBe(true);
  }
  await page.getByText("Resources in this scene (2)", { exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: `Select ${f.web.name}, service, No observation`,
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("gravity-wallboard.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
