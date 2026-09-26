import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Work and Knowledge connect task state, notes, decisions, projects, and original captures", async ({
  page,
  request,
}) => {
  const token = randomUUID().slice(0, 8);
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Workspace ${token}` },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  async function file(kind: "task" | "note", title: string) {
    const originalContent = `Exact ${kind} source ${token}\nKeep this line.`;
    const captureResponse = await request.post("/api/v1/captures", {
      data: { inputType: "text", originalContent },
    });
    expect(captureResponse.status()).toBe(201);
    const capture = await captureResponse.json();
    const filedResponse = await request.post(
      `/api/v1/captures/${capture.id}/file`,
      { data: { projectId: project.id, kind, title } },
    );
    expect(filedResponse.status()).toBe(201);
    return {
      capture,
      record: (await filedResponse.json()).record,
      originalContent,
    };
  }

  const task = await file("task", `Task ${token}`);
  const note = await file("note", `Note ${token}`);
  const decisionResponse = await request.post(
    `/api/v1/projects/${project.id}/decisions`,
    {
      data: {
        question: `Decision ${token}`,
        outcome: "Keep source evidence",
        alternatives: "Discard the source",
        rationale: "Preserve why this work exists",
        status: "accepted",
      },
    },
  );
  expect(decisionResponse.status()).toBe(201);
  const decision = await decisionResponse.json();

  const workPage = await request.get(
    `/api/v1/work-items?projectId=${project.id}&status=open&limit=1`,
  );
  expect(workPage.status()).toBe(200);
  expect((await workPage.json()).items[0]).toMatchObject({
    id: task.record.id,
    projectName: project.name,
    sourceCaptureId: task.capture.id,
  });
  const notesPage = await request.get(
    `/api/v1/knowledge-items?projectId=${project.id}&limit=1`,
  );
  expect(notesPage.status()).toBe(200);
  expect((await notesPage.json()).items[0]).toMatchObject({
    id: note.record.id,
    projectName: project.name,
    sourceCaptureId: note.capture.id,
  });
  const decisionsPage = await request.get(
    `/api/v1/decisions?projectId=${project.id}&limit=1`,
  );
  expect(decisionsPage.status()).toBe(200);
  expect((await decisionsPage.json()).items[0]).toMatchObject({
    id: decision.id,
    projectName: project.name,
  });

  await page.goto(`/work?projectId=${project.id}`);
  await expect(
    page.getByRole("heading", { name: "Work", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Work", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const taskLink = page
    .getByRole("list", { name: "All work" })
    .getByRole("link", { name: task.record.title });
  await expect(taskLink).toBeVisible();
  const taskCard = taskLink.locator("xpath=ancestor::article");
  await expect(
    taskCard.getByRole("link", { name: project.name }),
  ).toHaveAttribute("href", `/projects/${project.id}`);
  await expect(
    taskCard.getByRole("link", { name: "Original capture" }),
  ).toHaveAttribute("href", `/inbox?captureId=${task.capture.id}`);
  await taskCard.getByRole("button", { name: "Mark done" }).click();
  await expect(taskLink).toHaveCount(0);
  await page
    .getByRole("group", { name: "Task status" })
    .getByRole("button", { name: "Done" })
    .click();
  const completed = page
    .getByRole("list", { name: "All work" })
    .getByRole("link", { name: task.record.title });
  await expect(completed).toBeVisible();
  await completed
    .locator("xpath=ancestor::article")
    .getByRole("button", { name: "Reopen" })
    .click();
  await expect(completed).toHaveCount(0);
  expect(
    (await (await request.get(`/api/v1/work-items/${task.record.id}`)).json())
      .status,
  ).toBe("open");

  await page.goto(`/knowledge?projectId=${project.id}`);
  await expect(
    page.getByRole("heading", { name: "Knowledge", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Knowledge", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const noteLink = page
    .getByRole("list", { name: "Knowledge notes" })
    .getByRole("link", { name: note.record.title });
  await expect(noteLink).toBeVisible();
  const noteCard = noteLink.locator("xpath=ancestor::article");
  await expect(
    noteCard.getByRole("link", { name: "Exact original capture" }),
  ).toHaveAttribute("href", `/inbox?captureId=${note.capture.id}`);
  await expect(
    noteCard.getByRole("link", { name: project.name }),
  ).toHaveAttribute("href", `/projects/${project.id}`);
  const decisionList = page.getByRole("list", { name: "Knowledge decisions" });
  const decisionHeading = decisionList.getByRole("heading", {
    name: decision.question,
  });
  await expect(decisionHeading).toBeVisible();
  await expect(
    decisionHeading
      .locator("xpath=ancestor::article")
      .getByText(/Keep source evidence/),
  ).toBeVisible();
  const source = await request.get(`/api/v1/captures/${note.capture.id}`);
  expect((await source.json()).originalContent).toBe(note.originalContent);
  await noteLink.click();
  await expect(
    page.getByRole("heading", { name: note.record.title }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false);
});
