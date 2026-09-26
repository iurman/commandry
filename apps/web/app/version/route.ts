import { loadRuntimeConfig } from "@commandry/config";
import {
  SCHEMA_COMPATIBILITY,
  versionResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const config = loadRuntimeConfig();
  return jsonResponse(
    request,
    versionResponseSchema.parse({
      sha: config.releaseSha,
      imageDigest: config.releaseImageDigest ?? null,
      buildTime: config.releaseBuildTime ?? null,
      schemaCompatibility: SCHEMA_COMPATIBILITY,
      environment: config.appEnv,
    }),
    200,
    "version.read",
  );
}
