import { loadRuntimeConfig } from "@commandry/config";
import { createRealIntegrationRepository } from "@commandry/db";
import { RealIntegrationError } from "@commandry/domain";
import { getDatabase } from "./database";
import { getAuth } from "./auth";
import { jsonResponse } from "./http";

export const getRealIntegrationService = () =>
  createRealIntegrationRepository(getDatabase().db);
export async function realIntegrationActor(request: Request) {
  const config = loadRuntimeConfig();
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !== config.appOrigin &&
    origin !== config.localAuthTrustedOrigin
  )
    throw new RealIntegrationError(
      "UNAUTHORIZED",
      "Source configuration requires a trusted origin",
    );
  if (config.humanAuthMode !== "password") return "local-user:unattributed";
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (
    !session ||
    session.user.email.toLowerCase() !== config.initialAdminEmail?.toLowerCase()
  )
    throw new RealIntegrationError("UNAUTHORIZED", "Owner sign-in required");
  return `user:${session.user.id}`;
}
export async function realIntegrationBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RealIntegrationError("INVALID_SOURCE", "JSON content required");
  const reader = request.body?.getReader();
  if (!reader)
    throw new RealIntegrationError("INVALID_SOURCE", "Request body is missing");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072)
        throw new RealIntegrationError(
          "INVALID_SOURCE",
          "Source payload exceeds 128 KiB",
        );
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      throw new RealIntegrationError("INVALID_SOURCE", "Invalid JSON body");
    }
  } finally {
    await reader.cancel();
  }
}
export function realIntegrationFailure(request: Request, error: unknown) {
  if (error instanceof RealIntegrationError)
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "UNAUTHORIZED"
        ? 401
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "INVALID_SOURCE"
            ? 400
            : 409,
      "integrations.real_request_denied",
    );
  return jsonResponse(
    request,
    {
      code: "INTEGRATION_UNAVAILABLE",
      message: "Source operation is unavailable",
    },
    503,
    "integrations.real_unavailable",
  );
}
