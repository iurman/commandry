import { randomUUID } from "node:crypto";
import {
  foundationActorSchema,
  foundationClientSchema,
  foundationProjectResourcePageSchema,
  foundationProjectResourceQuerySchema,
  foundationProjectResourceRecordSchema,
  type FoundationClient,
  type FoundationProjectResourcePage,
  type FoundationProjectResourceQuery,
  type FoundationProjectResourceRecord,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
  projectResourceRelationship,
  requireFoundationGrant,
} from "@commandry/domain";
import type {
  FoundationMachineRequest,
  FoundationServiceOptions,
} from "./agent-foundation";

/**
 * Return active canonical project connections in ascending link UUID order,
 * comparing UUIDs case-insensitively. Resources may have several connections.
 * The adapter owns active SQL membership, scoped cursor validity and complete
 * live pagination; an invalidated anchor throws INVALID_REFERENCE for restart.
 * No source fetch, child traversal or health inference belongs to this read.
 */
export interface FoundationResourceReadRecords {
  listProjectResources(input: {
    projectId: string;
    limit: number;
    cursor?: string | undefined;
  }): Promise<{
    items: FoundationProjectResourceRecord[];
    nextCursor: string | null;
  }>;
}

/**
 * Authenticate the token digest and lock the current canonical client grant in
 * the same transaction as the resource population. Keep the grant lock through
 * resources.read audit and commit; reject expired/revoked grants and roll back
 * on audit/deadline failure. These DTO checks cannot prove SQL membership.
 */
export interface FoundationResourceReadPort {
  withClient<T>(
    request: FoundationMachineRequest,
    callback: (
      client: FoundationClient,
      records: FoundationResourceReadRecords,
    ) => Promise<T>,
  ): Promise<T>;
}

export class FoundationResourceUnavailableError extends Error {
  constructor() {
    super("Resource output unavailable");
    this.name = "FoundationResourceUnavailableError";
  }
}

function unavailable(): never {
  throw new FoundationResourceUnavailableError();
}

function guardedDigest(value: unknown): string {
  try {
    // The shared serializer checks descriptors without invoking getters.
    return foundationDigest(value);
  } catch {
    unavailable();
  }
}

function validatePage(
  value: unknown,
  input: FoundationProjectResourceQuery,
  selectedAt: string,
): FoundationProjectResourcePage {
  try {
    guardedDigest(value);
    if (typeof value !== "object" || value === null) unavailable();
    const raw = value as Record<string, unknown>;
    if (
      Object.keys(raw).length !== 2 ||
      !Object.hasOwn(raw, "items") ||
      !Object.hasOwn(raw, "nextCursor") ||
      !Array.isArray(raw.items) ||
      raw.items.length > input.limit
    ) {
      unavailable();
    }
    const connections = raw.items.map((item: unknown) =>
      foundationProjectResourceRecordSchema.parse(item),
    );
    // Parsing must not repair, trim or discard canonical resource content.
    if (foundationDigest(connections) !== foundationDigest(raw.items))
      unavailable();

    let previous = input.cursor?.afterLinkId;
    for (const connection of connections) {
      const linkId = connection.id.toLowerCase();
      if (previous !== undefined && linkId <= previous) unavailable();
      if (
        projectResourceRelationship(connection.type).inverseType !==
        connection.inverseType
      ) {
        unavailable();
      }
      previous = linkId;
    }
    const afterLinkId = foundationActorSchema.shape.projectId
      .nullable()
      .parse(raw.nextCursor);
    if (
      afterLinkId !== null &&
      (connections.length === 0 ||
        afterLinkId !== connections.at(-1)?.id.toLowerCase())
    ) {
      unavailable();
    }
    return foundationProjectResourcePageSchema.parse({
      schemaVersion: 1,
      requestedProjectId: input.projectId,
      consistency: "live",
      selectedAt,
      items: connections.map((connection) => ({
        connection,
        contentDigest: foundationDigest(connection),
      })),
      nextCursor:
        afterLinkId === null
          ? null
          : { projectId: input.projectId, afterLinkId },
    });
  } catch {
    unavailable();
  }
}

export function createFoundationResourceService(
  port: FoundationResourceReadPort,
  options: Partial<FoundationServiceOptions> = {},
) {
  let environment: FoundationServiceOptions["environment"];
  let clock: () => Date;
  let createId: () => string;
  try {
    const trustedEnvironment = options.environment;
    environment = foundationActorSchema.shape.environment.parse(
      trustedEnvironment === undefined ? "local" : trustedEnvironment,
    );
    const clockFactory = options.now;
    const idFactory = options.createId;
    clock = clockFactory === undefined ? () => new Date() : clockFactory;
    createId = idFactory === undefined ? randomUUID : idFactory;
  } catch {
    unavailable();
  }
  function now(): Date {
    try {
      const value = clock();
      if (!(value instanceof Date)) unavailable();
      const milliseconds = Date.prototype.getTime.call(value);
      if (!Number.isFinite(milliseconds)) unavailable();
      const instant = new Date(milliseconds);
      foundationActorSchema.shape.expiresAt.parse(instant.toISOString());
      return instant;
    } catch {
      unavailable();
    }
  }
  function correlation(): string {
    try {
      return foundationActorSchema.shape.correlationId.parse(createId());
    } catch {
      unavailable();
    }
  }

  return {
    async listProjectResources(
      token: string,
      raw: unknown,
    ): Promise<FoundationProjectResourcePage> {
      try {
        foundationDigest(raw);
      } catch {
        throw new FoundationError(
          "INVALID_REFERENCE",
          "Invalid project resource query",
        );
      }
      const input = foundationProjectResourceQuerySchema.parse(raw);
      const tokenDigest = foundationTokenDigest(token);
      const selectedAt = now().toISOString();
      const request: FoundationMachineRequest = {
        operation: "resources.read",
        projectId: input.projectId,
        environment,
        correlationId: correlation(),
        targetId: null,
        tokenDigest,
      };
      let callbackCount = 0;
      let authorize: (() => void) | undefined;
      let expectedDigest: string | undefined;
      let callbackPage: FoundationProjectResourcePage | undefined;
      let producerPage: unknown;
      let producerDigest: string | undefined;
      const result = await port.withClient(request, async (stored, records) => {
        callbackCount += 1;
        if (callbackCount !== 1) unavailable();
        let clientDigest: string | undefined;
        authorize = () => {
          // Reparse the actual live object at every authorization boundary.
          const at = now();
          const digest = guardedDigest(stored);
          const parsed = foundationClientSchema.safeParse(stored);
          if (!parsed.success) {
            throw new FoundationError("FORBIDDEN", "Invalid foundation grant");
          }
          requireFoundationGrant(parsed.data, {
            operation: "resources.read",
            projectId: input.projectId,
            environment,
            now: at,
          });
          if (clientDigest !== undefined && digest !== clientDigest)
            unavailable();
          clientDigest = digest;
        };
        authorize();
        const rawPage = await records.listProjectResources({
          projectId: input.projectId,
          limit: input.limit,
          ...(input.cursor === null
            ? {}
            : { cursor: input.cursor.afterLinkId }),
        });
        authorize();
        const page = validatePage(rawPage, input, selectedAt);
        producerPage = rawPage;
        producerDigest = guardedDigest(rawPage);
        expectedDigest = guardedDigest(page);
        callbackPage = page;
        return page;
      });
      if (
        callbackCount !== 1 ||
        authorize === undefined ||
        expectedDigest === undefined ||
        callbackPage === undefined ||
        producerDigest === undefined
      ) {
        unavailable();
      }
      // Audit/commit can await after callback completion. Check both objects
      // even when the adapter returns a separate copy of the callback result.
      authorize();
      if (
        guardedDigest(producerPage) !== producerDigest ||
        guardedDigest(callbackPage) !== expectedDigest ||
        guardedDigest(result) !== expectedDigest
      ) {
        unavailable();
      }
      const page = foundationProjectResourcePageSchema.safeParse(result);
      if (!page.success || guardedDigest(page.data) !== expectedDigest)
        unavailable();
      authorize();
      return page.data;
    },
  };
}
