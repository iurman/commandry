import { createHash, randomUUID } from "node:crypto";
import {
  foundationActorSchema,
  foundationAssessmentSchema,
  foundationClientSchema,
  foundationConfigurationSchema,
  foundationEvaluationDefinitionSchema,
  foundationEvaluationTrialSchema,
  foundationIdempotencyKeySchema,
  foundationReadRecordSchema,
  type FoundationActor,
  type FoundationAssessment,
  type FoundationClient,
  type FoundationConfiguration,
  type FoundationEvaluationDefinition,
  type FoundationEvaluationTrial,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationInstantMilliseconds,
  foundationDigest,
  foundationTokenDigest,
  requireFoundationGrant,
} from "@commandry/domain";
import type {
  FoundationIdentity,
  FoundationMachineRequest,
  FoundationMutationResult,
  FoundationOperationContext,
  FoundationOwnerRequest,
  FoundationServiceOptions,
} from "./agent-foundation.js";
import {
  buildFoundationEvaluationReport,
  type FoundationConditionConfigurations,
} from "./foundation-evaluation-report";

export type FoundationEvaluationPopulation = {
  trials: FoundationEvaluationTrial[];
  assessments: FoundationAssessment[];
  configurations: FoundationConfiguration[];
};

/** Bound to one exact project and principal within the wrapper transaction. */
export interface FoundationEvaluationRecords {
  /** Verify the canonical response digest on replay, including actor and original
   * correlation. Scope keys by principal and operation. Never replace receipts. */
  idempotent<T>(
    key: string,
    requestDigest: string,
    perform: () => Promise<T>,
  ): Promise<{ value: T; replayed: boolean }>;
  getDefinition(id: string): Promise<FoundationEvaluationDefinition | null>;
  getTrial(id: string): Promise<FoundationEvaluationTrial | null>;
  getAssessment(id: string): Promise<FoundationAssessment | null>;
  getConfiguration(id: string): Promise<FoundationConfiguration | null>;
  /** Complete population, including every attempt and assessment version.
   * Configuration records include all referenced subject and judge snapshots. */
  getReportPopulation(
    definitionId: string,
  ): Promise<FoundationEvaluationPopulation>;
  insertDefinition(
    record: FoundationEvaluationDefinition,
  ): Promise<FoundationEvaluationDefinition>;
  insertTrial(
    record: FoundationEvaluationTrial,
  ): Promise<FoundationEvaluationTrial>;
  insertAssessment(record: FoundationAssessment): Promise<FoundationAssessment>;
}

/** Adapters hold a live grant lock through callback, audit and commit. They must
 * enforce immutable IDs, same-project references, unique attemptId and unique
 * (trialId, version), and roll back mutation savepoints before denial audits.
 * Owner wrappers authenticate the trusted session and recheck expiry/revocation
 * through commit. Callback validation alone is not persistence or session proof. */
export interface FoundationEvaluationPort {
  withClient<T>(
    request: FoundationMachineRequest,
    callback: (
      client: FoundationClient,
      records: FoundationEvaluationRecords,
    ) => Promise<T>,
  ): Promise<T>;
  withOwner<T>(
    request: FoundationOwnerRequest,
    callback: (records: FoundationEvaluationRecords) => Promise<T>,
  ): Promise<T>;
}

type EvaluationRecord =
  | FoundationEvaluationDefinition
  | FoundationEvaluationTrial
  | FoundationAssessment;
type Parser<T> = { parse(value: unknown): T };
type Guard = () => void;
type EvaluationContext = {
  records: FoundationEvaluationRecords;
  actor: FoundationActor;
  request: FoundationOperationContext;
  guard: Guard;
};

function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid evaluation reference or result",
  );
}
function conflict(): never {
  throw new FoundationError(
    "VERSION_CONFLICT",
    "Conflicting immutable evaluation record",
  );
}
function unavailable(): never {
  throw new FoundationError("NOT_FOUND", "Evaluation record is unavailable");
}
function scoped<T extends { id: string; projectId: string }>(
  schema: Parser<T>,
  value: unknown,
  projectId: string,
  id?: string,
): T {
  if (value === null) unavailable();
  const record = schema.parse(value);
  if (record.projectId !== projectId || (id !== undefined && record.id !== id))
    unavailable();
  return record;
}
function exact<T>(schema: Parser<T>, value: unknown, expected: T): T {
  const record = schema.parse(value);
  if (foundationDigest(record) !== foundationDigest(expected)) invalid();
  return record;
}
function definition(value: unknown, projectId: string, id?: string) {
  const record = scoped(
    foundationEvaluationDefinitionSchema,
    value,
    projectId,
    id,
  );
  if (
    record.version !== 1 ||
    record.cases.length === 0 ||
    record.cases.some((entry) => entry.hardGates.length === 0)
  )
    invalid();
  return record;
}
function configuration(value: unknown, projectId: string, id?: string) {
  const record = scoped(foundationConfigurationSchema, value, projectId, id);
  if (
    createHash("sha256").update(record.content, "utf8").digest("hex") !==
    record.contentDigest
  )
    invalid();
  return record;
}
async function configurations(
  records: FoundationEvaluationRecords,
  projectId: string,
  ids: readonly string[],
  guard: Guard,
) {
  for (const id of ids) {
    configuration(await records.getConfiguration(id), projectId, id);
    guard();
  }
}
function bindTrial(
  trial: FoundationEvaluationTrial,
  def: FoundationEvaluationDefinition,
) {
  const entry = def.cases.find((value) => value.id === trial.caseId);
  if (
    !entry ||
    trial.definitionId !== def.id ||
    trial.projectId !== def.projectId ||
    trial.inputDigest !== entry.fixtureDigest ||
    !def.conditions.includes(trial.condition) ||
    trial.repetition > def.repetitions ||
    trial.configurationIds.some((id) => !def.configurationIds.includes(id))
  )
    invalid();
  return entry;
}
function bindAssessment(
  assessment: FoundationAssessment,
  trial: FoundationEvaluationTrial,
  def: FoundationEvaluationDefinition,
) {
  const entry = bindTrial(trial, def);
  if (
    assessment.trialId !== trial.id ||
    assessment.projectId !== trial.projectId ||
    !trial.artifactDigests.includes(assessment.trialArtifactDigest) ||
    assessment.rubricDigest !== entry.rubricDigest
  )
    invalid();
}
function semantics(assessment: FoundationAssessment) {
  // Review acknowledges an exact existing assessment, including check order.
  const { id, version, reviewStatus, recordedAt, ...semantic } = assessment;
  void id;
  void version;
  void reviewStatus;
  void recordedAt;
  return semantic;
}
function requireReview(
  assessment: FoundationAssessment,
  previous: FoundationAssessment | undefined,
) {
  if (
    !previous ||
    previous.reviewStatus !== "unreviewed" ||
    assessment.version !== previous.version + 1 ||
    assessment.id === previous.id ||
    foundationDigest(semantics(assessment)) !==
      foundationDigest(semantics(previous))
  )
    invalid();
}

/** Parse the entire adapter population before it can enter a report or version
 * decision. Foreign or incomplete reference populations fail closed. */
function population(
  value: FoundationEvaluationPopulation,
  def: FoundationEvaluationDefinition,
): FoundationEvaluationPopulation {
  if (
    !value ||
    !Array.isArray(value.trials) ||
    !Array.isArray(value.assessments) ||
    !Array.isArray(value.configurations) ||
    Object.keys(value).some(
      (key) => !["trials", "assessments", "configurations"].includes(key),
    )
  )
    invalid();
  const configs = value.configurations.map((record) =>
    configuration(record, def.projectId),
  );
  const configIds = new Set(configs.map((record) => record.id));
  if (
    configIds.size !== configs.length ||
    def.configurationIds.some((id) => !configIds.has(id))
  )
    invalid();
  const trials = value.trials.map((record) =>
    scoped(foundationEvaluationTrialSchema, record, def.projectId),
  );
  const trialIds = new Map(trials.map((record) => [record.id, record]));
  if (
    trialIds.size !== trials.length ||
    new Set(trials.map((record) => record.attemptId)).size !== trials.length
  )
    conflict();
  for (const trial of trials) {
    bindTrial(trial, def);
    if (trial.configurationIds.some((id) => !configIds.has(id))) invalid();
  }
  const assessments = value.assessments.map((record) =>
    scoped(foundationAssessmentSchema, record, def.projectId),
  );
  if (
    new Set(assessments.map((record) => record.id)).size !== assessments.length
  )
    conflict();
  const histories = new Map<string, FoundationAssessment[]>();
  for (const assessment of assessments) {
    const trial = trialIds.get(assessment.trialId);
    if (!trial || !configIds.has(assessment.judgeConfigurationId)) invalid();
    bindAssessment(assessment, trial, def);
    const history = histories.get(trial.id) ?? [];
    history.push(assessment);
    histories.set(trial.id, history);
  }
  for (const history of histories.values()) {
    history.sort((left, right) => left.version - right.version);
    for (const [index, assessment] of history.entries()) {
      if (assessment.version !== index + 1) conflict();
      if (assessment.reviewStatus === "reviewed")
        requireReview(assessment, history[index - 1]);
    }
  }
  return { trials, assessments, configurations: configs };
}
async function loadDefinition(context: EvaluationContext, id: string) {
  const record = definition(
    await context.records.getDefinition(id),
    context.request.projectId,
    id,
  );
  context.guard();
  await configurations(
    context.records,
    record.projectId,
    record.configurationIds,
    context.guard,
  );
  return record;
}
async function loadTrial(context: EvaluationContext, id: string) {
  const trial = scoped(
    foundationEvaluationTrialSchema,
    await context.records.getTrial(id),
    context.request.projectId,
    id,
  );
  context.guard();
  const def = await loadDefinition(context, trial.definitionId);
  bindTrial(trial, def);
  await configurations(
    context.records,
    trial.projectId,
    trial.configurationIds,
    context.guard,
  );
  return { trial, def };
}
async function loadPopulation(
  context: EvaluationContext,
  def: FoundationEvaluationDefinition,
) {
  const records = population(
    await context.records.getReportPopulation(def.id),
    def,
  );
  context.guard();
  return records;
}

function runtime(options: FoundationServiceOptions) {
  const environment = foundationActorSchema.shape.environment.parse(
    options.environment,
  );
  const clock = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  return {
    environment,
    id: () => foundationActorSchema.shape.correlationId.parse(createId()),
    now() {
      const at = clock();
      if (!(at instanceof Date) || !Number.isFinite(at.getTime()))
        throw new FoundationError(
          "FORBIDDEN",
          "A valid server time is required",
        );
      return new Date(at.getTime());
    },
  };
}

async function mutate<T extends EvaluationRecord>(
  context: EvaluationContext,
  kind: string,
  input: T,
  key: string,
  schema: Parser<T>,
  perform: () => Promise<T>,
): Promise<FoundationMutationResult<T>> {
  const { records, actor, request, guard } = context;
  const expectedDigest = foundationDigest(input);
  const bound = (value: unknown) => {
    const record = schema.parse(value);
    if (foundationDigest(record) !== expectedDigest) invalid();
    return record;
  };
  guard();
  const result = await records.idempotent(
    key,
    foundationDigest({
      kind,
      operation: request.operation,
      projectId: request.projectId,
      environment: request.environment,
      input,
    }),
    async () => {
      guard();
      const record = bound(await perform());
      guard();
      return { record, actor, correlationId: request.correlationId };
    },
  );
  guard();
  if (
    !result ||
    typeof result.replayed !== "boolean" ||
    !result.value ||
    Object.keys(result.value).some(
      (key) => !["record", "actor", "correlationId"].includes(key),
    )
  )
    invalid();
  const record = bound(result.value.record);
  const receiptActor = foundationActorSchema.parse(result.value.actor);
  const correlationId = foundationActorSchema.shape.correlationId.parse(
    result.value.correlationId,
  );
  if (
    receiptActor.principalId !== actor.principalId ||
    receiptActor.clientId !== actor.clientId ||
    receiptActor.projectId !== request.projectId ||
    receiptActor.environment !== request.environment ||
    receiptActor.runId !== null ||
    receiptActor.resourceIds.length !== 0 ||
    !receiptActor.capabilities.includes(request.operation) ||
    receiptActor.correlationId !== correlationId ||
    (!result.replayed &&
      (correlationId !== request.correlationId ||
        foundationDigest(receiptActor) !== foundationDigest(actor)))
  )
    invalid();
  guard();
  return { record, replayed: result.replayed, correlationId };
}

async function insertAssessment(
  context: EvaluationContext,
  input: FoundationAssessment,
  owner: boolean,
) {
  const { trial, def } = await loadTrial(context, input.trialId);
  bindAssessment(input, trial, def);
  await configurations(
    context.records,
    input.projectId,
    [input.judgeConfigurationId],
    context.guard,
  );
  const records = await loadPopulation(context, def);
  const storedTrial = records.trials.find((record) => record.id === trial.id);
  if (!storedTrial) invalid();
  exact(foundationEvaluationTrialSchema, storedTrial, trial);
  const history = records.assessments
    .filter((record) => record.trialId === trial.id)
    .sort((left, right) => left.version - right.version);
  if (input.version !== history.length + 1) conflict();
  if (owner) requireReview(input, history.at(-1));
  if (await context.records.getAssessment(input.id)) conflict();
  context.guard();
  return context.records.insertAssessment(input);
}

/** Machine inputs are external observations and claims. No workload, artifact
 * fetch, byte verification, model invocation or promotion occurs in this service. */
export function createFoundationEvaluationService(
  port: FoundationEvaluationPort,
  options: FoundationServiceOptions,
) {
  const server = runtime(options);
  async function run<T>(
    token: string,
    operation: "evaluation.record" | "foundation.read",
    projectId: string,
    targetId: string,
    action: (context: EvaluationContext) => Promise<T>,
  ): Promise<T> {
    const request: FoundationMachineRequest = {
      operation,
      projectId,
      environment: server.environment,
      targetId,
      correlationId: server.id(),
      tokenDigest: foundationTokenDigest(token),
    };
    let finalGuard: Guard = () => invalid();
    const result = await port.withClient(request, async (stored, records) => {
      const guard = () =>
        requireFoundationGrant(foundationClientSchema.parse(stored), {
          operation,
          projectId,
          environment: server.environment,
          now: server.now(),
        });
      finalGuard = guard;
      guard();
      const client = foundationClientSchema.parse(stored);
      const actor = foundationActorSchema.parse({
        schemaVersion: 1,
        principalId: "foundation-client:" + client.id,
        clientId: client.id,
        runId: null,
        capabilities: client.operations,
        projectId,
        resourceIds: [],
        environment: server.environment,
        expiresAt: client.expiresAt,
        correlationId: request.correlationId,
      });
      const value = await action({ records, actor, request, guard });
      guard();
      return value;
    });
    finalGuard();
    return result;
  }
  return {
    recordDefinition(token: string, rawDefinition: unknown, rawKey: unknown) {
      const input = foundationEvaluationDefinitionSchema.parse(rawDefinition);
      definition(input, input.projectId, input.id);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        token,
        "evaluation.record",
        input.projectId,
        input.id,
        (context) =>
          mutate(
            context,
            "definition",
            input,
            key,
            foundationEvaluationDefinitionSchema,
            async () => {
              await configurations(
                context.records,
                input.projectId,
                input.configurationIds,
                context.guard,
              );
              if (await context.records.getDefinition(input.id)) conflict();
              context.guard();
              return context.records.insertDefinition(input);
            },
          ),
      );
    },
    recordTrial(token: string, rawTrial: unknown, rawKey: unknown) {
      const input = foundationEvaluationTrialSchema.parse(rawTrial);
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        token,
        "evaluation.record",
        input.projectId,
        input.id,
        (context) =>
          mutate(
            context,
            "trial",
            input,
            key,
            foundationEvaluationTrialSchema,
            async () => {
              const def = await loadDefinition(context, input.definitionId);
              bindTrial(input, def);
              await configurations(
                context.records,
                input.projectId,
                input.configurationIds,
                context.guard,
              );
              const records = await loadPopulation(context, def);
              if (
                records.trials.some(
                  (record) =>
                    record.id === input.id ||
                    record.attemptId === input.attemptId,
                ) ||
                (await context.records.getTrial(input.id))
              )
                conflict();
              context.guard();
              return context.records.insertTrial(input);
            },
          ),
      );
    },
    recordAssessment(token: string, rawAssessment: unknown, rawKey: unknown) {
      const input = foundationAssessmentSchema.parse(rawAssessment);
      if (input.reviewStatus !== "unreviewed")
        throw new FoundationError(
          "FORBIDDEN",
          "Assessment review requires the owner",
        );
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      return run(
        token,
        "evaluation.record",
        input.projectId,
        input.id,
        (context) =>
          mutate(
            context,
            "assessment",
            input,
            key,
            foundationAssessmentSchema,
            () => insertAssessment(context, input, false),
          ),
      );
    },
    getDefinition(token: string, projectId: string, id: string) {
      const input = foundationReadRecordSchema.parse({ projectId, id });
      return run(
        token,
        "foundation.read",
        input.projectId,
        input.id,
        (context) => loadDefinition(context, input.id),
      );
    },
    getTrial(token: string, projectId: string, id: string) {
      const input = foundationReadRecordSchema.parse({ projectId, id });
      return run(
        token,
        "foundation.read",
        input.projectId,
        input.id,
        async (context) => (await loadTrial(context, input.id)).trial,
      );
    },
    getAssessment(token: string, projectId: string, id: string) {
      const input = foundationReadRecordSchema.parse({ projectId, id });
      return run(
        token,
        "foundation.read",
        input.projectId,
        input.id,
        async (context) => {
          const record = scoped(
            foundationAssessmentSchema,
            await context.records.getAssessment(input.id),
            input.projectId,
            input.id,
          );
          context.guard();
          const { trial, def } = await loadTrial(context, record.trialId);
          bindAssessment(record, trial, def);
          await configurations(
            context.records,
            input.projectId,
            [record.judgeConfigurationId],
            context.guard,
          );
          const records = await loadPopulation(context, def);
          const stored = records.assessments.find(
            (assessment) => assessment.id === record.id,
          );
          if (!stored) invalid();
          return exact(foundationAssessmentSchema, stored, record);
        },
      );
    },
    report(
      token: string,
      projectId: string,
      definitionId: string,
      conditionConfigurations: readonly FoundationConditionConfigurations[],
      judgeConfigurationIds: readonly string[],
    ) {
      const input = foundationReadRecordSchema.parse({
        projectId,
        id: definitionId,
      });
      if (
        !Array.isArray(conditionConfigurations) ||
        !Array.isArray(judgeConfigurationIds)
      )
        invalid();
      const mappings = conditionConfigurations.map((mapping) => {
        if (
          !mapping ||
          Object.keys(mapping).length !== 2 ||
          !Object.hasOwn(mapping, "condition") ||
          !Object.hasOwn(mapping, "configurationIds")
        )
          invalid();
        return {
          condition:
            foundationEvaluationDefinitionSchema.shape.conditions.element.parse(
              mapping.condition,
            ),
          configurationIds:
            foundationEvaluationDefinitionSchema.shape.configurationIds.parse(
              mapping.configurationIds,
            ),
        };
      });
      const judges = judgeConfigurationIds.map((id) =>
        foundationReadRecordSchema.shape.id.parse(id),
      );
      return run(
        token,
        "foundation.read",
        input.projectId,
        input.id,
        async (context) => {
          const def = await loadDefinition(context, input.id);
          const records = await loadPopulation(context, def);
          // A selected judge can have no assessments yet. Resolve its exact
          // snapshot directly instead of requiring an existing judge reference.
          const snapshots = new Map(
            records.configurations.map((record) => [record.id, record]),
          );
          for (const id of judges) {
            const selected = configuration(
              await context.records.getConfiguration(id),
              input.projectId,
              id,
            );
            context.guard();
            const prior = snapshots.get(id);
            if (prior && foundationDigest(prior) !== foundationDigest(selected))
              invalid();
            snapshots.set(id, selected);
          }
          return buildFoundationEvaluationReport({
            projectId: input.projectId,
            definition: def,
            ...records,
            configurations: [...snapshots.values()],
            conditionConfigurations: mappings,
            judgeConfigurationIds: judges,
          });
        },
      );
    },
  };
}

/** Trusted owner-only entry point. evaluation.record retains the existing audit
 * operation; owner principal and the distinct assessment target identify this
 * sensitive review. No machine method or request flag grants reviewed authority.
 * A session adapter must authenticate identity and enforce its revocation. */
export function createFoundationEvaluationOwnerService(
  port: FoundationEvaluationPort,
  identity: FoundationIdentity,
  options: FoundationServiceOptions,
) {
  const server = runtime(options);
  const trusted = {
    principalId: identity.principalId,
    expiresAt: identity.expiresAt,
  };
  const session = () => {
    const expiry = foundationInstantMilliseconds(trusted.expiresAt);
    if (
      !foundationActorSchema.shape.principalId.safeParse(trusted.principalId)
        .success ||
      !foundationActorSchema.shape.expiresAt.safeParse(trusted.expiresAt)
        .success ||
      !Number.isFinite(expiry) ||
      expiry <= server.now().getTime()
    )
      throw new FoundationError(
        "FORBIDDEN",
        "A live owner session is required",
      );
  };
  return {
    async reviewAssessment(
      rawAssessment: unknown,
      rawKey: unknown,
    ): Promise<FoundationMutationResult<FoundationAssessment>> {
      session();
      const input = foundationAssessmentSchema.parse(rawAssessment);
      if (input.reviewStatus !== "reviewed")
        throw new FoundationError(
          "FORBIDDEN",
          "Owner review requires a reviewed assessment",
        );
      const key = foundationIdempotencyKeySchema.parse(rawKey);
      const request: FoundationOwnerRequest = {
        operation: "evaluation.record",
        projectId: input.projectId,
        environment: server.environment,
        correlationId: server.id(),
        targetId: input.id,
        ...trusted,
      };
      const result = await port.withOwner(request, async (records) => {
        session();
        const actor = foundationActorSchema.parse({
          schemaVersion: 1,
          principalId: trusted.principalId,
          clientId: null,
          runId: null,
          capabilities: ["evaluation.record"],
          projectId: input.projectId,
          resourceIds: [],
          environment: server.environment,
          expiresAt: trusted.expiresAt,
          correlationId: request.correlationId,
        });
        const value = await mutate(
          { records, actor, request, guard: session },
          "owner_review",
          input,
          key,
          foundationAssessmentSchema,
          () =>
            insertAssessment(
              { records, actor, request, guard: session },
              input,
              true,
            ),
        );
        session();
        return value;
      });
      session();
      return result;
    },
  };
}
