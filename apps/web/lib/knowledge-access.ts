import { loadRuntimeConfig } from "@commandry/config";
import { createKnowledgeAccessService } from "@commandry/application";
import { createKnowledgeAccessRepository } from "@commandry/db";
import { KnowledgeAccessError } from "@commandry/domain";
import { getDatabase } from "./database";
import { getAuth } from "./auth";
import { jsonResponse } from "./http";

export const getKnowledgeAccessService = () =>
  createKnowledgeAccessService(
    createKnowledgeAccessRepository(getDatabase().db),
  );

export async function knowledgeOwner(request: Request) {
  const config = loadRuntimeConfig();
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !== config.appOrigin &&
    origin !== config.localAuthTrustedOrigin
  )
    throw new KnowledgeAccessError("UNAUTHORIZED", "Trusted origin required");
  // Client grants must never inherit the unauthenticated local-review identity.
  if (config.humanAuthMode !== "password")
    throw new KnowledgeAccessError(
      "UNAUTHORIZED",
      "Owner password sign-in must be enabled",
    );
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (
    !session ||
    session.user.email.toLowerCase() !== config.initialAdminEmail?.toLowerCase()
  )
    throw new KnowledgeAccessError("UNAUTHORIZED", "Owner sign-in required");
  return `user:${session.user.id}`;
}

export function knowledgeFailure(request: Request, error: unknown) {
  if (error instanceof KnowledgeAccessError)
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "NOT_FOUND" ? 404 : 401,
      "knowledge_access.denied",
    );
  return jsonResponse(
    request,
    { code: "READ_UNAVAILABLE", message: "Knowledge access unavailable" },
    503,
    "knowledge_access.unavailable",
  );
}
