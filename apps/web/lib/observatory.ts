import { loadRuntimeConfig } from "@commandry/config";
import {
  createObservatoryReadService,
  createObservatoryLogoService,
  createObservatoryManagementService,
  createObservatoryViewsService,
  createObservatoryOwnerWorkService,
  type ObservatoryLogoRepositoryReader,
} from "@commandry/application";
import {
  createObservatoryOwnerReadRepository,
  createObservatoryLogoRepository,
  createObservatoryMachineReadRepository,
  createObservatoryManagementRepository,
  createObservatoryViewsRepository,
  createObservatoryOwnerWorkRepository,
} from "@commandry/db";
import {
  createObservatoryLogoProcessor,
  createObservatoryLogoRepositoryReader,
} from "@commandry/platform";
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

const logoProcessor = createObservatoryLogoProcessor();
/** Owner logo preview/review. The GitHub reader uses the same private token
 * file as the worker's repository source, read per request so rotation applies;
 * without one only public repositories can be read. */
export async function observatoryOwnerLogos(request: Request) {
  const owner = await foundationOwnerIdentity(request);
  const config = loadRuntimeConfig();
  let repositoryReader: ObservatoryLogoRepositoryReader | undefined;
  try {
    repositoryReader = await createObservatoryLogoRepositoryReader(
      config.observatoryGitHubTokenFile
        ? { githubTokenFile: config.observatoryGitHubTokenFile }
        : {},
    );
  } catch {
    // A configured but unreadable token file never falls back to anonymous reads.
    repositoryReader = undefined;
  }
  return {
    service: createObservatoryLogoService({
      port: createObservatoryLogoRepository(getDatabase().db),
      processor: logoProcessor,
      ...(repositoryReader ? { repositoryReader } : {}),
    }),
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

export async function observatoryOwnerWork(request: Request) {
  const owner = await foundationOwnerIdentity(request);
  return {
    service: createObservatoryOwnerWorkService(
      createObservatoryOwnerWorkRepository(getDatabase().db),
    ),
    identity: { ...owner.identity, sessionId: owner.sessionId },
  };
}
