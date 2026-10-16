import { sql } from "drizzle-orm";
import {
  check,
  customType,
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
import type { FoundationImportRevision } from "@commandry/application";
import { FoundationError } from "@commandry/domain";
import { project } from "./schema";
import {
  foundationEvidence,
  foundationMemoryAlias,
  foundationMemoryRevision,
} from "./foundation-schema";

function invalidBytes(): never {
  throw new FoundationError("INVALID_REFERENCE", "Import original is invalid");
}

// Byte storage retains NUL, CRLF, empty strings and the initial Unicode BOM.
// Fatal decoding rejects corrupted direct-SQL UTF8 rather than replacing bytes.
const originalUtf8 = customType<{ data: string; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver(value) {
    const bytes = Buffer.from(value, "utf8");
    if (bytes.toString("utf8") !== value) invalidBytes();
    return bytes;
  },
  fromDriver(value) {
    try {
      if (!Buffer.isBuffer(value)) invalidBytes();
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        value,
      );
    } catch {
      return invalidBytes();
    }
  },
});

// Migration obligations: immutable UPDATE/DELETE, nonforgeable creation transaction,
// child insertion only in that parent creation transaction, and deferred complete
// contiguous membership matching exact canonical revision evidence/digest order.
// Canonical foundation_memory_evidence must also reject later insertion once its
// exact revision has an import baseline, including after SET CONSTRAINTS IMMEDIATE.
// Guards must fix search_path and qualify permanent relations against temp shadowing.
export const foundationImportRevision = pgTable(
  "foundation_import_revision",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    namespace: text("namespace").notNull(),
    externalId: text("external_id").notNull(),
    memoryId: uuid("memory_id").notNull(),
    memoryVersion: integer("memory_version").notNull(),
    sourceCount: integer("source_count").notNull(),
    environment: text("environment").notNull(),
    record: jsonb("record").$type<FoundationImportRevision>().notNull(),
    creationTransaction: text("creation_transaction")
      .notNull()
      .default(sql`pg_current_xact_id()::text`),
  },
  (t) => [
    uniqueIndex("foundation_import_revision_scope_idx").on(t.id, t.projectId),
    uniqueIndex("foundation_import_memory_version_idx").on(
      t.memoryId,
      t.memoryVersion,
      t.projectId,
    ),
    index("foundation_import_alias_lookup_idx").on(
      t.projectId,
      t.environment,
      t.namespace,
      t.externalId,
      t.memoryVersion,
      t.id,
    ),
    foreignKey({
      columns: [t.memoryId, t.memoryVersion, t.projectId],
      foreignColumns: [
        foundationMemoryRevision.memoryId,
        foundationMemoryRevision.version,
        foundationMemoryRevision.projectId,
      ],
      name: "foundation_import_memory_revision_fk",
    }),
    // Root composes the matching unique index on the canonical alias table.
    foreignKey({
      columns: [t.projectId, t.namespace, t.externalId, t.memoryId],
      foreignColumns: [
        foundationMemoryAlias.projectId,
        foundationMemoryAlias.namespace,
        foundationMemoryAlias.externalId,
        foundationMemoryAlias.memoryId,
      ],
      name: "foundation_import_alias_scope_fk",
    }),
    check("foundation_import_version_valid", sql`${t.memoryVersion} > 0`),
    check(
      "foundation_import_count_valid",
      sql`${t.sourceCount} between 1 and 1000`,
    ),
    check(
      "foundation_import_alias_valid",
      sql`length(trim(${t.namespace})) between 1 and 100 and length(trim(${t.externalId})) between 1 and 500`,
    ),
    check(
      "foundation_import_environment_valid",
      sql`${t.environment} in ('local','test','preview','production')`,
    ),
    check(
      "foundation_import_record_valid",
      sql`(jsonb_typeof(${t.record}) = 'object' and ${t.record}->'schemaVersion' = '1'::jsonb and ${t.record}->>'id' = ${t.id}::text and ${t.record}->>'projectId' = ${t.projectId}::text and ${t.record}->'alias' = jsonb_build_object('namespace', ${t.namespace}, 'externalId', ${t.externalId}) and ${t.record}->>'memoryId' = ${t.memoryId}::text and ${t.record}->'memoryVersion' = to_jsonb(${t.memoryVersion}) and ${t.record}->'sourceCount' = to_jsonb(${t.sourceCount}) and ${t.record}->>'environment' = ${t.environment} and jsonb_typeof(${t.record}->'sourceFingerprint') = 'string' and ${t.record}->>'sourceFingerprint' ~ '^[a-f0-9]{64}$' and jsonb_typeof(${t.record}->'selectionFingerprint') = 'string' and ${t.record}->>'selectionFingerprint' ~ '^[a-f0-9]{64}$' and jsonb_typeof(${t.record}->'memoryContentDigest') = 'string' and ${t.record}->>'memoryContentDigest' ~ '^[a-f0-9]{64}$' and ${t.record}->>'sourceTier' in ('public','private','client','unknown') and jsonb_typeof(${t.record}->'reviewedBy') = 'string' and length(trim(${t.record}->>'reviewedBy')) between 1 and 4000 and jsonb_typeof(${t.record}->'reviewedAt') = 'string' and jsonb_typeof(${t.record}->'recordedAt') = 'string' and ${t.record}->>'correlationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') is true`,
    ),
  ],
);

export const foundationImportOriginalSource = pgTable(
  "foundation_import_original_source",
  {
    revisionId: uuid("revision_id").notNull(),
    projectId: uuid("project_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    contentDigest: text("content_digest").notNull(),
    originalContent: originalUtf8("original_content").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.ordinal] }),
    foreignKey({
      columns: [t.revisionId, t.projectId],
      foreignColumns: [
        foundationImportRevision.id,
        foundationImportRevision.projectId,
      ],
      name: "foundation_import_original_parent_fk",
    }),
    foreignKey({
      columns: [t.evidenceId, t.projectId],
      foreignColumns: [foundationEvidence.id, foundationEvidence.projectId],
      name: "foundation_import_original_evidence_fk",
    }),
    check(
      "foundation_import_original_order_valid",
      sql`${t.ordinal} between 0 and 999`,
    ),
    check(
      "foundation_import_original_digest_valid",
      sql`${t.contentDigest} = encode(sha256(${t.originalContent}), 'hex')`,
    ),
  ],
);
