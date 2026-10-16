import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type {
  FoundationEvaluationPort,
  FoundationIdentity,
  FoundationOperationContext,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationClientSchema,
  type FoundationClient,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationInstantMilliseconds,
  requireFoundationGrant,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { project } from "./schema";
import { foundationAudit, foundationClient } from "./foundation-schema";
import type { FoundationTransaction } from "./foundation-record-repository";
import { createFoundationEvaluationRecordRepository } from "./foundation-evaluation-record-repository";

function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid evaluation authorization record",
  );
}
function clientRecord(
  row: typeof foundationClient.$inferSelect,
): FoundationClient {
  for (const at of [row.createdAt, row.expiresAt, row.revokedAt]) {
    if (
      at !== null &&
      (!(at instanceof Date) || !Number.isFinite(at.getTime()))
    )
      invalid();
  }
  const parsed = foundationClientSchema.safeParse({
    schemaVersion: 1,
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    operations: row.operations,
    environment: row.environment,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  });
  if (!parsed.success) invalid();
  return parsed.data;
}
function requireContext(context: FoundationOperationContext) {
  const parsed = foundationActorSchema.safeParse({
    schemaVersion: 1,
    principalId: "evaluation-context",
    expiresAt: "9999-01-01T00:00:00Z",
    projectId: context.projectId,
    environment: context.environment,
    clientId: context.targetId,
    runId: null,
    resourceIds: [],
    capabilities: [context.operation],
    correlationId: context.correlationId,
  });
  if (
    !parsed.success ||
    parsed.data.projectId !== context.projectId ||
    parsed.data.correlationId !== context.correlationId ||
    parsed.data.clientId !== context.targetId
  )
    throw new FoundationError(
      "FORBIDDEN",
      "Invalid evaluation operation context",
    );
}
function requireOwner(
  identity: FoundationIdentity,
  context: FoundationOperationContext,
  at: Date,
) {
  const parsed = foundationActorSchema.safeParse({
    schemaVersion: 1,
    principalId: identity.principalId,
    expiresAt: identity.expiresAt,
    projectId: context.projectId,
    environment: context.environment,
    clientId: null,
    runId: null,
    resourceIds: [],
    capabilities: [context.operation],
    correlationId: context.correlationId,
  });
  if (
    !parsed.success ||
    !(at instanceof Date) ||
    !Number.isFinite(at.getTime()) ||
    foundationInstantMilliseconds(identity.expiresAt) <= at.getTime()
  )
    throw new FoundationError("EXPIRED", "Owner session unavailable");
  if (
    context.operation !== "evaluation.record" ||
    identity.principalId.startsWith("foundation-client:")
  )
    throw new FoundationError(
      "FORBIDDEN",
      "Owner evaluation operation unavailable",
    );
}
function knownFailure(error: unknown): FoundationError | null {
  if (error instanceof FoundationError) return new FoundationError(error.code);
  // Drizzle wraps driver failures; only recognized foundation constraints have
  // a public mapping. Never return driver messages, parameters or payloads.
  const pg = error instanceof Error && "cause" in error ? error.cause : error;
  if (
    pg &&
    typeof pg === "object" &&
    "code" in pg &&
    "constraint" in pg &&
    typeof pg.constraint === "string" &&
    pg.constraint.startsWith("foundation_")
  ) {
    if (pg.code === "23505")
      return new FoundationError(
        pg.constraint.startsWith("foundation_idempotency")
          ? "IDEMPOTENCY_CONFLICT"
          : "VERSION_CONFLICT",
      );
    if (pg.code === "23503" || pg.code === "23514")
      return new FoundationError("INVALID_REFERENCE");
  }
  return null;
}

/** Locks the grant before the project lock and holds it through audit/commit.
 * Trusted owner session authentication and revocation belong to the caller's
 * session adapter; an identity shape alone never proves a human session. */
export function createFoundationEvaluationAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationEvaluationPort {
  const now = options.now ?? (() => new Date());
  const projectExists = async (
    tx: FoundationTransaction,
    projectId: string,
  ) => {
    const [row] = await tx
      .select({ id: project.id })
      .from(project)
      .where(eq(project.id, projectId))
      .for("share");
    if (!row) throw new FoundationError("NOT_FOUND", "Project unavailable");
  };
  const lockProject = async (tx: FoundationTransaction, projectId: string) => {
    // Evaluation records have project scope across every environment. Reads use
    // the same lock as appends so report and next-version decisions are complete.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"foundation-evaluation:" + projectId}, 0))`,
    );
  };
  const audit = async (
    tx: FoundationTransaction,
    context: FoundationOperationContext,
    principalId: string,
    clientId: string | null,
    decision: "allowed" | "denied",
    code: string,
  ) => {
    await tx.insert(foundationAudit).values({
      id: randomUUID(),
      projectId: context.projectId,
      environment: context.environment,
      principalId,
      clientId,
      operation: context.operation,
      targetId: context.targetId,
      correlationId: context.correlationId,
      decision,
      code,
    });
  };
  return {
    async withClient(request, callback) {
      requireContext(request);
      if (!/^[a-f0-9]{64}$/.test(request.tokenDigest))
        throw new FoundationError(
          "INVALID_CREDENTIAL",
          "Foundation credential unavailable",
        );
      const outcome = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(foundationClient)
          .where(eq(foundationClient.tokenDigest, request.tokenDigest))
          .for("share");
        if (!row)
          throw new FoundationError(
            "INVALID_CREDENTIAL",
            "Foundation credential unavailable",
          );
        const client = clientRecord(row);
        const principalId = "foundation-client:" + client.id;
        const authorize = () => {
          requireFoundationGrant(client, { ...request, now: now() });
          if (
            request.operation !== "evaluation.record" &&
            request.operation !== "foundation.read"
          )
            throw new FoundationError(
              "FORBIDDEN",
              "Evaluation operation unavailable",
            );
        };
        let replayed = false;
        let value: Awaited<ReturnType<typeof callback>> | undefined;
        let failure: FoundationError | null = null;
        try {
          value = await tx.transaction(async (operation) => {
            authorize();
            await projectExists(operation, request.projectId);
            authorize();
            await lockProject(operation, request.projectId);
            authorize();
            const result = await callback(
              client,
              createFoundationEvaluationRecordRepository(
                operation,
                { ...request, principalId },
                now,
                () => {
                  replayed = true;
                },
              ),
            );
            authorize();
            await audit(
              operation,
              request,
              principalId,
              client.id,
              "allowed",
              replayed ? "REPLAYED" : "OK",
            );
            // A clock crossing during an audit wait rolls back the entire
            // savepoint, including effects, receipts and its allowed audit.
            authorize();
            return result;
          });
        } catch (error) {
          failure = knownFailure(error);
          if (!failure) throw error;
        }
        if (failure) {
          // The callback savepoint is already rolled back. A cross-project
          // denial belongs to the credential's own project/environment.
          try {
            authorize();
          } catch (error) {
            const denied = knownFailure(error);
            if (!denied) throw error;
            failure = denied;
          }
          await audit(
            tx,
            {
              ...request,
              projectId: client.projectId,
              environment: client.environment,
            },
            principalId,
            client.id,
            "denied",
            failure.code,
          );
        }
        return { value, failure };
      });
      if (outcome.failure) throw outcome.failure;
      return outcome.value as Awaited<ReturnType<typeof callback>>;
    },
    async withOwner(request, callback) {
      requireContext(request);
      const outcome = await db.transaction(async (tx) => {
        const authorize = () => requireOwner(request, request, now());
        let replayed = false;
        let value: Awaited<ReturnType<typeof callback>> | undefined;
        let failure: FoundationError | null = null;
        try {
          value = await tx.transaction(async (operation) => {
            authorize();
            await projectExists(operation, request.projectId);
            authorize();
            await lockProject(operation, request.projectId);
            authorize();
            const result = await callback(
              createFoundationEvaluationRecordRepository(
                operation,
                request,
                now,
                () => {
                  replayed = true;
                },
              ),
            );
            authorize();
            await audit(
              operation,
              request,
              request.principalId,
              null,
              "allowed",
              replayed ? "REPLAYED" : "OK",
            );
            authorize();
            return result;
          });
        } catch (error) {
          failure = knownFailure(error);
          if (!failure) throw error;
        }
        if (failure) {
          try {
            authorize();
          } catch (error) {
            const denied = knownFailure(error);
            if (!denied) throw error;
            failure = denied;
          }
          await audit(
            tx,
            request,
            request.principalId,
            null,
            "denied",
            failure.code,
          );
        }
        return { value, failure };
      });
      if (outcome.failure) throw outcome.failure;
      return outcome.value as Awaited<ReturnType<typeof callback>>;
    },
  };
}
