import { loadRuntimeConfig } from "@commandry/config";
import {
  createFoundationAuthenticationService,
  createFoundationMachineService,
  createFoundationOwnerService,
} from "@commandry/application";
import {
  createFoundationAccessRepository,
  createFoundationAuthenticationRepository,
} from "@commandry/db";
import { FoundationError } from "@commandry/domain";
import { ZodError } from "zod";
import { getDatabase } from "./database";
import { getAuth } from "./auth";
import { jsonResponse } from "./http";

export function requireFoundationOrigin(request: Request) {
  const config = loadRuntimeConfig();
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !== config.appOrigin &&
    origin !== config.localAuthTrustedOrigin
  )
    throw new FoundationError("FORBIDDEN", "Trusted origin required");
}

export function getFoundationServices() {
  const options = { environment: loadRuntimeConfig().appEnv };
  const db = getDatabase().db;
  return {
    machine: createFoundationMachineService(
      createFoundationAccessRepository(db),
      options,
    ),
    authentication: createFoundationAuthenticationService(
      createFoundationAuthenticationRepository(db),
      options,
    ),
  };
}

export async function foundationOwner(request: Request) {
  requireFoundationOrigin(request);
  const config = loadRuntimeConfig();
  if (config.humanAuthMode !== "password")
    throw new FoundationError(
      "INVALID_CREDENTIAL",
      "Owner password sign-in required",
    );
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (
    !session ||
    session.user.email.toLowerCase() !== config.initialAdminEmail?.toLowerCase()
  )
    throw new FoundationError("INVALID_CREDENTIAL", "Owner sign-in required");
  const expiresAt = new Date(session.session.expiresAt);
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  )
    throw new FoundationError("EXPIRED", "Owner session expired");
  return createFoundationOwnerService(
    createFoundationAccessRepository(getDatabase().db),
    {
      principalId: `user:${session.user.id}`,
      expiresAt: expiresAt.toISOString(),
    },
    { environment: config.appEnv },
  );
}

export function foundationFailure(request: Request, error: unknown) {
  if (error instanceof ZodError)
    return jsonResponse(
      request,
      { code: "INVALID_INPUT" },
      400,
      "foundation.request.denied",
    );
  if (error instanceof FoundationError) {
    const status = (
      {
        INVALID_CREDENTIAL: 401,
        EXPIRED: 401,
        REVOKED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        VERSION_CONFLICT: 409,
        IDEMPOTENCY_CONFLICT: 409,
        INVALID_REFERENCE: 400,
        APPROVAL_REQUIRED: 403,
      } as const
    )[error.code];
    return jsonResponse(
      request,
      { code: error.code },
      status,
      "foundation.request.denied",
    );
  }
  return jsonResponse(
    request,
    { code: "FOUNDATION_UNAVAILABLE" },
    503,
    "foundation.request.unavailable",
  );
}
