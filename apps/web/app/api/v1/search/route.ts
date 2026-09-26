import { loadRuntimeConfig } from "@commandry/config";
import { searchQuerySchema, searchResponseSchema } from "@commandry/contracts";
import { captureFailure, getCaptureService } from "../../../../lib/capture";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = searchQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid search query" },
      400,
      "search.invalid_query",
    );
  }
  try {
    const page = await getCaptureService().search(parsed.data);
    return jsonResponse(
      request,
      searchResponseSchema.parse(page),
      200,
      "search.query",
    );
  } catch (error) {
    return captureFailure(request, error, "search.query");
  }
}
