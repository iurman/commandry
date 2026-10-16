import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import {
  createFoundationMachineService,
  type FoundationAccessPort,
  type FoundationRecordPort,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationClientSchema,
  type FoundationMachineOperation,
} from "@commandry/contracts";
import { FoundationError } from "@commandry/domain";
import { createFoundationMcpServer } from "./foundation-mcp";

type ImprovementTransport = NonNullable<
  NonNullable<Parameters<typeof createFoundationMcpServer>[3]>["improvement"]
>;
type FindingTransport = NonNullable<
  NonNullable<Parameters<typeof createFoundationMcpServer>[3]>["findings"]
>;
type OnboardingTransport = NonNullable<
  NonNullable<Parameters<typeof createFoundationMcpServer>[3]>["onboarding"]
>;

// Real SDK discovery/dispatch checks. Feature stubs deliberately do not claim
// application reference validation, actual HTTP authentication or SQL behavior.
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const projectId = id(1);
const token = "af_" + "w".repeat(43);
const at = "2026-10-16T12:00:00.000Z";
const coreSupport = [
  "foundation.read",
  "evidence.record",
  "memory.propose",
  "memory.revise",
  "configuration.record",
];
const unavailable = async (): Promise<never> => {
  throw new Error("Unexpected unrelated fixture operation");
};
const input = {
  candidateConfigurationId: id(2),
  baselineConfigurationId: id(3),
  definitionId: id(4),
  motivations: [{ assessmentId: id(5), assessmentVersion: 2 }],
  conditionConfigurations: [
    { condition: "baseline", role: "baseline", configurationIds: [id(3)] },
    { condition: "candidate", role: "candidate", configurationIds: [id(2)] },
  ],
  judgeConfigurationIds: [id(6)],
  rationale: "A reviewed failure needs a controlled regression.",
  hypothesis: "The candidate preserves scope.",
  idempotencyKey: "Exact.Improvement-1",
};

function fixture(operations: FoundationMachineOperation[]) {
  const grant = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(10),
    name: "Protocol fixture",
    projectId,
    environment: "test",
    operations,
    createdBy: "user:fixture",
    createdAt: at,
    expiresAt: "2026-10-17T12:00:00.000Z",
    revokedAt: null,
  });
  const actor = foundationActorSchema.parse({
    schemaVersion: 1,
    principalId: "foundation-client:" + grant.id,
    clientId: grant.id,
    runId: null,
    projectId,
    resourceIds: [],
    environment: "test",
    capabilities: operations,
    correlationId: id(11),
    expiresAt: grant.expiresAt,
  });
  const records: FoundationRecordPort = {
    idempotent: unavailable,
    assertReferences: unavailable,
    validateEvidenceReference: unavailable,
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
  const port: FoundationAccessPort = {
    withClient: async (_request, action) => action(grant, records),
    withOwner: unavailable,
    issueClient: unavailable,
    listClients: unavailable,
    revokeClient: unavailable,
  };
  const core = createFoundationMachineService(port, {
    environment: "test",
    now: () => new Date(at),
    createId: () => id(12),
  });
  const improvement = {
    propose: vi.fn(async () => ({
      record: { id: id(20) },
      replayed: false,
      correlationId: id(21),
    })),
    get: vi.fn(async () => ({ id: id(20), advisory: "fixture only" })),
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
  };
  const findings = {
    submitFindingProposal: vi.fn(async () => ({
      record: {
        proposalId: id(30),
        status: "pending",
        verification: "unverified",
      },
      replayed: false,
      correlationId: id(31),
    })),
    getFindingProposal: vi.fn(async () => ({ proposalId: id(30) })),
  };
  const onboarding = {
    propose: vi.fn(async () => ({
      record: { id: id(40) },
      replayed: false,
      correlationId: id(41),
    })),
    get: vi.fn(async () => ({ proposal: { id: id(40) } })),
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
  };
  return { actor, core, improvement, findings, onboarding };
}

async function protocol(
  f: ReturnType<typeof fixture>,
  run: (client: Client) => Promise<void>,
  supplied = true,
) {
  // Return values are intentionally fixture shapes; production services own
  // strict result validation, exercised separately against real repositories.
  const extras = supplied
    ? {
        improvement: f.improvement as unknown as ImprovementTransport,
        findings: f.findings as unknown as FindingTransport,
        onboarding: f.onboarding as unknown as OnboardingTransport,
      }
    : undefined;
  const handler = createMcpHandler(
    () => createFoundationMcpServer(f.core, token, f.actor, extras),
    { responseMode: "json" },
  );
  const client = new Client({
    name: "workflow-protocol-fixture",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("http://127.0.0.1/mcp/foundation"),
        {
          fetch: async (request, init) =>
            handler.fetch(new Request(request, init)),
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

describe("governed workflow MCP registration", () => {
  it("exposes local inventory intentions with separate read/propose grants and no owner apply", async () => {
    const f = fixture(["onboarding.read", "onboarding.propose"]);
    const body = {
      target: {
        mode: "create",
        name: "Build host",
        subtype: null,
        externalUrl: "https://host.example.test/",
        identity: {
          namespace: "provider",
          authority: "owner-account",
          externalId: "host-123",
          assurance: "owner_asserted",
        },
      },
      relationship: "supports",
      rationale: "Propose inventory for owner inspection.",
      evidenceIds: [],
      idempotencyKey: "Onboarding.Exact-1",
    };
    await protocol(f, async (client) => {
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "get_host_onboarding",
        "list_host_onboardings",
        "propose_host_onboarding",
      ]);
      for (const tool of tools)
        expect(tool.inputSchema.additionalProperties).toBe(false);
      const created = await client.callTool({
        name: "propose_host_onboarding",
        arguments: body,
      });
      expect(created.isError).not.toBe(true);
      const { idempotencyKey, ...inputBody } = body;
      expect(f.onboarding.propose).toHaveBeenCalledWith(token, idempotencyKey, {
        ...inputBody,
        projectId,
      });
      await client.callTool({
        name: "propose_host_onboarding",
        arguments: { ...body, target: { mode: "reuse", resourceId: id(42) } },
      });
      expect(f.onboarding.propose).toHaveBeenLastCalledWith(
        token,
        idempotencyKey,
        {
          ...inputBody,
          target: { mode: "reuse", resourceId: id(42) },
          projectId,
        },
      );
      await client.callTool({
        name: "get_host_onboarding",
        arguments: { id: id(40) },
      });
      expect(f.onboarding.get).toHaveBeenCalledWith(token, {
        id: id(40),
        projectId,
      });
      await client.callTool({
        name: "list_host_onboardings",
        arguments: { limit: 3, cursor: "opaque" },
      });
      expect(f.onboarding.list).toHaveBeenCalledWith(token, {
        projectId,
        limit: 3,
        cursor: "opaque",
      });
      for (const field of [
        "projectId",
        "inventoryReviewed",
        "approved",
        "recordedBy",
      ]) {
        const denied = await client.callTool({
          name: "propose_host_onboarding",
          arguments: { ...body, [field]: "PRIVATE_AUTHORITY" },
        });
        expect(denied.structuredContent).toEqual({ code: "INVALID_INPUT" });
      }
      expect(f.onboarding.propose).toHaveBeenCalledTimes(2);
    });
    await protocol(fixture(["onboarding.read"]), async (client) => {
      expect(
        (await client.listTools()).tools.map((tool) => tool.name).sort(),
      ).toEqual(["get_host_onboarding", "list_host_onboardings"]);
    });
    await protocol(fixture(["onboarding.propose"]), async (client) => {
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        ["propose_host_onboarding"],
      );
    });
    await protocol(
      f,
      async (client) => {
        expect((await client.listTools()).tools).toEqual([]);
      },
      false,
    );
  });
  it("binds cited finding writes and reads to the intrinsic project without owner tools", async () => {
    const f = fixture(["finding.propose", "finding.read"]);
    const finding = {
      originalContent: "  Original observation\r\n<script>untrusted()</script>",
      proposedTitle: "Retry observation",
      proposedBody: "Proposed finding remains unverified.",
      rationale: "A whole-source citation supports review.",
      citations: [
        {
          evidenceId: id(32),
          sourceKind: "capture",
          sourceId: id(33),
          sourceVersion: null,
          contentDigest: "a".repeat(64),
          selection: "whole_source",
        },
      ],
      idempotencyKey: "Finding.Exact-1",
    };
    await protocol(f, async (client) => {
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "get_finding",
        "propose_finding",
      ]);
      expect(tools[0]!.inputSchema.additionalProperties).toBe(false);
      await client.callTool({ name: "propose_finding", arguments: finding });
      const { idempotencyKey, ...body } = finding;
      expect(f.findings.submitFindingProposal).toHaveBeenCalledWith(
        token,
        idempotencyKey,
        { ...body, projectId },
      );
      await client.callTool({ name: "get_finding", arguments: { id: id(30) } });
      expect(f.findings.getFindingProposal).toHaveBeenCalledWith(token, {
        projectId,
        id: id(30),
      });
      const invalid = await client.callTool({
        name: "propose_finding",
        arguments: { ...finding, projectId: id(99) },
      });
      expect(invalid.structuredContent).toEqual({ code: "INVALID_INPUT" });
      expect(f.findings.submitFindingProposal).toHaveBeenCalledTimes(1);
      const authority = await client.callTool({
        name: "propose_finding",
        arguments: { ...finding, verification: "independently_verified" },
      });
      expect(authority.structuredContent).toEqual({ code: "INVALID_INPUT" });
      expect(f.findings.submitFindingProposal).toHaveBeenCalledTimes(1);
    });
    await protocol(fixture(["finding.read"]), async (client) => {
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        ["get_finding"],
      );
    });
    await protocol(fixture(["finding.propose"]), async (client) => {
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        ["propose_finding"],
      );
    });
  });

  it("offers exact separate read/propose tools and no owner actions", async () => {
    const f = fixture(["improvement.read", "improvement.propose"]);
    await protocol(f, async (client) => {
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "get_improvement",
        "list_improvements",
        "propose_improvement",
      ]);
      const proposal = tools.find(
        (tool) => tool.name === "propose_improvement",
      )!;
      expect(proposal.inputSchema.additionalProperties).toBe(false);
      expect(proposal.inputSchema.properties).not.toHaveProperty("projectId");
      expect(proposal.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      await client.callTool({ name: "propose_improvement", arguments: input });
      const { idempotencyKey, ...body } = input;
      expect(f.improvement.propose).toHaveBeenCalledWith(
        token,
        idempotencyKey,
        { ...body, projectId },
      );
      await client.callTool({
        name: "get_improvement",
        arguments: { id: id(20) },
      });
      expect(f.improvement.get).toHaveBeenCalledWith(token, {
        projectId,
        id: id(20),
      });
      await client.callTool({
        name: "list_improvements",
        arguments: { limit: 7, cursor: "opaque-continuation" },
      });
      expect(f.improvement.list).toHaveBeenCalledWith(token, {
        projectId,
        limit: 7,
        cursor: "opaque-continuation",
      });
    });
  });

  it.each(["projectId", "recordedBy", "approved", "runtime"])(
    "rejects caller authority field %s without dispatch",
    async (field) => {
      const f = fixture(["improvement.propose"]);
      await protocol(f, async (client) => {
        const result = await client.callTool({
          name: "propose_improvement",
          arguments: { ...input, [field]: "PRIVATE_AUTHORITY" },
        });
        expect(result.structuredContent).toEqual({ code: "INVALID_INPUT" });
        expect(JSON.stringify(result)).not.toContain("PRIVATE_AUTHORITY");
        expect(f.improvement.propose).not.toHaveBeenCalled();
      });
    },
  );

  it("preserves the controlled-comparison refinement after adding the key", async () => {
    const f = fixture(["improvement.propose"]);
    await protocol(f, async (client) => {
      const result = await client.callTool({
        name: "propose_improvement",
        arguments: {
          ...input,
          candidateConfigurationId: input.baselineConfigurationId,
        },
      });
      expect(result.structuredContent).toEqual({ code: "INVALID_INPUT" });
      expect(f.improvement.propose).not.toHaveBeenCalled();
    });
  });

  it("requires both the explicit grant and supplied service for discovery", async () => {
    const f = fixture(["foundation.read"]);
    await protocol(f, async (client) => {
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name)).not.toContain(
        "propose_improvement",
      );
      const identity = await client.callTool({
        name: "get_foundation_identity",
        arguments: {},
      });
      expect(identity.structuredContent).toHaveProperty(
        "supportedOperations",
        coreSupport,
      );
    });
    await protocol(
      fixture(["improvement.propose"]),
      async (client) => {
        expect((await client.listTools()).tools).toEqual([]);
      },
      false,
    );
  });

  it("preserves core support metadata, gates optional operations and sanitizes service errors", async () => {
    const f = fixture([
      "foundation.read",
      "improvement.read",
      "improvement.propose",
    ]);
    await protocol(f, async (client) => {
      const identity = await client.callTool({
        name: "get_foundation_identity",
        arguments: {},
      });
      expect(identity.structuredContent).toHaveProperty("supportedOperations", [
        ...coreSupport,
        "improvement.read",
        "improvement.propose",
      ]);
      f.improvement.propose.mockRejectedValueOnce(
        new FoundationError("REVOKED", "PRIVATE_TOKEN"),
      );
      const denied = await client.callTool({
        name: "propose_improvement",
        arguments: input,
      });
      expect(denied.structuredContent).toEqual({ code: "REVOKED" });
      expect(JSON.stringify(denied)).not.toContain("PRIVATE_TOKEN");
      f.improvement.propose.mockRejectedValueOnce(
        new Error("PRIVATE_DATABASE_ERROR"),
      );
      const unavailableResult = await client.callTool({
        name: "propose_improvement",
        arguments: input,
      });
      expect(unavailableResult.structuredContent).toEqual({
        code: "UNAVAILABLE",
      });
      expect(JSON.stringify(unavailableResult)).not.toContain(
        "PRIVATE_DATABASE_ERROR",
      );
    });
  });
});
