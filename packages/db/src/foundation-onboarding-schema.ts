import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  FoundationOnboardingDecision,
  FoundationOnboardingOutcome,
  FoundationOnboardingProposal,
} from "@commandry/contracts";
import { foundationClient, foundationEvidence } from "./foundation-schema";
import { project, projectResourceLink, resource, user } from "./schema";

const identityText = customType<{ data: string }>({
  dataType: () => 'text COLLATE "C"',
});
const creationTransaction = () =>
  text("creation_transaction")
    .notNull()
    .default(sql`pg_current_xact_id()::text`);
export const resourceIdentityClaim = pgTable(
  "resource_identity_claim",
  {
    namespace: identityText("namespace").notNull(),
    authority: identityText("authority").notNull(),
    externalId: identityText("external_id").notNull(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    assurance: text("assurance").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    recordedBy: text("recorded_by").notNull(),
    recordedAt: text("recorded_at").notNull(),
    creationTransaction: creationTransaction(),
  },
  (t) => [
    check(
      "foundation_onboarding_identity_valid",
      sql.raw(
        "(foundation_onboarding_json_valid(jsonb_build_object('namespace',namespace,'authority',authority,'externalId',external_id,'assurance',assurance),foundation_onboarding_shape('identity')) AND recorded_by='user:'||owner_user_id AND foundation_onboarding_json_valid(to_jsonb(recorded_at),'\"date\"'::jsonb)) IS TRUE",
      ),
    ),
    uniqueIndex("foundation_onboarding_identity_tuple_idx").on(
      t.namespace,
      t.authority,
      t.externalId,
    ),
    uniqueIndex("foundation_onboarding_identity_resource_idx").on(t.resourceId),
  ],
);
export const foundationOnboardingProposal = pgTable(
  "foundation_onboarding_proposal",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    environment: text("environment").notNull(),
    clientId: uuid("client_id").notNull(),
    version: integer("version").notNull(),
    record: jsonb("record").$type<FoundationOnboardingProposal>().notNull(),
    recordedAt: text("recorded_at").notNull(),
    creationTransaction: creationTransaction(),
  },
  (t) => [
    check(
      "foundation_onboarding_proposal_valid",
      sql.raw(
        "(foundation_onboarding_record_valid('proposal',record) AND record->>'id'=id::text AND record->>'projectId'=project_id::text AND record->>'environment'=environment AND record->>'recordedBy'='foundation-client:'||client_id::text AND record->>'recordedAt'=recorded_at AND version=1 AND record->>'version'='1') IS TRUE",
      ),
    ),
    uniqueIndex("foundation_onboarding_proposal_scope_idx").on(
      t.id,
      t.projectId,
      t.environment,
    ),
    uniqueIndex("foundation_onboarding_proposal_project_idx").on(
      t.id,
      t.projectId,
    ),
    index("foundation_onboarding_proposal_page_idx").on(
      t.projectId,
      t.environment,
      t.id,
    ),
    foreignKey({
      name: "foundation_onboarding_producer_fk",
      columns: [t.clientId, t.projectId],
      foreignColumns: [foundationClient.id, foundationClient.projectId],
    }),
  ],
);
export const foundationOnboardingProposalEvidence = pgTable(
  "foundation_onboarding_proposal_evidence",
  {
    proposalId: uuid("proposal_id").notNull(),
    projectId: uuid("project_id").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    creationTransaction: creationTransaction(),
  },
  (t) => [
    check(
      "foundation_onboarding_member_ordinal_valid",
      sql.raw("ordinal BETWEEN 0 AND 99"),
    ),
    uniqueIndex("foundation_onboarding_member_ordinal_idx").on(
      t.proposalId,
      t.ordinal,
    ),
    uniqueIndex("foundation_onboarding_member_evidence_idx").on(
      t.proposalId,
      t.evidenceId,
    ),
    foreignKey({
      name: "foundation_onboarding_member_proposal_fk",
      columns: [t.proposalId, t.projectId],
      foreignColumns: [
        foundationOnboardingProposal.id,
        foundationOnboardingProposal.projectId,
      ],
    }),
    foreignKey({
      name: "foundation_onboarding_member_evidence_fk",
      columns: [t.evidenceId, t.projectId],
      foreignColumns: [foundationEvidence.id, foundationEvidence.projectId],
    }),
  ],
);
export const foundationOnboardingDecision = pgTable(
  "foundation_onboarding_decision",
  {
    id: uuid("id").primaryKey(),
    proposalId: uuid("proposal_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environment: text("environment").notNull(),
    version: integer("version").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    record: jsonb("record").$type<FoundationOnboardingDecision>().notNull(),
    creationTransaction: creationTransaction(),
  },
  (t) => [
    check(
      "foundation_onboarding_decision_valid",
      sql.raw(
        "(foundation_onboarding_record_valid('decision',record) AND record->>'id'=id::text AND record->>'projectId'=project_id::text AND record->>'proposalId'=proposal_id::text AND (record->>'version')::integer=version AND record->>'recordedBy'='user:'||owner_user_id) IS TRUE",
      ),
    ),
    uniqueIndex("foundation_onboarding_decision_version_idx").on(
      t.proposalId,
      t.version,
    ),
    uniqueIndex("foundation_onboarding_decision_scope_idx").on(
      t.id,
      t.projectId,
      t.version,
    ),
    foreignKey({
      name: "foundation_onboarding_decision_proposal_fk",
      columns: [t.proposalId, t.projectId, t.environment],
      foreignColumns: [
        foundationOnboardingProposal.id,
        foundationOnboardingProposal.projectId,
        foundationOnboardingProposal.environment,
      ],
    }),
  ],
);
export const foundationOnboardingOutcome = pgTable(
  "foundation_onboarding_outcome",
  {
    id: uuid("id").primaryKey(),
    proposalId: uuid("proposal_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environment: text("environment").notNull(),
    decisionId: uuid("decision_id").notNull(),
    decisionVersion: integer("decision_version").notNull(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "restrict" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => projectResourceLink.id, { onDelete: "restrict" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    record: jsonb("record").$type<FoundationOnboardingOutcome>().notNull(),
    creationTransaction: creationTransaction(),
  },
  (t) => [
    check(
      "foundation_onboarding_outcome_valid",
      sql.raw(
        "(foundation_onboarding_record_valid('outcome',record) AND record->>'id'=id::text AND record->>'projectId'=project_id::text AND record->>'proposalId'=proposal_id::text AND record->>'decisionId'=decision_id::text AND (record->>'decisionVersion')::integer=decision_version AND record->'resource'->>'id'=resource_id::text AND record->'link'->>'id'=link_id::text AND record->>'recordedBy'='user:'||owner_user_id) IS TRUE",
      ),
    ),
    uniqueIndex("foundation_onboarding_outcome_proposal_idx").on(t.proposalId),
    foreignKey({
      name: "foundation_onboarding_outcome_proposal_fk",
      columns: [t.proposalId, t.projectId, t.environment],
      foreignColumns: [
        foundationOnboardingProposal.id,
        foundationOnboardingProposal.projectId,
        foundationOnboardingProposal.environment,
      ],
    }),
    foreignKey({
      name: "foundation_onboarding_outcome_decision_fk",
      columns: [t.decisionId, t.projectId, t.decisionVersion],
      foreignColumns: [
        foundationOnboardingDecision.id,
        foundationOnboardingDecision.projectId,
        foundationOnboardingDecision.version,
      ],
    }),
  ],
);
