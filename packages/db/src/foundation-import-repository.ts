import { and, asc, desc, eq, gte } from "drizzle-orm";
import {
  parseFoundationImportOriginalSource,
  parseFoundationImportRevision,
  type FoundationImportOriginalQuery,
  type FoundationImportRecordPort,
  type FoundationImportRevision,
  type FoundationOwnerRequest,
  type FoundationRecordPort,
  type FoundationSelectedImportPort,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationAliasSchema,
  foundationMemorySchema,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationInstantMilliseconds,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { createFoundationOwnerRecordsAccessRepository } from "./foundation-access-repository";
import type { FoundationTransaction } from "./foundation-record-repository";
import {
  foundationMemoryAlias,
  foundationMemoryEvidence,
  foundationMemoryRevision,
} from "./foundation-schema";
import {
  foundationImportOriginalSource,
  foundationImportRevision,
} from "./foundation-import-schema";

function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Import reference unavailable in scope",
  );
}
function unavailable(): never {
  throw new FoundationError("NOT_FOUND", "Import revision is unavailable");
}
function exact(actual: unknown, expected: unknown): void {
  try {
    if (foundationDigest(actual) !== foundationDigest(expected)) invalid();
  } catch {
    invalid();
  }
}
function id(raw: string): string {
  const parsed = foundationActorSchema.shape.projectId.safeParse(raw);
  if (!parsed.success || parsed.data !== raw) invalid();
  return parsed.data;
}
function revisionRecord(
  row: typeof foundationImportRevision.$inferSelect,
): FoundationImportRevision {
  const record = parseFoundationImportRevision(row.record);
  exact(
    {
      id: row.id,
      projectId: row.projectId,
      namespace: row.namespace,
      externalId: row.externalId,
      memoryId: row.memoryId,
      memoryVersion: row.memoryVersion,
      sourceCount: row.sourceCount,
      environment: row.environment,
    },
    {
      id: record.id,
      projectId: record.projectId,
      namespace: record.alias.namespace,
      externalId: record.alias.externalId,
      memoryId: record.memoryId,
      memoryVersion: record.memoryVersion,
      sourceCount: record.sourceCount,
      environment: record.environment,
    },
  );
  return record;
}

function importRecords(
  tx: FoundationTransaction,
  request: FoundationOwnerRequest,
  base: FoundationRecordPort,
  now: () => Date,
): FoundationImportRecordPort {
  // This factory runs after the shared wrapper's owner checks and project lock.
  // No import query is reachable from unrelated owner or machine operations.
  if (
    request.operation !== "foundation.read" &&
    request.operation !== "memory.import"
  ) {
    throw new FoundationError(
      "FORBIDDEN",
      "Owner import operation unavailable",
    );
  }
  const scope = id(request.projectId);
  id(request.correlationId);
  const environment = foundationActorSchema.shape.environment.safeParse(
    request.environment,
  );
  if (!environment.success || environment.data !== request.environment)
    invalid();
  const scoped = (projectId: string) => {
    if (id(projectId) !== scope) invalid();
  };
  const aliasRow = async (alias: FoundationImportRevision["alias"]) => {
    const parsed = foundationAliasSchema.safeParse(alias);
    if (!parsed.success) invalid();
    exact(alias, parsed.data);
    const [row] = await tx
      .select()
      .from(foundationMemoryAlias)
      .where(
        and(
          eq(foundationMemoryAlias.projectId, scope),
          eq(foundationMemoryAlias.namespace, alias.namespace),
          eq(foundationMemoryAlias.externalId, alias.externalId),
        ),
      )
      .for("share");
    return row ?? null;
  };
  const validateBinding = async (record: FoundationImportRevision) => {
    if (
      record.projectId !== scope ||
      record.environment !== request.environment
    )
      invalid();
    const alias = await aliasRow(record.alias);
    if (!alias || alias.memoryId !== record.memoryId) invalid();
    const [memory] = await tx
      .select()
      .from(foundationMemoryRevision)
      .where(
        and(
          eq(foundationMemoryRevision.projectId, scope),
          eq(foundationMemoryRevision.memoryId, record.memoryId),
          eq(foundationMemoryRevision.version, record.memoryVersion),
        ),
      );
    if (!memory || memory.contentDigest !== record.memoryContentDigest)
      invalid();
  };
  const getRevision = async (projectId: string, revisionId: string) => {
    scoped(projectId);
    id(revisionId);
    const [row] = await tx
      .select()
      .from(foundationImportRevision)
      .where(
        and(
          eq(foundationImportRevision.projectId, scope),
          eq(foundationImportRevision.environment, request.environment),
          eq(foundationImportRevision.id, revisionId),
        ),
      );
    if (!row) return null;
    const record = revisionRecord(row);
    await validateBinding(record);
    return record;
  };
  const sources = async (query: FoundationImportOriginalQuery) => {
    scoped(query.projectId);
    id(query.revisionId);
    if (
      !Number.isSafeInteger(query.fromOrdinal) ||
      query.fromOrdinal < 0 ||
      query.fromOrdinal > 1000 ||
      !Number.isSafeInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 1000
    )
      invalid();
    const revision = await getRevision(scope, query.revisionId);
    if (!revision) unavailable();
    if (query.fromOrdinal > revision.sourceCount) invalid();
    const rows = await tx
      .select()
      .from(foundationImportOriginalSource)
      .where(
        and(
          eq(foundationImportOriginalSource.projectId, scope),
          eq(foundationImportOriginalSource.revisionId, revision.id),
          gte(foundationImportOriginalSource.ordinal, query.fromOrdinal),
        ),
      )
      .orderBy(asc(foundationImportOriginalSource.ordinal))
      .limit(query.limit + 1);
    const items = rows
      .slice(0, query.limit)
      .map((row) => parseFoundationImportOriginalSource(row));
    const count = Math.min(
      query.limit,
      revision.sourceCount - query.fromOrdinal,
    );
    if (
      items.length !== count ||
      rows.length !==
        Math.min(query.limit + 1, revision.sourceCount - query.fromOrdinal)
    )
      invalid();
    items.forEach((source, offset) => {
      if (
        source.projectId !== scope ||
        source.revisionId !== revision.id ||
        source.ordinal !== query.fromOrdinal + offset
      )
        invalid();
    });
    return {
      items,
      nextOrdinal:
        rows.length > query.limit ? query.fromOrdinal + items.length : null,
    };
  };
  return {
    ...base,
    async getImportExisting(input) {
      scoped(input.projectId);
      const alias = await aliasRow(input.alias);
      if (!alias) return null;
      const raw = await base.getMemory(id(alias.memoryId), true);
      if (!raw) invalid();
      const memory = foundationMemorySchema.parse(raw);
      exact(raw, memory);
      if (
        memory.projectId !== scope ||
        memory.id !== alias.memoryId ||
        foundationDigest(memory.content) !== memory.contentDigest
      )
        invalid();
      const [row] = await tx
        .select()
        .from(foundationImportRevision)
        .where(
          and(
            eq(foundationImportRevision.projectId, scope),
            eq(foundationImportRevision.environment, request.environment),
            eq(foundationImportRevision.namespace, alias.namespace),
            eq(foundationImportRevision.externalId, alias.externalId),
          ),
        )
        .orderBy(
          desc(foundationImportRevision.memoryVersion),
          desc(foundationImportRevision.id),
        )
        .limit(1);
      const baseline = row ? revisionRecord(row) : null;
      if (baseline) {
        if (
          baseline.memoryId !== memory.id ||
          baseline.memoryVersion > memory.version
        )
          invalid();
        await validateBinding(baseline);
      }
      return {
        alias: { namespace: alias.namespace, externalId: alias.externalId },
        memory,
        baseline,
      };
    },
    async insertImportRevision(input) {
      if (request.operation !== "memory.import")
        throw new FoundationError(
          "FORBIDDEN",
          "Owner import operation unavailable",
        );
      const revision = parseFoundationImportRevision(input.revision);
      scoped(revision.projectId);
      const clock = now();
      if (
        !Number.isFinite(clock.getTime()) ||
        revision.environment !== request.environment ||
        revision.reviewedBy !== request.principalId ||
        revision.correlationId !== request.correlationId ||
        foundationInstantMilliseconds(revision.recordedAt) > clock.getTime() ||
        input.sources.length !== revision.sourceCount
      )
        invalid();
      const originals = input.sources.map(parseFoundationImportOriginalSource);
      originals.forEach((source, ordinal) => {
        if (
          source.revisionId !== revision.id ||
          source.projectId !== scope ||
          source.ordinal !== ordinal
        )
          invalid();
      });
      const memory = await base.getMemory(revision.memoryId, true);
      if (
        !memory ||
        memory.projectId !== scope ||
        memory.version !== revision.memoryVersion ||
        memory.contentDigest !== revision.memoryContentDigest ||
        foundationDigest(memory.content) !== memory.contentDigest ||
        memory.recordedBy !== request.principalId ||
        memory.lifecycle !== "proposed" ||
        memory.verification !== "unverified" ||
        foundationInstantMilliseconds(revision.reviewedAt) <
          foundationInstantMilliseconds(memory.recordedAt)
      )
        invalid();
      exact(
        memory.content.evidenceIds,
        originals.map((source) => source.evidenceId),
      );
      await validateBinding(revision);
      const membership = await tx
        .select()
        .from(foundationMemoryEvidence)
        .where(
          and(
            eq(foundationMemoryEvidence.projectId, scope),
            eq(foundationMemoryEvidence.memoryId, revision.memoryId),
            eq(foundationMemoryEvidence.version, revision.memoryVersion),
          ),
        )
        .orderBy(asc(foundationMemoryEvidence.ordinal));
      exact(
        membership.map((member) => ({
          ordinal: member.ordinal,
          evidenceId: member.evidenceId,
        })),
        originals.map((source) => ({
          ordinal: source.ordinal,
          evidenceId: source.evidenceId,
        })),
      );
      for (const source of originals) {
        const evidence = await base.getEvidence(source.evidenceId);
        if (
          !evidence ||
          evidence.projectId !== scope ||
          evidence.contentDigest !== source.contentDigest ||
          evidence.availability !== "available"
        )
          invalid();
        await base.validateEvidenceReference(evidence);
      }
      const [stored] = await tx
        .insert(foundationImportRevision)
        .values({
          id: revision.id,
          projectId: scope,
          namespace: revision.alias.namespace,
          externalId: revision.alias.externalId,
          memoryId: revision.memoryId,
          memoryVersion: revision.memoryVersion,
          sourceCount: revision.sourceCount,
          environment: revision.environment,
          record: revision,
        })
        .returning();
      if (!stored) invalid();
      const persistedRevision = revisionRecord(stored);
      exact(persistedRevision, revision);
      const persisted = await tx
        .insert(foundationImportOriginalSource)
        .values(originals)
        .returning();
      const persistedSources = persisted
        .sort((a, b) => a.ordinal - b.ordinal)
        .map(parseFoundationImportOriginalSource);
      exact(persistedSources, originals);
      return { revision: persistedRevision, sources: persistedSources };
    },
    getImportRevision: (input) => getRevision(input.projectId, input.id),
    listImportOriginalSources: sources,
  };
}

/** Trusted owner-session transport composition. Identity validation here preserves
 * transaction/expiry guarantees; it does not authenticate or revoke sessions.
 * Original bytes intentionally have no machine/MCP disclosure entry point. */
export function createFoundationSelectedImportRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationSelectedImportPort {
  return createFoundationOwnerRecordsAccessRepository(
    db,
    importRecords,
    options,
  );
}
