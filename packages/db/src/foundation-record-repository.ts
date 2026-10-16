import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type {
  FoundationOperationContext,
  FoundationRecordPort,
} from "@commandry/application";
import {
  foundationConfigurationSchema,
  foundationEvidenceSchema,
  foundationMemorySchema,
  foundationReadRecordSchema,
  foundationInstructionApprovalSchema,
  type FoundationActor,
  type FoundationEvidenceInput,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationInstantMilliseconds,
  foundationDigest,
  requireFoundationVersion,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { capture, knowledgeItem, knowledgeItemRevision } from "./schema";
import {
  foundationConfiguration,
  foundationConfigurationParent,
  foundationEvidence,
  foundationIdempotency,
  foundationInstructionApproval,
  foundationMemory,
  foundationMemoryAlias,
  foundationMemoryEvidence,
  foundationMemoryRelation,
  foundationMemoryReview,
  foundationMemoryRevision,
  foundationMemoryVerification,
  foundationVerificationEvidence,
} from "./foundation-schema";
import { sql } from "drizzle-orm";

export type FoundationTransaction = Parameters<
  Parameters<CommandryDatabase["transaction"]>[0]
>[0];

export const foundationByteDigest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

function unavailable(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Reference unavailable in scope",
  );
}

function canonicalId(value: string): string {
  const parsed = foundationReadRecordSchema.shape.id.safeParse(value);
  if (!parsed.success || parsed.data !== value) unavailable();
  return parsed.data;
}

function evidenceRecord(row: typeof foundationEvidence.$inferSelect) {
  return foundationEvidenceSchema.parse({
    schemaVersion: 1,
    id: row.id,
    projectId: row.projectId,
    sourceKind: row.sourceKind,
    sourceId: row.sourceId,
    sourceVersion: row.sourceVersion,
    contentDigest: row.contentDigest,
    locator: row.locator,
    observedAt: row.observedAt,
    availability: row.availability,
    ingestedAt: row.ingestedAt.toISOString(),
    recordedBy: row.recordedBy,
    verification: row.verification,
  });
}

/** A transaction-bound record port. It never opens a second database connection. */
export function createFoundationRecordRepository(
  tx: FoundationTransaction,
  context: FoundationOperationContext & { principalId: string },
  now: () => Date,
  onReplay: () => void,
): FoundationRecordPort {
  const scope = context.projectId;
  const requireActor = (actor: FoundationActor, operation: string) => {
    if (
      actor.principalId !== context.principalId ||
      actor.projectId !== scope ||
      actor.clientId !== null ||
      actor.environment !== context.environment ||
      context.operation !== operation
    )
      throw new FoundationError("FORBIDDEN", "Owner operation unavailable");
  };
  const getKnowledge = async (id: string) => {
    const [row] = await tx
      .select()
      .from(knowledgeItem)
      .where(and(eq(knowledgeItem.id, id), eq(knowledgeItem.projectId, scope)))
      .for("share");
    if (!row) unavailable();
    return row;
  };
  const getHead = async (id: string, lock = true) => {
    const [head] = await tx
      .select()
      .from(foundationMemory)
      .where(
        and(eq(foundationMemory.id, id), eq(foundationMemory.projectId, scope)),
      )
      .for(lock ? "update" : "share");
    return head ?? null;
  };
  const getRevision = async (id: string, version: number) => {
    const [revision] = await tx
      .select()
      .from(foundationMemoryRevision)
      .where(
        and(
          eq(foundationMemoryRevision.memoryId, id),
          eq(foundationMemoryRevision.projectId, scope),
          eq(foundationMemoryRevision.version, version),
        ),
      );
    if (!revision) unavailable();
    return revision;
  };
  const validateSource = async (input: FoundationEvidenceInput) => {
    if (input.projectId !== scope) unavailable();
    if (input.sourceKind === "capture") {
      const id = canonicalId(input.sourceId);
      const [row] = await tx
        .select()
        .from(capture)
        .where(and(eq(capture.id, id), eq(capture.projectId, scope)))
        .for("share");
      if (
        !row ||
        input.sourceVersion !== null ||
        foundationByteDigest(row.originalContent) !== input.contentDigest
      )
        unavailable();
      return { captureId: id, knowledgeItemId: null, knowledgeVersion: null };
    }
    if (input.sourceKind === "knowledge_revision") {
      const id = canonicalId(input.sourceId);
      if (!input.sourceVersion || !/^[1-9][0-9]*$/.test(input.sourceVersion))
        unavailable();
      const version = Number(input.sourceVersion);
      if (!Number.isSafeInteger(version) || version > 2147483647) unavailable();
      const current = await getKnowledge(id);
      let content: string | undefined;
      if (version === current.version) content = current.content;
      else if (version < current.version) {
        const [historical] = await tx
          .select()
          .from(knowledgeItemRevision)
          .where(
            and(
              eq(knowledgeItemRevision.knowledgeItemId, id),
              eq(knowledgeItemRevision.version, version === 1 ? 2 : version),
            ),
          );
        content =
          version === 1 ? historical?.previousContent : historical?.content;
      }
      if (
        content === undefined ||
        foundationByteDigest(content) !== input.contentDigest
      )
        unavailable();
      return {
        captureId: null,
        knowledgeItemId: id,
        knowledgeVersion: version,
      };
    }
    // External/artifact writes record a scoped claim. They never fetch or verify it.
    return { captureId: null, knowledgeItemId: null, knowledgeVersion: null };
  };

  const port: FoundationRecordPort = {
    async idempotent(key, requestDigest, perform) {
      const keyDigest = foundationByteDigest(key);
      const lock = foundationDigest({
        scope,
        environment: context.environment,
        principalId: context.principalId,
        operation: context.operation,
        keyDigest,
      });
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`,
      );
      const predicate = and(
        eq(foundationIdempotency.projectId, scope),
        eq(foundationIdempotency.environment, context.environment),
        eq(foundationIdempotency.principalId, context.principalId),
        eq(foundationIdempotency.operation, context.operation),
        eq(foundationIdempotency.keyDigest, keyDigest),
      );
      const [prior] = await tx
        .select()
        .from(foundationIdempotency)
        .where(predicate);
      if (prior) {
        if (prior.requestDigest !== requestDigest)
          throw new FoundationError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key has different input",
          );
        if (foundationDigest(prior.result) !== prior.resultDigest)
          throw new FoundationError(
            "INVALID_REFERENCE",
            "Stored operation result is invalid",
          );
        onReplay();
        return {
          value: prior.result as Awaited<ReturnType<typeof perform>>,
          replayed: true,
        };
      }
      const value = await perform();
      await tx.insert(foundationIdempotency).values({
        projectId: scope,
        environment: context.environment,
        principalId: context.principalId,
        operation: context.operation,
        keyDigest,
        requestDigest,
        result: value,
        resultDigest: foundationDigest(value),
        correlationId: context.correlationId,
      });
      return { value, replayed: false };
    },
    async validateEvidenceReference(input) {
      await validateSource(input);
    },
    async assertReferences(input) {
      for (const [ids, table] of [
        [input.evidenceIds, foundationEvidence],
        [input.memoryIds, foundationMemory],
        [input.configurationIds, foundationConfiguration],
      ] as const) {
        if (ids.length === 0) continue;
        const rows = await tx
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.projectId, scope), inArray(table.id, [...ids])));
        if (rows.length !== new Set(ids).size) unavailable();
      }
    },
    async getEvidence(id) {
      const [row] = await tx
        .select()
        .from(foundationEvidence)
        .where(
          and(
            eq(foundationEvidence.id, id),
            eq(foundationEvidence.projectId, scope),
          ),
        );
      return row ? evidenceRecord(row) : null;
    },
    async getMemory(id, lock) {
      const head = await getHead(id, lock);
      if (!head) return null;
      const revision = await getRevision(id, head.currentVersion);
      const evidence = await tx
        .select()
        .from(foundationMemoryEvidence)
        .where(
          and(
            eq(foundationMemoryEvidence.memoryId, id),
            eq(foundationMemoryEvidence.version, head.currentVersion),
            eq(foundationMemoryEvidence.projectId, scope),
          ),
        )
        .orderBy(asc(foundationMemoryEvidence.ordinal));
      const related = await tx
        .select()
        .from(foundationMemoryRelation)
        .where(
          and(
            eq(foundationMemoryRelation.memoryId, id),
            eq(foundationMemoryRelation.version, head.currentVersion),
            eq(foundationMemoryRelation.projectId, scope),
          ),
        )
        .orderBy(asc(foundationMemoryRelation.ordinal));
      const record = foundationMemorySchema.parse({
        schemaVersion: 1,
        id,
        projectId: scope,
        knowledgeItemId: head.knowledgeItemId,
        version: head.currentVersion,
        contentDigest: revision.contentDigest,
        content: {
          statement: revision.statement,
          category: revision.category,
          evidenceIds: evidence.map((r) => r.evidenceId),
          relatedMemoryIds: related.map((r) => r.relatedMemoryId),
          relationType: revision.relationType,
        },
        lifecycle: head.lifecycle,
        verification: head.verification,
        recordedBy: revision.recordedBy,
        recordedAt: revision.recordedAt.toISOString(),
      });
      if (foundationDigest(record.content) !== record.contentDigest)
        unavailable();
      return record;
    },
    async getConfiguration(id) {
      const [row] = await tx
        .select()
        .from(foundationConfiguration)
        .where(
          and(
            eq(foundationConfiguration.id, id),
            eq(foundationConfiguration.projectId, scope),
          ),
        );
      if (!row) return null;
      const parents = await tx
        .select()
        .from(foundationConfigurationParent)
        .where(
          and(
            eq(foundationConfigurationParent.configurationId, id),
            eq(foundationConfigurationParent.projectId, scope),
          ),
        )
        .orderBy(asc(foundationConfigurationParent.ordinal));
      return foundationConfigurationSchema.parse({
        schemaVersion: 1,
        id,
        projectId: scope,
        kind: row.kind,
        content: row.content,
        contentDigest: row.contentDigest,
        parentIds: parents.map((p) => p.parentId),
        sourceCommit: row.sourceCommit,
        recordedAt: row.recordedAt.toISOString(),
        recordedBy: row.recordedBy,
      });
    },
    async resolveMemoryAnchor(knowledgeId, evidenceIds) {
      const current = await getKnowledge(knowledgeId);
      await port.assertReferences({
        evidenceIds,
        memoryIds: [],
        configurationIds: [],
      });
      const rows = await tx
        .select()
        .from(foundationEvidence)
        .where(
          and(
            eq(foundationEvidence.projectId, scope),
            inArray(foundationEvidence.id, [...evidenceIds]),
          ),
        )
        .orderBy(asc(foundationEvidence.id));
      let candidates = rows.filter(
        (e) =>
          e.sourceKind === "knowledge_revision" &&
          e.knowledgeItemId === knowledgeId,
      );
      if (candidates.length === 0)
        candidates = rows.filter(
          (e) =>
            e.sourceKind === "capture" &&
            e.captureId === current.sourceCaptureId,
        );
      if (candidates.length !== 1) unavailable();
      const anchor = candidates[0]!;
      const knowledgeVersion = anchor.knowledgeVersion ?? current.version;
      return {
        knowledgeItemId: knowledgeId,
        knowledgeVersion,
        evidenceId: anchor.id,
        sourceVersion: anchor.sourceVersion,
        contentDigest: anchor.contentDigest,
        freshness:
          anchor.availability !== "available"
            ? "unknown"
            : knowledgeVersion === current.version
              ? "fresh"
              : "stale",
      };
    },
    async getMemoryAnchor(memoryId) {
      const head = await getHead(memoryId, false);
      if (!head) unavailable();
      const revision = await getRevision(memoryId, head.currentVersion);
      const [anchor] = await tx
        .select()
        .from(foundationEvidence)
        .where(
          and(
            eq(foundationEvidence.id, revision.anchorEvidenceId),
            eq(foundationEvidence.projectId, scope),
          ),
        );
      if (!anchor) unavailable();
      const current = await getKnowledge(head.knowledgeItemId);
      return {
        knowledgeItemId: head.knowledgeItemId,
        knowledgeVersion: revision.anchorKnowledgeVersion,
        evidenceId: anchor.id,
        sourceVersion: anchor.sourceVersion,
        contentDigest: anchor.contentDigest,
        freshness:
          anchor.availability !== "available"
            ? "unknown"
            : current.version === revision.anchorKnowledgeVersion
              ? "fresh"
              : "stale",
      };
    },
    async hasUnresolvedContradictions(memoryId) {
      // Memory mutations are serialized per project by the access wrapper.
      const links = await tx
        .select({
          source: foundationMemoryRelation.memoryId,
          target: foundationMemoryRelation.relatedMemoryId,
        })
        .from(foundationMemoryRelation)
        .innerJoin(
          foundationMemoryRevision,
          and(
            eq(
              foundationMemoryRevision.memoryId,
              foundationMemoryRelation.memoryId,
            ),
            eq(
              foundationMemoryRevision.version,
              foundationMemoryRelation.version,
            ),
            eq(foundationMemoryRevision.projectId, scope),
          ),
        )
        .innerJoin(
          foundationMemory,
          and(
            eq(foundationMemory.id, foundationMemoryRelation.memoryId),
            eq(
              foundationMemory.currentVersion,
              foundationMemoryRelation.version,
            ),
            eq(foundationMemory.projectId, scope),
          ),
        )
        .where(
          and(
            eq(foundationMemoryRelation.projectId, scope),
            eq(foundationMemoryRevision.relationType, "contradicts"),
            inArray(foundationMemory.lifecycle, ["proposed", "accepted"]),
            or(
              eq(foundationMemoryRelation.memoryId, memoryId),
              eq(foundationMemoryRelation.relatedMemoryId, memoryId),
            ),
          ),
        );
      for (const link of links) {
        const otherId = link.source === memoryId ? link.target : link.source;
        const [other] = await tx
          .select()
          .from(foundationMemory)
          .where(
            and(
              eq(foundationMemory.id, otherId),
              eq(foundationMemory.projectId, scope),
            ),
          );
        if (other && ["proposed", "accepted"].includes(other.lifecycle))
          return true;
      }
      return false;
    },
    async insertEvidence(record) {
      const parsed = foundationEvidenceSchema.parse(record);
      if (
        parsed.projectId !== scope ||
        parsed.recordedBy !== context.principalId ||
        parsed.verification !== "unverified"
      )
        unavailable();
      const binding = await validateSource(parsed);
      const [row] = await tx
        .insert(foundationEvidence)
        .values({
          ...binding,
          id: parsed.id,
          projectId: scope,
          sourceKind: parsed.sourceKind,
          sourceId: parsed.sourceId,
          sourceVersion: parsed.sourceVersion,
          contentDigest: parsed.contentDigest,
          locator: parsed.locator,
          observedAt: parsed.observedAt,
          availability: parsed.availability,
          ingestedAt: new Date(parsed.ingestedAt),
          recordedBy: parsed.recordedBy,
          verification: parsed.verification,
        })
        .returning();
      if (!row) unavailable();
      return evidenceRecord(row);
    },
    async saveMemory(record, expectedVersion, alias, anchor) {
      const parsed = foundationMemorySchema.parse(record);
      if (
        parsed.projectId !== scope ||
        parsed.recordedBy !== context.principalId ||
        parsed.lifecycle !== "proposed" ||
        parsed.verification !== "unverified" ||
        foundationDigest(parsed.content) !== parsed.contentDigest
      )
        unavailable();
      const actualAnchor = await port.resolveMemoryAnchor(
        parsed.knowledgeItemId,
        parsed.content.evidenceIds,
      );
      if (foundationDigest(actualAnchor) !== foundationDigest(anchor))
        unavailable();
      await port.assertReferences({
        evidenceIds: parsed.content.evidenceIds,
        memoryIds: parsed.content.relatedMemoryIds,
        configurationIds: [],
      });
      if (expectedVersion === null) {
        requireFoundationVersion(parsed.version, 1);
        await tx.insert(foundationMemory).values({
          id: parsed.id,
          projectId: scope,
          knowledgeItemId: parsed.knowledgeItemId,
          currentVersion: 1,
          lifecycle: "proposed",
          verification: "unverified",
        });
      } else {
        const head = await getHead(parsed.id);
        if (!head || head.knowledgeItemId !== parsed.knowledgeItemId)
          unavailable();
        requireFoundationVersion(head.currentVersion, expectedVersion);
        requireFoundationVersion(parsed.version, expectedVersion + 1);
        await tx
          .update(foundationMemory)
          .set({
            currentVersion: parsed.version,
            lifecycle: "proposed",
            verification: "unverified",
          })
          .where(
            and(
              eq(foundationMemory.id, parsed.id),
              eq(foundationMemory.projectId, scope),
            ),
          );
      }
      await tx.insert(foundationMemoryRevision).values({
        memoryId: parsed.id,
        projectId: scope,
        version: parsed.version,
        contentDigest: parsed.contentDigest,
        statement: parsed.content.statement,
        category: parsed.content.category,
        relationType: parsed.content.relationType,
        recordedBy: parsed.recordedBy,
        recordedAt: new Date(parsed.recordedAt),
        anchorEvidenceId: anchor.evidenceId,
        anchorKnowledgeVersion: anchor.knowledgeVersion,
      });
      await tx.insert(foundationMemoryEvidence).values(
        parsed.content.evidenceIds.map((evidenceId, ordinal) => ({
          memoryId: parsed.id,
          projectId: scope,
          version: parsed.version,
          evidenceId,
          ordinal,
        })),
      );
      if (parsed.content.relatedMemoryIds.length)
        await tx.insert(foundationMemoryRelation).values(
          parsed.content.relatedMemoryIds.map((relatedMemoryId, ordinal) => ({
            memoryId: parsed.id,
            projectId: scope,
            version: parsed.version,
            relatedMemoryId,
            ordinal,
          })),
        );
      if (alias) {
        if (expectedVersion !== null) unavailable();
        await tx.insert(foundationMemoryAlias).values({
          projectId: scope,
          memoryId: parsed.id,
          namespace: alias.namespace,
          externalId: alias.externalId,
        });
      }
      return parsed;
    },
    async reviewMemory(input, actor, at) {
      requireActor(actor, "memory.review");
      const head = await getHead(input.memoryId);
      if (!head || input.projectId !== scope) unavailable();
      requireFoundationVersion(head.currentVersion, input.expectedVersion);
      await tx.insert(foundationMemoryReview).values({
        id: randomUUID(),
        projectId: scope,
        memoryId: head.id,
        version: head.currentVersion,
        decision: input.decision,
        reason: input.reason,
        actor: actor.principalId,
        createdAt: new Date(at),
      });
      await tx
        .update(foundationMemory)
        .set({ lifecycle: input.decision })
        .where(
          and(
            eq(foundationMemory.id, head.id),
            eq(foundationMemory.projectId, scope),
          ),
        );
      if (input.decision !== "accepted")
        await tx
          .update(foundationInstructionApproval)
          .set({ revokedAt: new Date(at) })
          .where(
            and(
              eq(foundationInstructionApproval.projectId, scope),
              eq(foundationInstructionApproval.memoryId, head.id),
              isNull(foundationInstructionApproval.revokedAt),
            ),
          );
      const result = await port.getMemory(head.id, true);
      if (!result) unavailable();
      return result;
    },
    async verifyMemory(input, actor, at) {
      requireActor(actor, "memory.verify");
      const head = await getHead(input.memoryId);
      if (!head || input.projectId !== scope) unavailable();
      requireFoundationVersion(head.currentVersion, input.expectedVersion);
      await port.assertReferences({
        evidenceIds: input.evidenceIds,
        memoryIds: [],
        configurationIds: [],
      });
      const id = randomUUID();
      await tx.insert(foundationMemoryVerification).values({
        id,
        projectId: scope,
        memoryId: head.id,
        version: head.currentVersion,
        verification: input.verification,
        reason: input.reason,
        actor: actor.principalId,
        createdAt: new Date(at),
      });
      await tx.insert(foundationVerificationEvidence).values(
        input.evidenceIds.map((evidenceId, ordinal) => ({
          verificationId: id,
          projectId: scope,
          evidenceId,
          ordinal,
        })),
      );
      await tx
        .update(foundationMemory)
        .set({ verification: input.verification })
        .where(
          and(
            eq(foundationMemory.id, head.id),
            eq(foundationMemory.projectId, scope),
          ),
        );
      const result = await port.getMemory(head.id, true);
      if (!result) unavailable();
      return result;
    },
    async insertInstructionApproval(record) {
      const parsed = foundationInstructionApprovalSchema.parse(record);
      if (
        context.operation !== "instruction.approve" ||
        parsed.projectId !== scope ||
        parsed.approvedBy !== context.principalId
      )
        unavailable();
      const memory = await port.getMemory(parsed.memoryId, true);
      if (
        !memory ||
        memory.content.category !== "instruction" ||
        memory.lifecycle !== "accepted" ||
        memory.contentDigest !== parsed.contentDigest
      )
        unavailable();
      requireFoundationVersion(memory.version, parsed.version);
      if (
        (await port.getMemoryAnchor(memory.id)).freshness !== "fresh" ||
        (await port.hasUnresolvedContradictions(memory.id))
      )
        throw new FoundationError(
          "APPROVAL_REQUIRED",
          "Instruction context is not eligible",
        );
      if (foundationInstantMilliseconds(parsed.expiresAt) <= now().getTime())
        throw new FoundationError("EXPIRED", "Approval has expired");
      await tx.insert(foundationInstructionApproval).values({
        id: parsed.id,
        projectId: scope,
        memoryId: parsed.memoryId,
        version: parsed.version,
        contentDigest: parsed.contentDigest,
        disclosureProjectId: parsed.disclosureProjectId,
        approvedAt: new Date(parsed.approvedAt),
        expiresAt: new Date(foundationInstantMilliseconds(parsed.expiresAt)),
        approvedBy: parsed.approvedBy,
        revokedAt: null,
      });
      return parsed;
    },
    async insertConfiguration(record) {
      const parsed = foundationConfigurationSchema.parse(record);
      if (
        parsed.projectId !== scope ||
        parsed.recordedBy !== context.principalId ||
        foundationByteDigest(parsed.content) !== parsed.contentDigest
      )
        unavailable();
      await port.assertReferences({
        evidenceIds: [],
        memoryIds: [],
        configurationIds: parsed.parentIds,
      });
      await tx.insert(foundationConfiguration).values({
        id: parsed.id,
        projectId: scope,
        kind: parsed.kind,
        content: parsed.content,
        contentDigest: parsed.contentDigest,
        sourceCommit: parsed.sourceCommit,
        recordedAt: new Date(parsed.recordedAt),
        recordedBy: parsed.recordedBy,
      });
      if (parsed.parentIds.length)
        await tx.insert(foundationConfigurationParent).values(
          parsed.parentIds.map((parentId, ordinal) => ({
            configurationId: parsed.id,
            parentId,
            projectId: scope,
            ordinal,
          })),
        );
      return parsed;
    },
  };
  return port;
}
