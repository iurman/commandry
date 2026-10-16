import { z } from "zod";
import {
  foundationActorSchema,
  foundationAliasSchema,
  foundationEvidenceInputSchema,
  foundationMemoryContentSchema,
  foundationMemorySchema,
} from "./agent-foundation";

export const FOUNDATION_IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const FOUNDATION_IMPORT_MAX_RECORDS = 1000;
export const FOUNDATION_IMPORT_MAX_SOURCES = 1000;

const identity = foundationActorSchema.shape.projectId;
const digest = foundationMemorySchema.shape.contentDigest;
const datetime = foundationActorSchema.shape.expiresAt;
const sourceTier = z.enum(["public", "private", "client", "unknown"]);
const sourceCount = z.number().int().min(1).max(FOUNDATION_IMPORT_MAX_SOURCES);
const expectedMemory = foundationMemorySchema.pick({
  id: true,
  version: true,
  contentDigest: true,
  knowledgeItemId: true,
});

// UTF-16 strings must encode losslessly as UTF-8. Valid replacement characters,
// BOMs, NULs and source whitespace are preserved; no runtime requires Node APIs.
function wellFormedString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function wellFormedStrings(value: unknown): boolean {
  if (typeof value === "string") return wellFormedString(value);
  if (Array.isArray(value)) return value.every(wellFormedStrings);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).every(
      ([key, child]) => wellFormedString(key) && wellFormedStrings(child),
    );
  }
  return true;
}

const originalContent = z.string().refine(wellFormedString, "Invalid Unicode");
const source = z
  .strictObject({
    evidence: foundationEvidenceInputSchema,
    originalContent: originalContent.nullable(),
  })
  .refine(
    (value) =>
      (value.evidence.availability === "available") ===
      (value.originalContent !== null),
    "Original availability must match evidence availability",
  );
const record = z.strictObject({
  externalId: foundationAliasSchema.shape.externalId,
  knowledgeItemId: foundationMemorySchema.shape.knowledgeItemId,
  statement: foundationMemoryContentSchema.shape.statement,
  category: foundationMemoryContentSchema.shape.category,
  sourceTier,
  selected: z.boolean(),
  sources: z.array(source).min(1).max(FOUNDATION_IMPORT_MAX_SOURCES),
});

/** Structural HTTP validation only. Application services own canonical request
 * byte budgets, digests, source anchors, authorization and review freshness. */
export const mnemosyneImportEnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    projectId: identity,
    namespace: foundationAliasSchema.shape.namespace,
    records: z.array(record).max(FOUNDATION_IMPORT_MAX_RECORDS),
  })
  .refine(wellFormedStrings, "Invalid Unicode")
  .superRefine((envelope, context) => {
    if (
      new Set(envelope.records.map((row) => row.externalId)).size !==
      envelope.records.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["records"],
        message: "Duplicate external alias",
      });
    }
    if (
      envelope.records.reduce((count, row) => count + row.sources.length, 0) >
      FOUNDATION_IMPORT_MAX_SOURCES
    ) {
      context.addIssue({
        code: "custom",
        path: ["records"],
        message: "Aggregate source limit exceeded",
      });
    }
    for (const [index, row] of envelope.records.entries()) {
      for (const [ordinal, item] of row.sources.entries()) {
        if (item.evidence.projectId !== envelope.projectId) {
          context.addIssue({
            code: "custom",
            path: [
              "records",
              index,
              "sources",
              ordinal,
              "evidence",
              "projectId",
            ],
            message: "Evidence must remain in the import project",
          });
        }
      }
    }
  });

const recordPlan = z.strictObject({
  alias: foundationAliasSchema,
  knowledgeItemId: foundationMemorySchema.shape.knowledgeItemId,
  category: foundationMemoryContentSchema.shape.category,
  sourceTier,
  selected: z.boolean(),
  statement: foundationMemoryContentSchema.shape.statement.nullable(),
  selectionFingerprint: digest,
  sourceFingerprint: digest,
  reviewedSelection: z.boolean(),
  sources: z
    .array(foundationEvidenceInputSchema)
    .min(1)
    .max(FOUNDATION_IMPORT_MAX_SOURCES),
  originalsAvailable: z.boolean(),
  expectedExistingMemory: expectedMemory.nullable(),
  action: z.enum([
    "unselected",
    "disclosure_review_required",
    "unavailable_source",
    "new_proposal",
    "unchanged",
    "revision_requires_review",
    "preserve_owner_changes",
  ]),
  reason: z.enum([
    "not_selected",
    "exact_selection_review_missing",
    "original_unavailable",
    "reviewed_proposal_only",
    "same_import_and_owner_baseline",
    "import_changed",
    "baseline_unavailable",
    "knowledge_item_changed",
    "owner_content_changed",
  ]),
});

export const mnemosyneImportPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    projectId: identity,
    namespace: foundationAliasSchema.shape.namespace,
    sideEffects: z.literal("none"),
    existingCount: z.number().int().min(0).max(FOUNDATION_IMPORT_MAX_RECORDS),
    records: z.array(recordPlan).max(FOUNDATION_IMPORT_MAX_RECORDS),
  })
  .refine(wellFormedStrings, "Invalid Unicode")
  .superRefine((plan, context) => {
    if (
      new Set(plan.records.map((row) => row.alias.externalId)).size !==
      plan.records.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["records"],
        message: "Duplicate external alias",
      });
    }
    if (
      plan.records.reduce((count, row) => count + row.sources.length, 0) >
      FOUNDATION_IMPORT_MAX_SOURCES
    ) {
      context.addIssue({
        code: "custom",
        path: ["records"],
        message: "Aggregate source limit exceeded",
      });
    }
    for (const [index, row] of plan.records.entries()) {
      if (row.alias.namespace !== plan.namespace) {
        context.addIssue({
          code: "custom",
          path: ["records", index, "alias", "namespace"],
          message: "Alias must remain in the import namespace",
        });
      }
      for (const [ordinal, evidence] of row.sources.entries()) {
        if (evidence.projectId !== plan.projectId) {
          context.addIssue({
            code: "custom",
            path: ["records", index, "sources", ordinal, "projectId"],
            message: "Evidence must remain in the import project",
          });
        }
      }
    }
  });

const reviewedSelection = z.strictObject({
  externalId: foundationAliasSchema.shape.externalId,
  selectionFingerprint: digest,
  expectedExistingMemory: expectedMemory.nullable(),
});

/** A fingerprint's shape is not proof of review identity or owner authority. */
export const foundationSelectedImportInputSchema = z
  .strictObject({
    envelope: mnemosyneImportEnvelopeSchema,
    decision: z.literal("apply_proposed_unverified"),
    reviewedSelections: z
      .array(reviewedSelection)
      .min(1)
      .max(FOUNDATION_IMPORT_MAX_RECORDS),
  })
  .refine(wellFormedStrings, "Invalid Unicode")
  .superRefine((input, context) => {
    const selected = input.envelope.records.filter((row) => row.selected);
    const reviewed = new Set(
      input.reviewedSelections.map((selection) => selection.externalId),
    );
    if (
      selected.length === 0 ||
      reviewed.size !== input.reviewedSelections.length ||
      selected.length !== input.reviewedSelections.length ||
      selected.some((row) => !reviewed.has(row.externalId))
    ) {
      context.addIssue({
        code: "custom",
        path: ["reviewedSelections"],
        message: "Exactly one review is required for every selected record",
      });
    }
  });

const summary = z.strictObject({
  externalId: foundationAliasSchema.shape.externalId,
  sourceTier,
  sourceFingerprint: digest,
  selectionFingerprint: digest,
  action: z.enum(["created", "revised", "unchanged"]),
  memoryId: identity,
  version: foundationMemorySchema.shape.version,
  contentDigest: digest,
  importRevisionId: identity,
  sourceCount,
});
const receipt = z.strictObject({
  schemaVersion: z.literal(1),
  id: identity,
  projectId: identity,
  namespace: foundationAliasSchema.shape.namespace,
  appliedBy: foundationActorSchema.shape.principalId,
  recordedAt: datetime,
  records: z.array(summary).min(1).max(FOUNDATION_IMPORT_MAX_RECORDS),
});

export const foundationSelectedImportResultSchema = z
  .strictObject({
    record: receipt,
    replayed: z.boolean(),
    correlationId: identity,
  })
  .refine(wellFormedStrings, "Invalid Unicode")
  .refine(
    (result) => result.record.id === result.correlationId,
    "Receipt identity must match the correlation identity",
  );

export const foundationImportRevisionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: identity,
    projectId: identity,
    alias: foundationAliasSchema,
    memoryId: identity,
    memoryVersion: foundationMemorySchema.shape.version,
    sourceFingerprint: digest,
    selectionFingerprint: digest,
    memoryContentDigest: digest,
    sourceTier,
    sourceCount,
    reviewedBy: foundationActorSchema.shape.principalId,
    reviewedAt: datetime,
    recordedAt: datetime,
    environment: foundationActorSchema.shape.environment,
    correlationId: identity,
  })
  .refine(wellFormedStrings, "Invalid Unicode");

export const foundationImportOriginalSourceSchema = z
  .strictObject({
    revisionId: identity,
    projectId: identity,
    ordinal: z
      .number()
      .int()
      .min(0)
      .max(FOUNDATION_IMPORT_MAX_SOURCES - 1),
    evidenceId: identity,
    contentDigest: digest,
    originalContent,
  })
  .refine(wellFormedStrings, "Invalid Unicode");

// Derived output can exceed the external request budget. Ordered membership,
// source digests and truthful continuation are checked by the application/DB.
export const foundationImportOriginalPageSchema = z.strictObject({
  items: z
    .array(foundationImportOriginalSourceSchema)
    .max(FOUNDATION_IMPORT_MAX_SOURCES),
  nextOrdinal: z
    .number()
    .int()
    .min(1)
    .max(FOUNDATION_IMPORT_MAX_SOURCES)
    .nullable(),
});

export const foundationImportOriginalQuerySchema = z.strictObject({
  projectId: identity,
  revisionId: identity,
  fromOrdinal: z
    .number()
    .int()
    .min(0)
    .max(FOUNDATION_IMPORT_MAX_SOURCES)
    .default(0),
  limit: z
    .number()
    .int()
    .min(1)
    .max(FOUNDATION_IMPORT_MAX_SOURCES)
    .default(100),
});
