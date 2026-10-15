import { createHash } from "node:crypto";

export class KnowledgeAccessError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHORIZED"
      | "TOKEN_INVALID"
      | "CLIENT_EXPIRED"
      | "CLIENT_REVOKED"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeAccessError";
  }
}

export function knowledgeTokenDigest(token: string) {
  if (!/^ck_[A-Za-z0-9_-]{43}$/.test(token))
    throw new KnowledgeAccessError("TOKEN_INVALID", "Read credential required");
  return createHash("sha256").update(token).digest("hex");
}

export function requireKnowledgeClient(
  client: {
    expiresAt: string;
    revokedAt: string | null;
  },
  now = new Date(),
) {
  if (client.revokedAt)
    throw new KnowledgeAccessError("CLIENT_REVOKED", "Read access revoked");
  if (Date.parse(client.expiresAt) <= now.getTime())
    throw new KnowledgeAccessError("CLIENT_EXPIRED", "Read access expired");
}
