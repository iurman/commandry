import { loadRuntimeConfig } from "@commandry/config";
import {
  createFoundationAuthenticationService,
  createFoundationMachineService,
  createFoundationOwnerService,
  createFoundationEvaluationService,
  createFoundationEvaluationOwnerService,
  createFoundationInventoryService,
  createFoundationGeneralContextService,
  createFoundationWorkService,
  createFoundationTaskProposalService,
  createMnemosyneSelectedImportService,
  FoundationImportUnavailableError,
} from "@commandry/application";
import {
  createFoundationAccessRepository,
  createFoundationAuthenticationRepository,
  createFoundationEvaluationAccessRepository,
  createFoundationReadAccessRepository,
  createFoundationWorkReadAccessRepository,
  createFoundationTaskProposalAccessRepository,
  createFoundationSelectedImportRepository,
} from "@commandry/db";
import { FoundationError } from "@commandry/domain";
import { ZodError, type ZodType } from "zod";
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
    evaluation: createFoundationEvaluationService(
      createFoundationEvaluationAccessRepository(db),
      options,
    ),
    inventory: createFoundationInventoryService(
      createFoundationReadAccessRepository(db),
      options,
    ),
    context: createFoundationGeneralContextService(
      createFoundationReadAccessRepository(db),
      options,
    ),
    proposals: createFoundationTaskProposalService(
      createFoundationTaskProposalAccessRepository(db),
      options,
    ),
    work: createFoundationWorkService(
      createFoundationWorkReadAccessRepository(db),
      options,
    ),
  };
}

async function foundationOwnerIdentity(request: Request) {
  requireFoundationOrigin(request);
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    !request.headers.get("origin")
  )
    throw new FoundationError("FORBIDDEN", "Owner mutation origin required");
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
  return {
    identity: {
      principalId: `user:${session.user.id}`,
      expiresAt: expiresAt.toISOString(),
    },
    options: { environment: config.appEnv },
  };
}

export async function foundationOwner(request: Request) {
  const { identity, options } = await foundationOwnerIdentity(request);
  return createFoundationOwnerService(
    createFoundationAccessRepository(getDatabase().db),
    identity,
    options,
  );
}

export async function foundationEvaluationOwner(request: Request) {
  const { identity, options } = await foundationOwnerIdentity(request);
  return createFoundationEvaluationOwnerService(
    createFoundationEvaluationAccessRepository(getDatabase().db),
    identity,
    options,
  );
}

export async function foundationImportOwner(request: Request) {
  const { identity, options } = await foundationOwnerIdentity(request);
  return createMnemosyneSelectedImportService(
    createFoundationSelectedImportRepository(getDatabase().db),
    identity,
    options,
  );
}

export async function foundationTaskProposalOwner(request: Request) {
  const { identity, options } = await foundationOwnerIdentity(request);
  const service = createFoundationTaskProposalService(
    createFoundationTaskProposalAccessRepository(getDatabase().db),
    options,
  );
  return {
    getTaskProposal: (input: unknown) =>
      service.getTaskProposal(identity, input),
    reviewTaskProposal: (input: unknown, key: unknown) =>
      service.reviewTaskProposal(identity, key, input),
  };
}

/** Invalid persisted output is a server failure, never a caller-input error. */
export function foundationImportOutput<T>(
  schema: ZodType<T>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("Selected import output unavailable");
  return result.data;
}

export function foundationFailure(request: Request, error: unknown) {
  if (error instanceof FoundationImportUnavailableError)
    return jsonResponse(
      request,
      { code: "FOUNDATION_UNAVAILABLE" },
      503,
      "foundation.request.unavailable",
    );
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
