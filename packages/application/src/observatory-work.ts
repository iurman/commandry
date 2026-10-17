import {
  foundationProjectWorkPageSchema,
  foundationProjectWorkQuerySchema,
  type FoundationProjectWorkPage,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationInstantMilliseconds,
} from "@commandry/domain";
import {
  serializeFoundationProjectWorkPage,
  type FoundationWorkReadRecords,
} from "./foundation-work";
import type { ObservatoryOwnerIdentity } from "./observatory-management";

export interface ObservatoryOwnerWorkReadPort {
  /** The repository validates a canonical owner session and holds its shared
   * lock through the bound canonical Work query, audit and transaction commit. */
  withRead<T>(
    owner: ObservatoryOwnerIdentity,
    projectId: string,
    callback: (records: FoundationWorkReadRecords) => Promise<T>,
  ): Promise<T>;
}
function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid Observatory Work result",
  );
}
function forbidden(): never {
  throw new FoundationError("FORBIDDEN", "A live owner session is required");
}
function digest(value: unknown): string {
  try {
    return foundationDigest(value);
  } catch {
    return invalid();
  }
}
/** Owner identity comes from the trusted HTTP boundary, never the query body.
 * This uses the released Work population and DTO and establishes no AgentRun. */
export function createObservatoryOwnerWorkService(
  port: ObservatoryOwnerWorkReadPort,
  options: { now?: () => Date } = {},
) {
  const clock = options.now ?? (() => new Date());
  function now(): Date {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      forbidden();
    return new Date(value.getTime());
  }
  return {
    async listProjectWork(
      owner: ObservatoryOwnerIdentity,
      rawQuery: unknown,
    ): Promise<FoundationProjectWorkPage> {
      const input = foundationProjectWorkQuerySchema.parse(rawQuery);
      let identityDigest: string | undefined;
      function authorize(): Date {
        let current: string;
        try {
          current = foundationDigest(owner);
          if (
            Object.keys(owner).sort().join(",") !==
              "expiresAt,principalId,sessionId" ||
            typeof owner.principalId !== "string" ||
            !owner.principalId.startsWith("user:") ||
            !owner.principalId.slice(5).trim() ||
            owner.principalId.length > 500 ||
            typeof owner.sessionId !== "string" ||
            !owner.sessionId.trim() ||
            owner.sessionId.length > 500 ||
            typeof owner.expiresAt !== "string"
          )
            forbidden();
        } catch {
          return forbidden();
        }
        if (identityDigest !== undefined && current !== identityDigest)
          forbidden();
        const time = now(),
          expiry = foundationInstantMilliseconds(owner.expiresAt);
        if (!Number.isFinite(expiry)) forbidden();
        if (expiry <= time.getTime())
          throw new FoundationError("EXPIRED", "Owner session expired");
        identityDigest = current;
        return time;
      }
      authorize();
      let callbacks = 0,
        expectedDigest: string | undefined;
      const result = await port.withRead(
        owner,
        input.projectId,
        async (records) => {
          callbacks++;
          if (callbacks !== 1) invalid();
          authorize();
          const raw = await records.listProjectWork({
            projectId: input.projectId,
            limit: input.limit,
            ...(input.cursor === null ? {} : { cursor: input.cursor.afterId }),
          });
          const selectedAt = authorize().toISOString();
          const page = serializeFoundationProjectWorkPage(
            raw,
            input,
            selectedAt,
          );
          expectedDigest = digest(page);
          return page;
        },
      );
      if (callbacks !== 1 || expectedDigest === undefined) invalid();
      authorize();
      if (digest(result) !== expectedDigest) invalid();
      const delivered = foundationProjectWorkPageSchema.safeParse(result);
      if (!delivered.success) invalid();
      return delivered.data;
    },
  };
}
