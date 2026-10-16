import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type {
  FoundationImprovementPort,
  FoundationImprovementRecords,
  FoundationRecordPort,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationImprovementDecisionSchema,
  foundationImprovementProposalSchema,
  type FoundationImprovementProposal,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationInstantMilliseconds,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  foundationByteDigest,
  type FoundationTransaction,
} from "./foundation-record-repository";
import { createFoundationEvaluationRecordRepository } from "./foundation-evaluation-record-repository";
import {
  createFoundationWorkflowAccessRepository,
  type FoundationWorkflowRecordContext,
} from "./foundation-workflow-access-repository";
import {
  foundationImprovementConditionConfiguration as conditionTable,
  foundationImprovementDecision as decisionTable,
  foundationImprovementJudgeConfiguration as judgeTable,
  foundationImprovementMotivation as motivationTable,
  foundationImprovementProposal as proposalTable,
} from "./foundation-improvement-schema";

function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Improvement reference unavailable in scope",
  );
}
function conflict(): never {
  throw new FoundationError(
    "VERSION_CONFLICT",
    "Improvement version does not match",
  );
}
function compareInstants(a: string, b: string): number {
  const difference =
    foundationInstantMilliseconds(a) - foundationInstantMilliseconds(b);
  if (!Number.isFinite(difference)) invalid();
  if (difference !== 0) return difference;
  const tail = (v: string) => (v.match(/\.(\d+)/)?.[1] ?? "").slice(3);
  const left = tail(a),
    right = tail(b),
    width = Math.max(left.length, right.length);
  return left.padEnd(width, "0") < right.padEnd(width, "0")
    ? -1
    : left.padEnd(width, "0") > right.padEnd(width, "0")
      ? 1
      : 0;
}
type Parser<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};
function exact<
  T extends {
    id: string;
    projectId: string;
    contentDigest: string;
    recordedAt: string;
  },
>(parser: Parser<T>, input: unknown, projectId: string, now: () => Date): T {
  const result = parser.safeParse(input);
  if (!result.success) invalid();
  const record = result.data;
  const { contentDigest, ...content } = record;
  if (
    record.projectId !== projectId ||
    foundationDigest(input) !== foundationDigest(record) ||
    contentDigest !== foundationDigest(content) ||
    compareInstants(record.recordedAt, now().toISOString()) > 0
  )
    invalid();
  return record;
}
async function safe<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof FoundationError) throw error;
    invalid();
  }
}

/** All feature methods use only the caller's authorized transaction. The core
 * record port owns idempotency and audits; evaluation contributes reads only. */
export function createFoundationImprovementRecordRepository(
  tx: FoundationTransaction,
  context: FoundationWorkflowRecordContext,
  records: FoundationRecordPort,
  now: () => Date,
): FoundationImprovementRecords {
  const request = context.request;
  const scope = request.projectId,
    environment = request.environment;
  const allowed =
    context.mode === "machine"
      ? ["improvement.read", "improvement.propose"]
      : ["improvement.read", "improvement.review"];
  if (
    !allowed.includes(request.operation) ||
    !foundationActorSchema.shape.projectId.safeParse(scope).success ||
    !foundationActorSchema.shape.environment.safeParse(environment).success ||
    (context.mode === "machine"
      ? request.principalId !== "foundation-client:" + context.request.clientId
      : !request.principalId.startsWith("user:"))
  )
    throw new FoundationError("FORBIDDEN");
  const evaluation = createFoundationEvaluationRecordRepository(
    tx,
    request,
    now,
    () => {},
  );
  const requireConfiguration = async (id: string) => {
    const record = await records.getConfiguration(id);
    if (
      !record ||
      record.id !== id ||
      record.projectId !== scope ||
      foundationByteDigest(record.content) !== record.contentDigest
    )
      invalid();
  };
  const proposalScope = (id: string) =>
    and(
      eq(proposalTable.id, id),
      eq(proposalTable.projectId, scope),
      eq(proposalTable.environment, environment),
    );
  const decisionScope = (id: string) =>
    and(
      eq(decisionTable.proposalId, id),
      eq(decisionTable.projectId, scope),
      eq(decisionTable.environment, environment),
    );
  const requireTarget = (id: string | null) => {
    if (request.targetId !== id) invalid();
  };
  const references = async (record: FoundationImprovementProposal) => {
    if (!(await evaluation.getDefinition(record.definitionId))) invalid();
    for (const id of [
      record.baselineConfigurationId,
      record.candidateConfigurationId,
      ...record.judgeConfigurationIds,
      ...record.conditionConfigurations.flatMap((c) => c.configurationIds),
    ])
      await requireConfiguration(id);
    for (const motivation of record.motivations) {
      const assessment = await evaluation.getAssessment(
        motivation.assessmentId,
      );
      if (!assessment || assessment.version !== motivation.assessmentVersion)
        invalid();
    }
  };
  const proposalRecord = async (row: typeof proposalTable.$inferSelect) => {
    const record = exact(
      foundationImprovementProposalSchema,
      row.record,
      scope,
      now,
    );
    if (
      row.id !== record.id ||
      row.projectId !== scope ||
      row.environment !== environment ||
      record.environment !== environment ||
      row.definitionId !== record.definitionId ||
      row.candidateConfigurationId !== record.candidateConfigurationId ||
      row.baselineConfigurationId !== record.baselineConfigurationId ||
      !/^foundation-client:[^\s]+$/.test(record.recordedBy)
    )
      invalid();
    const conditions = await tx
      .select()
      .from(conditionTable)
      .where(
        and(
          eq(conditionTable.proposalId, record.id),
          eq(conditionTable.projectId, scope),
        ),
      )
      .orderBy(
        asc(conditionTable.conditionOrdinal),
        asc(conditionTable.ordinal),
      );
    const judges = await tx
      .select()
      .from(judgeTable)
      .where(
        and(
          eq(judgeTable.proposalId, record.id),
          eq(judgeTable.projectId, scope),
        ),
      )
      .orderBy(asc(judgeTable.ordinal));
    const motivations = await tx
      .select()
      .from(motivationTable)
      .where(
        and(
          eq(motivationTable.proposalId, record.id),
          eq(motivationTable.projectId, scope),
        ),
      )
      .orderBy(asc(motivationTable.ordinal));
    const expectedConditions = record.conditionConfigurations.flatMap(
      (c, conditionOrdinal) =>
        c.configurationIds.map((configurationId, ordinal) => ({
          proposalId: record.id,
          projectId: scope,
          conditionOrdinal,
          condition: c.condition,
          role: c.role,
          configurationId,
          ordinal,
        })),
    );
    const expectedJudges = record.judgeConfigurationIds.map(
      (configurationId, ordinal) => ({
        proposalId: record.id,
        projectId: scope,
        configurationId,
        ordinal,
      }),
    );
    const expectedMotivations = record.motivations.map((m, ordinal) => ({
      proposalId: record.id,
      projectId: scope,
      assessmentId: m.assessmentId,
      assessmentVersion: m.assessmentVersion,
      ordinal,
    }));
    if (
      foundationDigest(conditions) !== foundationDigest(expectedConditions) ||
      foundationDigest(judges) !== foundationDigest(expectedJudges) ||
      foundationDigest(motivations) !== foundationDigest(expectedMotivations)
    )
      invalid();
    await references(record);
    return record;
  };
  const getProposal = async (id: string) => {
    if (!foundationActorSchema.shape.projectId.safeParse(id).success) invalid();
    const [row] = await tx
      .select()
      .from(proposalTable)
      .where(proposalScope(id));
    return row ? proposalRecord(row) : null;
  };
  const currentDecision = async (proposalId: string) => {
    const [row] = await tx
      .select()
      .from(decisionTable)
      .where(decisionScope(proposalId))
      .orderBy(desc(decisionTable.version))
      .limit(1);
    if (!row) return null;
    const record = exact(
      foundationImprovementDecisionSchema,
      row.record,
      scope,
      now,
    );
    const parent = await getProposal(proposalId);
    if (
      !parent ||
      row.projectId !== scope ||
      row.environment !== environment ||
      row.id !== record.id ||
      row.proposalId !== proposalId ||
      record.proposalId !== proposalId ||
      row.version !== record.version ||
      record.version > 2147483647 ||
      record.expectedProposalDigest !== parent.contentDigest ||
      compareInstants(
        record.expiresAt,
        new Date(
          foundationInstantMilliseconds(record.recordedAt) + 30 * 86400000,
        ).toISOString(),
      ) > 0
    )
      invalid();
    return record;
  };
  return {
    ...records,
    getDefinition: (id) => safe(() => evaluation.getDefinition(id)),
    getTrial: (id) => safe(() => evaluation.getTrial(id)),
    getAssessment: (id) => safe(() => evaluation.getAssessment(id)),
    getReportPopulation: (id) => safe(() => evaluation.getReportPopulation(id)),
    getProposal: (id) =>
      safe(async () => {
        if (
          request.operation !== "improvement.read" &&
          request.operation !== "improvement.review"
        )
          invalid();
        requireTarget(id);
        return getProposal(id);
      }),
    insertProposal: (input) =>
      safe(async () => {
        if (
          context.mode !== "machine" ||
          request.operation !== "improvement.propose"
        )
          throw new FoundationError("FORBIDDEN");
        requireTarget(null);
        const record = exact(
          foundationImprovementProposalSchema,
          input,
          scope,
          now,
        );
        if (
          record.environment !== environment ||
          record.recordedBy !== request.principalId
        )
          invalid();
        await references(record);
        await tx.insert(proposalTable).values({
          id: record.id,
          projectId: scope,
          environment,
          definitionId: record.definitionId,
          candidateConfigurationId: record.candidateConfigurationId,
          baselineConfigurationId: record.baselineConfigurationId,
          record,
        });
        await tx.insert(conditionTable).values(
          record.conditionConfigurations.flatMap((c, conditionOrdinal) =>
            c.configurationIds.map((configurationId, ordinal) => ({
              proposalId: record.id,
              projectId: scope,
              conditionOrdinal,
              condition: c.condition,
              role: c.role,
              configurationId,
              ordinal,
            })),
          ),
        );
        await tx.insert(judgeTable).values(
          record.judgeConfigurationIds.map((configurationId, ordinal) => ({
            proposalId: record.id,
            projectId: scope,
            configurationId,
            ordinal,
          })),
        );
        await tx.insert(motivationTable).values(
          record.motivations.map((m, ordinal) => ({
            proposalId: record.id,
            projectId: scope,
            assessmentId: m.assessmentId,
            assessmentVersion: m.assessmentVersion,
            ordinal,
          })),
        );
        const stored = await getProposal(record.id);
        if (!stored || foundationDigest(stored) !== foundationDigest(record))
          invalid();
        return stored;
      }),
    listProposals: (query) =>
      safe(async () => {
        if (request.operation !== "improvement.read")
          throw new FoundationError("FORBIDDEN");
        requireTarget(null);
        if (
          !Number.isSafeInteger(query.limit) ||
          query.limit < 1 ||
          query.limit >= 2147483647 ||
          !foundationActorSchema.shape.expiresAt.safeParse(query.asOf)
            .success ||
          compareInstants(query.asOf, now().toISOString()) > 0
        )
          invalid();
        const eligible = and(
          eq(proposalTable.projectId, scope),
          eq(proposalTable.environment, environment),
          sql`public.commandry_improvement_instant_compare(${proposalTable.record}->>'recordedAt',${query.asOf}) <= 0`,
        );
        if (query.afterId !== null) {
          if (
            !foundationActorSchema.shape.projectId.safeParse(query.afterId)
              .success
          )
            invalid();
          const [anchor] = await tx
            .select()
            .from(proposalTable)
            .where(and(eligible, eq(proposalTable.id, query.afterId)));
          if (!anchor) invalid();
          await proposalRecord(anchor);
        }
        const rows = await tx
          .select()
          .from(proposalTable)
          .where(
            and(
              eligible,
              query.afterId === null
                ? undefined
                : gt(proposalTable.id, query.afterId),
            ),
          )
          .orderBy(asc(proposalTable.id))
          .limit(query.limit + 1);
        const items = [];
        for (const row of rows.slice(0, query.limit))
          items.push(await proposalRecord(row));
        return {
          items,
          nextAfterId:
            rows.length > query.limit ? items[items.length - 1]!.id : null,
        };
      }),
    getCurrentDecision: (proposalId) =>
      safe(async () => {
        if (
          request.operation !== "improvement.read" &&
          request.operation !== "improvement.review"
        )
          invalid();
        requireTarget(proposalId);
        return currentDecision(proposalId);
      }),
    insertDecision: (input, expectedVersion) =>
      safe(async () => {
        if (
          context.mode !== "owner" ||
          request.operation !== "improvement.review"
        )
          throw new FoundationError("FORBIDDEN");
        const record = exact(
          foundationImprovementDecisionSchema,
          input,
          scope,
          now,
        );
        requireTarget(record.proposalId);
        if (
          record.recordedBy !== request.principalId ||
          record.expectedDecisionVersion !== expectedVersion ||
          !Number.isInteger(expectedVersion) ||
          expectedVersion < 0 ||
          expectedVersion >= 2147483647 ||
          record.version !== expectedVersion + 1
        )
          invalid();
        const [locked] = await tx
          .select()
          .from(proposalTable)
          .where(proposalScope(record.proposalId))
          .for("update");
        if (!locked) invalid();
        const parent = await proposalRecord(locked);
        const current = await currentDecision(record.proposalId);
        if ((current?.version ?? 0) !== expectedVersion) conflict();
        if (
          record.expectedProposalDigest !== parent.contentDigest ||
          compareInstants(record.expiresAt, now().toISOString()) <= 0 ||
          compareInstants(
            record.expiresAt,
            new Date(now().getTime() + 30 * 86400000).toISOString(),
          ) > 0 ||
          compareInstants(
            record.expiresAt,
            new Date(
              foundationInstantMilliseconds(record.recordedAt) + 30 * 86400000,
            ).toISOString(),
          ) > 0
        )
          invalid();
        await tx.insert(decisionTable).values({
          id: record.id,
          proposalId: record.proposalId,
          projectId: scope,
          environment,
          version: record.version,
          record,
        });
        const stored = await currentDecision(record.proposalId);
        if (!stored || foundationDigest(stored) !== foundationDigest(record))
          invalid();
        return stored;
      }),
  };
}

export function createFoundationImprovementAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationImprovementPort {
  const access = createFoundationWorkflowAccessRepository(
    db,
    createFoundationImprovementRecordRepository,
    {
      machineOperations: ["improvement.read", "improvement.propose"],
      ownerOperations: ["improvement.read", "improvement.review"],
      lockNamespace: "foundation-evaluation:",
      ...options,
    },
  );
  return {
    withClient: (request, action) =>
      safe(() => access.withClient(request, action)),
    withOwner: (request, action) =>
      safe(() => access.withOwner(request, action)),
  };
}
