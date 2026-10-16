import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  FoundationAssessment,
  FoundationEvaluationDefinition,
  FoundationEvaluationTrial,
} from "@commandry/contracts";
import { project } from "./schema";
import { foundationConfiguration } from "./foundation-schema";

const projectId = () =>
  uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "restrict" });
const creationTransaction = () =>
  text("creation_transaction")
    .notNull()
    .default(sql`pg_current_xact_id()::text`);

// The migration must additionally install nonforgeable creation-transaction,
// append-only membership and deferred exact-membership guards. Defaults and
// foreign keys alone do not enforce immutable, complete relation populations.
export const foundationEvaluationDefinition = pgTable(
  "foundation_evaluation_definition",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    version: integer("version").notNull(),
    record: jsonb("record").$type<FoundationEvaluationDefinition>().notNull(),
    creationTransaction: creationTransaction(),
  },
  (t) => [
    uniqueIndex("foundation_eval_definition_scope_idx").on(t.id, t.projectId),
    index("foundation_eval_definition_project_idx").on(t.projectId, t.id),
    check("foundation_eval_definition_version_valid", sql`${t.version} = 1`),
    check(
      "foundation_eval_definition_record_valid",
      sql`(jsonb_typeof(${t.record}) = 'object' and ${t.record}->'schemaVersion' = '1'::jsonb and ${t.record}->>'id' = ${t.id}::text and ${t.record}->>'projectId' = ${t.projectId}::text and ${t.record}->'version' = to_jsonb(${t.version}) and jsonb_typeof(${t.record}->'configurationIds') = 'array') is true`,
    ),
  ],
);

export const foundationEvaluationDefinitionConfiguration = pgTable(
  "foundation_evaluation_definition_configuration",
  {
    definitionId: uuid("definition_id").notNull(),
    projectId: projectId(),
    configurationId: uuid("configuration_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.definitionId, t.configurationId] }),
    uniqueIndex("foundation_eval_definition_config_order_idx").on(
      t.definitionId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.definitionId, t.projectId],
      foreignColumns: [
        foundationEvaluationDefinition.id,
        foundationEvaluationDefinition.projectId,
      ],
      name: "foundation_eval_definition_config_parent_fk",
    }),
    foreignKey({
      columns: [t.configurationId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_eval_definition_config_scope_fk",
    }),
    check(
      "foundation_eval_definition_config_order_valid",
      sql`${t.ordinal} >= 0`,
    ),
  ],
);

export const foundationEvaluationTrial = pgTable(
  "foundation_evaluation_trial",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    definitionId: uuid("definition_id").notNull(),
    attemptId: uuid("attempt_id").notNull(),
    record: jsonb("record").$type<FoundationEvaluationTrial>().notNull(),
    creationTransaction: creationTransaction(),
  },
  (t) => [
    uniqueIndex("foundation_eval_trial_scope_idx").on(t.id, t.projectId),
    uniqueIndex("foundation_eval_trial_attempt_idx").on(t.attemptId),
    index("foundation_eval_trial_definition_idx").on(
      t.projectId,
      t.definitionId,
      t.id,
    ),
    foreignKey({
      columns: [t.definitionId, t.projectId],
      foreignColumns: [
        foundationEvaluationDefinition.id,
        foundationEvaluationDefinition.projectId,
      ],
      name: "foundation_eval_trial_definition_scope_fk",
    }),
    check(
      "foundation_eval_trial_record_valid",
      sql`(jsonb_typeof(${t.record}) = 'object' and ${t.record}->'schemaVersion' = '1'::jsonb and ${t.record}->>'id' = ${t.id}::text and ${t.record}->>'projectId' = ${t.projectId}::text and ${t.record}->>'definitionId' = ${t.definitionId}::text and ${t.record}->>'attemptId' = ${t.attemptId}::text and jsonb_typeof(${t.record}->'configurationIds') = 'array') is true`,
    ),
  ],
);

export const foundationEvaluationTrialConfiguration = pgTable(
  "foundation_evaluation_trial_configuration",
  {
    trialId: uuid("trial_id").notNull(),
    projectId: projectId(),
    configurationId: uuid("configuration_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.trialId, t.configurationId] }),
    uniqueIndex("foundation_eval_trial_config_order_idx").on(
      t.trialId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.trialId, t.projectId],
      foreignColumns: [
        foundationEvaluationTrial.id,
        foundationEvaluationTrial.projectId,
      ],
      name: "foundation_eval_trial_config_parent_fk",
    }),
    foreignKey({
      columns: [t.configurationId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_eval_trial_config_scope_fk",
    }),
    check("foundation_eval_trial_config_order_valid", sql`${t.ordinal} >= 0`),
  ],
);

export const foundationAssessment = pgTable(
  "foundation_evaluation_assessment",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    trialId: uuid("trial_id").notNull(),
    version: integer("version").notNull(),
    judgeConfigurationId: uuid("judge_configuration_id").notNull(),
    record: jsonb("record").$type<FoundationAssessment>().notNull(),
  },
  (t) => [
    uniqueIndex("foundation_assessment_scope_idx").on(t.id, t.projectId),
    uniqueIndex("foundation_assessment_version_scope_idx").on(
      t.id,
      t.version,
      t.projectId,
    ),
    uniqueIndex("foundation_assessment_trial_version_idx").on(
      t.trialId,
      t.version,
    ),
    index("foundation_assessment_trial_scope_idx").on(
      t.projectId,
      t.trialId,
      t.version,
    ),
    foreignKey({
      columns: [t.trialId, t.projectId],
      foreignColumns: [
        foundationEvaluationTrial.id,
        foundationEvaluationTrial.projectId,
      ],
      name: "foundation_assessment_trial_scope_fk",
    }),
    foreignKey({
      columns: [t.judgeConfigurationId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_assessment_judge_scope_fk",
    }),
    check("foundation_assessment_version_valid", sql`${t.version} > 0`),
    check(
      "foundation_assessment_record_valid",
      sql`(jsonb_typeof(${t.record}) = 'object' and ${t.record}->'schemaVersion' = '1'::jsonb and ${t.record}->>'id' = ${t.id}::text and ${t.record}->>'projectId' = ${t.projectId}::text and ${t.record}->>'trialId' = ${t.trialId}::text and ${t.record}->>'judgeConfigurationId' = ${t.judgeConfigurationId}::text and ${t.record}->'version' = to_jsonb(${t.version})) is true`,
    ),
  ],
);
