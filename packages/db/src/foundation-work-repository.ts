import type {
  FoundationWorkReadPort,
  FoundationWorkReadRecords,
} from "@commandry/application";
import { FoundationError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { createFoundationProjectReadAccessRepository } from "./foundation-read-repository";
import { listCanonicalProjectWork } from "./project-work-query";

/** The same canonical Work population as the UI, selected inside the locked
 * work.read grant transaction. A context link never changes primary ownership. */
export function createFoundationWorkReadAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationWorkReadPort {
  return createFoundationProjectReadAccessRepository(
    db,
    "work.read",
    (transaction, request): FoundationWorkReadRecords => ({
      async listProjectWork(input) {
        if (input.projectId !== request.projectId)
          throw new FoundationError("FORBIDDEN");
        const page = await listCanonicalProjectWork(
          transaction,
          request.projectId,
          { limit: input.limit, cursor: input.cursor },
          { requireValidCursor: true },
        );
        return {
          items: page.items.map((item) => {
            // Other canonical reads omit context, but this scoped query always
            // supplies the selected link or explicit null. Never repair absence.
            if (item.contextLink === undefined)
              throw new FoundationError("INVALID_REFERENCE");
            return { ...item, contextLink: item.contextLink };
          }),
          nextCursor: page.nextCursor,
        };
      },
    }),
    options,
  );
}
