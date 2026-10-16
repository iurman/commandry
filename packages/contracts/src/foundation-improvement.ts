import { z } from "zod";
import { foundationActorSchema } from "./agent-foundation";

export const FOUNDATION_IMPROVEMENT_MAX_INPUT_BYTES = 131072;

const schemaVersion = z.literal(1);
const identity = foundationActorSchema.shape.projectId;
const environment = foundationActorSchema.shape.environment;
const datetime = foundationActorSchema.shape.expiresAt.refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (days[month - 1] ?? 0);
}, "Must represent a valid calendar instant");
const digest = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/);
const nonnegativeInteger = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const text = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, "Must not be blank")
    .refine(
      (value) => !/[\u0000\uD800-\uDFFF]/u.test(value),
      "Must contain valid Unicode without NUL",
    );
const uniqueIdentities = () =>
  z
    .array(identity)
    .refine(
      (values) => new Set(values).size === values.length,
      "Duplicate identity",
    );
const blockers = z
  .array(text(200))
  .refine(
    (values) => new Set(values).size === values.length,
    "Duplicate blocker",
  );

// Compare actual UTC instants while preserving submillisecond precision.
const compareDatetimes = (left: string, right: string): number => {
  const milliseconds = (value: string) =>
    Date.parse(
      value.replace(
        /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/,
        (_, digits: string) => "." + digits.slice(0, 3).padEnd(3, "0"),
      ),
    );
  const difference = milliseconds(left) - milliseconds(right);
  if (difference !== 0) return difference;
  const remainder = (value: string) =>
    (value.match(/\.(\d+)/)?.[1] ?? "").slice(3);
  const leftRemainder = remainder(left);
  const rightRemainder = remainder(right);
  const length = Math.max(leftRemainder.length, rightRemainder.length);
  const leftPadded = leftRemainder.padEnd(length, "0");
  const rightPadded = rightRemainder.padEnd(length, "0");
  return leftPadded < rightPadded ? -1 : leftPadded > rightPadded ? 1 : 0;
};

export const foundationImprovementConditionSchema = z.strictObject({
  condition: text(200),
  role: z.enum(["baseline", "candidate"]),
  configurationIds: uniqueIdentities().min(1).max(100),
});
export type FoundationImprovementCondition = z.infer<
  typeof foundationImprovementConditionSchema
>;

export const foundationImprovementMotivationSchema = z.strictObject({
  assessmentId: identity,
  assessmentVersion: positiveInteger,
});
export type FoundationImprovementMotivation = z.infer<
  typeof foundationImprovementMotivationSchema
>;

const improvementInputShape = {
  candidateConfigurationId: identity,
  baselineConfigurationId: identity,
  definitionId: identity,
  motivations: z
    .array(foundationImprovementMotivationSchema)
    .min(1)
    .max(100)
    .refine(
      (values) =>
        new Set(values.map((value) => value.assessmentId)).size ===
        values.length,
      "Duplicate assessment identity",
    ),
  conditionConfigurations: z
    .array(foundationImprovementConditionSchema)
    .length(2),
  judgeConfigurationIds: uniqueIdentities().min(1).max(100),
  rationale: text(4000),
  hypothesis: text(4000),
};

type ControlledComparison = {
  candidateConfigurationId: string;
  baselineConfigurationId: string;
  conditionConfigurations: FoundationImprovementCondition[];
};
const validateControlledComparison = (
  input: ControlledComparison,
  context: z.RefinementCtx,
) => {
  if (input.candidateConfigurationId === input.baselineConfigurationId) {
    context.addIssue({
      code: "custom",
      path: ["candidateConfigurationId"],
      message: "Candidate and baseline must differ",
    });
  }
  if (
    new Set(input.conditionConfigurations.map((entry) => entry.condition))
      .size !== input.conditionConfigurations.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["conditionConfigurations"],
      message: "Condition names must be distinct",
    });
  }
  const baseline = input.conditionConfigurations.filter(
    (entry) => entry.role === "baseline",
  );
  const candidate = input.conditionConfigurations.filter(
    (entry) => entry.role === "candidate",
  );
  if (baseline.length !== 1 || candidate.length !== 1) {
    context.addIssue({
      code: "custom",
      path: ["conditionConfigurations"],
      message: "Exactly one baseline and one candidate condition are required",
    });
    return;
  }
  const baselineIds = baseline[0]!.configurationIds;
  const candidateIds = candidate[0]!.configurationIds;
  if (
    !baselineIds.includes(input.baselineConfigurationId) ||
    baselineIds.includes(input.candidateConfigurationId)
  ) {
    context.addIssue({
      code: "custom",
      path: ["conditionConfigurations"],
      message: "Baseline condition must contain only the baseline change",
    });
  }
  if (
    !candidateIds.includes(input.candidateConfigurationId) ||
    candidateIds.includes(input.baselineConfigurationId)
  ) {
    context.addIssue({
      code: "custom",
      path: ["conditionConfigurations"],
      message: "Candidate condition must contain only the candidate change",
    });
  }
  const baselineRest = new Set(
    baselineIds.filter((id) => id !== input.baselineConfigurationId),
  );
  const candidateRest = new Set(
    candidateIds.filter((id) => id !== input.candidateConfigurationId),
  );
  if (
    baselineRest.size !== candidateRest.size ||
    [...baselineRest].some((id) => !candidateRest.has(id))
  ) {
    context.addIssue({
      code: "custom",
      path: ["conditionConfigurations"],
      message: "All remaining configurations must match",
    });
  }
};

export const foundationImprovementToolInputSchema = z
  .strictObject(improvementInputShape)
  .superRefine(validateControlledComparison);
export type FoundationImprovementToolInput = z.infer<
  typeof foundationImprovementToolInputSchema
>;

export const foundationImprovementInputSchema = z
  .strictObject({
    ...improvementInputShape,
    projectId: identity,
  })
  .superRefine(validateControlledComparison);
export type FoundationImprovementInput = z.infer<
  typeof foundationImprovementInputSchema
>;

// Historical content records references; the service establishes their truth.
export const foundationImprovementProposalSchema = z
  .strictObject({
    ...improvementInputShape,
    projectId: identity,
    schemaVersion,
    id: identity,
    version: z.literal(1),
    environment,
    recordedBy: text(500),
    recordedAt: datetime,
    contentDigest: digest,
  })
  .superRefine(validateControlledComparison);
export type FoundationImprovementProposal = z.infer<
  typeof foundationImprovementProposalSchema
>;

export const foundationImprovementCountsSchema = z.strictObject({
  expectedCells: nonnegativeInteger,
  observedCells: nonnegativeInteger,
  assessedCells: nonnegativeInteger,
  passedCells: nonnegativeInteger,
  failedCells: nonnegativeInteger,
  unassessedCells: nonnegativeInteger,
  missingCells: nonnegativeInteger,
  ambiguousCells: nonnegativeInteger,
  blockedCells: nonnegativeInteger,
  attemptCount: nonnegativeInteger,
});
export type FoundationImprovementCounts = z.infer<
  typeof foundationImprovementCountsSchema
>;

export const foundationImprovementComparisonSchema = z.strictObject({
  model: text(4000),
  runtime: text(4000),
  counts: foundationImprovementCountsSchema,
  eligibleForReview: z.boolean(),
  blockers,
  pendingNewerAssessmentCount: nonnegativeInteger,
});
export type FoundationImprovementComparison = z.infer<
  typeof foundationImprovementComparisonSchema
>;

// A current advisory grants no authority and can change after a decision.
export const foundationImprovementAdvisorySchema = z.strictObject({
  schemaVersion,
  projectId: identity,
  proposalId: identity,
  proposalDigest: digest,
  evaluatedAt: datetime,
  populationDigest: digest,
  reportDigest: digest,
  eligibleForReview: z.boolean(),
  pendingNewerAssessmentCount: nonnegativeInteger,
  blockers,
  comparisons: z.array(foundationImprovementComparisonSchema),
});
export type FoundationImprovementAdvisory = z.infer<
  typeof foundationImprovementAdvisorySchema
>;

const decisionInputShape = {
  projectId: identity,
  proposalId: identity,
  expectedProposalDigest: digest,
  expectedPopulationDigest: digest,
  expectedReportDigest: digest,
  expectedDecisionVersion: nonnegativeInteger,
  decision: z.enum(["accepted", "rejected", "revoked"]),
  reason: text(4000),
  expiresAt: datetime,
};

// Authentication, live eligibility and bounded future expiry remain server checks.
export const foundationImprovementDecisionInputSchema =
  z.strictObject(decisionInputShape);
export type FoundationImprovementDecisionInput = z.infer<
  typeof foundationImprovementDecisionInputSchema
>;

export const foundationImprovementDecisionSchema = z
  .strictObject({
    ...decisionInputShape,
    schemaVersion,
    id: identity,
    version: positiveInteger,
    recordedBy: text(500).refine(
      (value) =>
        value.startsWith("user:") && value.length > 5 && !/\s/u.test(value),
      "Must be a trusted user principal",
    ),
    recordedAt: datetime,
    contentDigest: digest,
  })
  .superRefine((decision, context) => {
    if (decision.version !== decision.expectedDecisionVersion + 1) {
      context.addIssue({
        code: "custom",
        path: ["version"],
        message: "Decision version must advance exactly once",
      });
    }
    if (compareDatetimes(decision.expiresAt, decision.recordedAt) <= 0) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry must be later than recording",
      });
    }
  });
export type FoundationImprovementDecision = z.infer<
  typeof foundationImprovementDecisionSchema
>;

export const foundationImprovementDetailSchema = z
  .strictObject({
    schemaVersion,
    proposal: foundationImprovementProposalSchema,
    advisory: foundationImprovementAdvisorySchema,
    currentDecision: foundationImprovementDecisionSchema.nullable(),
  })
  .superRefine((detail, context) => {
    const { proposal, advisory, currentDecision } = detail;
    if (
      advisory.projectId !== proposal.projectId ||
      advisory.proposalId !== proposal.id ||
      advisory.proposalDigest !== proposal.contentDigest
    ) {
      context.addIssue({
        code: "custom",
        path: ["advisory"],
        message: "Advisory must reference this exact proposal",
      });
    }
    if (
      currentDecision !== null &&
      (currentDecision.projectId !== proposal.projectId ||
        currentDecision.proposalId !== proposal.id ||
        currentDecision.expectedProposalDigest !== proposal.contentDigest)
    ) {
      context.addIssue({
        code: "custom",
        path: ["currentDecision"],
        message: "Decision must reference this exact proposal",
      });
    }
  });
export type FoundationImprovementDetail = z.infer<
  typeof foundationImprovementDetailSchema
>;

export const foundationImprovementPageSchema = z
  .strictObject({
    schemaVersion,
    projectId: identity,
    items: z.array(foundationImprovementProposalSchema),
    nextCursor: text(8192).nullable(),
  })
  .superRefine((page, context) => {
    if (page.items.some((item) => item.projectId !== page.projectId)) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Every proposal must belong to the page project",
      });
    }
    if (new Set(page.items.map((item) => item.id)).size !== page.items.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Duplicate proposal identity",
      });
    }
  });
export type FoundationImprovementPage = z.infer<
  typeof foundationImprovementPageSchema
>;
