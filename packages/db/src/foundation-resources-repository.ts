import type {
  FoundationResourceReadPort,
  FoundationResourceReadRecords,
} from "@commandry/application";
import { FoundationError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { createFoundationProjectReadAccessRepository } from "./foundation-read-repository";
import { listCanonicalProjectResources } from "./project-resource-query";

/** Read only active project resource connections inside the same locked grant
 * and audit transaction. Resource parents and children are not traversed. */
export function createFoundationResourceReadAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationResourceReadPort {
  return createFoundationProjectReadAccessRepository(
    db,
    "resources.read",
    (transaction, request): FoundationResourceReadRecords => ({
      async listProjectResources(input) {
        if (input.projectId !== request.projectId)
          throw new FoundationError("FORBIDDEN");
        return listCanonicalProjectResources(
          transaction,
          request.projectId,
          { limit: input.limit, cursor: input.cursor },
          { requireValidCursor: true },
        );
      },
    }),
    options,
  );
}
