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
      if (!request.identity && !local)
        throw new FoundationError("INVALID_CREDENTIAL");
      const value = await db.transaction(
        async (tx) => {
          if (request.identity)
            await requireWorkflowOwnerSession(
              tx,
              request.identity,
              now(),
              true,
            );
          const scopeDigest = foundationDigest({
            principalId: request.identity?.principalId ?? "local-owner",
            projectId: request.projectId ?? null,
            environment: options.environment,
          });
          const access: ObservatoryReadAccess = {
            owner: true,
            projectIds: request.projectId ? [request.projectId] : [],
            resourceIds: null,
            scopeDigest,
            operations: [],
            environment: options.environment,
          };
          const result = await callback(access, {
            readOperationalEvidence: (resourceId: string) =>
              readObservatoryOperationalRecords(tx, resourceId, {
                ...(request.projectId ? { projectId: request.projectId } : {}),
                resourceIds: null,
                scopeDigest,
              }),
            readObservatory: () =>
              collectObservatoryRecords(
                tx,
                {
                  ...(request.projectId
                    ? { projectId: request.projectId }
                    : {}),
                  resourceIds: null,
                  scopeDigest,
                },
                now(),
              ),
          });
          if (request.identity)
            await requireWorkflowOwnerSession(
              tx,
              request.identity,
              now(),
              false,
            );
          await tx.insert(auditEvent).values({
            id: randomUUID(),
            actor: request.identity?.principalId ?? "local-owner",
            operation: "observatory.read",
            details: { scopeDigest, environment: options.environment },
          });
          if (request.identity)
            await requireWorkflowOwnerSession(
              tx,
              request.identity,
              now(),
              false,
            );
          return result;
        },
        { isolationLevel: "repeatable read" },
      );
      if (request.identity)
        await requireWorkflowOwnerSession(db, request.identity, now(), false);
      return value;
    },
  };
}
