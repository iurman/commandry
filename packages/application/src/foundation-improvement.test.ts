import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  foundationAssessmentSchema,
  foundationClientSchema,
  foundationConfigurationSchema,
  foundationEvaluationDefinitionSchema,
  foundationEvaluationTrialSchema,
  foundationImprovementInputSchema,
  type FoundationAssessment,
  type FoundationClient,
  type FoundationConfiguration,
  type FoundationEvaluationDefinition,
  type FoundationEvaluationTrial,
  type FoundationImprovementDecision,
  type FoundationImprovementDecisionInput,
  type FoundationImprovementProposal,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationInstantMilliseconds,
  foundationTokenDigest,
  requireFoundationGrant,
} from "@commandry/domain";
import type {
  FoundationMachineRequest,
  FoundationOwnerRequest,
} from "./agent-foundation";
import {
  createFoundationImprovementService,
  type FoundationImprovementPort,
  type FoundationImprovementRecords,
} from "./foundation-improvement";
import { foundationWorkflowPageCursor } from "./foundation-workflow-pagination";

const uuid = (value: number) =>
  "10000000-0000-4000-8000-" + value.toString(16).padStart(12, "0");
const projectId = uuid(1),
  baselineId = uuid(2),
  candidateId = uuid(3),
  sharedId = uuid(4),
  judgeId = uuid(5),
  oldDefinitionId = uuid(6),
  definitionId = uuid(7),
  oldTrialId = uuid(8),
  oldAssessmentId = uuid(9),
  clientId = uuid(10);
const token = "af_" + "a".repeat(43);
const at = "2026-10-16T10:00:00.000Z",
  nowAt = "2026-10-16T12:00:00.000Z";
const owner = {
  principalId: "user:owner",
  expiresAt: "2026-10-16T18:00:00.000Z",
};
const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const signed = <T extends object>(content: T) => ({
  ...content,
  contentDigest: foundationDigest(content),
});
const error = (code: string) => expect.objectContaining({ code });
const unavailable = expect.objectContaining({
  name: "FoundationWorkflowUnavailableError",
});

function fixture() {
  const clock = { now: Date.parse(nowAt) };
  const definitions = new Map<string, FoundationEvaluationDefinition>();
  const configurations = new Map<string, FoundationConfiguration>();
  for (const [id, content, parents] of [
    [baselineId, "baseline", []],
    [candidateId, "candidate", [baselineId]],
    [sharedId, "shared", []],
    [judgeId, "judge", []],
  ] as const) {
    configurations.set(
      id,
      foundationConfigurationSchema.parse({
        schemaVersion: 1,
        id,
        projectId,
        kind: "prompt",
        content,
        contentDigest: hash(content),
        parentIds: [...parents],
        sourceCommit: "unverified-source-claim",
        recordedAt: at,
        recordedBy: "user:owner",
      }),
    );
  }
  const evaluationCase = {
    id: "historical-case",
    fixtureDigest: hash("historical-fixture"),
    rubricDigest: hash("historical-rubric"),
    hardGates: ["required"],
  };
  const regressionCase = {
    id: "regression-case",
    fixtureDigest: hash("regression-fixture"),
    rubricDigest: hash("regression-rubric"),
    hardGates: ["required"],
  };
  definitions.set(
    oldDefinitionId,
    foundationEvaluationDefinitionSchema.parse({
      schemaVersion: 1,
      id: oldDefinitionId,
      projectId,
      version: 1,
      name: "Historical baseline",
      configurationIds: [baselineId, sharedId],
      cases: [evaluationCase],
      conditions: ["historical"],
      repetitions: 1,
      disclosure: "local_only",
    }),
  );
  definitions.set(
    definitionId,
    foundationEvaluationDefinitionSchema.parse({
      schemaVersion: 1,
      id: definitionId,
      projectId,
      version: 2,
      name: "New regression suite",
      configurationIds: [baselineId, candidateId, sharedId],
      cases: [regressionCase],
      conditions: ["baseline", "candidate"],
      repetitions: 1,
      disclosure: "local_only",
    }),
  );
  const oldTrial = foundationEvaluationTrialSchema.parse({
    schemaVersion: 1,
    id: oldTrialId,
    attemptId: uuid(11),
    definitionId: oldDefinitionId,
    projectId,
    caseId: evaluationCase.id,
    condition: "historical",
    repetition: 1,
    configurationIds: [baselineId, sharedId],
    model: "model",
    runtime: "runtime",
    inputDigest: evaluationCase.fixtureDigest,
    artifactDigests: [hash("historical-artifact")],
    outcome: "completed",
    usage: { inputTokens: 1, outputTokens: 1 },
    recordedAt: at,
  });
  const oldAssessment = foundationAssessmentSchema.parse({
    schemaVersion: 1,
    id: oldAssessmentId,
    trialId: oldTrialId,
    projectId,
    version: 1,
    trialArtifactDigest: oldTrial.artifactDigests[0],
    rubricDigest: evaluationCase.rubricDigest,
    judgeConfigurationId: judgeId,
    checks: [{ id: "required", result: "fail", hardGate: true }],
    uncertainty: null,
    reviewStatus: "reviewed",
    recordedAt: at,
  });
  const trials = new Map<string, FoundationEvaluationTrial>([
    [oldTrial.id, oldTrial],
  ]);
  const assessments = new Map<string, FoundationAssessment>([
    [oldAssessment.id, oldAssessment],
  ]);
  for (const [index, condition, subject] of [
    [20, "baseline", baselineId],
    [30, "candidate", candidateId],
  ] as const) {
    const trial = foundationEvaluationTrialSchema.parse({
      ...oldTrial,
      id: uuid(index),
      attemptId: uuid(index + 1),
      definitionId,
      caseId: regressionCase.id,
      condition,
      configurationIds: [subject, sharedId],
      inputDigest: regressionCase.fixtureDigest,
      artifactDigests: [hash(condition + "artifact")],
    });
    trials.set(trial.id, trial);
    const assessment = foundationAssessmentSchema.parse({
      ...oldAssessment,
      id: uuid(index + 2),
      trialId: trial.id,
      trialArtifactDigest: trial.artifactDigests[0],
      rubricDigest: regressionCase.rubricDigest,
      checks: [{ id: "required", result: "pass", hardGate: true }],
    });
    assessments.set(assessment.id, assessment);
  }
  const value = foundationImprovementInputSchema.parse({
    projectId,
    candidateConfigurationId: candidateId,
    baselineConfigurationId: baselineId,
    definitionId,
    motivations: [{ assessmentId: oldAssessmentId, assessmentVersion: 1 }],
    conditionConfigurations: [
      {
        condition: "baseline",
        role: "baseline",
        configurationIds: [baselineId, sharedId],
      },
      {
        condition: "candidate",
        role: "candidate",
        configurationIds: [candidateId, sharedId],
      },
    ],
    judgeConfigurationIds: [judgeId],
    rationale: "A reviewed baseline hard gate failed",
    hypothesis: "The candidate fixes the failure under a new regression suite",
  });
  const proposals = new Map<string, FoundationImprovementProposal>();
  const decisions = new Map<string, FoundationImprovementDecision>();
  const receipts = new Map<
    string,
    { digest: string; value: unknown; responseDigest: string }
  >();
  const requests: (FoundationMachineRequest | FoundationOwnerRequest)[] = [];
  let active:
    | {
        request: FoundationMachineRequest | FoundationOwnerRequest;
        principalId: string;
      }
    | undefined;
  const state: {
    client: FoundationClient | null;
    ownerActive: boolean;
    reversePopulation: boolean;
    omittedJudge: boolean;
  } = {
    client: foundationClientSchema.parse({
      schemaVersion: 1,
      id: clientId,
      projectId,
      name: "Test client",
      operations: ["improvement.propose", "improvement.read"],
      environment: "test",
      createdAt: at,
      expiresAt: "2026-10-16T18:00:00.000Z",
      revokedAt: null,
      createdBy: "user:owner",
    }),
    ownerActive: true,
    reversePopulation: false,
    omittedJudge: false,
  };
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected unrelated record method");
  };
  const records: FoundationImprovementRecords = {
    async idempotent<T>(
      key: string,
      digest: string,
      perform: () => Promise<T>,
    ) {
      if (!active) throw new Error("Unbound records");
      const scopedKey = [
        active.request.projectId,
        active.request.environment,
        active.request.operation,
        active.principalId,
        key,
      ].join(":");
      const prior = receipts.get(scopedKey);
      if (prior) {
        if (digest !== prior.digest)
          throw new FoundationError("IDEMPOTENCY_CONFLICT");
        if (foundationDigest(prior.value) !== prior.responseDigest)
          throw new Error("Corrupt immutable storage receipt");
        return { value: copy(prior.value) as T, replayed: true };
      }
      const result = await perform();
      receipts.set(scopedKey, {
        digest,
        value: copy(result),
        responseDigest: foundationDigest(result),
      });
      return { value: result, replayed: false };
    },
    validateEvidenceReference: unused,
    assertReferences: unused,
    getEvidence: unused,
    getMemory: unused,
    resolveMemoryAnchor: unused,
    getMemoryAnchor: unused,
    hasUnresolvedContradictions: unused,
    insertEvidence: unused,
    saveMemory: unused,
    reviewMemory: unused,
    verifyMemory: unused,
    insertInstructionApproval: unused,
    insertConfiguration: unused,
    getConfiguration: vi.fn(async (id) =>
      configurations.has(id) ? copy(configurations.get(id)!) : null,
    ),
    getDefinition: vi.fn(async (id) =>
      definitions.has(id) ? copy(definitions.get(id)!) : null,
    ),
    getTrial: vi.fn(async (id) =>
      trials.has(id) ? copy(trials.get(id)!) : null,
    ),
    getAssessment: vi.fn(async (id) =>
      assessments.has(id) ? copy(assessments.get(id)!) : null,
    ),
    getReportPopulation: vi.fn(async (id) => {
      const populationTrials = [...trials.values()].filter(
        (trial) => trial.definitionId === id,
      );
      const trialIds = new Set(populationTrials.map((trial) => trial.id));
      const result = {
        trials: populationTrials,
        assessments: [...assessments.values()].filter((assessment) =>
          trialIds.has(assessment.trialId),
        ),
        configurations: [...configurations.values()].filter(
          (configuration) =>
            !state.omittedJudge || configuration.id !== judgeId,
        ),
      };
      if (state.reversePopulation)
        for (const rows of Object.values(result)) rows.reverse();
      return copy(result);
    }),
    getProposal: vi.fn(async (id) =>
      proposals.has(id) ? copy(proposals.get(id)!) : null,
    ),
    insertProposal: vi.fn(async (record) => {
      proposals.set(record.id, copy(record));
      return record;
    }),
    listProposals: vi.fn(async ({ limit, afterId, asOf }) => {
      if (afterId !== null) {
        const anchor = proposals.get(afterId);
        if (
          !anchor ||
          anchor.projectId !== active?.request.projectId ||
          anchor.environment !== active?.request.environment ||
          foundationInstantMilliseconds(anchor.recordedAt) >
            foundationInstantMilliseconds(asOf)
        )
          throw new FoundationError("INVALID_REFERENCE");
      }
      const eligible = [...proposals.values()]
        .filter(
          (record) =>
            record.projectId === active?.request.projectId &&
            record.environment === active?.request.environment &&
            foundationInstantMilliseconds(record.recordedAt) <=
              foundationInstantMilliseconds(asOf) &&
            (afterId === null || record.id > afterId),
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const items = eligible.slice(0, limit);
      return {
        items: copy(items),
        nextAfterId: eligible.length > limit ? items.at(-1)!.id : null,
      };
    }),
    getCurrentDecision: vi.fn(async (id) =>
      decisions.has(id) ? copy(decisions.get(id)!) : null,
    ),
    insertDecision: vi.fn(async (record, expectedVersion) => {
      if ((decisions.get(record.proposalId)?.version ?? 0) !== expectedVersion)
        throw new FoundationError("VERSION_CONFLICT");
      decisions.set(record.proposalId, copy(record));
      return record;
    }),
  };
  const port: FoundationImprovementPort = {
    async withClient(request, action) {
      requests.push(request);
      if (request.tokenDigest !== foundationTokenDigest(token) || !state.client)
        throw new FoundationError("INVALID_CREDENTIAL");
      requireFoundationGrant(state.client, {
        ...request,
        now: new Date(clock.now),
      });
      active = { request, principalId: "foundation-client:" + state.client.id };
      const result = await action(state.client, records);
      requireFoundationGrant(state.client, {
        ...request,
        now: new Date(clock.now),
      });
      return result;
    },
    async withOwner(request, action) {
      requests.push(request);
      if (
        !state.ownerActive ||
        request.principalId !== owner.principalId ||
        foundationInstantMilliseconds(request.expiresAt) <= clock.now
      )
        throw new FoundationError("FORBIDDEN");
      active = { request, principalId: request.principalId };
      const result = await action(records);
      if (
        !state.ownerActive ||
        foundationInstantMilliseconds(request.expiresAt) <= clock.now
      )
        throw new FoundationError("FORBIDDEN");
      return result;
    },
  };
  let nextId = 1000;
  const options = {
    environment: "test" as const,
    now: () => new Date(clock.now),
    createId: () => uuid(nextId++),
  };
  const service = createFoundationImprovementService(port, options);
  const propose = (key = "proposal-key") => service.propose(token, key, value);
  const detail = async () => {
    const result = await propose();
    return service.get(token, { projectId, id: result.record.id });
  };
  const reviewInput = async (
    decision: "accepted" | "rejected" | "revoked" = "accepted",
  ): Promise<FoundationImprovementDecisionInput> => {
    const current = await detail();
    return {
      projectId,
      proposalId: current.proposal.id,
      expectedProposalDigest: current.proposal.contentDigest,
      expectedPopulationDigest: current.advisory.populationDigest,
      expectedReportDigest: current.advisory.reportDigest,
      expectedDecisionVersion: current.currentDecision?.version ?? 0,
      decision,
      reason: "Owner reviewed the exact current report",
      expiresAt: "2026-10-17T12:00:00.000Z",
    };
  };
  return {
    clock,
    configurations,
    definitions,
    trials,
    assessments,
    value,
    proposals,
    decisions,
    receipts,
    requests,
    state,
    records,
    port,
    options,
    service,
    propose,
    detail,
    reviewInput,
  };
}
type Fixture = ReturnType<typeof fixture>;

function changeAssessment(
  f: Fixture,
  id: string,
  patch: Partial<FoundationAssessment>,
) {
  f.assessments.set(id, { ...f.assessments.get(id)!, ...patch });
}
function changeTrial(
  f: Fixture,
  id: string,
  patch: Partial<FoundationEvaluationTrial>,
) {
  f.trials.set(id, { ...f.trials.get(id)!, ...patch });
}

describe("improvement proposals and historical reference validation", () => {
  it("records the server actor/digest and preserves the original older baseline motivation", async () => {
    const f = fixture();
    const result = await f.propose();
    expect(result.replayed).toBe(false);
    expect(result.record).toMatchObject({
      schemaVersion: 1,
      version: 1,
      definitionId,
      recordedBy: "foundation-client:" + clientId,
      environment: "test",
      recordedAt: nowAt,
      motivations: [{ assessmentId: oldAssessmentId, assessmentVersion: 1 }],
    });
    const { contentDigest, ...content } = result.record;
    expect(contentDigest).toBe(foundationDigest(content));
    expect(f.records.getReportPopulation).not.toHaveBeenCalled();
    expect(f.requests[0]).toMatchObject({
      operation: "improvement.propose",
      targetId: null,
      projectId,
      environment: "test",
    });
    expect(f.definitions.get(oldDefinitionId)!.cases[0]!.rubricDigest).not.toBe(
      f.definitions.get(definitionId)!.cases[0]!.rubricDigest,
    );
  });
  it.each<[string, (f: Fixture) => void]>([
    [
      "candidate parent",
      (f) => {
        f.configurations.get(candidateId)!.parentIds = [];
      },
    ],
    [
      "unsupported candidate kind",
      (f) => {
        f.configurations.get(candidateId)!.kind = "settings";
      },
    ],
    [
      "different baseline kind",
      (f) => {
        f.configurations.get(baselineId)!.kind = "skill";
      },
    ],
    [
      "configuration hash",
      (f) => {
        f.configurations.get(candidateId)!.content += "tampered";
      },
    ],
    [
      "foreign configuration",
      (f) => {
        f.configurations.get(sharedId)!.projectId = uuid(999);
      },
    ],
    [
      "missing configuration",
      (f) => {
        f.configurations.delete(sharedId);
      },
    ],
    [
      "foreign definition",
      (f) => {
        f.definitions.get(definitionId)!.projectId = uuid(999);
      },
    ],
    [
      "incomplete conditions",
      (f) => {
        f.definitions.get(definitionId)!.conditions.push("missing");
      },
    ],
    [
      "extra subject configuration",
      (f) => {
        f.definitions.get(definitionId)!.configurationIds.push(judgeId);
      },
    ],
    [
      "foreign historical definition",
      (f) => {
        f.definitions.get(oldDefinitionId)!.projectId = uuid(999);
      },
    ],
    [
      "foreign assessment",
      (f) => changeAssessment(f, oldAssessmentId, { projectId: uuid(999) }),
    ],
    [
      "wrong assessment version",
      (f) => changeAssessment(f, oldAssessmentId, { version: 2 }),
    ],
    [
      "unreviewed assessment",
      (f) =>
        changeAssessment(f, oldAssessmentId, { reviewStatus: "unreviewed" }),
    ],
    [
      "nonfailing required gate",
      (f) =>
        changeAssessment(f, oldAssessmentId, {
          checks: [{ id: "required", hardGate: true, result: "pass" }],
        }),
    ],
    [
      "unrelated failing check",
      (f) =>
        changeAssessment(f, oldAssessmentId, {
          checks: [{ id: "optional", hardGate: true, result: "fail" }],
        }),
    ],
    [
      "wrong rubric",
      (f) =>
        changeAssessment(f, oldAssessmentId, { rubricDigest: hash("wrong") }),
    ],
    [
      "wrong artifact",
      (f) =>
        changeAssessment(f, oldAssessmentId, {
          trialArtifactDigest: hash("wrong"),
        }),
    ],
    [
      "missing judge",
      (f) =>
        changeAssessment(f, oldAssessmentId, {
          judgeConfigurationId: uuid(999),
        }),
    ],
    [
      "foreign judge",
      (f) => {
        f.configurations.get(judgeId)!.projectId = uuid(999);
      },
    ],
    [
      "foreign trial",
      (f) => changeTrial(f, oldTrialId, { projectId: uuid(999) }),
    ],
    [
      "wrong historical definition",
      (f) => changeTrial(f, oldTrialId, { definitionId }),
    ],
    [
      "wrong historical case",
      (f) => changeTrial(f, oldTrialId, { caseId: "other" }),
    ],
    [
      "wrong fixture",
      (f) => changeTrial(f, oldTrialId, { inputDigest: hash("wrong") }),
    ],
    ["wrong repetition", (f) => changeTrial(f, oldTrialId, { repetition: 2 })],
    [
      "wrong condition",
      (f) => changeTrial(f, oldTrialId, { condition: "wrong" }),
    ],
    [
      "failed historical trial",
      (f) => changeTrial(f, oldTrialId, { outcome: "failed" }),
    ],
    [
      "candidate in historical trial",
      (f) =>
        changeTrial(f, oldTrialId, {
          configurationIds: [baselineId, candidateId],
        }),
    ],
    [
      "baseline absent from trial",
      (f) => changeTrial(f, oldTrialId, { configurationIds: [sharedId] }),
    ],
    [
      "missing assessment",
      (f) => {
        f.assessments.delete(oldAssessmentId);
      },
    ],
  ])("rejects %s before inserting a proposal", async (_name, mutate) => {
    const f = fixture();
    mutate(f);
    await expect(f.propose()).rejects.toThrow(error("INVALID_REFERENCE"));
    expect(f.records.insertProposal).not.toHaveBeenCalled();
  });
  it("strictly rejects spoofed fields, invalid keys and oversized UTF8 before access", async () => {
    const f = fixture();
    for (const value of [
      { ...f.value, recordedBy: "user:spoof" },
      { ...f.value, environment: "production" },
      { ...f.value, rationale: "x".repeat(140000) },
    ])
      await expect(f.service.propose(token, "key", value)).rejects.toThrow();
    for (const key of [" invalid", "a\n", "a".repeat(201), {}])
      await expect(f.service.propose(token, key, f.value)).rejects.toThrow();
    expect(f.requests).toHaveLength(0);
  });
  it("never invokes spoofed getters and detaches input before the first await", async () => {
    const f = fixture();
    let invoked = false;
    const raw = Object.defineProperty({ ...f.value }, "rationale", {
      enumerable: true,
      get() {
        invoked = true;
        return "spoof";
      },
    });
    await expect(f.service.propose(token, "key", raw)).rejects.toThrow(
      error("INVALID_REFERENCE"),
    );
    expect(invoked).toBe(false);
    const pending = f.propose();
    f.value.rationale = "mutated by caller";
    expect((await pending).record.rationale).toBe(
      "A reviewed baseline hard gate failed",
    );
  });
  it("validates producer descriptors without invoking getters", async () => {
    const f = fixture();
    let invoked = false;
    const raw = Object.defineProperty(
      { ...f.configurations.get(baselineId)! },
      "content",
      {
        enumerable: true,
        get() {
          invoked = true;
          return "baseline";
        },
      },
    );
    vi.mocked(f.records.getConfiguration).mockResolvedValueOnce(raw);
    await expect(f.propose()).rejects.toThrow(unavailable);
    expect(invoked).toBe(false);
  });
  it("rejects producer mutation across the await before trusting content", async () => {
    const f = fixture(),
      raw = copy(f.configurations.get(baselineId)!);
    vi.mocked(f.records.getConfiguration).mockImplementationOnce(async () => {
      queueMicrotask(() => {
        raw.content = "producer mutation";
      });
      return raw;
    });
    await expect(f.propose()).rejects.toThrow(error("INVALID_REFERENCE"));
    expect(f.records.insertProposal).not.toHaveBeenCalled();
  });
});

describe("current improvement advisories", () => {
  it("computes stable population/report digests across ordering, clock changes and missing cached judge rows", async () => {
    const f = fixture(),
      first = await f.detail();
    expect(first.advisory).toMatchObject({
      eligibleForReview: true,
      pendingNewerAssessmentCount: 0,
      blockers: [],
    });
    expect(first.advisory.comparisons[0]!.counts).toMatchObject({
      expectedCells: 2,
      observedCells: 2,
      passedCells: 2,
      attemptCount: 2,
    });
    f.state.reversePopulation = true;
    f.state.omittedJudge = true;
    f.clock.now += 1000;
    const second = await f.service.getOwner(owner, {
      projectId,
      id: first.proposal.id,
    });
    expect(second.advisory.populationDigest).toBe(
      first.advisory.populationDigest,
    );
    expect(second.advisory.reportDigest).toBe(first.advisory.reportDigest);
    expect(second.advisory.evaluatedAt).not.toBe(first.advisory.evaluatedAt);
    expect(f.requests.at(-1)).toMatchObject({
      operation: "improvement.read",
      targetId: first.proposal.id,
      principalId: owner.principalId,
    });
  });
  it("includes a selected judge snapshot with no assessment in both digests", async () => {
    const f = fixture(),
      extraJudgeId = uuid(70);
    f.configurations.set(extraJudgeId, {
      ...f.configurations.get(judgeId)!,
      id: extraJudgeId,
      content: "unused judge",
      contentDigest: hash("unused judge"),
    });
    f.value.judgeConfigurationIds.push(extraJudgeId);
    const first = await f.detail();
    const extra = f.configurations.get(extraJudgeId)!;
    extra.content = "changed unused judge";
    extra.contentDigest = hash(extra.content);
    const second = await f.service.get(token, {
      projectId,
      id: first.proposal.id,
    });
    expect(second.advisory.populationDigest).not.toBe(
      first.advisory.populationDigest,
    );
    expect(second.advisory.reportDigest).not.toBe(first.advisory.reportDigest);
    f.configurations.delete(extraJudgeId);
    await expect(
      f.service.get(token, { projectId, id: first.proposal.id }),
    ).rejects.toThrow(error("INVALID_REFERENCE"));
  });
  it("counts missing and unreviewed assessment cells without removing attempts", async () => {
    for (const pending of [false, true]) {
      const f = fixture();
      if (pending)
        changeAssessment(f, uuid(32), { reviewStatus: "unreviewed" });
      else f.assessments.delete(uuid(32));
      const current = await f.detail();
      expect(current.advisory).toMatchObject({
        eligibleForReview: false,
        pendingNewerAssessmentCount: pending ? 1 : 0,
      });
      expect(current.advisory.comparisons[0]!.counts).toMatchObject({
        expectedCells: 2,
        observedCells: 2,
        passedCells: 1,
        unassessedCells: 1,
        attemptCount: 2,
      });
      expect(current.advisory.blockers).toContain(
        "missing_reviewed_assessment",
      );
    }
  });
  it("keeps baseline-failure blockers, chooses higher reviewed and counts newer pending assessments", async () => {
    const f = fixture();
    changeAssessment(f, uuid(22), {
      checks: [{ id: "required", hardGate: false, result: "fail" }],
    });
    changeAssessment(f, uuid(32), {
      checks: [{ id: "required", hardGate: true, result: "fail" }],
    });
    f.assessments.set(uuid(50), {
      ...f.assessments.get(uuid(32))!,
      id: uuid(50),
      version: 2,
      checks: [{ id: "required", hardGate: true, result: "pass" }],
    });
    f.assessments.set(uuid(51), {
      ...f.assessments.get(uuid(32))!,
      id: uuid(51),
      version: 3,
      reviewStatus: "unreviewed",
    });
    const current = await f.detail();
    expect(current.advisory.eligibleForReview).toBe(false);
    expect(current.advisory.blockers).toContain("check_not_passed");
    expect(current.advisory.pendingNewerAssessmentCount).toBe(1);
    expect(current.advisory.comparisons[0]!.counts.failedCells).toBe(1);
    expect(current.advisory.comparisons[0]!.pendingNewerAssessmentCount).toBe(
      1,
    );
    expect(current.proposal.motivations[0]!.assessmentId).toBe(oldAssessmentId);
  });
  it.each(["missing", "failed", "unsupported", "ambiguous"] as const)(
    "retains the full denominator for %s attempts",
    async (kind) => {
      const f = fixture();
      if (kind === "missing") {
        f.trials.delete(uuid(30));
        f.assessments.delete(uuid(32));
      } else if (kind === "ambiguous") {
        f.trials.set(uuid(60), {
          ...f.trials.get(uuid(30))!,
          id: uuid(60),
          attemptId: uuid(61),
        });
      } else changeTrial(f, uuid(30), { outcome: kind });
      const current = await f.detail();
      expect(current.advisory.eligibleForReview).toBe(false);
      expect(current.advisory.comparisons[0]!.counts.expectedCells).toBe(2);
      expect(current.advisory.comparisons[0]!.counts.passedCells).toBe(1);
      if (kind === "ambiguous")
        expect(current.advisory.comparisons[0]!.counts).toMatchObject({
          attemptCount: 3,
          ambiguousCells: 1,
        });
    },
  );
  it("does not discard foreign rows or silently normalize corrupt population records", async () => {
    const f = fixture();
    const parent = await f.propose();
    changeTrial(f, uuid(20), { projectId: uuid(999) });
    await expect(
      f.service.get(token, { projectId, id: parent.record.id }),
    ).rejects.toThrow(error("INVALID_REFERENCE"));
    changeTrial(f, uuid(20), { projectId: projectId.toUpperCase() });
    {
      vi.mocked(f.records.getReportPopulation).mockResolvedValueOnce({
        trials: [
          {
            ...f.trials.get(uuid(20))!,
            id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
          },
        ],
        assessments: [],
        configurations: [],
      });
    }
    await expect(
      f.service.get(token, { projectId, id: parent.record.id }),
    ).rejects.toThrow(unavailable);
  });
  it("rejects a substituted proposal, bad digest or wrong environment", async () => {
    const f = fixture(),
      parent = (await f.propose()).record;
    f.proposals.set(parent.id, { ...parent, rationale: "changed" });
    await expect(
      f.service.get(token, { projectId, id: parent.id }),
    ).rejects.toThrow(unavailable);
    const { contentDigest: _digest, ...content } = parent;
    f.proposals.set(
      parent.id,
      signed({ ...content, environment: "local" as const }),
    );
    await expect(
      f.service.get(token, { projectId, id: parent.id }),
    ).rejects.toThrow(error("INVALID_REFERENCE"));
    f.proposals.delete(parent.id);
    await expect(
      f.service.get(token, { projectId, id: parent.id }),
    ).rejects.toThrow(error("NOT_FOUND"));
  });
});

describe("immutable proposal and owner decision receipts", () => {
  it("replays the exact original proposal after references/report change without new effects", async () => {
    const f = fixture(),
      original = await f.propose();
    f.assessments.clear();
    f.definitions.clear();
    const replay = await f.propose();
    expect(replay).toEqual({ ...original, replayed: true });
    expect(f.records.insertProposal).toHaveBeenCalledTimes(1);
    await expect(
      f.service.propose(token, "proposal-key", {
        ...f.value,
        rationale: "different",
      }),
    ).rejects.toThrow(error("IDEMPOTENCY_CONFLICT"));
  });
  it("records accepted/rejected/revoked CAS versions and exposes an older decision after advisory changes", async () => {
    const f = fixture();
    const accepted = await f.service.review(
      owner,
      "accepted",
      await f.reviewInput(),
    );
    expect(accepted.record).toMatchObject({
      version: 1,
      recordedBy: owner.principalId,
      decision: "accepted",
    });
    const rejected = await f.service.review(
      owner,
      "rejected",
      await f.reviewInput("rejected"),
    );
    const revoked = await f.service.review(
      owner,
      "revoked",
      await f.reviewInput("revoked"),
    );
    expect([rejected.record.version, revoked.record.version]).toEqual([2, 3]);
    changeTrial(f, uuid(30), { outcome: "failed" });
    const current = await f.detail();
    expect(current.advisory.eligibleForReview).toBe(false);
    expect(current.currentDecision).toEqual(revoked.record);
    expect(current.currentDecision!.expectedReportDigest).not.toBe(
      current.advisory.reportDigest,
    );
    expect(
      f.requests.filter(
        (request) => request.operation === "improvement.review",
      ),
    ).toHaveLength(3);
  });
  it("replays an old decision after advisory/decision changes but enforces exact input and current expiry", async () => {
    const f = fixture(),
      value = await f.reviewInput();
    const original = await f.service.review(owner, "review-key", value);
    await f.service.review(owner, "revoke-key", await f.reviewInput("revoked"));
    changeTrial(f, uuid(30), { outcome: "unsupported" });
    expect(await f.service.review(owner, "review-key", value)).toEqual({
      ...original,
      replayed: true,
    });
    await expect(
      f.service.review(owner, "review-key", { ...value, reason: "different" }),
    ).rejects.toThrow(error("IDEMPOTENCY_CONFLICT"));
    f.clock.now = Date.parse(value.expiresAt);
    await expect(
      f.service.review(
        { ...owner, expiresAt: "2026-11-16T12:00:00Z" },
        "review-key",
        value,
      ),
    ).rejects.toThrow(error("INVALID_REFERENCE"));
  });
  it.each([
    "insert",
    "new receipt",
    "replayed receipt",
    "owner delivery",
  ] as const)(
    "rejects decision expiry crossed during awaited %s with a live owner",
    async (boundary) => {
      const f = fixture(),
        value = await f.reviewInput();
      value.expiresAt = new Date(f.clock.now + 1000).toISOString();
      if (boundary === "replayed receipt")
        await f.service.review(owner, "deadline-key", value);
      if (boundary === "insert") {
        const insert = vi
          .mocked(f.records.insertDecision)
          .getMockImplementation()!;
        vi.mocked(f.records.insertDecision).mockImplementationOnce(
          async (record, expectedVersion) => {
            const result = await insert(record, expectedVersion);
            f.clock.now = Date.parse(value.expiresAt);
            return result;
          },
        );
      } else if (boundary === "owner delivery") {
        const withOwner = f.port.withOwner;
        f.port.withOwner = async (request, action) => {
          const result = await withOwner(request, action);
          f.clock.now = Date.parse(value.expiresAt);
          return result;
        };
      } else {
        const idempotent = f.records.idempotent;
        f.records.idempotent = async <T>(
          key: string,
          digest: string,
          perform: () => Promise<T>,
        ) => {
          const result = await idempotent(key, digest, perform);
          f.clock.now = Date.parse(value.expiresAt);
          return result;
        };
      }
      await expect(
        f.service.review(owner, "deadline-key", value),
      ).rejects.toThrow(error("INVALID_REFERENCE"));
      expect(f.clock.now).toBeLessThan(Date.parse(owner.expiresAt));
      expect(f.records.insertDecision).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps expired current decisions visible as historical GET records", async () => {
    const f = fixture(),
      value = await f.reviewInput();
    value.expiresAt = new Date(f.clock.now + 1000).toISOString();
    const original = await f.service.review(owner, "historical-expiry", value);
    f.clock.now = Date.parse(value.expiresAt);
    const current = await f.service.getOwner(owner, {
      projectId,
      id: value.proposalId,
    });
    expect(current.currentDecision).toEqual(original.record);
  });
  it.each([
    "expectedProposalDigest",
    "expectedPopulationDigest",
    "expectedReportDigest",
    "expectedDecisionVersion",
  ] as const)("rejects stale %s", async (field) => {
    const f = fixture(),
      value = await f.reviewInput();
    await expect(
      f.service.review(owner, "stale-key", {
        ...value,
        [field]: field === "expectedDecisionVersion" ? 1 : hash("stale"),
      }),
    ).rejects.toThrow(error("VERSION_CONFLICT"));
    expect(f.records.insertDecision).not.toHaveBeenCalled();
  });
  it("requires current eligibility for acceptance while allowing rejection and revocation", async () => {
    const f = fixture();
    changeTrial(f, uuid(30), { outcome: "failed" });
    await expect(
      f.service.review(owner, "accept", await f.reviewInput()),
    ).rejects.toThrow(error("APPROVAL_REQUIRED"));
    expect(
      (await f.service.review(owner, "reject", await f.reviewInput("rejected")))
        .record.version,
    ).toBe(1);
    expect(
      (await f.service.review(owner, "revoke", await f.reviewInput("revoked")))
        .record.version,
    ).toBe(2);
  });
  it.each([nowAt, "2026-11-15T12:00:00.001Z", "2026-11-15T12:00:00.0001Z"])(
    "rejects expired or beyond-30-day decision expiry %s",
    async (expiresAt) => {
      const f = fixture(),
        value = await f.reviewInput();
      await expect(
        f.service.review(owner, "expiry-key", { ...value, expiresAt }),
      ).rejects.toThrow(error("INVALID_REFERENCE"));
      expect(f.records.insertDecision).not.toHaveBeenCalled();
    },
  );
  it("rejects decision version overflow and corrupt current decisions", async () => {
    const f = fixture(),
      value = await f.reviewInput();
    const accepted = await f.service.review(owner, "first", value);
    const { contentDigest: _digest, ...content } = accepted.record;
    f.decisions.set(
      value.proposalId,
      signed({
        ...content,
        expectedDecisionVersion: 2147483646,
        version: 2147483647,
      }),
    );
    await expect(
      f.service.review(owner, "overflow", {
        ...value,
        expectedDecisionVersion: 2147483647,
      }),
    ).rejects.toThrow(error("VERSION_CONFLICT"));
    f.decisions.set(value.proposalId, {
      ...accepted.record,
      reason: "tampered",
    });
    await expect(f.detail()).rejects.toThrow(unavailable);
  });
  it("rejects changed inserted output and a corrupted historical record/correlation/result", async () => {
    const f = fixture();
    vi.mocked(f.records.insertProposal).mockImplementationOnce(
      async (record) => {
        const { contentDigest: _digest, ...content } = record;
        return signed({ ...content, rationale: "substituted" });
      },
    );
    await expect(f.propose()).rejects.toThrow(unavailable);
    const g = fixture(),
      original = await g.propose();
    const saved = [...g.receipts.values()][0]!;
    saved.value = {
      record: {
        ...original.record,
        recordedBy: "foundation-client:" + uuid(999),
      },
      correlationId: original.correlationId,
    };
    const { record } = saved.value as { record: FoundationImprovementProposal };
    const { contentDigest: _digest, ...content } = record;
    saved.value = {
      record: signed(content),
      correlationId: original.correlationId,
    };
    saved.responseDigest = foundationDigest(saved.value);
    await expect(g.propose()).rejects.toThrow(unavailable);
    saved.value = { record: original.record, correlationId: "invalid" };
    saved.responseDigest = foundationDigest(saved.value);
    await expect(g.propose()).rejects.toThrow(unavailable);
    vi.spyOn(g.records, "idempotent").mockResolvedValueOnce({
      value: { record: original.record, correlationId: original.correlationId },
      replayed: "yes",
    } as never);
    await expect(g.propose()).rejects.toThrow(unavailable);
  });
});

describe("authority, await boundaries and callback completion", () => {
  it.each<[string, (f: Fixture) => void, string]>([
    [
      "missing",
      (f) => {
        f.state.client = null;
      },
      "INVALID_CREDENTIAL",
    ],
    [
      "wrong project",
      (f) => {
        f.state.client!.projectId = uuid(999);
      },
      "FORBIDDEN",
    ],
    [
      "wrong environment",
      (f) => {
        f.state.client!.environment = "local";
      },
      "FORBIDDEN",
    ],
    [
      "expired",
      (f) => {
        f.state.client!.expiresAt = nowAt;
      },
      "EXPIRED",
    ],
    [
      "revoked",
      (f) => {
        f.state.client!.revokedAt = nowAt;
      },
      "REVOKED",
    ],
    [
      "missing capability",
      (f) => {
        f.state.client!.operations = ["improvement.read"];
      },
      "FORBIDDEN",
    ],
  ])(
    "reauthorizes %s clients before every operation/replay",
    async (_name, mutate, code) => {
      const f = fixture();
      await f.propose();
      mutate(f);
      await expect(f.propose()).rejects.toThrow(error(code));
      expect(f.records.insertProposal).toHaveBeenCalledTimes(1);
    },
  );
  it("requires a currently live owner adapter session and expiry", async () => {
    const f = fixture(),
      value = await f.reviewInput();
    f.state.ownerActive = false;
    await expect(f.service.review(owner, "key", value)).rejects.toThrow(
      error("FORBIDDEN"),
    );
    f.state.ownerActive = true;
    await expect(
      f.service.review({ ...owner, expiresAt: nowAt }, "key", value),
    ).rejects.toThrow(error("FORBIDDEN"));
    await expect(
      f.service.review(
        { ...owner, principalId: "machine:spoof" },
        "key",
        value,
      ),
    ).rejects.toThrow(error("FORBIDDEN"));
    expect(f.records.insertDecision).not.toHaveBeenCalled();
  });
  it("guards success and failure await gaps before additional effects", async () => {
    const f = fixture();
    vi.mocked(f.records.getConfiguration).mockImplementationOnce(async () => {
      f.clock.now = Date.parse(f.state.client!.expiresAt);
      return copy(f.configurations.get(baselineId)!);
    });
    await expect(f.propose()).rejects.toThrow(error("EXPIRED"));
    expect(f.records.getConfiguration).toHaveBeenCalledTimes(1);
    expect(f.records.insertProposal).not.toHaveBeenCalled();
    const g = fixture();
    vi.mocked(g.records.getConfiguration).mockImplementationOnce(async () => {
      g.clock.now = Date.parse(g.state.client!.expiresAt);
      throw new Error("producer failure");
    });
    await expect(g.propose()).rejects.toThrow(error("EXPIRED"));
  });
  it("guards owner expiry during report reads", async () => {
    const f = fixture(),
      value = await f.reviewInput();
    vi.mocked(f.records.getReportPopulation).mockImplementationOnce(
      async () => {
        f.clock.now = Date.parse(owner.expiresAt);
        return { trials: [], assessments: [], configurations: [] };
      },
    );
    await expect(f.service.review(owner, "key", value)).rejects.toThrow(
      error("FORBIDDEN"),
    );
    expect(f.records.insertDecision).not.toHaveBeenCalled();
  });
  it("rejects omitted, duplicate, substituted and incomplete callback delivery", async () => {
    const f = fixture();
    const skipped: FoundationImprovementPort = {
      ...f.port,
      async withClient() {
        return undefined as never;
      },
    };
    await expect(
      createFoundationImprovementService(skipped, f.options).propose(
        token,
        "key",
        f.value,
      ),
    ).rejects.toThrow(unavailable);
    const duplicate: FoundationImprovementPort = {
      ...f.port,
      async withClient(request, action) {
        const result = await f.port.withClient(request, action);
        await action(f.state.client!, f.records);
        return result;
      },
    };
    await expect(
      createFoundationImprovementService(duplicate, f.options).propose(
        token,
        "key",
        f.value,
      ),
    ).rejects.toThrow(unavailable);
    const substituted: FoundationImprovementPort = {
      ...f.port,
      async withClient(request, action) {
        await f.port.withClient(request, action);
        return { spoof: true } as never;
      },
    };
    await expect(
      createFoundationImprovementService(substituted, f.options).propose(
        token,
        "key",
        f.value,
      ),
    ).rejects.toThrow(unavailable);
    let settle: ((value: FoundationConfiguration | null) => void) | undefined;
    const pending = fixture();
    vi.mocked(pending.records.getConfiguration).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const incomplete: FoundationImprovementPort = {
      ...pending.port,
      async withClient(request, action) {
        void pending.port.withClient(request, action).catch(() => undefined);
        return undefined as never;
      },
    };
    await expect(
      createFoundationImprovementService(incomplete, pending.options).propose(
        token,
        "key",
        pending.value,
      ),
    ).rejects.toThrow(unavailable);
    settle!(copy(pending.configurations.get(baselineId)!));
    await Promise.resolve();
    await Promise.resolve();
    expect(pending.records.insertProposal).not.toHaveBeenCalled();
  });
});

describe("complete proposal list traversal", () => {
  it("reaches more than 25 rows, permits changing page size and preserves the initial cutoff", async () => {
    const f = fixture();
    for (let index = 0; index < 31; index++) await f.propose("key-" + index);
    let page = await f.service.list(token, { projectId, limit: 12 });
    const ids = page.items.map((record) => record.id);
    f.clock.now += 1000;
    const late = await f.propose("late-key");
    while (page.nextCursor) {
      page = await f.service.list(token, {
        projectId,
        limit: 7,
        cursor: page.nextCursor,
      });
      ids.push(...page.items.map((record) => record.id));
    }
    expect(ids).toHaveLength(31);
    expect(new Set(ids).size).toBe(31);
    expect(ids).not.toContain(late.record.id);
    const ownerPage = await f.service.listOwner(owner, {
      projectId,
      limit: 100,
    });
    expect(ownerPage.items).toHaveLength(32);
    expect(f.requests.at(-1)).toMatchObject({
      operation: "improvement.read",
      targetId: null,
    });
  });
  it("rejects a foreign principal cursor and an adapter-invalid anchor/cutoff", async () => {
    const f = fixture();
    for (let index = 0; index < 3; index++) await f.propose("key-" + index);
    const page = await f.service.list(token, { projectId, limit: 1 });
    await expect(
      f.service.listOwner(owner, {
        projectId,
        limit: 1,
        cursor: page.nextCursor!,
      }),
    ).rejects.toThrow(error("INVALID_REFERENCE"));
    const binding = {
      projectId,
      environment: "test" as const,
      principalId: "foundation-client:" + clientId,
      operation: "improvement.read" as const,
    };
    const invalidCursor = foundationWorkflowPageCursor(
      binding,
      { asOf: nowAt, afterId: null },
      uuid(999),
    );
    await expect(
      f.service.list(token, { projectId, limit: 1, cursor: invalidCursor }),
    ).rejects.toThrow(error("INVALID_REFERENCE"));
    const anchor = page.items[0]!;
    const pastCursor = foundationWorkflowPageCursor(
      binding,
      { asOf: at, afterId: null },
      anchor.id,
    );
    await expect(
      f.service.list(token, { projectId, limit: 1, cursor: pastCursor }),
    ).rejects.toThrow(error("INVALID_REFERENCE"));
  });
  it.each([
    "duplicate",
    "order",
    "future",
    "continuation",
    "terminal",
    "foreign",
    "environment",
  ] as const)("rejects malformed %s list results", async (kind) => {
    const f = fixture(),
      first = (await f.propose("one")).record,
      second = (await f.propose("two")).record;
    let items = [first, second],
      nextAfterId: string | null = null;
    if (kind === "duplicate") items = [first, first];
    if (kind === "order") items.reverse();
    if (kind === "continuation") nextAfterId = uuid(999);
    if (kind === "terminal") {
      items = [];
      nextAfterId = first.id;
    }
    if (kind === "future" || kind === "foreign" || kind === "environment") {
      const { contentDigest: _digest, ...content } = first;
      items = [
        signed({
          ...content,
          ...(kind === "future"
            ? { recordedAt: "2026-10-16T12:00:00.0001Z" }
            : kind === "foreign"
              ? { projectId: uuid(999) }
              : { environment: "local" as const }),
        }),
        second,
      ];
    }
    vi.mocked(f.records.listProposals).mockResolvedValueOnce({
      items,
      nextAfterId,
    });
    await expect(
      f.service.list(token, { projectId, limit: 2 }),
    ).rejects.toThrow(error("INVALID_REFERENCE"));
  });
});
