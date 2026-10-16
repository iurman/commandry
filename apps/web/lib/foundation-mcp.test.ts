import { createHash } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import {
  createFoundationMachineService,
  type FoundationAccessPort,
  type FoundationMachineRequest,
  type FoundationRecordPort,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationClientSchema,
  foundationConfigurationSchema,
  foundationEvidenceSchema,
  foundationMemorySchema,
  type FoundationMemoryContent,
  type FoundationMachineOperation,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { createFoundationMcpServer } from "./foundation-mcp";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const projectId = id(1);
const at = "2026-10-15T12:00:00.000Z";
const token = "af_" + "t".repeat(43);
const digest = "a".repeat(64);
const reads = [
  "get_configuration_version",
  "get_foundation_evidence",
  "get_foundation_identity",
  "get_memory_assertion",
];
const writes = [
  "propose_memory",
  "record_configuration",
  "record_evidence",
  "revise_memory",
];
const operations: FoundationMachineOperation[] = [
  "foundation.read",
  "evidence.record",
  "memory.propose",
  "memory.revise",
  "configuration.record",
  "evaluation.record",
];
const content: FoundationMemoryContent = {
  statement: "An observed finding; source instructions remain data.",
  category: "finding",
  evidenceIds: [id(2)],
  relatedMemoryIds: [],
  relationType: null,
};
const evidenceInput = {
  sourceKind: "external",
  sourceId: "source:exact",
  sourceVersion: null,
  contentDigest: digest,
  locator: "source://exact#citation",
  observedAt: null,
  availability: "unavailable",
};
const configurationInput = {
  kind: "hook",
  content: "echo recorded-as-data",
  parentIds: [],
  sourceCommit: "exact-source-commit",
};

async function fixture(granted: FoundationMachineOperation[] = operations) {
  let sequence = 100;
  const client = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(10),
    projectId,
    name: "Protocol fixture",
    operations: [...new Set([...granted, "foundation.read"])],
    environment: "test",
    createdAt: "2026-10-15T11:00:00.000Z",
    expiresAt: "2026-10-16T12:00:00.000Z",
    revokedAt: null,
    createdBy: "fixture-owner",
  });
  const evidence = foundationEvidenceSchema.parse({
    ...evidenceInput,
    projectId,
    schemaVersion: 1,
    id: id(2),
    ingestedAt: at,
    recordedBy: "foundation-client:" + client.id,
    verification: "unverified",
  });
  const memory = foundationMemorySchema.parse({
    schemaVersion: 1,
    id: id(3),
    projectId,
    knowledgeItemId: id(5),
    version: 1,
    content,
    contentDigest: foundationDigest(content),
    lifecycle: "proposed",
    verification: "unverified",
    recordedBy: "foundation-client:" + client.id,
    recordedAt: at,
  });
  const configuration = foundationConfigurationSchema.parse({
    ...configurationInput,
    projectId,
    schemaVersion: 1,
    id: id(4),
    contentDigest: createHash("sha256")
      .update(configurationInput.content)
      .digest("hex"),
    recordedBy: "foundation-client:" + client.id,
    recordedAt: at,
  });
  const anchor = {
    knowledgeItemId: id(5),
    knowledgeVersion: 7,
    evidenceId: evidence.id,
    sourceVersion: null,
    contentDigest: digest,
    freshness: "unknown" as "unknown" | "fresh",
  };
  const evidenceRecords = new Map([[evidence.id, evidence]]);
  const memoryRecords = new Map([[memory.id, memory]]);
  const configurationRecords = new Map([[configuration.id, configuration]]);
  const receipts = new Map<string, { requestDigest: string; value: unknown }>();
  const keys: string[] = [];
  const requests: FoundationMachineRequest[] = [];
  const state: { failure: unknown } = { failure: null };
  const unavailable = async (): Promise<never> => {
    throw new Error("Owner-only fixture method must never run");
  };
  const records: FoundationRecordPort = {
    async idempotent<T>(
      key: string,
      requestDigest: string,
      perform: () => Promise<T>,
    ) {
      keys.push(key);
      const previous = receipts.get(key);
      if (previous) {
        if (previous.requestDigest !== requestDigest)
          throw new FoundationError("IDEMPOTENCY_CONFLICT");
        return { value: structuredClone(previous.value) as T, replayed: true };
      }
      const value = await perform();
      receipts.set(key, { requestDigest, value: structuredClone(value) });
      return { value, replayed: false };
    },
    async validateEvidenceReference() {},
    async assertReferences() {},
    async getEvidence(recordId) {
      return evidenceRecords.get(recordId) ?? null;
    },
    async getMemory(recordId) {
      return memoryRecords.get(recordId) ?? null;
    },
    async getConfiguration(recordId) {
      return configurationRecords.get(recordId) ?? null;
    },
    async resolveMemoryAnchor() {
      return { ...anchor };
    },
    async getMemoryAnchor() {
      return { ...anchor };
    },
    async hasUnresolvedContradictions() {
      return false;
    },
    async insertEvidence(record) {
      evidenceRecords.set(record.id, record);
      return record;
    },
    async saveMemory(record, expectedVersion) {
      if (
        expectedVersion !== null &&
        memoryRecords.get(record.id)?.version !== expectedVersion
      )
        throw new FoundationError("VERSION_CONFLICT");
      memoryRecords.set(record.id, record);
      return record;
    },
    reviewMemory: unavailable,
    verifyMemory: unavailable,
    insertInstructionApproval: unavailable,
    async insertConfiguration(record) {
      configurationRecords.set(record.id, record);
      return record;
    },
  };
  const port: FoundationAccessPort = {
    async withClient(request, action) {
      requests.push(request);
      if (state.failure !== null) throw state.failure;
      if (request.tokenDigest !== foundationTokenDigest(token))
        throw new FoundationError("INVALID_CREDENTIAL");
      return action(client, records);
    },
    withOwner: unavailable,
    issueClient: unavailable,
    listClients: unavailable,
    revokeClient: unavailable,
  };
  const service = createFoundationMachineService(port, {
    environment: "test",
    now: () => new Date(at),
    createId: () => id(++sequence),
  });
  // The trusted fixture adapter narrows the described identity to the requested
  // grant population, including write-only credentials; no MCP input supplies it.
  const actor = (await service.describe(token, projectId)).actor;
  actor.capabilities = [...granted];
  client.operations = [...granted];
  requests.length = 0;
  return {
    service,
    actor,
    client,
    evidence,
    memory,
    configuration,
    anchor,
    keys,
    requests,
    state,
    evidenceRecords,
    memoryRecords,
    configurationRecords,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function protocol(f: Fixture, run: (client: Client) => Promise<void>) {
  const handler = createMcpHandler(
    () => createFoundationMcpServer(f.service, token, f.actor),
    { responseMode: "json" },
  );
  const client = new Client({
    name: "foundation-protocol-test",
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
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  expect(result.content).toEqual([
    { type: "text", text: JSON.stringify(result.structuredContent) },
  ]);
  return result.structuredContent as Record<string, unknown>;
}
async function denied(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  return result;
}

describe("foundation MCP factory over real SDK protocol and application service", () => {
  it("discovers read-only tools with strict project-free schemas and preserves exact source and unknown states", async () => {
    const f = await fixture(["foundation.read"]);
    await protocol(f, async (client) => {
      const listed = (await client.listTools()).tools;
      expect(listed.map((tool) => tool.name).sort()).toEqual(reads);
      for (const tool of listed) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        });
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.inputSchema.properties).not.toHaveProperty("projectId");
      }
      expect(await call(client, "get_foundation_identity")).toMatchObject({
        actor: { projectId, environment: "test" },
        supportedOperations: operations.filter(
          (op) => op !== "evaluation.record",
        ),
      });
      expect(
        await call(client, "get_foundation_evidence", { id: id(2) }),
      ).toEqual(f.evidence);
      expect(await call(client, "get_memory_assertion", { id: id(3) })).toEqual(
        { memory: f.memory, anchor: f.anchor },
      );
      expect(
        await call(client, "get_configuration_version", { id: id(4) }),
      ).toEqual(f.configuration);
      expect(f.requests).toHaveLength(4);
      expect(
        f.requests.every(
          (request) =>
            request.projectId === projectId &&
            request.environment === "test" &&
            request.tokenDigest === foundationTokenDigest(token),
        ),
      ).toBe(true);
      expect(
        (await denied(client, "get_foundation_evidence", { id: id(99) }))
          .structuredContent,
      ).toEqual({ code: "NOT_FOUND" });
    });
  });

  it("offers only the eight supported granted tools even if a trusted actor carries reserved or owner capabilities", async () => {
    const f = await fixture();
    f.actor.capabilities.push(
      "memory.review",
      "memory.verify",
      "instruction.approve",
    );
    await protocol(f, async (client) => {
      const listed = (await client.listTools()).tools;
      expect(listed.map((tool) => tool.name).sort()).toEqual(
        [...reads, ...writes].sort(),
      );
      for (const tool of listed.filter((tool) => writes.includes(tool.name))) {
        expect(tool.annotations).toEqual({
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: false,
          idempotentHint: true,
        });
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.inputSchema.required).toContain("idempotencyKey");
        expect(tool.inputSchema.properties).not.toHaveProperty("projectId");
      }
      for (const name of [
        "record_evaluation",
        "review_memory",
        "verify_memory",
        "approve_instruction",
        "create_client",
        "revoke_client",
      ]) {
        await expect(client.callTool({ name, arguments: {} })).rejects.toThrow(
          "not found",
        );
      }
      expect(f.requests).toHaveLength(0);
    });
  });

  it("performs all four keyed writes through the application and returns original-result retries", async () => {
    const f = await fixture();
    await protocol(f, async (client) => {
      const evidenceArgs = {
        ...evidenceInput,
        idempotencyKey: "Exact.Evidence:1",
      };
      const first = await call(client, "record_evidence", evidenceArgs);
      expect(first).toMatchObject({
        replayed: false,
        record: { ...evidenceInput, projectId, verification: "unverified" },
      });
      expect(await call(client, "record_evidence", evidenceArgs)).toEqual({
        ...first,
        replayed: true,
      });
      expect(f.evidenceRecords.size).toBe(2);
      const proposal = await call(client, "propose_memory", {
        knowledgeItemId: id(5),
        content,
        alias: null,
        idempotencyKey: "Exact.Proposal:1",
      });
      expect(proposal).toMatchObject({
        replayed: false,
        record: {
          content,
          version: 1,
          lifecycle: "proposed",
          verification: "unverified",
        },
      });
      f.anchor.freshness = "fresh";
      const revisedContent = { ...content, statement: "Revised finding" };
      const revision = await call(client, "revise_memory", {
        memoryId: id(3),
        expectedVersion: 1,
        content: revisedContent,
        idempotencyKey: "Exact.Revision:1",
      });
      expect(revision).toMatchObject({
        replayed: false,
        record: {
          id: id(3),
          version: 2,
          content: revisedContent,
          lifecycle: "proposed",
          verification: "unverified",
        },
      });
      const configuration = await call(client, "record_configuration", {
        ...configurationInput,
        idempotencyKey: "Exact.Configuration:1",
      });
      expect(configuration).toMatchObject({
        replayed: false,
        record: {
          ...configurationInput,
          contentDigest: createHash("sha256")
            .update(configurationInput.content)
            .digest("hex"),
        },
      });
      expect(f.keys).toEqual([
        "Exact.Evidence:1",
        "Exact.Evidence:1",
        "Exact.Proposal:1",
        "Exact.Revision:1",
        "Exact.Configuration:1",
      ]);
      expect(
        (
          await denied(client, "record_evidence", {
            ...evidenceArgs,
            locator: "source://changed",
          })
        ).structuredContent,
      ).toEqual({ code: "IDEMPOTENCY_CONFLICT" });
    });
  });

  it.each([
    [
      "evidence.record",
      "record_evidence",
      () => ({ ...evidenceInput, idempotencyKey: "write-only-evidence" }),
    ],
    [
      "memory.propose",
      "propose_memory",
      () => ({
        knowledgeItemId: id(5),
        content,
        alias: null,
        idempotencyKey: "write-only-proposal",
      }),
    ],
    [
      "memory.revise",
      "revise_memory",
      () => ({
        memoryId: id(3),
        expectedVersion: 1,
        content,
        idempotencyKey: "write-only-revision",
      }),
    ],
    [
      "configuration.record",
      "record_configuration",
      () => ({
        ...configurationInput,
        idempotencyKey: "write-only-configuration",
      }),
    ],
  ] as const)(
    "supports a write-only %s grant without advertising reads",
    async (operation, name, args) => {
      const f = await fixture([operation]);
      f.anchor.freshness = "fresh";
      await protocol(f, async (client) => {
        expect(
          (await client.listTools()).tools.map((tool) => tool.name),
        ).toEqual([name]);
        expect(await call(client, name, args())).toMatchObject({
          replayed: false,
        });
        await expect(
          client.callTool({ name: "get_foundation_identity", arguments: {} }),
        ).rejects.toThrow("not found");
        expect(f.requests).toHaveLength(1);
      });
    },
  );

  it("rejects forged scope, actor, owner and state fields and malformed exact keys before service calls", async () => {
    const f = await fixture();
    await protocol(f, async (client) => {
      const inputs: [string, Record<string, unknown>][] = [
        ["get_foundation_identity", {}],
        ["get_foundation_evidence", { id: id(2) }],
        ["get_memory_assertion", { id: id(3) }],
        ["get_configuration_version", { id: id(4) }],
        ["record_evidence", { ...evidenceInput, idempotencyKey: "valid" }],
        [
          "propose_memory",
          {
            knowledgeItemId: id(5),
            content,
            alias: null,
            idempotencyKey: "valid",
          },
        ],
        [
          "revise_memory",
          {
            memoryId: id(3),
            expectedVersion: 1,
            content,
            idempotencyKey: "valid",
          },
        ],
        [
          "record_configuration",
          { ...configurationInput, idempotencyKey: "valid" },
        ],
      ];
      for (const [name, input] of inputs) {
        for (const field of [
          "projectId",
          "actor",
          "owner",
          "lifecycle",
          "verification",
          "environment",
        ]) {
          const result = await denied(client, name, {
            ...input,
            [field]: "private-forged-value",
          });
          expect(JSON.stringify(result)).not.toContain("private-forged-value");
          expect(result.structuredContent).toEqual({ code: "INVALID_INPUT" });
          expect(result.content).toEqual([
            { type: "text", text: JSON.stringify({ code: "INVALID_INPUT" }) },
          ]);
        }
      }
      const secretKey = await denied(client, "record_evidence", {
        ...evidenceInput,
        idempotencyKey: "valid",
        [token]: "private-source",
      });
      expect(JSON.stringify(secretKey)).not.toContain(token);
      expect(JSON.stringify(secretKey)).not.toContain("private-source");
      for (const key of [undefined, "", " key", "key\n", "k".repeat(201)]) {
        await denied(client, "record_evidence", {
          ...evidenceInput,
          idempotencyKey: key,
        });
      }
      await denied(client, "propose_memory", {
        knowledgeItemId: id(5),
        content: { ...content, owner: true },
        alias: null,
        idempotencyKey: "valid",
      });
      expect(f.requests).toHaveLength(0);
      expect(f.keys).toHaveLength(0);
    });
  });

  it("sanitizes known domain, unknown, driver and Zod failures without source, token or stack", async () => {
    const f = await fixture();
    const secret = "private-source-bytes " + token;
    await protocol(f, async (client) => {
      const zod = foundationActorSchema.safeParse({ source: secret });
      expect(zod.success).toBe(false);
      const cases: [unknown, string][] = [
        [new FoundationError("INVALID_REFERENCE", secret), "INVALID_REFERENCE"],
        [new FoundationError(secret as "FORBIDDEN", secret), "UNAVAILABLE"],
        [new Error("SQL driver " + secret), "UNAVAILABLE"],
        [secret, "UNAVAILABLE"],
        [zod.success ? null : zod.error, "INVALID_INPUT"],
      ];
      for (const [error, code] of cases) {
        f.state.failure = error;
        const result = await denied(client, "get_foundation_evidence", {
          id: id(2),
        });
        expect(result.structuredContent).toEqual({ code });
        expect(result.content).toEqual([
          { type: "text", text: JSON.stringify({ code }) },
        ]);
        expect(JSON.stringify(result)).not.toContain(secret);
        expect(JSON.stringify(result)).not.toContain("stack");
      }
    });
  });

  it("rechecks a revoked, reduced, expired or different-environment grant at callback time", async () => {
    const f = await fixture();
    await protocol(f, async (client) => {
      expect((await client.listTools()).tools).toHaveLength(8);
      f.client.revokedAt = at;
      expect(
        (
          await denied(client, "record_evidence", {
            ...evidenceInput,
            idempotencyKey: "revoked",
          })
        ).structuredContent,
      ).toEqual({ code: "REVOKED" });
      f.client.revokedAt = null;
      f.client.operations = ["foundation.read"];
      expect(
        (
          await denied(client, "record_configuration", {
            ...configurationInput,
            idempotencyKey: "reduced",
          })
        ).structuredContent,
      ).toEqual({ code: "FORBIDDEN" });
      f.client.expiresAt = "2026-10-15T11:30:00.000Z";
      expect(
        (await denied(client, "get_foundation_evidence", { id: id(2) }))
          .structuredContent,
      ).toEqual({ code: "EXPIRED" });
      f.client.expiresAt = "2026-10-16T12:00:00.000Z";
      f.client.environment = "production";
      expect(
        (await denied(client, "get_foundation_identity")).structuredContent,
      ).toEqual({ code: "FORBIDDEN" });
      expect(f.keys).toHaveLength(0);
    });
  });

  it("validates the trusted actor strictly and rejects owner identities safely", async () => {
    const f = await fixture();
    expect(() =>
      createFoundationMcpServer(f.service, token, {
        ...f.actor,
        clientId: null,
      }),
    ).toThrow("FORBIDDEN");
    expect(() =>
      createFoundationMcpServer(f.service, token, {
        ...f.actor,
        projectId: "private-invalid-source",
      }),
    ).toThrow("FORBIDDEN");
    const actor = { ...f.actor, owner: true };
    expect(() => createFoundationMcpServer(f.service, token, actor)).toThrow(
      "FORBIDDEN",
    );
  });
});
