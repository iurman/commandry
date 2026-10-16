import { createHash } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import {
  createFoundationEvaluationService,
  createFoundationGeneralContextService,
  createFoundationInventoryService,
  createFoundationMachineService,
  createFoundationTaskProposalService,
  createFoundationWorkService,
  FoundationTaskProposalUnavailableError,
  type FoundationAccessPort,
  type FoundationMachineRequest,
  type FoundationOwnerRequest,
  type FoundationRecordPort,
  type FoundationTaskProposalPort,
  type FoundationTaskProposalRecords,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationClientSchema,
  foundationIdempotencyKeySchema,
  foundationTaskProposalToolInputSchema,
  type FoundationMachineOperation,
  type FoundationTaskProposalDetail,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { z } from "zod";
import { createFoundationMcpServer } from "./foundation-mcp";

// Real SDK transport and application services over a synthetic transaction port.
// This does not prove PostgreSQL, endpoint authentication or owner-session wiring.
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const projectId = id(1);
const at = "2026-10-16T10:00:00.000Z";
const expiresAt = "2026-10-17T00:00:00.000Z";
const token = "af_" + "p".repeat(43);
const input = {
  originalContent:
    "\ufeff  PRIVATE original cafe\u0301 \u2603 \ud83c\udf0c\r\n\t source://unverified",
  proposedTitle: "  proposed task \u2603\r\n",
  proposedBody: " PRIVATE proposed body\r\n  exact \t",
  rationale: " exact unverified rationale source://text\r\n",
  idempotencyKey: "Proposal.Exact-1",
};
const oldOperations: FoundationMachineOperation[] = [
  "foundation.read",
  "evidence.record",
  "memory.propose",
  "memory.revise",
  "configuration.record",
  "evaluation.record",
];
const unavailable = async (): Promise<never> => {
  throw new Error("Unexpected unrelated operation");
};

function fixture(operations: FoundationMachineOperation[] = ["work.propose"]) {
  let sequence = 100;
  const grant = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(2),
    projectId,
    name: "Synthetic protocol proposer",
    operations: [...operations],
    environment: "test",
    createdAt: "2026-10-16T09:00:00.000Z",
    expiresAt,
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
    capabilities: [...operations],
    environment: "test",
    expiresAt,
    correlationId: id(3),
  });
  const details = new Map<string, FoundationTaskProposalDetail>();
  const receipts = new Map<string, { digest: string; value: unknown }>();
  const requests: FoundationMachineRequest[] = [];
  const coreRequests: FoundationMachineRequest[] = [];
  const keys: string[] = [];
  const state: { failure: unknown; corruptOutput: boolean } = {
    failure: null,
    corruptOutput: false,
  };
  const coreRecords: FoundationRecordPort = {
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
  function records(
    request: FoundationMachineRequest | FoundationOwnerRequest,
  ): FoundationTaskProposalRecords {
    return {
      ...coreRecords,
      async idempotent<T>(
        key: string,
        digest: string,
        perform: () => Promise<T>,
      ) {
        keys.push(key);
        const principal =
          "tokenDigest" in request
            ? "foundation-client:" + grant.id
            : request.principalId;
        const isolatedKey = principal + ":" + request.operation + ":" + key;
        const prior = receipts.get(isolatedKey);
        if (prior) {
          if (prior.digest !== digest)
            throw new FoundationError("IDEMPOTENCY_CONFLICT");
          return { value: structuredClone(prior.value) as T, replayed: true };
        }
        const value = await perform();
        receipts.set(isolatedKey, { digest, value: structuredClone(value) });
        return { value, replayed: false };
      },
      async insertTaskProposal(detail) {
        details.set(detail.suggestion.id, structuredClone(detail));
        const result = structuredClone(detail);
        if (state.corruptOutput)
          result.capture.originalContent = "PRIVATE corrupted source";
        return result;
      },
      async getTaskProposal(proposalId) {
        return structuredClone(details.get(proposalId) ?? null);
      },
      getTaskProposalByCapture: unavailable,
      async reviewTaskProposal({ decision }) {
        if (decision.decision !== "reject")
          throw new Error("Only synthetic rejection is exercised");
        const current = details.get(decision.suggestionId)!;
        details.set(decision.suggestionId, {
          ...current,
          decision: structuredClone(decision),
        });
        return {
          schemaVersion: 1,
          proposalId: decision.suggestionId,
          captureId: decision.captureId,
          projectId: decision.provenance.projectId,
          environment: decision.provenance.environment,
          decision: structuredClone(decision),
          work: null,
        };
      },
    };
  }
  async function transaction<T>(action: () => Promise<T>) {
    const before = {
      details: structuredClone(details),
      receipts: structuredClone(receipts),
    };
    try {
      if (state.failure !== null) throw state.failure;
      return await action();
    } catch (error) {
      details.clear();
      receipts.clear();
      for (const [key, value] of before.details) details.set(key, value);
      for (const [key, value] of before.receipts) receipts.set(key, value);
      throw error;
    }
  }
  const port: FoundationTaskProposalPort = {
    async withClient(request, callback) {
      requests.push(structuredClone(request));
      expect(request.tokenDigest).toBe(foundationTokenDigest(token));
      return transaction(() => callback(grant, records(request)));
    },
    async withOwner(request, callback) {
      return transaction(() => callback(records(request)));
    },
  };
  const corePort: FoundationAccessPort = {
    async withClient(request, callback) {
      coreRequests.push(structuredClone(request));
      return callback(grant, coreRecords);
    },
    withOwner: unavailable,
    issueClient: unavailable,
    listClients: unavailable,
    revokeClient: unavailable,
  };
  const options = {
    environment: "test" as const,
    now: () => new Date(at),
    createId: () => id(sequence++),
  };
  return {
    grant,
    actor,
    details,
    receipts,
    requests,
    coreRequests,
    keys,
    state,
    core: createFoundationMachineService(corePort, options),
    proposals: createFoundationTaskProposalService(port, options),
    evaluation: createFoundationEvaluationService(
      { withClient: unavailable, withOwner: unavailable },
      options,
    ),
    inventory: createFoundationInventoryService(
      { withClient: unavailable },
      options,
    ),
    context: createFoundationGeneralContextService(
      { withClient: unavailable },
      options,
    ),
    work: createFoundationWorkService({ withClient: unavailable }, options),
  };
}
type Fixture = ReturnType<typeof fixture>;
type Extras = NonNullable<Parameters<typeof createFoundationMcpServer>[3]>;
async function protocol(
  f: Fixture,
  run: (client: Client) => Promise<void>,
  extras: Extras = { proposals: f.proposals },
) {
  const handler = createMcpHandler(
    () => createFoundationMcpServer(f.core, token, f.actor, extras),
    { responseMode: "json" },
  );
  const client = new Client({
    name: "task-proposal-protocol",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("http://127.0.0.1/mcp/foundation"),
        {
          fetch: async (url, init) => handler.fetch(new Request(url, init)),
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
async function denied(
  client: Client,
  args: Record<string, unknown>,
  code: string,
) {
  const result = await client.callTool({
    name: "propose_task",
    arguments: args,
  });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toEqual({ code });
  expect(result.content).toEqual([
    { type: "text", text: JSON.stringify({ code }) },
  ]);
  for (const secret of [
    token,
    input.originalContent,
    input.proposedBody,
    "PRIVATE",
    "stack",
  ]) {
    expect(JSON.stringify(result)).not.toContain(secret);
  }
}

describe("governed task proposal MCP through real SDK and application", () => {
  it("offers only propose_task for a proposal-only credential and a closed canonical schema", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name)).toEqual(["propose_task"]);
      const tool = tools[0]!;
      const expected = z.toJSONSchema(
        foundationTaskProposalToolInputSchema.extend({
          idempotencyKey: foundationIdempotencyKeySchema,
        }),
        { io: "input" },
      );
      expect(tool.inputSchema.properties).toEqual(expected.properties);
      expect(tool.inputSchema.required).toEqual(expected.required);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      });
      for (const text of [
        projectId,
        "environment test",
        "work.propose",
        "automatic",
        "audited",
        "immutable original",
        "actual-client",
        "unverified",
        "Owner review",
        "canonical task",
        "historical",
        "pending/unverified",
        "No instruction or execution authority",
      ]) {
        expect(tool.description).toContain(text);
      }
      expect(client.getInstructions()).toContain(
        "Task proposals require the separate work.propose grant",
      );
      for (const name of [
        "get_foundation_identity",
        "list_project_work",
        "list_foundation_evidence",
        "get_task_proposal",
        "get_raw_capture",
        "review_task_proposal",
        "approve_task",
        "verify_task",
        "assign_task",
        "execute_task",
      ]) {
        await expect(client.callTool({ name, arguments: {} })).rejects.toThrow(
          "not found",
        );
      }
      expect(f.requests).toEqual([]);
      expect(f.coreRequests).toEqual([]);
    });
  });

  it("requires an actual service and explicit grant without altering old populations", async () => {
    const absent = fixture();
    await protocol(
      absent,
      async (client) => {
        expect((await client.listTools()).tools).toEqual([]);
        expect(client.getInstructions()).not.toContain(
          "Task proposals require",
        );
      },
      {},
    );
    const notGranted = fixture(["work.read"]);
    await protocol(notGranted, async (client) => {
      expect((await client.listTools()).tools).toEqual([]);
    });
    for (const [operations, includeWork, includeProposals, count] of [
      [oldOperations, false, false, 19],
      [[...oldOperations, "work.read"], true, false, 20],
      [[...oldOperations, "work.read", "work.propose"], true, true, 21],
      [[...oldOperations, "work.read", "work.propose"], true, false, 20],
    ] as [FoundationMachineOperation[], boolean, boolean, number][]) {
      const f = fixture(operations);
      await protocol(
        f,
        async (client) => {
          const tools = (await client.listTools()).tools;
          expect(tools).toHaveLength(count);
          expect(tools.some((tool) => tool.name === "propose_task")).toBe(
            includeProposals,
          );
        },
        {
          evaluation: f.evaluation,
          inventory: f.inventory,
          context: f.context,
          ...(includeWork ? { work: f.work } : {}),
          ...(includeProposals ? { proposals: f.proposals } : {}),
        },
      );
    }
  });

  it("injects trusted project and preserves exact source bytes, digests, attribution, IDs and key", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      const result = await client.callTool({
        name: "propose_task",
        arguments: input,
      });
      expect(result.isError).not.toBe(true);
      const detail = [...f.details.values()][0]!;
      const binding = detail.suggestion.proposal.binding;
      expect(detail.capture.originalContent).toBe(input.originalContent);
      expect(detail.suggestion).toMatchObject({
        title: input.proposedTitle,
        body: input.proposedBody,
        rationale: input.rationale,
        proposedProjectId: projectId,
      });
      expect(binding).toMatchObject({
        projectId,
        environment: "test",
        clientId: f.grant.id,
        principalId: "foundation-client:" + f.grant.id,
        runtime: null,
        model: null,
        runId: null,
      });
      expect(binding.sourceDigest).toBe(
        createHash("sha256")
          .update(input.originalContent, "utf8")
          .digest("hex"),
      );
      expect(detail.suggestion.proposal.contentDigest).toBe(
        foundationDigest(binding),
      );
      expect(result.structuredContent).toEqual({
        record: {
          schemaVersion: 1,
          proposalId: detail.suggestion.id,
          captureId: detail.capture.id,
          projectId,
          environment: "test",
          clientId: f.grant.id,
          principalId: "foundation-client:" + f.grant.id,
          proposalVersion: 1,
          proposalDigest: foundationDigest(binding),
          sourceDigest: binding.sourceDigest,
          submittedAt: at,
          correlationId: binding.correlationId,
          status: "pending",
          verification: "unverified",
        },
        correlationId: binding.correlationId,
        replayed: false,
      });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
      expect(f.keys).toEqual([input.idempotencyKey]);
      expect(f.requests[0]).toEqual({
        tokenDigest: foundationTokenDigest(token),
        operation: "work.propose",
        projectId,
        environment: "test",
        targetId: null,
        correlationId: binding.correlationId,
      });
      for (const secret of [
        input.originalContent,
        input.proposedTitle,
        input.proposedBody,
        input.rationale,
        token,
      ])
        expect(JSON.stringify(result)).not.toContain(secret);
    });
  });

  it("replays the original pending submission after later terminal review and conflicts on changed payload", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      const first = await client.callTool({
        name: "propose_task",
        arguments: input,
      });
      const detail = [...f.details.values()][0]!;
      await f.proposals.reviewTaskProposal(
        { principalId: "user:fixture", expiresAt },
        "review-later",
        {
          projectId,
          proposalId: detail.suggestion.id,
          expectedVersion: 1,
          expectedProposalDigest: detail.suggestion.proposal.contentDigest,
          expectedSourceDigest: detail.suggestion.proposal.binding.sourceDigest,
          decision: "reject",
        },
      );
      expect(f.details.get(detail.suggestion.id)!.decision?.decision).toBe(
        "reject",
      );
      const retried = await client.callTool({
        name: "propose_task",
        arguments: input,
      });
      expect(retried.structuredContent).toEqual({
        ...(first.structuredContent as Record<string, unknown>),
        replayed: true,
      });
      expect(retried.structuredContent).toMatchObject({
        record: {
          proposalId: detail.suggestion.id,
          captureId: detail.capture.id,
          status: "pending",
          verification: "unverified",
        },
      });
      for (const field of [
        "originalContent",
        "proposedTitle",
        "proposedBody",
        "rationale",
      ] as const)
        await denied(
          client,
          { ...input, [field]: input[field] + "changed" },
          "IDEMPOTENCY_CONFLICT",
        );
      expect(f.details.size).toBe(1);
    });
  });

  it("rejects all caller authority, digests, citations, owner commands and invalid keys before the port", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      for (const field of [
        "projectId",
        "environment",
        "actor",
        "principalId",
        "client",
        "clientId",
        "source",
        "sourceDigest",
        "proposalDigest",
        "runtime",
        "model",
        "run",
        "runId",
        "approval",
        "approvalId",
        "citation",
        "citations",
        "owner",
        "decision",
        "review",
        "verification",
        "status",
        "assignment",
        "execute",
        "unknown",
        token,
      ]) {
        await denied(
          client,
          { ...input, [field]: "PRIVATE forged data" },
          "INVALID_INPUT",
        );
      }
      for (const idempotencyKey of [
        undefined,
        null,
        "",
        " key",
        "key\n",
        "k".repeat(201),
        1,
      ])
        await denied(client, { ...input, idempotencyKey }, "INVALID_INPUT");
      for (const invalid of [
        { originalContent: " " },
        { originalContent: "a\u0000b" },
        { originalContent: "\ud800" },
        { proposedTitle: " " },
        { proposedTitle: "x".repeat(201) },
        { proposedBody: null },
        { rationale: " " },
        { originalContent: { text: "PRIVATE" } },
      ])
        await denied(client, { ...input, ...invalid }, "INVALID_INPUT");
      expect(f.requests).toEqual([]);
      expect(f.details.size).toBe(0);
      expect(f.receipts.size).toBe(0);
    });
  });

  it.each(["revocation", "expiry", "capability", "environment"])(
    "rechecks live %s after discovery",
    async (change) => {
      const f = fixture();
      await protocol(f, async (client) => {
        expect(
          (await client.listTools()).tools.map((tool) => tool.name),
        ).toEqual(["propose_task"]);
        if (change === "revocation") f.grant.revokedAt = at;
        if (change === "expiry") f.grant.expiresAt = "2026-10-16T09:59:59.000Z";
        if (change === "capability") f.grant.operations = ["foundation.read"];
        if (change === "environment") f.grant.environment = "production";
        await denied(
          client,
          input,
          change === "revocation"
            ? "REVOKED"
            : change === "expiry"
              ? "EXPIRED"
              : "FORBIDDEN",
        );
        expect(f.keys).toEqual([]);
        expect(f.details.size).toBe(0);
      });
    },
  );

  it("redacts unavailable, unknown and corrupted actual service output", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      for (const failure of [
        new FoundationTaskProposalUnavailableError(),
        new Error("PRIVATE source " + token),
        "PRIVATE hostile source",
        new FoundationError("PRIVATE" as "FORBIDDEN", token),
      ]) {
        f.state.failure = failure;
        await denied(client, input, "UNAVAILABLE");
      }
      f.state.failure = null;
      f.state.corruptOutput = true;
      await denied(client, input, "UNAVAILABLE");
      expect(f.details.size).toBe(0);
      expect(f.receipts.size).toBe(0);
    });
  });

  it("adds identity support only for an actual service and the current grant", async () => {
    for (const supplied of [false, true]) {
      const f = fixture(["foundation.read", "work.propose"]);
      await protocol(
        f,
        async (client) => {
          async function supported() {
            const result = await client.callTool({
              name: "get_foundation_identity",
              arguments: {},
            });
            expect(result.isError).not.toBe(true);
            return (
              result.structuredContent as { supportedOperations: string[] }
            ).supportedOperations;
          }
          expect(
            (await supported()).filter(
              (operation) => operation === "work.propose",
            ),
          ).toHaveLength(supplied ? 1 : 0);
          f.grant.operations = ["foundation.read"];
          expect(await supported()).not.toContain("work.propose");
          f.grant.operations.push("work.propose");
          expect(
            (await supported()).filter(
              (operation) => operation === "work.propose",
            ),
          ).toHaveLength(supplied ? 1 : 0);
          expect(await supported()).not.toContain("work.proposal.read");
          expect(await supported()).not.toContain("work.proposal.review");
        },
        supplied ? { proposals: f.proposals } : {},
      );
    }
  });
});
