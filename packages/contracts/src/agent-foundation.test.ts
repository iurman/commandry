import assert from "node:assert/strict";
import { test } from "vitest";
import * as foundation from "./agent-foundation.js";

const uuid = (index: number) =>
  `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const projectId = uuid(1);
const memoryId = uuid(2);
const evidenceId = uuid(3);
const configurationId = uuid(4);
const timestamp = "2026-10-15T12:30:00+02:00";
const contentDigest = "a".repeat(64);
const content = {
  statement: "Keep the exact source wording.\n",
  category: "finding",
  evidenceIds: [evidenceId],
  relatedMemoryIds: [],
  relationType: null,
};
const evidenceInput = {
  projectId,
  sourceKind: "knowledge_revision",
  sourceId: "revision-1",
  sourceVersion: "1",
  contentDigest,
  locator: "knowledge://item/revision/1",
  observedAt: timestamp,
  availability: "available",
};
const actor = {
  schemaVersion: 1,
  principalId: "owner-1",
  clientId: null,
  runId: null,
  capabilities: ["foundation.read", "memory.propose"],
  projectId,
  resourceIds: [],
  environment: "test",
  expiresAt: timestamp,
  correlationId: uuid(5),
};
const evidence = {
  ...evidenceInput,
  schemaVersion: 1,
  id: evidenceId,
  ingestedAt: timestamp,
  recordedBy: "owner-1",
  verification: "unverified",
};
const alias = { namespace: "source-system", externalId: "stable-identity" };
const proposal = { projectId, knowledgeItemId: uuid(6), content, alias };
const revision = { projectId, memoryId, expectedVersion: 1, content };
const memory = {
  schemaVersion: 1,
  id: memoryId,
  projectId,
  knowledgeItemId: uuid(6),
  version: 1,
  contentDigest,
  content,
  lifecycle: "proposed",
  verification: "unverified",
  recordedBy: "owner-1",
  recordedAt: timestamp,
};
const review = {
  projectId,
  memoryId,
  expectedVersion: 1,
  decision: "accepted",
  reason: "Reviewed the exact revision.",
};
const verification = {
  projectId,
  memoryId,
  expectedVersion: 1,
  verification: "independently_verified",
  evidenceIds: [evidenceId],
  reason: "Independent corroboration is attached.",
};
const approval = {
  projectId,
  memoryId,
  expectedVersion: 1,
  contentDigest,
  disclosureProjectId: projectId,
  expiresAt: timestamp,
};
const workingContext = {
  schemaVersion: 1,
  projectId,
  generatedAt: timestamp,
  sourceVersions: [{ evidenceId, contentDigest }],
  instructionVersions: [
    { memoryId, version: 1, contentDigest, approvalId: uuid(7) },
  ],
  omissions: [{ reason: "Character budget", count: 1 }],
  freshness: "unknown",
  contentDigest,
  budget: {
    maxCharacters: 2000,
    usedCharacters: 1500,
    tokenEstimate: null,
    tokenizer: null,
  },
  continuation: "next-page",
};
const configuration = {
  schemaVersion: 1,
  id: configurationId,
  projectId,
  kind: "prompt",
  content: "  Preserve exact content.\n",
  contentDigest,
  parentIds: [],
  sourceCommit: null,
  recordedAt: timestamp,
  recordedBy: "owner-1",
};
const evaluationDefinition = {
  schemaVersion: 1,
  id: uuid(8),
  projectId,
  version: 1,
  name: "Regression evaluation",
  configurationIds: [configurationId],
  cases: [
    {
      id: "case-1",
      fixtureDigest: contentDigest,
      rubricDigest: contentDigest,
      hardGates: ["retains-evidence"],
    },
  ],
  conditions: ["baseline"],
  repetitions: 1,
  disclosure: "local_only",
};
const trial = {
  schemaVersion: 1,
  id: uuid(9),
  attemptId: uuid(10),
  definitionId: evaluationDefinition.id,
  projectId,
  caseId: "case-1",
  condition: "baseline",
  repetition: 1,
  configurationIds: [configurationId],
  model: "local-model",
  runtime: "local-runtime",
  inputDigest: contentDigest,
  artifactDigests: [contentDigest],
  outcome: "completed",
  usage: { inputTokens: null, outputTokens: null },
  recordedAt: timestamp,
};
const assessment = {
  schemaVersion: 1,
  id: uuid(11),
  trialId: trial.id,
  projectId,
  version: 1,
  trialArtifactDigest: contentDigest,
  rubricDigest: contentDigest,
  judgeConfigurationId: configurationId,
  checks: [{ id: "retains-evidence", result: "fail", hardGate: true }],
  uncertainty: null,
  reviewStatus: "unreviewed",
  recordedAt: timestamp,
};
const workflowDefinition = {
  schemaVersion: 1,
  id: uuid(12),
  projectId,
  configurationId,
  prerequisites: ["source-available"],
  steps: [
    { id: "read", dependsOn: [], operation: "foundation.read" },
    { id: "record", dependsOn: ["read"], operation: "evidence.record" },
  ],
  maxAttempts: 2,
};
const workflowRun = {
  schemaVersion: 1,
  id: uuid(13),
  projectId,
  definitionId: workflowDefinition.id,
  parentRunId: null,
  attempt: 1,
  state: "completed",
  steps: [
    { id: "read", state: "completed", evidenceIds: [evidenceId] },
    { id: "record", state: "completed", evidenceIds: [evidenceId] },
  ],
  recordedAt: timestamp,
};

const objectFamilies = [
  ["actor", foundation.foundationActorSchema, actor],
  ["evidence input", foundation.foundationEvidenceInputSchema, evidenceInput],
  ["evidence", foundation.foundationEvidenceSchema, evidence],
  ["alias", foundation.foundationAliasSchema, alias],
  ["memory content", foundation.foundationMemoryContentSchema, content],
  ["memory proposal", foundation.foundationProposeMemorySchema, proposal],
  ["memory revision", foundation.foundationReviseMemorySchema, revision],
  ["memory", foundation.foundationMemorySchema, memory],
  ["memory review", foundation.foundationReviewMemorySchema, review],
  [
    "memory verification",
    foundation.foundationVerifyMemorySchema,
    verification,
  ],
  [
    "instruction approval",
    foundation.foundationApproveInstructionSchema,
    approval,
  ],
  ["page", foundation.foundationPageSchema, { limit: 25 }],
  [
    "working context",
    foundation.foundationWorkingContextSchema,
    workingContext,
  ],
  ["configuration", foundation.foundationConfigurationSchema, configuration],
  [
    "evaluation definition",
    foundation.foundationEvaluationDefinitionSchema,
    evaluationDefinition,
  ],
  ["trial", foundation.foundationEvaluationTrialSchema, trial],
  ["assessment", foundation.foundationAssessmentSchema, assessment],
  [
    "workflow definition",
    foundation.foundationWorkflowDefinitionSchema,
    workflowDefinition,
  ],
  ["workflow run", foundation.foundationWorkflowRunSchema, workflowRun],
] as const;

for (const [name, schema, fixture] of objectFamilies) {
  test(`${name}: accepts its exact contract and rejects unknown top-level fields`, () => {
    assert.deepEqual(schema.parse(fixture), fixture);
    assert.equal(
      schema.safeParse({ ...fixture, ownerApproved: true }).success,
      false,
    );
  });
}

test("UUID scalar and reference outputs use one lowercase identity representation", () => {
  const lowercase = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const uppercase = lowercase.toUpperCase();
  const parsedActor = foundation.foundationActorSchema.parse({
    ...actor,
    projectId: uppercase,
    clientId: uppercase,
    runId: uppercase,
    correlationId: uppercase,
    resourceIds: [uppercase],
  });
  assert.equal(parsedActor.projectId, lowercase);
  assert.equal(parsedActor.clientId, lowercase);
  assert.equal(parsedActor.runId, lowercase);
  assert.equal(parsedActor.correlationId, lowercase);
  assert.deepEqual(parsedActor.resourceIds, [lowercase]);
  assert.equal(
    foundation.foundationEvidenceInputSchema.parse({
      ...evidenceInput,
      projectId: uppercase,
    }).projectId,
    lowercase,
  );
  assert.equal(
    foundation.foundationMemorySchema.parse({ ...memory, id: uppercase }).id,
    lowercase,
  );
  const snapshot = foundation.foundationWorkingContextSchema.parse({
    ...workingContext,
    sourceVersions: [{ evidenceId: uppercase, contentDigest }],
    instructionVersions: [
      {
        memoryId: uppercase,
        version: 1,
        contentDigest,
        approvalId: uppercase,
      },
    ],
  });
  assert.equal(snapshot.sourceVersions[0]!.evidenceId, lowercase);
  assert.equal(snapshot.instructionVersions[0]!.memoryId, lowercase);
  assert.equal(snapshot.instructionVersions[0]!.approvalId, lowercase);
  assert.equal(
    foundation.foundationPageSchema.parse({ after: uppercase }).after,
    lowercase,
  );
});

test("generic UUID identity arrays reject mixed-case duplicate identities", () => {
  const lowercase = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const uppercase = lowercase.toUpperCase();
  assert.equal(
    foundation.foundationMemoryContentSchema.safeParse({
      ...content,
      evidenceIds: [lowercase, uppercase],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationConfigurationSchema.safeParse({
      ...configuration,
      parentIds: [lowercase, uppercase],
    }).success,
    false,
  );
  assert.deepEqual(
    foundation.foundationMemoryContentSchema.parse({
      ...content,
      evidenceIds: [uppercase],
    }).evidenceIds,
    [lowercase],
  );
});

test("working-context source versions reject conflicting mixed-case evidence identities", () => {
  const lowercase = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const uppercase = lowercase.toUpperCase();
  for (const secondDigest of [contentDigest, "b".repeat(64)]) {
    assert.equal(
      foundation.foundationWorkingContextSchema.safeParse({
        ...workingContext,
        sourceVersions: [
          { evidenceId: lowercase, contentDigest },
          { evidenceId: uppercase, contentDigest: secondDigest },
        ],
      }).success,
      false,
    );
  }
});

test("working-context instruction versions reject conflicting mixed-case memory identities", () => {
  const lowercase = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const uppercase = lowercase.toUpperCase();
  for (const [version, secondDigest] of [
    [1, contentDigest],
    [2, "b".repeat(64)],
  ] as const) {
    assert.equal(
      foundation.foundationWorkingContextSchema.safeParse({
        ...workingContext,
        instructionVersions: [
          {
            memoryId: lowercase,
            version: 1,
            contentDigest,
            approvalId: uuid(7),
          },
          {
            memoryId: uppercase,
            version,
            contentDigest: secondDigest,
            approvalId: uuid(8),
          },
        ],
      }).success,
      false,
    );
  }
});

test("operations are the exact foundation family", () => {
  assert.deepEqual(foundation.foundationOperationSchema.options, [
    "foundation.read",
    "evidence.record",
    "memory.propose",
    "memory.revise",
    "memory.review",
    "memory.verify",
    "instruction.approve",
    "configuration.record",
    "evaluation.record",
  ]);
  for (const operation of ["memory.approve", "work.create", "", "unknown"]) {
    assert.equal(
      foundation.foundationOperationSchema.safeParse(operation).success,
      false,
    );
  }
});

test("persisted and snapshot records require schemaVersion exactly 1", () => {
  for (const [name, schema, fixture] of objectFamilies) {
    if (!("schemaVersion" in fixture)) continue;
    const { schemaVersion: _version, ...unversioned } = fixture;
    for (const candidate of [unversioned, { ...fixture, schemaVersion: 2 }]) {
      assert.equal(schema.safeParse(candidate).success, false, name);
    }
  }
});

test("UUIDs, lowercase SHA256 and offset datetimes reject malformed identities", () => {
  assert.equal(
    foundation.foundationActorSchema.safeParse({
      ...actor,
      projectId: "project-1",
    }).success,
    false,
  );
  for (const invalid of ["A".repeat(64), "a".repeat(63), "x".repeat(64)]) {
    assert.equal(
      foundation.foundationEvidenceInputSchema.safeParse({
        ...evidenceInput,
        contentDigest: invalid,
      }).success,
      false,
    );
  }
  for (const invalid of [
    "2026-10-15T12:30:00",
    "yesterday",
    "2026-02-30T12:30:00Z",
  ]) {
    assert.equal(
      foundation.foundationActorSchema.safeParse({
        ...actor,
        expiresAt: invalid,
      }).success,
      false,
    );
  }
  assert.equal(
    foundation.foundationActorSchema.safeParse({
      ...actor,
      expiresAt: "2026-10-15T12:30:00Z",
    }).success,
    true,
  );
});

test("actors accept absent machine/run identities and reject duplicate authority", () => {
  assert.equal(foundation.foundationActorSchema.parse(actor).clientId, null);
  assert.equal(foundation.foundationActorSchema.parse(actor).runId, null);
  assert.equal(
    foundation.foundationActorSchema.safeParse({
      ...actor,
      capabilities: ["foundation.read", "foundation.read"],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationActorSchema.safeParse({
      ...actor,
      resourceIds: [memoryId, memoryId],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationActorSchema.safeParse({
      ...actor,
      environment: "staging",
    }).success,
    false,
  );
});

test("evidence recording cannot supply verification or confuse availability with truth", () => {
  for (const level of [
    "unverified",
    "source_matched",
    "independently_verified",
  ]) {
    assert.equal(
      foundation.foundationEvidenceInputSchema.safeParse({
        ...evidenceInput,
        verification: level,
      }).success,
      false,
    );
    assert.equal(
      foundation.foundationEvidenceSchema.safeParse({
        ...evidence,
        verification: level,
        availability: "unavailable",
      }).success,
      true,
    );
  }
  const { verification: _verification, ...withoutVerification } = evidence;
  assert.equal(
    foundation.foundationEvidenceSchema.safeParse(withoutVerification).success,
    false,
  );
  assert.equal(
    foundation.foundationEvidenceInputSchema.safeParse({
      ...evidenceInput,
      sourceVersion: null,
      observedAt: null,
    }).success,
    true,
  );
});

test("bounded nonempty strings reject blank and excessive source content without rewriting it", () => {
  for (const [key, maximum] of [
    ["sourceId", 500],
    ["sourceVersion", 100],
    ["locator", 2000],
  ] as const) {
    for (const value of ["", "   ", "x".repeat(maximum + 1)]) {
      assert.equal(
        foundation.foundationEvidenceInputSchema.safeParse({
          ...evidenceInput,
          [key]: value,
        }).success,
        false,
      );
    }
    assert.equal(
      foundation.foundationEvidenceInputSchema.safeParse({
        ...evidenceInput,
        [key]: "x".repeat(maximum),
      }).success,
      true,
    );
  }
  assert.equal(
    foundation.foundationMemoryContentSchema.parse(content).statement,
    content.statement,
  );
  assert.equal(
    foundation.foundationMemoryContentSchema.safeParse({
      ...content,
      statement: "x".repeat(20001),
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationAliasSchema.safeParse({
      ...alias,
      namespace: "x".repeat(101),
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationAliasSchema.safeParse({
      ...alias,
      externalId: "x".repeat(501),
    }).success,
    false,
  );
});

test("memory mutations preserve canonical knowledge references and accept a stable nullable alias", () => {
  assert.equal(
    foundation.foundationProposeMemorySchema.safeParse({
      ...proposal,
      alias: null,
    }).success,
    true,
  );
  const { knowledgeItemId: _knowledgeItemId, ...withoutKnowledge } = proposal;
  assert.equal(
    foundation.foundationProposeMemorySchema.safeParse(withoutKnowledge)
      .success,
    false,
  );
  for (const [key, value] of [
    ["actor", actor],
    ["lifecycle", "accepted"],
    ["verification", "independently_verified"],
    ["approved", true],
  ] as const) {
    assert.equal(
      foundation.foundationProposeMemorySchema.safeParse({
        ...proposal,
        [key]: value,
      }).success,
      false,
    );
    assert.equal(
      foundation.foundationReviseMemorySchema.safeParse({
        ...revision,
        [key]: value,
      }).success,
      false,
    );
  }
  assert.equal(
    foundation.foundationMemorySchema.safeParse({ ...memory, approved: true })
      .success,
    false,
  );
  assert.equal(
    foundation.foundationProposeMemorySchema.safeParse({
      ...proposal,
      content: { ...content, approved: true },
    }).success,
    false,
  );
});

test("memory evidence is nonempty, unique and bounded per mutation", () => {
  const thousand = Array.from({ length: 1000 }, (_, index) =>
    uuid(index + 100),
  );
  assert.equal(
    foundation.foundationMemoryContentSchema.safeParse({
      ...content,
      evidenceIds: thousand,
    }).success,
    true,
  );
  for (const ids of [[], [evidenceId, evidenceId], [...thousand, uuid(2000)]]) {
    assert.equal(
      foundation.foundationMemoryContentSchema.safeParse({
        ...content,
        evidenceIds: ids,
      }).success,
      false,
    );
    assert.equal(
      foundation.foundationVerifyMemorySchema.safeParse({
        ...verification,
        evidenceIds: ids,
      }).success,
      false,
    );
  }
});

test("memory relations require both a type and related identities", () => {
  for (const relationType of ["contradicts", "supersedes"]) {
    assert.equal(
      foundation.foundationMemoryContentSchema.safeParse({
        ...content,
        relatedMemoryIds: [memoryId],
        relationType,
      }).success,
      true,
    );
    assert.equal(
      foundation.foundationMemoryContentSchema.safeParse({
        ...content,
        relationType,
      }).success,
      false,
    );
  }
  assert.equal(
    foundation.foundationMemoryContentSchema.safeParse({
      ...content,
      relatedMemoryIds: [memoryId],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationMemoryContentSchema.safeParse({
      ...content,
      relatedMemoryIds: [memoryId, memoryId],
      relationType: "contradicts",
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationMemoryContentSchema.safeParse({
      ...content,
      relatedMemoryIds: Array.from({ length: 1001 }, (_, index) =>
        uuid(index + 100),
      ),
      relationType: "contradicts",
    }).success,
    false,
  );
});

test("review, verification and version-bound approval have separate strict inputs", () => {
  assert.equal(
    foundation.foundationReviewMemorySchema.safeParse({
      ...review,
      verification: "independently_verified",
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationReviewMemorySchema.safeParse({
      ...review,
      approved: true,
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationVerifyMemorySchema.safeParse({
      ...verification,
      decision: "accepted",
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationVerifyMemorySchema.safeParse({
      ...verification,
      approved: true,
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationVerifyMemorySchema.safeParse({
      ...verification,
      verification: "unverified",
    }).success,
    false,
  );
  for (const key of [
    "expectedVersion",
    "contentDigest",
    "disclosureProjectId",
    "expiresAt",
  ] as const) {
    const incomplete: Record<string, unknown> = { ...approval };
    delete incomplete[key];
    assert.equal(
      foundation.foundationApproveInstructionSchema.safeParse(incomplete)
        .success,
      false,
      key,
    );
  }
  for (const expectedVersion of [0, -1, 1.5, "1"]) {
    assert.equal(
      foundation.foundationReviseMemorySchema.safeParse({
        ...revision,
        expectedVersion,
      }).success,
      false,
    );
    assert.equal(
      foundation.foundationReviewMemorySchema.safeParse({
        ...review,
        expectedVersion,
      }).success,
      false,
    );
    assert.equal(
      foundation.foundationVerifyMemorySchema.safeParse({
        ...verification,
        expectedVersion,
      }).success,
      false,
    );
    assert.equal(
      foundation.foundationApproveInstructionSchema.safeParse({
        ...approval,
        expectedVersion,
      }).success,
      false,
    );
  }
  assert.equal(
    foundation.foundationReviewMemorySchema.safeParse({
      ...review,
      reason: "x".repeat(4001),
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationVerifyMemorySchema.safeParse({
      ...verification,
      reason: "x".repeat(4001),
    }).success,
    false,
  );
});

test("paging defaults only its page size and exposes scope-time continuation", () => {
  assert.deepEqual(foundation.foundationPageSchema.parse({}), { limit: 25 });
  assert.deepEqual(
    foundation.foundationPageSchema.parse({
      limit: 100,
      after: evidenceId,
      asOf: timestamp,
    }),
    { limit: 100, after: evidenceId, asOf: timestamp },
  );
  for (const limit of [0, 101, 2.5, "25"]) {
    assert.equal(
      foundation.foundationPageSchema.safeParse({ limit }).success,
      false,
    );
  }
  assert.equal(
    foundation.foundationPageSchema.safeParse({ after: "opaque-unknown" })
      .success,
    false,
  );
});

test("working context enforces strict source and approval provenance plus its budget", () => {
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      budget: { ...workingContext.budget, usedCharacters: 2001 },
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      budget: {
        ...workingContext.budget,
        usedCharacters: 2000,
        tokenEstimate: 500,
        tokenizer: "local-tokenizer",
      },
    }).success,
    true,
  );
  for (const [key, value] of [
    ["maxCharacters", 0],
    ["usedCharacters", -1],
    ["tokenEstimate", -1],
    ["extra", true],
  ] as const) {
    assert.equal(
      foundation.foundationWorkingContextSchema.safeParse({
        ...workingContext,
        budget: { ...workingContext.budget, [key]: value },
      }).success,
      false,
    );
  }
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      sourceVersions: [{ evidenceId, contentDigest, verified: true }],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      sourceVersions: [
        workingContext.sourceVersions[0],
        workingContext.sourceVersions[0],
      ],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      instructionVersions: [{ memoryId, version: 1, contentDigest }],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      instructionVersions: [
        { ...workingContext.instructionVersions[0], approved: true },
      ],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      instructionVersions: [
        workingContext.instructionVersions[0],
        workingContext.instructionVersions[0],
      ],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      omissions: [{ reason: "budget", count: -1 }],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      omissions: [{ reason: "budget", count: 1, silent: true }],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkingContextSchema.safeParse({
      ...workingContext,
      workId: uuid(14),
    }).success,
    false,
  );
});

test("snapshot evidence populations remain reachable beyond the per-write limit", () => {
  const sourceVersions = Array.from({ length: 1001 }, (_, index) => ({
    evidenceId: uuid(index + 100),
    contentDigest,
  }));
  assert.equal(
    foundation.foundationWorkingContextSchema.parse({
      ...workingContext,
      sourceVersions,
    }).sourceVersions.length,
    1001,
  );
});

test("configuration preserves exact immutable content and unique lineage identities", () => {
  assert.equal(
    foundation.foundationConfigurationSchema.parse(configuration).content,
    configuration.content,
  );
  assert.equal(
    foundation.foundationConfigurationSchema.safeParse({
      ...configuration,
      content: "",
    }).success,
    true,
  );
  assert.equal(
    foundation.foundationConfigurationSchema.safeParse({
      ...configuration,
      content: "x".repeat(1000001),
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationConfigurationSchema.safeParse({
      ...configuration,
      parentIds: [configurationId, configurationId],
    }).success,
    false,
  );
  for (const kind of [
    "prompt",
    "skill",
    "hook",
    "loop",
    "runtime",
    "model",
    "settings",
  ]) {
    assert.equal(
      foundation.foundationConfigurationSchema.safeParse({
        ...configuration,
        kind,
      }).success,
      true,
    );
  }
});

test("evaluation definitions bind unique fixtures, rubrics, configurations and conditions", () => {
  for (const configurationIds of [[], [configurationId, configurationId]]) {
    assert.equal(
      foundation.foundationEvaluationDefinitionSchema.safeParse({
        ...evaluationDefinition,
        configurationIds,
      }).success,
      false,
    );
  }
  for (const conditions of [[], ["baseline", "baseline"], [""]]) {
    assert.equal(
      foundation.foundationEvaluationDefinitionSchema.safeParse({
        ...evaluationDefinition,
        conditions,
      }).success,
      false,
    );
  }
  const evaluationCase = evaluationDefinition.cases[0]!;
  assert.equal(
    foundation.foundationEvaluationDefinitionSchema.safeParse({
      ...evaluationDefinition,
      cases: [evaluationCase, evaluationCase],
    }).success,
    false,
  );
  for (const candidate of [
    { ...evaluationCase, hardGates: ["gate", "gate"] },
    { ...evaluationCase, score: 1 },
    { ...evaluationCase, fixtureDigest: "missing" },
  ]) {
    assert.equal(
      foundation.foundationEvaluationDefinitionSchema.safeParse({
        ...evaluationDefinition,
        cases: [candidate],
      }).success,
      false,
    );
  }
  assert.equal(
    foundation.foundationEvaluationDefinitionSchema.safeParse({
      ...evaluationDefinition,
      name: "x".repeat(201),
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationEvaluationDefinitionSchema.safeParse({
      ...evaluationDefinition,
      repetitions: 0,
    }).success,
    false,
  );
});

test("trial completion requires artifact evidence and never includes assessment fields", () => {
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse({
      ...trial,
      artifactDigests: [],
    }).success,
    false,
  );
  for (const outcome of [
    "failed",
    "timed_out",
    "canceled",
    "unsupported",
    "infrastructure_failed",
  ]) {
    assert.equal(
      foundation.foundationEvaluationTrialSchema.safeParse({
        ...trial,
        outcome,
        artifactDigests: [],
      }).success,
      true,
    );
  }
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse({
      ...trial,
      outcome: "unknown",
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse({
      ...trial,
      artifactDigests: [contentDigest, contentDigest],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse({
      ...trial,
      configurationIds: [],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse({
      ...trial,
      configurationIds: [configurationId, configurationId],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse({
      ...trial,
      qualityScore: 100,
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse({
      ...trial,
      usage: { ...trial.usage, inputTokens: -1 },
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse({
      ...trial,
      usage: { ...trial.usage, estimated: true },
    }).success,
    false,
  );
  const { outcome: _outcome, ...withoutOutcome } = trial;
  assert.equal(
    foundation.foundationEvaluationTrialSchema.safeParse(withoutOutcome)
      .success,
    false,
  );
});

test("assessments expose failed and unknown hard gates without aggregate-score escape hatches", () => {
  for (const result of ["pass", "fail", "unknown"]) {
    const parsed = foundation.foundationAssessmentSchema.parse({
      ...assessment,
      checks: [{ id: "gate", result, hardGate: true }],
    });
    assert.equal(parsed.checks[0]!.result, result);
    assert.equal(parsed.reviewStatus, "unreviewed");
  }
  assert.equal(
    foundation.foundationAssessmentSchema.safeParse({
      ...assessment,
      qualityScore: 100,
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationAssessmentSchema.safeParse({
      ...assessment,
      checks: [{ id: "gate", result: "fail", hardGate: true, score: 100 }],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationAssessmentSchema.safeParse({
      ...assessment,
      checks: [assessment.checks[0], assessment.checks[0]],
    }).success,
    false,
  );
  const { reviewStatus: _reviewStatus, ...withoutReview } = assessment;
  assert.equal(
    foundation.foundationAssessmentSchema.safeParse(withoutReview).success,
    false,
  );
});

test("workflow DAG validation rejects duplicate, self, missing and cyclic dependencies", () => {
  const step = (id: string, dependsOn: string[]) => ({
    id,
    dependsOn,
    operation: "foundation.read",
  });
  const invalidSteps = [
    [step("a", []), step("a", [])],
    [step("a", ["a"])],
    [step("a", ["missing"])],
    [step("a", []), step("b", ["a", "a"])],
    [step("a", ["b"]), step("b", ["a"])],
    [step("a", []), step("b", ["c"]), step("c", ["b"])],
    [step("a", ["b"]), step("b", ["c"]), step("c", ["a"])],
  ];
  for (const steps of invalidSteps) {
    assert.equal(
      foundation.foundationWorkflowDefinitionSchema.safeParse({
        ...workflowDefinition,
        steps,
      }).success,
      false,
    );
  }
  const steps = [
    step("end", ["left", "right"]),
    step("left", ["start"]),
    step("right", ["start"]),
    step("start", []),
  ];
  assert.equal(
    foundation.foundationWorkflowDefinitionSchema.safeParse({
      ...workflowDefinition,
      steps,
    }).success,
    true,
  );
  assert.equal(
    foundation.foundationWorkflowDefinitionSchema.safeParse({
      ...workflowDefinition,
      steps: [{ ...steps[0], extra: true }],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkflowDefinitionSchema.safeParse({
      ...workflowDefinition,
      prerequisites: ["ready", "ready"],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkflowDefinitionSchema.safeParse({
      ...workflowDefinition,
      maxAttempts: 0,
    }).success,
    false,
  );
});

test("workflow completion requires completed evidence-backed steps", () => {
  assert.equal(
    foundation.foundationWorkflowRunSchema.safeParse({
      ...workflowRun,
      steps: [],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkflowRunSchema.safeParse({
      ...workflowRun,
      steps: [{ id: "read", state: "completed", evidenceIds: [] }],
    }).success,
    false,
  );
  for (const state of [
    "pending",
    "running",
    "blocked",
    "awaiting_approval",
    "failed",
    "skipped",
    "unknown",
  ]) {
    assert.equal(
      foundation.foundationWorkflowRunSchema.safeParse({
        ...workflowRun,
        steps: [{ id: "read", state, evidenceIds: [evidenceId] }],
      }).success,
      false,
    );
  }
  for (const state of [
    "queued",
    "running",
    "blocked",
    "awaiting_approval",
    "failed",
    "canceled",
  ]) {
    assert.equal(
      foundation.foundationWorkflowRunSchema.safeParse({
        ...workflowRun,
        state,
        steps: [{ id: "read", state: "pending", evidenceIds: [] }],
      }).success,
      true,
    );
  }
  assert.equal(
    foundation.foundationWorkflowRunSchema.safeParse({
      ...workflowRun,
      steps: [workflowRun.steps[0], workflowRun.steps[0]],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkflowRunSchema.safeParse({
      ...workflowRun,
      steps: [
        {
          id: "read",
          state: "completed",
          evidenceIds: [evidenceId, evidenceId],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkflowRunSchema.safeParse({
      ...workflowRun,
      steps: [{ ...workflowRun.steps[0], approved: true }],
    }).success,
    false,
  );
  assert.equal(
    foundation.foundationWorkflowRunSchema.safeParse({
      ...workflowRun,
      state: "unknown",
    }).success,
    false,
  );
  const { state: _state, ...withoutState } = workflowRun;
  assert.equal(
    foundation.foundationWorkflowRunSchema.safeParse(withoutState).success,
    false,
  );
});
