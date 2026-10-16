import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  capture,
  captureTriageDecision,
  captureTriageSuggestion,
  knowledgeItem,
} from "./schema";
import {
  foundationEvidence,
  foundationMemoryRevision,
} from "./foundation-schema";

// Only scope and immutable provenance live here. Canonical records own content.
export const foundationFindingProposal = pgTable(
  "foundation_finding_proposal",
  {
    proposalId: uuid("proposal_id").primaryKey(),
    captureId: uuid("capture_id").notNull(),
    projectId: uuid("project_id").notNull(),
    environment: text("environment").notNull(),
    creationTransaction: text("creation_transaction")
      .notNull()
      .default(sql`pg_current_xact_id()::text`),
  },
  (t) => [
    uniqueIndex("foundation_finding_proposal_scope_idx").on(
      t.proposalId,
      t.projectId,
    ),
    uniqueIndex("foundation_finding_proposal_capture_idx").on(t.captureId),
    foreignKey({
      columns: [t.captureId, t.projectId],
      foreignColumns: [capture.id, capture.projectId],
      name: "foundation_finding_proposal_capture_fk",
    }),
    foreignKey({
      columns: [t.proposalId, t.captureId],
      foreignColumns: [
        captureTriageSuggestion.id,
        captureTriageSuggestion.captureId,
      ],
      name: "foundation_finding_proposal_suggestion_fk",
    }),
  ],
);

export const foundationFindingCitation = pgTable(
  "foundation_finding_citation",
  {
    proposalId: uuid("proposal_id").notNull(),
    projectId: uuid("project_id").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.proposalId, t.evidenceId] }),
    uniqueIndex("foundation_finding_citation_order_idx").on(
      t.proposalId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.proposalId, t.projectId],
      foreignColumns: [
        foundationFindingProposal.proposalId,
        foundationFindingProposal.projectId,
      ],
      name: "foundation_finding_citation_proposal_fk",
    }),
    foreignKey({
      columns: [t.evidenceId, t.projectId],
      foreignColumns: [foundationEvidence.id, foundationEvidence.projectId],
      name: "foundation_finding_citation_evidence_fk",
    }),
    check(
      "foundation_finding_citation_order_valid",
      sql`${t.ordinal} between 0 and 99`,
    ),
  ],
);

export const foundationFindingFiling = pgTable(
  "foundation_finding_filing",
  {
    proposalId: uuid("proposal_id").primaryKey(),
    projectId: uuid("project_id").notNull(),
    captureId: uuid("capture_id").notNull(),
    decisionId: uuid("decision_id").notNull(),
    knowledgeId: uuid("knowledge_id").notNull(),
    memoryId: uuid("memory_id").notNull(),
    memoryVersion: integer("memory_version").notNull(),
    anchorEvidenceId: uuid("anchor_evidence_id").notNull(),
    creationTransaction: text("creation_transaction")
      .notNull()
      .default(sql`pg_current_xact_id()::text`),
  },
  (t) => [
    uniqueIndex("foundation_finding_filing_decision_idx").on(t.decisionId),
    uniqueIndex("foundation_finding_filing_knowledge_idx").on(t.knowledgeId),
    uniqueIndex("foundation_finding_filing_memory_idx").on(t.memoryId),
    uniqueIndex("foundation_finding_filing_anchor_idx").on(t.anchorEvidenceId),
    foreignKey({
      columns: [t.proposalId, t.projectId],
      foreignColumns: [
        foundationFindingProposal.proposalId,
        foundationFindingProposal.projectId,
      ],
      name: "foundation_finding_filing_proposal_fk",
    }),
    foreignKey({
      columns: [t.captureId, t.projectId],
      foreignColumns: [capture.id, capture.projectId],
      name: "foundation_finding_filing_capture_fk",
    }),
    foreignKey({
      columns: [t.decisionId, t.captureId],
      foreignColumns: [
        captureTriageDecision.id,
        captureTriageDecision.captureId,
      ],
      name: "foundation_finding_filing_decision_fk",
    }),
    foreignKey({
      columns: [t.knowledgeId, t.projectId],
      foreignColumns: [knowledgeItem.id, knowledgeItem.projectId],
      name: "foundation_finding_filing_knowledge_fk",
    }),
    foreignKey({
      columns: [t.memoryId, t.memoryVersion, t.projectId],
      foreignColumns: [
        foundationMemoryRevision.memoryId,
        foundationMemoryRevision.version,
        foundationMemoryRevision.projectId,
      ],
      name: "foundation_finding_filing_memory_fk",
    }),
    foreignKey({
      columns: [t.anchorEvidenceId, t.projectId],
      foreignColumns: [foundationEvidence.id, foundationEvidence.projectId],
      name: "foundation_finding_filing_evidence_fk",
    }),
    check(
      "foundation_finding_filing_version_valid",
      sql`${t.memoryVersion} = 1`,
    ),
  ],
);
