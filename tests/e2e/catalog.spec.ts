import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("versioned API keeps one resource linked to two distinct projects", async ({
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const first = await request.post("/api/v1/projects", {
    data: {
      name: `Automated test event ${suffix}`,
      summary: "A non-software project created by browser QA.",
      type: "event",
    },
  });
  expect(first.status()).toBe(201);
  const eventProject = await first.json();
  expect(eventProject).toEqual(
    expect.objectContaining({
      name: `Automated test event ${suffix}`,
      lifecycle: "active",
      type: "event",
    }),
  );

  const second = await request.post("/api/v1/projects", {
    data: { name: `Automated test software ${suffix}`, type: "software" },
  });
  expect(second.status()).toBe(201);
  const softwareProject = await second.json();

  const createdResource = await request.post("/api/v1/resources", {
    data: {
      kind: "repository",
      name: `Automated test repository ${suffix}`,
      state: "healthy",
    },
  });
  expect(createdResource.status()).toBe(201);
  const resource = await createdResource.json();
  expect(resource.state).toBeNull();
  expect(resource.lastObservedAt).toBeNull();

  for (const projectId of [eventProject.id, softwareProject.id]) {
    const link = await request.post(`/api/v1/projects/${projectId}/resources`, {
      data: { resourceId: resource.id, type: "supports" },
    });
    expect(link.status()).toBe(201);

    const relationships = await request.get(
      `/api/v1/projects/${projectId}/resources?limit=1`,
    );
    expect(relationships.status()).toBe(200);
    const page = await relationships.json();
    expect(page.items).toEqual([
      expect.objectContaining({
        type: "supports",
        inverseType: "supported_by",
        resource: expect.objectContaining({ id: resource.id }),
      }),
    ]);
  }

  const canonical = await request.get(`/api/v1/resources/${resource.id}`);
  expect(canonical.status()).toBe(200);
  expect((await canonical.json()).id).toBe(resource.id);
});
