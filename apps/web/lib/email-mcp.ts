import { randomUUID } from "node:crypto";
import type { createMailService, MailOperation } from "@commandry/application";
import {
  foundationTokenDigest,
  type FoundationEnvironment,
} from "@commandry/domain";

export function createMailMcpOperations(
  service: ReturnType<typeof createMailService>,
  token: string,
  context: { projectId: string; environment: FoundationEnvironment },
) {
  return async (operation: MailOperation, input: unknown) => {
    const capability =
      operation === "triage"
        ? "mail.triage"
        : operation === "draft"
          ? "mail.draft"
          : operation === "send"
            ? "mail.send"
            : "mail.read";
    return service.execute(
      {
        kind: "machine",
        request: {
          projectId: context.projectId,
          environment: context.environment,
          operation: capability,
          tokenDigest: foundationTokenDigest(token),
          targetId: null,
          correlationId: randomUUID(),
        },
      },
      operation,
      input,
    ) as Promise<object>;
  };
}
