import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type FoundationAssessment,
  type FoundationClient,
  type FoundationConfiguration,
  type FoundationEvaluationDefinition,
  type FoundationEvaluationTrial,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import type {
  FoundationMachineRequest,
  FoundationOwnerRequest,
} from "./agent-foundation.js";
import {
  createFoundationEvaluationOwnerService,
  createFoundationEvaluationService,
  type FoundationEvaluationPopulation,
  type FoundationEvaluationPort,
  type FoundationEvaluationRecords,
} from "./foundation-evaluation.js";

const id = (value: number) =>
  "00000000-0000-4000-8000-" + value.toString(16).padStart(12, "0");
const project = id(1);
const foreign = id(2);
const token = "af_" + "a".repeat(43);
const start = "2026-10-15T12:00:00.000Z";
const expiry = "2026-10-15T13:00:00.000Z";
const fixtureDigest = "a".repeat(64);
const artifactDigest = "b".repeat(64);
const rubricDigest = "c".repeat(64);
function config(value: number): FoundationConfiguration {
  const content = "explicit synthetic configuration " + value;
  return {
    schemaVersion: 1,
    id: id(value),
    projectId: project,
    kind: "settings",
    content,
    contentDigest: createHash("sha256").update(content, "utf8").digest("hex"),
    parentIds: [],
    sourceCommit: null,
    recordedAt: start,
    recordedBy: "owner:test",
  };
}
function definition(): FoundationEvaluationDefinition {
  return {
    schemaVersion: 1,
    id: id(10),
    projectId: project,
    version: 1,
    name: "Synthetic explicit observations",
    configurationIds: [id(3)],
    cases: [
      { id: "case", fixtureDigest, rubricDigest, hardGates: ["privacy"] },
    ],
    conditions: ["with", "without"],
    repetitions: 2,
    disclosure: "local_only",
  };
}
function trial(value = 20): FoundationEvaluationTrial {
  return {
    schemaVersion: 1,
    id: id(value),
    projectId: project,
    attemptId: id(value + 100),
    definitionId: id(10),
    caseId: "case",
    condition: "with",
    repetition: 1,
    configurationIds: [id(3)],
    model: "external model snapshot",
    runtime: "external runtime snapshot",
    inputDigest: fixtureDigest,
    artifactDigests: [artifactDigest],
    outcome: "completed",
    usage: { inputTokens: null, outputTokens: null },
    recordedAt: start,
  };
}
function assessment(value = 30, version = 1): FoundationAssessment {
  return {
    schemaVersion: 1,
    id: id(value),
    projectId: project,
    trialId: id(20),
    version,
    trialArtifactDigest: artifactDigest,
    rubricDigest,
    judgeConfigurationId: id(4),
    checks: [{ id: "privacy", result: "pass", hardGate: true }],
    uncertainty: null,
    reviewStatus: "unreviewed",
    recordedAt: start,
  };
}
function review(): FoundationAssessment {
  return { ...assessment(31, 2), reviewStatus: "reviewed" };
}
type State = {
  definitions: Map<string, FoundationEvaluationDefinition>;
  trials: Map<string, FoundationEvaluationTrial>;
  assessments: Map<string, FoundationAssessment>;
  receipts: Map<
    string,
    { digest: string; value: unknown; valueDigest: string }
  >;
};

/** Synthetic adapter proves application behavior only. No DB, API or MCP here. */
class Storage implements FoundationEvaluationPort {
  state: State = {
    definitions: new Map(),
    trials: new Map(),
    assessments: new Map(),
    receipts: new Map(),
  };
  configs = new Map(
    [config(3), config(4)].map((record) => [record.id, record]),
  );
  client: FoundationClient = {
    schemaVersion: 1,
    id: id(5),
    projectId: project,
    name: "synthetic",
    operations: ["evaluation.record", "foundation.read"],
    environment: "test",
    createdAt: start,
    expiresAt: expiry,
    revokedAt: null,
    createdBy: "owner:test",
  };
  now = new Date(start);
  requests: (FoundationMachineRequest | FoundationOwnerRequest)[] = [];
  audits: { principal: string; target: string | null; decision: string }[] = [];
  afterReceipt: (() => void) | undefined;
  afterInsert: (() => void) | undefined;
  afterConfiguration: (() => void) | undefined;
  afterCallback: (() => void) | undefined;
  receiptTransform: ((value: unknown) => unknown) | undefined;
  insertTransform: ((value: unknown) => unknown) | undefined;
  populationTransform:
    | ((
        value: FoundationEvaluationPopulation,
      ) => FoundationEvaluationPopulation)
    | undefined;
  definitionTransform:
    | ((
        value: FoundationEvaluationDefinition,
      ) => FoundationEvaluationDefinition)
    | undefined;
  sequence = 1000;
  options = {
    environment: "test" as const,
    now: () => new Date(this.now),
    createId: () => id(this.sequence++),
  };
  service = createFoundationEvaluationService(this, this.options);
  owner = () =>
    createFoundationEvaluationOwnerService(
      this,
      { principalId: "owner:test", expiresAt: expiry },
      this.options,
    );
  async transaction<T>(
    request: FoundationMachineRequest | FoundationOwnerRequest,
    principal: string,
    callback: (records: FoundationEvaluationRecords) => Promise<T>,
  ) {
    const before = structuredClone(this.state);
    this.requests.push(structuredClone(request));
    try {
      const result = await callback(this.records(principal, request.operation));
      this.afterCallback?.();
      if (
        "principalId" in request &&
        Date.parse(request.expiresAt) <= this.now.getTime()
      )
        throw new FoundationError(
          "FORBIDDEN",
          "A live owner session is required",
        );
      this.audits.push({
        principal,
        target: request.targetId,
        decision: "allow",
      });
      return result;
    } catch (error) {
      this.state = before;
      this.audits.push({
        principal,
        target: request.targetId,
        decision: "deny",
      });
      throw error;
    }
  }
  withClient<T>(
    request: FoundationMachineRequest,
    callback: (
      client: FoundationClient,
      records: FoundationEvaluationRecords,
    ) => Promise<T>,
  ): Promise<T> {
    if (request.tokenDigest !== foundationTokenDigest(token))
      return Promise.reject(new FoundationError("INVALID_CREDENTIAL"));
    return this.transaction(
      request,
      "foundation-client:" + this.client.id,
      (records) => callback(this.client, records),
    );
  }
  withOwner<T>(
    request: FoundationOwnerRequest,
    callback: (records: FoundationEvaluationRecords) => Promise<T>,
  ): Promise<T> {
    if (request.principalId !== "owner:test")
      return Promise.reject(new FoundationError("FORBIDDEN"));
    return this.transaction(request, request.principalId, callback);
  }
  records(principal: string, operation: string): FoundationEvaluationRecords {
    return {
      idempotent: async <T>(
        key: string,
        digest: string,
        perform: () => Promise<T>,
      ) => {
        const receiptKey = principal + ":" + operation + ":" + key;
        const prior = this.state.receipts.get(receiptKey);
        if (prior) {
          if (digest !== prior.digest)
            throw new FoundationError("IDEMPOTENCY_CONFLICT");
          if (foundationDigest(prior.value) !== prior.valueDigest)
            throw new FoundationError("INVALID_REFERENCE");
          const copy = structuredClone(prior.value);
          this.afterReceipt?.();
          return {
            value: (this.receiptTransform
              ? this.receiptTransform(copy)
              : copy) as T,
            replayed: true,
          };
        }
        const result = await perform();
        this.state.receipts.set(receiptKey, {
          digest,
          value: structuredClone(result),
          valueDigest: foundationDigest(result),
        });
        this.afterReceipt?.();
        return {
          value: (this.receiptTransform
            ? this.receiptTransform(structuredClone(result))
            : structuredClone(result)) as T,
          replayed: false,
        };
      },
      getDefinition: async (value) => {
        const record = this.state.definitions.get(value);
        return record
          ? structuredClone(
              this.definitionTransform
                ? this.definitionTransform(record)
                : record,
            )
          : null;
      },
      getTrial: async (value) =>
        structuredClone(this.state.trials.get(value) ?? null),
      getAssessment: async (value) =>
        structuredClone(this.state.assessments.get(value) ?? null),
      getConfiguration: async (value) => {
        this.afterConfiguration?.();
        return structuredClone(this.configs.get(value) ?? null);
      },
      getReportPopulation: async (value) => {
        const trials = [...this.state.trials.values()].filter(
          (record) => record.definitionId === value,
        );
        const ids = new Set(trials.map((record) => record.id));
        const population = structuredClone({
          trials,
          assessments: [...this.state.assessments.values()].filter((record) =>
            ids.has(record.trialId),
          ),
          configurations: [...this.configs.values()],
        });
        return this.populationTransform
          ? this.populationTransform(population)
          : population;
      },
      insertDefinition: async (record) => {
        if (this.state.definitions.has(record.id))
          throw new FoundationError("VERSION_CONFLICT");
        this.state.definitions.set(record.id, structuredClone(record));
        this.afterInsert?.();
        return (
          this.insertTransform
            ? this.insertTransform(record)
            : structuredClone(record)
        ) as FoundationEvaluationDefinition;
      },
      insertTrial: async (record) => {
        if (
          this.state.trials.has(record.id) ||
          [...this.state.trials.values()].some(
            (entry) => entry.attemptId === record.attemptId,
          )
        )
          throw new FoundationError("VERSION_CONFLICT");
        this.state.trials.set(record.id, structuredClone(record));
        this.afterInsert?.();
        return (
          this.insertTransform
            ? this.insertTransform(record)
            : structuredClone(record)
        ) as FoundationEvaluationTrial;
      },
      insertAssessment: async (record) => {
        if (
          this.state.assessments.has(record.id) ||
          [...this.state.assessments.values()].some(
            (entry) =>
              entry.trialId === record.trialId &&
              entry.version === record.version,
          )
        )
          throw new FoundationError("VERSION_CONFLICT");
        this.state.assessments.set(record.id, structuredClone(record));
        this.afterInsert?.();
        return (
          this.insertTransform
            ? this.insertTransform(record)
            : structuredClone(record)
        ) as FoundationAssessment;
      },
    };
  }
  async seed() {
    await this.service.recordDefinition(token, definition(), "definition");
    await this.service.recordTrial(token, trial(), "trial");
    await this.service.recordAssessment(token, assessment(), "assessment");
  }
  report() {
    return this.service.report(
      token,
      project,
      id(10),
      [
        { condition: "with", configurationIds: [id(3)] },
        { condition: "without", configurationIds: [id(3)] },
      ],
      [id(4)],
    );
  }
}

function envelope(value: unknown): {
  record: Record<string, unknown>;
  actor: Record<string, unknown>;
  correlationId: string;
} {
  return value as {
    record: Record<string, unknown>;
    actor: Record<string, unknown>;
    correlationId: string;
  };
}

describe("immutable evaluation application service", () => {
  it("records every kind and replays its original result and correlation", async () => {
    const store = new Storage();
    const first = await store.service.recordDefinition(
      token,
      definition(),
      "definition",
    );
    const again = await store.service.recordDefinition(
      token,
      definition(),
      "definition",
    );
    expect(again).toEqual({ ...first, replayed: true });
    const observed = await store.service.recordTrial(token, trial(), "trial");
    expect(await store.service.recordTrial(token, trial(), "trial")).toEqual({
      ...observed,
      replayed: true,
    });
    const graded = await store.service.recordAssessment(
      token,
      assessment(),
      "assessment",
    );
    expect(
      await store.service.recordAssessment(token, assessment(), "assessment"),
    ).toEqual({ ...graded, replayed: true });
    const reviewed = await store.owner().reviewAssessment(review(), "review");
    expect(await store.owner().reviewAssessment(review(), "review")).toEqual({
      ...reviewed,
      replayed: true,
    });
    expect(store.state.assessments.size).toBe(2);
    expect(await store.service.getDefinition(token, project, id(10))).toEqual(
      definition(),
    );
    expect(await store.service.getTrial(token, project, id(20))).toEqual(
      trial(),
    );
    expect(await store.service.getAssessment(token, project, id(31))).toEqual(
      review(),
    );
    expect(store.requests.every((request) => !("token" in request))).toBe(true);
    expect(
      store.requests
        .filter((request) => "tokenDigest" in request)
        .every(
          (request) =>
            request.operation === "foundation.read" ||
            request.operation === "evaluation.record",
        ),
    ).toBe(true);
    expect(store.audits.at(-1)?.decision).toBe("allow");
  });

  it("binds bodies and mutation subtypes to keys", async () => {
    const store = new Storage();
    await store.seed();
    await expect(
      store.service.recordDefinition(
        token,
        { ...definition(), name: "changed" },
        "definition",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      store.service.recordTrial(token, trial(21), "definition"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      store.service.recordAssessment(
        token,
        { ...assessment(), uncertainty: "changed" },
        "assessment",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      store.service.recordTrial(
        token,
        { ...trial(), runtime: "changed" },
        "trial",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await store.owner().reviewAssessment(review(), "review");
    await expect(
      store
        .owner()
        .reviewAssessment({ ...review(), uncertainty: "changed" }, "review"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it.each(["project", "environment", "expiry", "revoked", "capability"])(
    "denies invalid machine %s",
    async (kind) => {
      const store = new Storage();
      if (kind === "project") store.client.projectId = foreign;
      if (kind === "environment") store.client.environment = "production";
      if (kind === "expiry") store.now = new Date(expiry);
      if (kind === "revoked") store.client.revokedAt = start;
      if (kind === "capability") store.client.operations = ["foundation.read"];
      await expect(
        store.service.recordDefinition(token, definition(), "deny"),
      ).rejects.toThrow();
      expect(store.state.definitions.size).toBe(0);
      expect(store.audits.at(-1)?.decision).toBe("deny");
    },
  );

  it("requires foundation.read independently of evaluation.record", async () => {
    const store = new Storage();
    await store.seed();
    store.client.operations = ["evaluation.record"];
    await expect(
      store.service.getDefinition(token, project, id(10)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(store.report()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      store.service.getTrial("bad", project, id(20)),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
    await expect(
      store.service.getTrial("af_" + "z".repeat(43), project, id(20)),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
  });

  it.each(["afterReference", "afterInsert", "afterReceipt"])(
    "rechecks mutable grants %s and rolls back writes",
    async (phase) => {
      const store = new Storage();
      const revoke = () => {
        store.client.revokedAt = start;
      };
      if (phase === "afterReference") store.afterConfiguration = revoke;
      if (phase === "afterInsert") store.afterInsert = revoke;
      if (phase === "afterReceipt") store.afterReceipt = revoke;
      await expect(
        store.service.recordDefinition(token, definition(), "race"),
      ).rejects.toMatchObject({ code: "REVOKED" });
      expect(store.state.definitions.size).toBe(0);
      expect(store.state.receipts.size).toBe(0);
      expect(store.audits.at(-1)?.decision).toBe("deny");
    },
  );

  it("fails closed for invalid clocks, invalid grant dates and expiry during receipt", async () => {
    for (const kind of ["clock", "date", "wait"] as const) {
      const store = new Storage();
      if (kind === "clock") store.now = new Date("invalid");
      if (kind === "date") store.client.expiresAt = "2026-02-30T00:00:00Z";
      if (kind === "wait")
        store.afterReceipt = () => {
          store.now = new Date(expiry);
        };
      await expect(
        store.service.recordDefinition(token, definition(), kind),
      ).rejects.toThrow();
      expect(store.state.definitions.size).toBe(0);
    }
  });

  it("rejects strict input extras, empty cases/policy and mutable definition versions", async () => {
    const store = new Storage();
    const bad = [
      { ...definition(), trusted: true },
      { ...definition(), cases: [] },
      {
        ...definition(),
        cases: [{ ...definition().cases[0]!, hardGates: [] }],
      },
      { ...definition(), version: 2 },
    ];
    for (const value of bad)
      await expect(
        Promise.resolve().then(() =>
          store.service.recordDefinition(token, value, "bad"),
        ),
      ).rejects.toThrow();
    await store.seed();
    await expect(
      Promise.resolve().then(() =>
        store.service.recordTrial(
          token,
          { ...trial(), executed: true },
          "extra",
        ),
      ),
    ).rejects.toThrow();
    await expect(
      Promise.resolve().then(() =>
        store.service.recordAssessment(
          token,
          { ...assessment(), trusted: true },
          "extra",
        ),
      ),
    ).rejects.toThrow();
  });

  it.each(["missing", "foreign", "digest"])(
    "rejects %s configuration references",
    async (kind) => {
      const store = new Storage();
      if (kind === "missing") store.configs.delete(id(3));
      if (kind === "foreign") store.configs.get(id(3))!.projectId = foreign;
      if (kind === "digest")
        store.configs.get(id(3))!.contentDigest = artifactDigest;
      await expect(
        store.service.recordDefinition(token, definition(), "config"),
      ).rejects.toThrow();
      expect(store.state.definitions.size).toBe(0);
    },
  );

  it.each([
    "fixture",
    "case",
    "condition",
    "repetition",
    "configuration",
    "definition",
  ])("rejects trial %s substitution", async (kind) => {
    const store = new Storage();
    await store.service.recordDefinition(token, definition(), "def");
    const input = trial();
    if (kind === "fixture") input.inputDigest = artifactDigest;
    if (kind === "case") input.caseId = "unknown";
    if (kind === "condition") input.condition = "unknown";
    if (kind === "repetition") input.repetition = 3;
    if (kind === "configuration") input.configurationIds = [id(4)];
    if (kind === "definition") input.definitionId = id(999);
    await expect(
      store.service.recordTrial(token, input, "bad"),
    ).rejects.toThrow();
    expect(store.state.trials.size).toBe(0);
  });

  it("requires completed provenance but records explicit unsupported and infrastructure outcomes", async () => {
    const store = new Storage();
    await store.service.recordDefinition(token, definition(), "def");
    await expect(
      Promise.resolve().then(() =>
        store.service.recordTrial(
          token,
          { ...trial(), artifactDigests: [] },
          "bad",
        ),
      ),
    ).rejects.toThrow();
    await expect(
      Promise.resolve().then(() =>
        store.service.recordTrial(token, { ...trial(), model: " " }, "blank"),
      ),
    ).rejects.toThrow();
    const unsupported = {
      ...trial(),
      artifactDigests: [],
      outcome: "unsupported" as const,
    };
    expect(
      (await store.service.recordTrial(token, unsupported, "unsupported"))
        .record,
    ).toEqual(unsupported);
    const failed = {
      ...trial(21),
      condition: "without",
      artifactDigests: [],
      outcome: "infrastructure_failed" as const,
    };
    await store.service.recordTrial(token, failed, "infra");
    const report = await store.report();
    expect(report.eligibleForReview).toBe(false);
    expect(report.comparisons[0]!.conditions[0]!.outcomes.unsupported).toBe(1);
    expect(
      report.comparisons[0]!.conditions[1]!.outcomes.infrastructure_failed,
    ).toBe(1);
  });

  it.each(["artifact", "rubric", "judge", "trial"])(
    "rejects assessment %s substitution",
    async (kind) => {
      const store = new Storage();
      await store.service.recordDefinition(token, definition(), "def");
      await store.service.recordTrial(token, trial(), "trial");
      const input = assessment();
      if (kind === "artifact") input.trialArtifactDigest = fixtureDigest;
      if (kind === "rubric") input.rubricDigest = fixtureDigest;
      if (kind === "judge") input.judgeConfigurationId = id(999);
      if (kind === "trial") input.trialId = id(999);
      await expect(
        store.service.recordAssessment(token, input, "bad"),
      ).rejects.toThrow();
      expect(store.state.assessments.size).toBe(0);
    },
  );

  it("rejects machine reviewed authority and preserves append-only history", async () => {
    const store = new Storage();
    await store.seed();
    await expect(
      Promise.resolve().then(() =>
        store.service.recordAssessment(token, review(), "review"),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      store.service.recordAssessment(token, assessment(32, 3), "gap"),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      store.service.recordAssessment(token, assessment(32), "duplicate"),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const regrade = {
      ...assessment(32, 2),
      checks: [{ id: "privacy", result: "fail" as const, hardGate: false }],
    };
    await store.service.recordAssessment(token, regrade, "regrade");
    expect(store.state.assessments.get(id(30))).toEqual(assessment());
    expect(store.state.assessments.get(id(32))).toEqual(regrade);
    const report = await store.report();
    expect(report.comparisons[0]!.counts.passedCells).toBe(0);
    expect(report.blockers).toContain("missing_reviewed_assessment");
  });

  it("rejects immutable duplicate IDs and attempt reuse with new keys", async () => {
    const store = new Storage();
    await store.seed();
    await expect(
      store.service.recordDefinition(token, definition(), "def2"),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      store.service.recordTrial(token, trial(), "trial2"),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      store.service.recordTrial(
        token,
        { ...trial(21), attemptId: trial().attemptId },
        "attempt2",
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      store.service.recordAssessment(token, { ...assessment(30, 2) }, "sameid"),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it.each(["checks", "uncertainty", "judge", "artifact", "rubric", "trial"])(
    "owner review cannot rewrite %s",
    async (kind) => {
      const store = new Storage();
      await store.seed();
      const input = review();
      if (kind === "checks")
        input.checks = [{ id: "privacy", result: "fail", hardGate: true }];
      if (kind === "uncertainty") input.uncertainty = "rewritten";
      if (kind === "judge") {
        store.configs.set(id(6), config(6));
        input.judgeConfigurationId = id(6);
      }
      if (kind === "artifact") input.trialArtifactDigest = fixtureDigest;
      if (kind === "rubric") input.rubricDigest = fixtureDigest;
      if (kind === "trial") input.trialId = id(999);
      await expect(
        store.owner().reviewAssessment(input, "rewrite"),
      ).rejects.toThrow();
      expect(store.state.assessments.size).toBe(1);
    },
  );

  it("reviews only the immediately previous unreviewed version using a distinct ID", async () => {
    const store = new Storage();
    await store.seed();
    await expect(
      store.owner().reviewAssessment({ ...review(), id: id(30) }, "same"),
    ).rejects.toThrow();
    await expect(
      store.owner().reviewAssessment({ ...review(), version: 3 }, "gap"),
    ).rejects.toThrow();
    await expect(
      store.owner().reviewAssessment(assessment(31, 2), "unreviewed"),
    ).rejects.toThrow();
    await store.owner().reviewAssessment(review(), "review");
    await expect(
      store
        .owner()
        .reviewAssessment({ ...review(), id: id(32), version: 3 }, "again"),
    ).rejects.toThrow();
    expect(
      store.audits.some(
        (audit) =>
          audit.principal === "owner:test" &&
          audit.target === id(31) &&
          audit.decision === "allow",
      ),
    ).toBe(true);
  });

  it.each(["before", "reference", "insert", "receipt", "commit"])(
    "denies owner expiry at %s boundary",
    async (phase) => {
      const store = new Storage();
      await store.seed();
      const expire = () => {
        store.now = new Date(expiry);
      };
      if (phase === "before") expire();
      if (phase === "reference") store.afterConfiguration = expire;
      if (phase === "insert") store.afterInsert = expire;
      if (phase === "receipt") store.afterReceipt = expire;
      if (phase === "commit") store.afterCallback = expire;
      await expect(
        store.owner().reviewAssessment(review(), "expire"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.state.assessments.size).toBe(1);
    },
  );

  it("copies trusted owner identity and rejects invalid or unauthenticated sessions", async () => {
    const store = new Storage();
    await store.seed();
    const identity = { principalId: "owner:test", expiresAt: expiry };
    const owner = createFoundationEvaluationOwnerService(
      store,
      identity,
      store.options,
    );
    identity.principalId = "spoofed";
    identity.expiresAt = start;
    await owner.reviewAssessment(review(), "real");
    for (const identity of [
      { principalId: " ", expiresAt: expiry },
      { principalId: "owner:test", expiresAt: "invalid" },
      { principalId: "owner:test", expiresAt: "2026-02-30T00:00:00Z" },
      { principalId: "machine:spoof", expiresAt: expiry },
    ]) {
      await expect(
        createFoundationEvaluationOwnerService(
          store,
          identity,
          store.options,
        ).reviewAssessment({ ...review(), id: id(32), version: 3 }, "bad"),
      ).rejects.toThrow();
    }
  });

  it.each(["record", "actor", "correlation", "project", "shape"])(
    "rejects corrupted %s receipts and rolls back insertion",
    async (kind) => {
      const store = new Storage();
      store.receiptTransform = (value) => {
        const receipt = envelope(value);
        if (kind === "record") receipt.record.name = "corrupt";
        if (kind === "actor") receipt.actor.principalId = "another-principal";
        if (kind === "correlation") receipt.correlationId = id(999);
        if (kind === "project") receipt.actor.projectId = foreign;
        if (kind === "shape") receipt.record.extra = "not allowed";
        return receipt;
      };
      await expect(
        store.service.recordDefinition(token, definition(), "corrupt"),
      ).rejects.toThrow();
      expect(store.state.definitions.size).toBe(0);
      expect(store.state.receipts.size).toBe(0);
    },
  );

  it("validates exact replay bodies and principal after adapter integrity checks", async () => {
    const store = new Storage();
    await store.seed();
    store.receiptTransform = (value) => {
      const receipt = envelope(value);
      receipt.record.id = id(777);
      return receipt;
    };
    await expect(
      store.service.recordTrial(token, trial(), "trial"),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    store.receiptTransform = (value) => {
      const receipt = envelope(value);
      receipt.actor.clientId = id(777);
      return receipt;
    };
    await expect(
      store.service.recordAssessment(token, assessment(), "assessment"),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(store.state.assessments.size).toBe(1);
  });

  it("detects in-place mutation of inserted records", async () => {
    const store = new Storage();
    store.insertTransform = (value) => {
      const record = value as FoundationEvaluationDefinition;
      record.name = "mutated in adapter";
      return record;
    };
    await expect(
      store.service.recordDefinition(token, definition(), "mutation"),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(store.state.definitions.size).toBe(0);
  });

  it("checks exact read scope and requested immutable ID", async () => {
    const store = new Storage();
    await store.seed();
    await expect(
      store.service.getTrial(token, foreign, id(20)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      store.service.getAssessment(token, project, id(999)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    store.definitionTransform = (value) => ({ ...value, id: id(777) });
    await expect(
      store.service.getDefinition(token, project, id(10)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    store.definitionTransform = (value) => ({ ...value, projectId: foreign });
    await expect(
      store.service.getDefinition(token, project, id(10)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    "foreign",
    "missingConfiguration",
    "corruptConfiguration",
    "foreignAssessment",
    "wrongRubric",
    "wrongArtifact",
    "versionGap",
    "duplicateAttempt",
    "extra",
  ])("rejects %s population corruption", async (kind) => {
    const store = new Storage();
    await store.seed();
    store.populationTransform = (value) => {
      if (kind === "foreign") value.trials[0]!.projectId = foreign;
      if (kind === "missingConfiguration") value.configurations = [];
      if (kind === "corruptConfiguration")
        value.configurations[0]!.content = "corrupt";
      if (kind === "foreignAssessment")
        value.assessments[0]!.projectId = foreign;
      if (kind === "wrongRubric")
        value.assessments[0]!.rubricDigest = artifactDigest;
      if (kind === "wrongArtifact")
        value.assessments[0]!.trialArtifactDigest = fixtureDigest;
      if (kind === "versionGap") value.assessments[0]!.version = 2;
      if (kind === "duplicateAttempt")
        value.trials.push({ ...value.trials[0]!, id: id(21) });
      if (kind === "extra") return { ...value, extra: true };
      return value;
    };
    await expect(store.report()).rejects.toThrow();
  });

  it("preserves full denominators and treats machine pass claims as unreviewed", async () => {
    const store = new Storage();
    await store.seed();
    const pending = await store.report();
    expect(pending.expectedCellsPerComparison).toBe(4);
    expect(pending.comparisons[0]!.counts).toMatchObject({
      expectedCells: 4,
      observedCells: 1,
      passedCells: 0,
      missingCells: 3,
      unassessedCells: 1,
    });
    expect(
      pending.comparisons[0]!.conditions.map(
        (condition) => condition.successFraction,
      ),
    ).toEqual([
      { numerator: 0, denominator: 2 },
      { numerator: 0, denominator: 2 },
    ]);
    await store.owner().reviewAssessment(review(), "review");
    const reviewed = await store.report();
    expect(reviewed.comparisons[0]!.counts).toMatchObject({
      expectedCells: 4,
      passedCells: 1,
      missingCells: 3,
    });
    expect(reviewed.eligibleForReview).toBe(false);
    expect(reviewed.blockers).toContain("missing_cells");
    expect(store.state.trials.get(id(20))).toEqual(trial());
    expect(reviewed).not.toHaveProperty("promoted");
  });

  it("does not infer a model/runtime or fabricate observations", async () => {
    const store = new Storage();
    await store.service.recordDefinition(token, definition(), "def");
    const empty = await store.report();
    expect(empty.comparisons).toEqual([]);
    expect(empty.blockers).toContain("no_observations");
    expect(empty.eligibleForReview).toBe(false);
    await store.service.recordTrial(token, trial(), "trial");
    await store.service.recordTrial(
      token,
      { ...trial(21), model: "another explicit snapshot" },
      "trial2",
    );
    const report = await store.report();
    expect(report.comparisons).toHaveLength(2);
    expect(
      report.comparisons.every(
        (comparison) => comparison.counts.expectedCells === 4,
      ),
    ).toBe(true);
  });

  it("requires exact complete condition mappings and judge snapshots", async () => {
    const store = new Storage();
    await store.seed();
    await expect(
      store.service.report(
        token,
        project,
        id(10),
        [{ condition: "with", configurationIds: [id(3)] }],
        [id(4)],
      ),
    ).rejects.toThrow();
    expect(() =>
      store.service.report(
        token,
        project,
        id(10),
        [
          { condition: "with", configurationIds: [id(3)], extra: true } as {
            condition: string;
            configurationIds: string[];
          },
        ],
        [id(4)],
      ),
    ).toThrow();
    await expect(
      store.service.report(
        token,
        project,
        id(10),
        [
          { condition: "with", configurationIds: [id(3)] },
          { condition: "without", configurationIds: [id(3)] },
        ],
        [id(999)],
      ),
    ).rejects.toThrow();
  });
});

describe("requested judges without assessment references", () => {
  it.each(["empty", "non_completed"])(
    "reports %s populations with an independently selected valid judge",
    async (kind) => {
      const store = new Storage();
      await store.service.recordDefinition(token, definition(), "definition");
      if (kind === "non_completed")
        await store.service.recordTrial(
          token,
          { ...trial(), outcome: "unsupported", artifactDigests: [] },
          "unsupported",
        );
      store.populationTransform = (value) => ({
        ...value,
        configurations: value.configurations.filter((row) => row.id !== id(4)),
      });
      const report = await store.service.report(
        token,
        project,
        id(10),
        [
          { condition: "with", configurationIds: [id(3)] },
          { condition: "without", configurationIds: [id(3)] },
        ],
        [id(4)],
      );
      expect(report.eligibleForReview).toBe(false);
      expect(report.judgeConfigurations).toEqual([
        { id: id(4), contentDigest: config(4).contentDigest },
      ]);
      if (kind === "empty")
        expect(report.blockers).toContain("no_observations");
      else
        expect(report.comparisons[0]!.counts).toMatchObject({
          expectedCells: 4,
          attemptCount: 1,
          missingCells: 3,
          passedCells: 0,
        });
    },
  );
});
