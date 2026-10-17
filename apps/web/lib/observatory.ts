import { loadRuntimeConfig } from "@commandry/config";
import {
  createObservatoryReadService,
  createObservatoryManagementService,
  createObservatoryViewsService,
} from "@commandry/application";
import {
  createObservatoryOwnerReadRepository,
  createObservatoryMachineReadRepository,
  createObservatoryManagementRepository,
  createObservatoryViewsRepository,
} from "@commandry/db";
import {
  foundationOwnerIdentity,
  requireFoundationOrigin,
} from "./foundation-access";
import { getDatabase } from "./database";

export async function observatoryOwnerRead(
  request: Request,
  projectId?: string,
) {
  requireFoundationOrigin(request);
  const config = loadRuntimeConfig();
  const identity =
    config.humanAuthMode === "password"
      ? await foundationOwnerIdentity(request)
      : null;
  const service = createObservatoryReadService(
    createObservatoryOwnerReadRepository(getDatabase().db, {
      environment: config.appEnv,
      allowUnauthenticatedLocalRead: config.humanAuthMode === "off",
    }),
    { environment: config.appEnv },
  );
  return {
    service,
    context: {
      identity: identity
        ? { ...identity.identity, sessionId: identity.sessionId }
        : null,
      ...(projectId ? { projectId } : {}),
    },
  };
}
export function observatoryMachineRead(
  operation: Parameters<typeof createObservatoryMachineReadRepository>[1],
) {
  const config = loadRuntimeConfig();
  return createObservatoryReadService(
    createObservatoryMachineReadRepository(getDatabase().db, operation),
    { environment: config.appEnv },
  );
}
export async function observatoryOwnerManagement(request: Request) {
  const owner = await foundationOwnerIdentity(request);
  return {
    service: createObservatoryManagementService(
      createObservatoryManagementRepository(getDatabase().db),
    ),
    identity: { ...owner.identity, sessionId: owner.sessionId },
  };
}

export async function observatoryOwnerViews(request: Request) {
  const owner = await foundationOwnerIdentity(request);
  return {
    service: createObservatoryViewsService(
      createObservatoryViewsRepository(getDatabase().db),
    ),
    identity: { ...owner.identity, sessionId: owner.sessionId },
  };
}
