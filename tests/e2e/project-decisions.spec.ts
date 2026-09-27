import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("project decisions cite manual revisions while task list and board share one status", async ({
  page,
  request,
}) => {
  const token = `Decision${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `${token} project`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const captureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `${token} original task thought`,
    },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filingResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `${token} task`,
        body: "Review the choice",
      },
    },
  );
  expect(filingResponse.status()).toBe(201);
  const task = (await filingResponse.json()).record;
  const packetResponse = await request.post(
    `/api/v1/work-items/${task.id}/execution-packets`,
    {
      data: { selectedKnowledgeIds: [], selectedResourceIds: [] },
    },
  );
  expect(packetResponse.status()).toBe(201);
  const packet = await packetResponse.json();

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/projects/${project.id}`);
  const decisions = page.locator(
    'section[aria-labelledby="decisions-heading"]',
  );
  await decisions
    .getByLabel("Question or context")
    .fill(`${token} which approach?`);
  await decisions
    .getByLabel("Chosen outcome")
    .fill("Use a local manual review");
  await decisions
    .getByLabel(/Alternatives considered/)
    .fill("File automatically");
  await decisions
    .getByLabel("Rationale and consequences")
    .fill("Keep source provenance visible");
  await decisions.getByLabel("Decision status").selectOption("accepted");
  await decisions.getByRole("button", { name: "Record decision" }).click();
  await expect(
    decisions.getByText("Decision revision 1 saved.", { exact: false }),
  ).toBeVisible();
  await decisions.getByRole("button", { name: "Revise decision" }).click();
  await decisions
    .getByLabel("Chosen outcome")
    .fill("Use a reviewed local rule");
  await decisions.getByRole("button", { name: "Save revision" }).click();
  await expect(
    decisions.getByText("Decision revision 2 saved.", { exact: false }),
  ).toBeVisible();
  await decisions.getByRole("button", { name: "View history" }).click();
  await expect(decisions.getByText("Revision 2: accepted")).toBeVisible();
  await expect(decisions.getByText("Revision 1: accepted")).toBeVisible();

  const decisionPage = await request.get(
    `/api/v1/projects/${project.id}/decisions?limit=1`,
  );
  expect(decisionPage.status()).toBe(200);
  const decision = (await decisionPage.json()).items[0];
  const stale = await request.put(`/api/v1/decisions/${decision.id}`, {
    data: {
      question: decision.question,
      outcome: "Overwrite",
      alternatives: "",
      rationale: "Stale",
      status: "accepted",
      expectedRevision: 1,
    },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe("DECISION_STALE");

  const work = page.locator('section[aria-labelledby="work-heading"]');
  await expect(work.getByText(`${token} task`)).toBeVisible();
  await work.getByRole("button", { name: "Board" }).click();
  await expect(
    work.getByRole("region", { name: "open tasks" }).getByText(`${token} task`),
  ).toBeVisible();
  await work.getByRole("button", { name: "Mark done" }).click();
  await expect(
    work.getByRole("region", { name: "done tasks" }).getByText(`${token} task`),
  ).toBeVisible();
  await work.getByRole("button", { name: "List" }).click();
  await expect(
    work
      .getByRole("list", { name: "Project work" })
      .getByText("task / done", { exact: true }),
  ).toBeVisible();
  const audit = await request.get(
    `/api/v1/work-items/${task.id}/status-events`,
  );
  expect(audit.status()).toBe(200);
  expect((await audit.json()).items[0]).toMatchObject({
    previousStatus: "open",
    nextStatus: "done",
  });

  await page.getByRole("button", { name: "Refresh project brief" }).click();
  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  expect(brief.sections.decisions.items[0]).toMatchObject({
    id: decision.id,
    title: `${token} which approach?`,
    sourceLabel: "Manual local decision",
    isSynthetic: false,
    evidence: [
      expect.objectContaining({ href: `/api/v1/decisions/${decision.id}` }),
    ],
  });
  const savedPacket = await request.get(
    `/api/v1/execution-packets/${packet.id}`,
  );
  expect(savedPacket.status()).toBe(200);
  expect(await savedPacket.json()).toEqual(packet);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
