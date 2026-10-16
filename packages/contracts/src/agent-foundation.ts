import { z } from "zod";

const schemaVersion = z.literal(1);
const identity = z.uuid().transform((value) => value.toLowerCase());
const datetime = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const positiveInteger = z.number().int().positive();
const nonnegativeInteger = z.number().int().nonnegative();
const nonemptyString = (maximum = 4000) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, "Must not be blank");
const uniqueIdentities = () =>
  z
    .array(identity)
    .refine(
      (values) => new Set(values).size === values.length,
      "Duplicate identity",
    );
const uniqueStrings = (maximum = 4000) =>
  z
    .array(nonemptyString(maximum))
    .refine(
      (values) => new Set(values).size === values.length,
      "Duplicate value",
    );
const verification = z.enum([
  "unverified",
  "source_matched",
  "independently_verified",
]);

export const foundationOperationSchema = z.enum([
  "foundation.read",
  "work.read",
  "evidence.record",
  "memory.propose",
  "memory.revise",
  "memory.import",
  "memory.review",
  "memory.verify",
  "instruction.approve",
  "configuration.record",
  "evaluation.record",
]);
export type FoundationOperation = z.infer<typeof foundationOperationSchema>;

export const foundationActorSchema = z.strictObject({
  schemaVersion,
  principalId: nonemptyString(),
  clientId: identity.nullable(),
  runId: identity.nullable(),
  capabilities: z
    .array(foundationOperationSchema)
    .refine(
      (values) => new Set(values).size === values.length,
      "Duplicate capability",
    ),
  projectId: identity,
  resourceIds: uniqueIdentities(),
  environment: z.enum(["local", "test", "preview", "production"]),
  expiresAt: datetime,
  correlationId: identity,
});
export type FoundationActor = z.infer<typeof foundationActorSchema>;

export const foundationEvidenceInputSchema = z.strictObject({
  projectId: identity,
  sourceKind: z.enum(["capture", "knowledge_revision", "artifact", "external"]),
  sourceId: nonemptyString(500),
  sourceVersion: nonemptyString(100).nullable(),
  contentDigest: digest,
  locator: nonemptyString(2000),
  observedAt: datetime.nullable(),
  availability: z.enum(["available", "unavailable"]),
});
export type FoundationEvidenceInput = z.infer<
  typeof foundationEvidenceInputSchema
>;

export const foundationEvidenceSchema = z.strictObject({
  ...foundationEvidenceInputSchema.shape,
  schemaVersion,
  id: identity,
  ingestedAt: datetime,
  recordedBy: nonemptyString(),
  verification,
});
export type FoundationEvidence = z.infer<typeof foundationEvidenceSchema>;

export const foundationAliasSchema = z.strictObject({
  namespace: nonemptyString(100),
  externalId: nonemptyString(500),
});
export type FoundationAlias = z.infer<typeof foundationAliasSchema>;

export const foundationMemoryContentSchema = z
  .strictObject({
    statement: nonemptyString(20000),
    category: z.enum(["finding", "preference", "instruction", "decision"]),
    evidenceIds: uniqueIdentities().min(1).max(1000),
    relatedMemoryIds: uniqueIdentities().max(1000),
    relationType: z.enum(["contradicts", "supersedes"]).nullable(),
  })
  .superRefine((content, context) => {
    if (
      content.relatedMemoryIds.length > 0 !==
      (content.relationType !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["relationType"],
        message:
          "A relation type is required exactly when related memories exist",
      });
    }
  });
export type FoundationMemoryContent = z.infer<
  typeof foundationMemoryContentSchema
>;

export const foundationProposeMemorySchema = z.strictObject({
  projectId: identity,
  knowledgeItemId: identity,
  content: foundationMemoryContentSchema,
  alias: foundationAliasSchema.nullable(),
});
export type FoundationProposeMemory = z.infer<
  typeof foundationProposeMemorySchema
>;

export const foundationReviseMemorySchema = z.strictObject({
  projectId: identity,
  memoryId: identity,
  expectedVersion: positiveInteger,
  content: foundationMemoryContentSchema,
});
export type FoundationReviseMemory = z.infer<
  typeof foundationReviseMemorySchema
>;

export const foundationMemorySchema = z.strictObject({
  schemaVersion,
  id: identity,
  projectId: identity,
  knowledgeItemId: identity,
  version: positiveInteger,
  contentDigest: digest,
  content: foundationMemoryContentSchema,
  lifecycle: z.enum(["proposed", "accepted", "rejected", "superseded"]),
  verification,
  recordedBy: nonemptyString(),
  recordedAt: datetime,
});
export type FoundationMemory = z.infer<typeof foundationMemorySchema>;

export const foundationReviewMemorySchema = z.strictObject({
  projectId: identity,
  memoryId: identity,
  expectedVersion: positiveInteger,
  decision: z.enum(["accepted", "rejected", "superseded"]),
  reason: nonemptyString(4000),
});
export type FoundationReviewMemory = z.infer<
  typeof foundationReviewMemorySchema
>;

export const foundationVerifyMemorySchema = z.strictObject({
  projectId: identity,
  memoryId: identity,
  expectedVersion: positiveInteger,
  verification: z.enum(["source_matched", "independently_verified"]),
  evidenceIds: uniqueIdentities().min(1).max(1000),
  reason: nonemptyString(4000),
});
export type FoundationVerifyMemory = z.infer<
  typeof foundationVerifyMemorySchema
>;

export const foundationApproveInstructionSchema = z.strictObject({
  projectId: identity,
  memoryId: identity,
  expectedVersion: positiveInteger,
  contentDigest: digest,
  disclosureProjectId: identity,
  expiresAt: datetime,
});
export type FoundationApproveInstruction = z.infer<
  typeof foundationApproveInstructionSchema
>;

export const foundationPageSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(25),
  after: identity.optional(),
  asOf: datetime.optional(),
});
export type FoundationPage = z.infer<typeof foundationPageSchema>;

export const foundationWorkingContextSchema = z
  .strictObject({
    schemaVersion,
    projectId: identity,
    generatedAt: datetime,
    sourceVersions: z
      .array(
        z.strictObject({
          evidenceId: identity,
          contentDigest: digest,
        }),
      )
      .refine(
        (values) =>
          new Set(values.map((value) => value.evidenceId)).size ===
          values.length,
        "Duplicate evidence identity",
      ),
    instructionVersions: z
      .array(
        z.strictObject({
          memoryId: identity,
          version: positiveInteger,
          contentDigest: digest,
          approvalId: identity,
        }),
      )
      .refine(
        (values) =>
          new Set(values.map((value) => value.memoryId)).size === values.length,
        "Duplicate instruction identity",
      ),
    omissions: z.array(
      z.strictObject({
        reason: nonemptyString(),
        count: nonnegativeInteger,
      }),
    ),
    freshness: z.enum(["fresh", "stale", "unknown"]),
    contentDigest: digest,
    budget: z.strictObject({
      maxCharacters: positiveInteger,
      usedCharacters: nonnegativeInteger,
      tokenEstimate: nonnegativeInteger.nullable(),
      tokenizer: nonemptyString().nullable(),
    }),
    continuation: nonemptyString().nullable(),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.budget.usedCharacters > snapshot.budget.maxCharacters) {
      context.addIssue({
        code: "custom",
        path: ["budget", "usedCharacters"],
        message: "Used characters exceed the character budget",
      });
    }
  });
export type FoundationWorkingContext = z.infer<
  typeof foundationWorkingContextSchema
>;

export const foundationConfigurationSchema = z.strictObject({
  schemaVersion,
  id: identity,
  projectId: identity,
  kind: z.enum([
    "prompt",
    "skill",
    "hook",
    "loop",
    "runtime",
    "model",
    "settings",
  ]),
  content: z.string().max(1000000),
  contentDigest: digest,
  parentIds: uniqueIdentities(),
  sourceCommit: nonemptyString().nullable(),
  recordedAt: datetime,
  recordedBy: nonemptyString(),
});
export type FoundationConfiguration = z.infer<
  typeof foundationConfigurationSchema
>;

export const foundationEvaluationDefinitionSchema = z.strictObject({
  schemaVersion,
  id: identity,
  projectId: identity,
  version: positiveInteger,
  name: nonemptyString(200),
  configurationIds: uniqueIdentities().min(1),
  cases: z
    .array(
      z.strictObject({
        id: nonemptyString(),
        fixtureDigest: digest,
        rubricDigest: digest,
        hardGates: uniqueStrings(),
      }),
    )
    .refine(
      (cases) => new Set(cases.map((entry) => entry.id)).size === cases.length,
      "Duplicate case identity",
    ),
  conditions: uniqueStrings().min(1),
  repetitions: positiveInteger,
  disclosure: z.enum(["local_only", "approved_project"]),
});
export type FoundationEvaluationDefinition = z.infer<
  typeof foundationEvaluationDefinitionSchema
>;

export const foundationEvaluationTrialSchema = z
  .strictObject({
    schemaVersion,
    id: identity,
    attemptId: identity,
    definitionId: identity,
    projectId: identity,
    caseId: nonemptyString(),
    condition: nonemptyString(),
    repetition: positiveInteger,
    configurationIds: uniqueIdentities().min(1),
    model: nonemptyString(),
    runtime: nonemptyString(),
    inputDigest: digest,
    artifactDigests: z
      .array(digest)
      .refine(
        (values) => new Set(values).size === values.length,
        "Duplicate artifact digest",
      ),
    outcome: z.enum([
      "completed",
      "failed",
      "timed_out",
      "canceled",
      "unsupported",
      "infrastructure_failed",
    ]),
    usage: z.strictObject({
      inputTokens: nonnegativeInteger.nullable(),
      outputTokens: nonnegativeInteger.nullable(),
    }),
    recordedAt: datetime,
  })
  .superRefine((trial, context) => {
    if (trial.outcome === "completed" && trial.artifactDigests.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["artifactDigests"],
        message: "Completed trials require artifact evidence",
      });
    }
  });
export type FoundationEvaluationTrial = z.infer<
  typeof foundationEvaluationTrialSchema
>;

export const foundationAssessmentSchema = z.strictObject({
  schemaVersion,
  id: identity,
  trialId: identity,
  projectId: identity,
  version: positiveInteger,
  trialArtifactDigest: digest,
  rubricDigest: digest,
  judgeConfigurationId: identity,
  checks: z
    .array(
      z.strictObject({
        id: nonemptyString(),
        result: z.enum(["pass", "fail", "unknown"]),
        hardGate: z.boolean(),
      }),
    )
    .refine(
      (checks) =>
        new Set(checks.map((check) => check.id)).size === checks.length,
      "Duplicate check identity",
    ),
  uncertainty: nonemptyString().nullable(),
  reviewStatus: z.enum(["unreviewed", "reviewed"]),
  recordedAt: datetime,
});
export type FoundationAssessment = z.infer<typeof foundationAssessmentSchema>;

export const foundationWorkflowDefinitionSchema = z
  .strictObject({
    schemaVersion,
    id: identity,
    projectId: identity,
    configurationId: identity,
    prerequisites: uniqueStrings(),
    steps: z.array(
      z.strictObject({
        id: nonemptyString(),
        dependsOn: uniqueStrings(),
        operation: foundationOperationSchema,
      }),
    ),
    maxAttempts: positiveInteger,
  })
  .superRefine((definition, context) => {
    const ids = new Set(definition.steps.map((step) => step.id));
    if (ids.size !== definition.steps.length) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Duplicate step identity",
      });
      return;
    }

    let invalidDependency = false;
    const dependents = new Map<string, string[]>();
    const remaining = new Map<string, number>();
    for (const [index, step] of definition.steps.entries()) {
      remaining.set(step.id, step.dependsOn.length);
      for (const dependency of step.dependsOn) {
        if (dependency === step.id || !ids.has(dependency)) {
          invalidDependency = true;
          context.addIssue({
            code: "custom",
            path: ["steps", index, "dependsOn"],
            message: "Dependencies must reference another existing step",
          });
        }
        const children = dependents.get(dependency) ?? [];
        children.push(step.id);
        dependents.set(dependency, children);
      }
    }
    if (invalidDependency) return;

    const ready = definition.steps
      .filter((step) => step.dependsOn.length === 0)
      .map((step) => step.id);
    for (let index = 0; index < ready.length; index += 1) {
      for (const child of dependents.get(ready[index]!) ?? []) {
        const count = remaining.get(child)! - 1;
        remaining.set(child, count);
        if (count === 0) ready.push(child);
      }
    }
    if (ready.length !== definition.steps.length) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Workflow dependencies contain a cycle",
      });
    }
  });
export type FoundationWorkflowDefinition = z.infer<
  typeof foundationWorkflowDefinitionSchema
>;

export const foundationWorkflowRunSchema = z
  .strictObject({
    schemaVersion,
    id: identity,
    projectId: identity,
    definitionId: identity,
    parentRunId: identity.nullable(),
    attempt: positiveInteger,
    state: z.enum([
      "queued",
      "running",
      "blocked",
      "awaiting_approval",
      "completed",
      "failed",
      "canceled",
    ]),
    steps: z.array(
      z.strictObject({
        id: nonemptyString(),
        state: z.enum([
          "pending",
          "running",
          "blocked",
          "awaiting_approval",
          "completed",
          "failed",
          "skipped",
        ]),
        evidenceIds: uniqueIdentities(),
      }),
    ),
    recordedAt: datetime,
  })
  .superRefine((run, context) => {
    if (new Set(run.steps.map((step) => step.id)).size !== run.steps.length) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Duplicate step identity",
      });
    }
    for (const [index, step] of run.steps.entries()) {
      if (step.state === "completed" && step.evidenceIds.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["steps", index, "evidenceIds"],
          message: "Completed steps require evidence",
        });
      }
    }
    if (
      run.state === "completed" &&
      (run.steps.length === 0 ||
        run.steps.some((step) => step.state !== "completed"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Completed runs require completed steps with evidence",
      });
    }
  });
export type FoundationWorkflowRun = z.infer<typeof foundationWorkflowRunSchema>;
