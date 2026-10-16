import { randomUUID } from "node:crypto";
import {
  foundationActorSchema,
  foundationClientSchema,
  foundationGeneralContextRequestSchema,
  type FoundationClient,
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
import type { FoundationInventoryQuery } from "./foundation-inventory";
import {
  buildFoundationWorkingContext,
  type FoundationWorkingContextCandidate,
  type FoundationWorkingContextResult,
} from "./foundation-working-context";

/**
 * Return every current memory head in the project, regardless of lifecycle or
 * category, whose FIRST assertion was created <= asOf. Order canonical UUIDs
 * ascending after the cursor, fetch limit + 1, and return at most limit with
 * nextCursor null or the last returned ID when another row exists. asOf limits
 * creation; it does not freeze later revisions or approvals.
 *
 * Each candidate carries canonical memory, all linked evidence, the current
 * exact approval or null, current knowledge anchor/freshness, and unresolved
 * contradictions in BOTH directions. Do not prefilter eligibility or rank rows.
 */
export interface FoundationGeneralContextRecords {
  getCandidates(input: FoundationInventoryQuery): Promise<{
    candidates: FoundationWorkingContextCandidate[];
    nextCursor: string | null;
    asOf: string;
  }>;
}

/**
 * Use one transaction with no nested pool calls. Authenticate the token digest,
 * hold the live grant lock through foundation.read audit and commit, and take
 * the same project memory mutation lock used by writers before retrieval.
 * Revocation takes an incompatible grant lock. Roll back on callback denial,
 * invalid output or audit failure. These are adapter obligations, not DB proof.
 */
export interface FoundationGeneralContextPort {
  withClient<T>(
    request: FoundationMachineRequest,
    callback: (
      client: FoundationClient,
      records: FoundationGeneralContextRecords,
    ) => Promise<T>,
  ): Promise<T>;
}

export type FoundationGeneralContextResult = FoundationWorkingContextResult & {
  asOf: string;
};

function invalidResult(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid foundation general context result",
  );
}

// Preserve all accepted ISO fractional digits rather than rounding through Date.
function compareInstants(left: string, right: string): number {
  const difference =
    foundationInstantMilliseconds(left) - foundationInstantMilliseconds(right);
  if (!Number.isFinite(difference)) invalidResult();
  if (difference !== 0) return difference;
  const remainder = (value: string) =>
    (value.match(/\.(\d+)/)?.[1] ?? "").slice(3);
  const a = remainder(left);
  const b = remainder(right);
  const width = Math.max(a.length, b.length);
  const paddedA = a.padEnd(width, "0");
  const paddedB = b.padEnd(width, "0");
  return paddedA < paddedB ? -1 : paddedA > paddedB ? 1 : 0;
}

function validatePage(
  value: unknown,
  input: FoundationInventoryQuery,
): {
  candidates: FoundationWorkingContextCandidate[];
  nextCursor: string | null;
} {
  try {
    // Validate plain JSON before inspecting adapter-controlled properties.
    foundationDigest(value);
    if (typeof value !== "object" || value === null) invalidResult();
    const page = value as Record<string, unknown>;
    if (
      Object.keys(page).length !== 3 ||
      !Object.hasOwn(page, "candidates") ||
      !Object.hasOwn(page, "nextCursor") ||
      !Object.hasOwn(page, "asOf") ||
      !Array.isArray(page.candidates) ||
      page.candidates.length > input.limit ||
      page.asOf !== input.asOf
    ) {
      invalidResult();
    }
    let previous = input.after;
    for (const candidate of page.candidates) {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        typeof candidate.memory !== "object" ||
        candidate.memory === null
      ) {
        invalidResult();
      }
      // The pure selector intentionally ignores foreign candidates; a scoped
      // persistence port must instead fail closed on any foreign adapter row.
      const memory = candidate.memory as Record<string, unknown>;
      const id = foundationActorSchema.shape.projectId.parse(memory.id);
      if (
        memory.id !== id ||
        memory.projectId !== input.projectId ||
        (previous !== undefined && id <= previous)
      ) {
        invalidResult();
      }
      previous = id;
    }
    const nextCursor = foundationActorSchema.shape.projectId
      .nullable()
      .parse(page.nextCursor);
    if (
      nextCursor !== page.nextCursor ||
      (nextCursor !== null &&
        (page.candidates.length === 0 || nextCursor !== previous))
    ) {
      invalidResult();
    }
    // Complete candidate validation belongs to the existing strict selector.
    return {
      candidates: page.candidates as FoundationWorkingContextCandidate[],
      nextCursor,
    };
  } catch {
    invalidResult();
  }
}

export function createFoundationGeneralContextService(
  port: FoundationGeneralContextPort,
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
    async get(
      token: string,
      rawRequest: unknown,
    ): Promise<FoundationGeneralContextResult> {
      const input = foundationGeneralContextRequestSchema.parse(rawRequest);
      const tokenDigest = foundationTokenDigest(token);
      const startedAt = now().toISOString();
      const query: FoundationInventoryQuery = {
        projectId: input.projectId,
        limit: input.limit,
        ...(input.after === undefined ? {} : { after: input.after }),
        asOf: input.asOf ?? startedAt,
      };
      if (compareInstants(query.asOf, startedAt) > 0) invalidResult();
      const request: FoundationMachineRequest = {
        operation: "foundation.read",
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
        let clientDigest: string | undefined;
        authorize = () => {
          const parsed = foundationClientSchema.safeParse(stored);
          if (!parsed.success) {
            throw new FoundationError("FORBIDDEN", "Invalid foundation grant");
          }
          const client = parsed.data;
          const at = now();
          // The shared domain guard uses millisecond Dates. Prove exact expiry
          // first, then preserve a proven live submillisecond interval for it.
          const live = compareInstants(client.expiresAt, at.toISOString()) > 0;
          const expiryMilliseconds = foundationInstantMilliseconds(
            client.expiresAt,
          );
          requireFoundationGrant(
            {
              ...client,
              expiresAt:
                live && expiryMilliseconds === at.getTime()
                  ? new Date(at.getTime() + 1)
                  : client.expiresAt,
            },
            {
              operation: "foundation.read",
              projectId: input.projectId,
              environment,
              now: at,
            },
          );
          const digest = foundationDigest(client);
          if (clientDigest !== undefined && clientDigest !== digest) {
            invalidResult();
          }
          clientDigest = digest;
        };
        authorize();
        const rawPage = await records.getCandidates({ ...query });
        authorize();
        const page = validatePage(rawPage, query);
        const selected = {
          ...buildFoundationWorkingContext({
            projectId: input.projectId,
            generatedAt: now().toISOString(),
            maxCharacters: input.maxCharacters,
            taskDirection: input.taskDirection,
            candidates: page.candidates,
            continuation: page.nextCursor,
          }),
          asOf: query.asOf,
        };
        authorize();
        expectedDigest = foundationDigest(selected);
        return selected;
      });
      if (
        callbackCount !== 1 ||
        authorize === undefined ||
        expectedDigest === undefined
      ) {
        invalidResult();
      }
      authorize();
      try {
        if (foundationDigest(result) !== expectedDigest) invalidResult();
      } catch {
        invalidResult();
      }
      return result;
    },
  };
}
