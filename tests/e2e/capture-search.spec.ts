import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("filing keeps original captures and scoped search finds their records", async ({
  request,
}) => {
  const token = `AutomatedCapture${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const projectResponse = await request.post("/api/v1/projects", {
    data: { name: `Automated test journal ${token}`, type: "general" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  const originalText = `First line of a local capture.\n${token} stays exactly here.`;
  const textResponse = await request.post("/api/v1/captures", {
    data: { inputType: "text", originalContent: originalText },
  });
  expect(textResponse.status()).toBe(201);
  const textCapture = await textResponse.json();
  expect(textCapture).toEqual(
    expect.objectContaining({
      originalContent: originalText,
      source: "manual-local",
      state: "unfiled",
      filedRecord: null,
    }),
  );

  const taskResponse = await request.post(
    `/api/v1/captures/${textCapture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "task",
        title: `${token} follow-up`,
        body: "Turn the captured thought into a bounded task.",
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const filedTask = await taskResponse.json();
  expect(filedTask.capture.originalContent).toBe(originalText);
  expect(filedTask.capture.state).toBe("filed");
  expect(filedTask.record.sourceCaptureId).toBe(textCapture.id);

  const originalUrl = `https://example.invalid/reference/${token}`;
  const urlResponse = await request.post("/api/v1/captures", {
    data: { inputType: "url", originalContent: originalUrl },
  });
  expect(urlResponse.status()).toBe(201);
  const urlCapture = await urlResponse.json();
  const noteResponse = await request.post(
    `/api/v1/captures/${urlCapture.id}/file`,
    {
      data: {
        projectId: project.id,
        kind: "note",
        title: `${token} reference`,
        body: "A local reference retained with its source URL.",
      },
    },
  );
  expect(noteResponse.status()).toBe(201);
  const filedNote = await noteResponse.json();
  expect(filedNote.record.sourceCaptureId).toBe(urlCapture.id);

  const [sourceAfterFiling, workResponse, knowledgeResponse] =
    await Promise.all([
      request.get(`/api/v1/captures/${textCapture.id}`),
      request.get(`/api/v1/projects/${project.id}/work`),
      request.get(`/api/v1/projects/${project.id}/knowledge`),
    ]);
  expect(sourceAfterFiling.status()).toBe(200);
  expect((await sourceAfterFiling.json()).originalContent).toBe(originalText);
  expect(workResponse.status()).toBe(200);
  expect(knowledgeResponse.status()).toBe(200);
  expect((await workResponse.json()).items).toEqual([
    expect.objectContaining({
      id: filedTask.record.id,
      sourceCaptureId: textCapture.id,
    }),
  ]);
  expect((await knowledgeResponse.json()).items).toEqual([
    expect.objectContaining({
      id: filedNote.record.id,
      sourceCaptureId: urlCapture.id,
    }),
  ]);

  const resourceResponse = await request.post("/api/v1/resources", {
    data: { kind: "service", name: `${token} local service` },
  });
  expect(resourceResponse.status()).toBe(201);
  const resource = await resourceResponse.json();
  const linkResponse = await request.post(
    `/api/v1/projects/${project.id}/resources`,
    { data: { resourceId: resource.id, type: "supports" } },
  );
  expect(linkResponse.status()).toBe(201);

  const unrelatedProjectResponse = await request.post("/api/v1/projects", {
    data: { name: `Automated test elsewhere ${token}`, type: "general" },
  });
  expect(unrelatedProjectResponse.status()).toBe(201);
  const unrelatedProject = await unrelatedProjectResponse.json();
  const unrelatedCaptureResponse = await request.post("/api/v1/captures", {
    data: {
      inputType: "text",
      originalContent: `${token} belongs to another project`,
      projectId: unrelatedProject.id,
    },
  });
  expect(unrelatedCaptureResponse.status()).toBe(201);
  const unrelatedCapture = await unrelatedCaptureResponse.json();

  const searchResponse = await request.get(
    `/api/v1/search?q=${token}&projectId=${project.id}&limit=20`,
  );
  expect(searchResponse.status()).toBe(200);
  const scoped = await searchResponse.json();
  expect(scoped.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "task",
        id: filedTask.record.id,
        sourceCaptureId: textCapture.id,
      }),
      expect.objectContaining({
        kind: "note",
        id: filedNote.record.id,
        sourceCaptureId: urlCapture.id,
      }),
      expect.objectContaining({ kind: "resource", id: resource.id }),
    ]),
  );
  expect(
    scoped.items.every(
      (item: { projectId: string }) => item.projectId === project.id,
    ),
  ).toBe(true);
  expect(
    scoped.items.some(
      (item: { id: string }) => item.id === unrelatedCapture.id,
    ),
  ).toBe(false);
  const resourceHit = scoped.items.find(
    (item: { kind: string; id: string }) =>
      item.kind === "resource" && item.id === resource.id,
  );
  expect(resourceHit.href).toBe(`/resources/${resource.id}`);
  expect((await request.get(resourceHit.href)).status()).toBe(200);
});
