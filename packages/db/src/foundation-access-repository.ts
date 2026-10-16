import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import type {
  FoundationAccessPort,
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
  foundationDigest,
  requireFoundationGrant,
  type FoundationEnvironment,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { project } from "./schema";
import {
  foundationAudit,
  foundationClient,
  foundationIdempotency,
} from "./foundation-schema";
import {
  createFoundationRecordRepository,
  foundationByteDigest,
  type FoundationTransaction,
} from "./foundation-record-repository";

function clientRecord(
  row: typeof foundationClient.$inferSelect,
): FoundationClient {
  return foundationClientSchema.parse({
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
}

function requireOwner(
  identity: FoundationIdentity,
  projectId: string,
  environment: FoundationEnvironment,
  now: Date,
) {
  const parsed = foundationActorSchema.safeParse({
    schemaVersion: 1,
    principalId: identity.principalId,
    expiresAt: identity.expiresAt,
    projectId,
    environment,
    clientId: null,
    runId: null,
    resourceIds: [],
    capabilities: [],
    correlationId: "00000000-0000-4000-8000-000000000000",
  });
  if (
    !parsed.success ||
    !Number.isFinite(now.getTime()) ||
    Date.parse(identity.expiresAt) <= now.getTime()
  ) {
    throw new FoundationError("EXPIRED", "Owner session unavailable");
  }
}

function knownFailure(error: unknown): FoundationError | null {
  if (error instanceof FoundationError) return error;
  // Drizzle wraps PostgreSQL errors. Never include driver messages/parameters in a safe error.
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
        "IDEMPOTENCY_CONFLICT",
        "Record identity already exists",
      );
    if (pg.code === "23503" || pg.code === "23514")
      return new FoundationError(
        "INVALID_REFERENCE",
        "Reference unavailable in scope",
      );
  }
  return null;
}

/** Owns authorization locks, savepoint rollback, idempotency and the same-transaction audit. */
export function createFoundationAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationAccessPort {
  const now = options.now ?? (() => new Date());
  const lockProject = async (
    tx: FoundationTransaction,
    context: FoundationOperationContext,
  ) => {
    if (
      context.operation.startsWith("memory.") ||
      context.operation === "instruction.approve"
    ) {
      // Serialize authority-changing assertions, including inbound contradiction edits.
      // No external work is permitted while this project-scoped lock is held.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`foundation-memory:${context.projectId}`}, 0))`,
      );
    }
  };
  const audit = async (
    tx: FoundationTransaction,
    context: Omit<FoundationOperationContext, "operation"> & {
      operation: string;
    },
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
      decision,
      code,
      targetId: context.targetId,
      correlationId: context.correlationId,
    });
  };
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

  return {
    async withClient(request, action) {
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
        const principalId = `foundation-client:${row.id}`;
        let replayed = false;
        let value: Awaited<ReturnType<typeof action>> | undefined;
        let failure: FoundationError | null = null;
        try {
          value = await tx.transaction(async (operation) => {
            requireFoundationGrant(client, { ...request, now: now() });
            await lockProject(operation, request);
            const result = await action(
              client,
              createFoundationRecordRepository(
                operation,
                { ...request, principalId },
                now,
                () => {
                  replayed = true;
                },
              ),
            );
            requireFoundationGrant(client, { ...request, now: now() });
            return result;
          });
        } catch (error) {
          failure = knownFailure(error);
          if (!failure) throw error;
        }
        // Attribute denied cross-project requests to the credential's own project.
        await audit(
          tx,
          {
            ...request,
            projectId: row.projectId,
            environment: client.environment,
          },
          principalId,
          row.id,
          failure ? "denied" : "allowed",
          failure?.code ?? (replayed ? "REPLAYED" : "OK"),
        );
        return { value, failure };
      });
      if (outcome.failure) throw outcome.failure;
      return outcome.value as Awaited<ReturnType<typeof action>>;
    },
    async withOwner(request, action) {
      const outcome = await db.transaction(async (tx) => {
        await projectExists(tx, request.projectId);
        let replayed = false;
        let value: Awaited<ReturnType<typeof action>> | undefined;
        let failure: FoundationError | null = null;
        try {
          value = await tx.transaction(async (operation) => {
            requireOwner(
              request,
              request.projectId,
              request.environment,
              now(),
            );
            await lockProject(operation, request);
            requireOwner(
              request,
              request.projectId,
              request.environment,
              now(),
            );
            const result = await action(
              createFoundationRecordRepository(operation, request, now, () => {
                replayed = true;
              }),
            );
            requireOwner(
              request,
              request.projectId,
              request.environment,
              now(),
            );
            return result;
          });
        } catch (error) {
          failure = knownFailure(error);
          if (!failure) throw error;
        }
        await audit(
          tx,
          request,
          request.principalId,
          null,
          failure ? "denied" : "allowed",
          failure?.code ?? (replayed ? "REPLAYED" : "OK"),
        );
        return { value, failure };
      });
      if (outcome.failure) throw outcome.failure;
      return outcome.value as Awaited<ReturnType<typeof action>>;
    },
    async issueClient(input) {
      return db.transaction(async (tx) => {
        const client = foundationClientSchema.parse(input.client);
        await projectExists(tx, client.projectId);
        requireOwner(
          input.identity,
          client.projectId,
          client.environment,
          now(),
        );
        const keyDigest = foundationByteDigest(input.idempotencyKey);
        const operation = "foundation.client.created";
        const lock = foundationDigest({
          projectId: client.projectId,
          environment: client.environment,
          principalId: input.identity.principalId,
          operation,
          keyDigest,
        });
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`,
        );
        requireOwner(
          input.identity,
          client.projectId,
          client.environment,
          now(),
        );
        const [prior] = await tx
          .select()
          .from(foundationIdempotency)
          .where(
            and(
              eq(foundationIdempotency.projectId, client.projectId),
              eq(foundationIdempotency.environment, client.environment),
              eq(foundationIdempotency.principalId, input.identity.principalId),
              eq(foundationIdempotency.operation, operation),
              eq(foundationIdempotency.keyDigest, keyDigest),
            ),
          );
        if (prior) {
          if (prior.requestDigest !== input.requestDigest)
            throw new FoundationError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key has different input",
            );
          if (foundationDigest(prior.result) !== prior.resultDigest)
            throw new FoundationError(
              "INVALID_REFERENCE",
              "Stored operation result is invalid",
            );
          const original = foundationClientSchema.parse(prior.result);
          await audit(
            tx,
            {
              projectId: client.projectId,
              environment: client.environment,
              operation,
              correlationId: input.correlationId,
              targetId: original.id,
            },
            input.identity.principalId,
            null,
            "denied",
            "CREDENTIAL_ALREADY_ISSUED",
          );
          return { client: original, created: false };
        }
        if (
          client.createdBy !== input.identity.principalId ||
          client.revokedAt !== null
        )
          throw new FoundationError("FORBIDDEN", "Client issuance unavailable");
        const [row] = await tx
          .insert(foundationClient)
          .values({
            id: client.id,
            projectId: client.projectId,
            name: client.name,
            operations: client.operations,
            environment: client.environment,
            tokenDigest: input.tokenDigest,
            createdBy: client.createdBy,
            createdAt: new Date(client.createdAt),
            expiresAt: new Date(client.expiresAt),
            revokedAt: null,
          })
          .returning();
        if (!row) throw new Error("Foundation client insert returned no row");
        const record = clientRecord(row);
        await tx.insert(foundationIdempotency).values({
          projectId: client.projectId,
          environment: client.environment,
          principalId: input.identity.principalId,
          operation,
          keyDigest,
          requestDigest: input.requestDigest,
          result: record,
          resultDigest: foundationDigest(record),
          correlationId: input.correlationId,
        });
        requireOwner(
          input.identity,
          client.projectId,
          client.environment,
          now(),
        );
        await audit(
          tx,
          {
            projectId: client.projectId,
            environment: client.environment,
            operation,
            correlationId: input.correlationId,
            targetId: client.id,
          },
          input.identity.principalId,
          null,
          "allowed",
          "CREATED",
        );
        return { client: record, created: true };
      });
    },
    async listClients(input, identity, environment, correlationId) {
      return db.transaction(async (tx) => {
        await projectExists(tx, input.projectId);
        requireOwner(identity, input.projectId, environment, now());
        const asOf = input.asOf ?? now().toISOString();
        const rows = await tx
          .select()
          .from(foundationClient)
          .where(
            and(
              eq(foundationClient.projectId, input.projectId),
              eq(foundationClient.environment, environment),
              lte(foundationClient.createdAt, new Date(asOf)),
              input.after ? gt(foundationClient.id, input.after) : undefined,
            ),
          )
          .orderBy(asc(foundationClient.id))
          .limit(input.limit + 1);
        const page = rows.slice(0, input.limit);
        const items = page.map(clientRecord);
        requireOwner(identity, input.projectId, environment, now());
        await audit(
          tx,
          {
            projectId: input.projectId,
            environment,
            operation: "foundation.client.listed",
            correlationId,
            targetId: null,
          },
          identity.principalId,
          null,
          "allowed",
          "OK",
        );
        return {
          items,
          nextCursor: rows.length > input.limit ? page.at(-1)!.id : null,
          asOf,
        };
      });
    },
    async revokeClient(clientId, identity, environment, correlationId) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(foundationClient)
          .where(
            and(
              eq(foundationClient.id, clientId),
              eq(foundationClient.environment, environment),
            ),
          )
          .for("update");
        if (!row) throw new FoundationError("NOT_FOUND", "Client unavailable");
        requireOwner(identity, row.projectId, environment, now());
        if (row.revokedAt) return clientRecord(row);
        const [updated] = await tx
          .update(foundationClient)
          .set({ revokedAt: now() })
          .where(eq(foundationClient.id, clientId))
          .returning();
        if (!updated) throw new Error("Locked foundation client disappeared");
        const record = clientRecord(updated);
        requireOwner(identity, row.projectId, environment, now());
        await audit(
          tx,
          {
            projectId: row.projectId,
            environment,
            operation: "foundation.client.revoked",
            correlationId,
            targetId: clientId,
          },
          identity.principalId,
          null,
          "allowed",
          "REVOKED",
        );
        return record;
      });
    },
  };
}
