import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("one master scene renders and inspects the complete multi-page inventory", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180000);
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
    const chooser = gravity.locator("details").filter({
      has: gravity.getByText("Resources in this scene (103)", {
        exact: true,
      }),
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
    .getByRole("button")
    .last()
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "Resource inspector and recent events",
    }),
  ).toContainText("Service health: unknown");
  expect(errors).toEqual([]);
});
