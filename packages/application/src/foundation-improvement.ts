import { createHash } from "node:crypto";
import {
  FOUNDATION_IMPROVEMENT_MAX_INPUT_BYTES,
  foundationActorSchema,
  foundationAssessmentSchema,
  foundationConfigurationSchema,
  foundationEvaluationDefinitionSchema,
  foundationEvaluationTrialSchema,
  foundationIdempotencyKeySchema,
  foundationImprovementAdvisorySchema,
  foundationImprovementDecisionInputSchema,
  foundationImprovementDecisionSchema,
  foundationImprovementDetailSchema,
  foundationImprovementInputSchema,
  foundationImprovementPageSchema,
  foundationImprovementProposalSchema,
  foundationReadRecordSchema,
  foundationWorkflowListQuerySchema,
  type FoundationAssessment,
  type FoundationConfiguration,
  type FoundationEvaluationDefinition,
  type FoundationEvaluationTrial,
  type FoundationImprovementAdvisory,
  type FoundationImprovementDecision,
  type FoundationImprovementDetail,
  type FoundationImprovementInput,
  type FoundationImprovementPage,
  type FoundationImprovementProposal,
  type FoundationWorkflowListQuery,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationInstantMilliseconds,
} from "@commandry/domain";
import type {
  FoundationIdentity,
  FoundationMutationResult,
  FoundationRecordPort,
  FoundationServiceOptions,
} from "./agent-foundation";
import type { FoundationEvaluationPopulation } from "./foundation-evaluation";
import { buildFoundationEvaluationReport } from "./foundation-evaluation-report";
import {
  createFoundationWorkflowAccess,
  foundationWorkflowInput,
  foundationWorkflowOutput,
  foundationWorkflowSnapshot,
  FoundationWorkflowUnavailableError,
  type FoundationWorkflowContext,
  type FoundationWorkflowPort,
} from "./foundation-workflow-access";
import {
  foundationWorkflowPageCursor,
  foundationWorkflowPageSelection,
} from "./foundation-workflow-pagination";

/** Transaction-bound to an authorized project, environment and principal.
 * Adapters serialize report reads and decision CAS under foundation-evaluation:<project>,
 * validate continuation anchors, retain receipts and atomically audit/commit. */
export interface FoundationImprovementRecords extends FoundationRecordPort {
  getDefinition(id: string): Promise<FoundationEvaluationDefinition | null>;
  getTrial(id: string): Promise<FoundationEvaluationTrial | null>;
  getAssessment(id: string): Promise<FoundationAssessment | null>;
  getReportPopulation(
    definitionId: string,
  ): Promise<FoundationEvaluationPopulation>;
  getProposal(id: string): Promise<FoundationImprovementProposal | null>;
  insertProposal(
    record: FoundationImprovementProposal,
  ): Promise<FoundationImprovementProposal>;
  listProposals(query: {
    limit: number;
    afterId: string | null;
    asOf: string;
  }): Promise<{
    items: FoundationImprovementProposal[];
    nextAfterId: string | null;
  }>;
  getCurrentDecision(
    proposalId: string,
  ): Promise<FoundationImprovementDecision | null>;
  insertDecision(
    record: FoundationImprovementDecision,
    expectedVersion: number,
  ): Promise<FoundationImprovementDecision>;
}
export type FoundationImprovementPort =
  FoundationWorkflowPort<FoundationImprovementRecords>;
type Context = FoundationWorkflowContext<FoundationImprovementRecords>;
type Parser<T> = { parse(value: unknown): T };
type Receipt<T> = { record: T; correlationId: string };
const MAX_VERSION = 2147483647;
const MAX_EXPIRY = 30 * 24 * 60 * 60 * 1000;

function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid improvement reference",
  );
}
function unavailable(): never {
  throw new FoundationWorkflowUnavailableError();
}
function conflict(): never {
  throw new FoundationError(
    "VERSION_CONFLICT",
    "Improvement version does not match",
  );
}
function exactKeys(value: object, keys: string[]): void {
  if (Object.keys(value).sort().join("|") !== [...keys].sort().join("|"))
    unavailable();
}
function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const sorted = [...right].sort();
  return (
    left.length === sorted.length &&
    [...left].sort().every((id, index) => id === sorted[index])
  );
}
function compareInstants(left: string, right: string): number {
  const difference =
    foundationInstantMilliseconds(left) - foundationInstantMilliseconds(right);
  if (!Number.isFinite(difference)) invalid();
  if (difference !== 0) return difference;
  const tail = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? "").slice(3);
  const a = tail(left),
    b = tail(right),
    length = Math.max(a.length, b.length);
  return a.padEnd(length, "0") < b.padEnd(length, "0")
    ? -1
    : a.padEnd(length, "0") > b.padEnd(length, "0")
      ? 1
      : 0;
}
function historical(at: string, now: Date): void {
  if (compareInstants(at, now.toISOString()) > 0) invalid();
}
function expiry(expiresAt: string, now: Date): void {
  if (
    compareInstants(expiresAt, now.toISOString()) <= 0 ||
    compareInstants(
      expiresAt,
      new Date(now.getTime() + MAX_EXPIRY).toISOString(),
    ) > 0
  )
    invalid();
}
function recordDigest<T extends { contentDigest: string }>(record: T): void {
  const { contentDigest, ...content } = record;
  if (foundationDigest(content) !== contentDigest) unavailable();
}
function scope<T extends { projectId: string }>(
  record: T,
  context: Context,
): T {
  if (record.projectId !== context.request.projectId) invalid();
  return record;
}
/** Guard both successful and rejected port calls before any subsequent effects. */
async function read<T>(context: Context, action: () => Promise<T>): Promise<T> {
  context.guard();
  try {
    const result = await action();
    context.guard();
    return foundationWorkflowSnapshot(result);
  } catch (error) {
    context.guard();
    throw error;
  }
}
function input<T>(schema: Parser<T>, raw: unknown): T {
  const detached = foundationWorkflowSnapshot(raw, invalid);
  if (
    Buffer.byteLength(canonicalFoundationJson(detached), "utf8") >
    FOUNDATION_IMPROVEMENT_MAX_INPUT_BYTES
  )
    invalid();
  return foundationWorkflowInput(schema, detached);
}
function configuration(
  raw: unknown,
  context: Context,
  now: Date,
): FoundationConfiguration {
  const record = scope(
    foundationWorkflowOutput(foundationConfigurationSchema, raw),
    context,
  );
  if (
    createHash("sha256").update(record.content, "utf8").digest("hex") !==
    record.contentDigest
  )
    invalid();
  historical(record.recordedAt, now);
  return record;
}
async function reference<T extends { id: string; projectId: string }>(
  context: Context,
  id: string,
  schema: Parser<T>,
  get: () => Promise<T | null>,
): Promise<T> {
  const raw = await read(context, get);
  if (raw === null) invalid();
  const record = scope(foundationWorkflowOutput(schema, raw), context);
  if (record.id !== id) invalid();
  return record;
}
function proposal(
  raw: unknown,
  context: Context,
  now: Date,
): FoundationImprovementProposal {
  const record = scope(
    foundationWorkflowOutput(foundationImprovementProposalSchema, raw),
    context,
  );
  if (record.environment !== context.request.environment) invalid();
  historical(record.recordedAt, now);
  recordDigest(record);
  return record;
}
async function getProposal(
  context: Context,
  id: string,
  now: Date,
): Promise<FoundationImprovementProposal> {
  const raw = await read(context, () => context.records.getProposal(id));
  if (raw === null)
    throw new FoundationError("NOT_FOUND", "Improvement proposal not found");
  const record = proposal(raw, context, now);
  if (record.id !== id) invalid();
  return record;
}
function decision(
  raw: unknown,
  context: Context,
  now: Date,
  parent?: FoundationImprovementProposal,
): FoundationImprovementDecision {
  const record = scope(
    foundationWorkflowOutput(foundationImprovementDecisionSchema, raw),
    context,
  );
  recordDigest(record);
  historical(record.recordedAt, now);
  if (
    record.version > MAX_VERSION ||
    compareInstants(
      record.expiresAt,
      new Date(
        foundationInstantMilliseconds(record.recordedAt) + MAX_EXPIRY,
      ).toISOString(),
    ) > 0
  )
    invalid();
  if (
    parent &&
    (record.proposalId !== parent.id ||
      record.expectedProposalDigest !== parent.contentDigest)
  )
    invalid();
  return record;
}

async function validateReferences(
  context: Context,
  value: FoundationImprovementInput,
  now: Date,
): Promise<FoundationEvaluationDefinition> {
  const configurations = new Map<string, FoundationConfiguration>();
  const getConfiguration = async (id: string) => {
    const prior = configurations.get(id);
    if (prior) return prior;
    const raw = await read(context, () => context.records.getConfiguration(id));
    if (raw === null) invalid();
    const record = configuration(raw, context, now);
    if (record.id !== id) invalid();
    configurations.set(id, record);
    return record;
  };
  const baseline = await getConfiguration(value.baselineConfigurationId);
  const candidate = await getConfiguration(value.candidateConfigurationId);
  if (
    !["prompt", "skill", "hook", "loop"].includes(candidate.kind) ||
    candidate.kind !== baseline.kind ||
    !candidate.parentIds.includes(baseline.id)
  )
    invalid();
  const definition = await reference(
    context,
    value.definitionId,
    foundationEvaluationDefinitionSchema,
    () => context.records.getDefinition(value.definitionId),
  );
  if (
    !sameIds(
      definition.conditions,
      value.conditionConfigurations.map((entry) => entry.condition),
    ) ||
    !sameIds(definition.configurationIds, [
      ...new Set(
        value.conditionConfigurations.flatMap(
          (entry) => entry.configurationIds,
        ),
      ),
    ])
  )
    invalid();
  for (const id of [
    ...definition.configurationIds,
    ...value.judgeConfigurationIds,
  ])
    await getConfiguration(id);
  for (const motivation of value.motivations) {
    const assessment = await reference(
      context,
      motivation.assessmentId,
      foundationAssessmentSchema,
      () => context.records.getAssessment(motivation.assessmentId),
    );
    if (
      assessment.version !== motivation.assessmentVersion ||
      assessment.reviewStatus !== "reviewed"
    )
      invalid();
    historical(assessment.recordedAt, now);
    const trial = await reference(
      context,
      assessment.trialId,
      foundationEvaluationTrialSchema,
      () => context.records.getTrial(assessment.trialId),
    );
    const historicalDefinition = await reference(
      context,
      trial.definitionId,
      foundationEvaluationDefinitionSchema,
      () => context.records.getDefinition(trial.definitionId),
    );
    const evaluationCase = historicalDefinition.cases.find(
      (entry) => entry.id === trial.caseId,
    );
    if (
      !evaluationCase ||
      trial.outcome !== "completed" ||
      !historicalDefinition.conditions.includes(trial.condition) ||
      trial.repetition > historicalDefinition.repetitions ||
      trial.inputDigest !== evaluationCase.fixtureDigest ||
      assessment.rubricDigest !== evaluationCase.rubricDigest ||
      !trial.artifactDigests.includes(assessment.trialArtifactDigest) ||
      !trial.configurationIds.includes(baseline.id) ||
      trial.configurationIds.includes(candidate.id) ||
      trial.configurationIds.some(
        (id) => !historicalDefinition.configurationIds.includes(id),
      ) ||
      !evaluationCase.hardGates.some((id) =>
        assessment.checks.some(
          (check) => check.id === id && check.result === "fail",
        ),
      )
    )
      invalid();
    historical(trial.recordedAt, now);
    for (const id of [
      ...historicalDefinition.configurationIds,
      ...trial.configurationIds,
      assessment.judgeConfigurationId,
    ])
      await getConfiguration(id);
  }
  return definition;
}

async function advisory(
  context: Context,
  parent: FoundationImprovementProposal,
  now: Date,
  definition: FoundationEvaluationDefinition,
): Promise<FoundationImprovementAdvisory> {
  const population = await read(context, () =>
    context.records.getReportPopulation(definition.id),
  );
  if (
    !population ||
    typeof population !== "object" ||
    !Array.isArray(population.trials) ||
    !Array.isArray(population.assessments) ||
    !Array.isArray(population.configurations)
  )
    unavailable();
  exactKeys(population, ["trials", "assessments", "configurations"]);
  const rows = <T extends { id: string; projectId: string }>(
    values: T[],
    schema: Parser<T>,
  ): T[] => {
    const result = values.map((value) =>
      scope(foundationWorkflowOutput(schema, value), context),
    );
    if (new Set(result.map((value) => value.id)).size !== result.length)
      invalid();
    return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  };
  const trials = rows(population.trials, foundationEvaluationTrialSchema);
  const assessments = rows(population.assessments, foundationAssessmentSchema);
  const configurations = rows(
    population.configurations,
    foundationConfigurationSchema,
  ).map((raw) => configuration(raw, context, now));
  for (const trial of trials) historical(trial.recordedAt, now);
  for (const assessment of assessments) historical(assessment.recordedAt, now);
  const requiredIds = new Set([
    ...definition.configurationIds,
    ...parent.judgeConfigurationIds,
    ...trials.flatMap((trial) => trial.configurationIds),
    ...assessments.map((entry) => entry.judgeConfigurationId),
  ]);
  const configurationById = new Map(
    configurations.map((entry) => [entry.id, entry]),
  );
  for (const id of requiredIds) {
    const raw = await read(context, () => context.records.getConfiguration(id));
    if (raw === null) invalid();
    const current = configuration(raw, context, now);
    if (current.id !== id) invalid();
    const prior = configurationById.get(id);
    if (prior && foundationDigest(prior) !== foundationDigest(current))
      invalid();
    if (!prior) {
      configurations.push(current);
      configurationById.set(id, current);
    }
  }
  configurations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const conditionConfigurations = parent.conditionConfigurations
    .map(({ condition, configurationIds }) => ({
      condition,
      configurationIds: [...configurationIds].sort(),
    }))
    .sort((a, b) =>
      a.condition < b.condition ? -1 : a.condition > b.condition ? 1 : 0,
    );
  const judgeConfigurationIds = [...parent.judgeConfigurationIds].sort();
  const reportInput = {
    projectId: parent.projectId,
    definition,
    trials,
    assessments,
    configurations,
    conditionConfigurations,
    judgeConfigurationIds,
  };
  const report = buildFoundationEvaluationReport(reportInput);
  const comparisons = report.comparisons.map((comparison) => ({
    model: comparison.model,
    runtime: comparison.runtime,
    counts: comparison.counts,
    eligibleForReview: comparison.eligibleForReview,
    blockers: comparison.blockers,
    pendingNewerAssessmentCount: comparison.conditions.reduce(
      (sum, condition) =>
        sum +
        condition.assessments.reduce(
          (count, entry) => count + entry.pendingNewerAssessmentCount,
          0,
        ),
      0,
    ),
  }));
  return foundationWorkflowOutput(foundationImprovementAdvisorySchema, {
    schemaVersion: 1,
    projectId: parent.projectId,
    proposalId: parent.id,
    proposalDigest: parent.contentDigest,
    evaluatedAt: now.toISOString(),
    populationDigest: foundationDigest({
      definition,
      trials,
      assessments,
      configurations,
      conditionConfigurations,
      judgeConfigurationIds,
    }),
    reportDigest: foundationDigest(report),
    eligibleForReview: report.eligibleForReview,
    pendingNewerAssessmentCount: comparisons.reduce(
      (sum, comparison) => sum + comparison.pendingNewerAssessmentCount,
      0,
    ),
    blockers: report.blockers,
    comparisons,
  });
}

async function receipt<T>(
  context: Context,
  key: string,
  requestDigest: string,
  perform: () => Promise<T>,
  validate: (raw: unknown) => T,
): Promise<FoundationMutationResult<T>> {
  let performed: Receipt<T> | undefined;
  let calls = 0;
  const result = await read(context, () =>
    context.records.idempotent(key, requestDigest, async () => {
      context.guard();
      if (++calls !== 1) unavailable();
      const record = await perform();
      context.guard();
      performed = foundationWorkflowSnapshot({
        record,
        correlationId: context.request.correlationId,
      });
      return foundationWorkflowSnapshot(performed);
    }),
  );
  if (!result || typeof result !== "object") unavailable();
  exactKeys(result, ["value", "replayed"]);
  if (
    typeof result.replayed !== "boolean" ||
    !result.value ||
    typeof result.value !== "object"
  )
    unavailable();
  exactKeys(result.value, ["record", "correlationId"]);
  const record = validate(result.value.record);
  const correlationId = foundationWorkflowOutput(
    foundationActorSchema.shape.correlationId,
    result.value.correlationId,
  );
  if (
    (result.replayed && calls !== 0) ||
    (!result.replayed &&
      (calls !== 1 ||
        !performed ||
        foundationDigest(performed) !==
          foundationDigest({ record, correlationId })))
  )
    unavailable();
  return { record, replayed: result.replayed, correlationId };
}

export function createFoundationImprovementService(
  port: FoundationImprovementPort,
  options: FoundationServiceOptions,
) {
  const access = createFoundationWorkflowAccess(port, options);
  const detail = async (
    context: Context,
    id: string,
  ): Promise<FoundationImprovementDetail> => {
    const now = access.now();
    const parent = await getProposal(context, id, now);
    const definition = await validateReferences(context, parent, now);
    const currentAdvisory = await advisory(context, parent, now, definition);
    const rawDecision = await read(context, () =>
      context.records.getCurrentDecision(id),
    );
    return foundationWorkflowOutput(foundationImprovementDetailSchema, {
      schemaVersion: 1,
      proposal: parent,
      advisory: currentAdvisory,
      currentDecision:
        rawDecision === null
          ? null
          : decision(rawDecision, context, now, parent),
    });
  };
  const list = async (
    context: Context,
    query: FoundationWorkflowListQuery,
  ): Promise<FoundationImprovementPage> => {
    const now = access.now();
    const binding = {
      projectId: context.request.projectId,
      environment: context.request.environment,
      principalId: context.actor.principalId,
      operation: context.request.operation,
    };
    const selection = foundationWorkflowPageSelection(
      binding,
      query.cursor,
      now,
    );
    const result = await read(context, () =>
      context.records.listProposals({ limit: query.limit, ...selection }),
    );
    if (!result || typeof result !== "object") unavailable();
    exactKeys(result, ["items", "nextAfterId"]);
    if (!Array.isArray(result.items) || result.items.length > query.limit)
      unavailable();
    const items = result.items.map((raw) => proposal(raw, context, now));
    let previous = selection.afterId;
    for (const record of items) {
      if (
        (previous !== null && record.id <= previous) ||
        compareInstants(record.recordedAt, selection.asOf) > 0
      )
        invalid();
      previous = record.id;
    }
    if (
      result.nextAfterId !== null &&
      (items.length !== query.limit ||
        result.nextAfterId !== previous ||
        foundationWorkflowOutput(
          foundationActorSchema.shape.projectId,
          result.nextAfterId,
        ) !== result.nextAfterId)
    )
      invalid();
    return foundationWorkflowOutput(foundationImprovementPageSchema, {
      schemaVersion: 1,
      projectId: context.request.projectId,
      items,
      nextCursor:
        result.nextAfterId === null
          ? null
          : foundationWorkflowPageCursor(
              binding,
              selection,
              result.nextAfterId,
            ),
    });
  };
  return {
    async propose(
      token: string,
      rawKey: unknown,
      rawInput: unknown,
    ): Promise<FoundationMutationResult<FoundationImprovementProposal>> {
      const value = input(foundationImprovementInputSchema, rawInput);
      const key = foundationWorkflowInput(
        foundationIdempotencyKeySchema,
        rawKey,
      );
      return access.machine(
        token,
        "improvement.propose",
        value.projectId,
        null,
        async (context) => {
          const requestDigest = foundationDigest({
            operation: context.request.operation,
            projectId: value.projectId,
            environment: context.request.environment,
            input: value,
          });
          return receipt(
            context,
            key,
            requestDigest,
            async () => {
              const now = access.now();
              await validateReferences(context, value, now);
              context.guard();
              const content = {
                ...value,
                schemaVersion: 1 as const,
                id: access.createId(),
                version: 1 as const,
                environment: context.request.environment,
                recordedBy: context.actor.principalId,
                recordedAt: now.toISOString(),
              };
              const record = foundationWorkflowOutput(
                foundationImprovementProposalSchema,
                { ...content, contentDigest: foundationDigest(content) },
              );
              const stored = proposal(
                await read(context, () =>
                  context.records.insertProposal(
                    foundationWorkflowSnapshot(record),
                  ),
                ),
                context,
                now,
              );
              if (foundationDigest(stored) !== foundationDigest(record))
                unavailable();
              return stored;
            },
            (raw) => {
              const record = proposal(raw, context, access.now());
              const {
                schemaVersion,
                id,
                version,
                environment,
                recordedBy,
                recordedAt,
                contentDigest,
                ...historicalInput
              } = record;
              if (
                schemaVersion !== 1 ||
                version !== 1 ||
                !id ||
                !recordedAt ||
                !contentDigest ||
                environment !== context.request.environment ||
                recordedBy !== context.actor.principalId ||
                foundationDigest(historicalInput) !== foundationDigest(value)
              )
                unavailable();
              return record;
            },
          );
        },
      );
    },
    async get(
      token: string,
      raw: { projectId: string; id: string },
    ): Promise<FoundationImprovementDetail> {
      const query = foundationWorkflowInput(foundationReadRecordSchema, raw);
      return access.machine(
        token,
        "improvement.read",
        query.projectId,
        query.id,
        (context) => detail(context, query.id),
      );
    },
    async list(
      token: string,
      raw: FoundationWorkflowListQuery,
    ): Promise<FoundationImprovementPage> {
      const query = foundationWorkflowInput(
        foundationWorkflowListQuerySchema,
        raw,
      );
      return access.machine(
        token,
        "improvement.read",
        query.projectId,
        null,
        (context) => list(context, query),
      );
    },
    async getOwner(
      identity: FoundationIdentity,
      raw: { projectId: string; id: string },
    ): Promise<FoundationImprovementDetail> {
      const query = foundationWorkflowInput(foundationReadRecordSchema, raw);
      return access.owner(
        identity,
        "improvement.read",
        query.projectId,
        query.id,
        (context) => detail(context, query.id),
      );
    },
    async listOwner(
      identity: FoundationIdentity,
      raw: FoundationWorkflowListQuery,
    ): Promise<FoundationImprovementPage> {
      const query = foundationWorkflowInput(
        foundationWorkflowListQuerySchema,
        raw,
      );
      return access.owner(
        identity,
        "improvement.read",
        query.projectId,
        null,
        (context) => list(context, query),
      );
    },
    async review(
      identity: FoundationIdentity,
      rawKey: unknown,
      rawInput: unknown,
    ): Promise<FoundationMutationResult<FoundationImprovementDecision>> {
      const value = input(foundationImprovementDecisionInputSchema, rawInput);
      const key = foundationWorkflowInput(
        foundationIdempotencyKeySchema,
        rawKey,
      );
      const reviewResult = await access.owner(
        identity,
        "improvement.review",
        value.projectId,
        value.proposalId,
        async (context) => {
          expiry(value.expiresAt, access.now());
          const requestDigest = foundationDigest({
            operation: context.request.operation,
            projectId: value.projectId,
            environment: context.request.environment,
            input: value,
          });
          const result = await receipt(
            context,
            key,
            requestDigest,
            async () => {
              const now = access.now();
              const parent = await getProposal(context, value.proposalId, now);
              const definition = await validateReferences(context, parent, now);
              const rawDecision = await read(context, () =>
                context.records.getCurrentDecision(parent.id),
              );
              const current =
                rawDecision === null
                  ? null
                  : decision(rawDecision, context, now, parent);
              if (
                value.expectedDecisionVersion !== (current?.version ?? 0) ||
                value.expectedDecisionVersion >= MAX_VERSION
              )
                conflict();
              const currentAdvisory = await advisory(
                context,
                parent,
                now,
                definition,
              );
              if (
                value.expectedProposalDigest !== parent.contentDigest ||
                value.expectedPopulationDigest !==
                  currentAdvisory.populationDigest ||
                value.expectedReportDigest !== currentAdvisory.reportDigest
              )
                conflict();
              if (
                value.decision === "accepted" &&
                !currentAdvisory.eligibleForReview
              )
                throw new FoundationError(
                  "APPROVAL_REQUIRED",
                  "Current regression report is ineligible",
                );
              expiry(value.expiresAt, access.now());
              const content = {
                ...value,
                schemaVersion: 1 as const,
                id: access.createId(),
                version: value.expectedDecisionVersion + 1,
                recordedBy: context.actor.principalId,
                recordedAt: access.now().toISOString(),
              };
              const record = foundationWorkflowOutput(
                foundationImprovementDecisionSchema,
                { ...content, contentDigest: foundationDigest(content) },
              );
              const stored = decision(
                await read(context, () =>
                  context.records.insertDecision(
                    foundationWorkflowSnapshot(record),
                    value.expectedDecisionVersion,
                  ),
                ),
                context,
                access.now(),
                parent,
              );
              if (foundationDigest(stored) !== foundationDigest(record))
                unavailable();
              return stored;
            },
            (raw) => {
              const record = decision(raw, context, access.now());
              const {
                schemaVersion,
                id,
                version,
                recordedBy,
                recordedAt,
                contentDigest,
                ...historicalInput
              } = record;
              if (
                schemaVersion !== 1 ||
                !id ||
                !version ||
                !recordedAt ||
                !contentDigest ||
                recordedBy !== context.actor.principalId ||
                foundationDigest(historicalInput) !== foundationDigest(value)
              )
                unavailable();
              return record;
            },
          );
          context.guard();
          expiry(value.expiresAt, access.now());
          return result;
        },
      );
      expiry(reviewResult.record.expiresAt, access.now());
      return reviewResult;
    },
  };
}
