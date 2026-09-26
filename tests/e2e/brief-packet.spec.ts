import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

async function fileCapture(
  request: APIRequestContext,
  projectId: string,
  kind: "task" | "note",
  title: string,
  body: string,
  originalContent: string,
) {
  const captureResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent },
  });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json();
  const filedResponse = await request.post(
    `/api/v1/captures/${capture.id}/file`,
    { data: { projectId, kind, title, body } },
  );
  expect(filedResponse.status()).toBe(201);
  const filed = await filedResponse.json();
  return { capture, record: filed.record };
}

test("project brief cites saved sources and an execution packet keeps its selected snapshot", async ({
  page,
  request,
}) => {
  const token = `AutomatedBrief${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const projectResponse = await request.post("/api/v1/projects", {
    data: {
      name: `${token} project`,
      summary: "A local, source-backed brief review.",
      type: "general",
    },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const task = await fileCapture(
    request,
    project.id,
    "task",
    `${token} investigate`,
    "Review the fixture evidence and report the next step.",
    `${token} original thought is retained separately.`,
  );
  const note = await fileCapture(
    request,
    project.id,
    "note",
    `${token} context`,
    "A note selected for this packet.",
    `${token} original context source.`,
  );
  const resourceResponse = await request.post("/api/v1/resources", {
    data: {
      name: `${token} service`,
      kind: "service",
      externalUrl: `https://user:password@example.test/?token=${token}`,
    },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const linkResponse = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    { data: { resourceId: resource.id, type: "supports" } },
  );
  expect(linkResponse.status()).toBe(201);
  const link = await linkResponse.json();

  const importResponse = await request.post("/api/v1/synthetic-event-imports", {
    data: {
      scenarioId: "operations.monitor-down",
      projectId: project.id,
      resourceId: resource.id,
      occurrenceId: randomUUID(),
    },
  });
  expect(importResponse.status()).toBe(202);
  const imported = await importResponse.json();
  await expect
    .poll(
      async () => {
        const status = await request.get(
          `/api/v1/synthetic-event-imports/${imported.id}`,
        );
        return (await status.json()).state;
      },
      { timeout: 30_000 },
    )
    .toBe("succeeded");

  const briefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(briefResponse.status()).toBe(200);
  const brief = await briefResponse.json();
  expect(brief.project.id).toBe(project.id);
  expect(brief.method).toBe("deterministic-local-v1");
  expect(brief.sections.work.items).toEqual([
    expect.objectContaining({ id: task.record.id, isSynthetic: false }),
  ]);
  expect(brief.sections.knowledge.items).toEqual([
    expect.objectContaining({ id: note.record.id, isSynthetic: false }),
  ]);
  expect(brief.sections.activity.items).toEqual([
    expect.objectContaining({ isSynthetic: true }),
  ]);
  expect(brief.sections.attention.items).toEqual([
    expect.objectContaining({ isSynthetic: true }),
  ]);
  const refreshedBriefResponse = await request.get(
    `/api/v1/projects/${project.id}/brief`,
  );
  expect(refreshedBriefResponse.status()).toBe(200);
  const refreshedBrief = await refreshedBriefResponse.json();
  expect(
    refreshedBrief.sections.attention.items[0].evidence[0].recordedAt,
  ).toBe(brief.sections.attention.items[0].evidence[0].recordedAt);
  expect(brief.sections.decisions.items).toHaveLength(0);
  expect(brief.missing.acceptanceCriteria.status).toBe("not_recorded");
  for (const evidence of brief.state.evidence) {
    expect((await request.get(evidence.href)).status(), evidence.href).toBe(
      200,
    );
  }
  for (const section of Object.values(brief.sections) as {
    items: { evidence: { href: string }[] }[];
  }[]) {
    for (const fact of section.items) {
      for (const evidence of fact.evidence) {
        const response = await request.get(evidence.href);
        expect(response.status(), evidence.href).toBe(200);
      }
    }
  }
  for (const action of brief.nextActions.items) {
    expect(action.kind).toBe("inference");
    for (const evidence of action.evidence) {
      expect((await request.get(evidence.href)).status(), evidence.href).toBe(
        200,
      );
    }
  }

  const otherProjectResponse = await request.post("/api/v1/projects", {
    data: { name: `${token} elsewhere`, type: "general" },
  });
  const otherProject = await otherProjectResponse.json();
  const otherNote = await fileCapture(
    request,
    otherProject.id,
    "note",
    `${token} unrelated`,
    "Other project context.",
    `${token} unrelated original.`,
  );
  const invalidSelection = await request.post(
    `/api/v1/work-items/${task.record.id}/execution-packets`,
    { data: { selectedKnowledgeIds: [otherNote.record.id] } },
  );
  expect(invalidSelection.status()).toBe(400);

  const createPacketResponse = await request.post(
    `/api/v1/work-items/${task.record.id}/execution-packets`,
    {
      data: {
        selectedKnowledgeIds: [note.record.id],
        selectedResourceIds: [resource.id],
      },
    },
  );
  expect(createPacketResponse.status()).toBe(201);
  const packet = await createPacketResponse.json();
  expect(packet).toEqual(
    expect.objectContaining({
      schemaVersion: "execution-packet/v1",
      packetVersion: 1,
      workItemId: task.record.id,
      projectId: project.id,
      sourceCaptureId: task.capture.id,
    }),
  );
  expect(packet.snapshot.selectedKnowledge).toEqual([
    expect.objectContaining({ id: note.record.id }),
  ]);
  expect(packet.snapshot.selectedResources).toEqual([
    expect.objectContaining({
      id: resource.id,
      linkId: link.id,
      linkType: "supports",
      evidence: expect.objectContaining({
        id: link.id,
        href: `/api/v1/project-resource-links/${link.id}`,
      }),
    }),
  ]);
  expect(packet.snapshot.authorization.externalActions).toBe("not_authorized");
  const packetEvidence = [
    ...packet.snapshot.objective.evidence,
    packet.snapshot.projectContext.evidence,
    ...packet.snapshot.selectedKnowledge.map(
      (item: { evidence: { href: string } }) => item.evidence,
    ),
    ...packet.snapshot.selectedResources.map(
      (item: { evidence: { href: string } }) => item.evidence,
    ),
  ];
  for (const evidence of packetEvidence) {
    expect((await request.get(evidence.href)).status(), evidence.href).toBe(
      200,
    );
  }
  const packetJson = JSON.stringify(packet);
  expect(packetJson).not.toContain(task.capture.originalContent);
  expect(packetJson).not.toContain(note.capture.originalContent);
  expect(packetJson).not.toContain("A note selected for this packet.");
  expect(packetJson).not.toContain("user:password");
  expect(packetJson).not.toContain(`token=${token}`);

  await fileCapture(
    request,
    project.id,
    "note",
    `${token} later`,
    "Context added after packet generation.",
    `${token} later original.`,
  );
  const savedPacketResponse = await request.get(
    `/api/v1/execution-packets/${packet.id}`,
  );
  expect(savedPacketResponse.status()).toBe(200);
  expect(await savedPacketResponse.json()).toEqual(packet);
  const historyResponse = await request.get(
    `/api/v1/work-items/${task.record.id}/execution-packets?limit=1`,
  );
  expect(historyResponse.status()).toBe(200);
  expect((await historyResponse.json()).items[0].id).toBe(packet.id);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`/projects/${project.id}`);
  const briefPanel = page.getByRole("region", { name: "Project brief panel" });
  await expect(
    briefPanel.getByRole("heading", { name: "Project brief" }),
  ).toBeVisible();
  await expect(
    briefPanel.getByText("Synthetic operational fixture").first(),
  ).toBeVisible();
  await expect(page.getByText(`${token} investigate`).first()).toBeVisible();
  await page.goto(`/work-items/${task.record.id}`);
  await expect(page.getByText(task.record.title).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View exact original capture" }),
  ).toHaveAttribute("href", `/inbox?captureId=${task.capture.id}`);
  await page
    .getByRole("checkbox", { name: new RegExp(note.record.title) })
    .check();
  await page.getByRole("checkbox", { name: new RegExp(resource.name) }).check();
  const uiPacketResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/work-items/${task.record.id}/execution-packets`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create execution packet" }).click();
  const uiPacketResponse = await uiPacketResponsePromise;
  expect(uiPacketResponse.status()).toBe(201);
  const uiPacket = await uiPacketResponse.json();
  expect(uiPacket.packetVersion).toBe(2);
  await page.getByRole("link", { name: "Review execution packet" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/execution-packets/${uiPacket.id}$`),
  );
  await expect(page.getByText(task.record.title).first()).toBeVisible();
  await page.goto(`/execution-packets/${packet.id}`);
  await expect(page.getByText(task.record.title).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
