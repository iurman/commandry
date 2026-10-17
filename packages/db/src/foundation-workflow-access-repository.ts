import { and, eq, sql } from "drizzle-orm";
import type {
  FoundationMachineRequest,
  FoundationOwnerRequest,
  FoundationRecordPort,
  FoundationWorkflowPort,
} from "@commandry/application";
import {
  FoundationError,
  foundationInstantMilliseconds,
  requireFoundationGrant,
  type FoundationOperation,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { createFoundationRecordsAccessRepository } from "./foundation-access-repository";
import type { FoundationTransaction } from "./foundation-record-repository";
import { session } from "./schema";

export type FoundationWorkflowRecordContext =
  | {
      mode: "machine";
      request: FoundationMachineRequest & {
        principalId: string;
        clientId: string;
      };
    }
  | { mode: "owner"; request: FoundationOwnerRequest };

export type FoundationWorkflowRecordFactory<Records extends object> = (
  transaction: FoundationTransaction,
  context: FoundationWorkflowRecordContext,
  records: FoundationRecordPort,
  now: () => Date,
) => Records;

/** Only a trusted HTTP adapter supplies sessionId. Lock its actual canonical row
 * through the operation/allowed audit/COMMIT; a body-supplied owner marker is not
 * authority. No cookie, token, email or session identifier enters audit payloads. */
export async function requireWorkflowOwnerSession(
  database: Pick<CommandryDatabase, "select">,
  request: Pick<
    FoundationOwnerRequest,
    "principalId" | "expiresAt" | "sessionId"
  >,
  now: Date,
  lock: boolean,
) {
  if (
    typeof request.sessionId !== "string" ||
    !request.sessionId.trim() ||
    request.sessionId.length > 500 ||
    !request.principalId.startsWith("user:") ||
    !request.principalId.slice(5).trim() ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  )
    throw new FoundationError("FORBIDDEN", "A live owner session is required");
  const query = database
    .select({ expiresAt: session.expiresAt })
    .from(session)
    .where(
      and(
        eq(session.id, request.sessionId),
        eq(session.userId, request.principalId.slice(5)),
      ),
    );
  const [row] = lock ? await query.for("share") : await query;
  const claimedExpiry = foundationInstantMilliseconds(request.expiresAt);
  if (!row)
    throw new FoundationError("FORBIDDEN", "A live owner session is required");
  if (
    !(row.expiresAt instanceof Date) ||
    !Number.isFinite(row.expiresAt.getTime()) ||
    !Number.isFinite(claimedExpiry) ||
    claimedExpiry > row.expiresAt.getTime() ||
    claimedExpiry <= now.getTime() ||
    row.expiresAt.getTime() <= now.getTime()
  )
    throw new FoundationError("EXPIRED", "Owner session expired");
}

/** Server-owned feature composition. Factories synchronously bind methods to the
 * existing operation savepoint and perform no work until invoked. The underlying
 * wrapper owns exact scoped receipts, rollback and allowed/denied audits.
 * Lock order: credential (machine) or project (owner), session (owner), feature,
 * then feature-specific canonical rows. Feature factories must preserve it. */
export function createFoundationWorkflowAccessRepository<
  Records extends object,
>(
  db: CommandryDatabase,
  factory: FoundationWorkflowRecordFactory<Records>,
  options: {
    machineOperations: readonly FoundationOperation[];
    ownerOperations: readonly FoundationOperation[];
    lockNamespace:
      | "foundation-evaluation:"
      | "foundation-memory:"
      | "foundation-onboarding:";
    now?: () => Date;
  },
): FoundationWorkflowPort<FoundationRecordPort & Records> {
  const now = options.now ?? (() => new Date());
  const machineOperations = new Set(options.machineOperations);
  const ownerOperations = new Set(options.ownerOperations);
  const lockNamespace = options.lockNamespace;
  const feature = {
    "foundation-evaluation:": "improvement",
    "foundation-memory:": "finding",
    "foundation-onboarding:": "onboarding",
  }[lockNamespace];
  const allowedMachine = new Set([`${feature}.read`, `${feature}.propose`]);
  const allowedOwner = new Set([`${feature}.read`, `${feature}.review`]);
  if (feature === "onboarding") allowedOwner.add("onboarding.apply");
  if (
    !feature ||
    machineOperations.size !== options.machineOperations.length ||
    ownerOperations.size !== options.ownerOperations.length ||
    [...machineOperations].some(
      (operation) => !allowedMachine.has(operation),
    ) ||
    [...ownerOperations].some((operation) => !allowedOwner.has(operation))
  )
    throw new FoundationError("FORBIDDEN", "Invalid workflow operation map");
  const transactions = new WeakMap<object, FoundationTransaction>();
  const bind = (
    tx: FoundationTransaction,
    context: FoundationWorkflowRecordContext,
    records: FoundationRecordPort,
  ) => {
    const bound = Object.assign(
      {},
      records,
      factory(tx, context, records, now),
    );
    transactions.set(bound, tx);
    return bound;
  };
  const base = createFoundationRecordsAccessRepository(
    db,
    {
      machine: (tx, request, records) =>
        bind(tx, { mode: "machine", request }, records),
      owner: (tx, request, records) =>
        bind(tx, { mode: "owner", request }, records),
    },
    { now },
  );
  const lock = async (records: object, projectId: string) => {
    const tx = transactions.get(records);
    if (!tx) throw new FoundationError("FORBIDDEN");
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockNamespace + projectId}, 0))`,
    );
    return tx;
  };
  return {
    withClient(request, action) {
      if (!machineOperations.has(request.operation))
        throw new FoundationError("FORBIDDEN");
      return base.withClient(request, async (client, records) => {
        await lock(records, request.projectId);
        requireFoundationGrant(client, { ...request, now: now() });
        return action(client, records);
      });
    },
    async withOwner(request, action) {
      if (!ownerOperations.has(request.operation))
        throw new FoundationError("FORBIDDEN");
      const value = await base.withOwner(request, async (records) => {
        const tx = transactions.get(records);
        if (!tx) throw new FoundationError("FORBIDDEN");
        await requireWorkflowOwnerSession(tx, request, now(), true);
        await lock(records, request.projectId);
        await requireWorkflowOwnerSession(tx, request, now(), true);
        return action(records);
      });
      // A revocation that completes after COMMIT can withhold delivery, while
      // the exact committed receipt remains recoverable under current authority.
      await requireWorkflowOwnerSession(db, request, now(), false);
      return value;
    },
  };
}
