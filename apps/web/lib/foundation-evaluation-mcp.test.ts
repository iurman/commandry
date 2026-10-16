import { createHash } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import {
  createFoundationEvaluationService,
  createFoundationMachineService,
  type FoundationAccessPort,
  type FoundationEvaluationPort,
  type FoundationEvaluationRecords,
  type FoundationMachineRequest,
  type FoundationRecordPort,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationClientSchema,
  type FoundationAssessment,
  type FoundationConfiguration,
  type FoundationEvaluationDefinition,
  type FoundationEvaluationTrial,
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
const foreignProjectId = id(2);
const at = "2026-10-15T12:00:00.000Z";
const token = "af_" + "e".repeat(43);
const fixtureDigest = "a".repeat(64);
const artifactDigest = "b".repeat(64);
const rubricDigest = "c".repeat(64);
const coreOperations = [
  "foundation.read",
  "evidence.record",
  "memory.propose",
  "memory.revise",
  "configuration.record",
] as const;
const coreReads = [
  "get_configuration_version",
  "get_foundation_evidence",
  "get_foundation_identity",
  "get_memory_assertion",
];
const coreWrites = [
  "propose_memory",
  "record_configuration",
  "record_evidence",
  "revise_memory",
];
const evaluationReads = [
  "get_evaluation_assessment",
  "get_evaluation_definition",
  "get_evaluation_report",
  "get_evaluation_trial",
];
const evaluationWrites = [
  "record_evaluation_assessment",
  "record_evaluation_definition",
  "record_evaluation_trial",
];
const definitionInput = {
  schemaVersion: 1,
  id: id(10),
  version: 1,
  name: "External observation comparison",
  configurationIds: [id(3)],
  cases: [{ id: "case", fixtureDigest, rubricDigest, hardGates: ["privacy"] }],
  conditions: ["with", "without"],
  repetitions: 2,
  disclosure: "local_only",
};
const trialInput = {
  schemaVersion: 1,
  id: id(20),
  attemptId: id(120),
  definitionId: id(10),
  caseId: "case",
  condition: "with",
  repetition: 1,
  configurationIds: [id(3)],
  model: "External model snapshot",
  runtime: "External runtime snapshot",
  inputDigest: fixtureDigest,
  artifactDigests: [artifactDigest],
  outcome: "completed",
  usage: { inputTokens: null, outputTokens: null },
  recordedAt: at,
};
const assessmentInput = {
  schemaVersion: 1,
  id: id(30),
  trialId: id(20),
  version: 1,
  trialArtifactDigest: artifactDigest,
  rubricDigest,
  judgeConfigurationId: id(4),
  checks: [{ id: "privacy", result: "pass", hardGate: true }],
  uncertainty: null,
  reviewStatus: "unreviewed",
  recordedAt: at,
};
const reportInput = {
  definitionId: id(10),
  conditionConfigurations: [
    { condition: "with", configurationIds: [id(3)] },
    { condition: "without", configurationIds: [id(3)] },
  ],
  judgeConfigurationIds: [id(4)],
};
const writeInputs: [string, Record<string, unknown>][] = [
  ["record_evaluation_definition", definitionInput],
  ["record_evaluation_trial", trialInput],
  ["record_evaluation_assessment", assessmentInput],
];
const readInputs: [string, Record<string, unknown>][] = [
  ["get_evaluation_definition", { id: id(10) }],
  ["get_evaluation_trial", { id: id(20) }],
  ["get_evaluation_assessment", { id: id(30) }],
  ["get_evaluation_report", reportInput],
];

function fixture(
  granted: FoundationMachineOperation[] = [
    "foundation.read",
    "evaluation.record",
  ],
) {
  let sequence = 1000;
  const client = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(5),
    projectId,
    name: "Evaluation protocol fixture",
    operations: [...granted],
    environment: "test",
    createdAt: "2026-10-15T11:00:00.000Z",
    expiresAt: "2026-10-16T12:00:00.000Z",
    revokedAt: null,
    createdBy: "fixture-owner",
  });
  const actor = foundationActorSchema.parse({
    schemaVersion: 1,
    principalId: "foundation-client:" + client.id,
    clientId: client.id,
    runId: null,
    capabilities: [...granted],
    projectId,
    resourceIds: [],
    environment: "test",
    expiresAt: client.expiresAt,
    correlationId: id(99),
  });
  const definitions = new Map<string, FoundationEvaluationDefinition>();
  const trials = new Map<string, FoundationEvaluationTrial>();
  const assessments = new Map<string, FoundationAssessment>();
  const configurations = new Map<string, FoundationConfiguration>();
  for (const n of [3, 4]) {
    const content = "Synthetic configuration " + n;
    configurations.set(id(n), {
      schemaVersion: 1,
      id: id(n),
      projectId,
      kind: "settings",
      content,
      contentDigest: createHash("sha256").update(content).digest("hex"),
      parentIds: [],
      sourceCommit: null,
      recordedAt: at,
      recordedBy: "fixture-owner",
    });
  }
  const receipts = new Map<
    string,
    { requestDigest: string; valueDigest: string; value: unknown }
  >();
  const requests: FoundationMachineRequest[] = [];
  const state: { failure: unknown } = { failure: null };
  const unavailable = async (): Promise<never> => {
    throw new Error("This fixture operation must never run");
  };
  function check(request: FoundationMachineRequest) {
    requests.push(structuredClone(request));
    if (state.failure !== null) throw state.failure;
    if (request.tokenDigest !== foundationTokenDigest(token))
      throw new FoundationError("INVALID_CREDENTIAL");
  }
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
  const corePort: FoundationAccessPort = {
    async withClient(request, action) {
      check(request);
      return action(client, coreRecords);
    },
    withOwner: unavailable,
    issueClient: unavailable,
    listClients: unavailable,
    revokeClient: unavailable,
  };
  function records(
    request: FoundationMachineRequest,
  ): FoundationEvaluationRecords {
    function get<T extends { projectId: string }>(
      map: Map<string, T>,
      recordId: string,
    ) {
      const record = map.get(recordId);
      return structuredClone(
        record?.projectId === request.projectId ? record : null,
      );
    }
    function insert<T extends { id: string; projectId: string }>(
      map: Map<string, T>,
      record: T,
    ) {
      if (record.projectId !== request.projectId)
        throw new FoundationError("FORBIDDEN");
      if (map.has(record.id)) throw new FoundationError("VERSION_CONFLICT");
      map.set(record.id, structuredClone(record));
      return structuredClone(record);
    }
    return {
      async idempotent<T>(
        key: string,
        requestDigest: string,
        perform: () => Promise<T>,
      ) {
        const scopedKey = client.id + ":" + request.operation + ":" + key;
        const previous = receipts.get(scopedKey);
        if (previous) {
          if (previous.requestDigest !== requestDigest)
            throw new FoundationError("IDEMPOTENCY_CONFLICT");
          if (previous.valueDigest !== foundationDigest(previous.value))
            throw new FoundationError("INVALID_REFERENCE");
          return {
            value: structuredClone(previous.value) as T,
            replayed: true,
          };
        }
        const value = await perform();
        receipts.set(scopedKey, {
          requestDigest,
          valueDigest: foundationDigest(value),
          value: structuredClone(value),
        });
        return { value: structuredClone(value), replayed: false };
      },
      async getDefinition(recordId) {
        return get(definitions, recordId);
      },
      async getTrial(recordId) {
        return get(trials, recordId);
      },
      async getAssessment(recordId) {
        return get(assessments, recordId);
      },
      async getConfiguration(recordId) {
        return get(configurations, recordId);
      },
      async getReportPopulation(definitionId) {
        const selected = [...trials.values()].filter(
          (row) =>
            row.projectId === request.projectId &&
            row.definitionId === definitionId,
        );
        const ids = new Set(selected.map((row) => row.id));
        return structuredClone({
          trials: selected,
          assessments: [...assessments.values()].filter(
            (row) =>
              row.projectId === request.projectId && ids.has(row.trialId),
          ),
          configurations: [...configurations.values()].filter(
            (row) => row.projectId === request.projectId,
          ),
        });
      },
      async insertDefinition(record) {
        return insert(definitions, record);
      },
      async insertTrial(record) {
        if (
          [...trials.values()].some((row) => row.attemptId === record.attemptId)
        )
          throw new FoundationError("VERSION_CONFLICT");
        return insert(trials, record);
      },
      async insertAssessment(record) {
        if (
          [...assessments.values()].some(
            (row) =>
              row.trialId === record.trialId && row.version === record.version,
          )
        )
          throw new FoundationError("VERSION_CONFLICT");
        return insert(assessments, record);
      },
    };
  }
  const evaluationPort: FoundationEvaluationPort = {
    async withClient(request, action) {
      check(request);
      const before = structuredClone({
        definitions,
        trials,
        assessments,
        receipts,
      });
      try {
        return await action(client, records(request));
      } catch (error) {
        for (const [current, previous] of [
          [definitions, before.definitions],
          [trials, before.trials],
          [assessments, before.assessments],
          [receipts, before.receipts],
        ] as const) {
          current.clear();
          for (const [key, value] of previous) {
            // Each paired map keeps its own canonical record type.
            (current as Map<string, unknown>).set(key, value);
          }
        }
        throw error;
      }
    },
    withOwner: unavailable,
  };
  const options = {
    environment: "test" as const,
    now: () => new Date(at),
    createId: () => id(sequence++),
  };
  return {
    core: createFoundationMachineService(corePort, options),
    evaluation: createFoundationEvaluationService(evaluationPort, options),
    actor,
    client,
    requests,
    state,
    definitions,
    trials,
    assessments,
    receipts,
  };
}

type Fixture = ReturnType<typeof fixture>;
async function protocol(
  f: Fixture,
  run: (client: Client) => Promise<void>,
  supplied = true,
) {
  const handler = createMcpHandler(
    () =>
      createFoundationMcpServer(
        f.core,
        token,
        f.actor,
        supplied ? { evaluation: f.evaluation } : undefined,
      ),
    { responseMode: "json" },
  );
  const client = new Client({
    name: "evaluation-protocol-test",
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
  args: Record<string, unknown>,
  code: string,
) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toEqual({ code });
  expect(result.content).toEqual([
    { type: "text", text: JSON.stringify({ code }) },
  ]);
  expect(JSON.stringify(result)).not.toContain(token);
  expect(JSON.stringify(result)).not.toContain("private-forged-value");
  expect(JSON.stringify(result)).not.toContain("stack");
}
async function seed(client: Client) {
  for (const [name, input] of writeInputs)
    await call(client, name, { ...input, idempotencyKey: name });
}

describe("evaluation MCP with real SDK transport and application services", () => {
  it.each([
    {
      grants: ["foundation.read"],
      supplied: true,
      names: [...coreReads, ...evaluationReads],
    },
    { grants: ["evaluation.record"], supplied: true, names: evaluationWrites },
    {
      grants: [...coreOperations, "evaluation.record"],
      supplied: true,
      names: [
        ...coreReads,
        ...coreWrites,
        ...evaluationReads,
        ...evaluationWrites,
      ],
    },
    {
      grants: [...coreOperations, "evaluation.record"],
      supplied: false,
      names: [...coreReads, ...coreWrites],
    },
    { grants: ["evaluation.record"], supplied: false, names: [] },
  ] as {
    grants: FoundationMachineOperation[];
    supplied: boolean;
    names: string[];
  }[])(
    "discovers only granted implementations for $grants with extras $supplied",
    async ({ grants, supplied, names }) => {
      const f = fixture(grants);
      await protocol(
        f,
        async (client) => {
          const tools = (await client.listTools()).tools;
          expect(tools.map((tool) => tool.name).sort()).toEqual(
            [...names].sort(),
          );
          for (const tool of tools) {
            expect(tool.inputSchema.additionalProperties).toBe(false);
            expect(tool.inputSchema.properties).not.toHaveProperty("projectId");
            expect(tool.annotations).toMatchObject({
              readOnlyHint:
                !tool.name.startsWith("record_") &&
                !coreWrites.includes(tool.name),
              destructiveHint: false,
              openWorldHint: false,
            });
            if (evaluationWrites.includes(tool.name)) {
              expect(tool.inputSchema.required).toContain("idempotencyKey");
              expect(tool.annotations?.idempotentHint).toBe(true);
            }
          }
          for (const name of [
            "review_evaluation_assessment",
            "review_assessment",
            "create_client",
          ])
            await expect(
              client.callTool({ name, arguments: {} }),
            ).rejects.toThrow("not found");
          expect(f.requests).toHaveLength(0);
          if (grants.includes("foundation.read")) {
            const identity = await call(client, "get_foundation_identity");
            expect(identity).toMatchObject({
              actor: { projectId, environment: "test", capabilities: grants },
              supportedOperations:
                supplied && grants.includes("evaluation.record")
                  ? [...coreOperations, "evaluation.record"]
                  : [...coreOperations],
            });
          } else {
            await expect(
              client.callTool({
                name: "get_foundation_identity",
                arguments: {},
              }),
            ).rejects.toThrow("not found");
          }
        },
        supplied,
      );
    },
  );

  it("derives identity from current core authority and never duplicates evaluation support", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      expect(
        (await call(client, "get_foundation_identity")).supportedOperations,
      ).toEqual([...coreOperations, "evaluation.record"]);
      f.client.operations = ["foundation.read"];
      expect(
        (await call(client, "get_foundation_identity")).supportedOperations,
      ).toEqual([...coreOperations]);
      f.client.operations.push("evaluation.record");
      expect(
        (await call(client, "get_foundation_identity")).supportedOperations,
      ).toEqual([...coreOperations, "evaluation.record"]);
    });
  });

  it("records immutable observations with exact original-result replay and altered retry conflicts", async () => {
    const f = fixture(["evaluation.record"]);
    await protocol(f, async (client) => {
      for (const [name, input] of writeInputs) {
        const args = { ...input, idempotencyKey: "Exact." + name };
        const first = await call(client, name, args);
        expect(first).toMatchObject({
          record: { ...input, projectId },
          replayed: false,
        });
        expect(await call(client, name, args)).toEqual({
          ...first,
          replayed: true,
        });
        const altered = name.endsWith("definition")
          ? { name: "altered" }
          : name.endsWith("trial")
            ? { runtime: "altered" }
            : { uncertainty: "altered" };
        await denied(
          client,
          name,
          { ...args, ...altered },
          "IDEMPOTENCY_CONFLICT",
        );
        await denied(
          client,
          name,
          { ...args, idempotencyKey: "fresh-" + name },
          "VERSION_CONFLICT",
        );
      }
      expect(f.definitions.size).toBe(1);
      expect(f.trials.size).toBe(1);
      expect(f.assessments.size).toBe(1);
      expect([...f.assessments.values()][0]!.reviewStatus).toBe("unreviewed");
      expect(
        f.requests.every(
          (request) =>
            request.projectId === projectId &&
            request.environment === "test" &&
            request.tokenDigest === foundationTokenDigest(token) &&
            request.operation === "evaluation.record",
        ),
      ).toBe(true);
      expect(JSON.stringify(f.requests)).not.toContain(token);
    });
  });

  it("rejects forged scope/actors, unknown fields, nested extras and malformed keys safely", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      const inputs = [
        ...writeInputs.map(
          ([name, input]): [string, Record<string, unknown>] => [
            name,
            { ...input, idempotencyKey: "valid" },
          ],
        ),
        ...readInputs,
      ];
      for (const [name, input] of inputs) {
        for (const field of [
          "projectId",
          "actor",
          "owner",
          "environment",
          "unknown",
          token,
        ])
          await denied(
            client,
            name,
            { ...input, [field]: "private-forged-value" },
            "INVALID_INPUT",
          );
      }
      for (const [name, input] of writeInputs) {
        for (const idempotencyKey of [
          undefined,
          "",
          " key",
          "key\n",
          "k".repeat(201),
        ])
          await denied(
            client,
            name,
            { ...input, idempotencyKey },
            "INVALID_INPUT",
          );
      }
      const malformed: [string, Record<string, unknown>][] = [
        [
          "record_evaluation_definition",
          {
            ...definitionInput,
            cases: [{ ...definitionInput.cases[0], owner: true }],
            idempotencyKey: "valid",
          },
        ],
        [
          "record_evaluation_trial",
          {
            ...trialInput,
            usage: { ...trialInput.usage, actor: true },
            idempotencyKey: "valid",
          },
        ],
        [
          "record_evaluation_assessment",
          {
            ...assessmentInput,
            checks: [{ ...assessmentInput.checks[0], owner: true }],
            idempotencyKey: "valid",
          },
        ],
        [
          "get_evaluation_report",
          {
            ...reportInput,
            conditionConfigurations: [
              { ...reportInput.conditionConfigurations[0], extra: true },
            ],
          },
        ],
        [
          "get_evaluation_report",
          {
            ...reportInput,
            judgeConfigurationIds: Array.from({ length: 1001 }, () => id(4)),
          },
        ],
        [
          "get_evaluation_report",
          {
            ...reportInput,
            conditionConfigurations: Array.from(
              { length: 1001 },
              () => reportInput.conditionConfigurations[0],
            ),
          },
        ],
        [
          "get_evaluation_report",
          {
            ...reportInput,
            conditionConfigurations: [
              {
                condition: "with",
                configurationIds: Array.from({ length: 1001 }, () => id(3)),
              },
            ],
          },
        ],
        ["get_evaluation_trial", { id: "private-forged-value" }],
      ];
      for (const [name, input] of malformed)
        await denied(client, name, input, "INVALID_INPUT");
      // The transport uses canonical fields; the real service applies superRefine
      // before accessing storage, so completed trials still require artifacts.
      await denied(
        client,
        "record_evaluation_trial",
        {
          ...trialInput,
          artifactDigests: [],
          idempotencyKey: "invalid-cross-field",
        },
        "INVALID_INPUT",
      );
      expect(f.requests).toHaveLength(0);
      expect(f.receipts.size).toBe(0);
    });
  });

  it("denies machine reviewed claims through the real service", async () => {
    const f = fixture(["evaluation.record"]);
    await protocol(f, async (client) => {
      await denied(
        client,
        "record_evaluation_assessment",
        {
          ...assessmentInput,
          reviewStatus: "reviewed",
          idempotencyKey: "review",
        },
        "FORBIDDEN",
      );
      expect(f.requests).toHaveLength(0);
      expect(f.assessments.size).toBe(0);
    });
  });

  it.each([
    "revoked",
    "expired",
    "evaluation capability",
    "read capability",
    "environment",
  ])(
    "rechecks %s at every applicable operation after discovery",
    async (change) => {
      const f = fixture();
      await protocol(f, async (client) => {
        expect((await client.listTools()).tools).toHaveLength(11);
        if (change === "revoked") f.client.revokedAt = at;
        if (change === "expired")
          f.client.expiresAt = "2026-10-15T11:30:00.000Z";
        if (change === "evaluation capability")
          f.client.operations = ["foundation.read"];
        if (change === "read capability")
          f.client.operations = ["evaluation.record"];
        if (change === "environment") f.client.environment = "production";
        const inputs =
          change === "read capability"
            ? readInputs
            : change === "evaluation capability"
              ? []
              : readInputs;
        const writes = change === "read capability" ? [] : writeInputs;
        const code =
          change === "revoked"
            ? "REVOKED"
            : change === "expired"
              ? "EXPIRED"
              : "FORBIDDEN";
        for (const [name, input] of writes)
          await denied(
            client,
            name,
            { ...input, idempotencyKey: "denied" },
            code,
          );
        for (const [name, input] of inputs)
          await denied(client, name, input, code);
        expect(f.receipts.size).toBe(0);
      });
    },
  );

  it("reads exact records only in trusted project scope and rejects duplicate report mappings", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      await seed(client);
      for (const [name, input] of readInputs.slice(0, 3)) {
        const expected = name.endsWith("definition")
          ? definitionInput
          : name.endsWith("trial")
            ? trialInput
            : assessmentInput;
        expect(await call(client, name, input)).toEqual({
          ...expected,
          projectId,
        });
        await denied(client, name, { id: id(999) }, "NOT_FOUND");
      }
      f.definitions.set(id(40), {
        ...f.definitions.get(id(10))!,
        id: id(40),
        projectId: foreignProjectId,
      });
      f.trials.set(id(41), {
        ...f.trials.get(id(20))!,
        id: id(41),
        projectId: foreignProjectId,
      });
      f.assessments.set(id(42), {
        ...f.assessments.get(id(30))!,
        id: id(42),
        projectId: foreignProjectId,
      });
      for (const [name, recordId] of [
        ["get_evaluation_definition", 40],
        ["get_evaluation_trial", 41],
        ["get_evaluation_assessment", 42],
      ] as const)
        await denied(client, name, { id: id(recordId) }, "NOT_FOUND");
      await denied(
        client,
        "get_evaluation_report",
        { ...reportInput, judgeConfigurationIds: [id(4), id(4)] },
        "INVALID_REFERENCE",
      );
      await denied(
        client,
        "get_evaluation_report",
        {
          ...reportInput,
          conditionConfigurations: [
            ...reportInput.conditionConfigurations,
            reportInput.conditionConfigurations[0],
          ],
        },
        "INVALID_REFERENCE",
      );
      await denied(
        client,
        "get_evaluation_report",
        {
          ...reportInput,
          conditionConfigurations: [
            { condition: "with", configurationIds: [id(3), id(3)] },
            reportInput.conditionConfigurations[1],
          ],
        },
        "INVALID_INPUT",
      );
      expect(
        f.requests.every(
          (request) =>
            request.projectId === projectId &&
            request.environment === "test" &&
            request.tokenDigest === foundationTokenDigest(token),
        ),
      ).toBe(true);
    });
  });

  it("reports the complete population with missing/failed/unsupported denominators and latest reviewed hard gates", async () => {
    const f = fixture();
    await protocol(f, async (client) => {
      await seed(client);
      await call(client, "record_evaluation_trial", {
        ...trialInput,
        id: id(21),
        attemptId: id(121),
        repetition: 2,
        outcome: "failed",
        artifactDigests: [],
        idempotencyKey: "failed",
      });
      await call(client, "record_evaluation_trial", {
        ...trialInput,
        id: id(22),
        attemptId: id(122),
        condition: "without",
        outcome: "unsupported",
        artifactDigests: [],
        idempotencyKey: "unsupported",
      });
      const report = await call(client, "get_evaluation_report", reportInput);
      expect(report).toMatchObject({
        expectedCellsPerComparison: 4,
        eligibleForReview: false,
        comparisons: [
          {
            counts: {
              expectedCells: 4,
              observedCells: 3,
              missingCells: 1,
              passedCells: 0,
              unassessedCells: 3,
              attemptCount: 3,
            },
            conditions: [
              {
                outcomes: { completed: 1, failed: 1 },
                successFraction: { numerator: 0, denominator: 2 },
              },
              {
                outcomes: { unsupported: 1 },
                successFraction: { numerator: 0, denominator: 2 },
              },
            ],
          },
        ],
      });
      expect(report.blockers).toEqual(
        expect.arrayContaining([
          "missing_cells",
          "missing_reviewed_assessment",
          "non_completed_outcome",
        ]),
      );
      // Represent existing owner-reviewed history in the storage fixture. Every
      // version is revalidated by the real report service; MCP exposes no review.
      const first = f.assessments.get(id(30))!;
      f.assessments.set(id(31), {
        ...first,
        id: id(31),
        version: 2,
        reviewStatus: "reviewed",
      });
      await call(client, "record_evaluation_assessment", {
        ...assessmentInput,
        id: id(32),
        version: 3,
        checks: [{ id: "privacy", result: "fail", hardGate: false }],
        idempotencyKey: "newer-unreviewed",
      });
      const pending = await call(client, "get_evaluation_report", reportInput);
      expect(pending).toMatchObject({
        comparisons: [
          {
            counts: { passedCells: 1, missingCells: 1 },
            conditions: expect.arrayContaining([
              expect.objectContaining({
                assessments: expect.arrayContaining([
                  expect.objectContaining({
                    selectedAssessmentId: id(31),
                    selectedAssessmentVersion: 2,
                    pendingNewerAssessmentCount: 1,
                  }),
                ]),
              }),
            ]),
          },
        ],
      });
      f.assessments.set(id(33), {
        ...f.assessments.get(id(32))!,
        id: id(33),
        version: 4,
        reviewStatus: "reviewed",
      });
      const failed = await call(client, "get_evaluation_report", reportInput);
      expect(failed).toMatchObject({
        eligibleForReview: false,
        comparisons: [
          { counts: { passedCells: 0, failedCells: 1, missingCells: 1 } },
        ],
      });
      expect(failed.blockers).toContain("check_not_passed");
      expect(failed).not.toHaveProperty("promoted");
    });
  });

  it("returns static safe errors for domain, unknown, driver and schema failures", async () => {
    const f = fixture();
    const secret = "private-forged-value " + token;
    const parsed = foundationActorSchema.safeParse({ [secret]: secret });
    const errors: [unknown, string][] = [
      [new FoundationError("INVALID_REFERENCE", secret), "INVALID_REFERENCE"],
      [new FoundationError(secret as "FORBIDDEN", secret), "UNAVAILABLE"],
      [new Error("SQL driver " + secret), "UNAVAILABLE"],
      [secret, "UNAVAILABLE"],
      [parsed.success ? null : parsed.error, "INVALID_INPUT"],
    ];
    await protocol(f, async (client) => {
      for (const [error, code] of errors) {
        f.state.failure = error;
        for (const [name, input] of readInputs)
          await denied(client, name, input, code);
        for (const [name, input] of writeInputs)
          await denied(
            client,
            name,
            { ...input, idempotencyKey: "safe" },
            code,
          );
      }
    });
  });
});
