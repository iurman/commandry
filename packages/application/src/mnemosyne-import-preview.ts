import { createHash } from "node:crypto";
import {
  foundationAliasSchema,
  foundationEvidenceInputSchema,
  foundationMemoryContentSchema,
  foundationMemorySchema,
  type FoundationAlias,
  type FoundationEvidenceInput,
  type FoundationMemory,
} from "@commandry/contracts";
import {
  canonicalFoundationJson,
  FoundationError,
  foundationDigest,
} from "@commandry/domain";

export type MnemosyneImportSource = {
  evidence: FoundationEvidenceInput;
  originalContent: string | null;
};

export type MnemosyneImportRecord = {
  externalId: FoundationAlias["externalId"];
  knowledgeItemId: FoundationMemory["knowledgeItemId"];
  statement: FoundationMemory["content"]["statement"];
  category: FoundationMemory["content"]["category"];
  sourceTier: "public" | "private" | "client" | "unknown";
  selected: boolean;
  sources: MnemosyneImportSource[];
};

/** Strict version 1 selected export. Source classification grants no authority. */
export type MnemosyneImportEnvelope = {
  schemaVersion: 1;
  projectId: FoundationMemory["projectId"];
  namespace: FoundationAlias["namespace"];
  records: MnemosyneImportRecord[];
};

export type MnemosyneImportExisting = {
  alias: FoundationAlias;
  memory: FoundationMemory;
  importedSourceFingerprint: string | null;
  lastImportedMemoryDigest: string | null;
};

/** A future authenticated controller supplies this context; it is not authentication. */
export type MnemosyneImportContext = {
  projectId: FoundationMemory["projectId"];
  reviewedSelections: ReadonlyMap<string, string>;
  existing: readonly MnemosyneImportExisting[];
};

export type MnemosyneImportAction =
  | "unselected"
  | "disclosure_review_required"
  | "unavailable_source"
  | "new_proposal"
  | "unchanged"
  | "revision_requires_review"
  | "preserve_owner_changes";

export type MnemosyneImportRecordPlan = {
  alias: FoundationAlias;
  knowledgeItemId: FoundationMemory["knowledgeItemId"];
  category: FoundationMemory["content"]["category"];
  sourceTier: MnemosyneImportRecord["sourceTier"];
  selected: boolean;
  statement: string | null;
  selectionFingerprint: string;
  sourceFingerprint: string;
  reviewedSelection: boolean;
  sources: FoundationEvidenceInput[];
  originalsAvailable: boolean;
  expectedExistingMemory: Pick<
    FoundationMemory,
    "id" | "version" | "contentDigest" | "knowledgeItemId"
  > | null;
  action: MnemosyneImportAction;
  reason:
    | "not_selected"
    | "exact_selection_review_missing"
    | "original_unavailable"
    | "reviewed_proposal_only"
    | "same_import_and_owner_baseline"
    | "import_changed"
    | "baseline_unavailable"
    | "knowledge_item_changed"
    | "owner_content_changed";
};

export type MnemosyneImportPlan = {
  schemaVersion: 1;
  projectId: FoundationMemory["projectId"];
  namespace: FoundationAlias["namespace"];
  sideEffects: "none";
  existingCount: number;
  records: MnemosyneImportRecordPlan[];
};

function invalid(message: string): never {
  throw new FoundationError("INVALID_REFERENCE", message);
}

function objectWithKeys(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("Invalid Mnemosyne export structure");
  }
  const properties = Object.keys(value);
  if (
    properties.length !== keys.length ||
    properties.some((key) => !keys.includes(key))
  ) {
    return invalid("Unexpected or missing Mnemosyne export fields");
  }
  return value as Record<string, unknown>;
}

function boundedArray(value: unknown, minimum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > 1000) {
    return invalid(
      "Mnemosyne export exceeds a request budget or lacks provenance",
    );
  }
  return value;
}

/** Rejects accessors, hidden/symbol keys, cycles and non-JSON values before parsing. */
export function parseMnemosyneImportEnvelope(
  raw: unknown,
): MnemosyneImportEnvelope {
  try {
    const envelope = objectWithKeys(
      JSON.parse(canonicalFoundationJson(raw)) as unknown,
      ["schemaVersion", "projectId", "namespace", "records"],
    );
    if (envelope.schemaVersion !== 1)
      invalid("Unsupported Mnemosyne export version");
    const projectId = foundationMemorySchema.shape.projectId.parse(
      envelope.projectId,
    );
    const namespace = foundationAliasSchema.shape.namespace.parse(
      envelope.namespace,
    );
    const aliases = new Set<string>();
    const records = boundedArray(envelope.records, 0).map(
      (value): MnemosyneImportRecord => {
        const row = objectWithKeys(value, [
          "externalId",
          "knowledgeItemId",
          "statement",
          "category",
          "sourceTier",
          "selected",
          "sources",
        ]);
        const externalId = foundationAliasSchema.shape.externalId.parse(
          row.externalId,
        );
        if (aliases.has(externalId))
          invalid("Duplicate Mnemosyne external alias");
        aliases.add(externalId);
        const knowledgeItemId =
          foundationMemorySchema.shape.knowledgeItemId.parse(
            row.knowledgeItemId,
          );
        const statement = foundationMemoryContentSchema.shape.statement.parse(
          row.statement,
        );
        const category = foundationMemoryContentSchema.shape.category.parse(
          row.category,
        );
        const sourceTier = row.sourceTier;
        if (
          sourceTier !== "public" &&
          sourceTier !== "private" &&
          sourceTier !== "client" &&
          sourceTier !== "unknown"
        )
          invalid("Invalid Mnemosyne source tier");
        if (typeof row.selected !== "boolean")
          invalid("Invalid Mnemosyne selection");
        const sources = boundedArray(row.sources, 1).map((sourceValue) => {
          const source = objectWithKeys(sourceValue, [
            "evidence",
            "originalContent",
          ]);
          const evidence = foundationEvidenceInputSchema.parse(source.evidence);
          if (evidence.projectId !== projectId)
            invalid("Mnemosyne evidence crosses project scope");
          const originalContent = source.originalContent;
          if (originalContent !== null && typeof originalContent !== "string") {
            invalid("Invalid Mnemosyne original content");
          }
          if (
            (evidence.availability === "available") !==
            (originalContent !== null)
          ) {
            invalid("Mnemosyne original availability is inconsistent");
          }
          if (
            originalContent !== null &&
            createHash("sha256")
              .update(originalContent, "utf8")
              .digest("hex") !== evidence.contentDigest
          )
            invalid("Mnemosyne original digest does not match");
          return { evidence, originalContent };
        });
        return {
          externalId,
          knowledgeItemId,
          statement,
          category,
          sourceTier,
          selected: row.selected,
          sources,
        };
      },
    );
    return { schemaVersion: 1, projectId, namespace, records };
  } catch (error) {
    if (error instanceof FoundationError) throw error;
    // Contract validation details may contain sensitive source values.
    return invalid("Invalid Mnemosyne export");
  }
}

function fingerprints(
  envelope: MnemosyneImportEnvelope,
  record: MnemosyneImportRecord,
) {
  const scope = {
    schemaVersion: envelope.schemaVersion,
    projectId: envelope.projectId,
    namespace: envelope.namespace,
  };
  const sourceRecord = {
    externalId: record.externalId,
    knowledgeItemId: record.knowledgeItemId,
    statement: record.statement,
    category: record.category,
    sourceTier: record.sourceTier,
    sources: record.sources,
  };
  return {
    selectionFingerprint: foundationDigest({ ...scope, record }),
    sourceFingerprint: foundationDigest({ ...scope, record: sourceRecord }),
  };
}

/** Pure review helpers validate the whole export and never infer a review decision. */
export function fingerprintMnemosyneSelections(
  raw: unknown,
): ReadonlyMap<string, string> {
  const envelope = parseMnemosyneImportEnvelope(raw);
  return new Map(
    envelope.records.map((record) => [
      record.externalId,
      fingerprints(envelope, record).selectionFingerprint,
    ]),
  );
}

export function fingerprintMnemosyneSelection(
  raw: unknown,
  externalId: string,
): string {
  const fingerprint = fingerprintMnemosyneSelections(raw).get(externalId);
  if (fingerprint === undefined)
    return invalid("Mnemosyne selection does not exist");
  return fingerprint;
}

function scopedExisting(context: MnemosyneImportContext, projectId: string) {
  const entries = new Map<string, MnemosyneImportExisting>();
  const memoryIds = new Set<string>();
  try {
    for (const entry of context.existing) {
      // Deliberately exclude foreign records before parsing their aliases or content.
      const scope = foundationMemorySchema.shape.projectId.safeParse(
        entry.memory.projectId,
      );
      if (!scope.success || scope.data !== projectId) continue;
      const memory = foundationMemorySchema.parse(entry.memory);
      const alias = foundationAliasSchema.parse(entry.alias);
      const importedSourceFingerprint =
        foundationMemorySchema.shape.contentDigest
          .nullable()
          .parse(entry.importedSourceFingerprint);
      const lastImportedMemoryDigest =
        foundationMemorySchema.shape.contentDigest
          .nullable()
          .parse(entry.lastImportedMemoryDigest);
      const aliasKey = canonicalFoundationJson(alias);
      const memoryKey = canonicalFoundationJson([alias.namespace, memory.id]);
      if (entries.has(aliasKey) || memoryIds.has(memoryKey)) {
        invalid("Ambiguous project import baseline");
      }
      memoryIds.add(memoryKey);
      entries.set(aliasKey, {
        alias,
        memory,
        importedSourceFingerprint,
        lastImportedMemoryDigest,
      });
    }
  } catch {
    return invalid("Invalid project import baseline");
  }
  return entries;
}

function classify(
  record: MnemosyneImportRecord,
  sourceFingerprint: string,
  reviewed: boolean,
  available: boolean,
  existing: MnemosyneImportExisting | undefined,
): Pick<MnemosyneImportRecordPlan, "action" | "reason"> {
  if (!record.selected) return { action: "unselected", reason: "not_selected" };
  if (
    existing &&
    existing.lastImportedMemoryDigest !== null &&
    (existing.memory.contentDigest !== existing.lastImportedMemoryDigest ||
      foundationDigest(existing.memory.content) !==
        existing.memory.contentDigest)
  )
    return {
      action: "preserve_owner_changes",
      reason: "owner_content_changed",
    };
  if (!available)
    return { action: "unavailable_source", reason: "original_unavailable" };
  if (existing) {
    if (
      existing.lastImportedMemoryDigest === null ||
      existing.importedSourceFingerprint === null
    ) {
      return {
        action: "revision_requires_review",
        reason: "baseline_unavailable",
      };
    }
    if (existing.memory.knowledgeItemId !== record.knowledgeItemId) {
      return {
        action: "revision_requires_review",
        reason: "knowledge_item_changed",
      };
    }
    if (existing.importedSourceFingerprint === sourceFingerprint) {
      return { action: "unchanged", reason: "same_import_and_owner_baseline" };
    }
    return { action: "revision_requires_review", reason: "import_changed" };
  }
  if (!reviewed)
    return {
      action: "disclosure_review_required",
      reason: "exact_selection_review_missing",
    };
  return { action: "new_proposal", reason: "reviewed_proposal_only" };
}

/** Side-effect-free preflight only: no persistence, factual verification or instruction approval. */
export function planMnemosyneImport(
  raw: unknown,
  context: MnemosyneImportContext,
): MnemosyneImportPlan {
  const envelope = parseMnemosyneImportEnvelope(raw);
  const scope = foundationMemorySchema.shape.projectId.safeParse(
    context.projectId,
  );
  if (!scope.success || scope.data !== envelope.projectId) {
    throw new FoundationError(
      "FORBIDDEN",
      "Mnemosyne project scope does not match",
    );
  }
  const existing = scopedExisting(context, scope.data);
  const records = envelope.records.map((record): MnemosyneImportRecordPlan => {
    const alias = {
      namespace: envelope.namespace,
      externalId: record.externalId,
    };
    const prior = existing.get(canonicalFoundationJson(alias));
    const hashes = fingerprints(envelope, record);
    const reviewedSelection =
      context.reviewedSelections.get(record.externalId) ===
      hashes.selectionFingerprint;
    const originalsAvailable = record.sources.every(
      (source) => source.originalContent !== null,
    );
    return {
      alias,
      knowledgeItemId: record.knowledgeItemId,
      category: record.category,
      sourceTier: record.sourceTier,
      selected: record.selected,
      statement:
        record.sourceTier === "public" || reviewedSelection
          ? record.statement
          : null,
      ...hashes,
      reviewedSelection,
      sources: record.sources.map((source) => source.evidence),
      originalsAvailable,
      expectedExistingMemory: prior
        ? {
            id: prior.memory.id,
            version: prior.memory.version,
            contentDigest: prior.memory.contentDigest,
            knowledgeItemId: prior.memory.knowledgeItemId,
          }
        : null,
      ...classify(
        record,
        hashes.sourceFingerprint,
        reviewedSelection,
        originalsAvailable,
        prior,
      ),
    };
  });
  return {
    schemaVersion: 1,
    projectId: envelope.projectId,
    namespace: envelope.namespace,
    sideEffects: "none",
    existingCount: existing.size,
    records,
  };
}
