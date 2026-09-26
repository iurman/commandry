import { loadRuntimeConfig } from "@commandry/config";
import {
  morningDigestQuerySchema,
  morningDigestResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getMorningDigestService,
  morningDigestFailure,
} from "../../../../lib/morning-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = morningDigestQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid morning digest query" },
      400,
      "morning_digest.invalid_query",
    );
  try {
    const page = await getMorningDigestService().list(query.data);
    return jsonResponse(
      request,
      morningDigestResponseSchema.parse(page),
      200,
      "morning_digest.list",
    );
  } catch (error) {
    return morningDigestFailure(request, error);
  }
}
