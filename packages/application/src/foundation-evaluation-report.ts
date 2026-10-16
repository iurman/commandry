import { createHash } from "node:crypto";
import {
  foundationAssessmentSchema,
  foundationConfigurationSchema,
  foundationEvaluationDefinitionSchema,
  foundationEvaluationTrialSchema,
  type FoundationAssessment,
  type FoundationConfiguration,
  type FoundationEvaluationDefinition,
  type FoundationEvaluationTrial,
} from "@commandry/contracts";
import { FoundationError, foundationDigest } from "@commandry/domain";

export type FoundationConditionConfigurations = {
  readonly condition: string;
  readonly configurationIds: readonly string[];
};

/** The caller must authenticate and scope retrieval before invoking this calculator. */
export type FoundationEvaluationReportInput = {
  readonly projectId: string;
  readonly definition: FoundationEvaluationDefinition;
  readonly trials: readonly FoundationEvaluationTrial[];
  readonly assessments: readonly FoundationAssessment[];
  readonly configurations: readonly FoundationConfiguration[];
  readonly conditionConfigurations: readonly FoundationConditionConfigurations[];
  readonly judgeConfigurationIds: readonly string[];
};

/** Cell counts never treat retries as independent successful samples. */
export type FoundationEvaluationCounts = {
  expectedCells: number;
  observedCells: number;
  assessedCells: number;
  passedCells: number;
  failedCells: number;
  unassessedCells: number;
  missingCells: number;
  ambiguousCells: number;
  blockedCells: number;
  attemptCount: number;
};

export type FoundationEvaluationBlocker =
  | "empty_cases"
  | "empty_policy"
  | "missing_cells"
  | "ambiguous_cell"
  | "missing_reviewed_assessment"
  | "artifact_binding_mismatch"
  | "rubric_binding_mismatch"
  | "missing_required_gate"
  | "check_not_passed"
  | "non_completed_outcome"
  | "no_observations";

export type FoundationEvaluationAssessmentSelection = {
  trialId: string;
  attemptId: string;
  caseId: string;
  repetition: number;
  selectedAssessmentId: string | null;
  selectedAssessmentVersion: number | null;
  selectedJudgeConfigurationId: string | null;
  reviewedAssessmentCount: number;
  olderReviewedAssessmentCount: number;
  unreviewedAssessmentCount: number;
  pendingNewerAssessmentCount: number;
  bindingValid: boolean;
  passed: boolean;
  blockers: FoundationEvaluationBlocker[];
};

export type FoundationEvaluationConditionSummary = {
  condition: string;
  configurationIds: string[];
  counts: FoundationEvaluationCounts;
  /** Counts actual attempts, including attempts in ambiguous cells. */
  outcomes: Record<FoundationEvaluationTrial["outcome"], number>;
  assessments: FoundationEvaluationAssessmentSelection[];
  /** Reviewed passing cells divided by every expected cell, never a rubric score. */
  successFraction: { numerator: number; denominator: number };
  blockers: FoundationEvaluationBlocker[];
  eligibleForReview: boolean;
};

export type FoundationEvaluationComparison = {
  model: string;
  runtime: string;
  conditionConfigurations: FoundationConditionConfigurations[];
  conditions: FoundationEvaluationConditionSummary[];
  counts: FoundationEvaluationCounts;
  blockers: FoundationEvaluationBlocker[];
  /** Review eligibility grants no authority to promote or change a workflow. */
  eligibleForReview: boolean;
};

export type FoundationEvaluationReport = {
  projectId: string;
  definitionId: string;
  definitionVersion: number;
  expectedCellsPerComparison: number;
  subjectConfigurations: { id: string; contentDigest: string }[];
  judgeConfigurations: { id: string; contentDigest: string }[];
  comparisons: FoundationEvaluationComparison[];
  blockers: FoundationEvaluationBlocker[];
  eligibleForReview: boolean;
};

function invalid(): never {
  throw new FoundationError("INVALID_REFERENCE", "Invalid evaluation records");
}

function conflict(): never {
  throw new FoundationError(
    "VERSION_CONFLICT",
    "Conflicting evaluation records",
  );
}

function parseRecord<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) invalid();
  return result.data;
}

function sameProject(value: { projectId: string }, projectId: string): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.projectId === "string" &&
    value.projectId.toLowerCase() === projectId
  );
}

function scopedRecords<T extends { id: string; projectId: string }>(
  values: readonly T[],
  projectId: string,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
): T[] {
  const records = new Map<string, { digest: string; record: T }>();
  for (const value of values) {
    // Foreign details must never be parsed or included in report populations.
    if (!sameProject(value, projectId)) continue;
    const record = parseRecord(schema, value);
    const digest = foundationDigest(record);
    const prior = records.get(record.id);
    if (prior && prior.digest !== digest) conflict();
    records.set(record.id, { digest, record });
  }
  return [...records.values()].map(({ record }) => record);
}

function identities(values: readonly string[]): string[] {
  const ids = values.map((id) =>
    parseRecord(foundationEvaluationDefinitionSchema.shape.projectId, id),
  );
  if (new Set(ids).size !== ids.length) invalid();
  return ids.sort();
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return (
    leftSorted.length === rightSorted.length &&
    leftSorted.every((id, index) => id === rightSorted[index])
  );
}

function safeProduct(...values: number[]): number {
  let result = 1;
  for (const value of values) {
    result *= value;
    if (!Number.isSafeInteger(result)) invalid();
  }
  return result;
}

function emptyCounts(expectedCells: number): FoundationEvaluationCounts {
  return {
    expectedCells,
    observedCells: 0,
    assessedCells: 0,
    passedCells: 0,
    failedCells: 0,
    unassessedCells: 0,
    missingCells: expectedCells,
    ambiguousCells: 0,
    blockedCells: 0,
    attemptCount: 0,
  };
}

function sumCounts(
  conditions: readonly FoundationEvaluationConditionSummary[],
): FoundationEvaluationCounts {
  const result = emptyCounts(0);
  for (const condition of conditions) {
    for (const key of Object.keys(result) as (keyof typeof result)[]) {
      result[key] += condition.counts[key];
      if (!Number.isSafeInteger(result[key])) invalid();
    }
  }
  return result;
}

function selectAssessment(
  trial: FoundationEvaluationTrial,
  rubric: FoundationEvaluationDefinition["cases"][number],
  assessments: readonly FoundationAssessment[],
): FoundationEvaluationAssessmentSelection {
  const reviewed = assessments.filter(
    (entry) => entry.reviewStatus === "reviewed",
  );
  const selected = reviewed.reduce<FoundationAssessment | null>(
    (latest, entry) =>
      !latest || entry.version > latest.version ? entry : latest,
    null,
  );
  const pending = assessments.filter(
    (entry) => entry.reviewStatus === "unreviewed",
  );
  const blockers: FoundationEvaluationBlocker[] = [];
  if (!selected) blockers.push("missing_reviewed_assessment");
  if (selected && !trial.artifactDigests.includes(selected.trialArtifactDigest))
    blockers.push("artifact_binding_mismatch");
  if (selected && selected.rubricDigest !== rubric.rubricDigest)
    blockers.push("rubric_binding_mismatch");
  const bindingValid =
    selected !== null &&
    !blockers.includes("artifact_binding_mismatch") &&
    !blockers.includes("rubric_binding_mismatch");
  if (rubric.hardGates.length === 0) blockers.push("empty_policy");
  if (selected) {
    for (const gate of rubric.hardGates) {
      const check = selected.checks.find((entry) => entry.id === gate);
      if (!check) blockers.push("missing_required_gate");
      else if (check.result !== "pass") blockers.push("check_not_passed");
    }
    // Every failed/unknown check blocks; a hardGate:false cannot bypass policy.
    if (selected.checks.some((check) => check.result !== "pass"))
      blockers.push("check_not_passed");
  }
  if (trial.outcome !== "completed") blockers.push("non_completed_outcome");
  return {
    trialId: trial.id,
    attemptId: trial.attemptId,
    caseId: trial.caseId,
    repetition: trial.repetition,
    selectedAssessmentId: selected?.id ?? null,
    selectedAssessmentVersion: selected?.version ?? null,
    selectedJudgeConfigurationId: selected?.judgeConfigurationId ?? null,
    reviewedAssessmentCount: reviewed.length,
    olderReviewedAssessmentCount: reviewed.length - (selected ? 1 : 0),
    unreviewedAssessmentCount: pending.length,
    pendingNewerAssessmentCount: pending.filter(
      (entry) => entry.version > (selected?.version ?? 0),
    ).length,
    bindingValid,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}

/** Pure, project-filtered comparison of immutable records; never promotes anything. */
export function buildFoundationEvaluationReport(
  input: FoundationEvaluationReportInput,
): FoundationEvaluationReport {
  const projectId = parseRecord(
    foundationEvaluationDefinitionSchema.shape.projectId,
    input.projectId,
  );
  if (!sameProject(input.definition, projectId))
    throw new FoundationError("FORBIDDEN", "Evaluation scope does not match");
  const definition = parseRecord(
    foundationEvaluationDefinitionSchema,
    input.definition,
  );
  const expectedPerCondition = safeProduct(
    definition.cases.length,
    definition.repetitions,
  );
  const expectedCellsPerComparison = safeProduct(
    expectedPerCondition,
    definition.conditions.length,
  );
  const configurations = scopedRecords(
    input.configurations,
    projectId,
    foundationConfigurationSchema,
  );
  const configurationById = new Map(
    configurations.map((entry) => [entry.id, entry]),
  );
  for (const configuration of configurations) {
    const actualDigest = createHash("sha256")
      .update(configuration.content, "utf8")
      .digest("hex");
    if (actualDigest !== configuration.contentDigest) invalid();
  }
  const requireConfigurations = (ids: readonly string[]) => {
    for (const id of ids) if (!configurationById.has(id)) invalid();
  };
  requireConfigurations(definition.configurationIds);
  const judges = identities(input.judgeConfigurationIds);
  requireConfigurations(judges);
  const mappings = new Map<string, string[]>();
  for (const mapping of input.conditionConfigurations) {
    if (
      !definition.conditions.includes(mapping.condition) ||
      mappings.has(mapping.condition)
    )
      invalid();
    const ids = identities(mapping.configurationIds);
    if (
      ids.length === 0 ||
      ids.some((id) => !definition.configurationIds.includes(id))
    )
      invalid();
    requireConfigurations(ids);
    mappings.set(mapping.condition, ids);
  }
  if (mappings.size !== definition.conditions.length) invalid();
  const conditionConfigurations = definition.conditions.map((condition) => ({
    condition,
    configurationIds: mappings.get(condition)!,
  }));
  const cases = new Map(definition.cases.map((entry) => [entry.id, entry]));
  const trials = scopedRecords(
    input.trials,
    projectId,
    foundationEvaluationTrialSchema,
  );
  const trialById = new Map(trials.map((trial) => [trial.id, trial]));
  const attempts = new Set<string>();
  const groups = new Map<string, FoundationEvaluationTrial[]>();
  for (const trial of trials) {
    const expectedIds = mappings.get(trial.condition);
    const evaluationCase = cases.get(trial.caseId);
    if (
      trial.definitionId !== definition.id ||
      !evaluationCase ||
      trial.inputDigest !== evaluationCase.fixtureDigest ||
      !expectedIds ||
      trial.repetition > definition.repetitions ||
      !sameIds(trial.configurationIds, expectedIds)
    )
      invalid();
    if (attempts.has(trial.attemptId)) conflict();
    attempts.add(trial.attemptId);
    const key = JSON.stringify([trial.model, trial.runtime]);
    const group = groups.get(key) ?? [];
    group.push(trial);
    groups.set(key, group);
  }
  const assessments = scopedRecords(
    input.assessments,
    projectId,
    foundationAssessmentSchema,
  );
  const assessmentVersions = new Set<string>();
  const assessmentsByTrial = new Map<string, FoundationAssessment[]>();
  for (const assessment of assessments) {
    if (
      !trialById.has(assessment.trialId) ||
      !judges.includes(assessment.judgeConfigurationId)
    )
      invalid();
    requireConfigurations([assessment.judgeConfigurationId]);
    const key = JSON.stringify([assessment.trialId, assessment.version]);
    if (assessmentVersions.has(key)) conflict();
    assessmentVersions.add(key);
    const entries = assessmentsByTrial.get(assessment.trialId) ?? [];
    entries.push(assessment);
    assessmentsByTrial.set(assessment.trialId, entries);
  }
  const definitionBlockers: FoundationEvaluationBlocker[] = [];
  if (definition.cases.length === 0) definitionBlockers.push("empty_cases");
  if (definition.cases.some((entry) => entry.hardGates.length === 0))
    definitionBlockers.push("empty_policy");
  const comparisons = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]): FoundationEvaluationComparison => {
      const conditions = conditionConfigurations.map(
        (mapping): FoundationEvaluationConditionSummary => {
          const conditionTrials = group.filter(
            (trial) => trial.condition === mapping.condition,
          );
          const counts = emptyCounts(expectedPerCondition);
          const outcomes: FoundationEvaluationConditionSummary["outcomes"] = {
            completed: 0,
            failed: 0,
            timed_out: 0,
            canceled: 0,
            unsupported: 0,
            infrastructure_failed: 0,
          };
          const selections = conditionTrials
            .map((trial) => {
              outcomes[trial.outcome] += 1;
              return selectAssessment(
                trial,
                cases.get(trial.caseId)!,
                assessmentsByTrial.get(trial.id) ?? [],
              );
            })
            .sort((a, b) =>
              a.trialId < b.trialId ? -1 : a.trialId > b.trialId ? 1 : 0,
            );
          const cells = new Map<
            string,
            FoundationEvaluationAssessmentSelection[]
          >();
          for (const selection of selections) {
            const key = JSON.stringify([
              selection.caseId,
              selection.repetition,
            ]);
            const entries = cells.get(key) ?? [];
            entries.push(selection);
            cells.set(key, entries);
          }
          counts.attemptCount = conditionTrials.length;
          counts.observedCells = cells.size;
          counts.missingCells -= cells.size;
          const blockers = new Set(definitionBlockers);
          if (counts.missingCells > 0) blockers.add("missing_cells");
          for (const entries of cells.values()) {
            if (entries.length > 1) {
              counts.ambiguousCells += 1;
              counts.unassessedCells += 1;
              counts.blockedCells += 1;
              blockers.add("ambiguous_cell");
              for (const entry of entries) {
                entry.passed = false;
                entry.blockers.push("ambiguous_cell");
              }
            } else {
              const entry = entries[0]!;
              if (entry.bindingValid) counts.assessedCells += 1;
              else counts.unassessedCells += 1;
              if (entry.passed) counts.passedCells += 1;
              else {
                counts.blockedCells += 1;
                if (entry.bindingValid) counts.failedCells += 1;
              }
            }
            for (const entry of entries)
              for (const reason of entry.blockers) blockers.add(reason);
          }
          return {
            condition: mapping.condition,
            configurationIds: [...mapping.configurationIds],
            counts,
            outcomes,
            assessments: selections,
            successFraction: {
              numerator: counts.passedCells,
              denominator: expectedPerCondition,
            },
            blockers: [...blockers],
            eligibleForReview:
              blockers.size === 0 &&
              counts.passedCells === expectedPerCondition,
          };
        },
      );
      const blockers = [
        ...new Set(conditions.flatMap((condition) => condition.blockers)),
      ];
      return {
        model: group[0]!.model,
        runtime: group[0]!.runtime,
        conditionConfigurations: conditionConfigurations.map((mapping) => ({
          condition: mapping.condition,
          configurationIds: [...mapping.configurationIds],
        })),
        conditions,
        counts: sumCounts(conditions),
        blockers,
        eligibleForReview: conditions.every(
          (condition) => condition.eligibleForReview,
        ),
      };
    });
  const describeConfigurations = (ids: readonly string[]) =>
    ids.map((id) => ({
      id,
      contentDigest: configurationById.get(id)!.contentDigest,
    }));
  const blockers = [
    ...new Set([
      ...definitionBlockers,
      ...comparisons.flatMap((comparison) => comparison.blockers),
    ]),
  ];
  if (comparisons.length === 0) blockers.push("no_observations");
  return {
    projectId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    expectedCellsPerComparison,
    subjectConfigurations: describeConfigurations(definition.configurationIds),
    judgeConfigurations: describeConfigurations(judges),
    comparisons,
    blockers,
    eligibleForReview:
      comparisons.length > 0 &&
      blockers.length === 0 &&
      comparisons.every((comparison) => comparison.eligibleForReview),
  };
}
