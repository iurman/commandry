import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Command Center connects recent local attention to exact synthetic sources", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Command Center test ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `Command Center service ${suffix}`, kind: "service" },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const link = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    { data: { resourceId: resource.id, type: "supports" } },
  );
  expect(link.status()).toBe(201);
  const imported = await request.post("/api/v1/synthetic-event-imports", {
    data: {
      scenarioId: "operations.monitor-down",
      projectId: project.id,
      resourceId: resource.id,
      occurrenceId: randomUUID(),
    },
  });
  expect(imported.status()).toBe(202);
  const receipt = await imported.json();
  await expect
    .poll(
      async () => {
        const status = await request.get(
          `/api/v1/synthetic-event-imports/${receipt.id}`,
        );
        return (await status.json()).state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Command Center" }),
  ).toBeVisible();
  await expect(page.getByText("No live sources")).toBeVisible();
  const recent = page.getByRole("list", { name: "Recent attention" });
  await expect(recent.locator("li").first()).toBeVisible();
  const first = recent.locator("li").first();
  await expect(first).toContainText("Synthetic");
  const sourceLink = first.getByRole("link", { name: "Exact source record" });
  await expect(sourceLink).toHaveAttribute("href", /^\/api\/v1\//);
  const contextHref = await first
    .getByRole("link", { name: "Review context" })
    .getAttribute("href");
  expect(contextHref).toBeTruthy();
  const next = page
    .getByRole("region", { name: "Local next step" })
    .getByRole("link");
  await expect(next).toHaveAttribute("href", contextHref!);
  await expect(
    page.getByRole("link", { name: "Review all local notifications" }),
  ).toHaveAttribute("href", "/notifications");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
