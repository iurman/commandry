import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { account, auditEvent, session, user } from "./schema";

export class OwnerPasswordRecoveryStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerPasswordRecoveryStateError";
  }
}

export function createOwnerPasswordRecoveryRepository(db: CommandryDatabase) {
  return {
    async resetOnlyOwnerPassword(input: {
      expectedEmail: string;
      newPassword: string;
    }) {
      const passwordHash = await hashPassword(input.newPassword);
      return db.transaction(async (tx) => {
        const owners = await tx
          .select({ id: user.id, email: user.email })
          .from(user)
          .limit(2)
          .for("update");
        const owner = owners[0];
        if (
          owners.length !== 1 ||
          !owner ||
          owner.email.toLowerCase() !== input.expectedEmail
        ) {
          throw new OwnerPasswordRecoveryStateError(
            "Recovery requires exactly one matching owner account.",
          );
        }
        const accounts = await tx
          .select({
            id: account.id,
            providerId: account.providerId,
            password: account.password,
          })
          .from(account)
          .where(eq(account.userId, owner.id))
          .for("update");
        const credential = accounts[0];
        if (
          accounts.length !== 1 ||
          credential?.providerId !== "credential" ||
          !credential.password
        ) {
          throw new OwnerPasswordRecoveryStateError(
            "Recovery requires one existing credential account.",
          );
        }
        await tx
          .update(account)
          .set({ password: passwordHash, updatedAt: new Date() })
          .where(eq(account.id, credential.id));
        const revoked = await tx
          .delete(session)
          .where(eq(session.userId, owner.id))
          .returning({ id: session.id });
        const auditEventId = randomUUID();
        await tx.insert(auditEvent).values({
          id: auditEventId,
          actor: "local-operator-cli",
          operation: "auth.owner_password_recovered",
          details: {
            ownerEmail: owner.email.toLowerCase(),
            revokedSessionCount: revoked.length,
          },
        });
        return {
          auditEventId,
          revokedSessionCount: revoked.length,
        };
      });
    },
  };
}
