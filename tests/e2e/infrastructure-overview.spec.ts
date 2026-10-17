import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import {
  test,
  expect,
  type APIRequestContext,
  type Response,
  type Request,
} from "@playwright/test";
import {
  entityIdSchema,
  infrastructureOverviewSchema,
  observatorySceneReadResultSchema,
  resourceSummarySchema,
  type ObservatorySceneDto,
} from "@commandry/contracts";
import { mixedObservatoryFixture } from "../fixtures/observatory";
import { installDiagnosticProfiling } from "./observatory-diagnostic-profile";

installDiagnosticProfiling(test);

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

async function fullF1Population(request: APIRequestContext) {
  const model = mixedObservatoryFixture();
  async function read() {
    const response = await request.post(
      "/api/v1/infrastructure/observatory/scene",
      { data: { grouping: "projects" } },
    );
    expect(response.status()).toBe(200);
    return observatorySceneReadResultSchema.parse(await response.json()).scene;
  }
  const before = await read();
  const present = model.resources.filter((resource) =>
    before.membershipIndex.resourceIds.includes(resource.id),
  );
  expect([0, model.resources.length]).toContain(present.length);
  const useExisting =
    present.length === model.resources.length &&
    process.env.COMMANDRY_E2E_FORCE_F1_API !== "1";
  const suffix = `TV ${randomUUID().slice(0, 8)}`;
  const projects = new Map<string, { id: string; name: string }>();
  const resources = new Map<string, { id: string; name: string }>();
  for (const project of model.projects) {
    if (useExisting) {
      projects.set(project.id, project);
      continue;
    }
    const name = `${project.name} ${suffix}`;
    const response = await request.post("/api/v1/projects", { data: { name } });
    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created.name).toBe(name);
    projects.set(project.id, { id: entityIdSchema.parse(created.id), name });
  }
  for (const resource of model.resources) {
    if (useExisting) {
      resources.set(resource.id, resource);
      continue;
    }
    const name = `${resource.name} ${suffix}`;
    const response = await request.post("/api/v1/resources", {
      data: { name, kind: resource.kind },
    });
    expect(response.status()).toBe(201);
    const created = resourceSummarySchema.parse(await response.json());
    expect(created).toMatchObject({ name, kind: resource.kind });
    resources.set(resource.id, { id: created.id, name });
  }
  const observed = model.resources.filter(
    (resource) => resource.sources.length,
  );
  const memberships = new Map(
    model.resources.map((resource) => [
      resource.id,
      resource.projects.map((project) => projects.get(project.id)!),
    ]),
  );
  for (const [index, resource] of observed.entries()) {
    if (!memberships.get(resource.id)!.length)
      memberships.set(resource.id, [
        projects.get(model.projects[index + 4]!.id)!,
      ]);
  }
  if (!useExisting) {
    for (const resource of model.resources) {
      const current = resources.get(resource.id)!;
      for (const project of memberships.get(resource.id)!)
        expect(
          (
            await request.post(`/api/v1/projects/${project.id}/resources`, {
              data: { resourceId: current.id, type: "supports" },
            })
          ).status(),
        ).toBe(201);
      if (resource.parentResourceId)
        expect(
          (
            await request.put(`/api/v1/resources/${current.id}/parent`, {
              data: {
                parentResourceId: resources.get(resource.parentResourceId)!.id,
                expectedParentResourceId: null,
              },
            })
          ).status(),
        ).toBe(200);
    }
    for (const [index, resource] of observed.entries()) {
      const identifier = `tv-f1-${suffix.slice(3)}-${index}`;
      const sourceResponse = await request.post("/api/v1/real-integrations", {
        data: {
          name: `${resource.name} ${suffix} telemetry`,
          kind: "linux-host",
          projectId: memberships.get(resource.id)![0]!.id,
          resourceId: resources.get(resource.id)!.id,
          identifier,
          freshnessWindowMinutes: 10080,
        },
      });
      expect(sourceResponse.status()).toBe(201);
      const source = await sourceResponse.json();
      const tokenResponse = await request.post(
        `/api/v1/real-integrations/${entityIdSchema.parse(source.id)}/token`,
      );
      expect(tokenResponse.status()).toBe(201);
      const token = await tokenResponse.json();
      expect(
        (
          await request.post(`/api/v1/real-integrations/${source.id}/receive`, {
            headers: { authorization: `Bearer ${token.token}` },
            data: {
              hostname: identifier,
              sampleId: randomUUID(),
              observedAt: new Date().toISOString(),
              memory: { totalBytes: 17179869184, availableBytes: 8589934592 },
              disk: { totalBytes: 107374182400, availableBytes: 53687091200 },
              uptimeSeconds: 3600,
              load1Milli: 1500,
            },
          })
        ).status(),
      ).toBe(202);
    }
  }
  const scene = await read();
  const canonical = new Map(
    scene.representations
      .filter((node) => node.resourceId && !node.referenceTo)
      .map((node) => [node.resourceId!, node]),
  );
  const mapped = model.resources.map((resource) => {
    const current = resources.get(resource.id)!;
    const parentResourceId = resource.parentResourceId
      ? resources.get(resource.parentResourceId)!.id
      : null;
    const node = canonical.get(current.id)!;
    expect(node).toMatchObject({ label: current.name, kind: resource.kind });
    expect(node.projects.map((project) => project.id).sort()).toEqual(
      memberships
        .get(resource.id)!
        .map((project) => project.id)
        .sort(),
    );
    expect(
      scene.containment.find((item) => item.resourceId === current.id)
        ?.parentResourceId ?? null,
    ).toBe(parentResourceId);
    expect(scene.membershipIndex.resourceIds).toContain(current.id);
    return { ...current, kind: resource.kind, parentResourceId };
  });
  expect(mapped).toHaveLength(91);
  expect(
    new Set([...projects.values()].map((project) => project.id)).size,
  ).toBe(15);
  expect(
    mapped.filter((resource) => resource.kind === "repository"),
  ).toHaveLength(60);
  expect(mapped.filter((resource) => resource.kind === "host")).toHaveLength(
    18,
  );
  expect(mapped.filter((resource) => resource.kind === "service")).toHaveLength(
    13,
  );
  expect(
    [...memberships.values()].filter((items) => items.length > 1),
  ).toHaveLength(7);
  expect(
    model.resources.filter(
      (resource) =>
        resource.kind === "repository" && !memberships.get(resource.id)!.length,
    ),
  ).toHaveLength(48);
  expect(
    scene.sourceObservations.filter(
      (item) =>
        observed.some(
          (resource) => resources.get(resource.id)!.id === item.resourceId,
        ) && item.state === "reporting",
    ),
  ).toHaveLength(4);
  for (const id of before.membershipIndex.resourceIds)
    expect(scene.membershipIndex.resourceIds).toContain(id);
  return {
    resources: mapped,
    strategy: useExisting ? "provided-seed" : "real-api",
    projectIds: [...projects.values()].map((project) => project.id),
    beforeIds: before.membershipIndex.resourceIds,
    afterIds: scene.membershipIndex.resourceIds,
  };
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
    await page.getByRole("button", { name: "Topology", exact: true }).click();
    await expect
      .poll(() => page.locator(".cmd-network-node strong").count())
      .toBeGreaterThan(0);
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
  await page.getByRole("button", { name: "Topology", exact: true }).click();
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
  test.setTimeout(240000);
  const diagnosticStarted = performance.now();
  const f = await fixture(request);
  const errors: string[] = [];
  const transitionPath = testInfo.outputPath("f1-global-transition.jsonl");
  const transitionSummaryPath = testInfo.outputPath(
    "f1-global-transition.json",
  );
  let transitionActive = false;
  let transitionPhase = "not-started";
  let transitionPassed = false;
  let transitionFixture: unknown = null;
  let lastDom: unknown = null;
  let firstRegionObserved = false;
  let requestSequence = 0;
  const transitionRecords: unknown[] = [];
  const diagnosticErrors: string[] = [];
  const transitionRequests = new WeakMap<
    object,
    { id: number; started: number }
  >();
  const transitionChecks: Promise<void>[] = [];
  const pendingResponseChecks = new Set<Promise<void>>();
  const pendingTransitionChecks = new Set<Promise<void>>();
  function trackPending(check: Promise<void>, pending: Set<Promise<void>>) {
    pending.add(check);
    void check.then(
      () => pending.delete(check),
      () => pending.delete(check),
    );
  }
  function diagnostic(event: string, detail: object = {}) {
    if (!transitionActive) return;
    const elapsedMs = performance.now() - diagnosticStarted;
    const record = {
      utc: new Date().toISOString(),
      elapsedMs,
      remainingMs: Math.max(0, testInfo.timeout - elapsedMs),
      deadlineMs: testInfo.timeout,
      test: testInfo.title,
      project: testInfo.project.name,
      worker: testInfo.workerIndex,
      parallelIndex: testInfo.parallelIndex,
      phase: transitionPhase,
      event,
      ...detail,
    };
    transitionRecords.push(record);
    try {
      appendFileSync(transitionPath, JSON.stringify(record) + "\n");
    } catch (error) {
      console.error("Transition diagnostic write failed", String(error));
    }
  }
  function diagnosticQuery(outgoing: Request) {
    let query: Record<string, unknown> = {};
    try {
      const body: unknown = outgoing.postDataJSON();
      if (body && typeof body === "object" && !Array.isArray(body))
        query = body as Record<string, unknown>;
    } catch {
      /* GETs and malformed bodies have no admitted scene query. */
    }
    const url = new URL(outgoing.url());
    return {
      projectId: query.projectId ?? url.searchParams.get("projectId"),
      hasProjectId:
        Object.hasOwn(query, "projectId") || url.searchParams.has("projectId"),
      environment: query.environment ?? null,
      grouping: query.grouping ?? null,
      viewRevision: query.viewRevision ?? null,
      cursor: url.searchParams.get("cursor"),
    };
  }
  async function diagnosticOverview(response: Response) {
    const observed = transitionRequests.get(response.request());
    if (!transitionActive || !observed) return;
    const path = new URL(response.url()).pathname;
    diagnostic("response", {
      requestId: observed.id,
      ticket: requestNavigation.get(response.request()),
      navigation,
      path,
      status: response.status(),
      durationMs: performance.now() - observed.started,
      query: diagnosticQuery(response.request()),
    });
    if (path !== "/api/v1/infrastructure/overview" || !response.ok()) return;
    try {
      const text = await response.text();
      const result = infrastructureOverviewSchema.parse(JSON.parse(text));
      diagnostic("overview-page", {
        requestId: observed.id,
        ticket: requestNavigation.get(response.request()),
        navigation,
        query: diagnosticQuery(response.request()),
        nextCursor: result.nextCursor,
        total: result.total,
        ids: result.items.map((item) => item.id),
        durationMs: performance.now() - observed.started,
        responseBytes: Buffer.byteLength(text),
      });
    } catch (error) {
      diagnostic("overview-parse-error", {
        requestId: observed.id,
        error: String(error),
        transport: response.request().failure()?.errorText ?? "complete",
      });
    }
  }
  async function diagnosticDom(label: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([
        page.evaluate(() => {
          const region = document.querySelector(".cmd-operational-observatory");
          const stage = region?.querySelector(".cmd-op-stage");
          const canvas = region?.querySelector<HTMLCanvasElement>(
            ".cmd-op-canvas canvas",
          );
          return {
            regionPresent: !!region,
            grouping: region?.getAttribute("data-grouping") ?? null,
            viewRevision: region?.getAttribute("data-view-revision") ?? null,
            projectionRevision:
              region?.getAttribute("data-projection-revision") ?? null,
            pending: region?.getAttribute("data-pending") ?? null,
            project:
              document.querySelector<HTMLSelectElement>(
                '[aria-label="Infrastructure project"]',
              )?.value ?? null,
            hidden: document.hidden,
            url: location.pathname + location.search,
            viewport: {
              width: innerWidth,
              height: innerHeight,
              dpr: devicePixelRatio,
            },
            stage: stage?.getBoundingClientRect().toJSON() ?? null,
            canvas: canvas
              ? {
                  css: canvas.getBoundingClientRect().toJSON(),
                  width: canvas.width,
                  height: canvas.height,
                }
              : null,
            messages: Array.from(
              document.querySelectorAll(
                '[role="status"], [role="alert"], .cmd-network-snapshot',
              ),
            ).map((element) => element.textContent?.slice(0, 1000)),
          };
        }),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 250);
        }),
      ]);
      if (!snapshot) {
        diagnostic("dom-snapshot-unavailable", {
          label,
          reason: "250ms diagnostic bound",
        });
        return;
      }
      lastDom = snapshot;
      const key = JSON.stringify([
        snapshot.grouping,
        snapshot.viewRevision,
        snapshot.projectionRevision,
      ]);
      const admitted = browserScenes.get(key)?.scene;
      diagnostic("dom-snapshot", {
        label,
        snapshot,
        key,
        matchingScene: !!admitted,
        missingF1Ids: fullPopulationIds.filter(
          (id) => !admitted?.membershipIndex.resourceIds.includes(id),
        ),
      });
      if (snapshot.regionPresent && !firstRegionObserved) {
        firstRegionObserved = true;
        diagnostic("first-region-observed", { key });
      }
    } catch (error) {
      diagnostic("dom-snapshot-unavailable", { label, error: String(error) });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function attachJson(name: string, value: unknown) {
    const path = testInfo.outputPath(`${name}.json`);
    await mkdir(testInfo.outputDir, { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2) + "\n");
    await testInfo.attach(name, { path, contentType: "application/json" });
  }
  page.on("pageerror", (error) => {
    errors.push(error.message);
    diagnostic("page-error", { error: error.message });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnosticErrors.push(message.text().slice(0, 2000));
      diagnostic("console-error", { error: message.text().slice(0, 2000) });
    }
  });
  let expectedIds = [f.host.id, f.web.id].sort();
  let fullPopulationMode = false;
  let fullPopulationIds: string[] = [];
  let navigation = 0;
  const requestNavigation = new WeakMap<object, number>();
  const browserScenes = new Map<
    string,
    { scene: ObservatorySceneDto; query: unknown }
  >();
  const responseChecks: Promise<void>[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      navigation++;
      browserScenes.clear();
      diagnostic("navigation", { navigation });
    }
  });
  page.on("request", (outgoing) => {
    requestNavigation.set(outgoing, navigation);
    const url = new URL(outgoing.url());
    if (
      !transitionActive ||
      (url.pathname !== "/api/v1/infrastructure/overview" &&
        url.pathname !== "/api/v1/infrastructure/observatory/scene")
    )
      return;
    const observed = { id: ++requestSequence, started: performance.now() };
    transitionRequests.set(outgoing, observed);
    diagnostic("request", {
      requestId: observed.id,
      ticket: navigation,
      method: outgoing.method(),
      path: url.pathname,
      query: diagnosticQuery(outgoing),
    });
  });
  async function inspectResponse(response: Response) {
    const ticket = requestNavigation.get(response.request());
    if (
      ticket !== navigation ||
      !response.ok() ||
      response.request().method() !== "POST" ||
      new URL(response.url()).pathname !==
        "/api/v1/infrastructure/observatory/scene"
    ) {
      if (
        new URL(response.url()).pathname ===
        "/api/v1/infrastructure/observatory/scene"
      )
        diagnostic("scene-rejected", {
          ticket,
          navigation,
          status: response.status(),
          reason:
            ticket !== navigation
              ? "stale-navigation"
              : !response.ok()
                ? "non-ok"
                : "method",
          query: diagnosticQuery(response.request()),
        });
      return;
    }
    const query = response.request().postDataJSON();
    const matchesIntendedScope = () =>
      !!query &&
      typeof query === "object" &&
      !Array.isArray(query) &&
      (fullPopulationMode
        ? !Object.hasOwn(query, "projectId")
        : query.projectId === f.project.id);
    if (!matchesIntendedScope()) {
      diagnostic("scene-rejected", {
        ticket,
        navigation,
        reason: "scope",
        query: diagnosticQuery(response.request()),
      });
      return;
    }
    diagnostic("matching-scene-response", {
      ticket,
      navigation,
      query: diagnosticQuery(response.request()),
    });
    try {
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        if (response.request().failure()?.errorText === "net::ERR_ABORTED") {
          diagnostic("scene-rejected", {
            ticket,
            navigation,
            reason: "aborted",
          });
          return;
        }
        await response.finished();
        if (response.request().failure()?.errorText === "net::ERR_ABORTED")
          return;
        throw error;
      }
      const { scene } = observatorySceneReadResultSchema.parse(
        JSON.parse(text),
      );
      diagnostic("scene-parsed", {
        ticket,
        navigation,
        admitted: ticket === navigation && matchesIntendedScope(),
        key: JSON.stringify([
          scene.grouping,
          scene.viewRevision,
          scene.projectionRevision,
        ]),
        ids: scene.membershipIndex.resourceIds,
        missingF1Ids: fullPopulationIds.filter(
          (id) => !scene.membershipIndex.resourceIds.includes(id),
        ),
        query: diagnosticQuery(response.request()),
        responseBytes: Buffer.byteLength(text),
      });
      if (ticket === navigation && matchesIntendedScope())
        browserScenes.set(
          JSON.stringify([
            scene.grouping,
            scene.viewRevision,
            scene.projectionRevision,
          ]),
          { scene, query },
        );
    } catch (error) {
      diagnostic("scene-parse-error", {
        ticket,
        navigation,
        error: String(error),
      });
      if (ticket === navigation)
        errors.push(
          `Invalid successful scene response: ${error instanceof Error ? error.message : "unknown"}`,
        );
    }
  }
  page.on("response", (response) => {
    const responseCheck = inspectResponse(response);
    responseChecks.push(responseCheck);
    trackPending(responseCheck, pendingResponseChecks);
    if (transitionActive) {
      const transitionCheck = diagnosticOverview(response);
      transitionChecks.push(transitionCheck);
      trackPending(transitionCheck, pendingTransitionChecks);
    }
  });
  for (const event of ["requestfailed", "requestfinished"] as const) {
    page.on(event, (outgoing) => {
      const observed = transitionRequests.get(outgoing);
      if (observed)
        diagnostic(event, {
          requestId: observed.id,
          ticket: requestNavigation.get(outgoing),
          navigation,
          path: new URL(outgoing.url()).pathname,
          durationMs: performance.now() - observed.started,
          failure: outgoing.failure()?.errorText ?? null,
        });
    });
  }
  // Geometry assertions measure the settled view independently of GPU cadence.
  await page.addInitScript(() => {
    const original = window.IntersectionObserver;
    const history: unknown[] = [];
    const state = { observed: 0, falseDelivered: 0, suppressed: 0, history };
    Object.assign(window, {
      gravityIntersectionHistory: history,
      gravityIntersectionState: state,
    });
    let sequence = 0;
    window.IntersectionObserver = class extends original {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        const observerId = ++sequence;
        const delivered = new Set<Element>();
        super((entries, observer) => {
          const unrelated = entries.filter(
            (entry) => !entry.target.classList.contains("cmd-op-canvas"),
          );
          if (unrelated.length) callback(unrelated, observer);
          for (const latest of entries.filter((entry) =>
            entry.target.classList.contains("cmd-op-canvas"),
          )) {
            state.observed++;
            const first = !delivered.has(latest.target);
            history.push({
              observerId,
              target: latest.target.className,
              time: latest.time,
              intersecting: latest.isIntersecting,
              bounds: latest.boundingClientRect.toJSON(),
              forwarded: first ? false : null,
              suppressed: !first,
            });
            // Reproduce a paused observer: deliver initial false, then withhold
            // subsequent notifications. Real scrolling must wake the scene.
            if (!first) {
              state.suppressed++;
              continue;
            }
            delivered.add(latest.target);
            state.falseDelivered++;
            callback(
              [
                {
                  time: latest.time,
                  target: latest.target,
                  rootBounds: latest.rootBounds,
                  boundingClientRect: latest.boundingClientRect,
                  intersectionRect: new DOMRect(),
                  intersectionRatio: 0,
                  isIntersecting: false,
                },
              ],
              observer,
            );
          }
        }, options);
      }
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/infrastructure?projectId=${f.project.id}`);
  const gravity = page.getByRole("region", {
    name: "Operational Observatory",
    exact: true,
  });
  const grouping = gravity.getByRole("combobox", {
    name: "Observatory grouping",
    exact: true,
  });
  const canvas = gravity.locator(".cmd-op-canvas canvas");
  const outline = gravity.locator(".cmd-op-outline");
  const inspector = gravity.getByRole("complementary", {
    name: "Observatory inspector",
    exact: true,
  });
  const appearance = gravity.getByRole("button", {
    name: "Appearance and views",
    exact: true,
  });
  await expect(grouping).toBeVisible();
  async function applied(expectedGrouping?: string) {
    if (expectedGrouping)
      await expect(gravity).toHaveAttribute("data-grouping", expectedGrouping);
    await expect(gravity).toHaveAttribute("data-pending", "false");
    let result: { scene: ObservatorySceneDto; query: unknown } | undefined;
    await expect
      .poll(async () => {
        result = browserScenes.get(
          JSON.stringify(
            await gravity.evaluate((element) => [
              element.getAttribute("data-grouping"),
              element.getAttribute("data-view-revision"),
              element.getAttribute("data-projection-revision"),
            ]),
          ),
        );
        return !!result;
      })
      .toBe(true);
    const scene = result!.scene;
    if (fullPopulationMode) {
      const required = [...fullPopulationIds, ...expectedIds];
      for (const id of required)
        expect(scene.membershipIndex.resourceIds).toContain(id);
      expectedIds = [...scene.membershipIndex.resourceIds];
    }
    expect(scene.membershipIndex.resourceIds).toEqual(expectedIds);
    expect(
      scene.representations
        .filter((node) => node.resourceId && !node.referenceTo)
        .map((node) => node.resourceId!)
        .sort(),
    ).toEqual(expectedIds);
    expect(
      scene.containment.find((item) => item.resourceId === f.web.id)
        ?.parentResourceId,
    ).toBe(f.host.id);
    const nodes = new Map(scene.representations.map((node) => [node.id, node]));
    const represented = new Set<string>(),
      visited = new Set<string>(),
      pending = [...scene.visibleRepresentationIds];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const member of scene.membershipIndex.directMembers[id] ?? [])
        represented.add(member);
      pending.push(...(scene.membershipIndex.children[id] ?? []));
      const reference = nodes.get(id)?.referenceTo;
      if (reference) pending.push(reference);
    }
    expect([...represented].sort()).toEqual(expectedIds);
    await canvas.scrollIntoViewIfNeeded();
    await expect
      .poll(async () =>
        Number(await canvas.getAttribute("data-gravity-contributions")),
      )
      .toBe(scene.visibleRepresentationIds.length);
    return result!;
  }
  async function expandCompleteOutline() {
    if (
      !(await outline.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      ))
    )
      await outline.locator("summary").click();
    const { scene } = await applied();
    let expanded = 0;
    if (fullPopulationMode) {
      // The additional full-population setup opens each mounted level through
      // its real handlers; original scoped journeys retain pointer clicks.
      while (true) {
        const count = await outline
          .locator('button[aria-expanded="false"]')
          .evaluateAll(async (buttons) => {
            for (const button of buttons) {
              if ((button as HTMLButtonElement).disabled)
                throw new Error("Full-inventory expansion control is disabled");
              // Each real toggle captures its rendered query. Wait for its
              // actual commit before the next handler reads that query.
              await new Promise<void>((resolve, reject) => {
                const observer = new MutationObserver(() => {
                  if (button.getAttribute("aria-expanded") === "true") {
                    clearTimeout(timer);
                    observer.disconnect();
                    resolve();
                  }
                });
                observer.observe(button, { attributes: true });
                const timer = setTimeout(() => {
                  observer.disconnect();
                  reject(new Error("Full-inventory expansion did not commit"));
                }, 5000);
                (button as HTMLButtonElement).click();
                if (button.getAttribute("aria-expanded") === "true") {
                  clearTimeout(timer);
                  observer.disconnect();
                  resolve();
                }
              });
            }
            return buttons.length;
          });
        if (!count) break;
        expanded += count;
        expect(expanded).toBeLessThanOrEqual(scene.representations.length);
        await applied();
      }
    }
    while (await outline.locator('button[aria-expanded="false"]').count()) {
      expect(++expanded).toBeLessThanOrEqual(scene.representations.length);
      await outline.locator('button[aria-expanded="false"]').first().click();
    }
    await applied();
    expect(
      (
        await outline
          .locator("li[data-resource-id]:not([data-reference])")
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-resource-id")),
          )
      ).sort(),
    ).toEqual(expectedIds);
    const controls = outline.locator(
      "li[data-resource-id]:not([data-reference]) > .cmd-op-outline-row > button:not(.cmd-op-expand)",
    );
    await expect(controls).toHaveCount(expectedIds.length);
    expect(
      await controls.evaluateAll((buttons) =>
        buttons.every((button) => !(button as HTMLButtonElement).disabled),
      ),
    ).toBe(true);
  }
  const canonicalRow = (id: string) =>
    outline.locator(
      `li[data-resource-id="${id}"]:not([data-reference]) > .cmd-op-outline-row > button:not(.cmd-op-expand)`,
    );
  async function selectCanonical(id: string, name: string) {
    await expandCompleteOutline();
    const row = canonicalRow(id);
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(
      outline.locator(
        'li[data-resource-id]:not([data-reference]) > .cmd-op-outline-row > button[aria-pressed="true"]',
      ),
    ).toHaveCount(1);
    await expect(
      inspector.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(
      inspector.locator("code").filter({ hasText: new RegExp(`^${id}$`) }),
    ).toHaveText(id);
    const result = await applied();
    const node = result.scene.representations.find(
      (item) => item.resourceId === id && !item.referenceTo,
    )!;
    await expect(canvas).toHaveAttribute("data-gravity-main-focus", node.id);
    await expect(gravity.locator(".cmd-op-stage-caption strong")).toHaveText(
      name,
    );
    return { ...result, node };
  }
  async function availabilityRemainsUnknown(
    node: ObservatorySceneDto["representations"][number],
  ) {
    expect(node.summary.availability.passing).toBe(0);
    expect(node.summary.coverage.monitored).toBe(0);
    expect(node.summary.coverage.state).toBe("not_monitored");
    await expect(inspector.locator(".cmd-op-availability")).toContainText(
      "0 passing",
    );
    await expect(inspector.locator(".cmd-op-availability")).toContainText(
      "Not monitored",
    );
  }
  async function pose() {
    const value = await canvas.evaluate((element) => {
      const position =
        element.getAttribute("data-gravity-camera-position") ?? "";
      const target = element.getAttribute("data-gravity-camera-target") ?? "";
      const values = [...position.split(","), ...target.split(",")].map(Number);
      return {
        position,
        target,
        finite:
          values.length === 6 &&
          values.every(Number.isFinite) &&
          !!position &&
          !!target,
        frames: Number(element.getAttribute("data-gravity-rendered-frames")),
      };
    });
    expect(value.finite).toBe(true);
    expect(value.frames).toBeGreaterThan(0);
    return value;
  }
  async function intersectionState() {
    return page.evaluate(
      () =>
        (
          window as unknown as {
            gravityIntersectionState: {
              observed: number;
              falseDelivered: number;
              suppressed: number;
              history: {
                observerId: number;
                forwarded: boolean | null;
                suppressed: boolean;
              }[];
            };
          }
        ).gravityIntersectionState,
    );
  }
  const selectedHost = await selectCanonical(f.host.id, f.host.name);
  await availabilityRemainsUnknown(selectedHost.node);
  expect(selectedHost.node.summary.telemetry.counts.reporting).toBeGreaterThan(
    0,
  );
  await expect(
    inspector
      .locator(".cmd-op-facet")
      .filter({ hasText: "Telemetry freshness" }),
  ).toContainText("reporting");
  await inspector.getByText("Observation evidence", { exact: true }).click();
  const source = selectedHost.scene.sourceObservations.find(
    (item) => item.resourceId === f.host.id && item.sourceId === f.source.id,
  )!;
  expect(source).toBeTruthy();
  expect(source.observedAt).not.toBeNull();
  const observedAt = Date.parse(source.observedAt!);
  expect(Number.isFinite(observedAt)).toBe(true);
  expect(
    Date.parse(selectedHost.scene.evaluatedAt) - observedAt,
  ).toBeGreaterThanOrEqual(0);
  expect(Date.parse(selectedHost.scene.evaluatedAt) - observedAt).toBeLessThan(
    5 * 60_000,
  );
  const sourceArticle = inspector
    .locator("article")
    .filter({ hasText: `Source ${f.source.id}:` });
  await expect(sourceArticle).toHaveCount(1);
  await expect(sourceArticle).toContainText(`Observed ${source.observedAt}`);
  for (const [metricName, value] of [
    ["host_memory_used", 40],
    ["host_disk_used", 25],
  ] as const) {
    const metric = selectedHost.scene.capacityObservations.find(
      (item) => item.resourceId === f.host.id && item.name === metricName,
    )!;
    expect(metric.value).toBe(value);
    expect(metric.observedAt).toBe(source.observedAt);
    const article = inspector
      .locator("article")
      .filter({ hasText: `${metricName}:` });
    await expect(article).toContainText(`Observed ${metric.observedAt}`);
    const href = await article
      .getByRole("link", { name: "Source evidence", exact: true })
      .getAttribute("href");
    expect((await request.get(href!)).status()).toBe(200);
  }
  await gravity
    .getByLabel("Search complete Observatory inventory", { exact: true })
    .fill(f.web.id);
  await applied();
  const searchResults = gravity.getByRole("region", {
    name: "Complete inventory search results",
    exact: true,
  });
  await expect(searchResults.getByRole("button")).toHaveCount(1);
  await searchResults.getByRole("button").click();
  await expect(
    inspector.locator("code").filter({ hasText: new RegExp(`^${f.web.id}$`) }),
  ).toHaveText(f.web.id);
  await gravity
    .getByRole("button", { name: "Clear search", exact: true })
    .click();
  await applied();
  await expect(
    inspector.locator("code").filter({ hasText: new RegExp(`^${f.host.id}$`) }),
  ).toHaveText(f.host.id);
  await expect(canvas).toHaveAttribute(
    "data-gravity-main-focus",
    selectedHost.node.id,
  );
  await expect(canvas).toBeVisible();
  await pose();
  await appearance.click();
  const lensChoice = page.getByLabel("Optional selected-subject lens", {
    exact: true,
  });
  await lensChoice.check();
  await expect(lensChoice).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(appearance).toBeFocused();
  await canvas.scrollIntoViewIfNeeded();
  const lens = gravity.locator(".cmd-op-lens");
  await expect(lens).toBeVisible();
  await expect(lens).toContainText(f.host.name);
  await expect
    .poll(async () => (await intersectionState()).falseDelivered)
    .toBeGreaterThan(0);
  let lastLensGeometry: unknown;
  async function lensAgreesWithSharedViewport() {
    try {
      await expect
        .poll(async () => {
          const geometry = await lens.evaluate((element) => {
            const parent = element.parentElement!;
            const stage = parent.getBoundingClientRect();
            const container =
              parent.querySelector<HTMLElement>(".cmd-op-canvas")!;
            const canvas = container.querySelector("canvas")!;
            const bounds = container.getBoundingClientRect();
            const rect = element.getBoundingClientRect();
            const width = container.clientWidth;
            const height = container.clientHeight;
            const radius = Math.min(height * 0.22, width * 0.22, 220);
            const expectedWidth = 2 * radius;
            const expectedX = bounds.left + width * 0.76;
            const expectedY = bounds.top + height * 0.3;
            const delta = Math.max(
              Math.abs(rect.width - expectedWidth),
              Math.abs(rect.height - expectedWidth),
              Math.abs(rect.left + rect.width / 2 - expectedX),
              Math.abs(rect.top + rect.height / 2 - expectedY),
            );
            const style = getComputedStyle(element);
            return {
              settled:
                width > 0 &&
                height > 0 &&
                delta < 1 &&
                Number(canvas.dataset.gravityLensAmount) === 1 &&
                canvas.dataset.gravityFocusRequested === "true" &&
                canvas.dataset.gravitySelectedPresent === "true" &&
                Number(canvas.dataset.gravityFocusVertices) > 0 &&
                Number(style.opacity) > 0.99 &&
                style.visibility === "visible" &&
                rect.left >= bounds.left - 1 &&
                rect.right <= bounds.right + 1 &&
                rect.top >= bounds.top - 1 &&
                rect.bottom <= bounds.bottom + 1,
              renderedWidth: rect.width,
              expectedWidth,
              expectedX,
              expectedY,
              radius,
              delta,
              lens: rect.toJSON(),
              stage: stage.toJSON(),
              container: bounds.toJSON(),
              containerWidth: width,
              containerHeight: height,
              inlineWidth: (element as HTMLElement).style.width,
              computedWidth: style.width,
              computedHeight: style.height,
              maxWidth: style.maxWidth,
              transform: style.transform,
              opacity: style.opacity,
              visibility: style.visibility,
              documentHidden: document.hidden,
              viewport: { width: innerWidth, height: innerHeight },
              canvasDiagnostics: { ...canvas.dataset },
              intersections: (
                window as unknown as { gravityIntersectionState: unknown }
              ).gravityIntersectionState,
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
  }
  await lensAgreesWithSharedViewport();
  // A clipped ancestor must still pause GPU work, even with stale IO delivery.
  const beforeClip = await intersectionState();
  const clippedBounds = await gravity.evaluate((element) => {
    const previous = element.getAttribute("style");
    Object.assign((element as HTMLElement).style, {
      height: "0px",
      maxHeight: "0px",
      minHeight: "0px",
      overflow: "hidden",
    });
    document.dispatchEvent(new Event("scroll"));
    const container = element.querySelector<HTMLElement>(".cmd-op-canvas")!;
    return {
      previous,
      ancestor: element.getBoundingClientRect().toJSON(),
      clippedHeight: element.clientHeight,
      container: container.getBoundingClientRect().toJSON(),
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
    };
  });
  expect(clippedBounds.clippedHeight).toBe(0);
  expect(clippedBounds.containerWidth).toBeGreaterThan(0);
  expect(clippedBounds.containerHeight).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute("data-gravity-visible", "false");
  const pausedFrames = Number(
    await canvas.getAttribute("data-gravity-rendered-frames"),
  );
  expect(Number.isFinite(pausedFrames)).toBe(true);
  expect(pausedFrames).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  await expect(canvas).toHaveAttribute(
    "data-gravity-rendered-frames",
    String(pausedFrames),
  );
  await gravity.evaluate((element, previous) => {
    if (previous === null) element.removeAttribute("style");
    else element.setAttribute("style", previous);
    document.dispatchEvent(new Event("scroll"));
  }, clippedBounds.previous);
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toHaveAttribute("data-gravity-visible", "true");
  await expect
    .poll(async () =>
      Number(await canvas.getAttribute("data-gravity-rendered-frames")),
    )
    .toBeGreaterThan(pausedFrames);
  await expect
    .poll(async () => (await intersectionState()).suppressed)
    .toBeGreaterThan(beforeClip.suppressed);
  const observer = await intersectionState();
  expect(observer.observed).toBeGreaterThan(0);
  expect(
    observer.history
      .filter((entry) => entry.forwarded !== null)
      .every((entry) => entry.forwarded === false),
  ).toBe(true);
  await lensAgreesWithSharedViewport();
  await appearance.click();
  await lensChoice.uncheck();
  await expect(lensChoice).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(lens).toHaveCount(0);
  await grouping.selectOption("custom");
  await applied("custom");
  await appearance.click();
  await page.getByLabel("Sector name", { exact: true }).fill("Home lab");
  await page
    .getByRole("combobox", { name: "Resource", exact: true })
    .selectOption(f.host.id);
  await page
    .locator("label")
    .filter({ hasText: "Group this sector by" })
    .getByRole("combobox")
    .selectOption("hosts");
  await page
    .getByRole("button", { name: "Add resource to sector", exact: true })
    .click();
  await expect(
    page.getByText("Home lab / 1 members / hosts", { exact: true }),
  ).toBeVisible();
  const theme = page.getByRole("combobox", {
    name: "Surface theme",
    exact: true,
  });
  await expect(theme).toBeVisible();
  await theme.selectOption("midnight");
  await page.keyboard.press("Escape");
  const custom = await applied("custom");
  expect(custom.query).toMatchObject({
    sectors: [
      { label: "Home lab", grouping: "hosts", resourceIds: [f.host.id] },
    ],
  });
  await page.reload();
  await expect(grouping).toHaveValue("custom");
  const restored = await applied("custom");
  expect(restored.query).toMatchObject({
    sectors: [
      { label: "Home lab", grouping: "hosts", resourceIds: [f.host.id] },
    ],
  });
  await expect(gravity).toHaveAttribute("data-theme", "midnight");
  await selectCanonical(f.host.id, f.host.name);
  await appearance.click();
  await expect(theme).toBeVisible();
  await expect(theme).toHaveValue("midnight");
  await expect(
    page.getByText("Home lab / 1 members / hosts", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("combobox", { name: "Resource", exact: true })
      .getByRole("option", { name: `${f.host.name} / Host`, exact: true }),
  ).toHaveAttribute("value", f.host.id);
  await page.keyboard.press("Escape");
  await grouping.selectOption("projects");
  await applied("projects");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("commandry.infrastructure.observatory.v2") ??
            "null",
        ),
      ),
    )
    .toMatchObject({ grouping: "projects" });
  await appearance.click();
  await page.getByLabel("Sector name", { exact: true }).fill("Home lab");
  await page
    .getByRole("combobox", { name: "Resource", exact: true })
    .selectOption(f.host.id);
  await page
    .locator("label")
    .filter({ hasText: "Group this sector by" })
    .getByRole("combobox")
    .selectOption("hosts");
  await page
    .getByRole("button", { name: "Add resource to sector", exact: true })
    .click();
  await page.keyboard.press("Escape");
  const implicitCustom = await applied("custom");
  expect(implicitCustom.query).toMatchObject({
    sectors: [
      { label: "Home lab", grouping: "hosts", resourceIds: [f.host.id] },
    ],
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("commandry.infrastructure.observatory.v2") ??
            "null",
        ),
      ),
    )
    .toMatchObject({
      grouping: "custom",
      sectors: [
        { label: "Home lab", grouping: "hosts", resourceIds: [f.host.id] },
      ],
    });
  await page.reload();
  await expect(grouping).toHaveValue("custom");
  const restoredImplicit = await applied("custom");
  expect(restoredImplicit.query).toMatchObject({
    sectors: [
      { label: "Home lab", grouping: "hosts", resourceIds: [f.host.id] },
    ],
  });
  await expect(gravity).toHaveAttribute("data-theme", "midnight");
  await selectCanonical(f.host.id, f.host.name);
  await grouping.selectOption("projects");
  await applied("projects");
  await selectCanonical(f.host.id, f.host.name);
  await expect(
    inspector.getByRole("button", {
      name: `Open project ${f.name}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Infrastructure project")).toHaveValue(
    f.project.id,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await appearance.click();
  const camera = page.getByRole("combobox", { name: "Camera", exact: true });
  await expect(
    camera.getByRole("option", { name: "Slow orbit", exact: true }),
  ).toBeEnabled();
  await camera.selectOption("orbit");
  await expect(
    gravity.getByRole("button", { name: "Stop presentation", exact: true }),
  ).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const orbit = await pose();
  await expect
    .poll(async () => {
      const next = await pose();
      return (
        next.frames > orbit.frames &&
        (next.position !== orbit.position || next.target !== orbit.target)
      );
    })
    .toBe(true);
  await gravity
    .getByRole("button", { name: "Pause scene", exact: true })
    .click();
  await expect(
    gravity.getByRole("button", { name: "Resume scene", exact: true }),
  ).toBeVisible();
  await expect(
    gravity.getByRole("button", { name: "Resume scene", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const pausedPose = await pose();
  await page.waitForTimeout(150);
  const stillPose = await pose();
  expect(stillPose.position).toBe(pausedPose.position);
  expect(stillPose.target).toBe(pausedPose.target);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Resource list", exact: true }),
  ).toContainText(f.web.name);
  await page.getByRole("button", { name: "Gravity", exact: true }).click();
  await applied("projects");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Open wallboard", exact: true }).click();
  await expect(grouping).toHaveValue("projects");
  await applied("projects");
  async function wallboardGeometry(label: string) {
    const measurement = await page.evaluate(() => {
      const selectors = [
        ".cmd-network-console",
        ".cmd-network-header",
        ".cmd-network-vitals",
        ".cmd-network-toolbar",
        ".cmd-network-snapshot",
        ".cmd-network-workspace",
        ".cmd-network-main",
        ".cmd-network-truth",
        ".cmd-operational-observatory",
        ".cmd-op-toolbar",
        ".cmd-op-attention",
        ".cmd-op-workspace",
        ".cmd-op-landscape",
        ".cmd-op-stage",
        ".cmd-op-canvas",
        ".cmd-op-inspector",
        ".cmd-op-outline",
        ".cmd-op-work-dock",
        ".cmd-op-canonical-work",
        ".cmd-operational-observatory > :last-child",
        ".cmd-network-footer",
      ];
      const rect = (element: Element) =>
        element.getBoundingClientRect().toJSON();
      const elements = selectors.map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return { selector, present: false };
        const style = getComputedStyle(element);
        return {
          selector,
          present: true,
          classes: element.className,
          rect: rect(element),
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollTop: element.scrollTop,
          gridColumns: style.gridTemplateColumns,
          gridRows: style.gridTemplateRows,
          minHeight: style.minHeight,
          maxHeight: style.maxHeight,
          height: style.height,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          fontSize: style.fontSize,
          textScale: style.getPropertyValue("--op-text-scale"),
        };
      });
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          ".cmd-network-header :is(button,a), .cmd-network-toolbar :is(button,input,select), .cmd-op-toolbar :is(button,input,select), .cmd-network-footer a",
        ),
      ].map((element) => ({
        name: element.getAttribute("aria-label") ?? element.textContent,
        rect: rect(element),
      }));
      const consoleElement = document.querySelector<HTMLElement>(
        ".cmd-network-console",
      )!;
      const workspace = document.querySelector<HTMLElement>(
        ".cmd-network-workspace",
      )!;
      const consoleStyle = getComputedStyle(consoleElement);
      const availableWidth =
        consoleElement.clientWidth -
        parseFloat(consoleStyle.paddingLeft) -
        parseFloat(consoleStyle.paddingRight);
      const stage = document
        .querySelector<HTMLElement>(".cmd-op-stage")!
        .getBoundingClientRect();
      const canvas = document
        .querySelector<HTMLCanvasElement>(".cmd-op-canvas canvas")!
        .getBoundingClientRect();
      const main = document.querySelector<HTMLElement>(".cmd-network-main")!;
      const observatory = document.querySelector<HTMLElement>(
        ".cmd-operational-observatory",
      )!;
      const truth = document.querySelector<HTMLElement>(".cmd-network-truth")!;
      const truthRect = truth.getBoundingClientRect();
      const naturalTruth = truth.cloneNode(true) as HTMLElement;
      Object.assign(naturalTruth.style, {
        position: "absolute",
        visibility: "hidden",
        pointerEvents: "none",
        boxSizing: "border-box",
        width: `${truthRect.width}px`,
        height: "auto",
        minHeight: "0",
        maxHeight: "none",
      });
      main.append(naturalTruth);
      const naturalTruthHeight = naturalTruth.getBoundingClientRect().height;
      naturalTruth.remove();
      const mainRect = main.getBoundingClientRect();
      const observatoryRect = observatory.getBoundingClientRect();
      const rowAllocation = {
        main: mainRect.toJSON(),
        observatory: observatoryRect.toJSON(),
        truth: truthRect.toJSON(),
        naturalTruthHeight,
        ready:
          Math.abs(truthRect.height - naturalTruthHeight) < 1 &&
          Math.abs(observatoryRect.top - mainRect.top) < 1 &&
          Math.abs(observatoryRect.bottom - truthRect.top) < 1 &&
          Math.abs(truthRect.bottom - mainRect.bottom) < 1,
      };
      return {
        viewport: {
          width: innerWidth,
          height: innerHeight,
          scrollX,
          scrollY,
          visual: visualViewport && {
            width: visualViewport.width,
            height: visualViewport.height,
            scale: visualViewport.scale,
          },
        },
        document: {
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        body: {
          scrollHeight: document.body.scrollHeight,
          clientHeight: document.body.clientHeight,
          scrollWidth: document.body.scrollWidth,
        },
        availableWidth,
        workspaceWidth: workspace.getBoundingClientRect().width,
        stage: stage.toJSON(),
        canvas: canvas.toJSON(),
        rowAllocation,
        elements,
        controls,
        ready:
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          stage.height >= 160 &&
          canvas.width > 0 &&
          Math.abs(canvas.height - stage.height) < 1 &&
          Math.abs(canvas.width - stage.width) < 1 &&
          rowAllocation.ready &&
          Math.abs(workspace.getBoundingClientRect().width - availableWidth) <
            1,
      };
    });
    return { label, ...measurement };
  }
  async function fittedWallboard(label: string) {
    const immediate = await wallboardGeometry(label + " immediate");
    let settled = immediate;
    try {
      await expect
        .poll(async () => {
          settled = await wallboardGeometry(label + " reconciled");
          return settled.ready;
        })
        .toBe(true);
      expect(settled.controls.length).toBeGreaterThan(0);
      for (const control of settled.controls) {
        if (!control.rect.width || !control.rect.height) continue;
        expect(control.rect.left).toBeGreaterThanOrEqual(-1);
        expect(control.rect.top).toBeGreaterThanOrEqual(-1);
        expect(control.rect.right).toBeLessThanOrEqual(
          settled.viewport.width + 1,
        );
        expect(control.rect.bottom).toBeLessThanOrEqual(
          settled.viewport.height + 1,
        );
      }
    } catch (error) {
      console.error(
        "Wallboard allocation at failure:",
        JSON.stringify({ immediate, settled }),
      );
      throw error;
    } finally {
      await attachJson(label, { immediate, settled });
    }
    return settled;
  }
  if (testInfo.project.name === "desktop") {
    const defaultWallboard = await wallboardGeometry(
      "default desktop wallboard",
    );
    expect(defaultWallboard.stage.height).toBeGreaterThanOrEqual(160);
    expect(defaultWallboard.workspaceWidth).toBeCloseTo(
      defaultWallboard.availableWidth,
      0,
    );
    await attachJson("default-desktop-wallboard", defaultWallboard);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await fittedWallboard("1920x1080-gravity-wallboard");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    expect(
      await gravity
        .locator(".cmd-op-stage")
        .evaluate((element) => element.getBoundingClientRect().height >= 160),
    ).toBe(true);
    const scopedIds = [...expectedIds];
    transitionActive = true;
    transitionPhase = "fixture";
    mkdirSync(testInfo.outputDir, { recursive: true });
    diagnostic("fixture:start", { scopedIds });
    const f1 = await fullF1Population(request);
    transitionFixture = f1;
    diagnostic("fixture:end", {
      fixtureStrategy: f1.strategy,
      fixtureProjectIds: f1.projectIds,
      beforeIds: f1.beforeIds,
      afterIds: f1.afterIds,
      expectedF1Ids: f1.resources.map((resource) => resource.id),
    });
    const f1Ids = f1.resources.map((resource) => resource.id).sort();
    fullPopulationIds = f1Ids;
    try {
      transitionPhase = "project-to-global";
      diagnostic("viewport:start");
      await page.setViewportSize({ width: 3840, height: 2160 });
      diagnostic("viewport:end");
      fullPopulationMode = true;
      diagnostic("global-selection:start", { navigation });
      await page.getByLabel("Infrastructure project").selectOption("");
      diagnostic("global-selection:end", { navigation });
      await expect
        .poll(async () => {
          const observationStarted = performance.now();
          const tuple = await gravity.evaluate((element) => [
            element.getAttribute("data-grouping"),
            element.getAttribute("data-view-revision"),
            element.getAttribute("data-projection-revision"),
          ]);
          const key = JSON.stringify(tuple);
          const current = browserScenes.get(key)?.scene;
          const complete =
            !!current &&
            f1Ids.every((id) =>
              current.membershipIndex.resourceIds.includes(id),
            );
          diagnostic("population-predicate:observation", {
            observationStartedMs: observationStarted - diagnosticStarted,
            durationMs: performance.now() - observationStarted,
            tuple,
            key,
            matchingScene: !!current,
            missingF1Ids: f1Ids.filter(
              (id) => !current?.membershipIndex.resourceIds.includes(id),
            ),
            complete,
          });
          return complete;
        })
        .toBe(true);
      diagnostic("population-predicate:passed");
      await applied("projects");
      transitionPassed = true;
      diagnostic("settled-key:passed");
    } finally {
      diagnostic("finally", {
        passed: transitionPassed,
        parserAndPageErrors: [...errors],
        consoleErrors: diagnosticErrors,
      });
      let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;
      const flushChecks = [...responseChecks, ...transitionChecks];
      const flushSettled = await Promise.race([
        Promise.allSettled(flushChecks).then(() => true),
        new Promise<false>((resolve) => {
          diagnosticTimer = setTimeout(() => resolve(false), 250);
        }),
      ]).finally(() => {
        if (diagnosticTimer !== undefined) clearTimeout(diagnosticTimer);
      });
      const parserFlush = {
        boundMs: 250,
        expired: !flushSettled,
        checked: flushChecks.length,
        pendingResponseChecks: pendingResponseChecks.size,
        pendingTransitionChecks: pendingTransitionChecks.size,
      };
      diagnostic("parser-flush", parserFlush);
      await diagnosticDom("transition-finally");
      const collectionState = {
        complete:
          pendingResponseChecks.size === 0 &&
          pendingTransitionChecks.size === 0,
        pendingResponseChecks: pendingResponseChecks.size,
        pendingTransitionChecks: pendingTransitionChecks.size,
      };
      diagnostic("collection-completeness", collectionState);
      try {
        writeFileSync(
          transitionSummaryPath,
          JSON.stringify(
            {
              passed: transitionPassed,
              parserFlush,
              collectionState,
              fixture: transitionFixture,
              parserAndPageErrors: [...errors],
              consoleErrors: diagnosticErrors,
              lastDom,
              acceptedScenes: [...browserScenes].map(([key, value]) => ({
                key,
                ids: value.scene.membershipIndex.resourceIds,
                missingF1Ids: f1Ids.filter(
                  (id) => !value.scene.membershipIndex.resourceIds.includes(id),
                ),
              })),
              records: transitionRecords,
            },
            null,
            2,
          ) + "\n",
        );
      } catch (error) {
        console.error("Transition summary write failed", String(error));
      }
      transitionActive = false;
      for (const [name, path, contentType] of [
        ["f1-global-transition", transitionSummaryPath, "application/json"],
        [
          "f1-global-transition-timeline",
          transitionPath,
          "application/x-ndjson",
        ],
      ]) {
        await testInfo
          .attach(name!, { path, contentType })
          .catch((error: unknown) => {
            console.error(
              "Transition diagnostic attachment failed",
              String(error),
            );
          });
      }
    }
    await appearance.click();
    const textSize = page.getByRole("combobox", {
      name: "Text size",
      exact: true,
    });
    await textSize.selectOption("1.5");
    await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        gravity.evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--op-text-scale").trim(),
        ),
      )
      .toBe("1.5");
    const fullFit = await fittedWallboard("3840x2160-f1-150-percent-text");
    expect(
      fullFit.elements.find(
        (element) => element.selector === ".cmd-operational-observatory",
      )?.fontSize,
    ).toBe("21px");
    await expandCompleteOutline();
    const search = gravity.getByLabel("Search complete Observatory inventory", {
      exact: true,
    });
    await search.fill("Synthetic");
    await expect(
      searchResults.getByRole("button").nth(f1.resources.length - 1),
    ).toBeAttached({ timeout: 5000 });
    const searched = await applied("projects");
    const searchIds = searched.scene.searchResults.map(
      (result) => result.resourceId,
    );
    for (const id of f1Ids) expect(searchIds).toContain(id);
    for (const id of searchIds) expect(expectedIds).toContain(id);
    await expect(searchResults.getByRole("button")).toHaveCount(
      searchIds.length,
    );
    const searchControls = await searchResults
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => ({
          text: button.textContent,
          enabled: !(button as HTMLButtonElement).disabled,
        })),
      );
    for (const resource of f1.resources) {
      const index = searched.scene.searchResults.findIndex(
        (result) => result.resourceId === resource.id,
      );
      expect(index).toBeGreaterThanOrEqual(0);
      expect(searchControls[index]?.text).toContain(resource.name);
      expect(searchControls[index]?.enabled).toBe(true);
    }
    const representatives = [
      f1.resources.filter((resource) => resource.kind === "repository").at(-1)!,
      f1.resources.find(
        (resource) => resource.kind === "host" && resource.parentResourceId,
      )!,
      f1.resources.filter((resource) => resource.kind === "service").at(-1)!,
    ];
    const inspectedIds: string[] = [];
    for (const resource of representatives) {
      const index = searched.scene.searchResults.findIndex(
        (result) => result.resourceId === resource.id,
      );
      expect(index).toBeGreaterThanOrEqual(0);
      const result = searchResults.getByRole("button").nth(index);
      await expect(result).toContainText(resource.name);
      await expect(result).toBeEnabled();
      await result.click();
      await expect(
        inspector.getByRole("heading", { name: resource.name, exact: true }),
      ).toBeVisible();
      await expect(
        inspector
          .locator("code")
          .filter({ hasText: new RegExp("^" + resource.id + "$") }),
      ).toHaveText(resource.id);
      const selected = await applied("projects");
      const node = selected.scene.representations.find(
        (item) => item.resourceId === resource.id && !item.referenceTo,
      )!;
      await expect(canvas).toHaveAttribute("data-gravity-main-focus", node.id);
      inspectedIds.push(resource.id);
    }
    expect(inspectedIds.sort()).toEqual(
      representatives.map((resource) => resource.id).sort(),
    );
    await gravity
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    const complete = await applied("projects");
    await expandCompleteOutline();
    const last = canonicalRow(f1.resources.at(-1)!.id);
    await last.focus();
    await last.press("Enter");
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(last).toBeInViewport();
    await selectCanonical(f.host.id, f.host.name);
    await inspector.getByText("Observation evidence", { exact: true }).click();
    const sourceLink = inspector
      .locator("article")
      .filter({ hasText: "Source " + f.source.id + ":" })
      .getByRole("link", { name: "Source evidence", exact: true })
      .first();
    await sourceLink.focus();
    await expect(sourceLink).toBeFocused();
    await expect(sourceLink).toBeInViewport();
    expect(
      (await request.get((await sourceLink.getAttribute("href"))!)).status(),
    ).toBe(200);
    const workSummary = gravity.locator(".cmd-op-canonical-work > summary");
    await workSummary.click();
    await expect(workSummary).toBeInViewport();
    await workSummary.focus();
    await workSummary.press("Enter");
    await expect(gravity.locator(".cmd-op-canonical-work")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(
      gravity.locator('footer[aria-label="Recorded active work"]'),
    ).toBeInViewport();
    await fittedWallboard("3840x2160-f1-accessible-regions");
    await page.screenshot({
      path: testInfo.outputPath("gravity-wallboard-f1-4k.png"),
      fullPage: true,
    });
    await attachJson("f1-complete-population", {
      expectedF1Ids: f1Ids,
      fixtureStrategy: f1.strategy,
      fixtureProjectIds: f1.projectIds,
      inspectedIds,
      searchControls,
      authorizedIds: complete.scene.membershipIndex.resourceIds,
      additionalAuthorizedIds:
        complete.scene.membershipIndex.resourceIds.filter(
          (id) => !f1Ids.includes(id),
        ),
      grouping: complete.scene.grouping,
      textScale: 1.5,
    });
    await appearance.click();
    await textSize.selectOption("1");
    await page.keyboard.press("Escape");
    fullPopulationMode = false;
    expectedIds = scopedIds;
    await page.getByLabel("Infrastructure project").selectOption(f.project.id);
    await applied("projects");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await fittedWallboard("1920x1080-restored-project-wallboard");
  }
  const service = await selectCanonical(f.web.id, f.web.name);
  expect(
    service.scene.sourceObservations.filter(
      (item) => item.resourceId === f.web.id,
    ),
  ).toEqual([]);
  expect(service.node.summary.telemetry.counts.reporting ?? 0).toBe(0);
  await availabilityRemainsUnknown(service.node);
  expect(
    await inspector
      .getByText("Physical containment", { exact: true })
      .evaluate((element) => element.nextElementSibling?.textContent),
  ).toBe(f.host.name);
  await expect(
    inspector.locator("article").filter({ hasText: `Source ${f.source.id}:` }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("gravity-wallboard.png"),
    fullPage: true,
  });
  await Promise.all(responseChecks);
  await attachJson("observer-and-lens-diagnostics", {
    observer: await intersectionState(),
    lastLensGeometry,
    clippedBounds,
  });
  expect(errors).toEqual([]);
});
