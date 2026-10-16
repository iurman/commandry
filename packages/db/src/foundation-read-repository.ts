import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  FoundationInventoryQuery,
  FoundationInventoryRecords,
  FoundationMachineRequest,
  FoundationWorkingContextCandidate,
} from "@commandry/application";
import {
  foundationConfigurationSummarySchema,
  foundationEvidenceSummarySchema,
  foundationMemorySummarySchema,
  foundationActorSchema,
  foundationClientSchema,
  foundationInstructionApprovalSchema,
  type FoundationClient,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationInstantMilliseconds,
  requireFoundationGrant,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { project } from "./schema";
import {
  foundationAudit,
  foundationClient,
  foundationConfiguration,
  foundationEvidence,
  foundationInstructionApproval,
  foundationMemory,
  foundationMemoryRevision,
} from "./foundation-schema";
import {
  createFoundationRecordRepository,
  type FoundationTransaction,
} from "./foundation-record-repository";

interface FoundationReadRecords extends FoundationInventoryRecords {
  getCandidates(input: FoundationInventoryQuery): Promise<{
    candidates: FoundationWorkingContextCandidate[];
    nextCursor: string | null;
    asOf: string;
  }>;
}

function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid foundation read record",
  );
}

function clientRecord(row: typeof foundationClient.$inferSelect) {
  return foundationClientSchema.parse({
    schemaVersion: 1,
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    operations: row.operations,
    environment: row.environment,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
  });
}

function page<T extends { id: string }>(
  rows: T[],
  input: FoundationInventoryQuery,
) {
  const items = rows.slice(0, input.limit);
  return {
    items,
    nextCursor: rows.length > input.limit ? items.at(-1)!.id : null,
    asOf: input.asOf,
  };
}

function records(
  tx: FoundationTransaction,
  request: FoundationMachineRequest,
  principalId: string,
  now: () => Date,
  retainApprovalDeadline: (expiry: Date) => void,
): FoundationReadRecords {
  const scope = request.projectId;
  const core = createFoundationRecordRepository(
    tx,
    { ...request, principalId },
    now,
    () => invalid(),
  );
  const first = alias(foundationMemoryRevision, "foundation_first_revision");
  const cutoff = (input: FoundationInventoryQuery) => {
    if (input.projectId !== scope) invalid();
    // Application ingests use Date milliseconds. Never let a database parser
    // round a long ISO fraction into the following millisecond.
    return new Date(foundationInstantMilliseconds(input.asOf));
  };
  const memoryRows = (input: FoundationInventoryQuery) =>
    tx
      .select({
        id: foundationMemory.id,
        projectId: foundationMemory.projectId,
        knowledgeItemId: foundationMemory.knowledgeItemId,
        version: foundationMemory.currentVersion,
        contentDigest: foundationMemoryRevision.contentDigest,
        lifecycle: foundationMemory.lifecycle,
        verification: foundationMemory.verification,
        category: foundationMemoryRevision.category,
        recordedAt: foundationMemoryRevision.recordedAt,
      })
      .from(foundationMemory)
      .innerJoin(
        foundationMemoryRevision,
        and(
          eq(foundationMemoryRevision.memoryId, foundationMemory.id),
          eq(foundationMemoryRevision.projectId, scope),
          eq(foundationMemoryRevision.version, foundationMemory.currentVersion),
        ),
      )
      .innerJoin(
        first,
        and(
          eq(first.memoryId, foundationMemory.id),
          eq(first.projectId, scope),
          eq(first.version, 1),
        ),
      )
      .where(
        and(
          eq(foundationMemory.projectId, scope),
          lte(first.recordedAt, cutoff(input)),
          input.after ? gt(foundationMemory.id, input.after) : undefined,
        ),
      )
      .orderBy(asc(foundationMemory.id))
      .limit(input.limit + 1);

  return {
    async listEvidence(input) {
      const rows = await tx
        .select()
        .from(foundationEvidence)
        .where(
          and(
            eq(foundationEvidence.projectId, scope),
            lte(foundationEvidence.ingestedAt, cutoff(input)),
            input.after ? gt(foundationEvidence.id, input.after) : undefined,
          ),
        )
        .orderBy(asc(foundationEvidence.id))
        .limit(input.limit + 1);
      return page(
        rows.map((row) =>
          foundationEvidenceSummarySchema.parse({
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
          }),
        ),
        input,
      );
    },
    async listMemory(input) {
      const rows = await memoryRows(input);
      return page(
        rows.map((row) =>
          foundationMemorySummarySchema.parse({
            ...row,
            recordedAt: row.recordedAt.toISOString(),
          }),
        ),
        input,
      );
    },
    async listConfigurations(input) {
      const rows = await tx
        .select({
          id: foundationConfiguration.id,
          projectId: foundationConfiguration.projectId,
          kind: foundationConfiguration.kind,
          contentDigest: foundationConfiguration.contentDigest,
          recordedAt: foundationConfiguration.recordedAt,
        })
        .from(foundationConfiguration)
        .where(
          and(
            eq(foundationConfiguration.projectId, scope),
            lte(foundationConfiguration.recordedAt, cutoff(input)),
            input.after
              ? gt(foundationConfiguration.id, input.after)
              : undefined,
          ),
        )
        .orderBy(asc(foundationConfiguration.id))
        .limit(input.limit + 1);
      return page(
        rows.map((row) =>
          foundationConfigurationSummarySchema.parse({
            ...row,
            recordedAt: row.recordedAt.toISOString(),
          }),
        ),
        input,
      );
    },
    async getCandidates(input) {
      const selected = page(await memoryRows(input), input);
      const candidates: FoundationWorkingContextCandidate[] = [];
      for (const head of selected.items) {
        const memory = await core.getMemory(head.id, false);
        if (!memory) invalid();
        const evidenceIds = memory.content.evidenceIds;
        const evidences: FoundationWorkingContextCandidate["evidences"][number][] =
          [];
        for (let start = 0; start < evidenceIds.length; start += 1000) {
          const rows = await tx
            .select()
            .from(foundationEvidence)
            .where(
              and(
                eq(foundationEvidence.projectId, scope),
                inArray(
                  foundationEvidence.id,
                  evidenceIds.slice(start, start + 1000),
                ),
              ),
            );
          for (const row of rows) {
            evidences.push(
              foundationEvidenceSummarySchema.parse({
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
              }),
            );
          }
        }
        if (evidences.length !== evidenceIds.length) invalid();
        const at = now();
        const [approval] = await tx
          .select()
          .from(foundationInstructionApproval)
          .where(
            and(
              eq(foundationInstructionApproval.projectId, scope),
              eq(foundationInstructionApproval.memoryId, memory.id),
              eq(foundationInstructionApproval.version, memory.version),
              eq(
                foundationInstructionApproval.contentDigest,
                memory.contentDigest,
              ),
              eq(foundationInstructionApproval.disclosureProjectId, scope),
              isNull(foundationInstructionApproval.revokedAt),
              lte(foundationInstructionApproval.approvedAt, at),
              gt(foundationInstructionApproval.expiresAt, at),
            ),
          )
          .orderBy(
            desc(foundationInstructionApproval.approvedAt),
            desc(foundationInstructionApproval.id),
          )
          .limit(1);
        if (approval) retainApprovalDeadline(approval.expiresAt);
        candidates.push({
          memory,
          evidences,
          approval: approval
            ? foundationInstructionApprovalSchema.parse({
                schemaVersion: 1,
                ...approval,
                approvedAt: approval.approvedAt.toISOString(),
                expiresAt: approval.expiresAt.toISOString(),
                revokedAt: approval.revokedAt?.toISOString() ?? null,
              })
            : null,
          anchor: await core.getMemoryAnchor(memory.id),
          hasUnresolvedContradictions: await core.hasUnresolvedContradictions(
            memory.id,
          ),
        });
      }
      return {
        candidates,
        nextCursor: selected.nextCursor,
        asOf: selected.asOf,
      };
    },
  };
}

/** One connection and transaction through grant, memory/source locks, selection
 * and audit. The caller supplies only a credential digest, never an actor grant. */
/** Trusted server composition only. All separately granted read surfaces retain the same grant
 * locks, expiry checks, rollback and audit transaction. JSON input cannot supply
 * a factory or choose an operation outside its separately issued grant. */
export function createFoundationProjectReadAccessRepository<Records>(
  db: CommandryDatabase,
  requiredOperation:
    | "foundation.read"
    | "work.read"
    | "resources.read"
    | "observatory.read"
    | "observatory.signals.read"
    | "observatory.security.read"
    | "observatory.providers.read",
  makeRecords: (
    tx: FoundationTransaction,
    request: FoundationMachineRequest,
    principalId: string,
    now: () => Date,
    retainApprovalDeadline: (expiry: Date) => void,
  ) => Records,
  options: { now?: () => Date } = {},
) {
  if (
    requiredOperation !== "foundation.read" &&
    requiredOperation !== "work.read" &&
    requiredOperation !== "resources.read" &&
    requiredOperation !== "observatory.read" &&
    requiredOperation !== "observatory.signals.read" &&
    requiredOperation !== "observatory.security.read" &&
    requiredOperation !== "observatory.providers.read"
  )
    throw new FoundationError("FORBIDDEN");
  const now = options.now ?? (() => new Date());
  return {
    async withClient<T>(
      request: FoundationMachineRequest,
      callback: (client: FoundationClient, records: Records) => Promise<T>,
    ): Promise<T> {
      const parsed = foundationActorSchema.safeParse({
        schemaVersion: 1,
        principalId: "read-context",
        clientId: request.targetId,
        projectId: request.projectId,
        environment: request.environment,
        expiresAt: "9999-01-01T00:00:00Z",
        correlationId: request.correlationId,
        runId: null,
        resourceIds: [],
        capabilities: [request.operation],
      });
      if (
        !parsed.success ||
        parsed.data.projectId !== request.projectId ||
        parsed.data.correlationId !== request.correlationId ||
        request.operation !== requiredOperation ||
        request.targetId !== null
      )
        throw new FoundationError("FORBIDDEN");
      if (!/^[a-f0-9]{64}$/.test(request.tokenDigest))
        throw new FoundationError("INVALID_CREDENTIAL");
      const outcome = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(foundationClient)
          .where(eq(foundationClient.tokenDigest, request.tokenDigest))
          .for("share");
        if (!row) throw new FoundationError("INVALID_CREDENTIAL");
        const client = clientRecord(row);
        const principalId = "foundation-client:" + client.id;
        const authorize = () =>
          requireFoundationGrant(client, { ...request, now: now() });
        const audit = async (
          transaction: FoundationTransaction,
          decision: "allowed" | "denied",
          code: string,
        ) => {
          await transaction.insert(foundationAudit).values({
            id: randomUUID(),
            projectId: client.projectId,
            environment: client.environment,
            principalId,
            clientId: client.id,
            operation: requiredOperation,
            targetId: null,
            correlationId: request.correlationId,
            decision,
            code,
          });
        };
        let failure: FoundationError | null = null;
        let value: T | undefined;
        let contextExpiry = Infinity;
        const requireCurrentContext = () => {
          authorize();
          if (contextExpiry <= now().getTime())
            throw new FoundationError("EXPIRED");
        };
        try {
          value = await tx.transaction(async (operation) => {
            authorize();
            const [exists] = await operation
              .select({ id: project.id })
              .from(project)
              .where(eq(project.id, request.projectId))
              .for("share");
            if (!exists) throw new FoundationError("NOT_FOUND");
            authorize();
            await operation.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${"foundation-memory:" + request.projectId}, 0))`,
            );
            authorize();
            const result = await callback(
              client,
              makeRecords(operation, request, principalId, now, (expiry) => {
                contextExpiry = Math.min(contextExpiry, expiry.getTime());
              }),
            );
            requireCurrentContext();
            await audit(operation, "allowed", "OK");
            requireCurrentContext();
            return result;
          });
        } catch (error) {
          if (!(error instanceof FoundationError)) throw error;
          failure = new FoundationError(error.code);
        }
        if (failure) {
          try {
            authorize();
          } catch (error) {
            if (!(error instanceof FoundationError)) throw error;
            failure = new FoundationError(error.code);
          }
          await audit(tx, "denied", failure.code);
        }
        return { value, failure, requireCurrentContext };
      });
      if (outcome.failure) throw outcome.failure;
      // A slow commit can cross either deadline after the transaction callback.
      // The completed read audit remains historical evidence; withhold delivery.
      outcome.requireCurrentContext();
      return outcome.value as T;
    },
  };
}

export function createFoundationReadAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
) {
  return createFoundationProjectReadAccessRepository(
    db,
    "foundation.read",
    records,
    options,
  );
}
