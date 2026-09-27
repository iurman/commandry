import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Work and Knowledge saved views reopen current scoped queries with audited changes", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `View project ${suffix}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  async function file(
    kind: "task" | "note",
    title: string,
    knowledgeType?: string,
  ) {
    const captureResponse = await request.post("/api/v1/captures", {
      data: { inputType: "text", originalContent: `Original ${title}` },
    });
    expect(captureResponse.status()).toBe(201);
    const capture = await captureResponse.json();
    const response = await request.post(`/api/v1/captures/${capture.id}/file`, {
      data: {
        projectId: project.id,
        kind,
        title,
        body: `Local context for ${title}`,
        ...(knowledgeType ? { knowledgeType } : {}),
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).record;
  }

  const high = await file("task", `Urgent task ${suffix}`);
  const normal = await file("task", `Routine task ${suffix}`);
  expect(
    (
      await request.put(`/api/v1/work-items/${high.id}/planning`, {
        data: {
          expectedUpdatedAt: high.updatedAt,
          priority: "high",
          dueOn: null,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.put(`/api/v1/work-items/${normal.id}/planning`, {
        data: {
          expectedUpdatedAt: normal.updatedAt,
          priority: "normal",
          dueOn: null,
        },
      })
    ).status(),
  ).toBe(200);
  const runbook = await file("note", `Runbook ${suffix}`, "runbook");
  const note = await file("note", `Note ${suffix}`);

  await page.goto(`/work?projectId=${project.id}`);
  const work = page.getByRole("region", { name: "All work" });
  const workViews = page.getByRole("region", { name: "Work saved views" });
  await work.getByLabel("Priority").selectOption("high");
  await work
    .getByRole("group", { name: "Work view" })
    .getByRole("button", { name: "Board" })
    .click();
  await expect(
    work.getByRole("region", { name: "Open tasks" }).getByRole("link", {
      name: high.title,
    }),
  ).toBeVisible();
  await workViews.getByLabel("View name").fill(`Urgent board ${suffix}`);
  await workViews.getByRole("button", { name: "Save as new view" }).click();
  await expect(
    workViews.getByText("Saved locally.", { exact: false }),
  ).toBeVisible();
  const workPage = await (
    await request.get("/api/v1/saved-views?surface=work&limit=100")
  ).json();
  const savedWork = workPage.items.find(
    (view: { name: string }) => view.name === `Urgent board ${suffix}`,
  );
  expect(savedWork).toBeTruthy();
  await work.getByLabel("Priority").selectOption("normal");
  await work
    .getByRole("group", { name: "Work view" })
    .getByRole("button", { name: "List" })
    .click();
  await workViews.getByLabel("Open a saved view").selectOption("");
  await workViews.getByLabel("Open a saved view").selectOption(savedWork.id);
  await expect(work.getByLabel("Priority")).toHaveValue("high");
  await expect(
    work.getByRole("region", { name: "Open tasks" }).getByRole("link", {
      name: high.title,
    }),
  ).toBeVisible();
  await work.getByLabel("Priority").selectOption("normal");
  await workViews.getByLabel("View name").fill(`Routine board ${suffix}`);
  await workViews.getByRole("button", { name: "Update saved view" }).click();
  await expect(
    workViews.getByText("Saved view updated.", { exact: false }),
  ).toBeVisible();
  await workViews.getByLabel("Open a saved view").selectOption("");
  await workViews.getByLabel("Open a saved view").selectOption(savedWork.id);
  await expect(work.getByLabel("Priority")).toHaveValue("normal");
  await expect(
    work.getByRole("region", { name: "Open tasks" }).getByRole("link", {
      name: normal.title,
    }),
  ).toBeVisible();
  await workViews.getByRole("button", { name: "Remove saved view" }).click();
  await expect(
    workViews.getByText("Saved view removed.", { exact: false }),
  ).toBeVisible();
  const archivedWork = await (
    await request.get(`/api/v1/saved-views/${savedWork.id}`)
  ).json();
  expect(archivedWork.lifecycle).toBe("archived");
  const audit = await (
    await request.get(`/api/v1/saved-views/${savedWork.id}/audit`)
  ).json();
  expect(
    audit.items.map((entry: { operation: string }) => entry.operation),
  ).toEqual(["archived", "updated", "created"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);

  await page.goto(`/knowledge?projectId=${project.id}`);
  const knowledgeViews = page.getByRole("region", {
    name: "Knowledge saved views",
  });
  const knowledgeQuery = page.getByRole("group", { name: "Knowledge query" });
  await knowledgeQuery.getByLabel("Knowledge type").selectOption("runbook");
  await expect(page.getByRole("link", { name: runbook.title })).toBeVisible();
  await expect(page.getByRole("link", { name: note.title })).toHaveCount(0);
  await knowledgeViews.getByLabel("View name").fill(`Runbooks ${suffix}`);
  await knowledgeViews
    .getByRole("button", { name: "Save as new view" })
    .click();
  await expect(
    knowledgeViews.getByText("Saved locally.", { exact: false }),
  ).toBeVisible();
  const knowledgePage = await (
    await request.get("/api/v1/saved-views?surface=knowledge&limit=100")
  ).json();
  const savedKnowledge = knowledgePage.items.find(
    (view: { name: string }) => view.name === `Runbooks ${suffix}`,
  );
  expect(savedKnowledge).toBeTruthy();
  const laterRunbook = await file("note", `Later runbook ${suffix}`, "runbook");
  await knowledgeQuery.getByLabel("Knowledge type").selectOption("note");
  await knowledgeViews.getByLabel("Open a saved view").selectOption("");
  await knowledgeViews
    .getByLabel("Open a saved view")
    .selectOption(savedKnowledge.id);
  await expect(knowledgeQuery.getByLabel("Knowledge type")).toHaveValue(
    "runbook",
  );
  await expect(
    page.getByRole("link", { name: laterRunbook.title }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: note.title })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
  expect(pageErrors).toEqual([]);
});
