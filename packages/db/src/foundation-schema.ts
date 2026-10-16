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
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { FoundationMachineOperation } from "@commandry/contracts";
import { capture, knowledgeItem, project } from "./schema";

const at = (name: string) => timestamp(name, { withTimezone: true });
const projectId = () =>
  uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "restrict" });

export const foundationClient = pgTable(
  "foundation_client",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    name: text("name").notNull(),
    operations: jsonb("operations")
      .$type<FoundationMachineOperation[]>()
      .notNull(),
    environment: text("environment").notNull(),
    tokenDigest: text("token_digest").notNull().unique(),
    createdBy: text("created_by").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    revokedAt: at("revoked_at"),
  },
  (t) => [
    uniqueIndex("foundation_client_scope_idx").on(t.id, t.projectId),
    index("foundation_client_page_idx").on(t.projectId, t.environment, t.id),
    check(
      "foundation_client_digest_valid",
      sql`${t.tokenDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "foundation_client_name_valid",
      sql`length(trim(${t.name})) between 1 and 100`,
    ),
    check(
      "foundation_client_environment_valid",
      sql`${t.environment} in ('local','test','preview','production')`,
    ),
    check(
      "foundation_client_expiry_valid",
      sql`${t.expiresAt} > ${t.createdAt} and (${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt})`,
    ),
    check(
      "foundation_client_operations_valid",
      sql`jsonb_typeof(${t.operations}) = 'array' and jsonb_array_length(${t.operations}) between 1 and 8 and ${t.operations} <@ '["foundation.read","work.read","work.propose","evidence.record","memory.propose","memory.revise","configuration.record","evaluation.record"]'::jsonb`,
    ),
  ],
);

export const foundationEvidence = pgTable(
  "foundation_evidence",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersion: text("source_version"),
    contentDigest: text("content_digest").notNull(),
    locator: text("locator").notNull(),
    observedAt: text("observed_at"),
    availability: text("availability").notNull(),
    ingestedAt: at("ingested_at").notNull(),
    recordedBy: text("recorded_by").notNull(),
    verification: text("verification").notNull(),
    captureId: uuid("capture_id"),
    knowledgeItemId: uuid("knowledge_item_id"),
    knowledgeVersion: integer("knowledge_version"),
  },
  (t) => [
    uniqueIndex("foundation_evidence_scope_idx").on(t.id, t.projectId),
    index("foundation_evidence_page_idx").on(t.projectId, t.id),
    foreignKey({
      columns: [t.captureId, t.projectId],
      foreignColumns: [capture.id, capture.projectId],
      name: "foundation_evidence_capture_scope_fk",
    }),
    foreignKey({
      columns: [t.knowledgeItemId, t.projectId],
      foreignColumns: [knowledgeItem.id, knowledgeItem.projectId],
      name: "foundation_evidence_knowledge_scope_fk",
    }),
    check(
      "foundation_evidence_digest_valid",
      sql`${t.contentDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "foundation_evidence_source_valid",
      sql`(${t.sourceKind} = 'capture' and ${t.captureId} is not null and ${t.sourceId} = ${t.captureId}::text and ${t.knowledgeItemId} is null and ${t.knowledgeVersion} is null and ${t.sourceVersion} is null) or (${t.sourceKind} = 'knowledge_revision' and ${t.knowledgeItemId} is not null and ${t.sourceId} = ${t.knowledgeItemId}::text and ${t.knowledgeVersion} is not null and ${t.sourceVersion} is not null and ${t.knowledgeVersion} > 0 and ${t.sourceVersion} = ${t.knowledgeVersion}::text and ${t.captureId} is null) or (${t.sourceKind} in ('artifact','external') and ${t.captureId} is null and ${t.knowledgeItemId} is null and ${t.knowledgeVersion} is null)`,
    ),
    check(
      "foundation_evidence_availability_valid",
      sql`${t.availability} in ('available','unavailable')`,
    ),
    check(
      "foundation_evidence_verification_valid",
      sql`${t.verification} in ('unverified','source_matched','independently_verified')`,
    ),
  ],
);

// The head is a projection. Every content version and authority decision is retained below.
export const foundationMemory = pgTable(
  "foundation_memory",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    knowledgeItemId: uuid("knowledge_item_id").notNull(),
    currentVersion: integer("current_version").notNull(),
    lifecycle: text("lifecycle").notNull(),
    verification: text("verification").notNull(),
  },
  (t) => [
    uniqueIndex("foundation_memory_scope_idx").on(t.id, t.projectId),
    index("foundation_memory_knowledge_idx").on(
      t.projectId,
      t.knowledgeItemId,
      t.id,
    ),
    foreignKey({
      columns: [t.knowledgeItemId, t.projectId],
      foreignColumns: [knowledgeItem.id, knowledgeItem.projectId],
      name: "foundation_memory_knowledge_scope_fk",
    }),
    check("foundation_memory_version_valid", sql`${t.currentVersion} > 0`),
    check(
      "foundation_memory_lifecycle_valid",
      sql`${t.lifecycle} in ('proposed','accepted','rejected','superseded')`,
    ),
    check(
      "foundation_memory_verification_valid",
      sql`${t.verification} in ('unverified','source_matched','independently_verified')`,
    ),
  ],
);

export const foundationMemoryRevision = pgTable(
  "foundation_memory_revision",
  {
    creationTransaction: text("creation_transaction")
      .notNull()
      .default(sql`pg_current_xact_id()::text`),
    memoryId: uuid("memory_id").notNull(),
    projectId: projectId(),
    version: integer("version").notNull(),
    contentDigest: text("content_digest").notNull(),
    statement: text("statement").notNull(),
    category: text("category").notNull(),
    relationType: text("relation_type"),
    recordedBy: text("recorded_by").notNull(),
    recordedAt: at("recorded_at").notNull(),
    anchorEvidenceId: uuid("anchor_evidence_id").notNull(),
    anchorKnowledgeVersion: integer("anchor_knowledge_version").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.memoryId, t.version, t.projectId] }),
    foreignKey({
      columns: [t.memoryId, t.projectId],
      foreignColumns: [foundationMemory.id, foundationMemory.projectId],
      name: "foundation_revision_memory_scope_fk",
    }),
    foreignKey({
      columns: [t.anchorEvidenceId, t.projectId],
      foreignColumns: [foundationEvidence.id, foundationEvidence.projectId],
      name: "foundation_revision_anchor_scope_fk",
    }),
    check(
      "foundation_revision_version_valid",
      sql`${t.version} > 0 and ${t.anchorKnowledgeVersion} > 0`,
    ),
    check(
      "foundation_revision_digest_valid",
      sql`${t.contentDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "foundation_revision_statement_valid",
      sql`length(trim(${t.statement})) between 1 and 20000`,
    ),
    check(
      "foundation_revision_category_valid",
      sql`${t.category} in ('finding','preference','instruction','decision')`,
    ),
    check(
      "foundation_revision_relation_valid",
      sql`${t.relationType} is null or ${t.relationType} in ('contradicts','supersedes')`,
    ),
  ],
);

export const foundationMemoryEvidence = pgTable(
  "foundation_memory_evidence",
  {
    memoryId: uuid("memory_id").notNull(),
    version: integer("version").notNull(),
    projectId: projectId(),
    evidenceId: uuid("evidence_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.memoryId, t.version, t.evidenceId] }),
    uniqueIndex("foundation_memory_evidence_order_idx").on(
      t.memoryId,
      t.version,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.memoryId, t.version, t.projectId],
      foreignColumns: [
        foundationMemoryRevision.memoryId,
        foundationMemoryRevision.version,
        foundationMemoryRevision.projectId,
      ],
      name: "foundation_memory_evidence_revision_fk",
    }),
    foreignKey({
      columns: [t.evidenceId, t.projectId],
      foreignColumns: [foundationEvidence.id, foundationEvidence.projectId],
      name: "foundation_memory_evidence_scope_fk",
    }),
    check("foundation_memory_evidence_order_valid", sql`${t.ordinal} >= 0`),
  ],
);

export const foundationMemoryRelation = pgTable(
  "foundation_memory_relation",
  {
    memoryId: uuid("memory_id").notNull(),
    version: integer("version").notNull(),
    projectId: projectId(),
    relatedMemoryId: uuid("related_memory_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.memoryId, t.version, t.relatedMemoryId] }),
    uniqueIndex("foundation_memory_relation_order_idx").on(
      t.memoryId,
      t.version,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.memoryId, t.version, t.projectId],
      foreignColumns: [
        foundationMemoryRevision.memoryId,
        foundationMemoryRevision.version,
        foundationMemoryRevision.projectId,
      ],
      name: "foundation_memory_relation_revision_fk",
    }),
    foreignKey({
      columns: [t.relatedMemoryId, t.projectId],
      foreignColumns: [foundationMemory.id, foundationMemory.projectId],
      name: "foundation_memory_relation_scope_fk",
    }),
    check(
      "foundation_memory_relation_order_valid",
      sql`${t.ordinal} >= 0 and ${t.memoryId} <> ${t.relatedMemoryId}`,
    ),
  ],
);

export const foundationMemoryAlias = pgTable(
  "foundation_memory_alias",
  {
    projectId: projectId(),
    namespace: text("namespace").notNull(),
    externalId: text("external_id").notNull(),
    memoryId: uuid("memory_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.namespace, t.externalId] }),
    uniqueIndex("foundation_alias_memory_scope_idx").on(
      t.projectId,
      t.namespace,
      t.externalId,
      t.memoryId,
    ),
    foreignKey({
      columns: [t.memoryId, t.projectId],
      foreignColumns: [foundationMemory.id, foundationMemory.projectId],
      name: "foundation_alias_memory_scope_fk",
    }),
    check(
      "foundation_alias_valid",
      sql`length(trim(${t.namespace})) between 1 and 100 and length(trim(${t.externalId})) between 1 and 500`,
    ),
  ],
);

export const foundationMemoryReview = pgTable(
  "foundation_memory_review",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    memoryId: uuid("memory_id").notNull(),
    version: integer("version").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason").notNull(),
    actor: text("actor").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.memoryId, t.version, t.projectId],
      foreignColumns: [
        foundationMemoryRevision.memoryId,
        foundationMemoryRevision.version,
        foundationMemoryRevision.projectId,
      ],
      name: "foundation_review_revision_fk",
    }),
    check(
      "foundation_review_decision_valid",
      sql`${t.decision} in ('accepted','rejected','superseded')`,
    ),
    check(
      "foundation_review_reason_valid",
      sql`length(trim(${t.reason})) between 1 and 4000`,
    ),
  ],
);

export const foundationMemoryVerification = pgTable(
  "foundation_memory_verification",
  {
    creationTransaction: text("creation_transaction")
      .notNull()
      .default(sql`pg_current_xact_id()::text`),
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    memoryId: uuid("memory_id").notNull(),
    version: integer("version").notNull(),
    verification: text("verification").notNull(),
    reason: text("reason").notNull(),
    actor: text("actor").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("foundation_verification_scope_idx").on(t.id, t.projectId),
    foreignKey({
      columns: [t.memoryId, t.version, t.projectId],
      foreignColumns: [
        foundationMemoryRevision.memoryId,
        foundationMemoryRevision.version,
        foundationMemoryRevision.projectId,
      ],
      name: "foundation_verification_revision_fk",
    }),
    check(
      "foundation_verification_state_valid",
      sql`${t.verification} in ('source_matched','independently_verified')`,
    ),
    check(
      "foundation_verification_reason_valid",
      sql`length(trim(${t.reason})) between 1 and 4000`,
    ),
  ],
);

export const foundationVerificationEvidence = pgTable(
  "foundation_verification_evidence",
  {
    verificationId: uuid("verification_id").notNull(),
    projectId: projectId(),
    evidenceId: uuid("evidence_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.verificationId, t.evidenceId] }),
    uniqueIndex("foundation_verification_evidence_order_idx").on(
      t.verificationId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.verificationId, t.projectId],
      foreignColumns: [
        foundationMemoryVerification.id,
        foundationMemoryVerification.projectId,
      ],
      name: "foundation_verification_evidence_parent_fk",
    }),
    foreignKey({
      columns: [t.evidenceId, t.projectId],
      foreignColumns: [foundationEvidence.id, foundationEvidence.projectId],
      name: "foundation_verification_evidence_scope_fk",
    }),
    check(
      "foundation_verification_evidence_order_valid",
      sql`${t.ordinal} >= 0`,
    ),
  ],
);

export const foundationInstructionApproval = pgTable(
  "foundation_instruction_approval",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    memoryId: uuid("memory_id").notNull(),
    version: integer("version").notNull(),
    contentDigest: text("content_digest").notNull(),
    disclosureProjectId: uuid("disclosure_project_id").notNull(),
    approvedAt: at("approved_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    approvedBy: text("approved_by").notNull(),
    revokedAt: at("revoked_at"),
  },
  (t) => [
    index("foundation_approval_memory_idx").on(
      t.projectId,
      t.memoryId,
      t.version,
    ),
    foreignKey({
      columns: [t.memoryId, t.version, t.projectId],
      foreignColumns: [
        foundationMemoryRevision.memoryId,
        foundationMemoryRevision.version,
        foundationMemoryRevision.projectId,
      ],
      name: "foundation_approval_revision_fk",
    }),
    check(
      "foundation_approval_digest_valid",
      sql`${t.contentDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "foundation_approval_disclosure_valid",
      sql`${t.disclosureProjectId} = ${t.projectId}`,
    ),
    check(
      "foundation_approval_expiry_valid",
      sql`${t.expiresAt} > ${t.approvedAt} and (${t.revokedAt} is null or ${t.revokedAt} >= ${t.approvedAt})`,
    ),
  ],
);

export const foundationConfiguration = pgTable(
  "foundation_configuration",
  {
    creationTransaction: text("creation_transaction")
      .notNull()
      .default(sql`pg_current_xact_id()::text`),
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    contentDigest: text("content_digest").notNull(),
    sourceCommit: text("source_commit"),
    recordedAt: at("recorded_at").notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => [
    uniqueIndex("foundation_configuration_scope_idx").on(t.id, t.projectId),
    index("foundation_configuration_page_idx").on(t.projectId, t.id),
    check(
      "foundation_configuration_kind_valid",
      sql`${t.kind} in ('prompt','skill','hook','loop','runtime','model','settings')`,
    ),
    check(
      "foundation_configuration_digest_valid",
      sql`${t.contentDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "foundation_configuration_content_valid",
      sql`length(${t.content}) <= 1000000`,
    ),
  ],
);

export const foundationConfigurationParent = pgTable(
  "foundation_configuration_parent",
  {
    configurationId: uuid("configuration_id").notNull(),
    parentId: uuid("parent_id").notNull(),
    projectId: projectId(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.configurationId, t.parentId] }),
    uniqueIndex("foundation_configuration_parent_order_idx").on(
      t.configurationId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.configurationId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_configuration_child_scope_fk",
    }),
    foreignKey({
      columns: [t.parentId, t.projectId],
      foreignColumns: [
        foundationConfiguration.id,
        foundationConfiguration.projectId,
      ],
      name: "foundation_configuration_parent_scope_fk",
    }),
    check(
      "foundation_configuration_parent_valid",
      sql`${t.ordinal} >= 0 and ${t.configurationId} <> ${t.parentId}`,
    ),
  ],
);

export const foundationIdempotency = pgTable(
  "foundation_idempotency",
  {
    projectId: projectId(),
    environment: text("environment").notNull(),
    principalId: text("principal_id").notNull(),
    operation: text("operation").notNull(),
    keyDigest: text("key_digest").notNull(),
    requestDigest: text("request_digest").notNull(),
    resultDigest: text("result_digest").notNull(),
    result: jsonb("result").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [
        t.projectId,
        t.environment,
        t.principalId,
        t.operation,
        t.keyDigest,
      ],
    }),
    check(
      "foundation_idempotency_digests_valid",
      sql`${t.keyDigest} ~ '^[a-f0-9]{64}$' and ${t.requestDigest} ~ '^[a-f0-9]{64}$' and ${t.resultDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "foundation_idempotency_environment_valid",
      sql`${t.environment} in ('local','test','preview','production')`,
    ),
  ],
);

export const foundationAudit = pgTable(
  "foundation_audit",
  {
    id: uuid("id").primaryKey(),
    projectId: projectId(),
    environment: text("environment").notNull(),
    principalId: text("principal_id").notNull(),
    clientId: uuid("client_id").references(() => foundationClient.id, {
      onDelete: "restrict",
    }),
    operation: text("operation").notNull(),
    decision: text("decision").notNull(),
    code: text("code").notNull(),
    targetId: uuid("target_id"),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("foundation_audit_page_idx").on(t.projectId, t.id),
    check(
      "foundation_audit_decision_valid",
      sql`${t.decision} in ('allowed','denied')`,
    ),
    check(
      "foundation_audit_environment_valid",
      sql`${t.environment} in ('local','test','preview','production')`,
    ),
  ],
);
