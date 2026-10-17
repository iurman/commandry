import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
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
  if (testInfo.project.name === "desktop")
    await page.setViewportSize({ width: 1920, height: 1080 });
  const name = `Gravity fleet ${randomUUID().slice(0, 8)}`;
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resources: {
    id: string;
    name: string;
    kind: string;
    parent: string | null;
  }[] = [];
  let parent: string | null = null;
  for (let index = 0; index < 103; index++) {
    const kind = index % 10 === 0 ? "host" : "service";
    const response = await request.post("/api/v1/resources", {
      data: { name: `${name} ${String(index).padStart(3, "0")}`, kind },
    });
    expect(response.status()).toBe(201);
    const resource = await response.json();
    if (kind === "host") parent = resource.id;
    const parentId = kind === "host" ? null : parent;
    if (parentId)
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
    expect(
      (
        await request.post(`/api/v1/projects/${project.id}/resources`, {
          data: { resourceId: resource.id, type: "supports" },
        })
      ).status(),
    ).toBe(201);
    resources.push({ ...resource, parent: parentId });
  }
  const errors: string[] = [];
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
  const overviewPages = new Map<string, InfrastructureOverview>();
  const browserScenes = new Map<string, ObservatorySceneDto>();
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
  });
  page.on("response", async (response) => {
    const ticket = requestNavigation.get(response.request());
    if (ticket !== navigation) return;
    const url = new URL(response.url());
    if (!response.ok()) return;
    try {
      if (
        url.pathname === "/api/v1/infrastructure/overview" &&
        url.searchParams.get("projectId") === project.id
      ) {
        const result = infrastructureOverviewSchema.parse(
          await response.json(),
        );
        if (ticket === navigation)
          overviewPages.set(url.searchParams.get("cursor") ?? "first", result);
      } else if (
        url.pathname === "/api/v1/infrastructure/observatory/scene" &&
        response.request().postDataJSON()?.projectId === project.id
      ) {
        const { scene } = observatorySceneReadResultSchema.parse(
          await response.json(),
        );
        if (ticket === navigation) browserScenes.set(sceneKey(scene), scene);
      }
    } catch (error) {
      if (ticket === navigation)
        errors.push(
          `Invalid successful browser response: ${error instanceof Error ? error.name : "unknown"}`,
        );
    }
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
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
            elements.map((element) => element.getAttribute("data-resource-id")),
          )
      ).sort(),
    ).toEqual(expectedIds);
  }
  async function submittedFieldsMatchMeaning(grouping: string) {
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
  }
  const last = [...resources].sort((a, b) => a.id.localeCompare(b.id)).at(-1)!;
  const row = (id: string) =>
    outline.locator(
      `li[data-resource-id="${id}"]:not([data-reference]) > .cmd-op-outline-row > button:not(.cmd-op-expand)`,
    );
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    navigation++;
    overviewPages.clear();
    browserScenes.clear();
    await page.goto(`/infrastructure/wallboard?projectId=${project.id}`);
    await expect(gravity.locator(".cmd-op-heading")).toContainText(
      "103 unique resources",
    );
    await expect.poll(completedOverviewIds).toEqual(expectedIds);
    expect(overviewPages.size).toBeGreaterThanOrEqual(3);
    await expect(
      page.getByRole("button", {
        name: /^(Next page|Previous page|Rotate pages)/,
      }),
    ).toHaveCount(0);
    await gravity
      .getByLabel("Observatory grouping")
      .selectOption("operational");
    const appearance = gravity.getByRole("button", {
      name: "Appearance and views",
      exact: true,
    });
    await appearance.click();
    const surface = colorScheme === "light" ? "porcelain" : "midnight";
    await page
      .getByLabel("Surface theme", { exact: true })
      .selectOption(surface);
    await page.keyboard.press("Escape");
    await expect(gravity).toHaveAttribute("data-theme", surface);
    await expect(canvas).toHaveAttribute(
      "data-gravity-field-texture",
      /^[1-9][0-9]*x[1-9][0-9]*$/,
    );
    await submittedFieldsMatchMeaning("operational");
    await expandCompleteOutline();
    await row(last.id).click();
    await expect(
      gravity.getByRole("complementary", { name: "Observatory inspector" }),
    ).toContainText(last.id);
    await expect(
      gravity.getByRole("complementary", { name: "Observatory inspector" }),
    ).toContainText("Availability and monitoring coverage");
    await row(resources[0]!.id).click();
    await appearance.click();
    await page.getByLabel("Optional selected-subject lens").check();
    await page.keyboard.press("Escape");
    await canvas.scrollIntoViewIfNeeded();
    await expect
      .poll(async () =>
        Number(await canvas.getAttribute("data-gravity-focus-vertices")),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(async () =>
        gravity.locator(".cmd-op-label").evaluateAll((elements) => {
          const labels = elements
            .filter(
              (element) =>
                Number(getComputedStyle(element).opacity) > 0.5 &&
                getComputedStyle(element).visibility !== "hidden",
            )
            .map((element) => element.getBoundingClientRect());
          return (
            labels.length > 0 &&
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
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`complete-fleet-focus-${surface}.png`),
      fullPage: true,
    });
    await appearance.click();
    await page.getByLabel("Optional selected-subject lens").uncheck();
    await page.keyboard.press("Escape");
    for (const grouping of ["projects", "custom", "hosts"]) {
      await gravity.getByLabel("Observatory grouping").selectOption(grouping);
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
    await page.screenshot({
      path: testInfo.outputPath(`complete-fleet-${colorScheme}.png`),
      fullPage: true,
    });
    // A later inventory-page failure retains the complete prior authorized scene.
    await page.route("**/api/v1/infrastructure/overview?**", async (route) => {
      if (new URL(route.request().url()).searchParams.has("cursor"))
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Later inventory page unavailable" }),
        });
      else await route.continue();
    });
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
    await page.unroute("**/api/v1/infrastructure/overview?**");
    await page.getByRole("button", { name: "Retry overview" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Refresh delayed" }),
    ).toBeHidden();
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
  }
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
  expect(errors).toEqual([]);
});
