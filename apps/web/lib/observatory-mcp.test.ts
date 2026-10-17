import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import {
  createFoundationMachineService,
  createObservatoryReadService,
  type FoundationAccessPort,
  type ObservatoryReadAccess,
  type FoundationMachineRequest,
} from "@commandry/application";
import {
  foundationActorSchema,
  observatorySceneReadResultSchema,
  observatoryMembershipPageSchema,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationTokenDigest,
  type FoundationOperation,
} from "@commandry/domain";
import { mixedObservatoryFixture } from "../../../tests/fixtures/observatory";
import { createFoundationMcpServer } from "./foundation-mcp";
import { createObservatoryMcpReads } from "./observatory-mcp";
const token = "af_" + "x".repeat(43);
const operations: FoundationOperation[] = [
  "observatory.read",
  "observatory.signals.read",
  "observatory.security.read",
  "observatory.providers.read",
  "work.read",
];
async function fixture(grants = operations) {
  const original = mixedObservatoryFixture();
  const project = original.projects[0]!;
  const input = {
    ...original,
    resources: original.resources.map((resource) => ({
      ...resource,
      projects: [project],
    })),
  };
  const access: ObservatoryReadAccess = {
    owner: false,
    projectIds: [project.id],
    resourceIds: null,
    scopeDigest: "mcp:authorized",
    operations: [...grants],
    environment: "test",
  };
  const requests: FoundationMachineRequest[] = [];
  const actor = foundationActorSchema.parse({
    schemaVersion: 1,
    principalId: "foundation-client:00000000-0000-4000-8000-000000000001",
    clientId: "00000000-0000-4000-8000-000000000001",
    projectId: project.id,
    environment: "test",
    expiresAt: "2099-01-01T00:00:00Z",
    correlationId: "00000000-0000-4000-8000-000000000002",
    runId: null,
    resourceIds: [],
    capabilities: grants,
  });
  const make = (operation: FoundationOperation) =>
    createObservatoryReadService<FoundationMachineRequest>(
      {
        async withRead(request, callback) {
          expect(request.operation).toBe(operation);
          expect(request.projectId).toBe(project.id);
          expect(request.tokenDigest).toBe(foundationTokenDigest(token));
          requests.push(request);
          if (!access.operations.includes(operation))
            throw new FoundationError("FORBIDDEN");
          return callback(access, { readObservatory: async () => input });
        },
      },
      { environment: "test", now: () => new Date(input.now) },
    );
  const reads = createObservatoryMcpReads(make, token, actor);
  const core = createFoundationMachineService(
    {
      withClient: async () => {
        throw new Error("Unrelated foundation operation");
      },
    } as unknown as FoundationAccessPort,
    { environment: "test" },
  );
  const handler = createMcpHandler(
    () => createFoundationMcpServer(core, token, actor, { observatory: reads }),
    { responseMode: "json" },
  );
  const client = new Client({
    name: "observatory-protocol-test",
    version: "1",
  });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL("http://127.0.0.1/mcp/foundation"),
      { fetch: async (input, init) => handler.fetch(new Request(input, init)) },
    ),
  );
  return {
    client,
    handler,
    access,
    reads,
    requests,
    project,
    input,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}
describe("Observatory discovery and reads over the actual MCP SDK", () => {
  it("discovers strict project-free separately granted tools and matches the shared complete scene", async () => {
    const f = await fixture();
    try {
      const tools = (await f.client.listTools()).tools;
      expect(tools.map((t) => t.name).sort()).toEqual([
        "get_observatory_provider_explanation",
        "get_observatory_scene",
        "get_observatory_signal_evidence",
        "list_observatory_members",
        "list_observatory_relations",
      ]);
      for (const tool of tools) {
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.inputSchema.properties).not.toHaveProperty("projectId");
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
      const result = await f.client.callTool({
        name: "get_observatory_scene",
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      const dto = observatorySceneReadResultSchema.parse(
        result.structuredContent,
      );
      expect(dto.scene.population.canonicalResourceCount).toBe(91);
      expect(dto.scene.membershipIndex.resourceIds).toEqual(
        f.input.resources.map((r) => r.id).sort(),
      );
      expect(dto).toEqual(await f.reads.scene({}));
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
      const group = dto.scene.representations.find((r) => r.memberCount > 30)!;
      expect(group).toBeDefined();
      let cursor: string | null = null;
      const ids: string[] = [];
      const cursors = new Set<string>();
      do {
        const response = await f.client.callTool({
          name: "list_observatory_members",
          arguments: {
            groupId: group.id,
            scopeDigest: dto.scene.scopeDigest,
            projectionRevision: dto.scene.projectionRevision,
            limit: 7,
            cursor,
          },
        });
        expect(response.isError).not.toBe(true);
        const page = observatoryMembershipPageSchema.parse(
          response.structuredContent,
        );
        ids.push(...page.items.map((item) => item.resourceId));
        cursor = page.nextCursor;
        if (cursor) {
          expect(cursors.has(cursor)).toBe(false);
          cursors.add(cursor);
        }
      } while (cursor);
      expect(new Set(ids).size).toBe(group.memberCount);
      expect(
        f.requests.every(
          (r) => r.targetId === null && r.environment === "test",
        ),
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
  it("does not promote old grants and withholds facet authority after discovery", async () => {
    const old = await fixture(["resources.read", "work.read"]);
    try {
      expect((await old.client.listTools()).tools).toEqual([]);
    } finally {
      await old.close();
    }
    const f = await fixture(["observatory.read", "observatory.signals.read"]);
    try {
      const tools = (await f.client.listTools()).tools.map((t) => t.name);
      expect(tools).not.toContain("get_observatory_provider_explanation");
      const resourceId = f.input.resources[0]!.id;
      const denied = await f.client.callTool({
        name: "get_observatory_signal_evidence",
        arguments: { resourceId, facet: "security" },
      });
      expect(denied.isError).toBe(true);
      expect(denied.structuredContent).toEqual({ code: "FORBIDDEN" });
      f.access.operations = [];
      const revoked = await f.client.callTool({
        name: "get_observatory_scene",
        arguments: {},
      });
      expect(revoked.isError).toBe(true);
      expect(revoked.structuredContent).toEqual({ code: "FORBIDDEN" });
    } finally {
      await f.close();
    }
  });
  it("rejects body authority and stale member continuations before exposing data", async () => {
    const f = await fixture();
    try {
      for (const extra of [
        { projectId: f.project.id },
        { owner: true },
        { operations: ["observatory.security.read"] },
        { identity: { principalId: "owner" } },
      ]) {
        const response = await f.client.callTool({
          name: "get_observatory_scene",
          arguments: extra,
        });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toEqual({ code: "INVALID_INPUT" });
      }
      expect(f.requests).toHaveLength(0);
      const response = await f.client.callTool({
        name: "list_observatory_members",
        arguments: {
          groupId: "unknown",
          scopeDigest: "stale",
          projectionRevision: "stale",
        },
      });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toEqual({ code: "INVALID_REFERENCE" });
    } finally {
      await f.close();
    }
  });
});
