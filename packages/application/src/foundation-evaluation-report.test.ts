import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  FoundationAssessment,
  FoundationConfiguration,
  FoundationEvaluationDefinition,
  FoundationEvaluationTrial,
} from "@commandry/contracts";
import { FoundationError } from "@commandry/domain";
import {
  buildFoundationEvaluationReport,
  type FoundationEvaluationReportInput,
} from "./foundation-evaluation-report.js";

const id = (value: number) =>
  "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
const digest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const projectId = id(1);
const recordedAt = "2026-10-16T12:00:00Z";
const gates = ["privacy", "authority", "verification"];

type Fixture = {
  projectId: string;
  definition: FoundationEvaluationDefinition;
  trials: FoundationEvaluationTrial[];
  assessments: FoundationAssessment[];
  configurations: FoundationConfiguration[];
  conditionConfigurations: { condition: string; configurationIds: string[] }[];
  judgeConfigurationIds: string[];
};

function fixture(): Fixture {
  const configurations: FoundationConfiguration[] = [2, 3, 4].map((number) => {
    const content =
      number === 3
        ? "exact prompt with unicode: café\n"
        : "configuration " + number;
    return {
      schemaVersion: 1,
      id: id(number),
      projectId,
      kind: number === 3 ? "prompt" : "settings",
      content,
      contentDigest: digest(content),
      parentIds: [],
      sourceCommit: null,
      recordedAt,
      recordedBy: "synthetic fixture",
    };
  });
  const definition: FoundationEvaluationDefinition = {
    schemaVersion: 1,
    id: id(5),
    projectId,
    version: 1,
    name: "Synthetic comparison",
    configurationIds: [id(2), id(3)],
    cases: [
      {
        id: "scoped-context",
        fixtureDigest: digest("fixture"),
        rubricDigest: digest("rubric"),
        hardGates: [...gates],
      },
    ],
    conditions: ["without", "with"],
    repetitions: 2,
    disclosure: "local_only",
  };
  const trials: FoundationEvaluationTrial[] = [];
  for (const condition of definition.conditions) {
    for (
      let repetition = 1;
      repetition <= definition.repetitions;
      repetition += 1
    ) {
      const number = trials.length;
      trials.push({
        schemaVersion: 1,
        id: id(100 + number),
        attemptId: id(200 + number),
        definitionId: definition.id,
        projectId,
        caseId: "scoped-context",
        condition,
        repetition,
        configurationIds: [condition === "without" ? id(2) : id(3)],
        model: "synthetic-model-A",
        runtime: "fixture-runtime-v1",
        inputDigest: digest("fixture"),
        artifactDigests: [digest("artifact " + number)],
        outcome: "completed",
        usage: { inputTokens: null, outputTokens: null },
        recordedAt,
      });
    }
  }
  const assessments: FoundationAssessment[] = trials.map((trial, number) => ({
    schemaVersion: 1,
    id: id(300 + number),
    trialId: trial.id,
    projectId,
    version: 1,
    trialArtifactDigest: trial.artifactDigests[0]!,
    rubricDigest: definition.cases[0]!.rubricDigest,
    judgeConfigurationId: id(4),
    checks: gates.map((gate) => ({ id: gate, result: "pass", hardGate: true })),
    uncertainty: null,
    reviewStatus: "reviewed",
    recordedAt,
  }));
  return {
    projectId,
    definition,
    trials,
    assessments,
    configurations,
    conditionConfigurations: [
      { condition: "without", configurationIds: [id(2)] },
      { condition: "with", configurationIds: [id(3)] },
    ],
    judgeConfigurationIds: [id(4)],
  };
}

function removeTrials(
  input: Fixture,
  predicate: (trial: FoundationEvaluationTrial) => boolean,
) {
  input.trials = input.trials.filter(predicate);
  input.assessments = input.assessments.filter((assessment) =>
    input.trials.some((trial) => trial.id === assessment.trialId),
  );
}

function laterAssessment(
  input: Fixture,
  patch: Partial<FoundationAssessment> = {},
) {
  input.assessments.push({
    ...input.assessments[0]!,
    id: id(400),
    version: 2,
    ...patch,
  });
}

function firstCondition(input: FoundationEvaluationReportInput) {
  return buildFoundationEvaluationReport(input).comparisons[0]!.conditions[0]!;
}

function expectSafeError(
  input: FoundationEvaluationReportInput,
  code = "INVALID_REFERENCE",
) {
  try {
    buildFoundationEvaluationReport(input);
    expect.fail("Expected safe rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(FoundationError);
    expect((error as FoundationError).code).toBe(code);
    expect((error as Error).message).not.toContain("private payload");
  }
}

function deepFreeze(value: object) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") deepFreeze(child);
  }
}

describe("buildFoundationEvaluationReport", () => {
  it("reports real sample fractions and keeps subject and judge identities separate", () => {
    const report = buildFoundationEvaluationReport(fixture());
    expect(report.eligibleForReview).toBe(true);
    expect(report.expectedCellsPerComparison).toBe(4);
    expect(report.subjectConfigurations.map((entry) => entry.id)).toEqual([
      id(2),
      id(3),
    ]);
    expect(report.judgeConfigurations.map((entry) => entry.id)).toEqual([
      id(4),
    ]);
    expect(report.comparisons[0]!.counts).toEqual({
      expectedCells: 4,
      observedCells: 4,
      assessedCells: 4,
      passedCells: 4,
      failedCells: 0,
      unassessedCells: 0,
      missingCells: 0,
      ambiguousCells: 0,
      blockedCells: 0,
      attemptCount: 4,
    });
    expect(
      report.comparisons[0]!.conditions.map((entry) => entry.successFraction),
    ).toEqual([
      { numerator: 2, denominator: 2 },
      { numerator: 2, denominator: 2 },
    ]);
    expect(report.comparisons[0]!.conditions[0]!.assessments[0]).toMatchObject({
      selectedAssessmentVersion: 1,
      selectedJudgeConfigurationId: id(4),
      passed: true,
    });
  });

  it.each(["condition", "repetition"])(
    "blocks a missing %s without shrinking the denominator",
    (missing) => {
      const input = fixture();
      removeTrials(input, (trial) =>
        missing === "condition"
          ? trial.condition !== "with"
          : !(trial.condition === "without" && trial.repetition === 2),
      );
      const report = buildFoundationEvaluationReport(input);
      expect(report.eligibleForReview).toBe(false);
      expect(report.comparisons[0]!.counts.expectedCells).toBe(4);
      expect(report.comparisons[0]!.counts.missingCells).toBe(
        missing === "condition" ? 2 : 1,
      );
      expect(report.blockers).toContain("missing_cells");
    },
  );

  it("partitions changed model and runtime observations, leaving each comparison incomplete", () => {
    const input = fixture();
    input.trials[0]!.model = "synthetic-model-B";
    input.trials[1]!.runtime = "fixture-runtime-v2";
    const report = buildFoundationEvaluationReport(input);
    expect(report.comparisons).toHaveLength(3);
    expect(
      report.comparisons.map((entry) => entry.counts.attemptCount).sort(),
    ).toEqual([1, 1, 2]);
    expect(report.comparisons.every((entry) => !entry.eligibleForReview)).toBe(
      true,
    );
    expect(report.eligibleForReview).toBe(false);
  });

  it("preserves two complete model populations without pooling their sample sizes", () => {
    const input = fixture();
    const extraTrials = input.trials.map((trial, number) => ({
      ...trial,
      id: id(500 + number),
      attemptId: id(600 + number),
      model: "synthetic-model-B",
    }));
    const extraAssessments = input.assessments.map((assessment, number) => ({
      ...assessment,
      id: id(700 + number),
      trialId: extraTrials[number]!.id,
    }));
    input.trials.push(...extraTrials);
    input.assessments.push(...extraAssessments);
    const report = buildFoundationEvaluationReport(input);
    expect(report.eligibleForReview).toBe(true);
    expect(report.comparisons).toHaveLength(2);
    expect(
      report.comparisons.every(
        (entry) =>
          entry.counts.expectedCells === 4 && entry.counts.attemptCount === 4,
      ),
    ).toBe(true);
    expect(report.comparisons[0]!.conditionConfigurations).toEqual(
      input.conditionConfigurations,
    );
  });

  it("rejects a changed condition configuration rather than mixing it with the fixed mapping", () => {
    const input = fixture();
    input.trials[0]!.configurationIds = [id(3)];
    expectSafeError(input);
  });

  it.each(gates)(
    "blocks failed mandatory %s even if hardGate is false and all other checks pass",
    (gate) => {
      const input = fixture();
      input.assessments[0]!.checks = [
        ...gates.map((name) => ({
          id: name,
          result: name === gate ? ("fail" as const) : ("pass" as const),
          hardGate: false,
        })),
        ...Array.from({ length: 20 }, (_, number) => ({
          id: "quality-" + number,
          result: "pass" as const,
          hardGate: false,
        })),
      ];
      const condition = firstCondition(input);
      expect(condition.eligibleForReview).toBe(false);
      expect(condition.counts.failedCells).toBe(1);
      expect(condition.successFraction).toEqual({
        numerator: 1,
        denominator: 2,
      });
      expect(condition.blockers).toContain("check_not_passed");
    },
  );

  it.each(["fail", "unknown"] as const)(
    "blocks an observed additional hard gate with %s result",
    (result) => {
      const input = fixture();
      input.assessments[0]!.checks.push({
        id: "extra-hard-gate",
        hardGate: true,
        result,
      });
      expect(firstCondition(input).eligibleForReview).toBe(false);
    },
  );

  it("blocks an unknown non-gate check as well as missing mandatory checks", () => {
    const input = fixture();
    input.assessments[0]!.checks = [
      { id: "quality", hardGate: false, result: "unknown" },
    ];
    const condition = firstCondition(input);
    expect(condition.blockers).toContain("missing_required_gate");
    expect(condition.blockers).toContain("check_not_passed");
    expect(condition.counts.passedCells).toBe(1);
  });

  it("never treats a definition without declared policy as promotion-review eligible", () => {
    const input = fixture();
    input.definition.cases[0]!.hardGates = [];
    expect(firstCondition(input).blockers).toContain("empty_policy");
    expect(buildFoundationEvaluationReport(input).eligibleForReview).toBe(
      false,
    );
  });

  it("does not invent a sample or promotion verdict for zero cases", () => {
    const input = fixture();
    input.definition.cases = [];
    input.trials = [];
    input.assessments = [];
    const report = buildFoundationEvaluationReport(input);
    expect(report.expectedCellsPerComparison).toBe(0);
    expect(report.comparisons).toEqual([]);
    expect(report.blockers).toEqual(["empty_cases", "no_observations"]);
    expect(report.eligibleForReview).toBe(false);
  });

  it("shows no observations without manufacturing a model identity", () => {
    const input = fixture();
    input.trials = [];
    input.assessments = [];
    const report = buildFoundationEvaluationReport(input);
    expect(report.expectedCellsPerComparison).toBe(4);
    expect(report.blockers).toContain("no_observations");
    expect(report.eligibleForReview).toBe(false);
  });

  it.each(["trialArtifactDigest", "rubricDigest"] as const)(
    "does not fall back after a newer reviewed assessment changes %s",
    (field) => {
      const input = fixture();
      laterAssessment(input, { [field]: digest("substituted evidence") });
      const condition = firstCondition(input);
      const selected = condition.assessments.find(
        (entry) => entry.trialId === input.trials[0]!.id,
      )!;
      expect(selected).toMatchObject({
        selectedAssessmentVersion: 2,
        olderReviewedAssessmentCount: 1,
        bindingValid: false,
        passed: false,
      });
      expect(condition.counts.unassessedCells).toBe(1);
      expect(condition.counts.assessedCells).toBe(1);
      expect(condition.eligibleForReview).toBe(false);
    },
  );

  it("keeps the highest reviewed assessment selected while exposing newer pending assessments", () => {
    const input = fixture();
    laterAssessment(input, {
      reviewStatus: "unreviewed",
      trialArtifactDigest: digest("unreviewed substitution"),
    });
    const selected = firstCondition(input).assessments[0]!;
    expect(selected).toMatchObject({
      selectedAssessmentVersion: 1,
      unreviewedAssessmentCount: 1,
      pendingNewerAssessmentCount: 1,
      olderReviewedAssessmentCount: 0,
      passed: true,
    });
    expect(buildFoundationEvaluationReport(input).eligibleForReview).toBe(true);
  });

  it("cannot pass unreviewed-only or missing assessments", () => {
    const input = fixture();
    input.assessments[0]!.reviewStatus = "unreviewed";
    input.assessments.splice(1, 1);
    const condition = firstCondition(input);
    expect(condition.counts).toMatchObject({
      unassessedCells: 2,
      assessedCells: 0,
      passedCells: 0,
    });
    expect(condition.assessments[0]).toMatchObject({
      selectedAssessmentVersion: null,
      unreviewedAssessmentCount: 1,
    });
    expect(condition.eligibleForReview).toBe(false);
  });

  it("selects the highest reviewed version independently of record order", () => {
    const input = fixture();
    laterAssessment(input, {
      checks: gates.map((gate) => ({
        id: gate,
        hardGate: true,
        result: "fail",
      })),
    });
    input.assessments.reverse();
    expect(firstCondition(input).assessments[0]).toMatchObject({
      selectedAssessmentVersion: 2,
      olderReviewedAssessmentCount: 1,
      passed: false,
    });
  });

  it("deduplicates exact immutable copies of trials, assessments and configurations", () => {
    const input = fixture();
    const expected = buildFoundationEvaluationReport(input);
    input.trials.push(structuredClone(input.trials[0]!));
    input.assessments.push(structuredClone(input.assessments[0]!));
    input.configurations.push(structuredClone(input.configurations[0]!));
    expect(buildFoundationEvaluationReport(input)).toEqual(expected);
  });

  it("rejects different trial IDs reusing one attempt identity", () => {
    const input = fixture();
    input.trials.push({ ...input.trials[0]!, id: id(800) });
    expectSafeError(input, "VERSION_CONFLICT");
  });

  it("makes multiple distinct attempts in one cell ambiguous instead of choosing a successful retry", () => {
    const input = fixture();
    const extra = { ...input.trials[0]!, id: id(800), attemptId: id(801) };
    input.trials.push(extra);
    input.assessments.push({
      ...input.assessments[0]!,
      id: id(802),
      trialId: extra.id,
    });
    const condition = firstCondition(input);
    expect(condition.counts).toMatchObject({
      expectedCells: 2,
      observedCells: 2,
      attemptCount: 3,
      ambiguousCells: 1,
      unassessedCells: 1,
      passedCells: 1,
    });
    expect(
      condition.assessments
        .filter(
          (entry) =>
            entry.caseId === extra.caseId &&
            entry.repetition === extra.repetition,
        )
        .every(
          (entry) => !entry.passed && entry.blockers.includes("ambiguous_cell"),
        ),
    ).toBe(true);
    expect(condition.outcomes.completed).toBe(3);
    expect(condition.eligibleForReview).toBe(false);
  });

  it.each([
    "failed",
    "timed_out",
    "canceled",
    "unsupported",
    "infrastructure_failed",
  ] as const)("counts %s independently and prevents eligibility", (outcome) => {
    const input = fixture();
    input.trials[0]!.outcome = outcome;
    const condition = firstCondition(input);
    expect(condition.outcomes[outcome]).toBe(1);
    expect(condition.outcomes.completed).toBe(1);
    expect(condition.counts.failedCells).toBe(1);
    expect(condition.blockers).toContain("non_completed_outcome");
    expect(condition.eligibleForReview).toBe(false);
  });

  it.each(["trials", "assessments", "configurations"] as const)(
    "excludes malformed foreign %s before validation, identity checks or counts",
    (kind) => {
      const input = fixture();
      const expected = buildFoundationEvaluationReport(input);
      const foreign = {
        id: input[kind][0]!.id,
        projectId: id(999),
        private: "private payload",
        version: "broken",
      };
      // Simulate an adapter returning untrusted persisted data despite static types.
      (input[kind] as unknown[]).push(foreign);
      expect(buildFoundationEvaluationReport(input)).toEqual(expected);
    },
  );

  it.each(["trials", "assessments", "configurations"] as const)(
    "safely rejects malformed same-project %s",
    (kind) => {
      const input = fixture();
      (input[kind] as unknown[]).push({
        projectId,
        id: id(999),
        private: "private payload",
      });
      expectSafeError(input);
    },
  );

  it.each(["trials", "assessments", "configurations"] as const)(
    "rejects changed payload reuse in %s",
    (kind) => {
      const input = fixture();
      const original = input[kind][0]!;
      (input[kind] as unknown[]).push({
        ...original,
        recordedAt: "2026-10-16T13:00:00Z",
      });
      expectSafeError(input, "VERSION_CONFLICT");
    },
  );

  it("rejects conflicting same-version assessment identities", () => {
    const input = fixture();
    input.assessments.push({ ...input.assessments[0]!, id: id(810) });
    expectSafeError(input, "VERSION_CONFLICT");
  });

  it("requires the definition itself to belong to project scope", () => {
    const input = fixture();
    input.definition.projectId = id(999);
    expectSafeError(input, "FORBIDDEN");
  });

  it("rejects a trial whose only changed field substitutes the exact case fixture input digest", () => {
    const input = fixture();
    expect(buildFoundationEvaluationReport(input).eligibleForReview).toBe(true);
    input.trials[0]!.inputDigest = digest("different fixture input");
    expectSafeError(input);
  });

  it.each(["definition", "case", "condition", "repetition"])(
    "rejects invalid trial %s references",
    (field) => {
      const input = fixture();
      if (field === "definition") input.trials[0]!.definitionId = id(999);
      if (field === "case") input.trials[0]!.caseId = "nonexistent";
      if (field === "condition") input.trials[0]!.condition = "nonexistent";
      if (field === "repetition") input.trials[0]!.repetition = 3;
      expectSafeError(input);
    },
  );

  it("rejects assessment references to absent in-scope trials", () => {
    const input = fixture();
    input.assessments[0]!.trialId = id(999);
    expectSafeError(input);
  });

  it("does not infer permission to judge from subject configuration membership", () => {
    const input = fixture();
    input.assessments[0]!.judgeConfigurationId = id(2);
    expectSafeError(input);
  });

  it("requires permitted judges to exist in project scope", () => {
    const input = fixture();
    input.configurations[2]!.projectId = id(999);
    expectSafeError(input);
  });

  it("requires subject snapshots to exist in project scope", () => {
    const input = fixture();
    input.configurations[0]!.projectId = id(999);
    expectSafeError(input);
  });

  it("checks the digest of exact UTF8 configuration bytes", () => {
    const input = fixture();
    input.configurations[1]!.content =
      input.configurations[1]!.content.normalize("NFD");
    expectSafeError(input);
  });

  it.each([
    "missing",
    "duplicate_condition",
    "duplicate_config",
    "foreign_config",
    "empty_config",
  ])("rejects %s condition mappings", (invalid) => {
    const input = fixture();
    if (invalid === "missing") input.conditionConfigurations.pop();
    if (invalid === "duplicate_condition")
      input.conditionConfigurations.push(
        structuredClone(input.conditionConfigurations[0]!),
      );
    if (invalid === "duplicate_config")
      input.conditionConfigurations[0]!.configurationIds.push(id(2));
    if (invalid === "foreign_config")
      input.conditionConfigurations[0]!.configurationIds = [id(4)];
    if (invalid === "empty_config")
      input.conditionConfigurations[0]!.configurationIds = [];
    expectSafeError(input);
  });

  it("rejects unsafe denominator overflow", () => {
    const input = fixture();
    input.definition.repetitions = Number.MAX_SAFE_INTEGER;
    expectSafeError(input);
  });

  it("calculates huge safe sparse denominators without iterating repetitions", () => {
    const input = fixture();
    input.definition.repetitions = 1_000_000_000;
    const report = buildFoundationEvaluationReport(input);
    expect(report.expectedCellsPerComparison).toBe(2_000_000_000);
    expect(report.comparisons[0]!.counts.missingCells).toBe(1_999_999_996);
    expect(report.comparisons[0]!.conditions[0]!.successFraction).toEqual({
      numerator: 2,
      denominator: 1_000_000_000,
    });
    expect(report.eligibleForReview).toBe(false);
  });

  it("preserves immutable inputs and returns no references that can modify input arrays", () => {
    const input = fixture();
    const before = structuredClone(input);
    deepFreeze(input);
    const report = buildFoundationEvaluationReport(input);
    expect(input).toEqual(before);
    (
      report.comparisons[0]!.conditionConfigurations[0]!
        .configurationIds as string[]
    ).push(id(999));
    report.comparisons[0]!.conditions[0]!.configurationIds.push(id(998));
    expect(input).toEqual(before);
  });
});
