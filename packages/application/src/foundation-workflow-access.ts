import { randomUUID } from "node:crypto";
import {
  foundationActorSchema,
  foundationClientSchema,
  type FoundationActor,
  type FoundationClient,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationInstantMilliseconds,
  foundationTokenDigest,
  requireFoundationGrant,
  type FoundationOperation,
} from "@commandry/domain";
import type {
  FoundationIdentity,
  FoundationMachineRequest,
  FoundationOperationContext,
  FoundationOwnerRequest,
  FoundationServiceOptions,
} from "./agent-foundation";

export interface FoundationWorkflowPort<Records> {
  withClient<T>(
    request: FoundationMachineRequest,
    action: (client: FoundationClient, records: Records) => Promise<T>,
  ): Promise<T>;
  withOwner<T>(
    request: FoundationOwnerRequest,
    action: (records: Records) => Promise<T>,
  ): Promise<T>;
}

export type FoundationWorkflowContext<Records> = {
  readonly request: FoundationOperationContext;
  readonly actor: FoundationActor;
  readonly records: Records;
  readonly guard: () => void;
};

export class FoundationWorkflowUnavailableError extends Error {
  constructor() {
    super("Workflow output is unavailable");
    this.name = "FoundationWorkflowUnavailableError";
  }
}

function unavailable(): never {
  throw new FoundationWorkflowUnavailableError();
}

/** Inspect descriptors before JSON conversion so an untrusted getter never runs.
 * Every accepted input/output is detached from its producer before an await. */
export function foundationWorkflowSnapshot<T>(
  value: T,
  invalid: () => never = unavailable,
): T {
  try {
    return JSON.parse(canonicalFoundationJson(value)) as T;
  } catch {
    return invalid();
  }
}

export function foundationWorkflowInput<T>(
  schema: { parse(value: unknown): T },
  value: unknown,
): T {
  return schema.parse(
    foundationWorkflowSnapshot(value, () => {
      throw new FoundationError("INVALID_REFERENCE", "Invalid workflow input");
    }),
  );
}

export function foundationWorkflowOutput<T>(
  schema: { parse(value: unknown): T },
  value: unknown,
): T {
  const copy = foundationWorkflowSnapshot(value);
  try {
    const parsed = schema.parse(copy);
    if (foundationDigest(parsed) !== foundationDigest(copy)) unavailable();
    return foundationWorkflowSnapshot(parsed);
  } catch {
    return unavailable();
  }
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Shared application boundary only. The adapter still owns actual credential or
 * session authentication, locks, same-transaction audit and pre-commit checks.
 * A final expiry check can withhold delivery; it cannot undo a completed commit. */
export function createFoundationWorkflowAccess<Records>(
  port: FoundationWorkflowPort<Records>,
  options: FoundationServiceOptions,
) {
  const environment = foundationActorSchema.shape.environment.parse(
    options.environment,
  );
  const instant = options.now ?? (() => new Date());
  const id = options.createId ?? randomUUID;
  const now = () => {
    const raw = instant();
    if (!(raw instanceof Date) || !Number.isFinite(raw.getTime()))
      unavailable();
    return new Date(raw.getTime());
  };
  const request = (
    operation: FoundationOperation,
    projectId: string,
    targetId: string | null,
  ): FoundationOperationContext => {
    const parsed = foundationActorSchema.parse({
      schemaVersion: 1,
      principalId: "workflow-context",
      clientId: targetId,
      runId: null,
      capabilities: [operation],
      projectId,
      resourceIds: [],
      environment,
      expiresAt: "9999-01-01T00:00:00Z",
      correlationId: id(),
    });
    return freeze({
      operation,
      projectId: parsed.projectId,
      environment: parsed.environment,
      targetId: parsed.clientId,
      correlationId: parsed.correlationId,
    });
  };
  async function complete<T>(
    invoke: (
      action: (context: FoundationWorkflowContext<Records>) => Promise<T>,
      enter: () => void,
    ) => Promise<T>,
    action: (context: FoundationWorkflowContext<Records>) => Promise<T>,
  ): Promise<T> {
    let calls = 0;
    let finished = false;
    let canonical: T | undefined;
    let digest: string | undefined;
    let deliveryGuard: (() => void) | undefined;
    let open = true;
    let entries = 0;
    const enter = () => {
      if (!open || ++entries !== 1) unavailable();
    };
    let delivered: T;
    try {
      delivered = await invoke(async (context) => {
        if (!open || ++calls !== 1) unavailable();
        deliveryGuard = context.guard;
        const guard = () => {
          if (!open) unavailable();
          context.guard();
        };
        guard();
        const value = await action({ ...context, guard });
        guard();
        canonical = freeze(foundationWorkflowSnapshot(value));
        digest = foundationDigest(canonical);
        finished = true;
        return canonical;
      }, enter);
    } finally {
      // A broken adapter must not retain a live callback after rejection/return.
      // Actions must also call the supplied guard after their own awaited I/O.
      open = false;
    }
    if (
      entries !== 1 ||
      calls !== 1 ||
      !finished ||
      digest === undefined ||
      !deliveryGuard
    )
      unavailable();
    deliveryGuard();
    if (foundationDigest(foundationWorkflowSnapshot(delivered)) !== digest)
      unavailable();
    const detached = foundationWorkflowSnapshot(canonical as T);
    deliveryGuard();
    return detached;
  }
  return {
    now,
    createId: () => foundationActorSchema.shape.projectId.parse(id()),
    async machine<T>(
      token: string,
      operation: FoundationOperation,
      projectId: string,
      targetId: string | null,
      action: (context: FoundationWorkflowContext<Records>) => Promise<T>,
    ): Promise<T> {
      const context = request(operation, projectId, targetId);
      const machineRequest = freeze({
        ...context,
        tokenDigest: foundationTokenDigest(token),
      });
      return complete(
        (perform, enter) =>
          port.withClient(machineRequest, async (raw, records) => {
            enter();
            const client = freeze(
              foundationWorkflowOutput(foundationClientSchema, raw),
            );
            const guard = () =>
              requireFoundationGrant(client, { ...context, now: now() });
            guard();
            const actor = freeze(
              foundationActorSchema.parse({
                schemaVersion: 1,
                principalId: "foundation-client:" + client.id,
                clientId: client.id,
                runId: null,
                capabilities: client.operations,
                projectId: context.projectId,
                resourceIds: [],
                environment: context.environment,
                expiresAt: client.expiresAt,
                correlationId: context.correlationId,
              }),
            );
            return perform({ request: context, actor, records, guard });
          }),
        action,
      );
    },
    async owner<T>(
      identity: FoundationIdentity,
      operation: FoundationOperation,
      projectId: string,
      targetId: string | null,
      action: (context: FoundationWorkflowContext<Records>) => Promise<T>,
    ): Promise<T> {
      const trusted = freeze(foundationWorkflowSnapshot(identity));
      const context = request(operation, projectId, targetId);
      const guard = () => {
        if (
          typeof trusted.principalId !== "string" ||
          !trusted.principalId.startsWith("user:") ||
          !trusted.principalId.slice(5).trim() ||
          !foundationActorSchema.shape.expiresAt.safeParse(trusted.expiresAt)
            .success ||
          !(foundationInstantMilliseconds(trusted.expiresAt) > now().getTime())
        )
          throw new FoundationError(
            "FORBIDDEN",
            "A live owner session is required",
          );
      };
      guard();
      const actor = freeze(
        foundationActorSchema.parse({
          schemaVersion: 1,
          principalId: trusted.principalId,
          clientId: null,
          runId: null,
          capabilities: [operation],
          projectId: context.projectId,
          resourceIds: [],
          environment: context.environment,
          expiresAt: trusted.expiresAt,
          correlationId: context.correlationId,
        }),
      );
      return complete(
        (perform, enter) =>
          port.withOwner(freeze({ ...trusted, ...context }), (records) => {
            enter();
            return perform({ request: context, actor, records, guard });
          }),
        action,
      );
    },
  };
}
