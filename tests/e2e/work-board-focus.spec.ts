import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Work list and board share persisted tasks and focused filters", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Board project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  async function createTask(title: string) {
    const captureResponse = await request.post("/api/v1/captures", {
      data: { inputType: "text", originalContent: `Original ${title}` },
    });
    expect(captureResponse.status()).toBe(201);
    const capture = await captureResponse.json();
    const filedResponse = await request.post(
      `/api/v1/captures/${capture.id}/file`,
      {
        data: {
          projectId: project.id,
          kind: "task",
          title,
          body: "One task in list and board",
        },
      },
    );
    expect(filedResponse.status()).toBe(201);
    return { record: (await filedResponse.json()).record, capture };
  }

  const high = await createTask(`High overdue ${suffix}`);
  const assigned = await createTask(`Assigned upcoming ${suffix}`);
  const finished = await createTask(`Finished undated ${suffix}`);
  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  expect(
    (
      await request.put(`/api/v1/work-items/${high.record.id}/planning`, {
        data: {
          expectedUpdatedAt: high.record.updatedAt,
          priority: "high",
          dueOn: yesterday,
        },
      })
    ).status(),
  ).toBe(200);
  const assignedPlanningResponse = await request.put(
    `/api/v1/work-items/${assigned.record.id}/planning`,
    {
      data: {
        expectedUpdatedAt: assigned.record.updatedAt,
        priority: "low",
        dueOn: tomorrow,
      },
    },
  );
  expect(assignedPlanningResponse.status()).toBe(200);
  const assignedPlanning = await assignedPlanningResponse.json();
  expect(
    (
      await request.put(`/api/v1/work-items/${assigned.record.id}/assignment`, {
        data: {
          expectedUpdatedAt: assignedPlanning.updatedAt,
          assigneeKind: "local_user",
          agentId: null,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post(`/api/v1/work-items/${finished.record.id}/status`, {
        data: { expectedStatus: "open", status: "done" },
      })
    ).status(),
  ).toBe(200);

  await page.goto(`/work?projectId=${project.id}`);
  const workspace = page.getByRole("region", { name: "All work" });
  const list = workspace.getByRole("list", { name: "All work" });
  await expect(
    list.getByRole("link", { name: high.record.title }),
  ).toBeVisible();
  await expect(
    list.getByRole("link", { name: assigned.record.title }),
  ).toBeVisible();
  await expect(
    list.getByRole("link", { name: finished.record.title }),
  ).toHaveCount(0);
  await workspace
    .getByRole("group", { name: "Work view" })
    .getByRole("button", { name: "List" })
    .click();
  await workspace
    .getByRole("group", { name: "Task status" })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(list.getByRole("link", { name: high.record.title })).toBeVisible();

  const focus = workspace.getByRole("group", { name: "Focused Work query" });
  await focus.getByLabel("Priority").selectOption("high");
  await expect(
    list.getByRole("link", { name: high.record.title }),
  ).toBeVisible();
  await expect(
    list.getByRole("link", { name: assigned.record.title }),
  ).toHaveCount(0);
  await focus.getByLabel("Due").selectOption("overdue");
  await expect(
    list.getByRole("link", { name: high.record.title }),
  ).toBeVisible();
  await focus.getByLabel("Assignment").selectOption("local_user");
  await expect(workspace.getByText("No tasks in this view")).toBeVisible();
  await focus.getByLabel("Assignment").selectOption("unassigned");
  await expect(
    list.getByRole("link", { name: high.record.title }),
  ).toBeVisible();

  await workspace
    .getByRole("group", { name: "Work view" })
    .getByRole("button", { name: "Board" })
    .click();
  const openColumn = workspace.getByRole("region", { name: "Open tasks" });
  const doneColumn = workspace.getByRole("region", { name: "Done tasks" });
  await expect(
    openColumn.getByRole("link", { name: high.record.title }),
  ).toBeVisible();
  await expect(doneColumn.getByText("No done tasks match")).toBeVisible();
  await focus.getByLabel("Priority").selectOption("all");
  await focus.getByLabel("Due").selectOption("all");
  await focus.getByLabel("Assignment").selectOption("all");
  await expect(
    openColumn.getByRole("link", { name: assigned.record.title }),
  ).toBeVisible();
  await expect(
    doneColumn.getByRole("link", { name: finished.record.title }),
  ).toBeVisible();
  await expect(
    openColumn.locator(`a[href="/inbox?captureId=${high.capture.id}"]`),
  ).toHaveCount(1);

  const highCard = openColumn
    .getByRole("article")
    .filter({ has: page.getByRole("link", { name: high.record.title }) });
  await highCard.getByRole("button", { name: "Mark done" }).click();
  await expect(
    doneColumn.getByRole("link", { name: high.record.title }),
  ).toBeVisible();
  await expect(
    openColumn.getByRole("link", { name: high.record.title }),
  ).toHaveCount(0);
  await workspace
    .getByRole("group", { name: "Work view" })
    .getByRole("button", { name: "List" })
    .click();
  await expect(
    list.getByRole("link", { name: assigned.record.title }),
  ).toBeVisible();
  await workspace
    .getByRole("group", { name: "Task status" })
    .getByRole("button", { name: "Done" })
    .click();
  await expect(
    list.getByRole("link", { name: high.record.title }),
  ).toBeVisible();
  await expect(
    list.getByRole("link", { name: finished.record.title }),
  ).toBeVisible();
  const persisted = await request.get(
    `/api/v1/work-items?projectId=${project.id}&status=done`,
  );
  expect(persisted.status()).toBe(200);
  expect(
    (await persisted.json()).items.map((item: { id: string }) => item.id),
  ).toEqual(expect.arrayContaining([high.record.id, finished.record.id]));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
