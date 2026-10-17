import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Response } from "@playwright/test";
import {
  infrastructureOverviewSchema,
  observatorySceneReadResultSchema,
  type InfrastructureOverview,
  type ObservatorySceneDto,
} from "@commandry/contracts";

test("one master scene renders and inspects the complete multi-page inventory", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180000);
  const started = performance.now();
  const phasePath = testInfo.outputPath("master-scene-phases.jsonl");
  const summaryPath = testInfo.outputPath("master-scene-diagnostics.json");
  function diagnosticWrite(write: () => void) {
    try {
      write();
    } catch (error) {
      console.error("Master diagnostic write failed", String(error));
    }
  }
  diagnosticWrite(() => mkdirSync(testInfo.outputDir, { recursive: true }));
  let theme: string | null = null;
  let currentGrouping: string | null = null;
  let phase = "setup";
  let lastCompletedOperation: string | null = null;
  const setup = {
    projects: 0,
    resources: 0,
    parents: 0,
    links: 0,
    projectMs: 0,
    resourceMs: 0,
    parentMs: 0,
    linkMs: 0,
  };
  const diagnostics = {
    projectId: null as string | null,
    expectedIds: [] as string[],
    errors: [] as string[],
    protocol: [] as unknown[],
    overview: [] as unknown[],
    scenes: [] as unknown[],
  };
  function receipt(operation: string, detail: object = {}) {
    const elapsedMs = performance.now() - started;
    const record = {
      utc: new Date().toISOString(),
      elapsedMs,
      remainingMs: Math.max(0, testInfo.timeout - elapsedMs),
      deadlineMs: testInfo.timeout,
      test: testInfo.title,
      project: testInfo.project.name,
      worker: testInfo.workerIndex,
      parallelIndex: testInfo.parallelIndex,
      phase,
      theme,
      grouping: currentGrouping,
      lastCompletedOperation,
      operation,
      ...detail,
    };
    diagnosticWrite(() =>
      appendFileSync(phasePath, JSON.stringify(record) + "\n"),
    );
    console.info("master-scene-phase", JSON.stringify(record));
  }
  function begin(operation: string, detail: object = {}) {
    phase = operation;
    receipt("start", detail);
  }
  function end(operation: string, detail: object = {}) {
    lastCompletedOperation = operation;
    receipt("end", detail);
  }
  function protocol(event: string, detail: object) {
    const record = {
      event,
      elapsedMs: performance.now() - started,
      utc: new Date().toISOString(),
      theme,
      grouping: currentGrouping,
      ...detail,
    };
    diagnostics.protocol.push(record);
    diagnosticWrite(() =>
      appendFileSync(phasePath, JSON.stringify(record) + "\n"),
    );
  }
  begin("setup", { setup });
  try {
    if (testInfo.project.name === "desktop")
      await page.setViewportSize({ width: 1920, height: 1080 });
    const name = `Gravity fleet ${randomUUID().slice(0, 8)}`;
    const projectStarted = performance.now();
    const projectResponse = await request.post("/api/v1/projects", {
      data: { name },
    });
    expect(projectResponse.status()).toBe(201);
    const project = await projectResponse.json();
    setup.projects++;
    setup.projectMs += performance.now() - projectStarted;
    diagnostics.projectId = project.id;
    const resources: {
      id: string;
      name: string;
      kind: string;
      parent: string | null;
    }[] = [];
    let parent: string | null = null;
    for (let index = 0; index < 103; index++) {
      const kind = index % 10 === 0 ? "host" : "service";
      const resourceStarted = performance.now();
      const response = await request.post("/api/v1/resources", {
        data: { name: `${name} ${String(index).padStart(3, "0")}`, kind },
      });
      expect(response.status()).toBe(201);
      const resource = await response.json();
      setup.resources++;
      setup.resourceMs += performance.now() - resourceStarted;
      if (kind === "host") parent = resource.id;
      const parentId = kind === "host" ? null : parent;
      const parentStarted = performance.now();
      if (parentId) {
        expect(
          (
            await request.put(`/api/v1/resources/${resource.id}/parent`, {
              data: {
                parentResourceId: parentId,
                expectedParentResourceId: null,
              },
            })
          ).status(),
        ).toBe(200);
        setup.parents++;
        setup.parentMs += performance.now() - parentStarted;
      }
      const linkStarted = performance.now();
      expect(
        (
          await request.post(`/api/v1/projects/${project.id}/resources`, {
            data: { resourceId: resource.id, type: "supports" },
          })
        ).status(),
      ).toBe(201);
      setup.links++;
      setup.linkMs += performance.now() - linkStarted;
      resources.push({ ...resource, parent: parentId });
      lastCompletedOperation = `linked resource ${index + 1}`;
      if ((index + 1) % 10 === 0 || index === 102)
        receipt("setup-progress", { setup });
    }
    diagnostics.expectedIds = resources.map((item) => item.id).sort();
    end("setup", { setup });
    const errors = diagnostics.errors;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /THREE|WebGL|shader/i.test(message.text())
      )
        errors.push(message.text());
    });
    let navigation = 0;
    let committedNavigation = 0;
    const requestNavigation = new WeakMap<object, number>();
    const requestStarted = new WeakMap<object, number>();
    const overviewPages = new Map<string, InfrastructureOverview>();
    const browserScenes = new Map<string, ObservatorySceneDto>();
    const responseChecks: Promise<void>[] = [];
    const sceneKey = (scene: ObservatorySceneDto) =>
      JSON.stringify([
        scene.grouping,
        scene.viewRevision,
        scene.projectionRevision,
      ]);
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) committedNavigation = navigation;
    });
    page.on("request", (request) => {
      requestNavigation.set(request, committedNavigation);
      const url = new URL(request.url());
      if (
        url.pathname !== "/api/v1/infrastructure/overview" &&
        url.pathname !== "/api/v1/infrastructure/observatory/scene"
      )
        return;
      requestStarted.set(request, performance.now());
      const query = request.method() === "POST" ? request.postDataJSON() : null;
      protocol("request", {
        ticket: committedNavigation,
        navigation,
        method: request.method(),
        path: url.pathname,
        projectId: query?.projectId ?? url.searchParams.get("projectId"),
        cursor: url.searchParams.get("cursor"),
        environment: query?.environment ?? null,
        requestedGrouping: query?.grouping ?? null,
        viewRevision: query?.viewRevision ?? null,
      });
    });
    const inspectResponse = async (response: Response) => {
      const ticket = requestNavigation.get(response.request());
      const requestTime = requestStarted.get(response.request());
      if (requestTime !== undefined)
        protocol("response", {
          ticket,
          navigation,
          path: new URL(response.url()).pathname,
          status: response.status(),
          durationMs: performance.now() - requestTime,
          admission:
            ticket !== navigation
              ? "stale-navigation"
              : !response.ok()
                ? "non-ok"
                : "pending-parse",
        });
      if (ticket !== navigation) return;
      const url = new URL(response.url());
      if (!response.ok()) return;
      const isOverview =
        url.pathname === "/api/v1/infrastructure/overview" &&
        url.searchParams.get("projectId") === project.id;
      const isScene =
        url.pathname === "/api/v1/infrastructure/observatory/scene" &&
        response.request().postDataJSON()?.projectId === project.id;
      if (!isOverview && !isScene) return;
      try {
        let text: string;
        try {
          text = await response.text();
        } catch (error) {
          if (response.request().failure()?.errorText === "net::ERR_ABORTED")
            return;
          await response.finished();
          if (response.request().failure()?.errorText === "net::ERR_ABORTED")
            return;
          throw error;
        }
        const body: unknown = JSON.parse(text);
        if (isOverview) {
          const result = infrastructureOverviewSchema.parse(body);
          const observed = {
            ticket,
            navigation,
            cursor: url.searchParams.get("cursor"),
            nextCursor: result.nextCursor,
            total: result.total,
            ids: result.items.map((item) => item.id),
            elapsedMs: performance.now() - started,
            admitted: ticket === navigation,
          };
          diagnostics.overview.push(observed);
          protocol("overview-page", observed);
          if (ticket === navigation)
            overviewPages.set(
              url.searchParams.get("cursor") ?? "first",
              result,
            );
        } else if (isScene) {
          const { scene } = observatorySceneReadResultSchema.parse(body);
          const observed = {
            ticket,
            navigation,
            key: sceneKey(scene),
            ids: scene.membershipIndex.resourceIds,
            visibleRepresentationCount: scene.visibleRepresentationIds.length,
            elapsedMs: performance.now() - started,
            admitted: ticket === navigation,
          };
          diagnostics.scenes.push(observed);
          protocol("scene-parse", observed);
          if (ticket === navigation) browserScenes.set(sceneKey(scene), scene);
        }
      } catch (error) {
        if (ticket === navigation)
          errors.push(
            `Invalid successful browser response at ${url.pathname}: ${error instanceof Error ? error.message : "unknown"}; transport=${response.request().failure()?.errorText ?? "complete"}`,
          );
      }
    };
    page.on("response", (response) => {
      responseChecks.push(inspectResponse(response));
    });
    page.on("requestfailed", (outgoing) => {
      const requestTime = requestStarted.get(outgoing);
      if (requestTime !== undefined)
        protocol("request-failed", {
          ticket: requestNavigation.get(outgoing),
          navigation,
          path: new URL(outgoing.url()).pathname,
          durationMs: performance.now() - requestTime,
          failure: outgoing.failure()?.errorText,
        });
    });
    begin("reduced-motion");
    await page.emulateMedia({ reducedMotion: "reduce" });
    end("reduced-motion");
    const expectedIds = resources.map((item) => item.id).sort();
    // Validate the page's own committed response, independently of renderer counts.
    function conserve(scene: ObservatorySceneDto) {
      expect(scene.membershipIndex.resourceIds).toEqual(expectedIds);
      expect(
        scene.representations
          .filter((node) => node.resourceId && !node.referenceTo)
          .map((node) => node.resourceId!)
          .sort(),
      ).toEqual(expectedIds);
      const nodes = new Map(
        scene.representations.map((node) => [node.id, node]),
      );
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
    }
    function completedOverviewIds() {
      const seen = new Set<string>(),
        ids: string[] = [];
      let cursor = "first";
      while (!seen.has(cursor)) {
        seen.add(cursor);
        const part = overviewPages.get(cursor);
        if (!part) return null;
        ids.push(...part.items.map((item) => item.id));
        if (part.nextCursor === null) return ids.sort();
        cursor = part.nextCursor;
      }
      throw new Error("Overview cursor cycle");
    }
    const gravity = page.getByRole("region", {
      name: "Operational Observatory",
      exact: true,
    });
    const canvas = gravity.locator(".cmd-op-canvas canvas");
    const outline = gravity.locator(".cmd-op-outline");
    async function expandCompleteOutline() {
      begin("outline-expansion");
      if (
        !(await outline.evaluate(
          (element) => (element as HTMLDetailsElement).open,
        ))
      )
        await outline.locator("summary").click();
      let expanded = 0;
      while (await outline.locator('button[aria-expanded="false"]').count()) {
        expect(++expanded).toBeLessThanOrEqual(103);
        await outline.locator('button[aria-expanded="false"]').first().click();
      }
      await expect(
        outline.locator("li[data-resource-id]:not([data-reference])"),
      ).toHaveCount(103);
      expect(
        (
          await outline
            .locator("li[data-resource-id]:not([data-reference])")
            .evaluateAll((elements) =>
              elements.map((element) =>
                element.getAttribute("data-resource-id"),
              ),
            )
        ).sort(),
      ).toEqual(expectedIds);
      end("outline-expansion", { expanded });
    }
    async function submittedFieldsMatchMeaning(grouping: string) {
      currentGrouping = grouping;
      begin("grouping-conservation");
      await expect(gravity).toHaveAttribute("data-grouping", grouping);
      await expect(gravity).toHaveAttribute("data-pending", "false");
      let applied: ObservatorySceneDto | undefined;
      await expect
        .poll(async () => {
          const key = JSON.stringify([
            await gravity.getAttribute("data-grouping"),
            await gravity.getAttribute("data-view-revision"),
            await gravity.getAttribute("data-projection-revision"),
          ]);
          applied = browserScenes.get(key);
          return applied !== undefined;
        })
        .toBe(true);
      const scene = applied!;
      expect(scene.grouping).toBe(grouping);
      conserve(scene);
      expect(
        await outline
          .locator(":scope > ul > li")
          .evaluateAll((elements) =>
            elements.map((element) =>
              element.getAttribute("data-representation-id"),
            ),
          ),
      ).toEqual(scene.rootRepresentationIds);
      await canvas.scrollIntoViewIfNeeded();
      await expect
        .poll(async () =>
          Number(await canvas.getAttribute("data-gravity-contributions")),
        )
        .toBe(scene.visibleRepresentationIds.length);
      end("grouping-conservation", {
        key: sceneKey(scene),
        cursorPages: overviewPages.size,
      });
    }
    const last = [...resources]
      .sort((a, b) => a.id.localeCompare(b.id))
      .at(-1)!;
    const row = (id: string) =>
      outline.locator(
        `li[data-resource-id="${id}"]:not([data-reference]) > .cmd-op-outline-row > button:not(.cmd-op-expand)`,
      );
    async function floatingLabelsDoNotOverlap(requireVisible: boolean) {
      begin("label-geometry", { requireVisible });
      await expect
        .poll(async () =>
          gravity
            .locator(".cmd-op-label")
            .evaluateAll((elements, requireVisible) => {
              const labels = elements
                .filter(
                  (element) =>
                    Number(getComputedStyle(element).opacity) > 0.5 &&
                    getComputedStyle(element).visibility !== "hidden",
                )
                .map((element) => element.getBoundingClientRect());
              return (
                (!requireVisible || labels.length > 0) &&
                labels.every((a, index) =>
                  labels
                    .slice(index + 1)
                    .every(
                      (b) =>
                        a.right <= b.left + 0.5 ||
                        b.right <= a.left + 0.5 ||
                        a.bottom <= b.top + 0.5 ||
                        b.bottom <= a.top + 0.5,
                    ),
                )
              );
            }, requireVisible),
        )
        .toBe(true);
      end("label-geometry", { requireVisible });
    }
    for (const colorScheme of ["light", "dark"] as const) {
      theme = colorScheme;
      currentGrouping = null;
      begin("theme-media");
      await page.emulateMedia({ colorScheme });
      end("theme-media");
      navigation++;
      overviewPages.clear();
      browserScenes.clear();
      begin("navigation-and-complete-cursor-load");
      await page.goto(`/infrastructure/wallboard?projectId=${project.id}`);
      await expect(gravity.locator(".cmd-op-heading")).toContainText(
        "103 unique resources",
      );
      await expect.poll(completedOverviewIds).toEqual(expectedIds);
      expect(overviewPages.size).toBeGreaterThanOrEqual(3);
      end("navigation-and-complete-cursor-load", {
        cursorPages: overviewPages.size,
      });
      await expect(
        page.getByRole("button", {
          name: /^(Next page|Previous page|Rotate pages)/,
        }),
      ).toHaveCount(0);
      currentGrouping = "operational";
      begin("grouping-request");
      await gravity
        .getByLabel("Observatory grouping")
        .selectOption("operational");
      end("grouping-request");
      const appearance = gravity.getByRole("button", {
        name: "Appearance and views",
        exact: true,
      });
      await appearance.click();
      const surface = colorScheme === "light" ? "porcelain" : "midnight";
      await page
        .getByRole("combobox", { name: "Surface theme", exact: true })
        .selectOption(surface);
      await page.keyboard.press("Escape");
      await expect(gravity).toHaveAttribute("data-theme", surface);
      await expect(canvas).toHaveAttribute(
        "data-gravity-field-texture",
        /^[1-9][0-9]*x[1-9][0-9]*$/,
      );
      await submittedFieldsMatchMeaning("operational");
      await expandCompleteOutline();
      begin("canonical-inspection");
      await row(last.id).click();
      await expect(
        gravity.getByRole("complementary", { name: "Observatory inspector" }),
      ).toContainText(last.id);
      await expect(
        gravity.getByRole("complementary", { name: "Observatory inspector" }),
      ).toContainText("Availability and monitoring coverage");
      end("canonical-inspection");
      begin("selected-subject-lens-and-labels");
      await row(resources[0]!.id).click();
      await canvas.scrollIntoViewIfNeeded();
      await floatingLabelsDoNotOverlap(true);
      await appearance.click();
      await page.getByLabel("Optional selected-subject lens").check();
      await page.keyboard.press("Escape");
      await canvas.scrollIntoViewIfNeeded();
      await expect
        .poll(async () =>
          Number(await canvas.getAttribute("data-gravity-focus-vertices")),
        )
        .toBeGreaterThan(0);
      await expect(gravity.locator(".cmd-op-stage-caption")).toContainText(
        resources[0]!.name,
      );
      await expect(gravity.locator(".cmd-op-lens")).toContainText(
        resources[0]!.name,
      );
      await expect(
        outline.locator("li[data-resource-id]:not([data-reference])"),
      ).toHaveCount(103);
      await floatingLabelsDoNotOverlap(false);
      end("selected-subject-lens-and-labels");
      begin("focus-screenshot");
      await page.screenshot({
        path: testInfo.outputPath(`complete-fleet-focus-${surface}.png`),
        fullPage: true,
      });
      await appearance.click();
      await page.getByLabel("Optional selected-subject lens").uncheck();
      await page.keyboard.press("Escape");
      end("focus-screenshot");
      for (const grouping of ["projects", "custom", "hosts"]) {
        currentGrouping = grouping;
        begin("grouping-request");
        await gravity.getByLabel("Observatory grouping").selectOption(grouping);
        end("grouping-request");
        await submittedFieldsMatchMeaning(grouping);
        await expandCompleteOutline();
        await submittedFieldsMatchMeaning(grouping);
        await expect(gravity.locator(".cmd-op-heading")).toContainText(
          "103 unique resources",
        );
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      begin("theme-screenshot");
      await page.screenshot({
        path: testInfo.outputPath(`complete-fleet-${colorScheme}.png`),
        fullPage: true,
      });
      end("theme-screenshot");
      begin("refresh-failure-and-retained-scene");
      // A later inventory-page failure retains the complete prior authorized scene.
      await page.route(
        "**/api/v1/infrastructure/overview?**",
        async (route) => {
          if (new URL(route.request().url()).searchParams.has("cursor"))
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({
                message: "Later inventory page unavailable",
              }),
            });
          else await route.continue();
        },
      );
      await page
        .getByRole("button", { name: "Refresh now", exact: true })
        .click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Refresh delayed" }),
      ).toBeVisible();
      await expect(gravity.locator(".cmd-op-heading")).toContainText(
        "103 unique resources",
      );
      await expandCompleteOutline();
      end("refresh-failure-and-retained-scene");
      begin("refresh-recovery");
      await page.unroute("**/api/v1/infrastructure/overview?**");
      await page.getByRole("button", { name: "Retry overview" }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Refresh delayed" }),
      ).toBeHidden();
      end("refresh-recovery");
      begin("inventory-search-and-clear");
      await gravity
        .getByLabel("Search complete Observatory inventory")
        .fill(last.name);
      const found = gravity.getByRole("region", {
        name: "Complete inventory search results",
      });
      await expect(found.getByRole("button")).toHaveCount(1);
      await found.getByRole("button").click();
      await expect(
        gravity.getByRole("complementary", { name: "Observatory inspector" }),
      ).toContainText(last.id);
      // Search reveals identity without dropping the rest of the master population.
      await expect(gravity.locator(".cmd-op-heading")).toContainText(
        "103 unique resources",
      );
      await gravity
        .getByRole("button", { name: "Clear search", exact: true })
        .click();
      end("inventory-search-and-clear");
    }
    begin("context-loss-fallback");
    await expandCompleteOutline();
    const lost = await canvas.evaluate((element) => {
      const extension = (element as HTMLCanvasElement)
        .getContext("webgl2")
        ?.getExtension("WEBGL_lose_context");
      if (!extension) return false;
      extension.loseContext();
      return true;
    });
    expect(lost).toBe(true);
    await expect(gravity.locator(".cmd-op-terrain-status")).toContainText(
      /outline|resource|terrain/i,
    );
    await expect(
      outline.locator("li[data-resource-id]:not([data-reference])"),
    ).toHaveCount(103);
    await row(last.id).click();
    await expect(
      gravity.getByRole("complementary", { name: "Observatory inspector" }),
    ).toContainText(last.id);
    end("context-loss-fallback");
    begin("response-parser-checks");
    await Promise.all(responseChecks);
    expect(errors).toEqual([]);
    end("response-parser-checks");
  } finally {
    receipt("finally", { setup });
    diagnosticWrite(() =>
      writeFileSync(
        summaryPath,
        JSON.stringify(
          {
            ...diagnostics,
            setup,
            phase,
            theme,
            grouping: currentGrouping,
            lastCompletedOperation,
            elapsedMs: performance.now() - started,
          },
          null,
          2,
        ) + "\n",
      ),
    );
    for (const [name, path, contentType] of [
      ["master-scene-phases", phasePath, "application/x-ndjson"],
      ["master-scene-diagnostics", summaryPath, "application/json"],
    ]) {
      await testInfo
        .attach(name!, { path, contentType })
        .catch((error: unknown) => {
          console.error("Master diagnostic attachment failed", String(error));
        });
    }
  }
});
