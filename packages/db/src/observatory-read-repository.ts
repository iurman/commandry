import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type {
  FoundationMachineRequest,
  ObservatoryOwnerIdentity,
  ObservatoryReadAccess,
  ObservatoryReadPort,
} from "@commandry/application";
import {
  FoundationError,
  foundationDigest,
  foundationInstantMilliseconds,
  type FoundationEnvironment,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { createFoundationProjectReadAccessRepository } from "./foundation-read-repository";
import { requireWorkflowOwnerSession } from "./foundation-workflow-access-repository";
import { observatoryClientScope } from "./observatory-schema";
import { auditEvent } from "./schema";
import {
  collectObservatoryRecords,
  readObservatoryOperationalRecords,
  readObservatoryCatalogueRecords,
  readObservatoryLogoRecord,
  collectObservatoryProviderFeedRecords,
} from "./observatory-records";

type ReadOperation =
  | "observatory.read"
  | "observatory.signals.read"
  | "observatory.security.read"
  | "observatory.providers.read"
  | "work.read";
export function createObservatoryMachineReadRepository(
  db: CommandryDatabase,
  operation: ReadOperation,
  options: { now?: () => Date } = {},
): ObservatoryReadPort<FoundationMachineRequest> {
  const now = options.now ?? (() => new Date());
  const port = createFoundationProjectReadAccessRepository(
    db,
    operation,
    (tx, request, principalId) => {
      let selected:
        | Promise<{ resourceIds: string[] | null; scopeDigest: string }>
        | undefined;
      const scope = () =>
        (selected ??= (async () => {
          const clientId = principalId.slice("foundation-client:".length);
          const [row] = await tx
            .select()
            .from(observatoryClientScope)
            .where(eq(observatoryClientScope.clientId, clientId))
            .for("share");
          const resourceIds = row?.resourceIds ?? null;
          return {
            resourceIds,
            scopeDigest: foundationDigest({
              clientId,
              projectId: request.projectId,
              resourceIds,
              version: row?.version ?? 0,
            }),
          };
        })());
      return {
        scope,
        readCatalogue: async () =>
          readObservatoryCatalogueRecords(tx, {
            projectId: request.projectId,
            ...(await scope()),
          }),
        readLogo: async (resourceId: string) =>
          readObservatoryLogoRecord(
            tx,
            { projectId: request.projectId, ...(await scope()) },
            resourceId,
          ),
        readProviderFeed: (input: { afterId?: string; limit: number }) =>
          collectObservatoryProviderFeedRecords(tx, input, now()),
        readOperationalEvidence: async (resourceId: string) =>
          readObservatoryOperationalRecords(tx, resourceId, {
            projectId: request.projectId,
            ...(await scope()),
          }),
        readObservatory: async () =>
          collectObservatoryRecords(
            tx,
            { projectId: request.projectId, ...(await scope()) },
            now(),
          ),
      };
    },
    { now, isolationLevel: "repeatable read" },
  );
  return {
    withRead: async (request, callback) =>
      port.withClient(request, async (client, records) => {
        const scope = await records.scope();
        const access: ObservatoryReadAccess = {
          owner: false,
          projectIds: [client.projectId],
          resourceIds: scope.resourceIds,
          scopeDigest: scope.scopeDigest,
          operations: client.operations,
          environment: client.environment,
        };
        return callback(access, records);
      }),
  };
}
export type ObservatoryOwnerReadRequest = {
  identity: ObservatoryOwnerIdentity | null;
  projectId?: string;
};
export function createObservatoryOwnerReadRepository(
  db: CommandryDatabase,
  options: {
    environment: FoundationEnvironment;
    allowUnauthenticatedLocalRead?: boolean;
    now?: () => Date;
  },
): ObservatoryReadPort<ObservatoryOwnerReadRequest> {
  const now = options.now ?? (() => new Date());
  const local =
    options.allowUnauthenticatedLocalRead === true &&
    (options.environment === "local" || options.environment === "test");
  return {
    async withRead(request, callback) {
      let initialDigest: string;
      let identity: ObservatoryOwnerIdentity | null;
      let projectId: string | undefined;
      try {
        initialDigest = foundationDigest(request);
        const keys = Object.keys(request).sort().join(",");
        if (keys !== "identity" && keys !== "identity,projectId")
          throw new Error();
        if (
          request.identity !== null &&
          (typeof request.identity !== "object" ||
            Object.keys(request.identity).sort().join(",") !==
              "expiresAt,principalId,sessionId" ||
            typeof request.identity.principalId !== "string" ||
            typeof request.identity.sessionId !== "string" ||
            typeof request.identity.expiresAt !== "string")
        )
          throw new Error();
        if (
          request.projectId !== undefined &&
          typeof request.projectId !== "string"
        )
          throw new Error();
        identity = request.identity === null ? null : { ...request.identity };
        projectId = request.projectId;
      } catch {
        throw new FoundationError("FORBIDDEN", "Invalid owner read context");
      }
      if (!identity && !local) throw new FoundationError("INVALID_CREDENTIAL");
      function guard(): Date {
        try {
          if (foundationDigest(request) !== initialDigest) throw new Error();
        } catch {
          throw new FoundationError("FORBIDDEN", "Owner read context changed");
        }
        const time = now();
        if (!(time instanceof Date) || !Number.isFinite(time.getTime()))
          throw new FoundationError("FORBIDDEN", "Invalid owner read clock");
        if (
          identity &&
          (!Number.isFinite(
            foundationInstantMilliseconds(identity.expiresAt),
          ) ||
            foundationInstantMilliseconds(identity.expiresAt) <= time.getTime())
        )
          throw new FoundationError("EXPIRED", "Owner session expired");
        return new Date(time.getTime());
      }
      guard();
      const value = await db.transaction(
        async (tx) => {
          guard();
          if (identity)
            await requireWorkflowOwnerSession(tx, identity, guard(), true);
          guard();
          const scopeDigest = foundationDigest({
            principalId: identity?.principalId ?? "local-owner",
            projectId: projectId ?? null,
            environment: options.environment,
          });
          const access: ObservatoryReadAccess = {
            owner: true,
            projectIds: projectId ? [projectId] : [],
            resourceIds: null,
            scopeDigest,
            operations: [],
            environment: options.environment,
          };
          const result = await callback(access, {
            readCatalogue: () =>
              readObservatoryCatalogueRecords(tx, {
                ...(projectId ? { projectId: projectId } : {}),
                resourceIds: null,
                scopeDigest,
              }),
            readLogo: (resourceId: string) =>
              readObservatoryLogoRecord(
                tx,
                {
                  ...(projectId ? { projectId: projectId } : {}),
                  resourceIds: null,
                  scopeDigest,
                },
                resourceId,
              ),
            readProviderFeed: (input: { afterId?: string; limit: number }) =>
              collectObservatoryProviderFeedRecords(tx, input, guard()),
            readOperationalEvidence: (resourceId: string) =>
              readObservatoryOperationalRecords(tx, resourceId, {
                ...(projectId ? { projectId: projectId } : {}),
                resourceIds: null,
                scopeDigest,
              }),
            readObservatory: () =>
              collectObservatoryRecords(
                tx,
                {
                  ...(projectId ? { projectId: projectId } : {}),
                  resourceIds: null,
                  scopeDigest,
                },
                guard(),
              ),
          });
          guard();
          if (identity)
            await requireWorkflowOwnerSession(tx, identity, guard(), false);
          await tx.insert(auditEvent).values({
            id: randomUUID(),
            actor: identity?.principalId ?? "local-owner",
            operation: "observatory.read",
            details: { scopeDigest, environment: options.environment },
          });
          guard();
          if (identity)
            await requireWorkflowOwnerSession(tx, identity, guard(), false);
          return result;
        },
        { isolationLevel: "repeatable read" },
      );
      guard();
      if (identity)
        await requireWorkflowOwnerSession(db, identity, guard(), false);
      guard();
      return value;
    },
  };
}
