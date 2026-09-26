import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("local notifications keep synthetic sources, reversible states, and recovery distinct", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const token = `Notice${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `${token} project`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const resourceResponse = await request.post("/api/v1/resources", {
    data: { name: `${token} service`, kind: "service" },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const link = await request.post(`/api/v1/projects/${project.id}/resources`, {
    data: { resourceId: resource.id, type: "supports" },
  });
  expect(link.status()).toBe(201);

  async function importEvent(scenarioId: string) {
    const response = await request.post("/api/v1/synthetic-event-imports", {
      data: {
        scenarioId,
        projectId: project.id,
        resourceId: resource.id,
        occurrenceId: randomUUID(),
      },
    });
    expect(response.status()).toBe(202);
    const saved = await response.json();
    await expect
      .poll(
        async () => {
          const status = await request.get(
            `/api/v1/synthetic-event-imports/${saved.id}`,
          );
          return (await status.json()).state;
        },
        { timeout: 30_000 },
      )
      .toBe("succeeded");
  }

  await importEvent("operations.monitor-down");
  await page.goto(`/notifications?projectId=${project.id}`);
  await expect(
    page.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  await expect(page.getByLabel("Project")).toHaveValue(project.id);
  await expect(
    page.getByText("Synthetic monitor needs attention"),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic operational fixture / Synthetic"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review context" }),
  ).toHaveAttribute("href", `/resources/${resource.id}`);
  const firstPage = await request.get(
    `/api/v1/notifications?projectId=${project.id}`,
  );
  expect(firstPage.status()).toBe(200);
  const first = (await firstPage.json()).items[0];
  expect(first).toMatchObject({
    kind: "synthetic_alert",
    priority: "critical",
    isSynthetic: true,
    version: 0,
  });
  expect(first.evidenceHref).toMatch(/^\/api\/v1\/alerts\//);

  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("acknowledged", { exact: true })).toBeVisible();
  const stale = await request.put(
    `/api/v1/notifications/${encodeURIComponent(first.id)}/state`,
    {
      data: { action: "dismiss", expectedVersion: 0 },
    },
  );
  expect(stale.status()).toBe(409);
  await page.getByRole("button", { name: "View local history" }).click();
  await expect(
    page.getByText(/unread to acknowledged by local-user:unattributed/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Snooze one hour" }).click();
  await expect(page.getByText("Synthetic monitor needs attention")).toHaveCount(
    0,
  );
  await page.getByLabel("View").selectOption("all");
  await expect(
    page.getByText("Synthetic monitor needs attention"),
  ).toBeVisible();
  await expect(page.getByText("snoozed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore unread" }).click();
  await expect(page.getByText("unread", { exact: true })).toBeVisible();

  await importEvent("operations.monitor-recovered");
  await page.getByRole("button", { name: "Refresh sources" }).click();
  await expect(page.getByText("Synthetic monitor recovered")).toBeVisible();
  const recovered = (
    await (
      await request.get(`/api/v1/notifications?projectId=${project.id}`)
    ).json()
  ).items[0];
  expect(recovered.priority).toBe("informational");
  expect(recovered.id).not.toBe(first.id);
  await page.getByLabel("View").selectOption("active");
  await expect(page.getByText("Synthetic monitor recovered")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
