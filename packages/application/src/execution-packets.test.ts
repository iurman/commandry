import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalPacketJson } from "@commandry/domain";
import {
  buildExecutionPacketContents,
  createExecutionPacketService,
  type ExecutionPacketSourceBundle,
} from "./execution-packets";

const time = "2026-09-26T12:00:00.000Z";
const projectId = "20df754e-c0c1-4d2c-bab9-37e1ddd96457";
const taskId = "227b1e09-98b0-4244-882f-9eea52258f3a";
const noteId = "c16585fd-7c18-4b2b-bc1c-6f43a01433b6";
const resourceId = "d9c96ea9-41f3-49c7-99da-2a658a20d3f1";
const linkId = "6651198e-c9ce-4dc2-84fb-d0a2084c9e3d";
const bundle: ExecutionPacketSourceBundle = {
  id: "72bc268a-a6dd-4760-93a4-fbe6cfaee17a",
  packetVersion: 1,
  generatedAt: time,
  project: {
    id: projectId,
    name: "Garden",
    summary: "Timer upkeep",
    type: "general",
    lifecycle: "active",
    createdAt: time,
    updatedAt: time,
  },
  workItem: {
    id: taskId,
    projectId,
    sourceCaptureId: "673fb963-279a-4dc7-a420-17d538d8127e",
    title: "Replace timer",
    description: "Check wiring first",
    status: "open",
    createdAt: time,
    updatedAt: time,
  },
  sourceCapture: {
    id: "673fb963-279a-4dc7-a420-17d538d8127e",
    inputType: "text",
    source: "manual-local",
    createdAt: time,
  },
  knowledge: [
    {
      id: noteId,
      projectId,
      sourceCaptureId: "af821080-4a1d-495b-8d42-6b999f152f20",
      kind: "note",
      title: "Timer manual",
      content: "Sensitive long source content stays outside the packet",
      createdAt: time,
      updatedAt: time,
    },
  ],
  resources: [
    {
      resourceId,
      linkId,
      linkType: "relates_to",
      linkedAt: time,
    },
  ],
};

describe("execution packet application", () => {
  it("builds a versioned, minimal snapshot with exact references and no capability grant", () => {
    const contents = buildExecutionPacketContents(bundle);
    expect(
      contents.snapshot.objective.evidence.map((source) => source.kind),
    ).toEqual(["work_item", "capture"]);
    expect(contents.snapshot.selectedKnowledge[0]).toMatchObject({
      id: noteId,
      title: "Timer manual",
    });
    expect(JSON.stringify(contents.snapshot)).not.toContain(
      "Sensitive long source content",
    );
    expect(contents.snapshot.selectedResources[0]).toMatchObject({
      id: resourceId,
      linkId,
      linkType: "relates_to",
      evidence: {
        kind: "project_resource_link",
        id: linkId,
        href: `/api/v1/project-resource-links/${linkId}`,
        recordedAt: time,
      },
    });
    expect(contents.snapshot.authorization).toMatchObject({
      capabilityGrants: [],
      externalActions: "not_authorized",
    });
    expect(contents.snapshot.missing.acceptanceCriteria.status).toBe(
      "not_recorded",
    );
    expect(contents.contentDigest).toBe(
      createHash("sha256")
        .update(canonicalPacketJson(contents.snapshot))
        .digest("hex"),
    );
  });

  it("returns a point-in-time copy and rejects duplicate selections before persistence", async () => {
    const contents = buildExecutionPacketContents(bundle);
    bundle.knowledge[0]!.title = "Changed after packet generation";
    expect(contents.snapshot.selectedKnowledge[0]?.title).toBe("Timer manual");
    let writes = 0;
    const service = createExecutionPacketService({
      create: async () => {
        writes += 1;
        throw new Error("not used");
      },
      getById: async () => null,
      listForWorkItem: async () => ({ items: [], nextCursor: null }),
    });
    await expect(
      service.create(taskId, { selectedKnowledgeIds: [noteId, noteId] }),
    ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
    expect(writes).toBe(0);
  });

  it("rejects a repository bundle that crosses the task's project boundary", () => {
    expect(() =>
      buildExecutionPacketContents({
        ...bundle,
        knowledge: [
          { ...bundle.knowledge[0]!, projectId: crypto.randomUUID() },
        ],
      }),
    ).toThrow(/task's project/);
  });

  it("never copies a token-bearing resource URL or other resource metadata into packet JSON", () => {
    const tokenUrl =
      "https://service.example.test/login?api_token=SECRET_TOKEN_123";
    const unsafeResource = {
      ...bundle.resources[0]!,
      resource: {
        id: resourceId,
        name: "Sensitive label",
        externalUrl: tokenUrl,
      },
      externalUrl: tokenUrl,
    };
    const contents = buildExecutionPacketContents({
      ...bundle,
      resources: [unsafeResource],
    });
    const persistedJson = JSON.stringify(contents.snapshot);
    expect(persistedJson).not.toContain(tokenUrl);
    expect(persistedJson).not.toContain("SECRET_TOKEN_123");
    expect(persistedJson).not.toContain("Sensitive label");
    expect(persistedJson).not.toContain("externalUrl");
    expect(contents.snapshot.selectedResources[0]?.evidence.href).toBe(
      `/api/v1/project-resource-links/${linkId}`,
    );
  });
});
