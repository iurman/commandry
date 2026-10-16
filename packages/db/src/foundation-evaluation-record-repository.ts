import { and, asc, eq } from "drizzle-orm";
import type {
  FoundationEvaluationRecords,
  FoundationOperationContext,
} from "@commandry/application";
import {
  foundationAssessmentSchema,
  foundationEvaluationDefinitionSchema,
  foundationEvaluationTrialSchema,
  type FoundationAssessment,
  type FoundationEvaluationDefinition,
  type FoundationEvaluationTrial,
} from "@commandry/contracts";
import { FoundationError, foundationDigest } from "@commandry/domain";
import {
  createFoundationRecordRepository,
  foundationByteDigest,
  type FoundationTransaction,
} from "./foundation-record-repository";
import {
  foundationAssessment,
  foundationEvaluationDefinition,
  foundationEvaluationDefinitionConfiguration,
  foundationEvaluationTrial,
  foundationEvaluationTrialConfiguration,
} from "./foundation-evaluation-schema";

type Parser<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};
function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Evaluation reference unavailable in scope",
  );
}
function exact<T extends { id: string; projectId: string }>(
  schema: Parser<T>,
  value: unknown,
  scope: string,
  id?: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) invalid();
  const record = parsed.data;
  if (
    record.projectId !== scope ||
    (id !== undefined && record.id !== id) ||
    foundationDigest(record) !== foundationDigest(value)
  )
    invalid();
  return record;
}
function membership(
  ids: readonly string[],
  rows: readonly { configurationId: string; ordinal: number }[],
) {
  if (
    ids.length !== rows.length ||
    rows.some(
      (row, ordinal) =>
        row.ordinal !== ordinal || row.configurationId !== ids[ordinal],
    )
  )
    invalid();
}

/** Reuses core receipts and configurations on the exact caller transaction.
 * The access wrapper serializes every evaluation read and append per project. */
export function createFoundationEvaluationRecordRepository(
  tx: FoundationTransaction,
  context: FoundationOperationContext & { principalId: string },
  now: () => Date,
  onReplay: () => void,
): FoundationEvaluationRecords {
  const scope = context.projectId;
  const core = createFoundationRecordRepository(tx, context, now, onReplay);
  const mutation = () => {
    if (context.operation !== "evaluation.record")
      throw new FoundationError("FORBIDDEN", "Evaluation mutation unavailable");
  };
  const configuration = async (id: string) => {
    const record = await core.getConfiguration(id);
    if (
      record &&
      (record.id !== id ||
        record.projectId !== scope ||
        foundationByteDigest(record.content) !== record.contentDigest)
    )
      invalid();
    return record;
  };
  const requireConfigurations = async (ids: readonly string[]) => {
    for (const id of ids) if (!(await configuration(id))) invalid();
  };
  const definitionRecord = async (
    row: typeof foundationEvaluationDefinition.$inferSelect,
  ) => {
    const record = exact(
      foundationEvaluationDefinitionSchema,
      row.record,
      scope,
      row.id,
    );
    if (
      record.version !== 1 ||
      row.version !== record.version ||
      row.projectId !== scope
    )
      invalid();
    const members = await tx
      .select()
      .from(foundationEvaluationDefinitionConfiguration)
      .where(
        and(
          eq(foundationEvaluationDefinitionConfiguration.definitionId, row.id),
          eq(foundationEvaluationDefinitionConfiguration.projectId, scope),
        ),
      )
      .orderBy(asc(foundationEvaluationDefinitionConfiguration.ordinal));
    membership(record.configurationIds, members);
    return record;
  };
  const trialRecord = async (
    row: typeof foundationEvaluationTrial.$inferSelect,
  ) => {
    const record = exact(
      foundationEvaluationTrialSchema,
      row.record,
      scope,
      row.id,
    );
    if (
      row.projectId !== scope ||
      row.definitionId !== record.definitionId ||
      row.attemptId !== record.attemptId
    )
      invalid();
    const members = await tx
      .select()
      .from(foundationEvaluationTrialConfiguration)
      .where(
        and(
          eq(foundationEvaluationTrialConfiguration.trialId, row.id),
          eq(foundationEvaluationTrialConfiguration.projectId, scope),
        ),
      )
      .orderBy(asc(foundationEvaluationTrialConfiguration.ordinal));
    membership(record.configurationIds, members);
    return record;
  };
  const assessmentRecord = (row: typeof foundationAssessment.$inferSelect) => {
    const record = exact(foundationAssessmentSchema, row.record, scope, row.id);
    if (
      row.projectId !== scope ||
      row.trialId !== record.trialId ||
      row.version !== record.version ||
      row.judgeConfigurationId !== record.judgeConfigurationId
    )
      invalid();
    return record;
  };
  const port: FoundationEvaluationRecords = {
    idempotent: core.idempotent,
    getConfiguration: configuration,
    async getDefinition(id) {
      const [row] = await tx
        .select()
        .from(foundationEvaluationDefinition)
        .where(
          and(
            eq(foundationEvaluationDefinition.id, id),
            eq(foundationEvaluationDefinition.projectId, scope),
          ),
        );
      return row ? definitionRecord(row) : null;
    },
    async getTrial(id) {
      const [row] = await tx
        .select()
        .from(foundationEvaluationTrial)
        .where(
          and(
            eq(foundationEvaluationTrial.id, id),
            eq(foundationEvaluationTrial.projectId, scope),
          ),
        );
      return row ? trialRecord(row) : null;
    },
    async getAssessment(id) {
      const [row] = await tx
        .select()
        .from(foundationAssessment)
        .where(
          and(
            eq(foundationAssessment.id, id),
            eq(foundationAssessment.projectId, scope),
          ),
        );
      return row ? assessmentRecord(row) : null;
    },
    async getReportPopulation(definitionId) {
      const definition = await port.getDefinition(definitionId);
      if (!definition) invalid();
      const trialRows = await tx
        .select()
        .from(foundationEvaluationTrial)
        .where(
          and(
            eq(foundationEvaluationTrial.definitionId, definitionId),
            eq(foundationEvaluationTrial.projectId, scope),
          ),
        )
        .orderBy(asc(foundationEvaluationTrial.id));
      const trials: FoundationEvaluationTrial[] = [];
      for (const row of trialRows) trials.push(await trialRecord(row));
      // Join the scoped definition population rather than using a bounded page
      // or an ever-growing SQL IN parameter list. Include every version.
      const assessmentRows = await tx
        .select({ assessment: foundationAssessment })
        .from(foundationAssessment)
        .innerJoin(
          foundationEvaluationTrial,
          and(
            eq(foundationEvaluationTrial.id, foundationAssessment.trialId),
            eq(
              foundationEvaluationTrial.projectId,
              foundationAssessment.projectId,
            ),
          ),
        )
        .where(
          and(
            eq(foundationAssessment.projectId, scope),
            eq(foundationEvaluationTrial.projectId, scope),
            eq(foundationEvaluationTrial.definitionId, definitionId),
          ),
        )
        .orderBy(
          asc(foundationAssessment.trialId),
          asc(foundationAssessment.version),
        );
      const assessments = assessmentRows.map(({ assessment }) =>
        assessmentRecord(assessment),
      );
      const ids = new Set(definition.configurationIds);
      for (const trial of trials)
        for (const id of trial.configurationIds) ids.add(id);
      for (const assessment of assessments)
        ids.add(assessment.judgeConfigurationId);
      const configurations = [];
      for (const id of ids) {
        const record = await configuration(id);
        if (!record) invalid();
        configurations.push(record);
      }
      return { trials, assessments, configurations };
    },
    async insertDefinition(input: FoundationEvaluationDefinition) {
      mutation();
      const record = exact(foundationEvaluationDefinitionSchema, input, scope);
      if (record.version !== 1) invalid();
      await requireConfigurations(record.configurationIds);
      await tx.insert(foundationEvaluationDefinition).values({
        id: record.id,
        projectId: scope,
        version: record.version,
        record,
      });
      for (
        let offset = 0;
        offset < record.configurationIds.length;
        offset += 1000
      ) {
        await tx.insert(foundationEvaluationDefinitionConfiguration).values(
          record.configurationIds
            .slice(offset, offset + 1000)
            .map((configurationId, index) => ({
              definitionId: record.id,
              projectId: scope,
              configurationId,
              ordinal: offset + index,
            })),
        );
      }
      const stored = await port.getDefinition(record.id);
      if (!stored || foundationDigest(stored) !== foundationDigest(record))
        invalid();
      return stored;
    },
    async insertTrial(input: FoundationEvaluationTrial) {
      mutation();
      const record = exact(foundationEvaluationTrialSchema, input, scope);
      if (!(await port.getDefinition(record.definitionId))) invalid();
      await requireConfigurations(record.configurationIds);
      await tx.insert(foundationEvaluationTrial).values({
        id: record.id,
        projectId: scope,
        definitionId: record.definitionId,
        attemptId: record.attemptId,
        record,
      });
      for (
        let offset = 0;
        offset < record.configurationIds.length;
        offset += 1000
      ) {
        await tx.insert(foundationEvaluationTrialConfiguration).values(
          record.configurationIds
            .slice(offset, offset + 1000)
            .map((configurationId, index) => ({
              trialId: record.id,
              projectId: scope,
              configurationId,
              ordinal: offset + index,
            })),
        );
      }
      const stored = await port.getTrial(record.id);
      if (!stored || foundationDigest(stored) !== foundationDigest(record))
        invalid();
      return stored;
    },
    async insertAssessment(input: FoundationAssessment) {
      mutation();
      const record = exact(foundationAssessmentSchema, input, scope);
      if (
        record.reviewStatus === "reviewed" &&
        context.principalId.startsWith("foundation-client:")
      )
        throw new FoundationError(
          "FORBIDDEN",
          "Assessment review requires the owner",
        );
      if (!(await port.getTrial(record.trialId))) invalid();
      await requireConfigurations([record.judgeConfigurationId]);
      await tx.insert(foundationAssessment).values({
        id: record.id,
        projectId: scope,
        trialId: record.trialId,
        version: record.version,
        judgeConfigurationId: record.judgeConfigurationId,
        record,
      });
      const stored = await port.getAssessment(record.id);
      if (!stored || foundationDigest(stored) !== foundationDigest(record))
        invalid();
      return stored;
    },
  };
  return port;
}
