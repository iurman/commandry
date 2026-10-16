import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import {
  createFoundationMachineService,
  createFoundationWorkService,
  type FoundationAccessPort,
  type FoundationMachineRequest,
  type FoundationRecordPort,
  type FoundationWorkReadPort,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationClientSchema,
  type FoundationMachineOperation,
  type FoundationProjectWorkRecord,
} from "@commandry/contracts";
import { FoundationError, foundationDigest } from "@commandry/domain";
import { createFoundationMcpServer } from "./foundation-mcp";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const projectId = id(1);
const token = "af_" + "w".repeat(43);
const at = "2026-10-16T10:00:00.000Z";
const unavailable = async (): Promise<never> => {
  throw new Error("Unexpected core operation");
};

function fixture(operations: FoundationMachineOperation[] = ["work.read"]) {
  const grant = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(2),
    projectId,
    name: "Work protocol fixture",
    operations,
    environment: "test",
    createdAt: "2026-10-16T09:00:00.000Z",
    expiresAt: "2026-10-16T11:00:00.000Z",
    revokedAt: null,
    createdBy: "user:fixture",
  });
  const actor = foundationActorSchema.parse({
    schemaVersion: 1,
    principalId: "foundation-client:" + grant.id,
    clientId: grant.id,
    projectId,
    runId: null,
    resourceIds: [],
    capabilities: operations,
    environment: "test",
    expiresAt: grant.expiresAt,
    correlationId: id(3),
  });
  const records: FoundationRecordPort = {
    idempotent: unavailable,
    validateEvidenceReference: unavailable,
    assertReferences: unavailable,
    getEvidence: unavailable,
    getMemory: unavailable,
    getConfiguration: unavailable,
    resolveMemoryAnchor: unavailable,
    getMemoryAnchor: unavailable,
    hasUnresolvedContradictions: unavailable,
    insertEvidence: unavailable,
    saveMemory: unavailable,
    reviewMemory: unavailable,
    verifyMemory: unavailable,
    insertInstructionApproval: unavailable,
    insertConfiguration: unavailable,
  };
  const corePort: FoundationAccessPort = {
    withClient: async (_request, callback) => callback(grant, records),
    withOwner: unavailable,
    issueClient: unavailable,
    listClients: unavailable,
    revokeClient: unavailable,
  };
  const core = createFoundationMachineService(corePort, {
    environment: "test",
    now: () => new Date(at),
    createId: () => id(4),
  });
  const rows: FoundationProjectWorkRecord[] = [0, 1, 2].map((index) => ({
    id: id(10 + index),
    projectId: index === 1 ? id(90) : projectId,
    sourceCaptureId: id(20 + index),
    title: "Work " + index,
    description: index === 0 ? " cafe\u0301\r\n Exact " : "",
    workType: "task",
    generatedFromWorkItemId: null,
    assigneeKind: "unassigned",
    assigneeAgentId: null,
    assigneeLabel: null,
    status: index === 2 ? "done" : "open",
    priority: null,
    dueOn: null,
    contextLink: index === 1 ? { id: id(91), projectId, createdAt: at } : null,
    createdAt: new Date(Date.parse(at) - index * 1000).toISOString(),
    updatedAt: at,
  }));
  const requests: FoundationMachineRequest[] = [];
  const queries: unknown[] = [];
  const state = { failure: null as FoundationError | null };
  const port: FoundationWorkReadPort = {
    async withClient(request, callback) {
      requests.push(request);
      if (state.failure) throw state.failure;
      return callback(grant, {
        async listProjectWork(input) {
          queries.push(input);
          const start = input.cursor
            ? rows.findIndex((row) => row.id === input.cursor) + 1
            : 0;
          const items = rows.slice(start, start + input.limit);
          return {
            items,
            nextCursor:
              start + items.length < rows.length ? items.at(-1)!.id : null,
          };
        },
      });
    },
  };
  const work = createFoundationWorkService(port, {
    environment: "test",
    now: () => new Date(at),
    createId: () => id(5),
  });
  return { grant, actor, core, work, rows, requests, queries, state };
}

async function protocol(
  f: ReturnType<typeof fixture>,
  supplied: boolean,
  run: (client: Client) => Promise<void>,
) {
  const handler = createMcpHandler(
    () =>
      createFoundationMcpServer(
        f.core,
        token,
        f.actor,
        supplied ? { work: f.work } : {},
      ),
    { responseMode: "json" },
  );
  const client = new Client({
    name: "canonical-work-protocol",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("http://127.0.0.1/mcp/foundation"),
        {
          fetch: async (input, init) => handler.fetch(new Request(input, init)),
        },
      ),
    );
    await run(client);
  } finally {
    try {
      await client.close();
    } finally {
      await handler.close();
    }
  }
}

describe("separately granted canonical Work MCP", () => {
  it("offers exactly one read-only tool to a Work-only client and injects endpoint scope", async () => {
    const f = fixture();
    await protocol(f, true, async (client) => {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(["list_project_work"]);
      expect(tools[0]!.annotations?.readOnlyHint).toBe(true);
      expect(tools[0]!.description).toContain("audits work.read");
      expect(tools[0]!.inputSchema.properties).not.toHaveProperty("projectId");
      const result = await client.callTool({
        name: "list_project_work",
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(f.requests[0]).toMatchObject({
        operation: "work.read",
        projectId,
        environment: "test",
        targetId: null,
      });
      expect(f.queries[0]).toMatchObject({ projectId, limit: 25 });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
    });
  });

  it("requires both the explicit grant and actual service for discovery", async () => {
    for (const [operations, supplied] of [
      [["work.read"], false],
      [["foundation.read"], true],
    ] as const) {
      const f = fixture([...operations]);
      await protocol(f, supplied, async (client) => {
        expect(
          (await client.listTools()).tools.map((tool) => tool.name),
        ).not.toContain("list_project_work");
      });
    }
  });

  it("reports Work support only with an actual supplied service and live grant", async () => {
    for (const supplied of [false, true]) {
      const f = fixture(["foundation.read", "work.read"]);
      await protocol(f, supplied, async (client) => {
        const result = await client.callTool({
          name: "get_foundation_identity",
          arguments: {},
        });
        expect(
          (
            result.structuredContent as { supportedOperations: string[] }
          ).supportedOperations.includes("work.read"),
        ).toBe(supplied);
      });
    }
  });

  it("rejects injected authority, foreign cursor and unsupported snapshot inputs before record access", async () => {
    const f = fixture();
    await protocol(f, true, async (client) => {
      for (const args of [
        { projectId: id(90) },
        { actor: { capabilities: ["work.read"] } },
        { cursor: { projectId: id(90), afterId: id(10) } },
        { asOf: at },
        { limit: "2" },
        { limit: 101 },
      ]) {
        const result = await client.callTool({
          name: "list_project_work",
          arguments: args,
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toEqual({ code: "INVALID_INPUT" });
      }
      expect(f.queries).toEqual([]);
    });
  });

  it("continues exact canonical records and digests while retaining linked primary ownership", async () => {
    const f = fixture();
    await protocol(f, true, async (client) => {
      const first = await client.callTool({
        name: "list_project_work",
        arguments: { limit: 2 },
      });
      const page = first.structuredContent as {
        items: { work: FoundationProjectWorkRecord; contentDigest: string }[];
        nextCursor: { projectId: string; afterId: string };
        consistency: string;
        selectedAt: string;
      };
      expect(page.consistency).toBe("live");
      expect(page.selectedAt).toBe(at);
      expect(page.items.map((item) => item.work)).toEqual(f.rows.slice(0, 2));
      expect(page.items[1]!.work.projectId).toBe(id(90));
      expect(page.items[1]!.work.contextLink!.projectId).toBe(projectId);
      for (const item of page.items)
        expect(item.contentDigest).toBe(foundationDigest(item.work));
      const next = await client.callTool({
        name: "list_project_work",
        arguments: { limit: 2, cursor: page.nextCursor },
      });
      expect(next.structuredContent).toMatchObject({
        items: [{ work: f.rows[2] }],
        nextCursor: null,
      });
    });
  });

  it("rechecks revoked grants and returns bounded restart/availability errors", async () => {
    const f = fixture();
    await protocol(f, true, async (client) => {
      f.grant.revokedAt = at;
      let result = await client.callTool({
        name: "list_project_work",
        arguments: {},
      });
      expect(result.structuredContent).toEqual({ code: "REVOKED" });
      f.grant.revokedAt = null;
      f.state.failure = new FoundationError(
        "INVALID_REFERENCE",
        "Private unavailable cursor detail",
      );
      result = await client.callTool({
        name: "list_project_work",
        arguments: {},
      });
      expect(result.structuredContent).toEqual({ code: "INVALID_REFERENCE" });
      expect(JSON.stringify(result)).not.toContain("Private unavailable");
    });
  });
});
