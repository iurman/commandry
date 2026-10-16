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
  FoundationImprovementDecision,
  FoundationImprovementProposal,
} from "@commandry/contracts";
import { project } from "./schema";
import { foundationConfiguration } from "./foundation-schema";
import {
  foundationAssessment,
  foundationEvaluationDefinition,
} from "./foundation-evaluation-schema";

const projectId = () =>
  uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "restrict" });

// SQL additionally overwrites creationTransaction and installs immutable,
// transaction-closed membership, exact deferred population and decision CAS guards.
export const foundationImprovementProposal = pgTable(
  "foundation_improvement_proposal",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    environment: text("environment").notNull(),
    definitionId: uuid("definition_id").notNull(),
    candidateConfigurationId: uuid("candidate_configuration_id").notNull(),
    baselineConfigurationId: uuid("baseline_configuration_id").notNull(),
    record: jsonb("record").$type<FoundationImprovementProposal>().notNull(),
    creationTransaction: text("creation_transaction")
      .notNull()
      .default(sql`pg_current_xact_id()::text`),
  },
  (t) => [
    uniqueIndex("foundation_improvement_proposal_scope_idx").on(
      t.id,
      t.projectId,
      t.environment,
    ),
    uniqueIndex("foundation_improvement_proposal_project_idx").on(
      t.id,
      t.projectId,
    ),
    index("foundation_improvement_proposal_page_idx").on(
      t.projectId,
      t.environment,
      t.id,
    ),
    foreignKey({
      columns: [t.definitionId, t.projectId],
      foreignColumns: [
        foundationEvaluationDefinition.id,
        foundationEvaluationDefinition.projectId,
      ],
      name: "foundation_improvement_definition_fk",
    }),
    foreignKey({
      columns: [t.candidateConfigurationId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_improvement_candidate_fk",
    }),
    foreignKey({
      columns: [t.baselineConfigurationId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_improvement_baseline_fk",
    }),
    check(
      "foundation_improvement_proposal_record_valid",
      sql`(public.commandry_improvement_proposal_valid(${t.record}) and ${t.record}->>'id' = ${t.id}::text and ${t.record}->>'projectId' = ${t.projectId}::text and ${t.record}->>'environment' = ${t.environment} and ${t.record}->>'definitionId' = ${t.definitionId}::text and ${t.record}->>'candidateConfigurationId' = ${t.candidateConfigurationId}::text and ${t.record}->>'baselineConfigurationId' = ${t.baselineConfigurationId}::text) is true`,
    ),
  ],
);

export const foundationImprovementConditionConfiguration = pgTable(
  "foundation_improvement_condition_configuration",
  {
    proposalId: uuid("proposal_id").notNull(),
    projectId: projectId(),
    conditionOrdinal: integer("condition_ordinal").notNull(),
    condition: text("condition").notNull(),
    role: text("role").notNull(),
    configurationId: uuid("configuration_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.proposalId, t.conditionOrdinal, t.ordinal] }),
    uniqueIndex("foundation_improvement_condition_member_idx").on(
      t.proposalId,
      t.condition,
      t.configurationId,
    ),
    foreignKey({
      columns: [t.proposalId, t.projectId],
      foreignColumns: [
        foundationImprovementProposal.id,
        foundationImprovementProposal.projectId,
      ],
      name: "foundation_improvement_condition_parent_fk",
    }),
    foreignKey({
      columns: [t.configurationId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_improvement_condition_scope_fk",
    }),
    check(
      "foundation_improvement_condition_order_valid",
      sql`${t.conditionOrdinal} between 0 and 1 and ${t.ordinal} >= 0 and ${t.role} in ('baseline','candidate')`,
    ),
  ],
);

export const foundationImprovementJudgeConfiguration = pgTable(
  "foundation_improvement_judge_configuration",
  {
    proposalId: uuid("proposal_id").notNull(),
    projectId: projectId(),
    configurationId: uuid("configuration_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.proposalId, t.configurationId] }),
    uniqueIndex("foundation_improvement_judge_order_idx").on(
      t.proposalId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.proposalId, t.projectId],
      foreignColumns: [
        foundationImprovementProposal.id,
        foundationImprovementProposal.projectId,
      ],
      name: "foundation_improvement_judge_parent_fk",
    }),
    foreignKey({
      columns: [t.configurationId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_improvement_judge_scope_fk",
    }),
    check("foundation_improvement_judge_order_valid", sql`${t.ordinal} >= 0`),
  ],
);

export const foundationImprovementMotivation = pgTable(
  "foundation_improvement_motivation",
  {
    proposalId: uuid("proposal_id").notNull(),
    projectId: projectId(),
    assessmentId: uuid("assessment_id").notNull(),
    assessmentVersion: integer("assessment_version").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.proposalId, t.assessmentId] }),
    uniqueIndex("foundation_improvement_motivation_order_idx").on(
      t.proposalId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.proposalId, t.projectId],
      foreignColumns: [
        foundationImprovementProposal.id,
        foundationImprovementProposal.projectId,
      ],
      name: "foundation_improvement_motivation_parent_fk",
    }),
    foreignKey({
      columns: [t.assessmentId, t.assessmentVersion, t.projectId],
      foreignColumns: [
        foundationAssessment.id,
        foundationAssessment.version,
        foundationAssessment.projectId,
      ],
      name: "foundation_improvement_motivation_version_scope_fk",
    }),
    check(
      "foundation_improvement_motivation_order_valid",
      sql`${t.ordinal} >= 0 and ${t.assessmentVersion} > 0`,
    ),
  ],
);

export const foundationImprovementDecision = pgTable(
  "foundation_improvement_decision",
  {
    id: uuid("id").primaryKey(),
    proposalId: uuid("proposal_id").notNull(),
    projectId: projectId(),
    environment: text("environment").notNull(),
    version: integer("version").notNull(),
    record: jsonb("record").$type<FoundationImprovementDecision>().notNull(),
  },
  (t) => [
    uniqueIndex("foundation_improvement_decision_version_idx").on(
      t.proposalId,
      t.version,
    ),
    index("foundation_improvement_decision_scope_idx").on(
      t.projectId,
      t.environment,
      t.proposalId,
      t.version,
    ),
    foreignKey({
      columns: [t.proposalId, t.projectId, t.environment],
      foreignColumns: [
        foundationImprovementProposal.id,
        foundationImprovementProposal.projectId,
        foundationImprovementProposal.environment,
      ],
      name: "foundation_improvement_decision_parent_fk",
    }),
    check(
      "foundation_improvement_decision_record_valid",
      sql`(public.commandry_improvement_decision_valid(${t.record}) and ${t.record}->>'id' = ${t.id}::text and ${t.record}->>'projectId' = ${t.projectId}::text and ${t.record}->>'proposalId' = ${t.proposalId}::text and ${t.record}->'version' = to_jsonb(${t.version}) and ${t.version} > 0) is true`,
    ),
  ],
);
