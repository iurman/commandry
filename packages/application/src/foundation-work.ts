import { randomUUID } from "node:crypto";
import {
  foundationActorSchema,
  foundationClientSchema,
  foundationProjectWorkPageSchema,
  foundationProjectWorkQuerySchema,
  foundationProjectWorkRecordSchema,
  type FoundationClient,
  type FoundationProjectWorkPage,
  type FoundationProjectWorkQuery,
  type FoundationProjectWorkRecord,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationInstantMilliseconds,
  foundationTokenDigest,
  requireFoundationGrant,
} from "@commandry/domain";
import type {
  FoundationMachineRequest,
  FoundationServiceOptions,
} from "./agent-foundation";

/**
 * Read the transaction-local canonical Work population: primary project OR an
 * active context link to the requested project, across all Work types, statuses,
 * assignments and dates. Order by created_at DESC, id DESC using PostgreSQL's
 * full timestamp precision, fetch limit + 1, and expose truthful continuation.
 * An invalidated scoped cursor throws INVALID_REFERENCE and requires restart.
 * This population is live and mutable, with no asOf cutoff or retained snapshot.
 */
export interface FoundationWorkReadRecords {
  listProjectWork(input: {
    projectId: string;
    limit: number;
    cursor?: string | undefined;
  }): Promise<{
    items: FoundationProjectWorkRecord[];
    nextCursor: string | null;
  }>;
}

/**
 * Use the existing canonical-client read wrapper: authenticate the token digest,
 * hold the shared grant lock through callback, work.read audit and commit, and
 * deny revocation/expiry or audit failure. Revocation takes an incompatible lock.
 * DTO membership checks cannot establish active SQL membership or authorization.
 */
export interface FoundationWorkReadPort {
  withClient<T>(
    request: FoundationMachineRequest,
    callback: (
      client: FoundationClient,
      records: FoundationWorkReadRecords,
    ) => Promise<T>,
  ): Promise<T>;
}

function invalidResult(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid foundation Work result",
  );
}

function guardedDigest(value: unknown): string {
  try {
    // Inspect descriptors before trusting values, without invoking accessors.
    return foundationDigest(value);
  } catch {
    invalidResult();
  }
}

function validatePage(
  value: unknown,
  input: FoundationProjectWorkQuery,
  selectedAt: string,
): FoundationProjectWorkPage {
  try {
    guardedDigest(value);
    if (typeof value !== "object" || value === null) invalidResult();
    const raw = value as Record<string, unknown>;
    if (
      Object.keys(raw).length !== 2 ||
      !Object.hasOwn(raw, "items") ||
      !Object.hasOwn(raw, "nextCursor") ||
      !Array.isArray(raw.items) ||
      raw.items.length > input.limit
    ) {
      invalidResult();
    }
    const works = raw.items.map((item: unknown) =>
      foundationProjectWorkRecordSchema.parse(item),
    );
    // Canonical content must survive parsing exactly, including UUID spelling.
    if (foundationDigest(works) !== foundationDigest(raw.items))
      invalidResult();

    let previousMilliseconds: number | undefined;
    for (const work of works) {
      if (work.id.toLowerCase() === input.cursor?.afterId) invalidResult();
      const milliseconds = foundationInstantMilliseconds(work.createdAt);
      if (
        !Number.isFinite(milliseconds) ||
        (previousMilliseconds !== undefined &&
          milliseconds > previousMilliseconds)
      ) {
        invalidResult();
      }
      // The canonical serializer loses SQL submillisecond precision. UUID order
      // inside one serialized millisecond remains the database's responsibility.
      previousMilliseconds = milliseconds;
    }

    const afterId = foundationActorSchema.shape.projectId
      .nullable()
      .parse(raw.nextCursor);
    if (
      afterId !== null &&
      (works.length !== input.limit ||
        works.length === 0 ||
        afterId !== works.at(-1)?.id.toLowerCase())
    ) {
      invalidResult();
    }
    return foundationProjectWorkPageSchema.parse({
      schemaVersion: 1,
      requestedProjectId: input.projectId,
      consistency: "live",
      selectedAt,
      items: works.map((work) => ({
        work,
        contentDigest: foundationDigest(work),
      })),
      nextCursor:
        afterId === null ? null : { projectId: input.projectId, afterId },
    });
  } catch {
    invalidResult();
  }
}

export function createFoundationWorkService(
  port: FoundationWorkReadPort,
  options: FoundationServiceOptions,
) {
  const environment = foundationActorSchema.shape.environment.parse(
    options.environment,
  );
  const clock = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  function now(): Date {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new FoundationError("FORBIDDEN", "A valid server time is required");
    }
    return new Date(value.getTime());
  }

  return {
    async listProjectWork(
      token: string,
      rawScopedQuery: unknown,
    ): Promise<FoundationProjectWorkPage> {
      const input = foundationProjectWorkQuerySchema.parse(rawScopedQuery);
      const tokenDigest = foundationTokenDigest(token);
      const selectedAt = now().toISOString();
      const request: FoundationMachineRequest = {
        operation: "work.read",
        projectId: input.projectId,
        environment,
        targetId: null,
        correlationId:
          foundationActorSchema.shape.correlationId.parse(createId()),
        tokenDigest,
      };
      let callbackCount = 0;
      let authorize: (() => void) | undefined;
      let expectedDigest: string | undefined;
      const result = await port.withClient(request, async (stored, records) => {
        callbackCount += 1;
        if (callbackCount !== 1) invalidResult();
        let clientId: string | undefined;
        authorize = () => {
          // Recheck the live adapter object, rather than an earlier parsed clone.
          guardedDigest(stored);
          const parsed = foundationClientSchema.safeParse(stored);
          if (!parsed.success) {
            throw new FoundationError("FORBIDDEN", "Invalid foundation grant");
          }
          const client = parsed.data;
          if (clientId !== undefined && client.id !== clientId) invalidResult();
          requireFoundationGrant(client, {
            operation: "work.read",
            projectId: input.projectId,
            environment,
            now: now(),
          });
          clientId = client.id;
        };
        authorize();
        const rawPage = await records.listProjectWork({
          projectId: input.projectId,
          limit: input.limit,
          ...(input.cursor === null ? {} : { cursor: input.cursor.afterId }),
        });
        authorize();
        const page = validatePage(rawPage, input, selectedAt);
        expectedDigest = foundationDigest(page);
        return page;
      });
      if (
        callbackCount !== 1 ||
        authorize === undefined ||
        expectedDigest === undefined
      ) {
        invalidResult();
      }
      // Audit/commit may await after the callback. Neither a changed grant nor
      // changed callback output can cross this final delivery boundary.
      authorize();
      if (guardedDigest(result) !== expectedDigest) invalidResult();
      const page = foundationProjectWorkPageSchema.safeParse(result);
      if (!page.success) invalidResult();
      return page.data;
    },
  };
}
