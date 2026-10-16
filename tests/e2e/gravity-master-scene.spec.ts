import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

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
  const cursors = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/api/v1/infrastructure/overview" &&
      url.searchParams.get("projectId") === project.id
    )
      cursors.add(url.searchParams.get("cursor") ?? "first");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/infrastructure/wallboard?projectId=${project.id}`);
    await expect(
      page.getByText("103 of 103 matching resources / one complete scene", {
        exact: true,
      }),
    ).toBeVisible();
    expect(cursors.size).toBeGreaterThanOrEqual(3);
    await expect(
      page.getByRole("button", {
        name: /^(Next page|Previous page|Rotate pages)/,
      }),
    ).toHaveCount(0);
    const gravity = page.getByRole("region", {
      name: "Gravity Observatory",
      exact: true,
    });
    const canvas = gravity.locator("canvas");
    await gravity.getByText("Appearance", { exact: true }).click();
    const surface = colorScheme === "light" ? "porcelain" : "midnight";
    await gravity.getByLabel("Gravity surface").selectOption(surface);
    await gravity.getByText("Appearance", { exact: true }).click();
    await expect(gravity.locator(".cmd-gravity")).toHaveAttribute(
      "data-theme",
      surface,
    );
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute(
      "data-gravity-field-texture",
      /^[1-9][0-9]*x[1-9][0-9]*$/,
    );
    // These diagnostics come from the actual submitted GPU field, not the API count.
    await expect
      .poll(async () =>
        Number(await canvas.getAttribute("data-gravity-contributions")),
      )
      .toBeGreaterThanOrEqual(103);
    await gravity
      .getByText("Resources in this scene (103)", { exact: true })
      .click();
    const chooser = gravity.getByRole("group", {
      name: "Select a Gravity resource",
      exact: true,
    });
    await expect(chooser.getByRole("button", { name: /^Select / })).toHaveCount(
      103,
    );
    const last = [...resources]
      .sort((a, b) => a.id.localeCompare(b.id))
      .at(-1)!;
    await chooser
      .getByRole("button", {
        name: `Select ${last.name}, ${last.kind}, No observation`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", {
        name: `Selected resource ${last.name}`,
        exact: true,
      }),
    ).toContainText("Service health: unknown");
    const parent = resources[0]!;
    await chooser
      .getByRole("button", {
        name: `Select ${parent.name}, host, No observation`,
        exact: true,
      })
      .click();
    // Return the canvas its space after inspecting the complete resource picker.
    await gravity
      .getByText("Resources in this scene (103)", { exact: true })
      .click();
    await gravity
      .getByRole("button", { name: "Open focus lens", exact: true })
      .click();
    await expect(
      gravity.getByRole("button", { name: "Close focus lens", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        Number(await canvas.getAttribute("data-gravity-focus-vertices")),
      )
      .toBeGreaterThan(0);
    let labelDiagnostics: unknown;
    try {
      await expect
        .poll(async () =>
          gravity.locator(".cmd-gravity-anchor").evaluateAll((elements) => {
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
    } catch (error) {
      labelDiagnostics = await gravity
        .locator(".cmd-gravity-stage")
        .evaluate((stage) => ({
          stage: stage.getBoundingClientRect().toJSON(),
          canvas: { ...stage.querySelector("canvas")?.dataset },
          labels: [...stage.querySelectorAll(".cmd-gravity-anchor")].map(
            (element) => ({
              text: element.textContent,
              opacity: getComputedStyle(element).opacity,
              visibility: getComputedStyle(element).visibility,
              rect: element.getBoundingClientRect().toJSON(),
              width: (element as HTMLElement).offsetWidth,
              height: (element as HTMLElement).offsetHeight,
            }),
          ),
        }));
      console.error(
        "Focus label diagnostics:",
        JSON.stringify(labelDiagnostics),
      );
      throw error;
    }
    await page.screenshot({
      path: testInfo.outputPath(`complete-fleet-focus-${surface}.png`),
      fullPage: true,
    });
    await gravity
      .getByRole("button", { name: "Close focus lens", exact: true })
      .click();
    for (const grouping of ["projects", "custom", "hosts"]) {
      await gravity.getByLabel("Gravity grouping").selectOption(grouping);
      await expect
        .poll(async () =>
          Number(await canvas.getAttribute("data-gravity-contributions")),
        )
        .toBeGreaterThanOrEqual(103);
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
    // A later-page failure must retain the complete prior scene.
    await page.route("**/api/v1/infrastructure/overview?**", async (route) => {
      if (new URL(route.request().url()).searchParams.has("cursor")) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Later inventory page unavailable" }),
        });
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Refresh now", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Refresh delayed" }),
    ).toBeVisible();
    await expect(
      page.getByText("103 of 103 matching resources / one complete scene", {
        exact: true,
      }),
    ).toBeVisible();
    await gravity
      .getByText("Resources in this scene (103)", { exact: true })
      .click();
    await expect(chooser.getByRole("button", { name: /^Select / })).toHaveCount(
      103,
    );
    await page.unroute("**/api/v1/infrastructure/overview?**");
    await page.getByRole("button", { name: "Retry overview" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Refresh delayed" }),
    ).toBeHidden();
    await page.getByLabel("Find a resource").fill(last.name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByText("1 of 1 matching resources / one complete scene", {
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByLabel("Find a resource").fill("");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("103 of 103 matching resources / one complete scene", {
      exact: true,
    }),
  ).toBeVisible();
  const fallback = page.getByRole("region", {
    name: "Gravity Observatory",
    exact: true,
  });
  const lost = await fallback.locator("canvas").evaluate((canvas) => {
    const extension = (canvas as HTMLCanvasElement)
      .getContext("webgl2")
      ?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(lost).toBe(true);
  await expect(fallback.getByRole("status")).toContainText(
    "Resource controls remain available",
  );
  const fallbackLast = [...resources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .at(-1)!;
  await fallback
    .getByText("Resources in this scene (103)", { exact: true })
    .click();
  await expect(
    fallback
      .getByRole("group", { name: "Select a Gravity resource" })
      .getByRole("button"),
  ).toHaveCount(103);
  await fallback
    .getByRole("group", { name: "Select a Gravity resource" })
    .getByRole("button", {
      name: `Select ${fallbackLast.name}, ${fallbackLast.kind}, No observation`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", {
      name: `Selected resource ${fallbackLast.name}`,
      exact: true,
    }),
  ).toContainText("Service health: unknown");
  expect(errors).toEqual([]);
});
