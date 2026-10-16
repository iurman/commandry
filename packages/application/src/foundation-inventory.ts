import { randomUUID } from "node:crypto";
import {
  foundationActorSchema,
  foundationClientSchema,
  foundationConfigurationSummarySchema,
  foundationEvidenceSummarySchema,
  foundationMemorySummarySchema,
  foundationEvidenceSchema,
  foundationScopedPageSchema,
  type FoundationActor,
  type FoundationClient,
  type FoundationPage,
  type FoundationScopedPage,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
  requireFoundationGrant,
} from "@commandry/domain";
import type {
  FoundationMachineRequest,
  FoundationServiceOptions,
} from "./agent-foundation";

export {
  foundationConfigurationSummarySchema,
  foundationEvidenceSummarySchema,
  foundationMemorySummarySchema,
} from "@commandry/contracts";

export type FoundationEvidenceSummary = ReturnType<
  typeof foundationEvidenceSummarySchema.parse
>;
export type FoundationMemorySummary = ReturnType<
  typeof foundationMemorySummarySchema.parse
>;
export type FoundationConfigurationSummary = ReturnType<
  typeof foundationConfigurationSummarySchema.parse
>;
export type FoundationInventoryQuery = FoundationPage &
  Pick<FoundationScopedPage, "projectId"> & { asOf: string };
export type FoundationInventoryPage<T> = {
  items: T[];
  nextCursor: string | null;
  asOf: string;
};

/**
 * Filter project membership and creation time BEFORE UUID ascending keyset
 * pagination, fetch limit + 1, and return at most limit with a truthful cursor.
 * Evidence includes all stored records; configurations include every immutable
 * snapshot. Memory includes every current head regardless of lifecycle, using
 * its FIRST assertion's creation time for the cutoff, not its current revision.
 * asOf is a creation cutoff, not a retained snapshot: later memory changes can
 * alter metadata on subsequent pages. No health, model or status filters apply.
 */
export interface FoundationInventoryRecords {
  listEvidence(
    input: FoundationInventoryQuery,
  ): Promise<FoundationInventoryPage<FoundationEvidenceSummary>>;
  listMemory(
    input: FoundationInventoryQuery,
  ): Promise<FoundationInventoryPage<FoundationMemorySummary>>;
  listConfigurations(
    input: FoundationInventoryQuery,
  ): Promise<FoundationInventoryPage<FoundationConfigurationSummary>>;
}

/**
 * Authenticate the digest against canonical clients and hold the shared grant
 * lock through the callback, foundation.read audit and transaction commit.
 * Revocation takes an incompatible lock. Roll back on denial, invalid callback
 * output or audit failure. Returned metadata alone is never authority proof.
 */
export interface FoundationInventoryPort {
  withClient<T>(
    request: FoundationMachineRequest,
    callback: (
      client: FoundationClient,
      records: FoundationInventoryRecords,
    ) => Promise<T>,
  ): Promise<T>;
}

type Summary = { id: string; projectId: string };
type SummarySchema<T> = { parse(value: unknown): T };

function invalidResult(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid foundation inventory result",
  );
}

function validatePage<T extends Summary>(
  value: unknown,
  input: FoundationInventoryQuery,
  schema: SummarySchema<T>,
  creationTime: ((item: T) => string) | null,
): FoundationInventoryPage<T> {
  try {
    // Reject accessors, sparse arrays, symbols and non-JSON prototypes as well.
    const originalDigest = foundationDigest(value);
    if (typeof value !== "object" || value === null) invalidResult();
    const raw = value as Record<string, unknown>;
    if (
      Object.keys(raw).length !== 3 ||
      !Object.hasOwn(raw, "items") ||
      !Object.hasOwn(raw, "nextCursor") ||
      !Object.hasOwn(raw, "asOf") ||
      !Array.isArray(raw.items) ||
      raw.items.length > input.limit ||
      raw.asOf !== input.asOf
    ) {
      invalidResult();
    }
    const items = raw.items.map((item: unknown) => schema.parse(item));
    let previous = input.after;
    for (const item of items) {
      if (
        item.projectId !== input.projectId ||
        (previous !== undefined && item.id <= previous) ||
        (creationTime !== null &&
          compareInstants(creationTime(item), input.asOf) > 0)
      ) {
        invalidResult();
      }
      previous = item.id;
    }
    const nextCursor = foundationEvidenceSchema.shape.id
      .nullable()
      .parse(raw.nextCursor);
    if (
      nextCursor !== null &&
      (items.length === 0 || nextCursor !== items[items.length - 1]?.id)
    ) {
      invalidResult();
    }
    const result = { items, nextCursor, asOf: input.asOf };
    // Shared identity transforms must not silently repair inconsistent output.
    if (foundationDigest(result) !== originalDigest) invalidResult();
    return result;
  } catch {
    invalidResult();
  }
}

// Preserve submillisecond ordering when the shared ISO schema accepts precision.
function compareInstants(left: string, right: string): number {
  // Date.parse can round long fractions incorrectly. Parse only the exact
  // millisecond prefix, then compare the remaining fractional digits below.
  const milliseconds = (value: string) => {
    const match = value.match(/\.(\d+)/);
    const normalized = match
      ? value.replace(match[0], "." + match[1]!.slice(0, 3).padEnd(3, "0"))
      : value;
    return Date.parse(normalized);
  };
  const difference = milliseconds(left) - milliseconds(right);
  if (!Number.isFinite(difference)) invalidResult();
  if (difference !== 0) return difference;
  const fraction = (value: string) =>
    (value.match(/\.(\d+)/)?.[1] ?? "").slice(3);
  const leftPart = fraction(left);
  const rightPart = fraction(right);
  const length = Math.max(leftPart.length, rightPart.length);
  const a = leftPart.padEnd(length, "0");
  const b = rightPart.padEnd(length, "0");
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createFoundationInventoryService(
  port: FoundationInventoryPort,
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

  async function list<T extends Summary>(
    token: string,
    rawScopedPage: unknown,
    schema: SummarySchema<T>,
    read: (
      records: FoundationInventoryRecords,
      input: FoundationInventoryQuery,
    ) => Promise<FoundationInventoryPage<T>>,
    creationTime: ((item: T) => string) | null,
  ): Promise<FoundationInventoryPage<T>> {
    const parsed = foundationScopedPageSchema.parse(rawScopedPage);
    const tokenDigest = foundationTokenDigest(token);
    const startedAt = now().toISOString();
    const input = { ...parsed, asOf: parsed.asOf ?? startedAt };
    if (compareInstants(input.asOf, startedAt) > 0) invalidResult();
    const request: FoundationMachineRequest = {
      operation: "foundation.read",
      projectId: input.projectId,
      environment,
      targetId: null,
      correlationId:
        foundationActorSchema.shape.correlationId.parse(createId()),
      tokenDigest,
    };
    let authorize: (() => FoundationActor) | undefined;
    let expectedDigest: string | undefined;
    const result = await port.withClient(request, async (stored, records) => {
      if (authorize !== undefined) invalidResult();
      let clientId: string | undefined;
      authorize = () => {
        // Reparse the live adapter grant at every boundary, never a stale clone.
        const parsedClient = foundationClientSchema.safeParse(stored);
        if (!parsedClient.success) {
          throw new FoundationError("FORBIDDEN", "Invalid foundation grant");
        }
        const client = parsedClient.data;
        if (clientId !== undefined && client.id !== clientId) invalidResult();
        requireFoundationGrant(client, {
          operation: "foundation.read",
          projectId: input.projectId,
          environment,
          now: now(),
        });
        clientId = client.id;
        return foundationActorSchema.parse({
          schemaVersion: 1,
          principalId: "foundation-client:" + client.id,
          clientId: client.id,
          runId: null,
          capabilities: client.operations,
          projectId: input.projectId,
          resourceIds: [],
          environment,
          expiresAt: client.expiresAt,
          correlationId: request.correlationId,
        });
      };
      authorize();
      const page = await read(records, { ...input });
      authorize();
      const validated = validatePage(page, input, schema, creationTime);
      expectedDigest = foundationDigest(validated);
      return validated;
    });
    if (authorize === undefined || expectedDigest === undefined)
      invalidResult();
    authorize();
    const validated = validatePage(result, input, schema, creationTime);
    if (foundationDigest(validated) !== expectedDigest) invalidResult();
    return validated;
  }

  return {
    listEvidence(token: string, rawScopedPage: unknown) {
      return list(
        token,
        rawScopedPage,
        foundationEvidenceSummarySchema,
        (records, input) => records.listEvidence(input),
        (item) => item.ingestedAt,
      );
    },
    listMemory(token: string, rawScopedPage: unknown) {
      return list(
        token,
        rawScopedPage,
        foundationMemorySummarySchema,
        (records, input) => records.listMemory(input),
        null,
      );
    },
    listConfigurations(token: string, rawScopedPage: unknown) {
      return list(
        token,
        rawScopedPage,
        foundationConfigurationSummarySchema,
        (records, input) => records.listConfigurations(input),
        (item) => item.recordedAt,
      );
    },
  };
}
