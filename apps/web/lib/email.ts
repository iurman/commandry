import { loadRuntimeConfig } from "@commandry/config";
import { createMailService, type MailOperation } from "@commandry/application";
import { createMailAccessRepository } from "@commandry/db";
import { MailError } from "@commandry/domain";
import { createResendMailProvider } from "@commandry/platform";
import {
  foundationFailure,
  foundationOwnerIdentity,
} from "./foundation-access";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getMailService() {
  const config = loadRuntimeConfig();
  const provider = createResendMailProvider(
    config.mailResendApiKeyFile ? { keyFile: config.mailResendApiKeyFile } : {},
  );
  return createMailService(
    createMailAccessRepository(getDatabase().db, {
      environment: config.appEnv,
    }),
    () => provider,
  );
}
export async function ownerMail(
  request: Request,
  operation: MailOperation,
  input: unknown,
) {
  const owner = await foundationOwnerIdentity(request);
  return getMailService().execute(
    {
      kind: "owner",
      identity: { ...owner.identity, sessionId: owner.sessionId },
    },
    operation,
    input,
  );
}
export function mailFailure(request: Request, error: unknown): Response {
  if (error instanceof MailError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "FORBIDDEN"
          ? 403
          : error.code === "UNAVAILABLE"
            ? 503
            : error.code === "INVALID_INPUT"
              ? 400
              : 409;
    return jsonResponse(request, { code: error.code }, status, "mail.failed");
  }
  return foundationFailure(request, error);
}
