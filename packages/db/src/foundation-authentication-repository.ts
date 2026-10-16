import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FoundationAuthenticationPort } from "@commandry/application";
import { foundationClientSchema } from "@commandry/contracts";
import { FoundationError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { foundationAudit, foundationClient } from "./foundation-schema";

/** Authenticates only the credential's own metadata; never supplies product data. */
export function createFoundationAuthenticationRepository(
  db: CommandryDatabase,
): FoundationAuthenticationPort {
  return {
    async withClientIdentity(request, action) {
      const outcome = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(foundationClient)
          .where(eq(foundationClient.tokenDigest, request.tokenDigest))
          .for("share");
        if (!row)
          throw new FoundationError(
            "INVALID_CREDENTIAL",
            "Credential unavailable",
          );
        const client = foundationClientSchema.parse({
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
        let failure: FoundationError | null = null;
        let value: Awaited<ReturnType<typeof action>> | undefined;
        try {
          value = await action(client);
        } catch (error) {
          if (!(error instanceof FoundationError)) throw error;
          failure = error;
        }
        await tx.insert(foundationAudit).values({
          id: randomUUID(),
          projectId: row.projectId,
          environment: row.environment,
          principalId: `foundation-client:${row.id}`,
          clientId: row.id,
          operation: "foundation.client.authenticated",
          decision: failure ? "denied" : "allowed",
          code: failure?.code ?? "OK",
          targetId: row.id,
          correlationId: request.correlationId,
        });
        return { value, failure };
      });
      if (outcome.failure) throw outcome.failure;
      return outcome.value as Awaited<ReturnType<typeof action>>;
    },
  };
}
