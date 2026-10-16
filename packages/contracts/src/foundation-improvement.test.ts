import assert from "node:assert/strict";
import { test } from "vitest";
import {
  FOUNDATION_IMPROVEMENT_MAX_INPUT_BYTES,
  foundationImprovementAdvisorySchema,
  foundationImprovementComparisonSchema,
  foundationImprovementConditionSchema,
  foundationImprovementCountsSchema,
  foundationImprovementDecisionInputSchema,
  foundationImprovementDecisionSchema,
  foundationImprovementDetailSchema,
  foundationImprovementInputSchema,
  foundationImprovementMotivationSchema,
  foundationImprovementPageSchema,
  foundationImprovementProposalSchema,
  foundationImprovementToolInputSchema,
  type FoundationImprovementAdvisory,
  type FoundationImprovementComparison,
  type FoundationImprovementCounts,
  type FoundationImprovementDecision,
  type FoundationImprovementDecisionInput,
  type FoundationImprovementInput,
  type FoundationImprovementProposal,
  type FoundationImprovementToolInput,
} from "./foundation-improvement";

const id = (suffix: string) =>
  "00000000-0000-4000-8000-" + suffix.padStart(12, "0");
const projectId = id("aa");
const proposalId = id("ab");
const baselineId = id("bb");
const candidateId = id("cc");
const digest = "a".repeat(64);
const populationDigest = "b".repeat(64);
const reportDigest = "c".repeat(64);
const now = "2026-10-16T12:00:00Z";
const later = "2026-10-16T13:00:00Z";
const toolInput = (): FoundationImprovementToolInput => ({
  candidateConfigurationId: candidateId,
  baselineConfigurationId: baselineId,
  definitionId: id("dd"),
  motivations: [{ assessmentId: id("ee"), assessmentVersion: 1 }],
  conditionConfigurations: [
    {
      condition: "baseline",
      role: "baseline",
      configurationIds: [baselineId, id("11"), id("22")],
    },
    {
      condition: "candidate",
      role: "candidate",
      configurationIds: [id("22"), candidateId, id("11")],
    },
  ],
  judgeConfigurationIds: [id("ff")],
  rationale: "  Retain source bytes: café 東京 🚀  ",
  hypothesis: "Changing one configuration improves the evaluated cases.",
});
const input = (): FoundationImprovementInput => ({ ...toolInput(), projectId });
const proposal = (): FoundationImprovementProposal => ({
  ...input(),
  schemaVersion: 1,
  id: proposalId,
  version: 1,
  environment: "test",
  recordedBy: "agent:author",
  recordedAt: now,
  contentDigest: digest,
});
const counts = (): FoundationImprovementCounts => ({
  expectedCells: 1,
  observedCells: 1,
  assessedCells: 1,
  passedCells: 1,
  failedCells: 0,
  unassessedCells: 0,
  missingCells: 0,
  ambiguousCells: 0,
  blockedCells: 0,
  attemptCount: 1,
});
const comparison = (): FoundationImprovementComparison => ({
  model: "test model",
  runtime: "local runtime",
  counts: counts(),
  eligibleForReview: true,
  blockers: [],
  pendingNewerAssessmentCount: 0,
});
const advisory = (): FoundationImprovementAdvisory => ({
  schemaVersion: 1,
  projectId,
  proposalId,
  proposalDigest: digest,
  evaluatedAt: now,
  populationDigest,
  reportDigest,
  eligibleForReview: true,
  pendingNewerAssessmentCount: 0,
  blockers: [],
  comparisons: [comparison()],
});
const decisionInput = (): FoundationImprovementDecisionInput => ({
  projectId,
  proposalId,
  expectedProposalDigest: digest,
  expectedPopulationDigest: populationDigest,
  expectedReportDigest: reportDigest,
  expectedDecisionVersion: 0,
  decision: "accepted",
  reason: "Owner reviewed the exact report.",
  expiresAt: later,
});
const decision = (): FoundationImprovementDecision => ({
  ...decisionInput(),
  schemaVersion: 1,
  id: id("de"),
  version: 1,
  recordedBy: "user:owner",
  recordedAt: now,
  contentDigest: "d".repeat(64),
});
const detail = () => ({
  schemaVersion: 1,
  proposal: proposal(),
  advisory: advisory(),
  currentDecision: decision(),
});
const page = () => ({
  schemaVersion: 1,
  projectId,
  items: [proposal()],
  nextCursor: "opaque:continuation",
});
const rejects = (
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) => {
  assert.equal(schema.safeParse(value).success, false);
};

test("normalizes UUIDs throughout public records and preserves ordered source content", () => {
  assert.equal(FOUNDATION_IMPROVEMENT_MAX_INPUT_BYTES, 131072);
  const value = input();
  value.projectId = projectId.toUpperCase();
  value.candidateConfigurationId = candidateId.toUpperCase();
  value.baselineConfigurationId = baselineId.toUpperCase();
  value.definitionId = value.definitionId.toUpperCase();
  value.motivations = [
    { assessmentId: id("ef").toUpperCase(), assessmentVersion: 3 },
    { assessmentId: id("ee").toUpperCase(), assessmentVersion: 1 },
  ];
  value.judgeConfigurationIds = value.judgeConfigurationIds.map((entry) =>
    entry.toUpperCase(),
  );
  value.conditionConfigurations = value.conditionConfigurations.map(
    (entry) => ({
      ...entry,
      configurationIds: entry.configurationIds.map((entryId) =>
        entryId.toUpperCase(),
      ),
    }),
  );
  const parsed = foundationImprovementInputSchema.parse(value);
  assert.equal(parsed.projectId, projectId);
  assert.equal(parsed.candidateConfigurationId, candidateId);
  assert.deepEqual(
    parsed.motivations.map((entry) => entry.assessmentId),
    [id("ef"), id("ee")],
  );
  assert.equal(parsed.rationale, value.rationale);
  assert.deepEqual(parsed.conditionConfigurations[0]!.configurationIds, [
    baselineId,
    id("11"),
    id("22"),
  ]);
  const bound = detail();
  bound.proposal.projectId = projectId.toUpperCase();
  bound.proposal.id = proposalId.toUpperCase();
  bound.advisory.proposalId = proposalId.toUpperCase();
  bound.currentDecision.proposalId = proposalId.toUpperCase();
  assert.equal(
    foundationImprovementDetailSchema.parse(bound).proposal.id,
    proposalId,
  );
  assert.equal(
    foundationImprovementPageSchema.parse({
      ...page(),
      projectId: projectId.toUpperCase(),
    }).projectId,
    projectId,
  );
  assert.equal(
    foundationImprovementProposalSchema.parse({
      ...proposal(),
      recordedBy: "user:future-author",
    }).recordedBy,
    "user:future-author",
  );
});

test("rejects identities duplicated after normalization", () => {
  const value = toolInput();
  rejects(foundationImprovementToolInputSchema, {
    ...value,
    judgeConfigurationIds: [id("ff"), id("ff").toUpperCase()],
  });
  rejects(foundationImprovementToolInputSchema, {
    ...value,
    motivations: [
      { assessmentId: id("ee"), assessmentVersion: 1 },
      { assessmentId: id("ee").toUpperCase(), assessmentVersion: 2 },
    ],
  });
  rejects(foundationImprovementConditionSchema, {
    ...value.conditionConfigurations[0],
    configurationIds: [baselineId, baselineId.toUpperCase()],
  });
  rejects(foundationImprovementPageSchema, {
    ...page(),
    items: [proposal(), { ...proposal(), id: proposalId.toUpperCase() }],
  });
});

test("retains controlled-comparison refinements in tool input, scoped input and proposal", () => {
  const value = toolInput();
  const baseline = value.conditionConfigurations[0]!;
  const candidate = value.conditionConfigurations[1]!;
  const invalid = [
    { candidateConfigurationId: baselineId.toUpperCase() },
    { conditionConfigurations: [baseline] },
    { conditionConfigurations: [baseline, candidate, candidate] },
    {
      conditionConfigurations: [
        baseline,
        { ...candidate, condition: baseline.condition },
      ],
    },
    { conditionConfigurations: [baseline, { ...candidate, role: "baseline" }] },
    {
      conditionConfigurations: [
        { ...baseline, configurationIds: [id("11"), id("22")] },
        candidate,
      ],
    },
    {
      conditionConfigurations: [
        baseline,
        { ...candidate, configurationIds: [id("11"), id("22")] },
      ],
    },
    {
      conditionConfigurations: [
        { ...baseline, configurationIds: [baselineId, candidateId] },
        candidate,
      ],
    },
    {
      conditionConfigurations: [
        baseline,
        { ...candidate, configurationIds: [candidateId, baselineId] },
      ],
    },
    {
      conditionConfigurations: [
        baseline,
        { ...candidate, configurationIds: [candidateId, id("11"), id("33")] },
      ],
    },
  ];
  for (const mutation of invalid) {
    rejects(foundationImprovementToolInputSchema, { ...value, ...mutation });
    rejects(foundationImprovementInputSchema, { ...input(), ...mutation });
    rejects(foundationImprovementProposalSchema, {
      ...proposal(),
      ...mutation,
    });
  }
  assert.equal(
    foundationImprovementToolInputSchema.safeParse(value).success,
    true,
  );
  assert.equal(
    foundationImprovementToolInputSchema.safeParse({
      ...value,
      conditionConfigurations: [candidate, baseline],
    }).success,
    true,
  );
});

test("bounds lists, text lengths and exact assessment versions", () => {
  const value = toolInput();
  for (const length of [0, 101]) {
    rejects(foundationImprovementConditionSchema, {
      condition: "control",
      role: "baseline",
      configurationIds: Array.from({ length }, (_, index) =>
        id(index.toString(16)),
      ),
    });
    rejects(foundationImprovementToolInputSchema, {
      ...value,
      judgeConfigurationIds: Array.from({ length }, (_, index) =>
        id(index.toString(16)),
      ),
    });
    rejects(foundationImprovementToolInputSchema, {
      ...value,
      motivations: Array.from({ length }, (_, index) => ({
        assessmentId: id(index.toString(16)),
        assessmentVersion: 1,
      })),
    });
  }
  assert.equal(
    foundationImprovementConditionSchema.safeParse({
      condition: "x".repeat(200),
      role: "baseline",
      configurationIds: [baselineId],
    }).success,
    true,
  );
  rejects(foundationImprovementConditionSchema, {
    condition: "x".repeat(201),
    role: "baseline",
    configurationIds: [baselineId],
  });
  rejects(foundationImprovementToolInputSchema, {
    ...value,
    rationale: "x".repeat(4001),
  });
  rejects(foundationImprovementToolInputSchema, {
    ...value,
    hypothesis: "x".repeat(4001),
  });
  for (const version of [
    0,
    -1,
    1.1,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    NaN,
  ]) {
    rejects(foundationImprovementMotivationSchema, {
      assessmentId: id("ee"),
      assessmentVersion: version,
    });
  }
  assert.equal(
    foundationImprovementMotivationSchema.parse({
      assessmentId: id("ee"),
      assessmentVersion: Number.MAX_SAFE_INTEGER,
    }).assessmentVersion,
    Number.MAX_SAFE_INTEGER,
  );
});

test("rejects blank, NUL and lone-surrogate text at every public text boundary", () => {
  for (const value of ["", " \t\n", "a\u0000b", "bad\uD800", "\uDC00bad"]) {
    rejects(foundationImprovementConditionSchema, {
      condition: value,
      role: "baseline",
      configurationIds: [baselineId],
    });
    rejects(foundationImprovementInputSchema, { ...input(), rationale: value });
    rejects(foundationImprovementInputSchema, {
      ...input(),
      hypothesis: value,
    });
    rejects(foundationImprovementProposalSchema, {
      ...proposal(),
      recordedBy: value,
    });
    rejects(foundationImprovementComparisonSchema, {
      ...comparison(),
      model: value,
    });
    rejects(foundationImprovementComparisonSchema, {
      ...comparison(),
      runtime: value,
    });
    rejects(foundationImprovementComparisonSchema, {
      ...comparison(),
      blockers: [value],
    });
    rejects(foundationImprovementAdvisorySchema, {
      ...advisory(),
      blockers: [value],
    });
    rejects(foundationImprovementDecisionInputSchema, {
      ...decisionInput(),
      reason: value,
    });
    rejects(foundationImprovementPageSchema, { ...page(), nextCursor: value });
  }
  assert.equal(
    foundationImprovementInputSchema.parse(input()).rationale,
    input().rationale,
  );
  assert.equal(
    foundationImprovementPageSchema.parse({
      ...page(),
      nextCursor: "x".repeat(8192),
    }).nextCursor?.length,
    8192,
  );
  rejects(foundationImprovementPageSchema, {
    ...page(),
    nextCursor: "x".repeat(8193),
  });
  rejects(foundationImprovementProposalSchema, {
    ...proposal(),
    recordedBy: "x".repeat(501),
  });
  rejects(foundationImprovementComparisonSchema, {
    ...comparison(),
    model: "x".repeat(4001),
  });
  rejects(foundationImprovementAdvisorySchema, {
    ...advisory(),
    blockers: ["x".repeat(201)],
  });
  rejects(foundationImprovementAdvisorySchema, {
    ...advisory(),
    blockers: ["same", "same"],
  });
  rejects(foundationImprovementComparisonSchema, {
    ...comparison(),
    blockers: ["same", "same"],
  });
});

test("strict objects reject extra fields and input cannot supply authority or history", () => {
  const fixtures: Array<
    [{ safeParse: (value: unknown) => { success: boolean } }, object]
  > = [
    [
      foundationImprovementConditionSchema,
      toolInput().conditionConfigurations[0]!,
    ],
    [foundationImprovementMotivationSchema, toolInput().motivations[0]!],
    [foundationImprovementToolInputSchema, toolInput()],
    [foundationImprovementInputSchema, input()],
    [foundationImprovementProposalSchema, proposal()],
    [foundationImprovementCountsSchema, counts()],
    [foundationImprovementComparisonSchema, comparison()],
    [foundationImprovementAdvisorySchema, advisory()],
    [foundationImprovementDecisionInputSchema, decisionInput()],
    [foundationImprovementDecisionSchema, decision()],
    [foundationImprovementDetailSchema, detail()],
    [foundationImprovementPageSchema, page()],
  ];
  for (const [schema, fixture] of fixtures)
    rejects(schema, { ...fixture, metadata: {} });
  for (const field of [
    "projectId",
    "actor",
    "recordedBy",
    "recordedAt",
    "status",
    "eligibleForReview",
    "approval",
    "settings",
    "executable",
    "alias",
  ]) {
    rejects(foundationImprovementToolInputSchema, {
      ...toolInput(),
      [field]: "caller supplied",
    });
  }
  rejects(foundationImprovementInputSchema, {
    ...input(),
    conditionConfigurations: [
      { ...toolInput().conditionConfigurations[0], settings: {} },
      toolInput().conditionConfigurations[1],
    ],
  });
  rejects(foundationImprovementInputSchema, {
    ...input(),
    motivations: [{ ...toolInput().motivations[0], metadata: {} }],
  });
  rejects(foundationImprovementAdvisorySchema, {
    ...advisory(),
    comparisons: [{ ...comparison(), counts: { ...counts(), score: 100 } }],
  });
});

test("requires safe nonnegative count fields and canonical digests", () => {
  for (const field of Object.keys(counts())) {
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])
      rejects(foundationImprovementCountsSchema, {
        ...counts(),
        [field]: value,
      });
    assert.equal(
      foundationImprovementCountsSchema.safeParse({
        ...counts(),
        [field]: Number.MAX_SAFE_INTEGER,
      }).success,
      true,
    );
  }
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    rejects(foundationImprovementComparisonSchema, {
      ...comparison(),
      pendingNewerAssessmentCount: value,
    });
    rejects(foundationImprovementAdvisorySchema, {
      ...advisory(),
      pendingNewerAssessmentCount: value,
    });
    rejects(foundationImprovementDecisionInputSchema, {
      ...decisionInput(),
      expectedDecisionVersion: value,
    });
  }
  for (const value of ["A".repeat(64), "a".repeat(63), "g".repeat(64)]) {
    rejects(foundationImprovementProposalSchema, {
      ...proposal(),
      contentDigest: value,
    });
    for (const field of ["proposalDigest", "populationDigest", "reportDigest"])
      rejects(foundationImprovementAdvisorySchema, {
        ...advisory(),
        [field]: value,
      });
    for (const field of [
      "expectedProposalDigest",
      "expectedPopulationDigest",
      "expectedReportDigest",
    ])
      rejects(foundationImprovementDecisionInputSchema, {
        ...decisionInput(),
        [field]: value,
      });
    rejects(foundationImprovementDecisionSchema, {
      ...decision(),
      contentDigest: value,
    });
  }
});

test("enforces immutable proposal version and inherited environment", () => {
  for (const version of [0, 2])
    rejects(foundationImprovementProposalSchema, { ...proposal(), version });
  for (const environment of ["local", "test", "preview", "production"])
    assert.equal(
      foundationImprovementProposalSchema.safeParse({
        ...proposal(),
        environment,
      }).success,
      true,
    );
  rejects(foundationImprovementProposalSchema, {
    ...proposal(),
    environment: "caller-defined",
  });
  rejects(foundationImprovementProposalSchema, {
    ...proposal(),
    schemaVersion: 2,
  });
});

test("binds detail to the exact proposal while preserving stale decisions", () => {
  assert.equal(
    foundationImprovementDetailSchema.safeParse(detail()).success,
    true,
  );
  assert.equal(
    foundationImprovementDetailSchema.safeParse({
      ...detail(),
      currentDecision: null,
    }).success,
    true,
  );
  for (const mutation of [
    { projectId: id("99") },
    { proposalId: id("99") },
    { proposalDigest: "f".repeat(64) },
  ])
    rejects(foundationImprovementDetailSchema, {
      ...detail(),
      advisory: { ...advisory(), ...mutation },
    });
  for (const mutation of [
    { projectId: id("99") },
    { proposalId: id("99") },
    { expectedProposalDigest: "f".repeat(64) },
  ])
    rejects(foundationImprovementDetailSchema, {
      ...detail(),
      currentDecision: { ...decision(), ...mutation },
    });
  const stale = foundationImprovementDetailSchema.parse({
    ...detail(),
    advisory: {
      ...advisory(),
      reportDigest: "e".repeat(64),
      populationDigest: "f".repeat(64),
      eligibleForReview: false,
      blockers: ["New failed assessment"],
      pendingNewerAssessmentCount: 1,
    },
  });
  assert.equal(stale.currentDecision?.expectedReportDigest, reportDigest);
  assert.equal(
    stale.currentDecision?.expectedPopulationDigest,
    populationDigest,
  );
  assert.equal(stale.advisory.eligibleForReview, false);
});

test("requires exact decision version progression and trusted human attribution", () => {
  for (const action of ["accepted", "rejected", "revoked"])
    assert.equal(
      foundationImprovementDecisionInputSchema.safeParse({
        ...decisionInput(),
        decision: action,
      }).success,
      true,
    );
  rejects(foundationImprovementDecisionInputSchema, {
    ...decisionInput(),
    decision: "installed",
  });
  for (const version of [0, 2, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    rejects(foundationImprovementDecisionSchema, { ...decision(), version });
  assert.equal(
    foundationImprovementDecisionSchema.parse({
      ...decision(),
      expectedDecisionVersion: 4,
      version: 5,
    }).version,
    5,
  );
  rejects(foundationImprovementDecisionSchema, {
    ...decision(),
    expectedDecisionVersion: Number.MAX_SAFE_INTEGER,
    version: Number.MAX_SAFE_INTEGER,
  });
  for (const recordedBy of [
    "agent:owner",
    "client:owner",
    "owner",
    "user:",
    "user: ",
    " user:owner",
    "user:owner name",
    "user:bad\u0000",
    "user:bad\uD800",
  ])
    rejects(foundationImprovementDecisionSchema, { ...decision(), recordedBy });
  for (const field of [
    "recordedBy",
    "recordedAt",
    "eligibleForReview",
    "approval",
    "version",
  ])
    rejects(foundationImprovementDecisionInputSchema, {
      ...decisionInput(),
      [field]: "caller",
    });
  const revoked = { ...decision(), decision: "revoked" };
  assert.equal(
    foundationImprovementDetailSchema.safeParse({
      ...detail(),
      advisory: {
        ...advisory(),
        eligibleForReview: false,
        blockers: ["Ineligible"],
      },
      currentDecision: revoked,
    }).success,
    true,
  );
});

test("compares expiry by UTC instant including submillisecond precision", () => {
  for (const expiresAt of [
    now,
    "2026-10-16T11:59:59Z",
    "2026-10-16T13:00:00+01:00",
    "2026-10-16T13:00:00+02:00",
  ])
    rejects(foundationImprovementDecisionSchema, { ...decision(), expiresAt });
  assert.equal(
    foundationImprovementDecisionSchema.safeParse({
      ...decision(),
      expiresAt: "2026-10-16T11:30:00-01:00",
    }).success,
    true,
  );
  assert.equal(
    foundationImprovementDecisionSchema.safeParse({
      ...decision(),
      recordedAt: "2026-10-16T12:00:00.0001Z",
      expiresAt: "2026-10-16T13:00:00.0002+01:00",
    }).success,
    true,
  );
  rejects(foundationImprovementDecisionSchema, {
    ...decision(),
    recordedAt: "2026-10-16T12:00:00.0002Z",
    expiresAt: "2026-10-16T13:00:00.0001+01:00",
  });
  rejects(foundationImprovementDecisionSchema, {
    ...decision(),
    recordedAt: "2026-10-16T12:00:00.1Z",
    expiresAt: "2026-10-16T13:00:00.100000+01:00",
  });
  assert.equal(
    foundationImprovementDecisionSchema.safeParse({
      ...decision(),
      recordedAt: "2026-10-16T12:00:00.9999Z",
      expiresAt: "2026-10-16T12:00:01Z",
    }).success,
    true,
  );
});

test("rejects invalid calendar dates at all public timestamp boundaries", () => {
  for (const value of [
    "2026-02-29T12:00:00Z",
    "2026-02-30T12:00:00Z",
    "2026-04-31T12:00:00+01:00",
    "2026-13-01T12:00:00Z",
    "2026-10-16T12:00:00",
    "2026-10-16T24:00:00Z",
  ]) {
    rejects(foundationImprovementProposalSchema, {
      ...proposal(),
      recordedAt: value,
    });
    rejects(foundationImprovementAdvisorySchema, {
      ...advisory(),
      evaluatedAt: value,
    });
    rejects(foundationImprovementDecisionInputSchema, {
      ...decisionInput(),
      expiresAt: value,
    });
    rejects(foundationImprovementDecisionSchema, {
      ...decision(),
      recordedAt: value,
    });
  }
  assert.equal(
    foundationImprovementProposalSchema.safeParse({
      ...proposal(),
      recordedAt: "2024-02-29T12:00:00Z",
    }).success,
    true,
  );
  assert.equal(
    foundationImprovementProposalSchema.safeParse({
      ...proposal(),
      recordedAt: "2000-02-29T12:00:00Z",
    }).success,
    true,
  );
  rejects(foundationImprovementProposalSchema, {
    ...proposal(),
    recordedAt: "1900-02-29T12:00:00Z",
  });
});

test("keeps page continuation and rejects cross-project populations", () => {
  assert.equal(
    foundationImprovementPageSchema.parse(page()).nextCursor,
    "opaque:continuation",
  );
  assert.deepEqual(
    foundationImprovementPageSchema.parse({
      ...page(),
      items: [],
      nextCursor: null,
    }).items,
    [],
  );
  rejects(foundationImprovementPageSchema, {
    ...page(),
    items: [{ ...proposal(), projectId: id("99") }],
  });
});

test("rejects final newlines in exact digests and trusted principal identifiers", () => {
  const newlineDigest = digest + "\n";
  rejects(foundationImprovementProposalSchema, {
    ...proposal(),
    contentDigest: newlineDigest,
  });
  rejects(foundationImprovementAdvisorySchema, {
    ...advisory(),
    reportDigest: newlineDigest,
  });
  rejects(foundationImprovementDecisionInputSchema, {
    ...decisionInput(),
    expectedReportDigest: newlineDigest,
  });
  rejects(foundationImprovementDecisionSchema, {
    ...decision(),
    recordedBy: "user:owner\n",
  });
  rejects(foundationImprovementDecisionSchema, {
    ...decision(),
    recordedBy: "user:" + "x".repeat(496),
  });
});
